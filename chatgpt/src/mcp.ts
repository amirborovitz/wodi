import { readFileSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Principal } from './auth';
import { ToolError, type WodiService } from './service';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

const template = 'ui://wodi/poster-v1.html';
const scopes = ['workouts:read', 'workouts:write', 'posters:read', 'posters:write'];
export const SCOPES = scopes;
const identifier = z.string().regex(/^[\w-]{1,128}$/);
const limit = z.number().int().min(1).max(100).default(20);
const skins = ['slab', 'chalk', 'flare', 'stadium', 'press', 'blueprint', 'hazard', 'ink', 'foil', 'aurum', 'sun'] as const;
const boardId = z.string().uuid();
/** One answer to one of Wodi's questions. The athlete's own words (`text`) are preferred: the app reads them. */
const answer = z.object({
  slot_id: z.string().min(1).max(200).describe('The id of the question being answered, from question.slots.'),
  text: z.string().max(500).optional().describe("The athlete's own words for THIS question, unedited (\"90 to 120\", \"18:30\", \"45\")."),
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
class MissingScope extends ToolError {}
function result(data: Record<string, unknown>): { structuredContent: Record<string, unknown>; content: { type: 'text'; text: string }[] } {
  return { structuredContent: data, content: [{ type: 'text', text: JSON.stringify(data) }] };
}

/** Extends the November 17 demo's per-request stateless server and preserves its three tools. */
export function createMcpServer(service: WodiService, principal: Principal): McpServer {
  const server = new McpServer({ name: 'wodi', version: '1.1.1' }, {
    instructions: "Wodi is a CrossFit training buddy (https://www.wodi.fit). The easiest way to log is in the Wodi app: snap the board and answer a few questions. If the athlete prefers to log here, Wodi runs the same conversation through you: (1) read_board with the board's words copied EXACTLY — never interpret, total or fix them; (2) ask Wodi's question, one at a time, in Wodi's order, and send the athlete's own words to answer_board; (3) when done is true, save_board, then generate_poster and get_poster. Never invent or assume a result, and never treat prescribed weights as what was lifted. Send a date only if the athlete named another day. After saving, offer the Wodi link.",
  });
  const authorize = (scope: string): void => { if (!principal.scopes.includes(scope)) throw new MissingScope(`Missing scope: ${scope}`); };
  const security = (scope: string): { type: 'oauth2'; scopes: string[] }[] => [{ type: 'oauth2', scopes: [scope] }];
  const failure = (error: unknown, scope: string): CallToolResult => ({ ...result({ error: error instanceof ToolError ? error.message : 'Wodi could not complete this request. Retry using the same request_id.' }), isError: true,
    ...(error instanceof MissingScope ? { _meta: { 'mcp/www_authenticate': [`Bearer error="insufficient_scope", scope="${scope}"`] } } : {}) });
  const guard = async (scope: string, fn: () => Promise<Record<string, unknown>>): Promise<CallToolResult> => {
    try { authorize(scope); return result(await fn()); }
    catch (error) { return failure(error, scope); }
  };
  // Logging is Wodi's own conversation: Wodi reads the board, Wodi asks, ChatGPT relays the
  // athlete's answers, Wodi saves. ChatGPT never writes a workout's shape itself.
  server.registerTool('read_board', {
    description: "Step 1 of logging a workout. Send the workout board's words EXACTLY as written (copy them from the photo or the athlete's message — do not interpret, reorder, total or fix them). Wodi reads the board with its own reader and returns board_id, the board as Wodi understood it, and Wodi's first question. If done is already true, call save_board.",
    inputSchema: {
      board_text: z.string().trim().min(1).max(20_000).describe("The board's words, verbatim, line by line."),
      athlete_note: z.string().max(2_000).optional().describe('Only what the athlete said about the board itself (e.g. "we did it in pairs"), in their words.'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    _meta: { securitySchemes: security('workouts:write') },
  }, input => guard('workouts:write', async () => ({ ...(await service.readBoard(principal.uid, input)) })));
  server.registerTool('answer_board', {
    description: "Step 2, repeated. Ask the athlete Wodi's question (question.text) — one question at a time, in Wodi's order — then send their answer here, one entry per slot in question.slots. Prefer `text` with the athlete's own words; use `option` when they picked one of question.options. Never answer for the athlete or reuse prescribed numbers as their result. Returns what Wodi understood, anything it could not read (ask again in other words), and the next question. When done is true, call save_board.",
    inputSchema: { board_id: boardId, answers: z.array(answer).min(1).max(20) },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    _meta: { securitySchemes: security('workouts:write') },
  }, input => guard('workouts:write', async () => ({ ...(await service.answerBoard(principal.uid, input)) })));
  server.registerTool('save_board', {
    description: "Step 3. Save the workout once answer_board (or read_board) returned done: true. Wodi builds and saves it exactly as its app would. Send trained_at ONLY if the athlete said the workout was on another day (ISO timestamp with timezone); otherwise it is dated now. Use a new request_id per workout and reuse it on retries. Then call generate_poster with the returned workout_id.",
    inputSchema: {
      board_id: boardId,
      request_id: identifier,
      trained_at: z.string().optional(),
      is_test: z.boolean().optional().describe('Only when the athlete explicitly asked for a test log.'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    _meta: { securitySchemes: security('workouts:write') },
  }, input => guard('workouts:write', () => service.saveBoard(principal.uid, input)));
  server.registerTool('generate_poster', {
    description: 'Generate all poster pages for an existing Wodi workout using its original renderer. Follow with get_poster to display. Reuses all current skins (including the original nine).',
    inputSchema: { workout_id: identifier, skin: z.enum(skins).default('sun') },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    _meta: { securitySchemes: security('posters:write') },
  }, ({ workout_id, skin }) => guard('posters:write', () => service.generate(principal.uid, workout_id, skin)));
  server.registerTool('get_poster', {
    description: 'Display every page of the signed-in athlete’s generated poster inside ChatGPT.', inputSchema: { poster_id: identifier },
    annotations: { readOnlyHint: true, openWorldHint: false },
    _meta: { securitySchemes: security('posters:read'), 'openai/outputTemplate': template, ui: { resourceUri: template } },
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
  server.registerResource('poster', template, { mimeType: 'text/html;profile=mcp-app', _meta: widgetMeta }, async uri => ({ contents: [{ uri: uri.href, mimeType: 'text/html;profile=mcp-app', text: readFileSync(new URL('../dist/widget.html', import.meta.url), 'utf8'), _meta: widgetMeta }] }));
  server.registerTool('workout_history', { description: 'List your Firebase workouts, newest first.', inputSchema: { limit }, annotations: { readOnlyHint: true, openWorldHint: false }, _meta: { securitySchemes: security('workouts:read') } }, ({ limit }) => guard('workouts:read', async () => ({ workouts: await service.history(principal.uid, limit) })));
  server.registerTool('movement_history', { description: 'List completed sets for an exact exercise name, ignoring case, newest first.', inputSchema: { movement: z.string().trim().min(1).max(100), limit }, annotations: { readOnlyHint: true, openWorldHint: false }, _meta: { securitySchemes: security('workouts:read') } }, ({ movement, limit }) => guard('workouts:read', async () => ({ sets: await service.movementHistory(principal.uid, movement, limit) })));
  server.registerTool('personal_records', { description: 'Highest recorded weight in kg for each movement; ties favor latest.', inputSchema: { movement: z.string().trim().min(1).max(100).optional() }, annotations: { readOnlyHint: true, openWorldHint: false }, _meta: { securitySchemes: security('workouts:read') } }, ({ movement }) => guard('workouts:read', async () => ({ records: await service.records(principal.uid, movement) })));
  return server;
}
