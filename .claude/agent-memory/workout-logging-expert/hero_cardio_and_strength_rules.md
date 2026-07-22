---
name: hero-cardio-and-strength-rules
description: computeHeroResult ordering traps — cadenced pieces rep-heroed over cardio, and strength-on-a-clock rep-heroed instead of peak weight. Counted cardio (cal AND distance) must beat the generic rep fallback.
metadata:
  type: project
---

`computeHeroResult` (helpers.ts) picks the poster headline. Two recurring trap classes, both fixed 2026-07-21:

**1. Strength on a clock got rep-heroed.** The fixed-cadence branch fires on `format === 'emom'` (or cadenced intervals) and heroes summed `totalReps` BEFORE the strength branch — so a barbell complex run as an EMOM headlined "16 REPS" (meaningless for strength). Fix: a strength-work branch runs BEFORE the cadence branch, heroing PEAK LOGGED WEIGHT + the lift name as subtitle (e.g. 80 KG / PUSH JERK). It uses `isWeightedStrengthWork(exercise)` — THE single shared predicate, also used by `isStrengthPagePart`, so hero and poster-page routing can never disagree. Peak comes from the per-movement breakdown (`weightProgression`/`weight`), NOT the shared `sets` array, so a sequential complex names the right lift (80 is Push Jerk, not Push Press); set weights are the fallback.

**2. Cardio buried under a rep tally.** Two defects:
- The cardio guard was `format === 'emom' && movements.some(cal||dist)`, but the branch it guards also handles cadenced `intervals` — so an intervals piece with a bike/row leg looked cardio-free and got rep-heroed. Fix: `hasCardioWork` checks MOVEMENTS only; `isCadencedPiece` covers emom + cadenced intervals; `emomHasCardio = isCadencedPiece && hasCardioWork`. The calories branch's bypass now uses `emomHasCardio` (no extra `format === 'emom'`), extending it to cadenced intervals.
- There was NO distance hero at all — only calories. So "Every 3:15 x 10: 1000m bike + 20 KB + 15 goblet" fell to the generic rep fallback showing "350 REPS", which EXCLUDES the 10km bike (bike contributes 0 reps). Fix: a distance hero mirroring the calories one, same rule (`total >= 1000m` OR any distance on a cardio-carrying cadenced piece), same slot (after PR/rounds/finish-time/peak-weight, BEFORE the generic reps fallback), using the existing `formatDistanceSplit()` → "10.0" / "KM" + top distance movement as subtitle. No dominance heuristic — consistency with the calories rule.

**Order that matters:** PR > AMRAP rounds > for-time finish time > strength peak weight > calories > distance > generic reps > EP > duration.

**Regression controls to re-check when touching this:** bodyweight EMOM (Cindy) must stay REPS; calorie cardio EMOM must stay CAL; for-time metcon must stay its finish time; strength complex must stay peak KG. Fixtures: `real-distance-cardio-emom-20260720`, `sequential-strength-complex`, `interval-compound-name-recovery` (its hero legitimately became 4.0 KM — its real purpose is compound-name recovery).
