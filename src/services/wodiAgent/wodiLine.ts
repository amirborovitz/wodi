import { openaiClient, PARSE_MODEL, PARSE_REASONING_EFFORT } from '../openai';
import { usesOnlyFactNumbers, type OccasionKind, type WodiOccasion } from './wodiOccasion';

/**
 * Wodi's own words for an occasion the app picked (wodiOccasion.ts). The model writes the line;
 * the facts are the app's. A line that brings in a number the facts don't hold, or comes back
 * empty, is not said — the occasion's plain fallback is.
 */

/** One model call: system + facts in, the line out. Injectable so tests never touch the network. */
export type WriteFn = (system: string, user: string) => Promise<string>;

const WHAT_TO_SAY: Record<OccasionKind, string> = {
  cheer: 'They just logged this workout. Cheer them on for it. If the facts hold a personal record, a matched best or a milestone, that is the headline. If they said how it felt, react to that like a friend would (wrecked → they earned the rest). Mention the result if there is one.',
  note: 'They asked you to remember this. Check in on it with one gentle question. No medical advice.',
};

function systemPrompt(kind: OccasionKind): string {
  return `You are Wodi, the athlete's CrossFit buddy, texting them first.

${WHAT_TO_SAY[kind]}

How you text:
- ONE short message: at most 2 short sentences, under 25 words.
- Warm, specific, a friend at the gym. Plain text, no markdown, no hashtags, at most one emoji.
- Use a number only if it appears in the facts, written exactly as there. Never invent or work out a number.
- Never point at a gap: no "still", no targets, nothing left to do, no days missed, no comparing them with anyone.
- Don't open with "Hey" or their name.`;
}

const defaultWrite: WriteFn = async (system, user) => {
  const response = await openaiClient.chat.completions.create({
    model: PARSE_MODEL,
    reasoning_effort: PARSE_REASONING_EFFORT,
    temperature: 0.9,
    max_completion_tokens: 120,
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
  });
  return response.choices[0]?.message?.content ?? '';
};

export async function writeWodiLine(occasion: WodiOccasion, write: WriteFn = defaultWrite): Promise<string> {
  try {
    const raw = await write(systemPrompt(occasion.kind), `Facts:\n${JSON.stringify(occasion.facts, null, 2)}`);
    const line = raw.trim().replace(/^["“]|["”]$/g, '').trim();
    if (!line || !usesOnlyFactNumbers(line, occasion.facts)) {
      if (line) console.warn('[WodiLine] a number outside the facts — saying the plain line', { line, facts: occasion.facts });
      return occasion.fallback;
    }
    return line;
  } catch (err: unknown) {
    console.error('[WodiLine] could not write the line', err);
    return occasion.fallback;
  }
}
