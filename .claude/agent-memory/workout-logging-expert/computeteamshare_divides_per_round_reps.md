---
name: computeteamshare-divides-per-round-reps
description: computeTeamShare in posterData.ts divides a movement row's primary by teamSize assuming it's a team TOTAL, but primary is the per-round per-athlete count — partner RFT rows show halved reps (e.g. "5" → "3")
metadata:
  type: project
---

On a partner (teamSize=2) for_time / IGUG poster, each movement row's yellow chip shows the per-round reps **divided by teamSize and rounded** instead of the actual per-round reps.

Observed: "12 RFT (6 each), in pairs, I go you go" — rows "5 Touch+Clean+Jerk" and "5 Burpee" both rendered a yellow "3" chip. 3 = `Math.round(5 / 2)`.

**Chain (single-card path, `buildRewardArtifactSections`):**
1. `buildCelebrationMovementRow` (helpers.ts ~990) sets `primary = "5"` (perRoundReps = prescribed.reps, the reps each athlete does per round).
2. `artifactRowToPosterLine` (posterData.ts ~482) for teamSize>1 sets `team = computeTeamShare(row.primary, teamSize)`.
3. `computeTeamShare` (posterData.ts ~369) matches the bare-number branch `^(\d+)$` and returns `Math.round(5/2) = 3`.
4. Skin renders `parts.team` as the prominent yellow chip (SkinSlab.tsx ~104), with `parts.me` ("45kg") dimmed below.

**Why it's a bug:** `computeTeamShare`'s docstring says it splits an *AI-prescribed team TOTAL* (e.g. "100" reps shared → "50" each). But `row.primary` from `buildCelebrationMovementRow` is already the **per-round, per-athlete** count (prescribed.reps is what one person does each round). Dividing it by teamSize double-discounts. The partner math (each partner does 6 of 12 rounds) belongs in the ROUND count, not the per-round rep count. The reps per round (5) are the same whether solo or partnered.

**Note the two-path divergence:** `buildPageArtifactSection` (multi-part/carousel path) computes `personalRepeatCount = round(repeatCount / teamSize)` and only multiplies it into *total* notes — it does NOT divide per-round primary. The single-card `buildRewardArtifactSections` path + `artifactRowToPosterLine`'s `computeTeamShare` is where the per-round value gets wrongly halved. These two poster-building paths handle partner reps inconsistently.

**Root cause:** `artifactRowToPosterLine` blindly treats `row.primary` as a shareable team total for any teamSize>1 row. It should only split primaries that represent a shared total (a relay distance/cal target one team splits), never a per-round per-athlete rep scheme. For standard IGUG "5 reps each per round, alternating" workouts, the per-round reps must render as-is (5), not 5/2.

Not yet fixed — read-only investigation 2026-06-24.
