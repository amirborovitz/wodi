---
name: sections-shadow-toplevel-movements
description: When an exercise has sections[], both the workload calc and the poster ignore top-level movements[] — a movement only there silently vanishes. Per-tier cardio buy-ins are normalized to buy_in sections deterministically in the post-processor (the AI can't place them reliably).
metadata:
  type: project
---

When `exercise.sections` is non-empty, downstream consumers read ONLY `section.movements` and completely ignore top-level `exercise.movements[]`:

- `workloadCalculation.ts` (~line 400): `movementEntries = sections?.length ? sections.flatMap(s => s.movements) : exercise.movements` — a movement present only in `movements[]` never enters the breakdown (its reps/distance/calories = 0 in totals).
- `helpers.ts` `buildMultiSectionForTimeSections`: iterates `exercise.sections` and renders only each `section.movements`.

**How this surfaced (2026-07-20):** a descending rounds ladder "300m run, then N rounds of [block]" at tiers 3/2/1. The AI put the per-tier run ONLY in top-level `movements[]` → run vanished from totals AND poster.

**Why a PROMPT fix for the run failed (reverted twice):** the AI is non-deterministic about a per-tier cardio buy-in — across runs it either FOLDS the run in as the first movement of every rounds section (over-counts it per round → 3+2+1=6 runs) or leaves it in top-level `movements[]` only (dropped, since sections shadow top-level). A prompt rule couldn't pin it; one live board gave folded 2/2, another gave top-level.

**RESOLVED (2026-07-21) deterministically in the post-processor:** `normalizePerTierBuyIns` in `workoutPostProcessor.ts` (runs at parse/save, before `backfillMovementSemantics`). For a for_time exercise with >=2 'rounds' sections and no existing buy_in/cash_out section, it detects a CARDIO-METRIC lead-in (distance or calories, no reps) that is either the shared first movement of EVERY rounds section (folded) or a top-level movement absent from all sections (top-level-only), and rebuilds sections as interleaved `buy_in`(lead) + `rounds` — one buy_in per tier (clean movement name; sectionType carries the once-semantics via workloadCalculation's `forceOnce`). Verified: both shapes → Run 900m (once per tier), KB 120. General (any distance/cal buy-in, any tier/section count); guarded so reps-based per-round work and single-tier RFTs are untouched. This is structural normalization, not overriding AI judgment.

Also fixed (helpers.ts `buildMultiSectionForTimeSections`, 2026-07-21): a `rounds:1` tier now gets its "1 ROUND" title + totals — but ONLY when a sibling tier has rounds>1 (`hasMultiRoundTier`), so an all-single-round pyramid/partner piece keeps its clean untitled inline lines (regression caught by real-partner-endurance-pyramid / real-partner-emom fixtures). And `buildPageArtifactSections` strength blueprint sums section rounds for a sequential complex (4+4 → "8 sets", not "4"). NOTE the "A · " letter prefix on section titles was already removed in prior WIP — titles are clean "3 ROUNDS"/"BUY-IN".

**Debugging tell:** if a movement shows on preview but is missing from the poster/totals, check whether it lives only in top-level `movements[]` while `sections[]` exists.

Related: [[repair_undercounted_buy_in_cash_out]].
