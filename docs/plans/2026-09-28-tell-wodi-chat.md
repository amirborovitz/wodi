# Tell Wodi — log a workout by chatting

*Plan, 2026-09-28. Status: **v1 built on `feat/tell-wodi`**, admin-only until the owner has tried it on real workouts.*

## The idea in one paragraph

After a workout you open a chat with Wodi, send the board photo (or just words), and say what you
did the way you'd text a friend: "22 min, 17.5 kg, singles, almost died". Wodi reads the board and
your words, asks **only** what it still needs to know — one short bubble at a time — and when
nothing is missing it replies with your poster. The forms stay exactly as they are; this is a
second way in, not a replacement.

## What "good" looks like (the Instinct bar)

From the owner's Instinct conversation about The Ladder:

> **Instinct:** Cash out — did you do it? DU or singles?
> **Instinct:** And 22 min is the whole workout including cash out? (Also: today, right?)
> **Me:** Yes. Singles

Every question changed a number, nothing was a form, and it assumed what it safely could. Two
places Wodi must do better:

- **It asked the 22-minute question twice.** Wodi keeps a list of what's still open, so it never
  re-asks something answered.
- **It kept a note the recap can't add up** (both DU *and* singles rows in its sheet). Wodi saves
  the choice, so the recap counts 400 singles and zero double-unders.

## How a conversation goes

```
Me:    [photo of the board]  22 min. 17.5 kg dumbbell. almost died
Wodi:  Brutal one. Cash-out — double-unders or singles?
Me:    singles
Wodi:  Got it. Did you run, or swap the runs for something?
Me:    echo bike, 3x the distance
Wodi:  [poster]  THE LADDER · 22:00 · … "almost died" on it as the vibe
```

1. **You send.** Photo, words, or both. The message is saved the moment you hit send (✓), so
   nothing is lost if you close the app.
2. **Wodi reads the board** with the same AI reading the forms use today. No new parser.
3. **Wodi reads your words against the board** and fills in everything you already said.
4. **Wodi works out what's still open** and asks the most important one. One question per
   bubble. You can answer several at once ("singles, and I did bike") and it takes them all.
5. **"Don't know" / "skip" is an answer.** That number stays blank and the poster leaves it off.
   Nothing is ever filled in by default.
6. **Nothing open → poster.** Saved exactly like a form-logged workout, so recap, EP, PRs and
   history all just work. Tapping the poster opens the normal recap screen.

## The key design choice: the app decides WHAT to ask, the AI decides HOW

Instinct lets the AI decide what to ask, which is why it repeats itself and why its sheet can't be
summed. Wodi knows the workout's structure, so:

- **The app owns the list of open questions.** Built from the same per-block results the forms
  fill, so the chat and the forms can never disagree about what a workout needs.
- **The AI only does language:** turning your words into answers for those questions, and
  phrasing the next question like a person.

What goes on the list, in the order it's asked:

| Priority | Open question | Asked when |
|---|---|---|
| 1 | The score — time / rounds / reps | the block is scored and you didn't say it |
| 2 | Your weight | a movement is weighted and you didn't say it |
| 3 | An either/or on the board ("200 DU / 400 singles") | you didn't say which |
| 4 | How much of it you did | the score says you didn't finish (capped, partial round) |
| 5 | The date | only when the photo/board says a different day from today |

Deliberately **not** asked: substitutions (you say them if they happened — asking "did you run?"
on every run is noise), mood, anything the board already fixes.

## Where the code goes (for the build)

This is the technical half, kept short. Nothing here is a second path for something that exists.

1. **Pull the save out of the Add Workout screen.** `saveWorkout` lives inside
   `AddWorkoutScreen.tsx` (~2800 lines). Move it into a hook/service both the forms and the chat
   call. **This is step zero and ships on its own**, with tests pinning today's save shape first,
   because a save that changes shape silently is the worst bug this app can have.
2. **Blank means blank.** `createBlankResult` pre-fills the Rx weight (by `user.sex`) and
   calories. The chat asks it for results with no pre-fill — one option on the one function, not
   a copy of it. Pre-filled values are indistinguishable from answers, which is how Saturday's
   poster got 50 kg.
3. **`openQuestions(results)`** — a pure function: given the per-block results, return what's
   still open, in priority order, each with a stable id. Built on the checks the forms already
   use (`getRowState`, the movement results). Fully unit-tested; this is the brain of the chat.
4. **One AI call per message you send:** "here's the board, here are the open questions (ids),
   here's what the athlete wrote — return answers by id, plus the vibe if there is one." Strict
   structured output, like the parser. It returns **answers to our questions only** — it can't
   invent structure or fields. A second short output phrases the next question.
