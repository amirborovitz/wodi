at# Wodi — Logging Flow UX/UI Spec
> For the coding agent. This is design and UX direction only — logic and data handling are already implemented.

---

## Core Philosophy

The logging flow has one job: get the user to "Done" as fast as possible, with at least one number that makes the share card feel earned. Never make the user feel like they logged it wrong. Every path ends in a share moment.

---

## General UI Rules (All Modes)

- **No monospace fonts anywhere in the logging flow.** Use the app's standard typeface. Monospace reads like raw data output — it kills the social/fun feel.
- **Block header** always shows: block name (large, bold) + type label (STRENGTH / AMRAP / EMOM / FOR TIME) in a small colored pill matching the block's accent color.
- **Workout description text** sits below the header in a muted, regular-weight font — smaller than the block title. It's context, not the hero.
- **Bottom sheet presentation** for all logging interactions. Slides up over the previous screen. Always has a drag handle at the top.
- **Primary CTA** is always full-width at the bottom of the sheet: **"Done →"**. Secondary actions (Skip, Next) are smaller and flanking it.
- **"Save (X/Y logged)"** language must go. Replace with **"Done for today →"** or simply **"Finish"**. Progress indicators are fine but should feel motivational, not administrative.
- **Accent colors per block type:**
  - Strength → Yellow/gold `#F5C518`
  - For Time → Pink/magenta `#E040FB`
  - AMRAP → Pink/magenta `#E040FB`
  - EMOM / Interval → Cyan `#00E5FF`
  - Cardio → Orange `#FF6D00`

---

## Substitution UI

Substitutions are already handled in logic. This is purely how they appear.

