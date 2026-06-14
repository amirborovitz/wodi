# WodBoard — Agent Map

WodBoard (codename **Wodi**) is a premium CrossFit workout logging app.  
**Stack:** React 19 + TypeScript + Vite · Firebase (Auth/Firestore/Storage) · Framer Motion · CSS Modules · OpenAI Vision API  
**No Tailwind.** Styles live in `.module.css` files; tokens in `src/styles/variables.css`.

---

## Agent Operating Norms

- **Read the design system PDF** (`wodi · Design System.pdf`, project root) before any visual, layout, or component-design decision — not just the markdown summary.
- **The user builds, deploys, and tests on production themselves.** Do not run `npm run build`, `npm run dev`, `firebase deploy`, or start dev servers unless explicitly asked. Do not block completion on "verify in browser" — finish the code change and let the user test it live.

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

### 2 — One path per concern

Before adding a second code path, delete the first one or unify them.

- One artifact builder, not two (`buildRewardArtifactSections` + `buildPageArtifactSection`)
- One sticker system, not four (`posterStickerRow`, `complexStickerAnchor`, `cPageStickerAnchor`, `carouselStickerWrapper`)
- One layout per workout format, not five (standard / ladder / complex / multi-part / chipper)

If you feel the need to add a parallel path, stop and refactor the existing one instead.

### 3 — No dead code

When you replace a code path, **delete the old one**. Do not:
- Leave fallback branches that are never reached
- Keep commented-out alternatives
- Add a cascade CSS override that fights an earlier rule — update the base rule

Every function, hook, CSS class, and type must be actively used. If you cannot find a caller, delete it.

### 4 — CSS: one rule wins, clearly

Never write two rules for the same selector fighting each other via cascade order.  
If you need to change a value, find the existing rule and change it there.  
No `!important` — if you need it, the specificity structure is wrong; fix that instead.

### 5 — Explicit TypeScript

- No `any`. Use `unknown` + type guard if the shape is truly unknown.
- Explicit return types on all hooks and non-trivial functions.
- Colocate types with the code that uses them. `src/types/index.ts` is for shared domain types only.
- Prefer `interface` for objects, `type` for unions and aliases.

### 6 — Modern React patterns

- `useMemo` / `useCallback` for expensive derived values and stable callbacks — not for every line.
- Prefer extracting a custom hook over putting 10+ `useMemo` calls inside a component.
- State colocation: keep state as close to where it's used as possible.
- Avoid `useEffect` for derived state — compute it during render or in a memo.

### Celebration Screen Architecture (the current refactor target)

`WorkoutScreen.tsx` is being refactored from a ~5 000-line monolith into:

```
useCelebrationData(mode, rewardData?, workout?)
  → CelebrationData { heroResult, artifactSections, stickers, carouselPages, footerStats }

WorkoutScreen
  ├── useCelebrationData()           ← all computation here
  ├── <CelebrationPoster data={…} /> ← vintage paper view (Face A)
  └── <CelebrationBreakdown data={…}/> ← dark glass view (Face B, upcoming)
```

The two views share one data source. The athlete taps the card to flip between them.  
**Do not add new computation inside WorkoutScreen's render.** Put it in the hook.

---

---

## What the app does

1. User photographs a gym whiteboard → AI parses it into a structured workout
2. User logs their results (weights, reps, time, rounds) in a story-style flow
3. App saves to Firestore and shows a **celebration screen** (the "recap artifact")
4. Recap is designed to be screenshot-shared — it's a social object, not a data table

---

## Screen Flow

```
login → onboarding (first time only)
     → home  ←→  add-workout → reward
              ↕
           history → workout-detail
              ↕
           profile → pr / settings / goals-settings / profile-settings
```

Navigation is `currentScreen` state in `App.tsx` — no React Router.

**Bottom nav** shows on: `home`, `history`, `profile` (and `stats`, `settings`).

### Key screens

| Screen | File | Notes |
|--------|------|-------|
| Home | `HomeScreen.tsx` | Capture banner → bottom sheet → camera/upload/load-from-recent |
| Add Workout | `AddWorkoutScreen.tsx` | ~3800 lines. Steps: `capture → processing → preview → log-results → saving → reward` |
| Workout | `WorkoutScreen.tsx` | Unified `mode="reward"` (post-log) + `mode="detail"` (history). Same visual artifact — NEVER split them with `isReward` layout gates |
| History | `HistoryScreen.tsx` | Monthly-grouped feed via `WorkoutHistoryFeed` |
| Profile | `ProfileScreen.tsx` | Week/month/all stats, hall-of-fame PRs, avatar |

---

## Directory Structure