5. **Answers are applied with the same setters the forms use**, so a weight typed in the chat and
   a weight typed on the stepper land identically.
6. **The chat screen.** Bubbles, photo, text box, "Wodi is typing…", the poster as a reply. Built
   to the design system; this is the one genuinely new piece of UI.
7. **The thread is saved** in Firestore so reopening shows it. New collection ⇒ its security rule
   ships in the same change (the telemetry queue lesson).

### How we'll know it works

- `openQuestions` gets golden tests over the existing fixtures: The Ladder must ask exactly
  *score? · DU or singles?* when you only sent a weight, and nothing when you said everything.
- A **chat corpus** like the parse corpus: recorded conversations ("22 min, 17.5, singles") with
  the answers they must produce, replayable offline. The Ladder conversation is fixture #1.
- The saved workout from a chat must equal the one the forms produce for the same answers — one
  test per poster fixture shape.

## Version 1 — in and out

**In:** chat screen · photo and/or text · the questions above · poster reply · saved like any
workout · thread kept · the vibe from your words.

**Out (later, in this order):**
1. **Fix it by chatting** after the poster ("no, 35 kg") — edits the saved workout.
2. **Server side** — the AI runs on a Firebase Cloud Function: messages answered even with the app
   closed, and the OpenAI key leaves the app (today it ships inside it). Needed before this goes
   to more users.
3. **Voice** messages.
4. **Coach mode** — "what did I deadlift last month?", suggestions, feedback, from your own history.
5. A real WhatsApp number.

## Decisions (owner, 2026-09-28)

1. **Available to everyone** — admin-only only while it's being tried, then open.
2. **A new chat per workout.** Each chat ends in its poster. One ongoing "coach" thread comes later,
   and the per-workout chats can live inside it.
3. **Chatty.** Wodi reacts ("Brutal one.") before it asks.
4. **Where it lives (designer):** a second, quieter full-width button under "Add a workout" on Today:
   💬 Tell Wodi. Its own full-screen chat, no bottom nav. Yellow means YOU — the athlete's bubbles are
   yellow-tinted, Wodi's are dark. Either/or questions get tap-to-answer chips, always with Skip.
   Opens with Wodi already talking: "What'd you do today?". Keyboard not auto-opened.

### Open, for after the owner has seen it
- Forms-first vs chat-first on Today (designer: forms first; owner's Instinct experience argues chat).
- If the app closes mid-chat: resume that chat until its poster, then start fresh (not built in v1).
- The poster as a card inside the chat (v1 goes to the normal reward screen).
- Fold the capture step's "Say it or type it" into Tell Wodi — two ways to type a workout break
  "one path per concern".

## What v1 actually does (as built)

- **Chat is a step of Add Workout**, not a second screen with its own save: same board reading
  (`parseWorkoutImage` / `parseWorkoutSession`), same results (`initStoryResults`, with
  `blankAnswers`), same save (`requestSave` → same-board check, PRs, reward). Step 0 (extracting the
  save) turned out not to be needed for v1.
- **`chatQuestions.ts`** — the open-question list and how answers land (same fields the form inputs
  write). Pinned by `chatQuestions.test.ts` on The Ladder.
- **`tellWodiReader.ts`** — one strict-schema AI call per message; answers only the listed ids.
- **Anything the chat can't finish** (A/B/C separately-scored blocks, ladder AMRAPs, multi-station
  max reps, weight + max-set) → "Open the form" with everything answered so far filled in. The
  header's "Use the form" does the same at any time.
- The vibe from the athlete's words ("almost died" → wrecked) is saved as the poster's FELT stamp.

### Bugs found while building it (fixed on the branch)
- **The forms pre-fill answers.** The time cap is pre-filled as your time and the Rx weight for your
  sex as your weight — Saturday's 17:00 and 50kg. The forms keep that behaviour (a straight-through
  tap = as written); the chat starts blank.
- **Tiered boards dropped their cash-out/buy-in from logging.** Folding "3 / 2 / 1 rounds of the same
  movements" into one row per movement lost the once-only work around it, so The Ladder's
  "200 DU / 400 singles" had no row and nobody could log singles. Fixed in `createBlankResult`:
  picking nothing saves exactly what it did before; picking singles now saves 400 singles.

## Build order

0. Extract the save + pin it with tests — ships alone, no visible change.
1. Blank-means-blank + `openQuestions` + its tests.
2. The AI fill call + the chat corpus.
3. The chat screen, end to end, behind an admin-only flag (like "Load from Recent").
4. Owner tests it on real workouts → open it to everyone.
