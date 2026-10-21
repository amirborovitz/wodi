/**
 * Where Back goes from inside Add Workout. One owner, so the chat, the form's own back button and
 * the screen header can't disagree.
 *
 * The chat is home base. A board half-logged in the chat is already kept (the chat saves itself
 * as it goes), so Back on it means "later": the athlete lands on the thread, where the board is
 * pinned above the composer ("Finish"), as it leads Today's rail. Sending them to Today with no
 * sign of it once got the board uploaded a second time (2026-10-10).
 */
export type BackTarget =
  /** Leave Add Workout altogether — Today, or the poster an edit began from. */
  | 'exit'
  /** The thread with no board open; the one just left is pinned there. */
  | 'thread'
  /** A workout was just logged in the chat — leave the way Done on the poster screen does. */
  | 'logged'
  /** Back into the chat this form was opened from. */
  | 'chat'
  /** The form flow's own previous step — the parsed board. */
  | 'preview';

/**
 * Back from the chat itself — to where the athlete came from. A board opened from its tile on
 * Today goes back to Today, where the tile still shows it; a board read or reopened inside the
 * chat goes back to the thread, where it is pinned.
 */
export function backFromChat(input: { boardOpen: boolean; boardFromToday: boolean; logged: boolean }): BackTarget {
  // The poster is in the chat now, so the chat is where a log ends — and leaving it is leaving it.
  if (input.logged) return 'logged';
  return input.boardOpen && !input.boardFromToday ? 'thread' : 'exit';
}

/** Back from the logging form, at its first part. */
export function backFromForm(input: { editing: boolean; openedFromChat: boolean }): BackTarget {
  if (input.editing) return 'exit';
  return input.openedFromChat ? 'chat' : 'preview';
}
