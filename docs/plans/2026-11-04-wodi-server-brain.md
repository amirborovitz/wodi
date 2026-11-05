# Wodi's server brain — plan

*2026-11-04. Status: Phase A built on `feat/server-model` (uncommitted, not deployed). Step 5 of [the agent roadmap](./2026-09-30-wodi-agent.md).*

**Phase A as built:** `functions/src/wodiModel.ts` (callable; key as secret `OPENAI_API_KEY`; limit
`WODI_DAILY_AI_CALLS`, default 150, admins exempt; usage in `aiUsage/{uid}_{day}`), fence in
`functions/src/modelRequest.ts` (+ test). App: `src/services/modelClient.ts` is the one client — the
function in the app, OpenAI direct in Node scripts with `OPENAI_API_KEY`. All seven call sites use it.
New "today's limit" message in Add Workout. Deploy order: secret → function + rules → app → revoke old key.

**Phase B as built (2026-11-05, same branch, uncommitted):** `public/wodi-sw.js` (notifications only — no
fetch handler, never caches). `services/pushNotifications.ts` + `hooks/useWodiNotifications.ts`: the chat's
"Doing it later" line carries a **"Nudge me if I forget"** chip, once per phone (iPhone in Safari gets one
Home Screen line instead). Devices at `users/{uid}/devices/{sha256(token)}` with time zone; refreshed on each
open. Server `functions/src/wodiPush.ts`: `wodiPushOn` (a first push proving it works) and `wodiBoardNudges`
(hourly; 9:00 local; newest board saved 1–3 days ago, never nudged; one a day; line also written to the
thread). Rules: `devices` owner-only, `wodiNudges` server-only. A tap opens the thread (`/?wodi=thread` or
a message to the running app). Needs `VITE_FIREBASE_VAPID_KEY`. This pulled Phase C's first occasion
(unfinished board) forward, with fixed words — no model. Still open in C: note check-in, "stop these".

## Why

Today every AI call runs inside the app on the athlete's phone. That has two costs:

1. **The OpenAI key is in the public app.** `VITE_OPENAI_API_KEY` is compiled into the bundle anyone can
   download. Anyone who opens dev tools can copy it and spend the account. This is a live risk today,
   independent of any assistant plans.
2. **Wodi only exists while the app is open.** It can't send a morning message, a reminder, or anything
   else first, because nothing runs when the athlete isn't looking.

Moving the AI to Firebase Cloud Functions fixes both. Instinct feels like an assistant because it lives
on a server and reaches you; this is that foundation.

## The rule that doesn't change

**The model decides what to look up and how to say it. The app owns every number.** On the server the
tools read the same saved data with the same code the screens use — never a second copy of the logic.

**Unprompted messages must be useful** (owner, 2026-11-04): a to-do or a reminder — "today's back squat,
last time 100 kg", "knee still sore?", "yesterday's board isn't logged". Milestones and totals are
shareable trophies, never a message.

## What exists today

- `functions/` already deploys two callable functions (email sign-in code, via Resend) — so the
  project has Cloud Functions, secrets and Blaze set up.
- AI calls in the app, all through the OpenAI SDK with the browser key:
  - board reading — `services/openai.ts` + `services/parseModel.ts` (photo + text, ~1500 lines of prompt)
  - chat reader — `services/tellWodiReader.ts`
  - Ask Wodi tool loop — `services/wodiAgent/askWodi.ts`
  - Wodi's cheer line — `services/wodiAgent/wodiLine.ts`
  - two older helpers — `services/exerciseClassification.ts`, `services/loggingPatternLearning.ts`
    (each makes its own client — a second path; fold into the one client or delete if unused)
- The agent's facts are pure code: `trainingFacts.ts`, `athleteHabits.ts`, `athleteNotes.ts`,
  `wodiOccasion.ts`, `recordEntries.ts`, `statsAggregation.ts`, `movementRegistry.ts`. Only
  `threadStore.ts` touches Firestore. So the server can import them as they are.
- No service worker and no push notifications. There is a web manifest (installable to home screen).

## Phases — each ships on its own

