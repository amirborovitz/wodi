# WodBoard — Agent Map

WodBoard (codename **Wodi**) is a premium CrossFit workout logging app.
**Stack:** React 19 + TypeScript + Vite · Firebase (Auth/Firestore/Storage) · Framer Motion · CSS Modules · OpenAI Vision API
**No Tailwind.** Styles live in `.module.css` files; tokens in `src/styles/variables.css`.

> Deep reference is intentionally NOT duplicated here — it lives where it can't drift:
> - **Types** → `src/types/index.ts` · **File map** → `memory/app-reference.md` (+ Glob)
> - **Design system** → `wodi · Design System.pdf` (authoritative) + `memory/wodi-design-system.md`
> - **Screen flow / architecture notes** → `MEMORY.md` (loaded each session)
> - **EP / stats / calc** → `src/utils/xpCalculations.ts`, `src/utils/statsAggregation.ts`, and their `*.test.ts` golden tests

---

## Agent Operating Norms

- **Read the design system PDF** (`wodi · Design System.pdf`, project root) before any visual, layout, or component-design decision — not just the markdown summary.
- **The user builds, deploys, and tests on production themselves.** Do not run `npm run build`, `npm run dev`, `firebase deploy`, or start dev servers unless explicitly asked. Do not block completion on "verify in browser" — finish the code change and let the user test it live.
- **Verification is cost-aware** — don't run `tsc -b` / `npm test` / `npm run posters` after every edit. Batch to once per completed unit; run only the relevant test file when narrow; skip for display-only changes (and say so); always run for calc/EP/workload/poster changes. See `memory/feedback_test_run_policy.md`.
- **Testing/verification agents may use the browser directly** (Claude in Chrome tools) against the tab the user already has open — navigate, click, read state, screenshot — instead of asking the user to walk through a flow. One exception: **if a step needs a WOD photo uploaded, ask the user to do it** from the tab you're working in, then continue.

---

## Code Architecture — Non-Negotiable Rules for Every Agent

These rules apply to **every file you touch**. No exceptions, no "I'll clean it up later."

### 1 — Hooks own logic, components render

All computation (data transformation, derived state, business logic) lives in hooks.
Components receive data and call handlers. They do not calculate, build data structures, or fetch.

```
✅ const data = useCelebrationData(workout, rewardData);
✅ return <CelebrationPoster data={data} />;

❌ const artifact = useMemo(() => buildRewardArtifactSections(...), [...]);  // inside component
```

The celebration screen is the canonical example: **all** computation is in `useCelebrationData` (→ `CelebrationData`), never in `WorkoutScreen`'s render. See `memory/celebration-screen-architecture.md`.

### 2 — One path per concern

Before adding a second code path, delete the first one or unify them. One artifact builder, not two; one sticker system, not four; one layout per workout format, not five. If you feel the need to add a parallel path, stop and refactor the existing one instead.

### 3 — No dead code

When you replace a code path, **delete the old one**. No unreachable fallback branches, no commented-out alternatives, no cascade CSS overrides that fight an earlier rule (update the base rule). Every function, hook, CSS class, and type must have a caller. If you can't find one, delete it.

### 4 — CSS: one rule wins, clearly

Never write two rules for the same selector fighting via cascade order. To change a value, find the existing rule and change it there. No `!important` — if you need it, the specificity structure is wrong; fix that.

### 5 — Explicit TypeScript

- No `any`. Use `unknown` + type guard if the shape is truly unknown.
- Explicit return types on all hooks and non-trivial functions.
- Colocate types with the code that uses them. `src/types/index.ts` is for shared domain types only.
- Prefer `interface` for objects, `type` for unions and aliases.
- Verify with `npx tsc -b` (not `--noEmit` — it misses `noUnusedLocals` under project references).

### 6 — Modern React patterns

- `useMemo` / `useCallback` for expensive derived values and stable callbacks — not for every line.
- Prefer extracting a custom hook over 10+ `useMemo` calls inside a component.
- Keep state as close to where it's used as possible.
- Avoid `useEffect` for derived state — compute it during render or in a memo.

---

## AI Parser — Trust Rules

**The AI (GPT-4o Vision) is the authority.** The post-processor and UI only **backfill missing fields**, never override what the AI returned. CrossFit has too many formats for heuristics to win.

- Pattern: `if (!aiProvidedValue) { /* regex fallback */ }` — never the reverse.
- Applies to `loggingMode` (per exercise), `suggestedSets`/`suggestedReps`, `format`, `timeCap`, `inputType`, etc.
- When the parser is wrong, **fix the prompt** (relax/generalize a rule), don't add a UI override. See `memory/feedback_trust_ai_over_regex.md`, `memory/feedback_ai_prompt_philosophy.md`.

---

## Recap Screen (WorkoutScreen) Rules

The recap is a **social artifact** — optimized for pride and shareability, not analytics. `mode="reward"` (post-log) and `mode="detail"` (history) are the **same visual artifact**.

- **`isReward` above `return()` is fine** (data normalization). **`isReward` below `return()` as a layout gate is forbidden.** See `memory/feedback_workout_screen_unified_layout.md`.
- **Workout Story is mandatory** — the poster must show, in order: (1) **Prescription** (structure, so an outside viewer understands the WOD), (2) **What I did** (actual weights/times/rounds), (3) **Totals**. Rendered via `artifactSections`; must not be hidden inside `.posterFrame`.
- **Poster truth standard**: show only coach-written + user-entered numbers; render derived totals only when confidently computed (omit when unsure, never guess). See `memory/feedback_poster_truth_standard.md`.
- Hero-result priority and per-format nuances live in `memory/project_hero_result_rules.md`. Poster snapshot harness: `npm run posters` (25 fixtures — extend when touching poster code; `posters:update` after an intentional change).

---

## Domain Rules (short — details in code/memory)

- **EP** is derived, never persisted. `computeWorkoutEP(workout)` (`xpCalculations.ts`) is the **single source of truth**; every consumer (recap, weekly, career) must use it or `statsAggregation.ts`. Golden tests pin the formula (`*.test.ts`).
- **Partner**: `partnerFactor = 1 / teamSize`, applied only to AI-prescribed (team-total) values — never to user-entered personal numbers. Full system in `memory/project_partner_split_architecture.md`.
- **PRs** only for weightlifting movements + named benchmarks. Weighted accessories (step-ups, lunges, weighted runs) are **not** PR-worthy.
- **Rx prefill**: `user.sex` drives `createBlankResult()` weight + `rxCalories` prefill. Cardio machines use `calories`/`distance`, **never `reps`**.
- **Admin**: `ADMIN_EMAIL = 'aborovitz@gmail.com'` gates "Load from Recent" (`HomeScreen`, `AddWorkoutScreen`).

---

## Known Interaction Bug

- **Stepper scroll tap** (`StepperInput.tsx`): scrolling the logging sheet on mobile accidentally triggers `+`/`-`. Needs a scroll-safe redesign. See `memory/feedback_stepper_scroll_accidental_tap.md`.
