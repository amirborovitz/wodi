/**
 * Where a save from the logging flow goes: a new workout, or the one this session already wrote.
 *
 * ONE question, answered by ONE fact — has this logging session already written a workout? It
 * used to be answered by `isEditingAfterSave`, a flag that also decides whether the logging
 * screen re-fills what was typed. The back arrow clears that flag (the screen must stop
 * re-filling), and clearing it also switched the save back to "create": Save → Edit → back →
 * Save wrote a SECOND copy of the workout and left the first one standing. Thirteen boards in
 * one athlete's history were saved twice or three times, and every copy counted in the recaps.
 *
 * The session forgets its workout only when the athlete starts a DIFFERENT board — the
 * capture screen — never because of where they navigated inside the same one.
 */
export type SaveTarget =
  | { kind: 'create' }
  | { kind: 'update'; workoutId: string };

export function resolveSaveTarget(sessionWorkoutId: string | null | undefined): SaveTarget {
  return sessionWorkoutId ? { kind: 'update', workoutId: sessionWorkoutId } : { kind: 'create' };
}
