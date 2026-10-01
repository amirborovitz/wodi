# Wodi as an agent — roadmap

*2026-09-30. Status: steps 1 + 4 built on `feat/ask-wodi`; Tell Wodi opened to all users 2026-10-01.*

## The idea

Muse and Instinct are agents you text: they remember you, look things up, and act for you. Wodi's
version is a training partner that already knows your log. Tell Wodi (log by chatting,
[plan](./2026-09-28-tell-wodi-chat.md)) is the front door; this plan turns it into an agent in steps
that each ship on their own.

## The rule every step keeps

**The model decides what to look up and how to say it. The app owns every number.** The agent
reaches the athlete's data only through tools that read the same saved data the screens read.
It may compare numbers the tools returned; it never produces one. Same principle as Tell Wodi's
"the app decides what to ask".

## Steps

1. **Ask Wodi about your training** — BUILT. In the Tell Wodi chat, a typed first message goes to
   Ask Wodi, which either answers from the log or hands it back as a workout to log (the model's
   call, via a `log_workout` tool — no keyword list). A photo still always reads the board.
   Tools: `find_workouts`, `personal_records`, `training_totals`.
2. **Questions mid-conversation** — "what did I do last time on this?" while logging a board. Today
   only the first message (before a board) reaches Ask Wodi.
3. **Fix it by chatting** after the poster ("no, 35 kg") — already item 1 of Tell Wodi's "later".
4. **Memory of the athlete** — BUILT (same branch). Two kinds, handled differently:
   - **Habits, read off the log, never stored** (`athleteHabits.ts`): "swaps Run → Echo Bike",
     "picks singles over DU". Last 6 sessions with that movement; a habit = ≥2 swaps and ≥60%.
     In the chat a habit becomes a QUESTION with the usual answer first ("Echo Bike again instead of
     the Run?" · [Echo Bike again] [Did the Run]); on a board choice the usual side goes first.
     Never pre-filled (owner decision 2026-09-30). Ask Wodi has an `athlete_habits` tool.
   - **Notes, only what the athlete says** (`athleteNotes.ts`, `user.wodiNotes` on the private user
     doc): injury, goal, kit, style. Wodi proposes ("Want me to remember that?"), the athlete taps
     Remember — no write without it (owner decision). Read by Ask Wodi, the chat reader and the
     weight advice. Listed on Me in "What Wodi knows" with Forget, habits shown read-only.
4b. **One ongoing thread + per-poster chats** (agreed 2026-10-01). Storage stays per workout (each
   poster keeps the chat it was logged in). Today gets ONE ongoing conversation for everything
   between workouts — questions, pre-class advice, Wodi's morning message, "want me to remember
   that?". A logged workout appears in it as ONE poster card; tapping it opens the chat behind it.
   The thread shows ~2 recent weeks and loads older on scroll; the AI only ever reads recent turns +
   tools, so length never costs anything. Pairs with the Today redesign (Wodi's message on top, one
   "Tell Wodi…" composer at the bottom, forms one tap away).
   BUILT 2026-10-01 on `feat/wodi-thread` (uncommitted): between-workouts messages in
   `users/{uid}/wodiThread` (owner-only rule — DEPLOY RULES WITH THE APP), `buildThreadItems` (tested)
   merges them with poster cards + parked boards; a workout's saved chat now starts at its board
   (questions before it stay in the thread). Today: `WodiMessageCard` (observation in Wodi's bubble)
   on top, `TodayComposer` pinned above the nav (+ = forms, bar = thread, camera = photo sent into the
   chat); the old "Add a workout" / "Tell Wodi" buttons and Today's never-opened photo picker deleted.
   Then the Claude Design pass (same day): Wodi's message is one bubble on Today and in the thread;
   nav docked as one surface with the composer; "+" sheet; poster cards show the poster's result;
   answers attach the posters they quote ("receipts"); yellow cut to camera / key number / PR;
   neutral user bubbles; white active tab; no greeting; posters ~30% bigger.
5. **Server side** — the agent moves to a Cloud Function: the OpenAI key leaves the app, and Wodi can
   speak first (weekly recap, "6 days since your last log"). Needs Blaze + a push/messaging channel.
   This is the big investment; plan it on its own before starting.
6. **Outside the app** — gym programming feed, calendar, class booking. Ask-permission model (Muse),
   never the athlete's passwords (Instinct).
7. **Other sports** — Hyrox first (same crowd, stations + runs). Generalise the model
   (session → blocks → efforts, each with a clock, a load, a score) before adding a sport; a sport is
   then a pack of vocabulary + parse prompt + scoring + poster faces, never a branch.

## Step 1 — as built

- `services/wodiAgent/trainingFacts.ts` — the facts, pure and tested: workouts in the export shape
  (`buildWorkoutExport`), records from the Records screen's builders (moved to
  `services/recordEntries.ts`), totals + EP from `aggregateStats`. A movement the registry knows is
  matched by family (a deadlift question doesn't return SDHPs); an unknown name by its letters.
- `services/wodiAgent/askWodi.ts` — the tool loop. At most 4 rounds of lookups, then it must answer.
  The model is injectable, so the loop is tested with a scripted one.
- `components/tellWodi/chatRouting.ts` — the chat's one routing rule, pinned by a test written before
  the change (photo → board; words, no board → Ask Wodi; board → its open questions).
- `components/tellWodi/useAskWodi.ts` — wires it to the athlete's log; records are read from
  Firestore only when a question first needs them.
- AddWorkoutScreen now loads the whole log (same single read — `useWorkouts` slices after fetching).

Live check on sample data (not the owner's): "what did I deadlift last month?" → 120 kg × 20 on 20 Aug;
"how many times this month?" → 3, with the days; "Fran 5:42, 42.5kg…" → handed to logging;
"what did I bench last?" → "I don't see any bench press logged."

### Open
- An answer is text only; showing the workouts it found as tappable cards is the obvious next polish.
- Each text-first log now costs one extra model call (~1–2 s) before the board read.
- No "ask corpus" yet — a replayable set of questions and the facts they must cite, like the parse corpus.
