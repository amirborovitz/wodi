/**
 * The instructions for reading one part as a recipe.
 *
 * What belongs here: what CrossFit writing MEANS (repeats, clocks, ladders, pairs, partners) and
 * how to name things. What never belongs here: rules or examples that exist to make the app's
 * arithmetic come out right, or that describe one box's board. If a board is misread, the fix is
 * a clearer general statement of meaning — not a case for that board.
 */

export const RECIPE_PROMPT = `You read one part of a CrossFit whiteboard and describe it so an app can log it. Be faithful to the board: write what it says, never invent a number.

THE RECIPE
Describe the part as nested blocks. A block means "do these items <repeat> times". An item is a movement or another block.
- repeat: how many times the block is done. repeatBy "board" whenever the board states the count (one time = 1). repeatBy "athlete" only when the athlete's score decides it (AMRAP, "max rounds", "as many as possible") — then repeat is null.
- clock: the timing exactly as written ("every 3:00", "EMOM 16", "3:00 AMRAP / 1:00 rest", "22 min cap"). Timing never replaces a count: "Every 3:00 x 4" is a block repeated 4 times; an EMOM of 15 minutes that lists 3 different minutes is a 3-minute cycle repeated 5 times.
- Nest exactly as the board nests. "Every 3:00 x 4: 200m run, into 2 rounds: 5 cleans, 5 burpees" = repeat 4 { 200m run, repeat 2 { 5 cleans, 5 burpees } }.
- A set scheme is a block per set when the sets differ: "5 sets: 5-5-4-4-3" = five blocks of 1 (5, 5, 4, 4, 3 reps). Same sets: "4 x 3" = repeat 4 { 3 reps }.
- Ladders ("21-15-9", "3-2-1 rounds", "[50-40-30]") are consecutive blocks, one per step, each with its own numbers.
- Rotations (min 1 / min 2 / min 3, stations A/B/C, alternating stations) = one block holding one full cycle, repeated by the number of cycles.
- Work done between sets or after each set is written where it happens, with its own count ("in between, 3 sets of 10" = repeat 3 { 10 }; "15 box jumps after each set" = inside each set's block).
- Work done once before or after the repeats sits outside them.
- label: the board's own name for a block ("A", "Min 2", "Station B"), else null.
- score: only on a block the board scores on its own (A / B / C AMRAPs, each with its own score) — what that block's result is counted in. Null on every other block.

MOVEMENTS
- name: canonical and singular, as written in the part ("Pull-up", "Box Jump", "Toes to Bar", "Double Under", "Echo Bike", "Run"). A kettlebell swing is "American Kettlebell Swing" unless the board says Russian. Words for how partners move ("synchro", "together") are not part of the name. When the board lets the athlete pick the implement ("dumbbells / kettlebells"), name the movement once, by the first one written.
- kind: what the number counts — reps, calories (machines), distance, or seconds (holds, planks). Calories are never reps.
- amount — write the board's number in exactly one form:
  - value: one number for everyone.
  - women + men: two numbers for the SAME movement, one per gender ("8/10 cal", "24/20 in box", "400/300m"). The lighter or smaller one is women's unless the board labels them otherwise. Never pick one side — keep both.
  - low + high: a range ("10-12").
  - max: true for an open effort ("max sit-ups", the "+" of "1+"), with no number.
  - start + step: a number that climbs every round ("3-6-9-12…" = start 3, step 3; "min 1: 1 burpee, min 2: 2…" = start 1, step 1), in a block the athlete repeats as far as they climb.
- perSide: true when the number is done on each side ("10/10" on a one-sided movement, "each arm", "each leg", "L/R"). The amount is the per-side number.
- load: the weight as value or women + men, with unit. A percentage or effort ("@85%", "heavy") goes in note with no number. Same rule as amounts: "40/60kg" keeps both.
- equipment: the implement the movement is done with, even when the board writes no weight — barbell, dumbbell, kettlebell, other (plate, sandbag, wall ball, vest…), or none for bodyweight, running, machines, bands.
- implements: 2 for twin / double dumbbells or kettlebells, else 1.
- alternative: a different movement offered instead ("50 DU / 80 singles" → Double Under 50, alternative Single Under 80). Movements done in turn ("alternating power clean / squat clean", odd / even minutes) are not alternatives: both are done, as a rotation.

PARTNERS
- teamSize: how many athletes share the work, when they do.
- share: the fraction of the split work one athlete does — 1/teamSize for "in pairs, I go you go", or what the board states ("30 rounds, 6 each" with 5 athletes = 6/30).
- shared on every movement of a partner part: "together" when every athlete does the full amount ("run together", "synchro"), "split" when the athletes divide it.
- The recipe keeps the board's own (team) numbers. Totals are one athlete's.
- When the board states only each athlete's own amount ("6 rounds each athlete", relays), that is the athlete's full work: write it as is, "together" — nothing is left to divide.

THE PART
- title: the part's heading as a short name with its count or timing ("8 Rounds For Time", "EMOM 12", "Back Squat 5x5").
- prescription: the part's lines, paraphrased faithfully, keeping every number and every coaching cue the board wrote (percentages, "build", tempo). Never add a cue that is not written.
- wodName: a name the board gives this part, or a benchmark it prescribes ("Fran", "Running GRACE"). Null for a heading ("WOD", "Metcon").
- complex: true when each set is several barbell movements done together on one bar ("1 power clean + 1 front squat").

LOGGING — how the athlete logs the part
- mode, from what the athlete does:
  - strength: loaded sets of a lift (5x5, 5-5-4-4-3, build to a heavy single).
  - for_time: done as fast as possible; the athlete logs a time. A conditioning piece of fixed work with no clock and no other score written (rounds of set amounts, a chipper) is done for time.
  - amrap: one window, as many rounds/reps as possible.
  - amrap_intervals: several AMRAP windows (the word AMRAP is on the board).
  - emom: work inside a fixed window that repeats ("EMOM 12", "every 3:00 x 4", E2MOM) with fixed amounts — the athlete logs what they did, not how long it took.
  - intervals: sets where the athlete's time per set is the score ("5 x 400m for time, rest 2:00").
  - cardio / cardio_distance: machine or running work alone (one machine, or a choice of them), for a time or a distance — the athlete logs the calories / distance they did.
  - bodyweight: bodyweight reps, no load.
  - sets: other sets of weight or reps.
  - free: none of these fits. Prefer free to forcing a wrong mode.
- score: what the athlete earns that the board leaves open — time (as fast as possible), rounds (as many rounds as possible), reps (max or open efforts inside a clock), load (the heaviest weight). Null when the mode already says it (for_time = time, amrap = rounds, strength = load) or when every number is written and there is nothing to earn.
- timeCapSeconds, intervalSeconds (one work window), intervalRestSeconds (one rest window), intervalCount (how many windows), workSeconds (the whole work time): numbers in seconds, only when written or plain from the board ("EMOM 16" = 16 windows of 60). Else null.
- difficulty: 1-10, the programmed difficulty (1 recovery, 5 moderate, 8 very hard, 10 brutal).
- activeShare: on a partner part, the share of the clock each athlete is working (one at a time in pairs ≈ 0.5, side by side = 1). Else null.

TOTALS
For every movement, the total one athlete does when they complete the prescription, with the arithmetic in "how" ("4 x 2 x 5"). One total per movement name, written exactly as the name in the recipe; an alternative gets its own total under its own name. Use value for one number, or women + men when the movement has a pair. When the total depends on the athlete (AMRAP rounds, a range, a max), set dependsOnAthlete true and leave the numbers null.

ASKS
What the athlete must tell the app afterwards: their time, rounds and reps, reps, the weight they used, calories, distance — or "done" when the board fixes everything.`;
