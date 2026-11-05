import type { ChatCompletion, ChatCompletionCreateParamsNonStreaming } from 'openai/resources/chat/completions';

/**
 * THE one client every AI call in the app goes through — the board read, the chat reader, Ask Wodi,
 * Wodi's lines and the logging helpers. Same shape as the OpenAI SDK's, so callers build their
 * requests exactly as before.
 *
 * In the app it sends the request to the `wodiModel` Cloud Function, which holds the OpenAI key —
 * no key ships in the bundle. In Node (the corpus and check scripts) there is no signed-in athlete,
 * so it calls OpenAI directly with `OPENAI_API_KEY` from .env — a name without the VITE_ prefix, so
 * Vite can never put it in the bundle.
 */
export interface ModelClient {
  chat: { completions: { create(body: ChatCompletionCreateParamsNonStreaming): Promise<ChatCompletion> } };
}

/** Function failures carry OpenAI's status/code in `details`; surfaced as fields so the error helpers read them. */
interface CallableFailure {
  message?: unknown;
  details?: { status?: unknown; code?: unknown } | null;
}

export class ModelError extends Error {
  readonly status: unknown;
  readonly code: unknown;
  constructor(message: string, status: unknown, code: unknown, cause: unknown) {
    super(message);
    this.name = 'ModelError';
    this.status = status;
    this.code = code;
    this.cause = cause;
  }
}

export function toModelError(error: unknown): unknown {
  if (!error || typeof error !== 'object') return error;
  const { message, details } = error as CallableFailure;
  if (!details || typeof details !== 'object') return error;
  return new ModelError(typeof message === 'string' ? message : 'Model call failed', details.status, details.code, error);
}

const nodeKey = typeof process !== 'undefined' ? process.env.OPENAI_API_KEY : undefined;

async function createViaFunction(body: ChatCompletionCreateParamsNonStreaming): Promise<ChatCompletion> {
  const [{ functions }, { httpsCallable }] = await Promise.all([import('./firebase'), import('firebase/functions')]);
  const call = httpsCallable<{ body: ChatCompletionCreateParamsNonStreaming }, ChatCompletion>(
    functions, 'wodiModel', { timeout: 300_000 },
  );
  try {
    return (await call({ body })).data;
  } catch (error) {
    throw toModelError(error);
  }
}

let direct: Promise<ModelClient> | null = null;
async function createDirect(body: ChatCompletionCreateParamsNonStreaming): Promise<ChatCompletion> {
  direct ??= import('openai').then(({ default: OpenAI }) => new OpenAI({ apiKey: nodeKey }));
  return (await direct).chat.completions.create(body);
}

export const modelClient: ModelClient = {
  chat: { completions: { create: (body) => (nodeKey ? createDirect(body) : createViaFunction(body)) } },
};
