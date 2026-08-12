# Changelog

## v0.1.24 — A saved workout can be corrected

The release's through-line: **saving is no longer the last word.** A workout could already be
re-opened, but it could not really be *repaired*. The edit path rebuilt a thinner workout than the
one it loaded and wrote that back over the original. A personal record, once written, could never
come back down — the row was overwritten, so there was nothing to fall back to. And finishing an
edit replayed the whole celebration, as if a corrected weight were a session you just trained.

---

### Records keep one row per PR event

**New `services/personalRecordSync.ts`.** Every PR used to be written to `${userId}_${slug}`, one
document per movement, so each new record *destroyed* the previous one. A mis-logged 300 kg
deadlift was permanent: correcting it left nothing behind to restore, and deleting the workout left
the record standing with no session behind it.

A movement now keeps a row per PR event, and its record is simply the highest of them — which is
what `buildLiftRecords` in `useRecords` already computed, and why the history list under a record
works at all.

- **`personalRecordEventId(userId, movement, workoutId)`** — deterministic per workout, so
  re-saving the same session *replaces* its row instead of appending a duplicate. An edit is
  idempotent however many times it is repeated.
- **`syncRecordsForWorkout()`** writes what the workout yields *as it now stands* and deletes the
  rows it no longer earns. A correction that lowers a weight shrinks or removes this workout's
  rows, and the movement's record falls back to the next highest row on its own — no recomputation,
  no scan of workout history.
- **`dropRecordsForWorkout()`** runs on delete, and on flagging a workout as a test. The save-time
  test guard only ever stopped a test workout from *writing* PRs; a real workout flagged afterwards
  kept every record it had set, which is precisely the case the flag exists to prevent.
  **`reconcileRecordsForWorkout()`** puts them back on unflagging, so the flag is not a one-way
  trip for the athlete's records.
- Rows are found by their `workoutId` field rather than by rebuilding an id, so the repair reaches
  documents written under the old colliding scheme. Nothing needs migrating: an old doc simply
  becomes the oldest row in its movement's history.
- **Hand-entered records survive all of it.** A manual row (`personalRecordManualId`, no
  `workoutId`) belongs to no workout, so no workout-scoped repair can match it. `PRScreen` now
  deletes and edits *the row on screen by its own id* — rebuilding an id from the movement name
  only ever addressed one document per movement.

**`bestExistingRecord()` in `achievementDetection`** — with several rows per movement, the old
`.find()` matched whichever one Firestore happened to order first, frequently an old and lower one.
That announced "New PR!" for a load that beat nothing and printed a nonsense improvement against it.

**`useRewardData` gained `excludeWorkoutId`.** Re-saving measured a workout against the record it
already holds, so an unchanged PR read as "beat nothing" and the badge was written back off a
workout that genuinely set one. It also breaks the fallback: a corrected 300 → 250 measured against
its own stale 300 yields nothing, and the record collapses to some other session's 200 instead of
stopping at the 250 actually lifted.

**`usePRCount` counts movements, not rows** — a lift beaten three times is three documents, and
`snapshot.size` reported the athlete as holding three records in it.

### Firestore: `personalRecords` scoped to its owner

`allow read, write: if request.auth != null` let any signed-in athlete read or overwrite anyone's
records. Now owner-scoped like `/workouts`, with `create` checking the incoming `userId`.

### The saved doc *is* the parse

**New `utils/workoutToParsed.ts`** replaces the reconstruction that lived inline in
`AddWorkoutScreen`, which rebuilt a `ParsedWorkout` out of `type` plus `sets[]` plus the workload
breakdown. Sections, complexes, part names, per-exercise partner flags, the coach's time cap, the
stored format and `rawText` are all *on the saved doc already*; rebuilding around them threw them
away — and since an edit rewrites `exercises[]` wholesale, losing them in the wizard destroyed them
in Firestore. The cap is read from `timeCap`, never from the logged duration; the format is kept
rather than collapsed back to the workout type.

**The container fields now persist and reload.** `containerRounds`, `sets` and `intervalTime` are
written on save and read back on load. Nothing displays them — without them, an edit-save's
duration recompute loses the programmed interval term and an EMOM's duration collapses.

