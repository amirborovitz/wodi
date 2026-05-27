---
name: repair-undercounted-buy-in-cash-out
description: repairUndercountedBreakdown in WorkoutScreen.tsx must skip buy-in/cash-out movements or it multiplies their totals by round count
metadata:
  type: feedback
---

`repairUndercountedBreakdown` in `src/screens/WorkoutScreen.tsx` (~line 693) walks `exercise.movements` and overwrites `target.totalReps/Distance/Calories` with `movement.X * repeats` when the stored breakdown looks undercounted. It already skips exercises that have `exercise.sections[]`, but when the parent exercise has NO sections, the buy-in / cash-out movements still live in `exercise.movements[]` (the openai.ts parser merges them in with `perRound: false` and a "Cash-Out: " / "Buy-In: " name prefix).

**Why:** Observed bug — a "Cash-out: Farmer Carry 200M" in a 5 Rounds For Time workout was displayed as "1.00 km total" on the celebration screen because `repairUndercountedBreakdown` computed `200 × 5 = 1000` and overwrote the correct stored value of 200.

**How to apply:** Inside the `for (const movement of exercise.movements)` loop, skip movements where any of these are true: `movement.role === 'buy_in'`, `movement.role === 'cash_out'`, `movement.perRound === false`, or `movement.countingMode === 'once'`. These three signals are how the parser/save path mark "done once, not per round." Same rule applies anywhere else we multiply movement values by a round count without consulting sections.

Related: `calculateWorkloadBreakdown` in `src/services/workloadCalculation.ts` has the same latent gap in its `getMovementMultiplier` legacy fallback (`isBuyInCashOut` is gated on `hasSections`), but that function is not currently called from any screen — left alone to keep the fix minimal. If it ever gets wired back up, fix it the same way.