### Phase A — the key leaves the app (do first, small, no visible change)

One callable function, `wodiModel`, that forwards a model request to OpenAI with the key held as a
server secret. The app's prompts, schemas and post-processing stay exactly where they are; only the
*transport* changes, so every board reads the same as before.

- Server: checks the athlete is signed in; allows only our model (`PARSE_MODEL`) and caps output
  tokens; a per-athlete daily limit (a counter doc, server-only rule) so the endpoint isn't a free
  GPT for anyone with an account; timeout raised for slow photo reads (~120 s); logs tokens per
  athlete so cost per user is finally visible.
- App: `openaiClient` becomes a thin client that calls `wodiModel` — same request in, same message
  out. All seven call sites go through it; the two helpers with their own client are folded in or deleted.
- Remove `VITE_OPENAI_API_KEY` from the app's env, then **rotate the key** (the old one has been public).
- Scripts (corpus, posters, tests) keep calling OpenAI directly from Node with `OPENAI_API_KEY`;
  checks still never spend tokens.
- Gemini path in `parseModel.ts` goes through the same function if we ever switch.
- Risk to watch: photo size (base64 in the request) and +100–300 ms per call. Measure on one real board.

### Phase B — Wodi can reach you (push notifications)

- Add a service worker + Firebase Cloud Messaging. The athlete turns notifications on from the chat
  ("Want me to remind you before class?"), never on first open. Device tokens on
  `users/{uid}/devices` (owner-only rules, in the same change).
- iPhone reality: web push works only when Wodi is added to the home screen (iOS 16.4+). The ask
  should say so in one line when the app isn't installed.
- A notification opens the chat at the message; the same words are in the thread
  (`users/{uid}/wodiThread`), so there's one record of what Wodi said.
- Alternative channel kept open: WhatsApp/SMS (Twilio). Most Instinct-like — text a board photo, get
  questions back — but costs per message and needs WhatsApp Business approval. Decide after push is live
  and we see whether people turn it on.

### Phase C — Wodi speaks first, usefully

A scheduled function (e.g. every morning, per athlete's time zone) runs `pickOccasion`-style rules on
the server: **the app picks the moment, the AI writes the words, numbers checked**
(`usesOnlyFactNumbers`). Only useful occasions:

- **Unfinished board** — a saved board from yesterday not logged yet. → "Finish yesterday's board?"
- **Note check-in** — an injury/goal note 7–30 days old. → "Knee still bothering you?"
- **Before class** (needs Phase D) — today's programming + their last loads on its movements.

Limits: at most one unprompted message a day, quiet hours, one-tap "stop these". Every occasion is one
entry + one test, like `wodiOccasion.ts` today.

### Phase D — knowing today's workout (plan separately)

The best morning message needs the day's programming before class. Options, cheapest first:
the athlete forwards/pastes it; the gym's public page or feed; SugarWOD/Wodify integrations.
Ask-permission model, never the athlete's passwords. Too open to plan now — decide after Phase C.

### Later — the agent itself moves server-side

Once A–C are live, the Ask Wodi tool loop can move into a function too, so its tools read Firestore
with admin rights instead of the app sending the whole log. Not needed for the key or for push, so not
first.

## Shared code between app and server

`functions/` is its own package and can't import `src/` today. Bundle the function with esbuild so it
imports the pure modules from `src/` directly — one copy of the logic. Anything the server needs that
reads `import.meta.env` or the Firebase client SDK stays out of the shared set.

## Tests (write first where it routes)

- `wodiModel`: rejects signed-out calls, other models, oversize output, over-limit athletes — tested
  with a fake OpenAI, no network.
- The app's client adapter: same request in → same message out, against a recorded response.
- Occasions: one test per occasion, including "nothing useful today → say nothing".
- Corpus + posters must be byte-identical before/after Phase A (transport-only change).

## Decisions for the owner

1. Daily AI limit per athlete — suggest ~40 calls/day to start (a heavy logging day is ~10).
2. Morning message time — fixed (e.g. 7:00 local) or learned from when they usually log?
3. Push first, or go straight to WhatsApp?
