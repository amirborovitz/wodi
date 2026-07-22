---
name: part-split-happens-at-structuring
description: A workout splitting into too many parts can happen at the STRUCTURING layer (structurePart), not just segmentation — each part is re-run through the full parse prompt and can itself split into multiple exercises.
metadata:
  type: project
---

Parse pipeline: segmentation (SEGMENT_SPEC) splits the board into parts, then `structureSegments` calls `structurePart` on EACH part in parallel, and `structurePart` runs the FULL structuring prompt (`parseWorkoutText`) on that part's text. Crucially, that per-part call can itself return MULTIPLE exercises — `mergeSegmentedParses` flattens all parts' exercises into one list. So a "too many parts" bug has TWO independent layers:

1. Segmentation over-splitting (SEGMENT_SPEC) — e.g. two sub-bullets under one letter becoming two parts.
2. Structuring over-splitting — one part's text re-split into multiple exercises by KEY GUIDELINE #1 (RULES_MOVEMENT_CORE, always included, reaches strength parts).

**2026-07-20 case:** "Push Press Into: Push Jerk" (one strength complex). Segmentation kept it as ONE part, but `structurePart` on that part alone returned TWO exercises (Push Press, Push Jerk) — confirmed 2/2 in isolation. That produced the persistent 3-part split (2 lifts + metcon) even after segmentation was fixed. Fix: KEY GUIDELINE #1 + a strength-complex example — sequential lifts chained by "Into:"/"then" under one heading = ONE exercise with both as movements[]. Verified: strength-only 3/3 = 1 exercise; full board 2/2 = 2 parts.

**Lesson:** verifying segmentation in isolation is INSUFFICIENT. When debugging part counts, test the part's OWN text through `check-wod` (which runs segmentation + structuring) to catch a structuring-layer split. The AI is non-deterministic, so run 3x, not once — a single passing run masked this last time.

**DOWNSTREAM COST of merging (2026-07-20):** merging "Push Press Into: Push Jerk" into ONE exercise with a FLAT movements[] + single suggestedSets broke logging AND poster, because downstream models "multiple movements in one exercise" as a SIMULTANEOUS shared-bar complex/superset, with NO representation of SEQUENTIAL blocks each with their own set count:
- `SupersetInput.tsx` (isComplex, ~line 26-49,139): 1+ weighted movements + setsTotal>1 → renders ONE shared `ProgressiveWeightRow`, applies that single weight to ALL weighted movements, and HIDES the per-movement rows. Result: only ONE weight captured; Push Jerk never gets its own input. (Shared weight IS correct for a true bar complex like "1 Clean + 1 Jerk" per set — the model just can't tell the two cases apart once merged.)
- `calculateWorkloadBreakdown`: the exercise's single suggestedSets (8 = 4 PP + 4 PJ) multiplies EACH movement → 2×8=16 reps each instead of the real 2×4=8. Poster + totals double-count.
- Poster blueprint reads "4 rounds" (or 8), never "4 PP then 4 PJ at their own weights" — violates the CLAUDE.md Workout Story rule.

**RESOLUTION (2026-07-20, Option B — reuse sections[]):** a SEQUENTIAL complex is now represented as one exercise with one `sections[]` entry PER block (each a 'rounds' section with its own `rounds` + its movement). This reuses the existing sections primitive (no new bespoke structure). Layers changed:
- `openai.ts`: KEY GUIDELINE #1 + examples 4b (sequential → sections) / 4c (simultaneous "+"-joined → flat, NO sections) — the 3-shape classification. Verified 3/3 live: sequential emits 2 rounds-sections, simultaneous stays flat.
- `SupersetInput.tsx`: `isSequentialBlocks` (movementResults span >1 distinct 'rounds' sectionIndex) → renders one `ProgressiveWeightRow` PER block, each writing its OWN `weight`/`weightEnd` via `handleBlockProgressive` (independent start->peak). Non-sequential (no sections) keeps the shared-bar `isComplex` path (correct for simultaneous complexes). `createBlankResult` already section-tags movementResults + prefills per-movement weight.
- `StoryLogResults.tsx` `buildMaps`: emits `movementWeightProgressions` (name → [start,end]) for load movements logged as a range. `LegacyExerciseResult` + AddWorkoutScreen `ExerciseResult` carry it.
- `AddWorkoutScreen.tsx` save-time breakdown: per-movement progression (`movementWeightProgressions[name]`) takes precedence over the per-exercise `setWeightProgression`.
- `helpers.ts` `isStrengthPagePart`: a `type:'strength'` exercise whose movements are ALL weighted renders as a STRENGTH page even when loggingMode is emom/intervals — so `buildCelebrationMovementRow` shows the weight story (`45->55KG`, min->max from weightProgression, already supported at ~line 1181) instead of reps. Bodyweight/cardio emom stays a metcon page.
Reps now correct (8 each, not 16); poster shows both blocks with independent progressions. Fixture: `fixtures/posters/sequential-strength-complex.json`. Generalizes to N blocks / N set counts. NOTE: browser E2E of the FIX is blocked until the user deploys + re-logs (production still ran the pre-fix build); verified via the exact production builders invoked offline + live parse + poster corpus.
