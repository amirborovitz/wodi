# Changelog

## v0.1.29 — A recap is a poster, not a stats screen

Wrapped was a stats screen wearing story chrome: bar charts, cards framed around a dash, and a hub
whose filter chips could narrow a 2-up grid down to one tile and a lot of black. It is now nine
posters built to leave the app and land in front of people who have never heard of wodi, which
means every number on them has to pass the stranger test — legible on sight, and a flex.

Underneath it, two data bugs that turn out to be the same bug: the app reading the words on a board
where it should have read the board's structure.

---

### Wrapped v2 — nine posters, and not one chart

`WrappedStoryScreen.tsx` was 597 lines of deck and chrome in one file. It is now 19 lines of
player. **`wrapped/wrappedCards.tsx`** builds the deck, **`wrapped/primitives.tsx`** is the shell
every card is built from, and the screen does nothing but advance an index and invert its chrome on
the light cards — white segments on a yellow field are invisible.

Three rules the deck holds to, each of them a v1 mistake:

- **No charts.** Rankings are typographic — rank · name · number. Proportion is one full-width tape
  strip, never a grid of per-row bars. A five-way split scaled against its family total is five
  stubs that answer nothing.
- **No card with an empty body.** A period that lacks the material for a card *drops the card*; it
  never renders the frame around a dash. The rhythm survives the drop, because it was authored as
  one: black · YELLOW · black · black · YELLOW · black · black · vibe · black.
- **Nothing sized in px.** Type and spacing go through `V(cw, ch)` — `min(Xcqw, Ycqh)` against the
  card's own container box — so a card authored at 393×852 stays a composition at 375×667 and at
  54×84 in a thumbnail. And the body zone *spaces* its children apart instead of centring them,
  which is what left v1 with a void above **and** below its content on a tall phone.

**Two new numbers, both counted, neither estimated.** `totalReps` is every rep the period counted
across every non-cardio family — the one figure that needs no context, because a stranger who has
never seen a WOD understands "31,480 reps". `repsPerSession` is the same total said as a rate: a
five-figure number is a lump until you divide it by the times you showed up, and then it is a
habit, which is the part worth bragging about. Both are summed from `moves`, so neither can
disagree with the ledger that lists them. `repsPerSession` is null on a single-session period,
where it would be the hero number printed twice.

**`prDelta` → `prPrevious`.** The old field baked a sentence — "up from 45kg · your 3rd PR this
month" — and a baked string cannot be typeset. The card now takes the bare mark that was beaten and
sets it as a struck-through WAS line, which is what makes a modest top set read as a jump when it
sits next to a five-figure tonnage. Null when the previous best on file is at or above the lift:
that is stale data, and a WAS higher than the PR is worse than silence.

**One persona path.** `getPersonaName()` returned a name while the story screen kept its own
`PERSONA_MAP` with the sub-lines — two tables that would eventually disagree about who you were
that month. `getPersona()` is the only one now, and returns the name, the handwritten sub-line, the
vibe and its count together. Every persona still celebrates: no "scaled", no "room to improve", no
name that would sting to screenshot.

### Me › Your Wrapped — a hero and a shelf, no chrome around nothing

The hub put a 108px column of near-empty thumbnail next to its copy and then let WEEKS / MONTHS /
SEASONS chips filter a grid that often held one tile. Two rows of chrome around almost no content.

There are no filter chips now and no grid to fall into. The tier is a pill on the tile itself, the
shelf runs chronologically like a body of work, and the newest recap renders as a **real poster**
with its own open and share actions. A single week never takes the hero slot — it is the thinnest
recap there is, and the newest month is what someone opens Me to look at.

The hero is a poster and its caption, never the same poster printed twice: the tilted print carries
the period, `wrapped.`, the rep count and the persona, so the copy beside it carries only what the
print cannot show — the move that defined the month, the sessions, the tonnage. The first build put
the persona and the rep hero on both halves, and the card read as a rendering bug.

**`RecapPeek` is deleted.** `W2MiniFace` replaces it everywhere — the hub hero, the shelf, and the
"recap ready" card on Home — so a thumbnail is a scaled-down copy of the real cover rather than a
second drawing of it that can drift. Share captures the same finale card the story ends on,
rendered off-screen at phone proportions, so what leaves the app is identical whichever button sent
it.