```
src/
├── App.tsx                        # Screen router + top-level state
├── types/index.ts                 # All TS types (~700 lines)
├── styles/variables.css           # CSS custom properties / theme tokens
├── context/AuthContext.tsx        # Auth + user CRUD + localStorage cache
├── data/exerciseDefinitions.ts    # Exercise DB with aliases & alternatives
│
├── screens/
│   ├── HomeScreen.tsx             # Dashboard: capture banner + collection wall
│   ├── AddWorkoutScreen.tsx       # Full workout creation flow
│   ├── WorkoutScreen.tsx          # Reward + detail unified
│   ├── HistoryScreen.tsx          # Workout feed
│   ├── ProfileScreen.tsx          # Stats dashboard
│   ├── PRScreen.tsx               # PR gallery + manual add
│   ├── SettingsScreen.tsx
│   ├── LoginScreen.tsx            # Google OAuth only
│   └── OnboardingScreen.tsx
│
├── components/
│   ├── ui/                        # Design atoms: Button, Card, GlassCard, Input,
│   │                              #   ConfirmDialog, BottomNav, FloatingDock,
│   │                              #   LiquidOrbButton, MicroChip
│   ├── home/                      # ConcentricRings, TodaysWodCard, WorkoutHero, StatsTile
│   ├── logging/story/             # Story logging system (see below)
│   ├── reward/                    # HeroCard, RingsDisplay, ProgressRing,
│   │                              #   WorkloadBreakdown, WorkoutDetails, WorkoutSummary,
│   │                              #   MovementEditSheet
│   ├── share/                     # ShareLaunchSheet, StickerCard (html2canvas)
│   ├── history/                   # WorkoutHistoryFeed, WorkoutHistoryDeck, WorkoutFeedCard
│   ├── stats/                     # PowerCell, PowerCellDashboard
│   ├── settings/                  # ProfileSettingsScreen, GoalsSettingsScreen, SettingsList
│   ├── workout/                   # ExerciseStoryCard, LadderHeatmap
│   └── workouts/                  # InlineMovementEditor, WorkoutCard
│
├── hooks/
│   ├── useWorkouts.ts             # Fetch + calc stats + delete
│   ├── useRewardData.ts           # Rings + achievements + workload breakdown
│   ├── useWeeklyStats.ts          # Weekly aggregates for rings
│   ├── useCountUp.ts              # Number animation (reward screen)
│   ├── usePRs.ts                  # PR list with details
│   └── usePRCount.ts             # Total PR count
│
├── services/
│   ├── firebase.ts                # SDK init (auth, db, storage)
│   ├── openai.ts                  # Vision API image → ParsedWorkout
│   ├── workoutPostProcessor.ts    # Normalize names, fix formats, backfill loggingModes
│   ├── workloadCalculation.ts     # Aggregate movements, Trinity colors, totals
│   ├── achievementDetection.ts    # PRs, benchmarks, milestones
│   ├── exerciseClassification.ts  # AI metric type classification
│   ├── loggingPatternLearning.ts  # Smart logging mode detection
│   ├── muscleGroups.ts            # Movement → muscle group mapping
│   └── rewardCalculations.ts     # Ring metrics (intensity/volume/consistency)
│
└── utils/
    ├── xpCalculations.ts          # EP system + calculateWorkoutEP()
    └── shareUtils.ts              # html2canvas → blob → share/download/clipboard
```

---

## Story Logging System (`components/logging/story/`)

The logging flow after the AI parses a workout. Each exercise goes through:

| File | Role |
|------|------|
| `WodStoryScreen.tsx` | Main orchestrator — one exercise at a time |
| `InputRouter.tsx` | Routes to right input component based on `ExerciseKind` + `loggingMode` |
| `ScoreMovementInputs.tsx` | Per-movement inputs (weight, reps, distance, calories) |
| `ScoreInputs.tsx` | Top-level score inputs (time, rounds, load) |
| `StepperInput.tsx` | Generic numeric stepper (`+` / `-` buttons) |
| `ProgressiveWeightRow.tsx` | Row for progressive weight sets |
| `EditExerciseSheet.tsx` | Bottom sheet to edit a logged exercise |
| `SubstitutionSheet.tsx` | Pick an alternative movement |
| `CustomNumpadSheet.tsx` | Custom number pad for input entry |
| `StoryLogResults.tsx` | Bridge component to old `ExerciseResult` format |
| `types.ts` | `ExerciseKind`, `LoadMode`, `StoryExerciseResult` interfaces |

---

## Core Data Types

