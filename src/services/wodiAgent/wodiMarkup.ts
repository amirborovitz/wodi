/**
 * The two marks Wodi may use in an answer (askWodi.ts, "How you text"): **bold** for the thing to
 * take away, and a "- " line for a list item. Read here into lines and runs; WodiText draws them.
 * Anything else is left as the words it is — the prompt allows only these two.
 */

export interface MarkupRun {
  text: string;
  bold: boolean;
}

export interface MarkupLine {
  /** A "- " / "• " list line. */
  item: boolean;
  /** Empty for a blank line — a paragraph break. */
  runs: MarkupRun[];
}

const ITEM = /^\s*[-•*]\s+/;
const BOLD = /\*\*(.+?)\*\*/g;

function runsOf(line: string): MarkupRun[] {
  const runs: MarkupRun[] = [];
  let last = 0;
  for (const match of line.matchAll(BOLD)) {
    const at = match.index ?? 0;
    if (at > last) runs.push({ text: line.slice(last, at), bold: false });
    runs.push({ text: match[1], bold: true });
    last = at + match[0].length;
  }
  if (last < line.length) runs.push({ text: line.slice(last), bold: false });
  return runs;
}

export function parseMarkup(text: string): MarkupLine[] {
  return text.trim().split('\n').map((raw) => {
    const item = ITEM.test(raw);
    const line = item ? raw.replace(ITEM, '') : raw.trimEnd();
    return { item, runs: line.trim() ? runsOf(line) : [] };
  });
}