**Me lost its Week / Month / All-Time toggle** and the three ticker tiles under it. Wrapped already
tells that data with a personality, and wodi is not a tracker; the lifetime numbers worth keeping
were already in the strip above. The animated count-up hook went with them.

### The rest a board writes down is the proof it isn't shared

`[2:30 AMRAP, 2:30 REST] x 4 — work in pairs (two heats), one works while the other rests` was
being halved. Every consumer read the pair language and divided the board's 6 / 6 / 30 down to
3 / 3 / 15, which rewrites what the coach wrote.

The fix is not another phrase in a regex. **`prescribesOwnRest()`** now lives in the partner kernel
(`services/partnerScope.ts`) and reads structure, not words: when the board prescribes this block's
own rest, that rest belongs to everyone's prescription at once, so nobody is covering anyone's
work. In a genuinely shared piece the rest is never written down — because the rest *is* the
partner working.

- **Structure outranks the flag.** `isTeamPrescribedExercise` asks this before it reads
  `partnerWorkout`. That flag is a judgement — the AI's, or a regex that saw "in pairs" — and on a
  work/rest board there is nothing for a judgement to divide, so a wrong call now costs nothing.
- **One answer for parse, logging and poster.** This rule used to exist as a local
  `loggingMode === 'amrap_intervals'` check inside the poster builder, and the logging screen had
  never heard of it — so it halved the same board on the way into Firestore, and the poster then
  faithfully rendered the halved doc. `helpers.ts`, `workoutPostProcessor.ts` and the kernel gate
  all call the one function now.
- **The post-processor persists it.** A block that prescribes its own rest is written back as
  `partnerWorkout: false` with any `partnerSplit` dropped, so the saved doc cannot contradict the
  gate that will later refuse to divide it. The *session* keeps its own partner flag — the athletes
  really were paired.
- **The prompt learned the question**, not the phrasings: *while I am doing this movement, is my
  partner doing it too, or are they idle / waiting their turn?* "Two heats", "one on one off",
  "alternate", "share a rig", "partner counts for you" all describe who is on the equipment when.
  That is logistics. New example 15b pins it, and `prescribesOwnRest` covers the phrasings nobody
  has invented yet — because none of them is read.