**Prefill mirrors the first log exactly.** The edit's blank results are built with the same
`teamSize` and sole-exercise flag as the session that logged them, and per-movement restore is
scoped to the part through `movementsForParts` / `findMovementTotal` — an unscoped lookup handed a
three-part session every part's movements and let a sibling's load overwrite this one's.

`useWorkouts` also reads `stationRotation`, `partnerNames`, `userContext` and `feelRating` through,
so they survive the round trip instead of being dropped on the way back in.

### An edit is a repair, not a celebration

- **No overview.** The overview asks "which part did you train first?" — a question with no meaning
  on a workout where every part is already logged. An edit runs the parts in board order, and
  backing out of the first one leaves the edit.
- **The exits say what they do.** The final CTA is "Save changes →", not "Done for today" (the
  training happened days ago), and the discard popup reads "Discard your changes? The workout stays
  as it was" — "discard this workout" on an already-saved workout reads as deleting it.
- **No EP flash, no confetti, no bounce to Home.** `onWorkoutUpdated` hands the updated doc back to
  `App` and returns the athlete to the poster they opened, re-rendered without a refetch.
- **A repair doesn't vote twice.** Logging-mode corrections feed the learning system on the first
  log only; re-casting them once per edit would let one workout stuff the ballot for a pattern it
  saw once.

### Poster: the "⋯" menu

**New `ui/ActionMenuSheet`** — a bottom sheet of choices, kept separate from `DeleteActionSheet`
(which is a destructive *confirm* built around one irreversible action). "Edit workout" and the
quiet "AI got it wrong?" now live behind an overflow button in the poster's top-right. The bottom
tab row stays what it always was — Style / Felt / Date / Text, the poster's *look* — while the menu
holds the two things that say *this log is wrong*: one the athlete can fix, one they can only report.

`tsc -b` clean, 367/367 tests (new `workoutToParsed` suite; record-history cases added to
`achievementDetection`), 38/38 poster fixtures unchanged.

---

## v0.1.23 — Every load its own number, every part its own row

The release's through-line: **a session is not one bucket.** A strength circuit is several lifts at
several weights, not one weight repeated. A lift trained in the complex *and* in the metcon is two
rows at two loads, not one row holding the sum. And a movement swapped for a machine is measured in
the machine's unit, not in the reps the board wrote for the movement it replaced.

---

### Strength circuits ask for every weight

**New `resolveLoadBlocks()` in `logging/story/loadGroups.ts`** — one entry per weight the athlete
actually has to state. Two movements share a single input only when the AI flagged the exercise
`complex`: one implement picked up and carried through consecutive lifts without setting it down,
where there is physically one load. Everything else is a station at its own intensity — "4 sets:
5 shoulder press / 10/10 DB row / 8/8 single-leg deadlift" is three lifts, and sharing an equipment
*class* is not sharing a weight (the row rides at 22.5, the single-leg deadlift at 20). Inferring
one number from a shared `db` bucket is what stamped a single load across a whole circuit.

Metcon weights are untouched: they still group by implement in play through `resolveLoadGroups`,
because inside one metcon round a single pair of DBs really does serve every DB movement.

