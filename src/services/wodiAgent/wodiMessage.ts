/**
 * Wodi's plain message — what Today and the thread say when Wodi has no line of its own (a
 * workout's cheer or a remembered note, see wodiOccasion.ts): the opener, nothing else.
 *
 * It used to lead with a stat — a milestone just crossed, a best matched, a running total. Opening
 * the chat on "You just passed 250 dips." read as a bot's notification, not a buddy: no workout,
 * no "all time", no day (owner, 2026-10-31). A milestone is said in the cheer of the workout that
 * crossed it, where it has its context.
 */

export interface WodiMessage {
  text: string;
  /**
   * The day the message is about, as written in the text ("30 Jun", "yesterday") — so that word
   * can open that day's poster, the message's receipt. `workoutId` when the message already knows
   * which poster; otherwise the day + subject find it.
   */
  day: { label: string; iso: string; subject: string | null; workoutId: string | null } | null;
  /** The ONE value set in yellow ("5:42") — named here, never found by pattern-matching digits. */
  highlight: string | null;
}

export const WODI_OPENER = "What'd you do today? Send me the board, or ask me anything.";

export const OPENER_MESSAGE: WodiMessage = { text: WODI_OPENER, day: null, highlight: null };
