import { readFileSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Principal } from './auth';
import { ToolError, type WodiService } from './service';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

const template = 'ui://wodi/poster-v1.html';
/** Wodi's answer card: every open question with the app's own controls, answered without a model turn. */
const boardCard = 'ui://wodi/board-card-v1.html';
/** The card calls these itself — a tap goes straight to Wodi, not through ChatGPT's model. */
const cardCallable = { 'openai/widgetAccessible': true };
const scopes = ['workouts:read', 'workouts:write', 'posters:read', 'posters:write'];
export const SCOPES = scopes;
const identifier = z.string().regex(/^[\w-]{1,128}$/);
const limit = z.number().int().min(1).max(100).default(20);
const skins = ['slab', 'chalk', 'flare', 'stadium', 'press', 'blueprint', 'hazard', 'ink', 'foil', 'aurum', 'sun'] as const;
const boardId = z.string().uuid();
/** One answer to one of Wodi's questions. The athlete's own words (`text`) are preferred: the app reads them. */
const answer = z.object({
  slot_id: z.string().min(1).max(200).describe('The id of the question being answered, from question.slots.'),
  text: z.string().max(500).optional().describe("The athlete's own words for THIS question, unedited (\"90 to 120\", \"18:30\", \"45\"). Always send the matching value fields too (count, weight, seconds, …) as you read them from these words — Wodi reads plain answers itself and uses your values for longer sentences."),
  option: z.string().max(200).optional().describe("One of question.options, exactly as listed, when the athlete picked it."),
  skipped: z.boolean().optional().describe('The athlete chose not to answer.'),
  seconds: z.number().min(0).max(86_400).optional(),
  count: z.number().min(0).max(100_000).optional(),
  extra_reps: z.number().min(0).max(10_000).optional(),
  weight: z.number().min(0).max(1_000).optional(),
  weight_end: z.number().min(0).max(1_000).optional(),
  weights: z.array(z.number().min(0).max(1_000)).max(50).optional(),
  unit: z.enum(['kg', 'lb']).optional(),
  no_load: z.boolean().optional(),
  choice: z.string().max(200).optional(),
  swap_to: z.string().max(100).optional(),
  swap_amount: z.number().min(0).max(100_000).optional(),
});
/** An answer built by Wodi's answer card — the app's own chip / panel / pick answer, as the app's chat sends it. */
const cardAnswer = z.object({
  id: z.string().min(1).max(200),
  skipped: z.boolean().optional(),
  seconds: z.number().min(0).max(86_400).nullable().optional(),
  count: z.number().min(0).max(100_000).nullable().optional(),
  extraReps: z.number().min(0).max(10_000).nullable().optional(),
  weight: z.number().min(0).max(1_000).nullable().optional(),
  weightEnd: z.number().min(0).max(1_000).nullable().optional(),
  weights: z.array(z.number().min(0).max(1_000)).max(50).nullable().optional(),
  choice: z.string().max(200).nullable().optional(),
  swapTo: z.string().max(100).nullable().optional(),
  swapAmount: z.number().min(0).max(100_000).nullable().optional(),
  swapUnit: z.enum(['reps', 'distance', 'calories']).nullable().optional(),
  perInterval: z.boolean().optional(),
  unit: z.enum(['kg', 'lb']).nullable().optional(),
  noLoad: z.boolean().optional(),
  moves: z.array(z.string().max(200)).max(50).nullable().optional(),
});
class MissingScope extends ToolError {}
function result(data: Record<string, unknown>): { structuredContent: Record<string, unknown>; content: { type: 'text'; text: string }[] } {
  return { structuredContent: data, content: [{ type: 'text', text: JSON.stringify(data) }] };
}

