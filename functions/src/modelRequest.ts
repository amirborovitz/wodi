// What the app may ask the model through `wodiModel` — pure, so it is tested without the network.
//
// The server holds the OpenAI key; this is the fence around it. Any signed-in account can call
// the function, so without these checks it would be a free GPT for anyone who makes an account.

/** The models the app actually uses: the parse/chat model, and the two older logging helpers. */
export const ALLOWED_MODELS: readonly string[] = ['gpt-5.5', 'gpt-4o-mini'];

/** Highest output any call may ask for. The biggest real one is a part's structure (8192). */
export const MAX_OUTPUT_TOKENS = 10_000;

/** A board photo travels as base64 inside the request; a raw phone photo is ~4–11 MB of it. */
export const MAX_REQUEST_CHARS = 24_000_000;

export type ModelRequestCheck =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function withinCap(value: unknown): boolean {
  return value === undefined || value === null
    || (typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= MAX_OUTPUT_TOKENS);
}

/**
 * Accepts a Chat Completions request body the app built, or says why not. Never rewrites a field
 * the app chose — except to add the output cap when the app named none, so no call is unbounded.
 */
export function checkModelRequest(data: unknown): ModelRequestCheck {
  if (!isRecord(data) || !isRecord(data.body)) return { ok: false, reason: 'missing-body' };
  const body = data.body;
  if (typeof body.model !== 'string' || !ALLOWED_MODELS.includes(body.model)) return { ok: false, reason: 'model-not-allowed' };
  if (!Array.isArray(body.messages) || body.messages.length === 0) return { ok: false, reason: 'missing-messages' };
  if (body.stream === true) return { ok: false, reason: 'stream-not-supported' };
  if (body.n !== undefined && body.n !== null && body.n !== 1) return { ok: false, reason: 'one-answer-only' };
  if (!withinCap(body.max_completion_tokens) || !withinCap(body.max_tokens)) return { ok: false, reason: 'output-too-large' };
  if (JSON.stringify(body).length > MAX_REQUEST_CHARS) return { ok: false, reason: 'request-too-large' };

  const capped = body.max_completion_tokens != null || body.max_tokens != null;
  return { ok: true, body: capped ? body : { ...body, max_completion_tokens: MAX_OUTPUT_TOKENS } };
}

/** UTC day the usage counter is kept under. */
export function usageDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}
