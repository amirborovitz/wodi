/**
 * Where an athlete's message goes in the Tell Wodi chat — the one routing rule, so it can be
 * pinned by a test rather than living inside the hook's async flow.
 *
 * - `open-form`:  they asked for the standard logging screen ("let me use the form") — with a
 *                 board, everything said so far goes along; without one, the form starts fresh.
 * - `read-board`: the message IS the workout — read it with the same parse the forms use.
 * - `ask-wodi`:   words with no board yet. Could be a workout ("Fran 5:40") or a question ("what
 *                 did I deadlift last month?"); Ask Wodi decides, and hands a workout back to
 *                 `read-board` unchanged.
 * - `read-words`: there's a board already — read the words against its open questions.
 */
export type ChatRoute = 'open-form' | 'read-board' | 'ask-wodi' | 'read-words';

export function routeMessage(state: { hasBoard: boolean; hasFile: boolean; text: string }): ChatRoute {
  // A photo is always a board — nobody photographs a request for the form.
  if (!state.hasFile && asksForStandardScreen(state.text)) return 'open-form';
  if (state.hasBoard) return 'read-words';
  if (state.hasFile) return 'read-board';
  return 'ask-wodi';
}

/**
 * Ask Wodi handed the words back as a workout. With a board saved for later, they are most
 * likely its result ("18:30, echo bike instead of the run") — but a name is not how anyone
 * recognises a board, so Wodi shows the board itself and asks: one tap for "this one", one for
 * "something else". Never a guess either way.
 */
export function routeWorkoutWords(state: { hasWaitingBoard: boolean }): 'confirm-board' | 'read-board' {
  return state.hasWaitingBoard ? 'confirm-board' : 'read-board';
}

// What the screen is called, and what it is.
const SCREEN = '(?:standard|regular|normal|usual|classic|old|manual)\\s+(?:screen|form|way|logging|log|view|page)';
const STANDARD_SCREEN = new RegExp([
  `\\b${SCREEN}\\b`,
  // "open the form", "use the form", "go to the form", "switch to the form", "show me the form"
  '\\b(?:open|use|go to|switch to|show me|take me to|give me|back to)\\s+(?:the\\s+)?(?:logging\\s+)?form\\b',
  // "I'll fill it in myself", "let me type it in myself", "log it manually"
  '\\b(?:fill|type|enter|log)\\s+(?:it|them|this|everything)?\\s*(?:in\\s+)?(?:myself|manually|by hand)\\b',
  '\\bwithout (?:the )?chat\\b',
].join('|'), 'i');

/**
 * "Let me log it on the standard screen" — read by the app, never the AI: one meaning, and a
 * request to leave the chat must never be lost in a misread. A short request only: "the form
 * said 20 but I did 15" is an answer that happens to mention the form, not a request for it.
 */
export function asksForStandardScreen(text: string): boolean {
  const t = text.trim();
  if (!t || t.split(/\s+/).length > 10) return false;
  return STANDARD_SCREEN.test(t);
}
