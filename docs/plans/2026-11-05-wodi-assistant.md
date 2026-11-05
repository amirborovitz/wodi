# Wodi as a real assistant: "ask it almost anything"

*2026-11-05. Owner: "the app should be like Instinct for workouts (later for any type) — that it can handle almost anything."
Reframes [the agent roadmap](./2026-09-30-wodi-agent.md); the server work in [server brain](./2026-11-04-wodi-server-brain.md) is
its foundation.*

## Why it can't today

Wodi is a **logging flow with a question-answerer bolted on**, not an assistant:

1. **It can read, not act.** Ask Wodi's tools only look things up (workouts, records, totals, habits) plus `log_workout`
   and `propose_note`. It can't create a workout, plan a week, set a reminder, fix a past log, or change a setting. So
   "give me an open gym WOD" gets four lines of text that go nowhere.
2. **The app decides which brain hears you.** `chatRouting.ts` sends a message to Ask Wodi only when no board is open.
   Mid-log, everything goes to the board's answer reader, so "what did I squat last time?" or "remind me to stretch"
   lands in the wrong place.
3. **Every new ability has been a new branch** (park, game plan, nudge offer, remember…) in a 950-line hook. That
   doesn't scale to "almost anything".

## The shape: one brain, many hands

- **One front door.** Every typed message goes to the agent, with what's on screen as context (the open board, its
  open questions). The agent picks what to do; the logging flow becomes a set of tools it calls.
- **Hands = action tools.** Each is a small, tested app function. The model chooses and fills it in; the app does it.
  The trust rule doesn't change: **the model writes words and board text; the app owns every number** (loads come
  from the log, totals from `aggregateStats`, EP from `computeWorkoutEP`).
- **Honest about the edges.** When nothing fits, Wodi says what it can do instead, and the request is recorded
  (`agentGaps`, like `loggingGaps`). What people actually ask decides the next tool, not a guess.

## Steps, each shippable on its own

1. **Front door + gaps log.** Every message goes to the agent, including mid-log. The answer reader becomes its
   `answer_board` tool. Pin today's routing with tests FIRST (CLAUDE.md: routing changes need a test that pins
   current behaviour).
2. **`create_workout`** — "open gym WOD", "20 min, dumbbells only", "something for my weak spot". The agent looks at
   the last 7–10 days, this week's focus and the athlete's notes, then writes a board. The app reads it with the same
   board parser, so it appears as a board in the chat: Doing it now / later, game plan, last loads, log, poster.
   One line on why it picked it. It never names a weight; the load card does.
3. **`set_reminder`** — "remind me Thursday to do the deadlift workout" → a push at that time, also in the thread.
   Uses the Phase B notification plumbing.
4. **`plan_week`** — a few sessions for the week, saved as boards for later. The weekly focus feeds it.
5. **`edit_log`** — "Tuesday's squat was 105, not 100" → the same save path as the poster's edit, said back first.
6. **The brain moves to the server** (server brain plan, "later" section). The tools read Firestore directly; Wodi
   can act while the app is closed, and WhatsApp becomes possible.
7. **Other sports.** Tools speak in sport-neutral shapes (session → part → movement → result); Hyrox and running
   first, as the roadmap says.

## Built (2026-11-05, branch feat/wodi-assistant, uncommitted)

**Steps 1 + 2.**
- **Mid-log front door, without a second AI call per answer.** The chat's answer reader now says what each message IS:
  `messageIs: answer | before-workout | for-wodi` (it replaced the `beforeWorkout` boolean). `routeReading`
  (chatRouting.ts, tested) sends `for-wodi` to Ask Wodi with `situation: logging`. The logging then carries on;
  a parked board stays parked, with "Done — log it" on the answer.
- **Ask Wodi takes a situation** (`between | logging | upcoming`), which picks its tools. `create_workout` and
  `log_workout` are offered only between workouts, and a tool that wasn't offered is never acted on.
- **`create_workout`** → the chat reads the board text with the same parser, shows it as a board card with Wodi's
  "why", and offers "Let's do it" (the heading-in flow: loads, game plan, park, nudge offer) or "Something else"
  (the board is let go and a different one is written).
- **`note_gap`** → `agentGaps` (append-only, admin read; rules in the same change) + the `wodi_gap` analytics event.

## Rules that carry over

- No numbers from the model ([[poster truth]], AI-trust baseline). A tool returns them, or they're not said.
- Wodi never pushes you out of the chat (feedback_chat_never_leaves_chat).
- Unprompted messages must be useful (feedback_proactive_must_be_useful).
- Specific, honest, always positive; never "nice work" (feedback_wodi_real_assistant_honest_specific).
- Cost: one agent turn per message, at most a few lookups. Plain answers (a time, a number) are still read by the
  app, never the AI (feedback_plain_answers_not_ai).
