// The first thing Wodi says unprompted: a board the athlete saved for later and never logged.
// Pure — the app picks the moment and the words, no model, no numbers to check.
//
// Said once per board, at most once a day, in the athlete's morning, and only about a board from
// the last few days (one from last month isn't a to-do any more, it's clutter).

/** Hour of the athlete's day the nudge goes out. */
export const NUDGE_HOUR = 9;
/** A board saved longer ago than this is past nudging. */
export const NUDGE_MAX_DAYS = 3;

export interface WaitingBoard {
  id: string;
  title: string | null;
  createdAtMs: number;
  /** Already nudged about — never twice. */
  nudged: boolean;
}

/** The athlete's calendar day ("2026-11-05") and hour at this instant, where they are. */
export function localDayAndHour(at: Date, timeZone: string): { day: string; hour: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(at);
  const part = (type: string): string => parts.find((p) => p.type === type)?.value ?? '';
  return { day: `${part('year')}-${part('month')}-${part('day')}`, hour: Number(part('hour')) };
}

function daysBetween(fromDay: string, toDay: string): number {
  return Math.round((Date.parse(`${toDay}T00:00:00Z`) - Date.parse(`${fromDay}T00:00:00Z`)) / 86_400_000);
}

/** A time zone the server can use — an unknown one falls back to UTC rather than throwing. */
export function knownTimeZone(timeZone: unknown): string {
  if (typeof timeZone !== 'string' || !timeZone) return 'UTC';
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone });
    return timeZone;
  } catch {
    return 'UTC';
  }
}

/**
 * The board to nudge about right now, or null. It's the athlete's nudge hour, nothing was said
 * today, and the newest board saved on an earlier day (within NUDGE_MAX_DAYS) hasn't been nudged.
 */
export function pickBoardNudge(input: {
  boards: readonly WaitingBoard[];
  now: Date;
  timeZone: string;
  /** The athlete's day of the last unprompted message, if any. */
  lastNudgeDay: string | null;
}): WaitingBoard | null {
  const { day: today, hour } = localDayAndHour(input.now, input.timeZone);
  if (hour !== NUDGE_HOUR || input.lastNudgeDay === today) return null;
  const due = input.boards
    .filter((b) => {
      if (b.nudged) return false;
      const age = daysBetween(localDayAndHour(new Date(b.createdAtMs), input.timeZone).day, today);
      return age >= 1 && age <= NUDGE_MAX_DAYS;
    })
    .sort((a, b) => b.createdAtMs - a.createdAtMs);
  return due[0] ?? null;
}

/** What Wodi says about it. */
export function boardNudgeText(board: WaitingBoard): string {
  const title = board.title?.trim();
  return title
    ? `${title} is still waiting. Did you get to it? Tell me how it went and I'll make the poster.`
    : "Your saved board is still waiting. Did you get to it? Tell me how it went and I'll make the poster.";
}
