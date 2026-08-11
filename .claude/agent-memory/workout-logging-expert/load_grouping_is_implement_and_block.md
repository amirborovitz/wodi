---
name: load-grouping-is-implement-and-block
description: Which movements share ONE weight input is decided by implement-in-play AND block — never by "is it weighted"; loadGroups.ts is the single grouping model for both logging components
metadata:
  type: project
---

> **REVISED 2026-08-10 — the two components split again, on purpose.** Implement-grouping survives
> only in **metcons** (`ScoreMovementInputs` → `resolveLoadGroups`), where one pair of DBs really
> does serve every DB movement in a round. In **strength** (`SupersetInput` → `resolveLoadBlocks`)
> two movements share a weight input ONLY when the AI set `exercise.complex`; a circuit asks once
> per movement. Same equipment class ≠ same load — on this fixture's board the DB row rode at 22.5
> and the single-leg deadlift at 20, and the shared 'db' bucket asked for one number.
> `resolveLoadBlocks` no longer calls `resolveLoadGroups`. Read the rest as the metcon story.

Two movements share one weight input only when they are the **same implement in play** *and* sit
in the **same block** of the piece. Both axes live in `src/components/logging/story/loadGroups.ts`
(`resolveMovementEquipment` → `resolveLoadGroups` → `resolveLoadBlocks`).

**Why:** `SupersetInput` used to carry a second, equipment-blind grouping system —
"any load movement + multiple sets = one shared bar" — that ignored the AI's per-movement
`equipment` field entirely. On a real board ("4 sets: 5 Shoulder press (barbell) / 10/10 DB row /
8/8 single leg deadlift") it rendered ONE card labelled "BARBELL", suppressed the other two
movements' rows outright, and wrote the single entered weight into every load movement. The saved
doc came out with 40kg and 10 reps on all three lifts. The AI had returned the right
`equipment` (barbell / dumbbell / dumbbell) and the right per-movement `reps` (5 / 10 / 8) — the
UI simply never read them.

**How to apply:**
- Adding or debugging any weight input: derive groups from `resolveLoadBlocks`, never from a local
  "which movements are weighted" scan. A new parallel grouping path is the bug, not the fix.
- The **block** axis (`MovementResult.sectionIndex`) is what keeps sequential blocks
  ("4 sets Push Press, Into: 4 sets Push Jerk") independent — same bar, different times, different
  loads. It replaced the old `isSequentialBlocks` branch; shapes with no sections (flat circuit,
  per-movement rep ladder) carry no section index and group on implement alone.
- A group of 2+ movements always needs the "Use different weights for each →" escape hatch; the
  merge is a default, not a claim.
- A shared row's rep badge may only state a rep count when every member prescribes the SAME one.
  Otherwise state the set count. One member's reps spoken for the rest is how "10 reps" landed on
  a 5-rep press.
- Exercise-level `sets[]` for a multi-movement block may only carry what the whole block shares:
  a weight when every load resolved to the same number, and the block's per-set rep TOTAL.
  Per-movement truth travels on `movementWeights` / `movementWeightProgressions` →
  `movements[].loggedWeights`. Fabricating a shared set weight is not cosmetic:
  `hasVaryingSetWeights` in `buildWorkloadBreakdownFromResults` averages it across every movement
  and it overrides the per-movement weight.

Fixture: `fixtures/posters/real-mixed-implement-strength-circuit-20260810.json`.
Tests: `resolveLoadBlocks` block in `loadGroups.test.ts`.

Still open (flagged, not fixed): `AddWorkoutScreen.saveWorkout` bakes the athlete's logged weight
into each movement's `rxWeights`, so a saved doc claims the coach prescribed what the athlete
lifted. `loggedWeights` already carries the athlete's number and `resolveOccurrenceLoad` prefers
it, so the bake looks like pre-`loggedWeights` legacy — see [[per-side-reps-and-rx-bake]] scope
notes before removing it.
