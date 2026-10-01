/**
 * Where an athlete's message goes in the Tell Wodi chat — the one routing rule, so it can be
 * pinned by a test rather than living inside the hook's async flow.
 *
 * - `read-board`: the message IS the workout — read it with the same parse the forms use.
 * - `ask-wodi`:   words with no board yet. Could be a workout ("Fran 5:40") or a question ("what
 *                 did I deadlift last month?"); Ask Wodi decides, and hands a workout back to
 *                 `read-board` unchanged.
 * - `read-words`: there's a board already — read the words against its open questions.
 */
export type ChatRoute = 'read-board' | 'ask-wodi' | 'read-words';

export function routeMessage(state: { hasBoard: boolean; hasFile: boolean }): ChatRoute {
  if (state.hasBoard) return 'read-words';
  // A photo is always a board — nobody photographs a question.
  if (state.hasFile) return 'read-board';
  return 'ask-wodi';
}
