/**
 * `steps` presses of a `step`-sized −/+ from `value`, landing on the step's grid.
 *
 * Implements come in sizes — kettlebells in 2 kg, plates in 2.5 — and a stepper starts wherever
 * the athlete's last load or a typed number put it. Adding a step to an off-grid start walks along
 * weights that don't exist: last time's 17.5 on a kettlebell stepped to 15.5 and 19.5, and the
 * 16 kg bell the athlete actually swung was unreachable (2026-10-15). Off the grid, the first press
 * lands ON it (17.5 → 16 or 18); on the grid, every press moves one step. One rule for every
 * stepper, so the chat's weight card and the logging screen can't step differently.
 */
export function stepOnGrid(value: number, steps: number, step: number): number {
  if (steps === 0 || step <= 0) return value;
  const position = value / step;
  const onGrid = Math.abs(position - Math.round(position)) < 1e-9;
  const direction = Math.sign(steps);
  // Off the grid, the first press is the snap onto it; the rest are whole steps.
  const first = onGrid ? Math.round(position) + direction : (direction > 0 ? Math.ceil(position) : Math.floor(position));
  const landed = (first + (steps - direction)) * step;
  return Math.round(landed * 100) / 100;
}
