/**
 * Wodi's numbers, set like a training log: "100kg × 5", "5:42" go in Barlow Condensed so Wodi
 * reads as your log talking back, not a model's plain text. Pure — the bubble only renders.
 *
 * Only numbers that MEAN something are lifted: a clock, a load or distance with its unit, or a
 * "× reps". A date ("30 Jun") and a plain count stay text. A message's one yellow KEY value is
 * never found here — the message names it (`WodiMessage.highlight`), so a date can't be caught.
 */

export interface VoiceSegment {
  text: string;
  /** A number to set in the condensed face. */
  number: boolean;
  /** The message's one key value — yellow. */
  key: boolean;
}

const MEASURED = String.raw`\d{1,2}:\d{2}(?::\d{2})?|\d[\d,]*(?:\.\d+)?\s?(?:kg|lbs?|km|m|cal)\b(?:\s?[×x]\s?\d+)?|\d+\s?[×x]\s?\d+`;

/** The first measured value in a sentence ("17.5kg", "5:42") — what a message highlights. */
export function firstMeasured(text: string): string | null {
  return new RegExp(MEASURED).exec(text)?.[0] ?? null;
}

/** A thread answer: every measured value condensed, none of them yellow. */
export function voiceSegments(text: string): VoiceSegment[] {
  const out: VoiceSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(new RegExp(MEASURED, 'g'))) {
    const at = match.index ?? 0;
    if (at > last) out.push({ text: text.slice(last, at), number: false, key: false });
    out.push({ text: match[0], number: true, key: false });
    last = at + match[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), number: false, key: false });
  return out;
}

/** Wodi's headline message: the ONE named value is yellow and condensed; everything else is text. */
export function headlineSegments(text: string, highlight: string | null): VoiceSegment[] {
  const at = highlight ? text.indexOf(highlight) : -1;
  if (!highlight || at < 0) return [{ text, number: false, key: false }];
  return [
    { text: text.slice(0, at), number: false, key: false },
    { text: highlight, number: true, key: true },
    { text: text.slice(at + highlight.length), number: false, key: false },
  ].filter((s) => s.text);
}