/** Extends the November 17 demo's per-request stateless server and preserves its three tools. */
export function createMcpServer(service: WodiService, principal: Principal): McpServer {
  const server = new McpServer({ name: 'wodi', version: '1.1.1' }, {
    instructions: "Wodi is a CrossFit training buddy; its full app is at https://www.wodi.fit. The first time Wodi comes up in a conversation (a first use, \"get started\", or a new workout), welcome the athlete once, with the link clickable: \"Open [Wodi](https://www.wodi.fit) to upload your workout board and follow the guided flow. Prefer to stay here? Upload a photo of your board or paste the workout text, and I'll guide you one movement at a time.\" Respect their choice; don't repeat the welcome or steer them away from the chat. When speaking to the athlete, call Wodi a training buddy, never a log, logbook or tracker. If they stay here: (1) read_board with the board's words copied EXACTLY — never interpret, total or fix them. (2) Wodi then shows its own answer card with every question and one-tap controls; the athlete answers there, and the card saves the workout and shows the poster itself. Say one short line pointing to the card and do NOT ask the card's questions in the chat. (3) Only if the athlete types answers in the chat instead, send their words and the values you read to answer_board; when done is true, save_board, then generate_poster and get_poster. When the card reports a saved workout, cheer it with something specific about it. Never invent or assume a result, and never treat prescribed weights as what was lifted. Send a date only if the athlete named another day. After saving, offer the Wodi link.",
  });
  const authorize = (scope: string): void => { if (!principal.scopes.includes(scope)) throw new MissingScope(`Missing scope: ${scope}`); };
  const security = (scope: string): { type: 'oauth2'; scopes: string[] }[] => [{ type: 'oauth2', scopes: [scope] }];
  const failure = (error: unknown, scope: string): CallToolResult => ({ ...result({ error: error instanceof ToolError ? error.message : 'Wodi could not complete this request. Retry using the same request_id.' }), isError: true,
    ...(error instanceof MissingScope ? { _meta: { 'mcp/www_authenticate': [`Bearer error="insufficient_scope", scope="${scope}"`] } } : {}) });
  const guard = async (scope: string, fn: () => Promise<Record<string, unknown>>): Promise<CallToolResult> => {
    try { authorize(scope); return result(await fn()); }
    catch (error) { return failure(error, scope); }
  };
  // A board turn: the questions in full (chips, panels, picks) ride in _meta for the card only —
  // ChatGPT's model reads the short form and never re-asks what the card shows.
  const boardGuard = async <T extends { board_id: string; questions: unknown[] }>(fn: () => Promise<T>): Promise<CallToolResult> => {
    try {
      authorize('workouts:write');
      const { questions, ...turn } = await fn();
      return { ...result(turn as Record<string, unknown>), _meta: { board_id: turn.board_id, questions } };
    } catch (error) { return failure(error, 'workouts:write'); }
  };
  const card = { 'openai/outputTemplate': boardCard, ui: { resourceUri: boardCard } };
  // Logging is Wodi's own conversation: Wodi reads the board, Wodi asks, ChatGPT relays the
  // athlete's answers, Wodi saves. ChatGPT never writes a workout's shape itself.
  server.registerTool('read_board', {
    description: "Step 1 of logging a workout. Send the workout board's words EXACTLY as written (copy them from the photo or the athlete's message — do not interpret, reorder, total or fix them). Wodi reads the board with its own reader and shows its answer card: every question with one-tap controls, then save and the poster, all inside the card. Say one short line pointing to the card; do not ask its questions in the chat. If done is already true, call save_board.",
    inputSchema: {
      board_text: z.string().trim().min(1).max(20_000).describe("The board's words, verbatim, line by line."),
      athlete_note: z.string().max(2_000).optional().describe('Only what the athlete said about the board itself (e.g. "we did it in pairs"), in their words.'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    _meta: { securitySchemes: security('workouts:write'), ...card },
  }, input => boardGuard(() => service.readBoard(principal.uid, input)));
  server.registerTool('answer_board', {
    description: "Only when the athlete types answers in the chat instead of using Wodi's card (the card sends its own taps as card_answers). Ask Wodi's question (question.text) — one question at a time, in Wodi's order — then send their answer here, one entry per slot in question.slots. Send the athlete's own words in `text` AND the values you read from them (e.g. text \"12 reverse shrugs per set\" with count 12); use `option` when they picked one of question.options. Never answer for the athlete or reuse prescribed numbers as their result. Returns what Wodi understood, anything it could not read, and the next question. If something was not read but the athlete's answer was clear, resend it with the values yourself — never ask the athlete to type a clear answer again; only ask again when their answer was genuinely unclear. When done is true, call save_board.",
    inputSchema: {
      board_id: boardId,
      answers: z.array(answer).max(20).optional(),
      card_answers: z.array(cardAnswer).max(50).optional().describe("Sent by Wodi's answer card only — never fill this yourself."),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    _meta: { securitySchemes: security('workouts:write'), ...card, ...cardCallable },
  }, input => boardGuard(() => service.answerBoard(principal.uid, input)));
  server.registerTool('save_board', {
    description: "Step 3. Save the workout once answer_board (or read_board) returned done: true. Wodi builds and saves it exactly as its app would. Send trained_at ONLY if the athlete said the workout was on another day (ISO timestamp with timezone); otherwise it is dated now. Use a new request_id per workout and reuse it on retries. Then call generate_poster with the returned workout_id.",
    inputSchema: {
      board_id: boardId,
      request_id: identifier,
      trained_at: z.string().optional(),
      is_test: z.boolean().optional().describe('Only when the athlete explicitly asked for a test log.'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    _meta: { securitySchemes: security('workouts:write'), ...cardCallable },
  }, input => guard('workouts:write', () => service.saveBoard(principal.uid, input)));
  server.registerTool('generate_poster', {
    description: 'Generate all poster pages for an existing Wodi workout using its original renderer. Follow with get_poster to display. Reuses all current skins (including the original nine).',
    inputSchema: { workout_id: identifier, skin: z.enum(skins).default('sun') },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    _meta: { securitySchemes: security('posters:write'), ...cardCallable },
  }, ({ workout_id, skin }) => guard('posters:write', () => service.generate(principal.uid, workout_id, skin)));
  server.registerTool('get_poster', {
    description: 'Display every page of the signed-in athlete’s generated poster inside ChatGPT.', inputSchema: { poster_id: identifier },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    _meta: { securitySchemes: security('posters:read'), 'openai/outputTemplate': template, ui: { resourceUri: template }, ...cardCallable },
  }, async ({ poster_id }) => {
    try {
      authorize('posters:read');
      const poster = await service.poster(principal.uid, poster_id);
      return { ...result({ poster_id, pages: poster.images.length }),
        content: [{ type: 'text' as const, text: `Wodi poster (${poster.images.length} pages)` }, ...poster.images.map(data => ({ type: 'image' as const, mimeType: 'image/png', data }))],
        _meta: { images: poster.images.map(data => `data:image/png;base64,${data}`) } };
    } catch (error) { return failure(error, 'posters:read'); }
  });
  const widgetMeta = { ui: { domain: process.env.PUBLIC_URL ?? 'https://www.wodi.fit', csp: { connectDomains: [], resourceDomains: [] } }, 'openai/widgetDomain': process.env.PUBLIC_URL ?? 'https://www.wodi.fit', 'openai/widgetCSP': { connect_domains: [], resource_domains: [] } };
  server.registerResource('board-card', boardCard, { mimeType: 'text/html;profile=mcp-app', _meta: widgetMeta }, async uri => ({ contents: [{ uri: uri.href, mimeType: 'text/html;profile=mcp-app', text: readFileSync(new URL('../dist/board-card.html', import.meta.url), 'utf8'), _meta: widgetMeta }] }));
  server.registerResource('poster', template, { mimeType: 'text/html;profile=mcp-app', _meta: widgetMeta }, async uri => ({ contents: [{ uri: uri.href, mimeType: 'text/html;profile=mcp-app', text: readFileSync(new URL('../dist/widget.html', import.meta.url), 'utf8'), _meta: widgetMeta }] }));
  server.registerTool('workout_history', { description: 'List your Firebase workouts, newest first.', inputSchema: { limit }, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }, _meta: { securitySchemes: security('workouts:read') } }, ({ limit }) => guard('workouts:read', async () => ({ workouts: await service.history(principal.uid, limit) })));
  server.registerTool('movement_history', { description: 'List completed sets for an exact exercise name, ignoring case, newest first.', inputSchema: { movement: z.string().trim().min(1).max(100), limit }, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }, _meta: { securitySchemes: security('workouts:read') } }, ({ movement, limit }) => guard('workouts:read', async () => ({ sets: await service.movementHistory(principal.uid, movement, limit) })));
  server.registerTool('personal_records', { description: 'Highest recorded weight in kg for each movement; ties favor latest.', inputSchema: { movement: z.string().trim().min(1).max(100).optional() }, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }, _meta: { securitySchemes: security('workouts:read') } }, ({ movement }) => guard('workouts:read', async () => ({ records: await service.records(principal.uid, movement) })));
  return server;
}
