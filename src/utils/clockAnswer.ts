/**
 * A finish time as an athlete types it on a phone — "21:30", "21.30", "21 30", "2130", "21m30s",
 * "21" — read by the app itself, in seconds. Null for anything else, which goes to the AI reader.
 *
 * A clock reading has one meaning, so it needs no model: sent to one, a bare "2130" came back as
 * 2,130 seconds — a 21:30 workout saved as 35:30 (2026-10-11). Reading it here is also free.
 */
export function readClockAnswer(text: string): number | null {
  const t = text.trim().toLowerCase();
  if (!t) return null;
  const clock = (h: number, m: number, s: number): number | null => (m < 60 || h === 0) && s < 60 ? h * 3600 + m * 60 + s : null;

  let match = t.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
  if (match) return clock(Number(match[1]), Number(match[2]), Number(match[3]));
  // mm:ss, mm.ss, mm ss, mm'ss
  match = t.match(/^(\d{1,3})\s*[:.'\s]\s*(\d{2})$/);
  if (match) return clock(0, Number(match[1]), Number(match[2]));
  // 3-4 digits with no separator — the last two are the seconds ("2130", "930")
  match = t.match(/^(\d{1,2})(\d{2})$/);
  if (match) return clock(0, Number(match[1]), Number(match[2]));
  // "21m30s", "21 min 30 sec", "21 min"
  match = t.match(/^(\d{1,3})\s*(?:m|min|mins|minutes?)\s*(?:(\d{1,2})\s*(?:s|sec|secs|seconds?)?)?$/);
  if (match) return clock(0, Number(match[1]), Number(match[2] ?? 0));
  // A bare 1-2 digit number answering "what was your time?" is minutes
  match = t.match(/^(\d{1,2})$/);
  if (match) return Number(match[1]) * 60;
  return null;
}
