/**
 * The rep count on rung `idx` of a ladder, extrapolating past the board's own numbers: an athlete
 * fast enough to finish "3-6-9-12" carries on by the same step (15, 18…). The board's last step
 * sets the pace; a one-rung ladder climbs by 2.
 *
 * THE ONE OWNER. The logging screen, the save, the poster and the ladder chart each kept a copy of
 * this; the chat asks "which rung did you finish?" from it too, and a rung the chat offers has to
 * be the rung the poster draws.
 */
export function getLadderRungValue(reps: readonly number[], idx: number): number {
  if (idx < reps.length) return reps[idx];
  const step = reps.length >= 2 ? reps[reps.length - 1] - reps[reps.length - 2] : 2;
  return reps[reps.length - 1] + step * (idx - reps.length + 1);
}