```typescript
Workout          id, userId, date, title, type, format, exercises[], scores,
                 duration, timeCap (seconds), workloadBreakdown, rawText

Exercise         id, name, type, prescription, sets[], rxWeights, movements[]

ExerciseSet      setNumber, weight, actualReps, time, distance, calories, completed

ParsedWorkout    title, type, format, scoreType, exercises[], timeCap,
                 containerRounds, benchmarkName

ParsedExercise   name, type, loggingMode, prescription, suggestedSets/Reps/Weight,
                 movements[], sections (buy_in | rounds | cash_out)

ParsedMovement   name, reps, distance, calories, rxWeights, rxCalories,
                 inputType, alternative

WorkloadBreakdown  movements[], grandTotalReps/Volume/Distance/Calories

MovementTotal    name, totalReps, totalDistance, weight, weightProgression[], color

RewardData       rings[], heroAchievement, achievements[], workoutSummary,
                 exercises, workloadBreakdown

RingMetric       id (intensity|volume|consistency), label, value, percentage, color

PersonalRecord   id, userId, movement, weight, date, workoutId

User             id, email, displayName, photoUrl, stats, goals,
                 birthYear, weight, sex, onboardingComplete, photoUpdatedAt
```

---

## WorkoutFormat + ScoreType

```typescript
WorkoutFormat = 'for_time' | 'intervals' | 'amrap' | 'amrap_intervals'
              | 'emom' | 'strength' | 'tabata'

ScoreType     = 'time' | 'time_per_set' | 'rounds_reps' | 'load' | 'reps' | 'pass_fail'

ExerciseLoggingMode = 'strength' | 'for_time' | 'amrap' | 'amrap_intervals'
                    | 'intervals' | 'emom' | 'cardio' | 'cardio_distance'
                    | 'bodyweight' | 'sets'
```

---

## Core Flows

### 1. Capture → Log → Celebrate
```
HomeScreen captureBanner tap
  → bottom sheet (Take Photo / Upload Image / Load from Recent*)
  → AddWorkoutScreen step="capture"
  → step="processing" — OpenAI Vision API → ParsedWorkout
  → workoutPostProcessor.ts (normalize, backfill loggingModes)
  → step="preview" — user reviews parsed workout
  → step="log-results" — WodStoryScreen per exercise
  → step="saving" — buildWorkloadBreakdown, calculateWorkoutEP, Firestore addDoc
  → step="reward" — WorkoutScreen mode="reward"
```
*Load from Recent is admin-only (`aborovitz@gmail.com`).

### 2. History → Detail
```
HistoryScreen → WorkoutHistoryFeed → WorkoutFeedCard tap
  → WorkoutScreen mode="detail"
```

### 3. Auth
```
Google OAuth → Firebase Auth → Firestore users/{uid} doc
  → localStorage cache → onboarding check (onboardingComplete === false)
```

---

## AI Parser — Trust Rules

**The AI (GPT-4o Vision) is the authority.** Post-processor and UI only backfill missing fields, never override.

- `loggingMode` per exercise: AI returns it → post-processor backfills if missing → regex as last fallback
- `suggestedSets`, `suggestedReps`, `format`, `timeCap`: trust AI value; regex only if field is empty/null/zero
- Pattern: `if (!aiProvidedValue) { /* regex fallback */ }`

### AI prompt output shape (key fields)
```json
{
  "title": "...", "format": "amrap", "scoreType": "rounds_reps",
  "timeCap": 1200,
  "exercises": [{
    "name": "Cindy", "loggingMode": "amrap",
    "movements": [{ "name": "Pull-up", "reps": 5, "rxWeights": {...} }]
  }]
}
```

---

## EP (Effort Points) System

Replaces XP. Stored on workout as `ep`.

```
EP = base(10) + time(3/min) + volume(0.5 per vol/bw) + distance(0.01/m) + PR bonus(25)
```

- `calculateWorkoutEP()` in `src/utils/xpCalculations.ts`
- `getTimeCapMinutes(workout)` uses persisted `timeCap` or falls back to `duration`
- Weighted carries: `EP_CARRY_MULTIPLIER = 2.5`
- Distance: `EP_DISTANCE_RATE = 0.01/m`

---

## Design System (Wodi v1.0) — April 2026

**Full spec (PDF):** `wodi · Design System.pdf` (project root) — read this before making any visual or layout decisions.  
**Markdown summary:** `memory/wodi-design-system.md`. Summary below.

### Colors

| Token | Hex | Role |
|-------|-----|------|
| `--wodi-bg` | `#0c0d0f` | App background |
| `--wodi-card` | `#141618` | Card surface |
| `--wodi-card2` | `#1a1c1f` | Elevated surface |
| `--wodi-yellow` | `#f5c200` | **Single accent** — PRs, CTAs, hero numbers, all stats |
| `--wodi-white` | `#f2f0eb` | Primary text (warm white) |
| `--wodi-dim` | `rgba(242,240,235,0.38)` | Labels / eyebrows |
| `--wodi-line2` | `rgba(242,240,235,0.12)` | Card borders |

**Critical:** Yellow `#f5c200` is the ONLY accent. No cyan, no magenta as accents.

