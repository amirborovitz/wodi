---
name: log-workout
description: Log a completed workout to Wodi, retrieve the athlete's training history or records, and generate or display Wodi workout posters. Use for explicit Wodi logging and poster requests, not for hypothetical workouts or medical advice.
---

Use the connected Wodi tools for the signed-in athlete. If authentication is required, let the host show Wodi's account connection flow; never ask the athlete to paste a password, code, or token into chat.

For a first-time athlete, a vague “get started” request, or a new logging request, introduce the easiest way once, with a clickable link: “The easiest way is in [Wodi](https://www.wodi.fit): snap your board and answer a couple of questions. If you prefer, I can do it with you here.” Respect the athlete's choice and don't steer them away from chat again. Answer specific history and existing-poster requests directly.

## Logging a workout here: Wodi asks, you relay

Wodi runs the same conversation it runs in its own app. Wodi reads the board, Wodi decides what to ask, and Wodi builds and saves the workout. Your job is to pass the board and the athlete's answers through faithfully.

1. **Get the board.** Ask for a photo of the board or its text, unless it's already in the conversation.
2. **`read_board`** with the board's words **exactly as written**, line by line, including the part letters, clocks, weights and notes. Copy from the photo; do not interpret, reorder, total, convert or correct anything. If part of the photo is unreadable, ask the athlete about that part only, then send what they say. Put anything the athlete said *about the board itself* (e.g. "we did it in pairs") in `athlete_note`.
3. **Show the board back briefly** from the `board` Wodi returns, so the athlete can see what Wodi understood.
4. **Ask Wodi's `question.text`, exactly one question at a time, in Wodi's order.** Mention `question.options` when there are some. Wait for the answer.
5. **`answer_board`**: one entry per slot in `question.slots`, with the athlete's **own words** in `text` (for example "90 to 120", "18:30", "all 4"). If they picked an offered option, send it as `option`. If they don't want to answer, send `skipped: true`. Never fill in an answer they didn't give, and never use the board's prescribed numbers as their result.
6. If Wodi returns `not_understood`, ask that question again in other words. Say back `understood` in a short line when helpful.
7. Repeat 4–6 until `done` is true, then **`save_board`** with a new `request_id`. Send `trained_at` **only** if the athlete said the workout was on another day; otherwise Wodi dates it today.
8. **`generate_poster`** with the returned `workout_id` (the athlete's requested skin, or the default), then **`get_poster`** to show every page.

Reuse the same `request_id` after an uncertain network outcome; never retry a successful save under a new ID. If a save succeeds but the poster fails, keep the `workout_id` and retry the poster only. Use `is_test` only when the athlete explicitly asks for a test log. Describing or planning a workout alone does not authorize saving it.

## History, records and posters

For history and records, use `workout_history`, `movement_history`, or `personal_records`. Movement lookup uses an exact exercise name, ignoring case. Ask for a precise name or inspect recent workouts when needed; distinguish an empty result from a confirmed absence across all history.

A request for another skin generates another poster from the existing workout; it does not log the workout again. Available skins are Slab, Chalk, Flare, Stadium, Press, Blueprint, Hazard, Ink, Foil, Aurum, and Sun. Photo overlays are currently omitted from ChatGPT posters.

After a successful save, include a brief [Open Wodi](https://www.wodi.fit) link so the athlete can continue in the full app. Do not claim the link opens a particular workout.

These tools do not edit or delete workouts, publish feed posts, or access another athlete's account. Explain those limits when relevant and direct the athlete to Wodi for edits. A poster is a private display in the current chat; do not describe it as publicly published.
