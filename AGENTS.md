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
- Partner round-split posters use a TEAM / ME data contract, not a "ledger only" contract. For `for_time` partner workouts, the hero result is shared time (`OUR TIME`). The poster title should be human/social (`PARTNER METCON`), while generated structure such as `3 sections for time` belongs in the blueprint area, not the wordmark. TEAM rows show the per-round/per-section prescription. ME rows show the athlete's accumulated personal work when computable (`personal rounds x per-round prescription`). A round ledger may support the story, but it must not replace useful ME totals. One-off cash-out/buy-out sections are not partner round-ledger turns unless explicitly written as traded rounds. When movements are combined into a section row, movement-level loads must remain attached inline, e.g. `400m Run · 40 Power Clean @ 45kg`.
- Partner workouts have two different poster stories. Use the round-ledger / whole-round trade layout only when the workout explicitly assigns complete rounds to partners, such as `6 rounds (3 each)`, `12 RFT, alternate rounds`, or a single total round target completed as traded rounds. For sectioned `for_time` partner workouts like `In pairs: 3 rounds ... then 3 rounds ... then buy-out`, keep an A/B/C section-summary poster: each section row shows the per-section prescription, the hero is `OUR TIME`, and no round ledger or TEAM/ME header is shown. Inside those sectioned for-time workouts, work is generally split movement-by-movement unless a movement is marked `together` (for example `400m run together`), which means every partner does the full amount.
- PR stickers must be scoped to the current page/movement list. A deadlift PR sticker should not appear on the metcon page unless that page contains that PR movement.
- Regression examples to verify after celebration changes: `5 RFT: 600m run, 30 sit-ups, 24 box jumps, 18 twin DB push press, 12 pull-ups, 40 min cap`; `Every 03:00 x 5 rounds`; `4 sets: 8 Romanian deadlift...`.
