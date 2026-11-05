import { PARSE_MODEL, PARSE_REASONING_EFFORT } from '../openai';
import { modelClient } from '../modelClient';
import { usesOnlyFactNumbers, type OccasionKind, type WodiOccasion } from './wodiOccasion';

/**
 * Wodi's own words for an occasion the app picked (wodiOccasion.ts). The model writes the line;
 * the facts are the app's. A line that brings in a number the facts don't hold, or comes back
 * empty, is not said — the occasion's plain fallback is.
 */

/** One model call: system + facts in, the line out. Injectable so tests never touch the network. */
export type WriteFn = (system: string, user: string) => Promise<string>;

const WHAT_TO_SAY: Record<OccasionKind, string> = {
  cheer: `They just logged this workout. React to THIS workout like a friend who watched it: pick the one most interesting true thing in the facts and say it plainly.
- A personal record, a matched best, a heavier load or a faster time than last time is the headline. Say the change ("up from 95kg").
- A lighter load, a slower time, a time cap or a scaled movement: be honest. Don't call it a PR or pretend it was faster. Find the real positive in it (they showed up on a hard day, kept moving under the cap, the scale kept the intensity, a lighter day after heavy ones is smart).
- How it felt (wrecked, chill) is worth reacting to when nothing else stands out.`,
  note: 'They asked you to remember this. Check in on it with one gentle question. No medical advice.',
  focus: `It's the start of their week. Suggest ONE thing to try this week, picked from the ideas in the facts: the one you'd pick as their buddy. Say what to try and the one fact that makes it a good idea ("your top set's been 100kg twice, so try a little more"). An invitation, never an order or a deficit: no "you haven't", no "you need to", no "behind".`,
};

/** Stock praise says nothing about the workout. A line built on it is not said. */
const STOCK_PRAISE = /\b(nice|great|good|strong|solid|awesome|amazing) (work|job|session|effort)\b|\bwell done\b|\b(crushed|killed|smashed|nailed) it\b|\bway to go\b|\bproud of you\b/i;

export function isStockPraise(line: string): boolean {
  return STOCK_PRAISE.test(line);
}

function systemPrompt(kind: OccasionKind, recent: readonly string[]): string {
  const avoid = recent.length > 0
    ? `\n- Your last messages are below. Don't start the same way or reuse their phrases:\n${recent.map((r) => `  "${r}"`).join('\n')}`
    : '';
  return `You are Wodi, the athlete's CrossFit buddy, texting them first. You know the sport, you notice details, and you tell the truth, always on their side.

${WHAT_TO_SAY[kind]}

How you text:
- ONE short message: at most 2 short sentences, under 30 words. Sound like a person texting, not an app.
- Be specific: name the movement, the load or the time. Never generic praise: no "nice work", "great job", "well done", "crushed it", "strong session".
- Honest and always positive: never invent a win, never make them feel bad.
- Plain text, no markdown, no hashtags, at most one emoji, and only when it fits.
- Use a number only if it appears in the facts, written exactly as there. Never invent or work out a number.
- Never compare them with anyone else. Don't open with "Hey" or their name.${avoid}`;
}

const defaultWrite: WriteFn = async (system, user) => {
  const response = await modelClient.chat.completions.create({
    model: PARSE_MODEL,
    reasoning_effort: PARSE_REASONING_EFFORT,
    temperature: 0.9,
    max_completion_tokens: 120,
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
  });
  return response.choices[0]?.message?.content ?? '';
};

/** `recent`: Wodi's last few lines, newest first, so this one doesn't sound like them. */
export async function writeWodiLine(
  occasion: WodiOccasion,
  write: WriteFn = defaultWrite,
  recent: readonly string[] = [],
): Promise<string> {
  try {
    const raw = await write(systemPrompt(occasion.kind, recent), `Facts:\n${JSON.stringify(occasion.facts, null, 2)}`);
    const line = raw.trim().replace(/^["“]|["”]$/g, '').trim();
    if (!line || !usesOnlyFactNumbers(line, occasion.facts) || isStockPraise(line)) {
      if (line) console.warn('[WodiLine] off the facts or stock praise, saying the plain line', { line, facts: occasion.facts });
      return occasion.fallback;
    }
    return line;
  } catch (err: unknown) {
    console.error('[WodiLine] could not write the line', err);
    return occasion.fallback;
  }
}