### When a substitution is available for a movement:
- Show the movement name normally.
- Directly below it, show a small pill/chip: **"↔ Sub available"** in a muted color (not accent — it shouldn't compete).
- Tapping the pill expands inline (no new screen, no modal) to show the substituted movement name + a brief equivalence note if one exists (e.g. "= 1800m Echo Bike").
- Once a sub is selected, the pill changes to **"↔ [Sub name]"** in the accent color, indicating it's active.
- The input fields below immediately update to reflect the sub's unit/metric (e.g. calories instead of meters).
- A small "undo" link sits next to the active sub pill to revert to original.

### Visual hierarchy for a movement row with active sub:
```
Farmer Carry                          50m
↔  Echo Bike (active)                 ×
[ — ]  [ 0 ]  cal  [ + ]
```

The original movement name stays visible but dims. The sub name is the active one. This makes it clear what they're actually doing without hiding the original context.

---

## Per-Mode Logging UI

### 1. Strength (Sets × Reps × Weight)

**Layout:**
- Each exercise is its own card, stacked vertically and scrollable.
- Exercise name top-left, target reps top-right in muted text.
- Weight input is the hero: large `[ — ] [ 60 ] kg [ + ]` control, centered. 
- Stepper increments: 2.5kg default. Long-press for 5kg jumps.
- Reps field only appears if the target reps are variable or RPE-based. If fixed (e.g. "5 reps"), just show it as a label — don't make them re-enter it.
- Completed sets get a subtle left-border highlight in the block accent color (as seen in current design — keep this, it works).
- Bodyweight movements (pull-ups, push-ups) show a **"Bodyweight ✓"** state instead of a weight input — tapping it marks it done.

**Tier 2 moment (post-block, before moving on):**
After tapping Done on a strength block, show a brief full-width flash card (stays on screen ~1.5s or until dismissed):
```
┌─────────────────────────────┐
│  💪  Bench Press            │
│  60kg  ·  5 sets  ·  1.5t  │
│  ★ New volume PR!           │  ← only if true
└─────────────────────────────┘
```
This is the reward moment. Make it feel good. Then proceed to next block.

---

### 2. AMRAP (Rounds + Reps)

**Layout:**
- Top of sheet: block name + "X min AMRAP" in large text.
- Single large round counter in the center: big number, `[ — ]` and `[ + ]` on either side. This is the hero input.
- Below it, smaller: "+ partial reps" — a secondary smaller input for the final incomplete round (e.g. "3 reps into round 9"). Default hidden, revealed by tapping "+ add partials".
- Movement list shows below as reference only (not input fields) — just so they remember what they were doing.

**Tier 2 moment:**
After Done, show flash card:
```
┌─────────────────────────────┐
│  🔥  15 Min AMRAP           │
│  8 rounds + 3 reps          │
└─────────────────────────────┘
```

---

### 3. For Time

**Layout:**
- Top: block name + "For Time" pill.
- Single large time input: `MM:SS` format, centered, large. Tap to edit with a numeric pad — not a clock picker.
- Below it: optional "DNF" toggle for did-not-finish. Toggling it greys out the time input and marks the block as attempted.
- Movement list below as reference only.

**Tier 2 moment:**
```
┌─────────────────────────────┐
│  ⏱  For Time                │
│  12:43                      │
│  ↑ 23 sec faster than last  │  ← only if history exists
└─────────────────────────────┘
```

---

### 4. EMOM / Interval

This is the trickiest mode — the key UX insight is: **don't ask them to log every interval.** That's not how people experience EMOMs.

**Layout:**
- Top: block name + "X rounds · Y sec on / Z sec off" in a readable sentence format (not raw numbers). Example: **"6 rounds · 45 sec work, 15 sec rest"**
- Movement list shows all stations clearly, numbered (1. Plate to Overhead, 2. Step Ups, etc.) — read-only reference.
- Below the list: **one optional input section** titled "Add a number (optional)" — collapsed by default, expandable.
  - Shows only the movements where a number makes sense (weight, cals, distance) — not plank holds, not bodyweight moves.
  - Each eligible movement gets a single compact input: movement name + value + unit. One row each.
  - If they don't expand this section, that's fine. The block is still logged.

**Tier 2 moment:**
```
┌─────────────────────────────┐
│  ⚡  6-Round EMOM           │
│  5 movements · 45 sec each  │
│  Echo Bike: ~42 cal/round   │  ← only if they entered it
└─────────────────────────────┘
```
If no numbers were entered, the flash card still shows — just without the stat line. They still did it.

---

## The "I Just Did This" Fast Path

For any block, there must always be a visible **"Mark as done (no details)"** option — small text link, below the main inputs. Tapping it logs the block as completed with no data. No friction, no shame. It still counts toward EP and Show Up rings.

This is critical for partner WODs, chaotic boxes, and the EMOM scenario above.

---

## Post-Workout Transition

After all blocks are logged (or skipped), instead of going straight to the summary:

Show a **"That's a wrap"** moment — a brief full-screen or near-full-screen card:
- Total EP earned (large, animated count-up)
- One-line workout summary: "Cycle 2 · Strength + EMOM · 45 min"
- Two CTAs: **"Share it →"** (primary, full width) and **"See full summary"** (secondary, smaller below)

The share card should be the default next action, not an afterthought buried in the summary screen.

---

## Pre-Logged State (Before User Taps Anything)

This is the state when the workout is shown but nothing has been logged yet. It must feel energized and ready — not empty or wireframe-like.

**Remove the "Tap exercises to log results" helper box entirely.** Do not replace it with any other instruction box or tooltip in that position. That space belongs to the primary CTA button, which must always be visible and always be a real button — never a greyed-out placeholder or passive instruction.

**Make the blocks themselves communicate tappability:**
- Every block card should have its colored left-border treatment from day one — even before logging starts. The border is a block identity element, not a completion indicator.
- Add a subtle `›` chevron on the right side of each block row to signal it's interactive.
- The block card should have a very slight background fill (e.g. `rgba(255,255,255,0.04)`) so it reads as a pressable surface, not floating text.

**If a first-time onboarding hint is needed**, do it as a one-time animated arrow pointing at the first block — plays once on first-ever use, never again. No text. No box. Never shown to returning users.

**The bottom CTA in pre-logged state:**
- Always show "Done for today →" at the bottom, even before anything is logged.
- In the pre-logged state it can appear at reduced opacity (not fully greyed out — still looks tappable) with a subtle "0/2 logged" progress label above it.
- This ensures the bottom of the screen is never empty and the user always has a clear exit path.

**Dashed-border buttons ("+ 2 moves", "Add time") must be replaced.** Dashed borders read as wireframe placeholders — they signal UI that isn't finished. Replace with solid outlined pills using the block's accent color at low opacity for the border, full opacity for the text and icon. These should look like real interactive elements that are waiting to be tapped, not empty slots waiting to be filled.

---

## Visual Language Reminders

- No monospace fonts.
- No floppy disk icons on CTAs ("Save" iconography belongs in 2005 software).
- Keep the colored left-border block cards — they're working well on the summary screen and should be consistent in logging too.
- Inputs should feel large and tappable — minimum 48px touch targets on all stepper buttons.
- The Done button should always be reachable without scrolling if possible — sticky at the bottom of the sheet.
