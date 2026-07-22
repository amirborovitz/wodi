---
name: per-movement-ladder-and-board-fidelity
description: Per-movement independent rep ladders ("[50-40-30] air squats / [30-20-10] push press / 15 box jumps each") must show each movement's OWN scheme in the board's compact style — not one collapsed scheme, not Round 1/2/3 expansion. Plus the double-implement→never-barbell rule.
metadata:
  type: project
---

**Design principle — POSTER FIDELITY (user, 2026-07-22):** the poster should tell the story AS CLOSE TO THE ORIGINAL BOARD AS POSSIBLE. Mirror the coach's phrasing/notation; PRESERVE ambiguity the coach left open; do NOT resolve or expand implicit structure. Applies broadly, not just to ladders.

**Per-movement independent rep ladder** (GORILLOT part C): board writes each movement with its own bracketed scheme —
```
[50-40-30] air squats
[30-20-10] twin DB's/KB's push press
* 15 box jumps after each set
```
Two failures were possible and both are wrong: (a) COLLAPSE — apply one exercise-level `suggestedRepsPerSet [50,40,30]` to every movement (the AI did this; falsely claims all descend 50-40-30); (b) EXPAND — render explicit "Round 1: 50+30+15 / Round 2: 40+20+15 / Round 3: 30+10+15" (over-specifies structure the compact board left implicit). Correct = one row per movement with its OWN scheme: "50-40-30 Air Squats / 30-20-10 DB Push Presses @20kg / 15 Box Jumps".

**Data + render:**
- `ParsedMovement` has NO per-movement rep-sequence field (only single `reps` + `repsDisplay`); exercise-level `suggestedRepsPerSet`/`ladderReps` hold ONE scheme. So per-movement schemes are encoded as SECTIONS-PER-ROUND (each `rounds:1` section = one round listing every movement at its reps that round) — the pyramid/chipper shape.
- Prompt (openai.ts RULES_REP_SCHEMES): "PER-MOVEMENT INDEPENDENT SCHEMES" rule + example makes the AI emit sections-per-round instead of one collapsed suggestedRepsPerSet — but prompt-only is fragile (all session's prompt-driven structural rules were non-deterministic).
- DETERMINISTIC hardening (workoutPostProcessor `normalizePerMovementLadder`, same spirit as `normalizePerTierBuyIns`): rebuilds per-round sections REGARDLESS of AI shape. Detection is structural, not wording — parse each movement's OWN bracketed sequence from its line in the scoped rawText (`parseRepSequence`: "[50-40-30]" bracketed strong-signal, or a guarded bare "a-b-c" not followed by kg/lb); build ONLY when >=2 movements have their own bracket AND the brackets DIFFER. Ladder length N = longest sequence; a movement with no bracket repeats its single reps flat (box jumps), or inherits `suggestedRepsPerSet` if its round-1 reps match the scheme's first value. Idempotent + guarded: skips any exercise that ALREADY has sections (correct pyramid, building/palindrome chipper, per-tier buy-in) and skips single-shared-scheme ladders (21-15-9 → distinctOwn<2 → not built, existing render handles it). Verified: flat AND sectioned inputs produce IDENTICAL sections; fixture `per-movement-ladder-flat-collapse` (offline corpus) starts from the FLAT AI shape to prove the deterministic path.
- Render (helpers.ts): `isPyramidChipper` branch now splits on `hasSameMovementsEveryRound(exercise)` — if the SAME movement sits at each position across all rounds → `buildPerMovementLadderRows` (transposes sections into per-movement scheme rows: "50-40-30", flat "15", weight un-doubled to per-implement). A true palindrome pyramid (movements themselves differ round to round, e.g. KB SDHP→C2B) keeps the round-by-round `buildProgressiveChipperRows`. Building chippers (`isProgressiveChipper`, movements ADDED each round) are a separate earlier branch, untouched.

**Double implement is never a barbell** (bug 1, same board): "twin DB's/KB's push press" got `implementCount:2` but no `equipment`, so the load input labeled it "BARBELL WEIGHT". Fixes: (1) openai.ts EQUIPMENT rule — implementCount 2 ⇒ dumbbell/kettlebell, never barbell; (2) workoutPostProcessor `backfillInputTypes`→`inferEquipment` deterministically stamps equipment (implementCount 2 & no equipment ⇒ dumbbell, or kettlebell if name says KB) on top-level AND section movements; (3) ScoreMovementInputs `getMovementEquipmentType` — a double implement never classifies as barbell (defense for un-stamped docs). Poster weight shows per-implement (un-double the 2×20=40 breakdown weight → "20kg ea"), never the doubled 40.

Fixture: `real-per-movement-ladder-gorillot-20260722`. NOTE: fixes are upstream (parse) — the already-saved doc (0PTOzaV27CNcDiFmMB1K, collapsed shape) only benefits on re-log.

**LOGGING-screen fixes (2026-07-22) after `normalizePerMovementLadder` shipped:**
- Splitting the ladder into 3 `rounds:1` same-movement sections made `createBlankResult` flatten them into per-section movementResults → the story logging showed "1 ROUND" dividers and "Used for DB Push Press · DB Push Press · DB Push Press" (Push Press once per round) via `ScoreMovementInputs` section grouping. Fix: `createBlankResult` now detects a per-movement ladder (`hasSameMovementsEveryRound`) and builds movementResults from the DISTINCT movements (no `sectionIndex`) — so it logs like the flat for-time shape: one weight input per distinct movement + the round set-selector. `ScoreMovementInputs` groupBySectionIndex returns null when any mr lacks sectionIndex, so the "1 ROUND" grouping is bypassed. A GENUINELY sequential complex (Push Press THEN Push Jerk, DIFFERENT movements per section) still flattens per-section → `SupersetInput.isSequentialBlocks` fires → per-block weights (unchanged).
- `hasSameMovementsEveryRound` is now shared in `src/utils/sectionShape.ts` (one predicate for helpers.ts poster branch, createBlankResult, and SupersetInput — no near-duplicates).
- `DescendingSetTrack` ("TAP YOUR LAST COMPLETED SET") was a TOGGLE (`completed===idx+1 ? idx : idx+1`) so tapping the pre-selected last rung DESELECTED it (looked like data loss). Fixed to `onChange(idx+1)` — tap = select your stopping point, idempotent, never deselects; tap an earlier rung to log fewer.
Logging inputs aren't covered by the wod/poster corpus harnesses; verified via direct `createBlankResult` reconstruction (ladder → distinct movements, sequential complex → per-block).
