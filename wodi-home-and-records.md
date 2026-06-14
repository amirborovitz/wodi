# Wodi — Home Page & Records Page Spec

## Context & Product Reframe

Wodi is positioned as a **workout poster studio**, not a tracker. The core loop is:
1. Log a workout fast
2. Generate a beautiful celebration poster
3. Share it

The Home page should reflect this identity. It is NOT a dashboard, NOT a stats summary, and NOT an Apple Fitness-style ring system. It is a **studio + gallery** — a place to start a new poster and to admire the ones you've made.

PRs deserve special treatment but should not crowd Home. They live as their own poster type *and* as a dedicated section inside the user's profile (Me).

---

## Part 1 — Home Page

### Layout (top to bottom)

**1. Greeting strip (top)**
- Left: small greeting — "Hi, [Name]" or "Good morning, [Name]" depending on time of day
- Right: tiny streak chip *if* there's something to celebrate (see rules below)
- Settings cog or profile icon top-right — minimal, non-prominent

**2. Primary action — "Log a workout"**
- Full-width prominent button or large card
- The hero element of the page
- Tappable surface, generous padding
- Calls into the existing logging wizard
- Subtle: a small caption beneath like "Make today's poster →" — reinforces the poster studio framing

**3. Monthly EP counter (small, optional)**
- A single line beneath the primary action: "+1,240 EP this month"
- Positive, no goal, no ring, no progress bar
- Just a number that grows over the month
- If the user is brand new with zero EP this month, omit this element entirely — don't show "0 EP" (that reads as failure)

**4. "Your posters" gallery (the main visual content)**
- Horizontal scrollable row of mini-poster thumbnails from the user's most recent 8-10 workouts
- Each thumbnail is a small (≈140-160px wide) rendering of the actual celebration screen — same template, same colors, same WOD name visible
- Tap any thumbnail to reopen the full celebration view for that workout
- Section header above: "Your posters" (small, muted)
- If the user has fewer than 3 posters, show a friendly empty/partial state — see empty states below

### Streak chip rules
- Only render if the user has logged 2+ workouts in the current week
- Format: "🔥 3 this week" or "🔥 5-day streak"
- Small chip, ghost outline style, fits in the top-right area near the profile icon
- Never red, never empty, never accusatory
- If there's nothing to celebrate, the chip simply doesn't render. Absence of celebration ≠ guilt.

### Empty / first-time states
- New user with 0 workouts: the poster gallery section shows a single oversized "starter card" that says "Your first poster is one workout away →" with the same tap target as the log button. No empty rings, no "0 workouts" messaging.
- User with 1-2 workouts: gallery shows what exists plus a final ghost card prompting the next one ("Add another →"). Don't force-fill with placeholders.

### What is explicitly NOT on Home
- Apple Fitness-style rings or progress circles
- Calorie display (see EP rule below)
- A list of past workouts (that's History)
- PRs (those live in Me → Records)
- Profile stats / lifetime numbers (those live in Me)
- Detailed analytics, charts, or graphs of any kind

### Bottom navigation
Three tabs:
- **Today** (home icon) — this page
- **History** — chronological list of past workouts
- **Me** — profile, lifetime stats, records, settings

Rename the existing "Dashboard" label to "Today" if not already done.

---

## Part 2 — EP and Calories

**Rule: EP never displays as calories anywhere in the app.**

- EP is the native Wodi unit. It is intentionally fuzzy and brand-owned.
- Do not show "≈ 380 cal" next to an EP value.
- Do not add a calorie estimate on the celebration screen, the home page, the history view, or the profile.
- Calories carry a scientific expectation Wodi cannot meet without HRM/biometric integration. Avoid the comparison entirely.

EP can be referenced as "points" or "EP" in microcopy — never as calories or kJ.

---

## Part 3 — Records Page (inside Me)

### Entry point
Inside the Me / Profile screen, replace or surface the existing "Records & PRs →" link as a clearly tappable row that opens the dedicated Records page.

### Records page layout
- Top: page title "Records" (large, uses the active template's display font)
- Below: a grid (2 columns on mobile) of PR cards
- Each PR card shows:
  - Movement name (e.g. "Deadlift", "Bench Press", "Fran")
  - Current best value (the weight, or the time for benchmark WODs)
  - Small date or month achieved (e.g. "May 2026")
  - A subtle yellow PR stamp/accent in the corner
- Tap a card to open a detail view showing the history of that movement (a list or sparkline of previous bests)

### What counts as a PR (tight scope)
- **Weight PR:** the heaviest single completed rep of a tracked strength movement (Deadlift, Bench Press, Squat variants, Clean, Snatch, Press, etc.). One PR per movement.
- **Time PR:** fastest completion of a named benchmark WOD (Fran, Helen, Murph, Grace, Diane, etc.). Match by WOD name.
- **That's it.** Do NOT track volume PRs, rep PRs, or per-set PRs for v1. Keeps "PR" meaningful.

### PR detection logic (already exists or to add)
- On workout save: compare each strength movement's heaviest single to the user's existing PR for that movement. If higher, mark as new PR.
- On named benchmark WOD: compare time to existing time PR. If faster, mark as new PR.
- A new PR triggers two things:
  1. A "PR poster" is generated automatically (see below)
  2. The Records page updates with the new best

### PR posters
- When a PR is set, the celebration screen for that block uses a special **PR template variant** — same data structure, but with prominent yellow PR stamp(s), "NEW PR" treatment on the heaviest hit, and possibly a brief comparison ("up from 85kg").
- The PR poster appears in the user's poster gallery on Home like any other workout poster.
- PR posters are re-shareable forever — they live in History indefinitely.

### Empty state for Records
- New user with no PRs yet: page shows "Your records will appear here after your first PR. Keep grinding."
- No fake placeholders, no example data.

---

## Part 4 — Behavioral & Visual Rules

### No guilt mechanics
- Never display a "you haven't worked out in X days" message anywhere
- Never show empty rings, red indicators, or progress-toward-goal warnings
- Never compare the user to past selves negatively ("down from last week")
- All metrics are presented in a celebratory or neutral tone, never accusatory

### Poster studio identity
- The word "poster" should appear in microcopy on Home and after logging (e.g. "Make today's poster", "Your posters", "Your new poster is ready")
- Reinforces the creative-output framing over the tracking framing
- This is a vocabulary choice that compounds over the user's mental model of the app

### Template system note
The template/skin system is being designed separately. This Home page spec assumes templates exist and that poster thumbnails on Home reflect each workout's chosen template. If templates aren't yet implemented, render thumbnails using the default celebration screen design.

---

## What NOT to Change in This Pass
- The logging wizard flow: unchanged
- The celebration screen design: unchanged
- The History page (if it exists already): unchanged for now
- The Me / profile page beyond adding/surfacing the Records entry: minimal changes only
- The intensity chip system: unchanged
- The bottom nav structure beyond the rename: unchanged

---

## Summary of New Surfaces
1. Redesigned Home page (Today): greeting + log CTA + monthly EP line + poster gallery + optional streak chip
2. Records page accessible from Me: grid of PR cards with detail views
3. PR poster template variant (auto-triggered when a new PR is detected)

---

## Strategic Reminder for the Implementer
Wodi is a workout poster studio. Every design decision on these pages should reinforce that identity over the tracker/dashboard identity. When in doubt: ask whether the choice makes the user feel like an artist making posters or like a user closing rings. Choose the artist framing every time.
