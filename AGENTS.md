# Wodi Project Instructions

Before changing UI, read the Wodi design system:

- `memory/wodi-design-system.html` is the authoritative handoff.
- `CLAUDE.md` contains the repo map and a summarized Wodi design section.

Design rules that must survive every UI change:

- Use Wodi's dark background, warm white text, and yellow `#f5c200` as the single accent.
- Do not introduce cyan, magenta, blue, gradients, or decorative accent palettes into product UI unless the design system is explicitly updated.
- Use Barlow / Barlow Condensed for display and numeric surfaces.
- Celebration and workout-detail screens are one social artifact, not separate layouts.
- Preserve the full workout prescription, actual result, and totals in recap screens.

Celebration artifact implementation notes:

- `src/screens/WorkoutScreen.tsx` has one shared movement-row view model: `buildCelebrationMovementRow`. `renderChipperPoster`, `buildRewardArtifactSections`, and `buildPageArtifactSection` should all use that helper for non-station movement rows. Do not reintroduce separate per-round/total math inside one renderer.
- `renderChipperPoster` is used for one-exercise `for_time` workouts with multiple movements, including `5 RFT` chippers. `buildRewardArtifactSections` is used for non-chipper single-workout screens. `buildPageArtifactSection` is used for multi-part carousel pages. When fixing celebration movement rows, round counts, substitutions, PR stickers, or per-round/total display, check all three paths.
- Part-page wordmarks come from `Exercise.partNameOverride || Exercise.aiPartName || date fallback`, never from generic format labels like `METCON` or `STRENGTH`. Generation lives in `src/services/partNameGeneration.ts`; user overrides are persisted back onto the exercise.
- For repeated workouts, the primary row value should be the per-round/per-set prescription and the secondary text should show the total. Example: `5 RFT` with substituted `600m Run -> 1800m Echo Bike` should display `1800M` and `TOTAL 9.0KM`, not just `1800M`.
- PR stickers must be scoped to the current page/movement list. A deadlift PR sticker should not appear on the metcon page unless that page contains that PR movement.
- Regression examples to verify after celebration changes: `5 RFT: 600m run, 30 sit-ups, 24 box jumps, 18 twin DB push press, 12 pull-ups, 40 min cap`; `Every 03:00 x 5 rounds`; `4 sets: 8 Romanian deadlift...`.