### Typography

| Role | Font | Size | Weight |
|------|------|------|--------|
| WOD name / hero numbers | **Barlow Condensed** | 90px / 42–48px | 900 |
| PR sticker value | Barlow Condensed | 28px | 900 |
| Button labels | Barlow | 17px | 900 |
| Eyebrows / labels | Barlow | 10–11px | 800 |

CSS variables: `--font-display: 'Barlow Condensed'` · `--font-barlow: 'Barlow'`

### PR Stickers

- **Always yellow background** (`--wodi-yellow`) — never magenta
- Text color: `#0c0d0f` (dark on yellow)
- Rotation: ±2–6° unique per sticker
- Max 3 per WOD; depth stack: opacity 1.0 → 0.9 → 0.8

### Stat Footer

- All values: `--wodi-yellow`, Barlow Condensed 900
- Labels: `--wodi-dim`, 10px, UPPERCASE, 0.20em tracking

### Spacing

4px grid · Screen edge: 20px · Card padding: 16–20px

### DO / DON'T

DO: `#f5c200` for all wins/PRs/stats, Barlow Condensed for numbers, dark `#0c0d0f` background, warm white `#f2f0eb` text, ±2–6° sticker rotation

DON'T: Cyan/blue accents, magenta accents, Inter/JetBrains Mono for hero display (use Barlow Condensed), text gradients, `#000` pure black backgrounds, `#fff` pure white text, >3 stickers

---

## Recap Screen (WorkoutScreen) Rules

The recap is a **social artifact** — optimized for pride and shareability, not analytics.

**Hero result priority:**
1. PR achieved → `185 KG PR`
2. AMRAP → `6 ROUNDS`
3. For Time → `18:42`
4. Strength → `185 KG`
5. Volume > 1t → `2.12 TONS`
6. EP fallback → `+109 EP`
7. Duration → `42 MIN`

**Workout Story — mandatory section:**
The celebration poster MUST show the full workout breakdown below the hero score. Three layers in order:
1. **Prescription** — how the exercises were structured (movements, reps/weight scheme, time cap). An outside viewer must understand the workout without context.
2. **What I did** — the user's actual weights, times, rounds per exercise.
3. **Totals** — volume (tons/reps), distance, calories.

The `posterStructureLayer` renders this via `artifactSections` (or `renderLadderArtifact` for ladders). It must NOT be hidden inside `.posterFrame`. If it's hidden, the screen fails its core purpose.

**Critical:** `isReward` above `return()` is fine (data normalization). `isReward` below `return()` as a layout gate is **forbidden** — both modes are the same visual artifact. See `feedback_workout_screen_unified_layout.md`.

---

## Firestore Collections

| Collection | Key fields |
|------------|-----------|
| `users` | profile, stats, goals, onboardingComplete |
| `workouts` | userId, exercises[], scores, workloadBreakdown, rawText, timeCap, format, ep |
| `personalRecords` | userId, movement, weight, date, workoutId |

---

## Rx Prefill System

- `user.sex` (`male`/`female`/`other`) on User profile
- `rxCalories` on `ParsedMovement` — male/female calorie Rx for cardio machines
- `createBlankResult()` in `story/types.ts` accepts `userSex` and prefills weight + calories
- Cardio machines (Echo Bike, Row, etc.) use `calories` or `distance` — **never `reps`**

---

## Partner Workouts

`partnerFactor = 1 / teamSize` — applied only to AI-prescribed values (team totals).  
User-entered values (personal numbers) never get `partnerFactor` applied.

---

## PR Rules

PRs are tracked only for:
- Weightlifting movements (Back Squat, Clean, Snatch, etc.)
- Named CrossFit benchmarks (Fran, Helen, Murph, etc.)

Weighted accessory movements (step-ups, lunges, runs with weight) are **not** PR-worthy.

---

## Admin

`ADMIN_EMAIL = 'aborovitz@gmail.com'`  
Used in `HomeScreen.tsx` and `AddWorkoutScreen.tsx` to gate "Load from Recent" feature.

---

## Known Issues / Open Design Debt

- **Stepper scroll tap** (`StepperInput.tsx`): scrolling on mobile accidentally triggers `+`/`-` buttons. Needs scroll-safe interaction redesign.
- `ScoreMovementInputs.tsx` `renderMovField`: `kind='reps'` renders `RepsField` **only** when `mov.reps == null && mov.distance == null && mov.calories == null` (pure MAX movements). Never drop any of the three null checks.
- Debug logs tagged `[BuildWorkload]` still in `workloadCalculation.ts` — safe to remove.

---

## Dependencies

```
firebase ^12.7      openai ^6.15        react ^19.2
framer-motion ^12.23   html2canvas ^1.4   uuid ^13
```
