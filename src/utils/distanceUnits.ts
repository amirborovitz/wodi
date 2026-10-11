/**
 * The board's own words keep its unit ("1 mile run" stays a mile in the prescription), but every
 * TOTAL is metres: the workload rows, the grand totals, EP, the hero number and the stats all read
 * those rows, so converting once, where a row is built, makes every reader right.
 *
 * One owner, because summing raw numbers across units is the bug: Murph's two miles were stored
 * as distance 1 + 1 and counted as 2 metres (2026-10-10).
 */
const METRES_PER: Record<string, number> = {
  m: 1,
  km: 1000,
  mi: 1609.344,
  yd: 0.9144,
  ft: 0.3048,
};

/** A distance in metres. A missing or unknown unit is metres — what every board defaults to. */
export function toMetres(value: number, unit: string | undefined): number {
  return value * (METRES_PER[unit ?? 'm'] ?? 1);
}
