/**
 * aiReplay.ts — record/replay for the OpenAI calls the parse pipeline makes.
 *
 * WHY THIS EXISTS: the corpus used to test `parseWorkoutText` on the whole board in one call,
 * but production runs `parseWorkoutSession` — segment the board, then structure each part in its
 * OWN call, in parallel. Those are different code paths that give different answers (a metcon
 * section read alone classifies differently than the same section read beside its siblings), so
 * the old harness both manufactured failures production could never hit and missed real ones.
 * Testing the real pipeline offline means standing in for EVERY call it makes, not just one.
 *
 * KEYING. Responses are keyed by the pipeline's INPUT to each call — the board text for the
 * segmentation call, the part's text for a structuring call — deliberately NOT by:
 *   - call ORDER, because parts are structured concurrently (Promise.all) and finish in any order;
 *   - the PROMPT, because then every prompt edit would invalidate the whole cache and the offline
 *     suite would go red for a change it cannot actually evaluate.
 * The offline suite's question is "given these AI answers, does our code behave correctly?" — the
 * prompt is what the LIVE suite tests. Keying on input keeps those two jobs separate.
 */
import OpenAI from 'openai';

export type RecordedResponses = Record<string, string>;

// The exact lead-ins the pipeline writes before the text it wants read. Each identifies the call
// TYPE, and everything after it is that call's input.
const SEGMENT_MARKER = 'Here is the transcribed workout text:\n\n';
const STRUCTURE_MARKER = 'Here is the workout text to parse:\n\n';

interface CreateBody {
  messages?: Array<{ content?: unknown }>;
}

/** Stable identity of one pipeline call: its type plus the text it was asked to read. */
export function requestKey(body: CreateBody): string {
  const content = body?.messages?.[0]?.content;
  const texts: string[] = Array.isArray(content)
    ? content
        .filter((part): part is { type: string; text: string } =>
          typeof part === 'object' && part !== null && (part as { type?: string }).type === 'text')
        .map((part) => part.text)
    : [String(content ?? '')];

  for (const text of texts) {
    if (text.startsWith(SEGMENT_MARKER)) return `segment|${text.slice(SEGMENT_MARKER.length)}`;
    if (text.startsWith(STRUCTURE_MARKER)) return `structure|${text.slice(STRUCTURE_MARKER.length)}`;
  }
  // An image call (or anything else) carries no text input to key on. Length-keyed so a fixture
  // can still hold one, but text fixtures never reach this.
  return `other|${texts.map((t) => t.length).join(',')}`;
}

type CreateFn = (body: CreateBody, ...rest: unknown[]) => Promise<unknown>;

interface CompletionsProto { create: CreateFn }

function completionsPrototype(): CompletionsProto {
  return (OpenAI as unknown as { Chat: { Completions: { prototype: CompletionsProto } } })
    .Chat.Completions.prototype;
}

let original: CreateFn | null = null;

/** Undo any install. Safe to call when nothing is installed. */
export function restoreOpenAI(): void {
  if (!original) return;
  completionsPrototype().create = original;
  original = null;
}

/**
 * Let every call hit the real API, capturing each one's response. Returns the map that fills up
 * as the pipeline runs — read it after the pipeline resolves.
 */
export function installRecorder(): RecordedResponses {
  restoreOpenAI();
  const store: RecordedResponses = {};
  const proto = completionsPrototype();
  original = proto.create;
  const real = original;
  proto.create = async function recordingCreate(this: unknown, body: CreateBody, ...rest: unknown[]) {
    const response = await real.call(this, body, ...rest) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    store[requestKey(body)] = response?.choices?.[0]?.message?.content ?? '';
    return response;
  };
  return store;
}

/**
 * Serve canned responses instead of calling the API. An unknown call throws by name rather than
 * silently returning nothing — a fixture that has gone stale (the pipeline now asks something it
 * didn't when the fixture was recorded) must fail loudly, not quietly parse an empty board.
 */
export function installReplay(responses: RecordedResponses): void {
  restoreOpenAI();
  const proto = completionsPrototype();
  original = proto.create;
  proto.create = async function replayingCreate(body: CreateBody) {
    const key = requestKey(body);
    const content = responses[key];
    if (content === undefined) {
      const known = Object.keys(responses).map((k) => `    ${k.slice(0, 80).replace(/\n/g, ' ⏎ ')}`);
      throw new Error(
        `aiReplay: no cached response for call\n    ${key.slice(0, 200).replace(/\n/g, ' ⏎ ')}\n`
        + `  cached calls:\n${known.join('\n')}\n`
        + '  (re-record this fixture: npm run corpus:record -- --fixture <name>)',
      );
    }
    return { choices: [{ message: { content } }] };
  };
}