Boundary, stated honestly: a shared *max-effort* piece can also prescribe rest ("in pairs, 3:00 to
accumulate max calories, 3:00 rest"). It lands on the true side of this test, but such a board
carries no fixed rep prescription to divide, so nothing is misattributed.

### A swap you make survives re-opening the log

Substituting Echo Bike for the 200m run was one-way. The save path bakes the **substitute** onto
the movement — its name, its converted distance, its zeroed reps — because that is what the poster
and every totals consumer read as "what was done". Re-opening the log then read `Echo Bike 700m` as
the coach's prescription: no Rx row to tap back to, and no original for the scaling sheet to
re-convert from.

`MovementSubstitution` now carries **`originalPrescription`** (reps / distance / calories), stamped
per occurrence at save time — per occurrence because a per-movement ladder prescribes a different
amount at every tier. `workoutToParsedWorkout` un-bakes it on the way out, handing the wizard the
board's own name and quantities with the swap alongside it, and `AddWorkoutScreen` re-applies the
swap to the row last, after the totals overlay has run. The field is *assigned*, not
spread-when-present, so going back to Rx clears it instead of resurrecting the swap on the next
open. Docs saved before it existed recorded the swap nowhere, and still read as though the coach
prescribed the substitute.

**The scaling sheet said "0m → 231m".** `originalValue` took the first non-nullish of
reps / distance / calories, and the save path writes a zeroed `reps` onto a movement measured in
metres — so a 700m row converted from zero. It takes the first **positive** one now, matching
`originUnit`, which had always used `> 0`.

### The gym's heartbeat on Home

**New `components/home/FeedPulse.tsx`**: how many other athletes posted inside the feed's 24-hour
window, three of their faces, one tap to the feed. Home is otherwise entirely your own work, which
means it only changes on the days you train; this row changes every day, and it is the reason to
open the app when there is nothing to log.

It counts athletes, not posts — a two-a-day is one person training. It says "last 24h" rather than
"today", because that is the window the feed actually keeps: at 6am, most of "today" was last
night. It renders nothing when no one else is in the window, so a quiet gym costs no space, and it
sits last so it never competes with your own work above it.

### Smaller things

- **The poster rail's captions were reading the wrong date.** `PosterThumbnail` labelled by the
  logging timestamp while the rail is sorted by the trained date, so a Monday board logged on
  Wednesday sat in Monday's slot captioned "Today". It uses `getEffectiveWorkoutDate` now.
- **The photo lightbox has a close button.** Tapping the backdrop always worked, but a full-bleed
  photo with no visible way out is a screen people back-swipe from.
- New poster fixture `real-alternating-heat-interval-amrap-20260821` pins the two-heat board that
  started the partner-rest work. 44 fixtures, 493 tests and `tsc -b` all clean.


## v0.1.28 — The phone is not a browser window

Wodi is used on a phone, held in one hand, usually straight after a workout. Everything here is
about the app admitting that: installing to a home screen, drawing around the notch and the home
indicator instead of under them, and a poster that is the right size the first time it paints
rather than after the fonts land.

---

### The app can live on a home screen

**New `public/manifest.webmanifest`**, plus the four icons it names. `display: standalone`,
portrait, `#0c0d0f` on both `background_color` and `theme_color` so the install splash and the
app's own background are the same colour rather than a dark app flashing white on launch. The SVG
mark stays first in the `icons` array — it is the sharpest thing available on any platform that
takes it — with 192 and 512 PNGs behind it for the ones that don't, and a separate **maskable**
512 whose art sits inside the safe circle so Android's icon shape crops the padding, not the mark.

`index.html` links the manifest and an `apple-touch-icon`, and declares standalone for iOS.
`apple-mobile-web-app-status-bar-style` is **`black`**, not `black-translucent`: translucent hands
the page the status-bar strip to fill itself, and not every screen reserves `--safe-top` for that
yet — a translucent bar today would put the status clock on top of a header.

### `viewport-fit=cover` — the line that made forty other lines work

The viewport meta was `width=device-width, initial-scale=1.0` and nothing else. **`env(safe-area-inset-*)`
resolves to zero without `viewport-fit=cover`** — that is the whole contract. Around forty rules
across the app reserve room for the notch and the home indicator through `--safe-top` /
`--safe-bottom`, and every one of them had been silently computing to `0px` since the day it was
written. The app was drawing under the hardware and the CSS that was supposed to prevent it looked
correct.

Pinch-zoom is **not** disabled while we are in here. The involuntary zoom this app used to suffer
came from sub-16px inputs, which `variables.css` already guards against; taking scaling away from
people who need it to read is not a fix for that, it is a fix for a different app's bug.

**`BottomNav` counted the home indicator twice.** Its `bottom` was
`var(--space-4) + var(--safe-bottom) + env(safe-area-inset-bottom)` — and `--safe-bottom` *is*
`env(safe-area-inset-bottom)`. Harmless for exactly as long as both terms were zero; the moment
`viewport-fit=cover` landed, the dock would have jumped ~34px up the screen on every notched
phone. One count. Nothing else in the app doubles them.

**`theme-color: #0c0d0f`** paints the browser's own chrome in the app's background, so the seam
above and below the page disappears in a normal tab too, not just in a standalone install.

### `overflow: clip`, because `hidden` on the root breaks `position: fixed`

`html` and `body` both carried `overflow-x: hidden`, and both now state `hidden` then `clip` — the
same deliberate double-declaration the `100vh` / `100dvh` pairs use, so a browser without `clip`
still gets the old behaviour.

They are not synonyms. **`overflow: hidden` makes an element a scroll container** — one that
cannot be scrolled by hand, but a scroll container all the same — and on iOS WebKit a scroll
container on the root is exactly what makes `position: fixed` elements drift while the page
scrolls and `position: sticky` quietly stop holding. The dock and roughly twenty bottom sheets all
depend on both. `clip` refuses the horizontal overflow without creating the container, which is
what these two rules meant in the first place.

### The feed's last card had dead space under it

`FeedScreen` had `min-height: 100vh` alone, where every other full-height screen in the app pairs
`100vh` with `100dvh`. On mobile **`100vh` is the *large* viewport** — the height the page would
have if the browser's toolbars were hidden — so the feed reserved about a toolbar's worth of
height it did not have, and the scroll ran on past the last poster into nothing. `100dvh` tracks
the real height as the bars slide away.

Its padding now goes through `--safe-top` / `--safe-bottom` like the rest of the app instead of
calling `env()` inline, and the top padding reserves for the notch at all — previously the feed
header started under it.

### A poster measured before its fonts arrive is measured wrong

**`PosterCard` now waits on `document.fonts.ready`.** A poster is almost entirely display type and
its height is whatever that type happens to occupy, so measuring while the webfonts are still
swapping in returns the *fallback's* height — off by enough to leave a gap under the card or clip
its footer. The `ResizeObserver` catches the reflow on browsers that report one, but a text reflow
is not guaranteed to fire it, so we ask the font loader directly. The callback is guarded by a
`live` flag cleared on unmount, since `fonts.ready` can settle long after a poster has scrolled
away.

**`ResultValue`'s unit was rendering at about 4px.** The unit is sized `0.28em` — relative, by
design, so "kg" scales with whatever hero number it hangs off — but the flex wrapper holding the
pair carried no font size of its own, so that `em` resolved against the inherited 16px root
instead of the ~200px score beside it. The wrapper now carries `primaryStyle.fontSize`, and the
unit is a unit again. All 43 poster fixtures still match: the harness compares poster *content*,
and this was always meant to be the rendered size.

---

## v0.1.27 — The second time through

Everything here is a thing that looked fine once and wrong on the second pass: the second poster
in a scroll, the second time a swap sheet is opened, the second time the same explainer is read.
Plus a trail back to the one screen that can turn a nameless athlete into somebody.

---

### A poster in the feed is drawn at the size it was drawn at

**New `--poster-width: 360px` token.** `PosterCard` scales a skin to whatever width its container
gives it, so a wider container does not *fit* the poster — it *magnifies* it. Inside the 520px
`--app-column` every glyph rendered at 1.33× the size it was designed at, which is what made a
single card eat a whole screen. `FeedScreen` is the one surface whose content has an intrinsic
width — a feed card **is** a poster — so it holds `--poster-width` plus gutters instead of the app
column, and the header, pulse rail and reaction rows stay flush with the poster's own edges. Below
that width — every real phone — nothing changes. Thumbnails, which are meant to be small, remain
free to go under it.

Card gaps and header spacing tighten to match (22 → 18px between cards, 11 → 9px above the
reaction row): at true size the old rhythm was built for a poster a third too big.

### The post's age joins the identity line

`formatAge` now speaks **one unit, never two**. "14h 51m ago" is a stopwatch reading; nobody
scrolling a feed needs the odd minutes, and the second term cost the metadata line exactly the
room the athlete's box and city need. Minutes read as "50 min ago", hours are **rounded** rather
than floored because that is how the number is said out loud — 1h50 is "2 hours ago" — and the
rounding is capped at 23 so the last minutes of the window never claim to be "24 hours ago" inside
a 24-hour feed.

**`AuthorLine` gained `lead`.** The age rides the metadata line under the name — when · where they
train · what city — instead of holding a column of its own, which had squeezed the name into an
awkwardly narrow middle. It *leads* rather than trails because that line ellipsises from the right
on a narrow phone, and the age is the part that must survive. The whole line collapses when an
athlete has filled none of it in, and `location` joins it: what the feed shows is the whole
"City, country" string, so Profile Settings now labels that row for both halves instead of asking
for "City".

**"fading soon" is a warning, not a timestamp.** Now a pill — uppercase, red-tinted — so it reads
as a state the post is in rather than one more number to compare against the ones on the poster.

### The 24-hour explainer is a first-post lesson, not a gate

`usePostToFeed` gained **`needsConfirm`**, and the share sheet's "Post to Wodi feed" row publishes
straight away once an athlete has published before. Re-reading the same paragraph every time turns
posting into paperwork; the sheet itself, not the dialog, is what stops a mis-tap. The flag is
`localStorage`, keyed by uid — a second account on the same device still gets told once — and it
is re-read **during render** when the uid changes, so the first paint after a sign-in is never
wrong about it. Private mode simply reads the explainer again.

### One builder owns substituting *and* reverting

**New `components/logging/story/substitutionPatch.ts`.** Three call sites — the substitution sheet,
the superset sheet, and the inline AI-alternative chip — each carried their own copy of the
"substitution → row patch" logic, drifting in the usual way: `SupersetInput`'s copy handled
`distance` and `calories` but never `reps`, and no copy cleared what it did not set.

Substituting and reverting must be **exact inverses**. A substitution re-prescribes the row in a
single unit, so applying one now clears the other two quantity fields and reverting restores all
three from the board. Without that symmetry a rep-ratio swap (200m Run → 20 Burpees) or a
cross-unit swap (10 Burpees → 20 cal Echo Bike) left its converted number behind after the athlete
went back to Rx, and the row logged both quantities at once. The pre-`targetUnit` inference
survives as a documented fallback for substitutions saved before the sheet stamped the unit, not
as a live path.

**The AI-alternative chip moves the number too.** The board wrote both sides ("40 DU / 60
singles"), so the alternative carries its own quantity *and* its own unit — the chip stamps
`targetUnit` and hands the whole thing to the same builder instead of swapping only the name.

### The substitution sheet remembers what the row already chose

`SubstitutionSheet` now **rehydrates from the row's saved substitution** and re-seeds on every
open. Reopening a substituted movement used to show nothing selected and no value adjuster — and
on a structure-prescribed row (a rounds-scored 200m run) this sheet is the *only* place that
distance can be changed, so the athlete had no way back to their own number. `isOriginalSelected`
now reads `pending` alone, which mirrors the saved state.

- **The value adjuster is always available.** It used to render only when a converted value already
  existed, which hid it for exactly the swap that needs it most: a cross-unit swap with no
  conversion ratio (Run → Echo Bike in calories) starts empty and the athlete types it. An empty
  value shows "—", not "0".
- **Cleared means `undefined`, not zero.** A swap the athlete hasn't put a number on stays blank
  rather than claiming a 0m effort.
- **The before/after hint carries units.** "200m → 45 cal", never a bare number pair — a cross-unit
  swap read as nonsense without them.

### The trail to a filled-in profile

**New `hooks/useProfileCompleteness.ts`** — derived, never stored. No dismissed flag, no Firestore
field, no `localStorage`: it reads the user doc, so it disappears the moment a detail saves and can
never get stuck on for someone who already filled one in.

It asks for **engagement, not completion**. One filled field is enough to turn it off — an athlete
who has been to the profile screen does not need to be told about it again, and a nudge that keeps
score of what is still blank is a nag. That is also why there is no percentage: a completion number
invites people to fill fields for the number.

- **`hasProfileDetails`** judges by the same `validateField` the form uses, so a value that screen
  would reject cannot count as filled, and blankness is checked separately because an empty
  *optional* field is valid but not filled. The name is excluded — it arrives free with the Google
  account and says nothing about whether the athlete has told us anything. A null user (still
  loading) counts as filled: a nudge that flashes on every cold start is noise.
- **A yellow dot on the home avatar** — the same yellow Profile Settings marks a required row with,
  ring-cut against the header so it reads as a badge and not a speck on the photo. It adds no tap
  target and no layout of its own; the avatar already leads to the one place that can clear it.
- **"Add your details →" on Me**, in the handle's slot. The nudge outranks the handle for that line:
  the handle is decoration that will still be there tomorrow, while this goes away for good the
  first time anything is filled in. The two cannot collide in practice either — an Instagram handle
  is itself a detail, so having one turns the nudge off.

### Dead code

`completeOnboarding` deleted from `AuthContext` — the onboarding flow it belonged to is gone, and
it was a one-line wrapper over `updateUserProfile` with no callers. `'stats'` and `'onboarding'`
leave the `Screen` union with it, along with the `BottomNav` branch that lit "Me" for a screen that
no longer exists.

**Verification:** `tsc -b` clean; 471 tests across 28 files pass. Display and logging-input changes
only — no calc, EP or poster-render path touched, so the poster fixtures are unaffected.

---

## v0.1.26 — An athlete is one object

Two changes, both about a number or a name that existed in more than one place and disagreed with
itself.

- **The feed stopped freezing identities.** Tapping the same athlete from a post header and from the
  reactions list opened two sheets built from two copies, stapled into two documents at two
  different moments — one carried an Instagram handle, the other didn't. Identity is now a live
  lookup through `/publicProfiles`, split out of `/users` because Firestore rules are
  **per-document**: "allow read" on the user doc hands over email, sex, bodyweight and stats along
  with the name, and there is no read-side equivalent of `diff().affectedKeys()`.
- **The Profile strip stopped repeating itself.** "Posters" was `workouts.length` under a second
  name, the PR count was already the subtitle of the row beneath it, and EP was printed twice on the
  same screen. Those tiles now read Workouts / Week Streak / Total EP.

---

## v0.1.25 — Other athletes exist

A poster stopped being something you look at alone. Everything in this release either builds the
surface where someone else sees your work, or fixes a number that would have been wrong in front of
them. Full detail in commit `f2cfc40`.

### The Feed — global, no-follow, 24h

- A post is a **frozen snapshot**, never a pointer into `/workouts`. That doc carries `rawText`,
  corrections, notes and EP, and it stays owner-scoped — so the feed could only exist by copying
  what a card renders. Editing a workout tomorrow never rewrites what you posted today; renaming
  yourself never rewrites your history.
- `PosterCard` is the read-only poster renderer; `HandwrittenFace` is an **editor** and must never
  render someone else's poster. `PosterThumbnail` renders `PosterCard` too, so thumbnail, feed card
  and editor cannot drift.
- A snapshot carries **every page** of a session — a multi-part day is several posters, and freezing
  only the metcon publishes a fraction of the work.
- `firestore.rules`: posts are immutable, creation checks `author.name` against the user doc, and
  `expiresAt` must sit inside the 24h window. Reactions live in a `flames/{uid}` subcollection
  precisely so reacting never needs write access to another athlete's post. `storage.rules` is now
  managed in this repo — **the next deploy replaces whatever is in the console.**
- `PulseRail` renders the 24h window as a horizontal timeline instead of an infinite scroll.
- Poster photo: an optional shot clipped to the poster as a tucked polaroid, deliberately a member
  of the sticker family so the share image and thumbnail pick it up with no extra wiring.

### `partnerScope.ts` — one owner of team-to-personal math

`ParsedMovement.reps: 5` never says whether 5 is the pair's work or yours. Ten consumers joined
scope, team size and quantity independently, and the same bug came back in June, July and twice in
August. A convention cannot be enforced; a function can. The legacy `0.5` is a last-resort fallback
only — two call sites reached for it *first* and quietly halved a team of four's work.

### `occurrenceExpansion.ts` — how many times did this happen?

"[14-12-10-8-6-4] … 200m run in between sets": six tiers hold **five** gaps, and every counting mode
answered six. New `occurrences` / `placement` parse fields, `statedOccurrenceCount()` as the single
owner, and `expandExercise()` writing a piece out flat so totals are *counted* rather than
multiplied. Derived, never stored. Audited by `npm run occurrences`.

### Numbers that were wrong

- Barbell-complex volume dedupe asks the parser's `complex` flag instead of guessing from a
  weight/rep coincidence — two-arm KB snatches used to drop an entire arm.
- An unprescribed loaded movement is priced for EP but kept **out** of the breakdown: a number
  nobody entered can feed the score, never the poster.
- A strength part's rep scheme lives on the **sets**, not the movement.
- Loaded carries log their load, not their metres.
- Canonical lift matching is two-tier: multi-word aliases match anywhere, single-word roots only as
  the whole name — a substring match polluted a barbell record with loads that never touched a bar.

### Week Drop, and a smaller Me

Recaps gained a "week" scope with its own one-page `WeekDropPage`. `RecapData` gained `epTotal`
(against the athlete's real bodyweight) and `moveMinutes` (entered durations only — a week with no
times reports 0, never a guess). **Training Goals are gone** — nothing consumed them; Profile is now
one tap from Me, and Settings keeps only what the app can actually do.

---

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