The `sectionIndex` axis splits first, so sequential blocks ("4 sets Push Press, Into: 4 sets Push
Jerk") keep independent start→peak entries, and a complex that repeats per block merges within its
own block and never across them.

**`SupersetInput` rebuilt around that list.** The entered load is written to *each covered
movement*, never to the parent result — that is what lets one block build 40→50 kg while the DB row
beside it stays at 22.5. The card that covers several movements now says so ("One bar · 3 lifts")
and names them, an unfilled card renders as an open slot rather than looking already answered, and
a "Weights to log 2/3" header plus an "*N* weights left" footer names what is still missing — the
failure mode being fixed is logging the hero lift and walking away from the rest.

Two escape hatches, both one tap, because a merged card must never make a lift impossible to record:
- **"Log these separately"** splits a merged block into its movements.
- **"Same weight for all"** copies one number across, offered only when every input is the same
  implement (copying a bar weight onto a DB row is never the intent).

### `complex` means one implement, never set down

The prompt now states what the flag *means* rather than only where it applies, and names the shape
it kept swallowing: a strength circuit or superset — several different movements each done for
their own reps inside a set — must stay `complex: false`. Using the same equipment does not make a
circuit a complex; the test is whether the implement is put down between movements. When unsure the
model leaves the flag off, because a missing flag costs an extra weight prompt while a wrong one
asks for a single weight the athlete never used.

`backfillComplexFlag` was making the same mistake in the post-processor: `inputType === 'weight'`
only proves the movements are *loaded*, so it passed a barbell press beside two DB movements and
collapsed all three into one input. It now also requires the AI's per-movement `equipment` to name
a single implement (unstated equipment still passes).

### A block's `sets[]` records only what the block shares

Each movement's own load travels on `movementResults` → `movementWeights`, which is what the
breakdown, the poster rows and the peak-load scan read. The exercise-level `sets[]` is a
whole-block record, and it may now only state what is genuinely shared:

- **weight** — only when every load in the block resolved to the same number. A barbell press at
  40 kg beside a DB row at 22.5 has no exercise-level weight, and inventing one was read downstream
  as fact (`hasVaryingSetWeights` averaged it across every movement; the poster quoted it as the
  top set).
- **reps** — the block's per-set total across its movements, the same meaning `actualReps` carries
  everywhere else. One movement's rep count stamped on the whole block is what put "10 reps" on a
  5-rep shoulder press.

### The breakdown is keyed per part, not per name

**New `movementBucketKey(name, exerciseIndex)`** — the same lift routinely appears twice on one
board at two intensities: "1 front squat" inside a strength complex and "8 front squats @ 45 kg" in
the metcon. Keying on the name alone merged them into one row, which summed reps across parts (the
metcon page then printed the strength block's reps as its own) and kept only the *first* weight, so
the other part's reps were priced at a load it never touched. Repeats within one part still merge,
which is exactly what a part's total means.

`MovementTotal.exerciseIndex` is now stamped by every breakdown builder — the live save path in
`AddWorkoutScreen`, `calculateWorkloadBreakdown` and `calculateWorkloadFromExercises`.

**New `movementsForParts()`** is THE part→breakdown scope, replacing name matching in
`useCelebrationData`, the hero-result path and the poster harness. Where the index is present it
answers alone; matching the name as well would only re-admit the sibling. `repairUndercountedBreakdown`
is keyed the same way — a name-only map kept whichever row arrived last and then repaired it against
the *other* part's round count, turning a complex's 8 front squats into the metcon's 40.

Docs saved before stamping existed carry no index and still scope by name, so old posters render
exactly as they did.

### Substitutions that change the unit

A board that prescribes reps (40 double-unders) never prescribes calories, so the legacy
"unprescribed in this unit ⇒ the entry is a total" fallback swallowed every unit-changing swap: one
round's 8 cal on the Echo Bike was stored as the entire 9-round total. **New `entersTotalValue()`**
puts `scoreEntryMode` in charge whenever the parse set it, and keeps the old inference only for
parses that predate the field.

With that fixed at the source, the poster's matching exemption came out: a substituted row divides
by the round count like every other row, instead of printing the 9-round total as the per-round
prescription ("72 CAL Echo Bike"). A relay leg still keeps its own per-trip figure.

A distance- or calorie-measured substitute also no longer inherits the board's reps — those belong
to the movement that was swapped out. A rep-measured swap (double-unders → singles) keeps them.

**Substitution catalogue**: double-under ↔ single-under corrected from 3× to 2× (three singles per
double was never the trade), and cardio machines are now offered as calorie equivalents for both.

### Poster

- **The per-set reps sub-line is single-movement only.** "6-6-5-4-3" is a story when the set *is*
  one movement. When a set holds several — a complex, or a strength circuit — `actualReps` is their
  sum (3, 23): a number no coach wrote and no athlete entered, which reads as a rep scheme and is
  not one. The row name already spells out each movement's own reps.
- **No duplicated sub-lift in a complex line.** Compound-name recovery reads the board's own "a + b"
  and splices the neighbour onto a truncated name — correct for "Hang Clean" ← "Hang Clean to Jerk",
  wrong inside a complex whose neighbours the caller is already joining, which printed "1 Squat
  Clean + 1 Front Squat + Push Jerk + 1 Push Jerk". Recovery now stands down when the caller joins
  the siblings itself.

### Harness

Three new real-board fixtures — a mixed-implement strength circuit, a barbell complex EMOM beside a
metcon (the same lift in two parts), and an AMRAP with double-unders swapped for an Echo Bike. The
snapshot now also captures each strength page's reps sub-line, so the single-movement gate can't
regress in either direction.

`tsc -b` clean, 238/238 tests, 38/38 poster fixtures.

---

## v0.1.22 — Units, ladders, max-effort practices, and per-part corrections

The release's through-line: **stop letting a downstream heuristic overwrite something the board,
the model, or the athlete already said.** A pound board is logged in pounds. A ladder's second and
third tiers keep their own numbers. A max-effort practice gets asked for the one number it earns.
And when the athlete says the parse is wrong, the correction reaches the parser and survives it.

---

### Load units — the board's unit is the truth

**New `utils/loadUnits.ts`.** One model for the whole app: a coach who wrote `135 lb` gets logged
in lb, saved as `135` with `unit: 'lb'`, and printed as `135lb`. Nothing is silently converted for
display — a poster that turns 135 lb into 61.2 kg shows a number nobody wrote, and a logging screen
that labels 135 as "kg" asks the athlete to confirm a lift they never did.

Conversion now happens in exactly **one** place: `toKg()` at the kg-denominated math boundary.
`grandTotalVolume` is kg by definition (EP divides it by bodyweight in kg), so an lb load converts
there and nowhere else — previously an lb gym's EP ran ~2.2× hot.

- `#` is read as pounds (`225#` → 225 lb), alongside `lb`/`lbs`.
- Weight step is unit-aware: 5 lb in a pound gym (the smallest pair of change plates), 2 kg for
  KBs / 2.5 kg for plates otherwise. Typed values are still never snapped to the grid.
- Stepper ceiling scales with the unit (1100 lb vs 500 kg) so an lb board isn't capped at what is
  really 227 kg.
- Sets carry no unit of their own — they print in the unit their exercise was prescribed in.
- **PR flash now carries the unit.** A 315 lb deadlift no longer flashes up as "315 KG".

### Ladders — every tier keeps its own prescription

**New `ladderTiers()` in `utils/sectionShape.ts`** — THE definition of what a ladder tier contains,
read by the poster, the logging input and the confirm screen, so the three can't narrate three
different workouts. A tier is a `rounds` section **plus any once-only section that leads it**: a
per-tier cardio lead-in ("800m run" before each descending tier) is stored as its own `buy_in`
section so a repeating tier can't multiply it, but the athlete performs it as that tier's first
line. Reading `rounds` sections alone is what made an 800/600/400m run vanish from the poster *and*
the logging flow while the parse held it correctly the whole time — three consumers each filtered
it away independently.

`foldsCleanly: false` marks the shape where a once-only section can't be attributed to one tier (a
lone buy-in before *all* tiers). Renderers that can only draw tiers decline it rather than printing
"800-0-0m".

**New `utils/tierScaling.ts` — a substitution is a RATIO, not a value.** A per-movement ladder
collapses to ONE input row, built from tier 1. Stamping that single entered value onto every tier
is what turned an 800/600/400m run swapped for an Echo Bike into 3 × 2400m — the poster read
"2400m" once and totalled 7200m instead of 5400m. Each tier now scales its *own* prescription by
the ratio the entry implies. Applied in the breakdown builder and the save path, so both agree.

- Whether a swap happened is read from the resolver, never from a before/after name comparison —
  the logging sheet writes the substituted name straight into `sections[]`, so comparing names
  reports "no swap" on exactly the docs that were substituted.
- **New `prescribedScheme` on `MovementResult`** — the logging row now states the whole scheme
  (`800-600-400m`, `40-30-20`) instead of showing tier 1's number as if it were the only run.
- A for-time per-movement ladder's distance takes **no input**, for the same reason its reps
  already didn't: one box can't hold three tiers and would silently log 800 as the whole run.
- Metres stay metres on the poster — a board that wrote `1000m Row` must not print `1.00 KM`.

### Max-effort practices finally log the number they earn

A skill practice ("Toes to Bar — 8 min, test your max unbroken reps, then 4 sets at 40–60%")
carries exactly one number the athlete earned, and the board prescribes no rep count for it — that's
the point. It used to log as "5/5 sets" with nothing to show for the 8 minutes.

- **The AI decides.** The parse prompt asks, for every practice block, whether the athlete earns a
  number the board doesn't prescribe, and stamps `isMaxReps` on the movement that carries it.
  `getMaxRepsMovement()` only *reads* that answer; `inferIsMaxReps` in the post-processor backfills
  it for older docs and defers whenever the field is present.
- **Max-effort input** in `RepsSetsInput`: a stepper that also accepts typing (an athlete whose max
  jumped has no business tapping twenty times). The sets-confirmation panel steps aside when a max
  is the block's result, so a one-set practice is a single card that fits the screen.
- **The field always starts empty** — never seeded from last session's max. A greyed "18" borrowed
  from history reads as an entered value; an athlete who never touched the field walked away
  believing it was logged. "Last time: 16" is now a hint below the field
  (**new `utils/maxRepsHistory.ts`**, read off the workouts already loaded — no extra query).
- **`hasLoggedMaxEffort` / `isMainPart` moved to `components/celebration/mainPart.ts`** — it existed
  twice (the hook *and* the poster harness), so the harness rendered pages the app filtered away
  and a part vanishing from the real poster still showed green in all fixtures. A secondary block
  that recorded a max now earns a poster page: "secondary" means it wasn't the main effort, not
  that the number should vanish.
- Poster wording follows suit: a max practice is not a load story, so no "STRENGTH"/"build to
  heavy" tag, no "1 SETS" above the block's own "5 SETS" blueprint, no "TOTAL REPS" over a single
  tested set, and the row reads `Max Toes to Bar … 18` rather than dividing 18 by the set count.
- The breakdown counts a max **once**, whatever the block's set count says — a 14-rep effort inside
  a 5-set practice is 14 reps, not 70.

### Partner factor applied where it belongs

`calculateWorkloadFromExercises` divided **every** movement in a session by the partner factor at
the end of the pipeline — quietly halving the solo strength block of a partner session, and
dividing runs on the way to the grand total even though each athlete runs the full distance. The
factor is now gated **per exercise** on `isTeamPrescribedExercise` (the same gate the save path
already used), and the grand totals are no longer scaled a second time on top.

### Buy-in / rounds structure reaches the poster

The parser has two ways of saying "this happens once, before the rounds": an explicit `sections[]`,
and — the shape the AI actually emits for a plain "buy-in, then N rounds of" board — a flat
`movements[]` where the buy-in carries `role`/`perRound: false` and a `Buy-In: ` name prefix. Only
the first shape ever reached the poster's sectioned renderer; the second printed as an
undifferentiated list with the prefix baked into the movement name (`1000m Buy-In: Row`).

- One structure resolver now reads either shape, and the role moves out of the name and onto the
  section, where it belongs.
- `THEN` is printed only where it does work — closing a buy-in. Stacked ladder tiers don't get one.
- `N ROUNDS OF` reads as a lead-in to the lines beneath it; the format line above stays silent when
  the section headers already state the round count. Printing it twice is what made a once-only
  buy-in look like it repeated five times.
- Work done **once** no longer prints a total: `1000m … 1000m total` states the same fact twice, and
  next to sibling rows whose totals *are* multiplied it implies the buy-in was multiplied too.

### Post-OCR confirm screen shows the parse

**New `utils/prescriptionLines.ts`.** The confirm screen asks the athlete to approve the parse but
showed only a title, a couple of chips and the AI's one-line paraphrase — nothing naming a single
movement. A parse that silently dropped the 800m run the board opens with looked identical to a
correct one, so the only screen whose job is catching a bad parse could not reveal one. It now
lists the movements and their prescribed quantities in board order, from the same `ladderTiers()`
the poster and the logging input read.

### Per-part AI corrections

The poster's "AI got it wrong?" flag only stored a string, and the post-OCR note re-read the
*whole* board. Corrections are now scoped to a single part.

**`reparseWorkoutPart(partText, kind, note)`** (`services/openai.ts`) re-reads ONE part through the
existing kind-scoped `parseWorkoutText`. Deliberately not `parseWorkoutSession`: re-segmenting
re-reads the whole board, and the parse is non-deterministic, so a note about the metcon could
silently reshape a strength part the athlete never complained about. Also one call instead of
segment + N, on the cheaper scoped prompt.

**`applyPartReparse()`** (`utils/applyPartReparse.ts`, + 9 tests) splices the re-parsed part back
in, and is where the "don't disturb other parts" guarantee lives:

- untouched parts come out byte-identical
- a part may re-parse into a *different number* of exercises, so it splices rather than overwrites
- session fields (`format`, `scoreType`, `timeCap`, `type`) are adopted **only** when the corrected
  part is the primary one — correcting a strength block can never restate the metcon's format
- an empty re-parse keeps the original rather than deleting the part
- notes accumulate, so a second fix doesn't erase the first

**`partKind` persisted per exercise** (`WorkoutPartKind`). With the `rawText` slice that already
existed, it's everything a one-part re-parse needs. Stamped at the merge, the single-part path, and
the free-part fallback.

**Per-part in-flight state.** The card being re-read dims with a cyan sweep bar and reads
`Re-reading this part…`; every other part stays fully interactive. That independence is the feature,
so the UI shows it.

**Fixed: the post-processor was overriding the AI's answer to a correction.**
`correctWorkoutFormat` infers format by regex over `rawText` — the board's own words:

```ts
if (fullText.includes('amrap') && fullText.includes('rest')) return 'amrap_intervals';
```

On a board whose coach wrote the wrong word (`[02:00 AMRAP, 02:00 REST] x 5` for a piece with no
rounds to count), it reinstated that word regardless of what the model concluded:

```
[TEXT PARSE AI]   format: 'intervals'        Run · Thruster · Burpees Over Bar
[TEXT PARSE POST] format: 'amrap_intervals'  Buy-In: Run · Buy-In: Thruster · …
```

`amrap_intervals` then opened `detectMisplacedBuyIns`' format guard, which re-stamped the logging
mode and the `Buy-In:` prefixes — routing logging to a ROUNDS stepper for a workout with no rounds.
`correctWorkoutFormat` now stands down when the parse carries a `userContext`; the athlete's words
outrank the board's. Uncorrected parses are untouched, so the legacy rescue it exists for keeps
working. Relatedly, `userContext` is now stamped **before** post-processing, so the post-processor
can know a correction is in play at all.

**Fixed: `detectMisplacedBuyIns` was rewriting a correct parse.** It lifted each tier's run into an
invented `buy_in` section and cloned tier 1's into all of them — an 800/600/400m run became 3× 800m
and vanished from both the poster and the logging flow. Rewritten to *only* backfill a cardio
lead-in the AI reported in `movements[]` but placed in no section (invisible everywhere downstream
because sections shadow `movements[]`). It never touches a lead-in the AI did place. Guarded to a
distance/calorie lead-in in a multi-tier for-time ladder; general across tier counts.

### Test-workout flag (admin)

**New `isTest` on `Workout`.** A throwaway log used to exercise the app is excluded from every
count, total, recap and record — via **one** filter in `useWorkouts`, which all of those read
through. Two save-time side effects a read filter could never undo are guarded at the source:

- **user-doc counters** are incremented on save and never decremented, so flagging walks them back
  and unflagging puts them back;
- **PR writes** are skipped — the PR doc id is derived from the movement name, so a throwaway 200 kg
  deadlift would *overwrite* the real record, and deleting the test workout afterwards would not
  bring it back.

`useRewardData` reads Firestore directly rather than through `useWorkouts`, so it applies the rule
itself. The Gallery is the only surface that opts in (badged) — hiding tests everywhere would leave
them unreachable to delete.

### Delete flow

**`useWorkoutDeleteSheet` → `useDeleteSheet`** (`hooks/useDeleteSheet.ts`). It was already generic
(an id + a remover); only the name said "workout". Now reused for saved WODs instead of growing a
second copy of the confirm flow. `confirm()` returns `Promise<boolean>`, so callers chain on real
success.

- **Delete confirmation for saved WODs.** The trash button in the For Later sheet opened no confirm
  and deleted on one tap with no undo.
- **Saved-WOD delete failed silently.** `deleteDoc` was called from an `onClick` with no
  `try/catch`; a rules denial or offline write rejected unhandled and the row just sat there.
  `deleteSavedWod()` now reports success/failure and the sheet stays open with an error.
- **"For Later" closed even when a delete failed** — the close is now gated on the delete landing.
- **Destructive confirm rendered behind the sheet that raised it.** `DeleteActionSheet` sat at
  z-index 300/301 while the For Later sheet is at 1000/1001. Raised to 1100/1101 — a destructive
  confirm must always be the top layer.

### Other fixes

- **Time cap read the wrong number.** `parseTimeCapSeconds` tried MARKER-FIRST before MARKER-LAST;
  MARKER-FIRST accepts an optional unit, so in `35 min cap: 800m run` it read the run's 800 and the
  poster printed `800 MIN CAP`. The more specific pattern now goes first.
- **EMOM logging hint** is derived from the movements rather than the format — a barbell EMOM, a
  bike EMOM and a Cindy-style bodyweight EMOM all land in the same step and ask for different things.
- **Multi-implement load groups** (`components/logging/story/loadGroups.ts`, + tests): a group is
  ONE implement in play, driven by the AI's `equipment`. A double implement can never be a barbell
  (you can't hold two), and an unstated held load ("weighted box step-up") joins the sole stated
  implement rather than defaulting to the session's bar. Members with no prescription of their own
  are seeded with the group's, so the stored weight can't be empty while the screen reads "used for"
  that movement.
- **Split-apart groups stay split** — no first-edit propagation in or out, which would immediately
  re-sync weights the athlete deliberately separated.
- **Ladder rows with nothing to enter are kept** in the logging story — the row carries the scheme
  that tells the athlete what the tier structure is. Dropping them told the story of a workout with
  one run in it.
- **iOS Safari zoom**: 16px minimum on every text input on the poster, correction sheet and confirm
  screen.
- **44px touch target** on the correction control — the design system's floor, and this is the one
  control aimed at someone who just noticed their workout is wrong.
- **`useFitScale`** documents (and no longer trips over) the feedback loop where a "needs fit" class
  that changes padding makes the ResizeObserver flip the scale back and flicker the card.
- **Arcade input hero style** — for a screen whose whole job is capturing ONE number, the number
  gets the display face and the accent colour.

### Changed

- **`utils/admin.ts`** — one `isAdminEmail()`. The address used to be re-typed per screen, so two
  gates could quietly disagree about who counts as admin.
- **`firestore.rules`**: `movementRegistry` (read by any signed-in client, written only by triage)
  and `movementFlags` (appended by any client, read/cleared only by triage) now have rules blocks —
  a rules-denied write burst previously stalled the shared mutation queue.
- **Correction wording**, per design review:

  | Where | Before | After |
  |---|---|---|
  | Affordance | `Something off? Tell wodi` (screen-level) | `Fix this part` (per part) |
  | Sheet title | `Tell Wodi` | `What did wodi miss?` |
  | Sheet hint | `Anything the board doesn't say…` | `Tell it in your own words. It'll re-read just this part.` |
  | Submit | `Update workout` | `Re-read this part` |

  The sheet names the part it's about — the channel's promise is "just this part", and an unnamed
  sheet can't make it.

### Removed

- Screen-level `Something off? Tell wodi` link and its CSS — a workout-level path would re-read the
  whole board, which is what this release replaces.
- The duplicated `isMainPart` in `useCelebrationData` and in the poster harness.
- The end-of-pipeline partner-factor `.map()` and `grandTotalRunDistance` bookkeeping it needed.
- Dead `onOpen` prop on `OnDeckCard` (declared, never destructured, still being passed).

### Verification

`npx tsc -b` clean · 225/225 tests (20 files) · 35/35 poster fixtures — 5 new ones covering
flat buy-in → rounds, per-tier run ladders, a run substituted to a bike, and a max-unbroken skill
practice.

### Known gaps

1. **The poster half of the correction channel is unbuilt.** It still shows the workout-level
   `AI got it wrong?` pill backed by `CorrectionSheet`, which stores reason strings and never calls
   the parser. Per-page `Fix this part` + routing a poster correction back through confirm and
   re-log into the existing doc is the remaining work.
2. **Max-effort movements still get no input outside the strength path.** A movement the AI flags
   `isMaxReps` has its input only in `RepsSetsInput`, reachable when `kind === 'reps'`. Any metcon
   routing elsewhere never asks for the number the board says you earn.
3. **Prompt example 5b teaches the wrong mode for fixed-window pieces.** `openai.ts` example 5b
   (`1.50 MIN X 16 ROUNDS` with `MAX BIKE`/`MAX ROW`) is labelled `"format": "intervals",
   "scoreType": "time_per_set"` — impossible for work done to a buzzer, and contradicting the
   prompt's own emom-vs-intervals rule.
4. **Offline `npm run corpus` cannot catch prompt regressions** — fixtures replay recorded AI
   responses keyed by input text, not by the prompt. Prompt changes need a live corpus run.
</content>
</invoke>
