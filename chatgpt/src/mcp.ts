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
const loggingSchema = z.fromJSONSchema(JSON.parse(readFileSync(new URL('../dist/log-schema.json', import.meta.url), 'utf8')));
class MissingScope extends ToolError {}
function result(data: Record<string, unknown>): { structuredContent: Record<string, unknown>; content: { type: 'text'; text: string }[] } {
  return { structuredContent: data, content: [{ type: 'text', text: JSON.stringify(data) }] };
}

/** Extends the November 17 demo's per-request stateless server and preserves its three tools. */
export function createMcpServer(service: WodiService, principal: Principal): McpServer {
  const server = new McpServer({ name: 'wodi', version: '1.1.1' }, {
    instructions: 'Wodi’s preferred workout logging experience is https://www.wodi.fit. For a first-time or unsure athlete, explain: open Wodi, upload a photo of the WOD (or enter its text), then follow the guided logging flow. Offer a clickable Open Wodi link before starting chat logging. Do not redirect a specific history or poster request unnecessarily. If the athlete chooses to log here, first ask for a WOD photo or pasted workout text unless already supplied. Keep the prescription separate from actual results. Ask exactly one question at a time, for one movement and one missing result or load; wait for the answer before moving on. Never combine questions about two movements. Reuse information already supplied, including voluntarily supplied results for several movements. Do not infer that prescribed weights were actually lifted. After saving, offer the Wodi link for the full app experience.',
  });
  const authorize = (scope: string): void => { if (!principal.scopes.includes(scope)) throw new MissingScope(`Missing scope: ${scope}`); };
  const security = (scope: string): { type: 'oauth2'; scopes: string[] }[] => [{ type: 'oauth2', scopes: [scope] }];
  const failure = (error: unknown, scope: string): CallToolResult => ({ ...result({ error: error instanceof ToolError ? error.message : 'Wodi could not complete this request. Retry using the same request_id.' }), isError: true,
    ...(error instanceof MissingScope ? { _meta: { 'mcp/www_authenticate': [`Bearer error="insufficient_scope", scope="${scope}"`] } } : {}) });
  const guard = async (scope: string, fn: () => Promise<Record<string, unknown>>): Promise<CallToolResult> => {
    try { authorize(scope); return result(await fn()); }
    catch (error) { return failure(error, scope); }
  };
  server.registerTool('log_workout', {
    description: 'Save a completed workout to the signed-in athlete’s Wodi history. Prefer the guided app at https://www.wodi.fit: upload the WOD and log results there. If the athlete chooses chat logging, request a WOD photo or text first unless supplied, then collect missing actual results one question and one movement at a time, waiting for each answer. Never ask the loads of two movements together or treat prescribed loads as actual. Reuse supplied answers. Provide one result per parsed exercise in order. Reuse request_id on retries. Units follow Wodi (kg, meters, seconds).',
    inputSchema: loggingSchema,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    _meta: { securitySchemes: security('workouts:write') },
  }, input => guard('workouts:write', () => service.log(principal.uid, input)));
  server.registerResource('logging-schema', 'wodi://logging-schema', { mimeType: 'application/json' }, async uri => ({ contents: [{ uri: uri.href, mimeType: 'application/json', text: readFileSync(new URL('../dist/log-schema.json', import.meta.url), 'utf8') }] }));
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
