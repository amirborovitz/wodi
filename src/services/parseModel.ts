import OpenAI from 'openai';
import { getAI, getGenerativeModel, GoogleAIBackend, ThinkingLevel, type ThinkingConfig } from 'firebase/ai';

/**
 * THE one place a board-parsing call reaches a model. The parse pipeline (openai.ts) builds the
 * prompt and reads the JSON back; which provider and model answer is decided here, once.
 *
 * Why a seam: the parse is ~95% of the app's AI cost, and a model switch must be measurable on
 * the board corpus before it ships — `npm run corpus -- --live` with PARSE_PROVIDER/PARSE_MODEL
 * set in the environment runs the same pipeline on a different model, no code change.
 *
 * The OpenAI path is today's production call, byte for byte. The Gemini path goes through Firebase
 * AI Logic — in the app and in the scripts alike — so no Gemini key ships in the bundle.
 */

export type ParseProvider = 'openai' | 'gemini';

/** Production defaults. Overridable from the environment for measurement only. */
const DEFAULT_PROVIDER: ParseProvider = 'openai';
const DEFAULT_MODEL: Record<ParseProvider, string> = { openai: 'gpt-5.5', gemini: 'gemini-3-flash' };

type Env = Record<string, string | undefined>;
const viteEnv = (import.meta as ImportMeta & { env?: Env }).env;
const nodeEnv: Env = typeof process !== 'undefined' ? process.env : {};
const envValue = (name: string): string | undefined => viteEnv?.[name] ?? nodeEnv[name];

export function parseProvider(): ParseProvider {
  return envValue('PARSE_PROVIDER') === 'gemini' ? 'gemini' : DEFAULT_PROVIDER;
}

export function parseModelName(): string {
  return envValue('PARSE_MODEL') ?? DEFAULT_MODEL[parseProvider()];
}

export type ParsePart =
  | { type: 'text'; text: string }
  | { type: 'image'; mimeType: string; base64: string };

export interface ParseRequest {
  parts: ParsePart[];
  /** OpenAI-style structured output: `{ name, strict, schema }`. Absent = free JSON object. */
  schema?: { name: string; strict: boolean; schema: Record<string, unknown> };
  maxOutputTokens: number;
  /** Routes calls sharing a long static prompt to one cache (OpenAI). */
  cacheKey?: string;
}

export interface ParseUsage {
  provider: ParseProvider;
  model: string;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
}

export interface ParseResponse {
  text: string;
  usage: ParseUsage;
}

let openaiClient: OpenAI | null = null;
function openai(): OpenAI {
  openaiClient ??= new OpenAI({
    apiKey: envValue('VITE_OPENAI_API_KEY') ?? envValue('OPENAI_API_KEY'),
    dangerouslyAllowBrowser: true, // Required for client-side usage
  });
  return openaiClient;
}

async function completeWithOpenAI(request: ParseRequest, model: string): Promise<ParseResponse> {
  const response = await openai().chat.completions.create({
    model,
    reasoning_effort: 'none',
    messages: [{
      role: 'user',
      content: request.parts.map((part): OpenAI.Chat.Completions.ChatCompletionContentPart => (
        part.type === 'text'
          ? { type: 'text', text: part.text }
          : { type: 'image_url', image_url: { url: `data:${part.mimeType};base64,${part.base64}`, detail: 'high' } }
      )),
    }],
    max_completion_tokens: request.maxOutputTokens,
    ...(request.cacheKey ? { prompt_cache_key: request.cacheKey } : {}),
    // Reading a board has exactly one right answer, so sampling buys nothing and costs
    // reproducibility (temperature 0 only works with reasoning off).
    temperature: 0,
    response_format: request.schema
      ? { type: 'json_schema', json_schema: request.schema }
      : { type: 'json_object' },
  });
  return {
    text: response.choices[0]?.message?.content || '',
    usage: {
      provider: 'openai',
      model,
      inputTokens: response.usage?.prompt_tokens ?? 0,
      cachedInputTokens: response.usage?.prompt_tokens_details?.cached_tokens ?? 0,
      outputTokens: response.usage?.completion_tokens ?? 0,
    },
  };
}

/** Thinking off where the model allows it, minimal where it doesn't — a board has one reading. */
function geminiThinking(model: string): ThinkingConfig {
  // Gemini 2.5 takes a budget (Pro can't go to zero); 3.x takes a level.
  if (/^gemini-2.5-pro/.test(model)) return { thinkingBudget: 128 };
  if (/^gemini-2.5/.test(model)) return { thinkingBudget: 0 };
  // 3.x Pro's floor is LOW; Flash and Flash-Lite go to MINIMAL.
  if (/-pro/.test(model)) return { thinkingLevel: ThinkingLevel.LOW };
  return { thinkingLevel: ThinkingLevel.MINIMAL };
}

/**
 * Gemini through Firebase AI Logic — the same proxy the app will call, authorised by the
 * project's Firebase config and (once enforced) App Check. No Gemini key exists anywhere in the
 * code; Firebase holds it.
 */
async function completeWithGemini(request: ParseRequest, model: string): Promise<ParseResponse> {
  const { app } = await import('./firebase');
  const ai = getAI(app, { backend: new GoogleAIBackend() });
  const generative = getGenerativeModel(ai, {
    model,
    generationConfig: {
      temperature: 0,
      maxOutputTokens: request.maxOutputTokens,
      responseMimeType: 'application/json',
      ...(request.schema ? { responseJsonSchema: request.schema.schema } : {}),
      thinkingConfig: geminiThinking(model),
    },
  });
  const result = await generative.generateContent(request.parts.map((part) => (
    part.type === 'text' ? { text: part.text } : { inlineData: { mimeType: part.mimeType, data: part.base64 } }
  )));
  const meta = result.response.usageMetadata;
  return {
    text: result.response.text(),
    usage: {
      provider: 'gemini',
      model,
      inputTokens: meta?.promptTokenCount ?? 0,
      cachedInputTokens: meta?.cachedContentTokenCount ?? 0,
      // Thinking tokens are billed as output.
      outputTokens: (meta?.candidatesTokenCount ?? 0) + (meta?.thoughtsTokenCount ?? 0),
    },
  };
}

/** Send one parse call to the configured model; logs its token usage for cost measurement. */
export async function completeParse(request: ParseRequest): Promise<ParseResponse> {
  const provider = parseProvider();
  const model = parseModelName();
  const result = provider === 'gemini'
    ? await completeWithGemini(request, model)
    : await completeWithOpenAI(request, model);
  console.info('[PARSE-USAGE]', JSON.stringify(result.usage));
  return result;
}
