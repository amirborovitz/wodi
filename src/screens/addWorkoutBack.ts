/**
 * Where Back goes from inside Add Workout. One owner, so the chat, the form's own back button and
 * the screen header can't disagree.
 *
 * The chat is home base. A board half-logged in the chat is already kept (the chat saves itself
 * as it goes), so Back on it means "later": the athlete lands on the thread, where the board waits
 * as "saved for later — Log it". Sending them to Today instead hid it in the For Later line, and
 * the board got uploaded a second time (2026-10-10).
 */
export type BackTarget =
  /** Leave Add Workout altogether — Today, or the poster an edit began from. */
  | 'exit'
  /** The thread with no board open; the one just left waits there as a card. */
  | 'thread'
  /** Back into the chat this form was opened from. */
  | 'chat'
  /** The form flow's own previous step — the parsed board. */
  | 'preview';

/** Back from the chat itself. */
export function backFromChat(input: { boardOpen: boolean }): BackTarget {
  return input.boardOpen ? 'thread' : 'exit';
}

/** Back from the logging form, at its first part. */
export function backFromForm(input: { editing: boolean; openedFromChat: boolean }): BackTarget {
  if (input.editing) return 'exit';
  return input.openedFromChat ? 'chat' : 'preview';
}
