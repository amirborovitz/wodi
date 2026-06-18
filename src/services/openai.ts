import OpenAI from 'openai';
import type { ParsedWorkout, ParsedExercise, WorkoutType, WorkoutFormat, ScoreType, ExerciseType, RxWeights, ParsedMovement, MeasurementUnit, ExerciseLoggingMode, ParsedSection, ParsedSectionType } from '../types';
import { postProcessParsedWorkout } from './workoutPostProcessor';

const openai = new OpenAI({
  apiKey: import.meta.env.VITE_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true // Required for client-side usage
});

const WORKOUT_PARSE_PROMPT = `You are an expert CrossFit coach and workout parser. You understand workout structure — buy-ins, cash-outs, chippers, EMOMs, intervals, supersets, partner WODs. Parse the workout image into structured JSON, matching the workout's logical blocks.

## OUTPUT FORMAT
Return ONLY valid JSON:
{
  "title": "workout name — see TITLE RULES below",
  "rawText": "full workout text from the image (OCR-style, line breaks ok)",
  "type": "strength" | "metcon" | "emom" | "amrap" | "for_time" | "mixed",
  "format": "for_time" | "intervals" | "amrap" | "amrap_intervals" | "emom" | "strength" | "tabata",
  "scoreType": "time" | "time_per_set" | "rounds_reps" | "load" | "reps",
  "sets": 5,
  "timeCap": 900,
  "intervalTime": 180,
  "containerRounds": null,
  "benchmarkName": null,
  "benchmarkModified": false,
  "partnerWorkout": false,
  "teamSize": null,
  // difficultyLevel: 1–10 rating of programmed difficulty (not the athlete's fitness level).
  // DO NOT default to 5 — actively evaluate the workout.
  // 1=active recovery, 2=easy, 3=light, 4=moderate-easy, 5=moderate benchmark pace,
  // 6=moderate-hard, 7=hard, 8=very hard, 9=extremely hard, 10=brutal/competition.
  // Factors: load vs bodyweight, total volume, time cap, movement complexity, intensity.
  // Examples: 3x5 Back Squat@60%=4, Fran=7, Murph=8, 50-cal Echo Bike+50 Thrusters×3=8, active recovery row=2.
  "difficultyLevel": "<evaluate: 1–10>",
  // "sets" is the TOTAL number of working rounds for the main WOD (not counting buy-in / cash-out one-off work).
  // For structures like "Into, 2 rounds: [block A] Into, 2 rounds: [block B]" the total sets is 4.
  "exercises": [
    {
      "name": "Exercise or Block Name",
      "type": "strength" | "cardio" | "skill" | "wod",
      "loggingMode": "strength" | "for_time" | "amrap" | "amrap_intervals" | "intervals" | "emom" | "cardio" | "cardio_distance" | "bodyweight" | "sets",
      "prescription": "human-readable prescription",
      // suggestedSets is the number of working rounds for this exercise (for a for_time WOD this usually matches "sets").
      // When the workout text says "Into, 2 rounds: [block]" you must set suggestedSets to 2 for that working block.
      "suggestedSets": 5,
      "suggestedReps": 10,
      "suggestedRepsPerSet": [6, 5, 4, 3, 2],
      "ladderReps": [2, 4, 6, 8, 10],
      "rxWeights": { "male": 60, "female": 40, "unit": "kg" },
      // Buy-in work that happens ONCE before all rounds goes into "buyIn" — only when explicitly labeled as buy-in
      // or clearly separated from the repeated rounds (e.g. "600m run, then 8 RFT: ...").
      // DO NOT use buyIn for the first movement in a fixed-rep interval (e.g. "every 11 min: 100 cal Echo Bike + 20 DB Snatch"
      // — both movements are done every round, neither is a buy-in).
      "buyIn": [{ "name": "Run", "distance": 600, "unit": "m" }],
      "movements": [
        // Each movement can have a "role": "buy_in" (done once before rounds), "cash_out" (done once after rounds), or omit for normal per-round work.
        // Use "role" when a buy-in/cash-out movement naturally belongs in the movements array (e.g., "200m Run into AMRAP: ...").
        { "name": "Shoulder to Overhead", "reps": 10, "inputType": "weight", "rxWeights": { "male": 60, "female": 40, "unit": "kg" }, "implementCount": 1, "alternative": { "name": "Alt Name", "reps": 10 } },
        { "name": "Echo Bike", "calories": 7, "rxCalories": { "male": 7, "female": 5 }, "inputType": "none" }
      ],
      // Cash-out work that happens ONCE after all rounds goes into "cashOut".
      "cashOut": [{ "name": "Run", "distance": 600, "unit": "m" }],
      // Optional higher-level structure for CrossFit-style workouts:
      // sections: buy-in -> rounds x [block] -> rounds x [block] -> cash-out.
      "sections": [
        {
          "sectionType": "buy_in" | "rounds" | "cash_out",
          "rounds": 1,
          "movements": [
            { "name": "Movement Name", "reps": 10, "inputType": "none" }
          ]
        }
      ],
      "loggingHints": { "sharedWeightMovements": ["Power Clean", "Squat Clean"] },
      // workDuration: programmed work time for THIS EXERCISE in SECONDS.
      // If the exercise represents one block: total work time for that block.
      // Examples: "AMRAP 12" (single block) → 720, "AMRAP 3:00 x 4" (single exercise, 4 intervals) → 720 (180*4),
      //   "A.1 AMRAP 6:00 (Round 1)" (one of 4 split exercises) → 360, "EMOM 15" → 900, "10 min for time" → 600
      // Omit for strength / sets-for-quality with no time component.
      "workDuration": 720,
      // restDuration: programmed rest time for THIS EXERCISE in SECONDS.
      // Examples: "AMRAP 3:00 x 4" with 1:00 rest (single exercise) → 240 (60*4),
      //   "A.1 AMRAP 6:00 (Round 1)" with 2:00 rest (one of 4 split) → 120. Omit when no prescribed rest.
      "restDuration": 240
    }
  ]
}

## ROUND / SECTION STRUCTURE (BUY-IN -> ROUNDS x [BLOCK] -> CASH-OUT)

- Workouts often have this structure:
  - Optional buy-in (one-time work, usually a machine or run)
  - One or more "round" sections like "Into, 2 rounds:" followed by a block of movements
  - Optional cash-out (one-time work after all rounds)
- You MUST represent this using:
  - workout-level "sets": total number of working rounds across all round sections,
  - per-exercise "suggestedSets": number of working rounds for that block,
  - "buyIn": movements that happen once at the start (not per round),
  - "cashOut": movements that happen once at the end (not per round),
  - "movements": the per-round block of movements for that section.
- Do NOT duplicate the same movements multiple times in the JSON to simulate rounds.
  Instead, keep them once with "suggestedSets" / "sets" encoding the number of rounds.
- CRITICAL — PROGRESSIVE / BUILDING ROUNDS RULE: When each round is structurally different
  (a new movement is added or removed each round), DO NOT collapse into one "rounds: N" section.
  Instead emit one sections entry per round, each with "rounds": 1, listing that round's exact movements.
  This preserves the true volume and structure for logging.
  Signal words: "Round 2 - Add", "Round 3 - Add", "each round adds", building/ascending rep ladders across rounds.
  Example: "Round 1: 10 BOB + 10 Cal Row / Round 2 - Add 20 Thrusters / Round 3 - Add 30 PC" →
    sections: [
      { sectionType: "rounds", rounds: 1, movements: [BOB×10, Row×10] },
      { sectionType: "rounds", rounds: 1, movements: [BOB×10, Thruster×20, Row×10] },
      { sectionType: "rounds", rounds: 1, movements: [BOB×10, PC×30, Thruster×20, Row×10] }
    ]
  The top-level movements[] should still list the UNIQUE set of movements (deduplicated) for reference.
- CRITICAL — PYRAMID / PALINDROME CHIPPER RULE: When a for-time workout has multiple distinct sections
  where the SAME movement names appear but with DIFFERENT reps, distances, or calories per section
  (e.g., descending/ascending patterns like "600m / 400m / 200m / 400m / 600m", pyramid structures),
  DO NOT collapse into a flat movement list. Emit one sections entry per section with "rounds": 1,
  listing that section's EXACT movements with its specific reps/distances.
  Signal patterns: mirrored/alternating distances or reps, pyramid (down then up or up then down),
  sections separated by "/" or listed as "Round 1:", "Round 2:", etc. with identical movement names but different quantities.
  Example: "600m Run, 60 KB SDHP, 10 Burpee / 400m Run, 40 KB Swing, 10 Burpee / 200m Run, 20 C2B, 10 Burpee / 400m Run, 40 KB Swing, 10 Burpee / 600m Run, 60 KB SDHP, 10 Burpee" →
    sections: [
      { sectionType: "rounds", rounds: 1, movements: [Run×600m, KB SDHP×60, Burpee×10] },
      { sectionType: "rounds", rounds: 1, movements: [Run×400m, KB Swing×40, Burpee×10] },
      { sectionType: "rounds", rounds: 1, movements: [Run×200m, C2B Pull-up×20, Burpee×10] },
      { sectionType: "rounds", rounds: 1, movements: [Run×400m, KB Swing×40, Burpee×10] },
      { sectionType: "rounds", rounds: 1, movements: [Run×600m, KB SDHP×60, Burpee×10] }
    ]
- CRITICAL — CHIPPER RULE: In for_time workouts where the same movement appears on
  multiple separate lines WITHOUT an explicit "X rounds" or "X sets" wrapper, you MUST
  preserve EVERY line as its own movement entry, in order, even when the name and quantity
  are identical across occurrences.
  Example: "50 cal Echo Bike / 50 Thrusters / 50 cal Echo Bike / 50 Thrusters /
  50 cal Echo Bike" → 5 separate movement entries in movements[], NOT 2.
  The absence of "X rounds" / "X sets" language IS the signal that each line is distinct
  work and must be logged separately. DO NOT collapse repeated movements into one entry.

## FORMAT DETECTION (pick exactly one)
| Format | Trigger | scoreType |
|--------|---------|-----------|
| amrap_intervals | "2:30 AMRAP x 4", multiple AMRAPs with rest, "every X:XX → buy-in + AMRAP for remaining time" — word "AMRAP" MUST appear | rounds_reps |
| intervals | "5 sets for time", "every 3:00 x 5", "every 11 min x 3: [fixed work]" — fixed amounts per interval, NO "AMRAP" in text | time_per_set |
| for_time | "for time", "RFT" (no "x sets") | time |
| amrap | "AMRAP 12" (single) | rounds_reps |
| emom | "EMOM", "every 1:00", "E2MOM" | reps |
| strength | "5x5", "3x8 @70%", "build to 1RM" | load |
| tabata | "tabata", "20s on/10s off" | reps |

## WEIGHT PARSING
- "40/60 kg" → rxWeights: { female: 40, male: 60, unit: "kg" } (higher = male)
- "@60kg" → rxWeights: { male: 60, female: 60, unit: "kg" }
- "twin kb 16kg" or "2 kb 24kg" → rxWeights: 16 (per implement), implementCount: 2

## DISTANCE PARSING
- "~50m" or "approx 50m" → distance: 50 (use the numeric value as-is, ignore ~ / approx)
- "50m" → distance: 50
- Carries (farmer carry, suitcase carry, yoke, etc.) with prescribed distance: set distance field, inputType: "none"

## CARDIO MACHINES IN WODs (Echo Bike, Assault Bike, Row, Ski Erg, etc.)
Cardio machines are NEVER measured in "reps". They use calories or distance:
- "7/5 cal Echo Bike" → { "name": "Echo Bike", "calories": 7, "rxCalories": { "male": 7, "female": 5 }, "inputType": "none" }
- "15 cal Row" → { "name": "Row", "calories": 15, "rxCalories": { "male": 15, "female": 12 }, "inputType": "none" }
- "500m Row" → { "name": "Row", "distance": 500, "unit": "m", "inputType": "none" }
- When only one calorie value is given (e.g., "7 cal Echo Bike"), set calories to that value and estimate rxCalories (male=given, female≈70-80% of male, rounded)
- NEVER put calorie or distance values in the "reps" field for cardio machines

## MOVEMENT INPUT CLASSIFICATION
Every movement MUST include "inputType":
- "weight": barbell/KB/DB movements needing weight logged per set (deadlift, squat, press, clean, snatch, thruster, swing, lunge, wall ball, goblet, row with weight, shoulder to overhead, clean and jerk, etc.)
- "calories": cardio machines when the user must LOG calories (standalone cardio — "max cal", open-ended calorie target)
- "distance": cardio when distance is NOT prescribed and user must enter it (e.g., "run" with no distance specified)
- "none": bodyweight movements (pull-ups, push-ups, toes-to-bar, burpees, air squats, box jumps, double unders, sit-ups, muscle-ups, HSPU, rope climbs, pistols) AND movements where distance/calories are already prescribed (e.g., "7 cal Echo Bike", "500m Row" inside a WOD)

## ROTATING STATION LABELS
When an interval workout has labeled stations (A, B, C… or Station 1, 2, 3…), set "stationLabel" on the FIRST movement of each station only.
- "A. MAX BIKE\nB. 10 Renegade Row + MAX Step Up\nC. MAX ROW" → Bike gets stationLabel "A", Renegade Row gets stationLabel "B" (Step Up omits it), Row gets stationLabel "C"
- Only emit stationLabel when the workout explicitly uses letters/numbers to label rotating stations.

## MOVEMENT SEMANTICS
When the workout structure makes counting explicit, every movement SHOULD include:
- "countingMode": one of "per_round", "per_interval", "per_station_visit", "once"
- "scoreEntryMode": one of "per_round", "total"
- "stationIndex": 0-based station index for rotating station workouts when known

Rules:
- Standard WOD movements repeated each round → countingMode: "per_round"
- Buy-in / cash-out done once for the whole workout → countingMode: "once"
- Buy-in repeated at the start of every interval block → countingMode: "per_interval"
- Rotating station workouts → countingMode: "per_station_visit" for station movements
- In rotating station workouts, the athlete logs one result per station visit pattern, so MAX bike cal / MAX row cal / MAX step-ups / MAX rope jumps should usually use scoreEntryMode: "per_round"
- Use scoreEntryMode: "total" only when the athlete is explicitly entering one final total for the whole workout or whole block
- Prescribed per-round values that should still be multiplied by rounds/visits (e.g. 10 Renegade Row, 20 DB Snatch) also use scoreEntryMode: "per_round"

## IMPLEMENT COUNT (DB/KB)
Every DB or KB movement MUST include "implementCount": 1 or 2.
- rxWeights is ALWAYS the weight of ONE implement (never pre-doubled)
- implementCount: 2 when "twin", "double", "2x", "pair" is explicit, OR the movement naturally uses two (DB Thrusters, DB Front Squats, Farmers Carry)
- implementCount: 1 for single-arm or single-implement movements (DB Snatch, Alt DB Clean, American Kettlebell Swing, Goblet Squat, Turkish Get-up)
- "KB Swing(s)" without Russian specified means "American Kettlebell Swing"; Russian/American swing labels only apply to kettlebell swings.
- "A.KB", "A. KB", "AKS", "AKBS" = "American Kettlebell Swing" (overhead / 360°). NOT "Alt" or "Alternating".
- "R.KB", "R. KB", "RKS", "RKBS" = "Russian Kettlebell Swing" (eye/chest height / 180°).
- When ambiguous, default to 1

## LOGGING MODE (per exercise)
Every exercise MUST include "loggingMode" — this determines which logging UI the user sees:
- "strength": barbell/DB/KB lifts with sets×reps (5x5 Back Squat, 3x8 DB Press)
- "for_time": complete work ASAP, log total time (RFT, chipper, partner IGUG, team workouts with total cal/rep targets)
- "amrap": as many rounds as possible in time limit
- "amrap_intervals": multiple AMRAP blocks with rest (3x AMRAP 3:00, rest 1:00) OR "every X:XX" with explicit "AMRAP" text — the word "AMRAP" MUST appear. "Every 11 min x 3: 100 cal Echo Bike + 20 DB Snatch" is NOT amrap_intervals — it is intervals (fixed amounts per round)
- "intervals": repeated sets with individual times (5 sets for time, every 3:00 x 5) — NOT when "AMRAP" or "into AMRAP" appears in the text
- "emom": every minute on the minute
- "cardio": machine work scored by calories (single machine, no other movements)
- "cardio_distance": cardio scored by distance (single machine, no other movements)
- "bodyweight": reps-only bodyweight work (no weight needed)
- "sets": generic fallback

CRITICAL: Partner/IGUG/team workouts where teams complete a target (e.g., "300 cal echo bike" or "100 rounds") are ALWAYS "for_time" — even if the word "interval" appears in the text. "intervals" mode means individually-timed sets with rest, NOT partner rotation.

## LOGGING HINTS (per exercise)
When movements share input fields, add "loggingHints":
- Barbell complexes ("1 Power Clean + 1 Squat Clean"): set sharedWeightMovements with all movement names that share the same bar.
- Only for movements physically sharing one implement (barbell, single KB).
- Do NOT group movements using different implements (barbell squat + KB swing).

## MOVEMENT ALIASES (use canonical names)
Barbell: s2oh/stoh → Shoulder to Overhead, dl → Deadlift, bs → Back Squat, fs → Front Squat, pc → Power Clean, sqcl → Squat Clean, ps → Power Snatch, ohs → Overhead Squat, c&j → Clean and Jerk
Gymnastics: hspu → Handstand Push-up, t2b/ttb → Toes to Bar, k2e → Knees to Elbow, mu → Muscle-up, bmu/b.m.u → Bar Muscle-up, rmu → Ring Muscle-up, c2b → Chest to Bar Pull-up, hs walk → Handstand Walk
Cardio: du → Double Under, su → Single Under, cal → Calories
Equipment: kb → Kettlebell, db → Dumbbell, bb → Barbell, wb → Wall Ball
CRITICAL: Compound movements written as "X to Y" or "X + Y" (e.g., "Power Clean to Push Press", "Hang Clean to Overhead", "Deadlift to Hang Power Clean") are a SINGLE movement. Preserve the FULL compound name — do NOT simplify to just the first movement ("Power Clean to Push Press" is NOT "Power Clean").
CRITICAL: Preserve movement modifiers such as Goblet, Front Rack, Overhead, Walking, Alternating/Alt. "20 goblet alt lunges" → "Goblet Alt Lunge", not plain "Lunge".

## TITLE RULES
- If a workout name is clearly written/printed on the board (e.g. "RIFT", "MURPH", "WEDNESDAY WOD"), use it exactly as written.
- If no name is visible, invent a **short, punchy 1–2 word name** that captures the workout's character — CrossFit benchmark style. Never use a description or sentence.
  - Heavy/barbell: FORGE, ANVIL, PRESS, IRON, CRUSH
  - Fast/cardio: SURGE, VOLT, BURN, BLAZE, SPARK
  - Long/grinding: GRIND, HAUL, CARRY, CLIMB
  - Explosive/mixed: RIFT, STORM, BURST, SHATTER
  - Two-word combos (when one word isn't enough): DEAD HEAT, COLD IRON, HARD STOP
- NEVER return "Today's Workout", a format label ("For Time"), a description ("8 Round Barbell Metcon"), or any sentence.

## KEY GUIDELINES
1. Only split into multiple exercises for truly separate blocks (e.g., Strength + Metcon, Skill + WOD). A single WOD = one exercise — UNLESS the workout alternates between different movement blocks (A.1/A.2, odd/even minutes with different movements). Alternating blocks need separate exercises for separate round scores.
2. Exercise names MUST include set count/timing (e.g., "8 Rounds For Time", "5 sets every 2:30"). "AxB" = A sets of B reps.
3. Movement alternatives ("40 DU / 60 singles"): use "alternative" field, easier movement as primary. Do NOT create two separate movements.
4. ALWAYS include "difficultyLevel" (1–10) at the top level. Rate the programmed difficulty, not athlete fitness. Use the full range: 1=active recovery, 3=easy, 5=moderate benchmark pace, 7=hard, 8=very hard, 10=brutal. Consider load relative to body weight, total volume, time cap, and movement complexity. Example: "50 cal Echo Bike + 50 Thrusters @30kg × 3 rounds" = 8.
5. Prescription fidelity: "prescription" MUST paraphrase the actual whiteboard text. NEVER invent descriptors like "build to heavy", "heavy singles", "for quality" unless those exact words appear in the source.
6. RPE / RIR strength work: "@0-1 R.I.R" / "@2-3 R.I.R" / "@7 RPE" are intensity constraints, NOT rep counts. Set suggestedReps from the rep count in the prescription (e.g., "5 C2B @0-1 RIR" → suggestedReps: 5). NEVER sum multiple movement reps across a superset to produce suggestedReps. For a superset exercise with different rep counts per movement, omit suggestedReps entirely.
7. Compound movement names: ALWAYS preserve the full name — "Burpee Step Up", "Burpee Box Jump Over", "Burpee Broad Jump" are distinct movements. Do NOT simplify to "Burpee".

## CONTAINER/BENCHMARK RECOGNITION
- containerRounds: outer rounds wrapping a benchmark (7 in "7 rounds of Cindy")
- benchmarkName: Cindy, DT, Fran, Grace, Isabel, Helen, Diane, Elizabeth, Jackie, Karen, Annie, Mary
- benchmarkModified: true if weight/reps differ from standard
- If definition is provided in text, use that; otherwise use standard benchmark

## VARIABLE REP SCHEMES
"[6-5-4-3-2]" or "21-15-9" → suggestedRepsPerSet array, suggestedSets = array length.
Bracket notation like "[20-16-12-8-4]" in a for_time workout → suggestedRepsPerSet: [20, 16, 12, 8, 4], suggestedSets: 5.
CRITICAL: NEVER treat a bracketed descending rep scheme as "N rounds of the same reps". "[20-16-12-8-4]" is 5 DIFFERENT sets, not 5 rounds of 20.

## ASCENDING LADDER REP SCHEMES
When an AMRAP workout has a strictly ascending rep sequence, set ladderReps to the sequence.
- "2-4-6-8-10---" → ladderReps: [2, 4, 6, 8, 10], loggingMode: "amrap"
- "1-2-3-4-5 each" → ladderReps: [1, 2, 3, 4, 5], loggingMode: "amrap"
- "21-15-9" is NOT a ladder (descending) → suggestedRepsPerSet: [21, 15, 9], NO ladderReps
- ladderReps applies ONLY to ascending sequences in AMRAP workouts. Do not set it for strength or for_time.

## PARTNER / TEAM WORKOUTS
- "IGUG", "I go you go", "in pairs", "with a partner" → partnerWorkout: true, teamSize: 2
- "teams of N", "group of N", "in a team of N" → partnerWorkout: true, teamSize: N
- "(6 each)" → suggestedSets: 6 (per-person count for the logging UI, NOT total).
- CRITICAL: For partner workouts with sections, sections.rounds = TOTAL rounds (e.g., "6 rounds (3 each)" → sections.rounds: 6, suggestedSets: 3). The app computes per-person share as sections.rounds × partnerFactor. Never pre-divide sections.rounds by team size.
- "together" movements: when a movement says "(together)" or "run together", set "together": true on that movement. This means ALL partners do the full amount (not split). Example: "600m run (together)" → distance: 600, together: true.
- MULTI-SECTION WORKOUTS: If ANY section of the workout uses partner/team language (e.g., "B. METCON: In pairs, I go you go…"), set partnerWorkout: true and teamSize at the TOP LEVEL of the parsed output, not just on the exercise. This ensures the partner factor is applied correctly for the entire session.
- ROTATING STATION HEADCOUNT: "5 groups starting at different stations (7 people max)" / "max 6 per station" are logistics notes, NOT team designations. Do NOT set partnerWorkout or teamSize from headcount-per-station language. Only set teamSize when athletes are explicitly working together as one unit (IGUG, In Pairs, Team of N completing a shared target).

### IGYG AMRAP WITH SPLIT STATIONS (two independent streams)
When an IGYG / partner AMRAP has P1 and P2 doing DIFFERENT activities simultaneously (e.g., "P1: 200m Run while P2: AMRAP of 4 Power Clean + 6 Push-up + 8 Sit-up"), you MUST split into TWO separate exercises:
1. **Relay exercise** — the movement one partner does while the other AMRAPs. loggingMode: "amrap", movements: ONE entry describing the relay unit (e.g., { name: "Run", distance: 200, inputType: "distance" }). Rounds = how many relay trips the athlete completed. The UI shows a relay-count tile (tap + for each trip).
2. **AMRAP exercise** — the block the other partner does during the relay. loggingMode: "amrap", full movements array.

Both athletes do both exercises during the workout (they switch), so both exercises appear in the session. Each gets its own logging wizard screen and its own hero score on the recap.

This is fundamentally different from IGUG for-time (same movements, alternating) — in split-station IGYG, P1 and P2 have INDEPENDENT, non-overlapping scores at all times. Do NOT merge them into one exercise.

The relay unit can be ANY movement type: a run (200m), a bodyweight movement (10 box jumps), a machine (10 cal Echo Bike), or a distance carry. The split-station rule applies universally.

## SKILL / PRACTICE BLOCKS
"Practice", "build weight", "movement focus", "for quality", "quality sets" → type: "skill", suggestedSets: N (number of stated sets), NO suggestedReps, NO movements from other blocks.
Example: "A. 3 sets, for quality: 10 ring rows, 15 prone T-raises" → exercise type: "skill", suggestedSets: 3.

## TIME CAP
"T.C." / "TC" / "time cap" → timeCap in seconds. "16 min T.C." → timeCap: 960.

## EXAMPLES

### 1. Buy-in + Rounds + Cash-out
Input: "For Time: 600m Run (buy in), 8 RFT: 8 Push Press 40/50kg, 8 TTB, 8 KB Swings 24/16kg, then 600m Run"
Output:
{
  "type": "for_time", "format": "for_time", "scoreType": "time",
  "exercises": [
    { "name": "8 Rounds For Time", "type": "wod", "loggingMode": "for_time", "prescription": "600m Run buy-in, 8 RFT: 8 Push Jerk 40/50kg, 8 TTB, 8 KB Swings 24/16kg, then 600m Run", "suggestedSets": 8,
      "buyIn": [{ "name": "Run", "distance": 600, "unit": "m", "inputType": "none" }],
      "movements": [
        { "name": "Push Jerk", "reps": 8, "inputType": "weight", "rxWeights": { "male": 50, "female": 40, "unit": "kg" } },
        { "name": "Toes to Bar", "reps": 8, "inputType": "none" },
        { "name": "American Kettlebell Swing", "reps": 8, "inputType": "weight", "rxWeights": { "male": 24, "female": 16, "unit": "kg" } }
      ],
      "cashOut": [{ "name": "Run", "distance": 600, "unit": "m", "inputType": "none" }]
    }
  ]
}

### 2. Simple AMRAP
Input: "AMRAP 12: 10 thrusters 43/30kg, 15 pull-ups"
Output:
{
  "type": "amrap", "format": "amrap", "scoreType": "rounds_reps", "timeCap": 720,
  "exercises": [{ "name": "AMRAP 12", "type": "wod", "loggingMode": "amrap", "prescription": "10 Thrusters 43/30kg, 15 Pull-ups", "suggestedSets": 1, "workDuration": 720,
    "movements": [
      { "name": "Thruster", "reps": 10, "inputType": "weight", "rxWeights": { "male": 43, "female": 30, "unit": "kg" } },
      { "name": "Pull-up", "reps": 15, "inputType": "none" }
    ] }]
}

### 3. AMRAP with Cardio Machine Calories
Input: "18 min AMRAP: 7 cal Echo Bike, 10 TTB, 10 Alt DB Devil Press 22.5/15kg"
Output:
{
  "type": "amrap", "format": "amrap", "scoreType": "rounds_reps", "timeCap": 1080,
  "exercises": [{ "name": "18 min AMRAP", "type": "wod", "loggingMode": "amrap", "prescription": "7 cal Echo Bike, 10 TTB, 10 Alt DB Devil Press 22.5/15kg", "suggestedSets": 1, "workDuration": 1080,
    "movements": [
      { "name": "Echo Bike", "calories": 7, "rxCalories": { "male": 7, "female": 5 }, "inputType": "none" },
      { "name": "Toes to Bar", "reps": 10, "inputType": "none" },
      { "name": "Alt Dumbbell Devil Press", "reps": 10, "inputType": "weight", "rxWeights": { "male": 22.5, "female": 15, "unit": "kg" }, "implementCount": 1 }
    ] }]
}

### 4. Strength
Input: "Back Squat 5x5 @75%"
Output:
{
  "type": "strength", "format": "strength", "scoreType": "load",
  "exercises": [{ "name": "Back Squat", "type": "strength", "loggingMode": "strength", "prescription": "5x5 @75%", "suggestedSets": 5, "suggestedReps": 5 }]
}

### 5. Intervals
Input: "5 sets for time of 300m run + 10 shoulder to overhead 40/60 kg"
Output:
{
  "type": "metcon", "format": "intervals", "scoreType": "time_per_set", "sets": 5,
  "exercises": [{ "name": "5 Sets For Time", "type": "wod", "loggingMode": "intervals", "prescription": "300m Run + 10 Shoulder to Overhead 40/60kg", "suggestedSets": 5,
    "movements": [
      { "name": "Run", "distance": 300, "unit": "m", "inputType": "none" },
      { "name": "Shoulder to Overhead", "reps": 10, "inputType": "weight", "rxWeights": { "male": 60, "female": 40, "unit": "kg" } }
    ] }]
}

### 5b. Rotating station intervals (labeled A/B/C/D)
Input: "1.50 MIN X 16 ROUNDS\nA. MAX BIKE\nB. 10 RENEGADE ROW + MAX STEP UP\nC. MAX ROW\nD. 20 DUMBBELL SNATCH + MAX ROPE JUMP"
Output:
{
  "type": "metcon", "format": "intervals", "scoreType": "time_per_set", "sets": 16, "intervalTime": 90,
  "exercises": [{ "name": "1.50 Min x 16 Rounds", "type": "wod", "loggingMode": "intervals", "prescription": "A. Max Bike, B. 10 Renegade Row + Max Step Up, C. Max Row, D. 20 Dumbbell Snatch + Max Rope Jump", "suggestedSets": 16,
    "movements": [
      { "name": "Bike", "inputType": "none", "stationLabel": "A", "stationIndex": 0, "countingMode": "per_station_visit", "scoreEntryMode": "per_round" },
      { "name": "Renegade Row", "reps": 10, "inputType": "weight", "implementCount": 1, "stationLabel": "B", "stationIndex": 1, "countingMode": "per_station_visit", "scoreEntryMode": "per_round" },
      { "name": "Step Up", "inputType": "none", "stationIndex": 1, "countingMode": "per_station_visit", "scoreEntryMode": "per_round" },
      { "name": "Row", "inputType": "none", "stationLabel": "C", "stationIndex": 2, "countingMode": "per_station_visit", "scoreEntryMode": "per_round" },
      { "name": "Dumbbell Snatch", "reps": 20, "inputType": "weight", "implementCount": 1, "stationLabel": "D", "stationIndex": 3, "countingMode": "per_station_visit", "scoreEntryMode": "per_round" },
      { "name": "Rope Jump", "inputType": "none", "stationIndex": 3, "countingMode": "per_station_visit", "scoreEntryMode": "per_round" }
    ] }]
}
NOTE: stationLabel goes on the first movement of each station only. "Renegade Row" is a weighted movement (inputType: "weight"), not a cardio machine.

### 6. Mixed session (Strength + Superset + Metcon)
Input: "Cycle 1 - Push: Strict Press 5x3. Superset 3x12: Goblet Squat, V-ups. Metcon: 15 min max cal Ecobike"
Output:
{
  "title": "Cycle 1 - Push", "type": "mixed", "format": "strength", "scoreType": "load",
  "exercises": [
    { "name": "Strict Shoulder Press", "type": "strength", "loggingMode": "strength", "prescription": "5x3", "suggestedSets": 5, "suggestedReps": 3 },
    { "name": "Superset: Goblet Squat + V-ups", "type": "strength", "loggingMode": "sets", "prescription": "3x12 each movement", "suggestedSets": 3, "suggestedReps": 12,
      "movements": [{ "name": "Goblet Squat", "reps": 12, "inputType": "weight" }, { "name": "V-up", "reps": 12, "inputType": "none" }] },
    { "name": "Metcon: Max Cal Ecobike", "type": "cardio", "loggingMode": "cardio", "prescription": "15 min max calories", "suggestedSets": 1, "timeCap": 900 }
  ]
}

### 7. Partner RFT with time cap
Input: "With a partner IGUG (6 each): 10 Deadlifts 60/40kg, 40 D.U./60 Singles, 15 Box Jumps. 16 min T.C."
Output:
{
  "type": "for_time", "format": "for_time", "scoreType": "time", "partnerWorkout": true, "teamSize": 2, "sets": 6, "timeCap": 960,
  "exercises": [{ "name": "Partner RFT (6 each)", "type": "wod", "loggingMode": "for_time", "prescription": "6 rounds each: 10 DL 60/40kg, 40 DU/60 SU, 15 Box Jumps", "suggestedSets": 6,
    "movements": [
      { "name": "Deadlift", "reps": 10, "inputType": "weight", "rxWeights": { "male": 60, "female": 40, "unit": "kg" } },
      { "name": "Single Under", "reps": 60, "inputType": "none", "alternative": { "name": "Double Under", "reps": 40 } },
      { "name": "Box Jump", "reps": 15, "inputType": "none" }
    ] }]
}

### 8. Container benchmark
Input: "7 rounds of Cindy for time"
Output:
{
  "type": "for_time", "format": "for_time", "scoreType": "time", "containerRounds": 7, "benchmarkName": "Cindy", "benchmarkModified": false,
  "exercises": [{ "name": "7 Rounds of Cindy", "type": "wod", "loggingMode": "for_time", "prescription": "7 rounds: 5 Pull-ups, 10 Push-ups, 15 Air Squats", "suggestedSets": 7,
    "movements": [{ "name": "Pull-up", "reps": 5, "inputType": "none" }, { "name": "Push-up", "reps": 10, "inputType": "none" }, { "name": "Air Squat", "reps": 15, "inputType": "none" }] }]
}

### 9. Chipper
Input: "For time: 50 wall balls 9/6kg, 40 pull-ups, 30 box jumps, 20 thrusters 42.5/30kg, 10 muscle-ups"
Output:
{
  "type": "for_time", "format": "for_time", "scoreType": "time",
  "exercises": [{ "name": "Chipper For Time", "type": "wod", "loggingMode": "for_time", "prescription": "50 Wall Balls 9/6kg, 40 Pull-ups, 30 Box Jumps, 20 Thrusters 42.5/30kg, 10 Muscle-ups", "suggestedSets": 1,
    "movements": [
      { "name": "Wall Ball", "reps": 50, "inputType": "weight", "rxWeights": { "male": 9, "female": 6, "unit": "kg" } },
      { "name": "Pull-up", "reps": 40, "inputType": "none" },
      { "name": "Box Jump", "reps": 30, "inputType": "none" },
      { "name": "Thruster", "reps": 20, "inputType": "weight", "rxWeights": { "male": 42.5, "female": 30, "unit": "kg" } },
      { "name": "Muscle-up", "reps": 10, "inputType": "none" }
    ] }]
}

### 10. Barbell Complex
Input: "EMOM 12: 1 Power Clean + 1 Squat Clean @ 80kg"
Output:
{
  "type": "emom", "format": "emom", "scoreType": "reps", "timeCap": 720, "intervalTime": 60,
  "exercises": [{ "name": "EMOM 12", "type": "wod", "loggingMode": "emom", "prescription": "1 Power Clean + 1 Squat Clean @80kg", "suggestedSets": 12, "workDuration": 720,
    "loggingHints": { "sharedWeightMovements": ["Power Clean", "Squat Clean"] },
    "movements": [
      { "name": "Power Clean", "reps": 1, "inputType": "weight", "rxWeights": { "male": 80, "female": 80, "unit": "kg" } },
      { "name": "Squat Clean", "reps": 1, "inputType": "weight", "rxWeights": { "male": 80, "female": 80, "unit": "kg" } }
    ] }]
}

### 11. Alternating AMRAPs (different blocks)
Input: "[6:00 min AMRAP, 2:00 min REST] x 4 (alt): A.1: 200m Run, 10 Alt DB Devil Press, 10 Box Jumps. A.2: 6 Pull-ups, 8 Burpees over DB, 10 (5+5) DB Thrusters. DB 15/22.5kg"
Output:
{
  "title": "Lion's Roar", "type": "amrap", "format": "amrap_intervals", "scoreType": "rounds_reps", "timeCap": 1920,
  "exercises": [
    { "name": "A.1 AMRAP 6:00 (Round 1)", "type": "wod", "loggingMode": "amrap", "prescription": "200m Run, 10 Alt DB Devil Press, 10 Box Jumps", "suggestedSets": 1, "workDuration": 360, "restDuration": 120,
      "movements": [
        { "name": "Run", "distance": 200, "unit": "m", "inputType": "none" },
        { "name": "Alt Dumbbell Devil Press", "reps": 10, "inputType": "weight", "rxWeights": { "male": 22.5, "female": 15, "unit": "kg" }, "implementCount": 1 },
        { "name": "Box Jump", "reps": 10, "inputType": "none" }
      ] },
    { "name": "A.2 AMRAP 6:00 (Round 1)", "type": "wod", "loggingMode": "amrap", "prescription": "6 Pull-ups, 8 Burpees over DB, 10 DB Thrusters (5+5)", "suggestedSets": 1,
      "movements": [
        { "name": "Pull-up", "reps": 6, "inputType": "none" },
        { "name": "Burpee over Dumbbell", "reps": 8, "inputType": "none" },
        { "name": "Dumbbell Thruster", "reps": 10, "inputType": "weight", "rxWeights": { "male": 22.5, "female": 15, "unit": "kg" }, "implementCount": 1 }
      ] },
    { "name": "A.1 AMRAP 6:00 (Round 2)", "type": "wod", "loggingMode": "amrap", "prescription": "200m Run, 10 Alt DB Devil Press, 10 Box Jumps", "suggestedSets": 1,
      "movements": [
        { "name": "Run", "distance": 200, "unit": "m", "inputType": "none" },
        { "name": "Alt Dumbbell Devil Press", "reps": 10, "inputType": "weight", "rxWeights": { "male": 22.5, "female": 15, "unit": "kg" }, "implementCount": 1 },
        { "name": "Box Jump", "reps": 10, "inputType": "none" }
      ] },
    { "name": "A.2 AMRAP 6:00 (Round 2)", "type": "wod", "loggingMode": "amrap", "prescription": "6 Pull-ups, 8 Burpees over DB, 10 DB Thrusters (5+5)", "suggestedSets": 1,
      "movements": [
        { "name": "Pull-up", "reps": 6, "inputType": "none" },
        { "name": "Burpee over Dumbbell", "reps": 8, "inputType": "none" },
        { "name": "Dumbbell Thruster", "reps": 10, "inputType": "weight", "rxWeights": { "male": 22.5, "female": 15, "unit": "kg" }, "implementCount": 1 }
      ] }
  ]
}
NOTE: When AMRAPs alternate between DIFFERENT movement blocks (A.1/A.2 or odd/even), split into separate exercises — one per block per attempt. Each exercise gets its own round score. Do NOT merge different blocks into one exercise.

### 12. Every X:XX with buy-in + AMRAP (interval AMRAP)
Input: "Every 04:00 min x 3 rounds: 200m run, Into AMRAP: 4 B.M.U / 6 chest to bar pull ups, 8 boxjumps, 10 KB swings @24/32kg"
Output:
{
  "type": "amrap", "format": "amrap_intervals", "scoreType": "rounds_reps",
  "intervalTime": 240, "restTime": 0, "sets": 3,
  "exercises": [{ "name": "Every 4:00 x 3 AMRAP", "type": "wod", "loggingMode": "amrap_intervals", "prescription": "200m Run buy-in, then AMRAP: 4 Bar Muscle-up, 8 Box Jumps, 10 KB Swings @24/32kg", "suggestedSets": 3, "workDuration": 720, "restDuration": 0,
    "buyIn": [{ "name": "Run", "distance": 200, "unit": "m", "inputType": "none" }],
    "movements": [
      { "name": "Bar Muscle-up", "reps": 4, "inputType": "none", "alternative": { "name": "Chest to Bar Pull-up", "reps": 6 } },
      { "name": "Box Jump", "reps": 8, "inputType": "none" },
      { "name": "American Kettlebell Swing", "reps": 10, "inputType": "weight", "rxWeights": { "male": 32, "female": 24, "unit": "kg" }, "implementCount": 1 }
    ] }]
}
NOTE: "Every X:XX + AMRAP" = amrap_intervals, NOT intervals/emom. The run is a buyIn (repeated each interval). User scores total rounds+reps across all intervals.
IMPORTANT: If you place a buy-in movement inside "movements" instead of "buyIn", you MUST set "role": "buy_in" on it so the app knows it's not repeated per AMRAP round.
Equivalent alternatives (both are correct):
  Option A: "buyIn": [{ "name": "Run", "distance": 200 }], "movements": [{ "name": "BMU", "reps": 4 }, ...]
  Option B: "movements": [{ "name": "Run", "distance": 200, "role": "buy_in" }, { "name": "BMU", "reps": 4 }, ...]

### 13. For time with buy-in + multiple round sections (Lion's Roar style)
Input:
"Lion's Roar
A. METCON (Long)
For time, In pairs (I go you go):

80/100 (7/10) calories echo bike
Into, 2 rounds:
600m run (together)
40 C&J @35/50 kg
Into, 2 rounds:
40 Box jumps
40 Thrusters @35/50 kg"

Output:
{
  "title": "Lion's Roar",
  "rawText": "Lion's Roar\\nA. METCON (Long)\\nFor time, In pairs (I go you go):\\n\\n80/100 (7/10) calories echo bike\\nInto, 2 rounds:\\n600m run (together)\\n40 C&J @35/50 kg\\nInto, 2 rounds:\\n40 Box jumps\\n40 Thrusters @35/50 kg",
  "type": "for_time",
  "format": "for_time",
  "scoreType": "time",
  "partnerWorkout": true,
  "teamSize": 2,
  // Total working rounds = 2 rounds of the first block + 2 rounds of the second block = 4
  "sets": 4,
  "exercises": [
    {
      "name": "Lion's Roar For Time",
      "type": "wod",
      "loggingMode": "for_time",
      "prescription": "Buy-in: 80/100 (7/10) calories Echo Bike, then 2 rounds of 600m Run (together) + 40 Clean and Jerk 35/50kg, then 2 rounds of 40 Box Jumps + 40 Thrusters 35/50kg",
      // Total rounds across all blocks
      "suggestedSets": 4,
      "buyIn": [
        {
          "name": "Echo Bike",
          "calories": 100,
          "rxCalories": { "male": 100, "female": 80 },
          "inputType": "none"
        }
      ],
      // Movements here are PER ROUND. The "rounds" counts (2 + 2) are encoded in suggestedSets / sets.
      "movements": [
        {
          "name": "Run",
          "distance": 600,
          "unit": "m",
          "inputType": "none"
        },
        {
          "name": "Clean and Jerk",
          "reps": 40,
          "inputType": "weight",
          "rxWeights": { "male": 50, "female": 35, "unit": "kg" }
        },
        {
          "name": "Box Jump",
          "reps": 40,
          "inputType": "none"
        },
        {
          "name": "Thruster",
          "reps": 40,
          "inputType": "weight",
          "rxWeights": { "male": 50, "female": 35, "unit": "kg" }
        }
      ],
      // Sections explicitly group which movements are repeated together and how many times.
      "sections": [
        {
          "sectionType": "buy_in",
          "rounds": 1,
          "movements": [
            {
              "name": "Echo Bike",
              "calories": 100,
              "rxCalories": { "male": 100, "female": 80 },
              "inputType": "none"
            }
          ]
        },
        {
          "sectionType": "rounds",
          "rounds": 2,
          "movements": [
            {
              "name": "Run",
              "distance": 600,
              "unit": "m",
              "inputType": "none",
              "together": true
            },
            {
              "name": "Clean and Jerk",
              "reps": 40,
              "inputType": "weight",
              "rxWeights": { "male": 50, "female": 35, "unit": "kg" }
            }
          ]
        },
        {
          "sectionType": "rounds",
          "rounds": 2,
          "movements": [
            {
              "name": "Box Jump",
              "reps": 40,
              "inputType": "none"
            },
            {
              "name": "Thruster",
              "reps": 40,
              "inputType": "weight",
              "rxWeights": { "male": 50, "female": 35, "unit": "kg" }
            }
          ]
        }
      ]
    }
  ]
}

## AMRAP INTERVALS — NUMBERED BLOCKS

When an AMRAP intervals workout has numbered sections (1. / 2. / 3. or labeled A / B / C) with DIFFERENT movement blocks, each numbered section is a SEPARATE exercise with loggingMode: "amrap". Do NOT merge them into one exercise.

CRITICAL — BUY-IN RULE: In AMRAP intervals, the first movement of a numbered block is NEVER automatically a buy-in. A buy-in is ONLY movements explicitly introduced by "buy-in", "into AMRAP", or "then AMRAP" phrasing. If the workout lists numbered movement blocks without any "into AMRAP" language, every movement in every block is a regular per-round AMRAP movement.

### 14. Numbered sequential AMRAP intervals (different blocks)
Input: "[12:00 min AMRAP / 01:00 min REST] x 3 :
1. 8/10 calories bike, 10 DB's burpee to deadlift, 10 DB's push press
2. 5 pull up, 10 push ups, 15 air squats
3. 10 A.KB swings, 10 T.T.B, 10 box jumps"
Output:
{
  "title": "Endurance", "type": "amrap", "format": "amrap_intervals", "scoreType": "rounds_reps",
  "timeCap": 2340, "intervalTime": 720, "sets": 3,
  "exercises": [
    {
      "name": "AMRAP 1 — 12 Min", "type": "wod", "loggingMode": "amrap",
      "prescription": "8/10 cal Bike, 10 DB Burpee to Deadlift, 10 DB Push Press",
      "suggestedSets": 1, "workDuration": 720, "restDuration": 60,
      "movements": [
        { "name": "Bike", "calories": 10, "rxCalories": { "male": 10, "female": 8 }, "inputType": "none" },
        { "name": "Dumbbell Burpee to Deadlift", "reps": 10, "inputType": "weight", "rxWeights": { "male": 10, "female": 10, "unit": "kg" }, "implementCount": 2 },
        { "name": "Dumbbell Push Press", "reps": 10, "inputType": "weight", "rxWeights": { "male": 10, "female": 10, "unit": "kg" }, "implementCount": 2 }
      ]
    },
    {
      "name": "AMRAP 2 — 12 Min", "type": "wod", "loggingMode": "amrap",
      "prescription": "5 Pull-ups, 10 Push-ups, 15 Air Squats",
      "suggestedSets": 1, "workDuration": 720, "restDuration": 60,
      "movements": [
        { "name": "Pull-up", "reps": 5, "inputType": "none" },
        { "name": "Push-up", "reps": 10, "inputType": "none" },
        { "name": "Air Squat", "reps": 15, "inputType": "none" }
      ]
    },
    {
      "name": "AMRAP 3 — 12 Min", "type": "wod", "loggingMode": "amrap",
      "prescription": "10 American KB Swings, 10 Toes to Bar, 10 Box Jumps",
      "suggestedSets": 1, "workDuration": 720, "restDuration": 60,
      "movements": [
        { "name": "American Kettlebell Swing", "reps": 10, "inputType": "weight", "rxWeights": { "male": 24, "female": 16, "unit": "kg" }, "implementCount": 1 },
        { "name": "Toes to Bar", "reps": 10, "inputType": "none" },
        { "name": "Box Jump", "reps": 10, "inputType": "none" }
      ]
    }
  ]
}
NOTE: "8/10 calories bike" → Bike, calories: 10, rxCalories: { male: 10, female: 8 }. The Bike is movement #1 in AMRAP 1 — it is NOT a buy-in. No buy-in is present in this workout. Each numbered section becomes its own exercise.

### 15. IGYG AMRAP — split stations (P1 and P2 do different movements)
Input: "15 min AMRAP with a partner (I go you go): P1: 200m Run. P2: AMRAP: 4 Power Cleans @40/60kg, 6 Push-ups, 8 Sit-ups."
Output:
{
  "title": "Partner AMRAP",
  "type": "amrap",
  "format": "amrap",
  "scoreType": "rounds_reps",
  "partnerWorkout": true,
  "teamSize": 2,
  "timeCap": 900,
  "exercises": [
    {
      "name": "200m Run — Relay",
      "type": "wod",
      "loggingMode": "amrap",
      "prescription": "200m Run relay while partner AMRAPs. Each round = one 200m run.",
      "suggestedSets": 1,
      "workDuration": 900,
      "movements": [
        { "name": "Run", "distance": 200, "inputType": "distance" }
      ]
    },
    {
      "name": "Partner AMRAP 15 Min",
      "type": "wod",
      "loggingMode": "amrap",
      "prescription": "4 Power Cleans @40/60kg, 6 Push-ups, 8 Sit-ups",
      "suggestedSets": 1,
      "workDuration": 900,
      "movements": [
        { "name": "Power Clean", "reps": 4, "inputType": "weight", "rxWeights": { "male": 60, "female": 40, "unit": "kg" } },
        { "name": "Push-up", "reps": 6, "inputType": "none" },
        { "name": "Sit-up", "reps": 8, "inputType": "none" }
      ]
    }
  ]
}
NOTE: Same rule applies when the relay movement is bodyweight (e.g., "P1: 10 Box Jumps while P2 AMRAPs" → relay exercise name "10 Box Jumps — Relay", movements: [{ name: "Box Jump", reps: 10, inputType: "none" }]). The relay exercise always has exactly ONE movement describing the relay unit. The athlete logs relay trips via the relay tile (each tap = one trip). NEVER use movements: [] for relay exercises.

### 16. Progressive / building chipper (each round adds a movement)
Input: "For time (TC 41 min): Buy In: 100 DB Hip Thrusts (17.5/22.5 kg). Into: Round 1: 10 Burpees Over Bar, 10 Cal Row. Round 2 - Add 20 Thrusters (30/40 kg). Round 3 - Add 30 Power Cleans. Round 4 - Add 40 Back Squats. Round 5: 10 BOB, 20 Thrusters, 30 Power Cleans, 40 Back Squats, 50 Bent Over Rows, 10 Cal Row. Cash Out: 50 Deadlifts (70/90 kg)"
Output:
{
  "title": "PREY", "type": "for_time", "format": "for_time", "scoreType": "time", "timeCap": 2460, "sets": 5,
  "exercises": [{
    "name": "PREY For Time", "type": "wod", "loggingMode": "for_time",
    "prescription": "Buy-in: 100 DB Hip Thrusts, then 5 building rounds (each adds a movement), cash-out: 50 Deadlifts",
    "suggestedSets": 5,
    "buyIn": [{ "name": "Dumbbell Hip Thrust", "reps": 100, "inputType": "weight", "rxWeights": { "male": 22.5, "female": 17.5, "unit": "kg" } }],
    "movements": [
      { "name": "Burpees Over Bar", "reps": 10, "inputType": "none" },
      { "name": "Thruster", "reps": 20, "inputType": "weight", "rxWeights": { "male": 40, "female": 30, "unit": "kg" } },
      { "name": "Power Clean", "reps": 30, "inputType": "weight", "rxWeights": { "male": 40, "female": 30, "unit": "kg" } },
      { "name": "Back Squat", "reps": 40, "inputType": "weight", "rxWeights": { "male": 40, "female": 30, "unit": "kg" } },
      { "name": "Bent Over Row", "reps": 50, "inputType": "weight", "rxWeights": { "male": 40, "female": 30, "unit": "kg" } },
      { "name": "Row", "calories": 10, "rxCalories": { "male": 10, "female": 10 }, "inputType": "none" }
    ],
    "cashOut": [{ "name": "Deadlift", "reps": 50, "inputType": "weight", "rxWeights": { "male": 90, "female": 70, "unit": "kg" } }],
    "sections": [
      { "sectionType": "buy_in", "rounds": 1, "movements": [{ "name": "Dumbbell Hip Thrust", "reps": 100, "inputType": "weight", "rxWeights": { "male": 22.5, "female": 17.5, "unit": "kg" } }] },
      { "sectionType": "rounds", "rounds": 1, "movements": [{ "name": "Burpees Over Bar", "reps": 10, "inputType": "none" }, { "name": "Row", "calories": 10, "rxCalories": { "male": 10, "female": 10 }, "inputType": "none" }] },
      { "sectionType": "rounds", "rounds": 1, "movements": [{ "name": "Burpees Over Bar", "reps": 10, "inputType": "none" }, { "name": "Thruster", "reps": 20, "inputType": "weight", "rxWeights": { "male": 40, "female": 30, "unit": "kg" } }, { "name": "Row", "calories": 10, "rxCalories": { "male": 10, "female": 10 }, "inputType": "none" }] },
      { "sectionType": "rounds", "rounds": 1, "movements": [{ "name": "Burpees Over Bar", "reps": 10, "inputType": "none" }, { "name": "Power Clean", "reps": 30, "inputType": "weight", "rxWeights": { "male": 40, "female": 30, "unit": "kg" } }, { "name": "Thruster", "reps": 20, "inputType": "weight", "rxWeights": { "male": 40, "female": 30, "unit": "kg" } }, { "name": "Row", "calories": 10, "rxCalories": { "male": 10, "female": 10 }, "inputType": "none" }] },
      { "sectionType": "rounds", "rounds": 1, "movements": [{ "name": "Burpees Over Bar", "reps": 10, "inputType": "none" }, { "name": "Back Squat", "reps": 40, "inputType": "weight", "rxWeights": { "male": 40, "female": 30, "unit": "kg" } }, { "name": "Power Clean", "reps": 30, "inputType": "weight", "rxWeights": { "male": 40, "female": 30, "unit": "kg" } }, { "name": "Thruster", "reps": 20, "inputType": "weight", "rxWeights": { "male": 40, "female": 30, "unit": "kg" } }, { "name": "Row", "calories": 10, "rxCalories": { "male": 10, "female": 10 }, "inputType": "none" }] },
      { "sectionType": "rounds", "rounds": 1, "movements": [{ "name": "Burpees Over Bar", "reps": 10, "inputType": "none" }, { "name": "Bent Over Row", "reps": 50, "inputType": "weight", "rxWeights": { "male": 40, "female": 30, "unit": "kg" } }, { "name": "Back Squat", "reps": 40, "inputType": "weight", "rxWeights": { "male": 40, "female": 30, "unit": "kg" } }, { "name": "Power Clean", "reps": 30, "inputType": "weight", "rxWeights": { "male": 40, "female": 30, "unit": "kg" } }, { "name": "Thruster", "reps": 20, "inputType": "weight", "rxWeights": { "male": 40, "female": 30, "unit": "kg" } }, { "name": "Row", "calories": 10, "rxCalories": { "male": 10, "female": 10 }, "inputType": "none" }] },
      { "sectionType": "cash_out", "rounds": 1, "movements": [{ "name": "Deadlift", "reps": 50, "inputType": "weight", "rxWeights": { "male": 90, "female": 70, "unit": "kg" } }] }
    ]
  }]
}
NOTE: Each round is a separate sections entry with rounds: 1. DO NOT collapse into one "rounds: 5" section when each round's movement list is different. The movements[] at the top lists unique movements for reference only.

### 17. Pyramid / palindrome chipper (same movement count per section, different reps/distances)
Input: "For time: 600m Run, 60 KB SDHP, 10 Burpee / 400m Run, 40 KB Swing, 10 Burpee / 200m Run, 20 Chest-to-Bar Pull-up, 10 Burpee / 400m Run, 40 KB Swing, 10 Burpee / 600m Run, 60 KB SDHP, 10 Burpee (30 min TC)"
Output:
{
  "title": "5-Round Pyramid For Time", "type": "for_time", "format": "for_time", "scoreType": "time", "timeCap": 1800,
  "exercises": [{
    "name": "5-Round Pyramid For Time", "type": "wod", "loggingMode": "for_time",
    "prescription": "5-section pyramid for time · 30 min cap",
    "movements": [
      { "name": "Run", "distance": 600, "inputType": "none" },
      { "name": "KB Sumo Deadlift High Pull", "reps": 60, "inputType": "weight", "rxWeights": { "male": 24, "female": 16, "unit": "kg" } },
      { "name": "Burpee", "reps": 10, "inputType": "none" },
      { "name": "American Kettlebell Swing", "reps": 40, "inputType": "weight", "rxWeights": { "male": 24, "female": 16, "unit": "kg" } },
      { "name": "Chest-to-Bar Pull-up", "reps": 20, "inputType": "none" }
    ],
    "sections": [
      { "sectionType": "rounds", "rounds": 1, "movements": [{ "name": "Run", "distance": 600, "inputType": "none" }, { "name": "KB Sumo Deadlift High Pull", "reps": 60, "inputType": "weight", "rxWeights": { "male": 24, "female": 16, "unit": "kg" } }, { "name": "Burpee", "reps": 10, "inputType": "none" }] },
      { "sectionType": "rounds", "rounds": 1, "movements": [{ "name": "Run", "distance": 400, "inputType": "none" }, { "name": "American Kettlebell Swing", "reps": 40, "inputType": "weight", "rxWeights": { "male": 24, "female": 16, "unit": "kg" } }, { "name": "Burpee", "reps": 10, "inputType": "none" }] },
      { "sectionType": "rounds", "rounds": 1, "movements": [{ "name": "Run", "distance": 200, "inputType": "none" }, { "name": "Chest-to-Bar Pull-up", "reps": 20, "inputType": "none" }, { "name": "Burpee", "reps": 10, "inputType": "none" }] },
      { "sectionType": "rounds", "rounds": 1, "movements": [{ "name": "Run", "distance": 400, "inputType": "none" }, { "name": "American Kettlebell Swing", "reps": 40, "inputType": "weight", "rxWeights": { "male": 24, "female": 16, "unit": "kg" } }, { "name": "Burpee", "reps": 10, "inputType": "none" }] },
      { "sectionType": "rounds", "rounds": 1, "movements": [{ "name": "Run", "distance": 600, "inputType": "none" }, { "name": "KB Sumo Deadlift High Pull", "reps": 60, "inputType": "weight", "rxWeights": { "male": 24, "female": 16, "unit": "kg" } }, { "name": "Burpee", "reps": 10, "inputType": "none" }] }
    ]
  }]
}
NOTE: Each section with different reps/distances gets its own sections entry with rounds: 1. The movements[] at top lists unique movements (deduplicated) for reference. DO NOT flatten all sections into one movement list — the pyramid structure must be preserved.

If image is not a workout, return: {"error": "Could not parse workout from image"}`;

/**
 * Parse a workout from plain text (no image).
 * Returns the raw AI JSON string for debugging, plus the parsed result.
 */
export async function parseWorkoutText(text: string): Promise<{ raw: string; parsed: ParsedWorkout }> {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: WORKOUT_PARSE_PROMPT },
          { type: 'text', text: `Here is the workout text to parse:\n\n${text}` },
        ],
      },
    ],
    max_tokens: 4000,
    temperature: 0.2,
  });

  const content = response.choices[0]?.message?.content || '';
  let jsonStr = content;
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) jsonStr = jsonMatch[1];

  const rawJson = jsonStr.trim();
  const data = JSON.parse(rawJson);
  const validated = validateParsedWorkout(data);
  const postProcessed = postProcessParsedWorkout(validated);

  return { raw: rawJson, parsed: postProcessed };
}

export async function parseWorkoutImage(base64Image: string): Promise<ParsedWorkout> {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: WORKOUT_PARSE_PROMPT
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${base64Image}`,
                detail: 'high'
              }
            }
          ]
        }
      ],
      max_tokens: 4000,
      temperature: 0.2 // Lower temperature for more consistent parsing
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from OpenAI');
    }

    // Extract JSON from response (handle markdown code blocks)
    let jsonStr = content;
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }

    const parsed = JSON.parse(jsonStr.trim());

    console.warn('🔍 [AI PARSE] Full response:', JSON.stringify(parsed, null, 2));

    if (parsed.error) {
      throw new Error(parsed.error);
    }

    // Validate and transform the response
    const validated = validateParsedWorkout(parsed);

    // Post-process to fix common AI parsing issues
    const postProcessed = postProcessParsedWorkout(validated);

    console.log('[OpenAI Parse] Post-processed:', JSON.stringify({
      exercises: postProcessed.exercises?.map(e => ({
        name: e.name,
        suggestedSets: e.suggestedSets,
        movements: e.movements?.map(m => ({
          name: m.name, reps: m.reps, distance: m.distance, calories: m.calories, perRound: m.perRound,
        })),
      })),
    }, null, 2));

    return postProcessed;
  } catch (error) {
    console.error('Error parsing workout image:', error);
    throw error;
  }
}

const WORKOUT_REFINE_PROMPT = `You are a CrossFit workout parser refinement engine. You receive rawText + parsed JSON and return corrected JSON.

Return ONLY valid JSON matching the same schema as the parsed input.

Rules:
- Only split into multiple exercises for truly separate blocks (Strength + Metcon, Skill + WOD).
- "5x3" = suggestedSets: 5, suggestedReps: 3.
- Every exercise MUST include "loggingMode": "strength" | "for_time" | "amrap" | "amrap_intervals" | "intervals" | "emom" | "cardio" | "cardio_distance" | "bodyweight" | "sets".
- Preserve "loggingHints" (including sharedWeightMovements) from the original parsed data.
- Preserve "workDuration" and "restDuration" from the original parsed data.
- Preserve original structure when unsure — only correct obvious errors.`;

export async function refineParsedWorkout(
  parsed: ParsedWorkout,
  rawText: string
): Promise<ParsedWorkout> {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: WORKOUT_REFINE_PROMPT },
          {
            type: 'text',
            text: JSON.stringify({
              rawText,
              parsed,
            }),
          },
        ],
      },
    ],
    temperature: 0,
  });

  const text = response.choices[0]?.message?.content || '';

  // Strip markdown code blocks if present (```json ... ```)
  let jsonStr = text;
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1];
  }

  const refined = JSON.parse(jsonStr.trim()) as ParsedWorkout;

  // Post-process the refined workout
  return postProcessParsedWorkout(refined);
}

function validateRxWeights(data: unknown): RxWeights | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const raw = data as Record<string, unknown>;

  const male = typeof raw.male === 'number' ? raw.male : undefined;
  const female = typeof raw.female === 'number' ? raw.female : undefined;
  const unit = raw.unit === 'lb' ? 'lb' : 'kg';

  if (male === undefined && female === undefined) return undefined;

  return { male, female, unit };
}

function validateMeasurementUnit(value: unknown): MeasurementUnit | undefined {
  const validUnits: MeasurementUnit[] = ['kg', 'lb', 'm', 'km', 'mi', 'cal'];
  if (typeof value === 'string' && validUnits.includes(value as MeasurementUnit)) {
    return value as MeasurementUnit;
  }
  return undefined;
}

function validateMovement(data: unknown): ParsedMovement | null {
  if (!data || typeof data !== 'object') return null;
  const raw = data as Record<string, unknown>;

  if (!raw.name || typeof raw.name !== 'string') return null;

  // Validate alternative if present
  let alternative: ParsedMovement['alternative'] = undefined;
  if (raw.alternative && typeof raw.alternative === 'object') {
    const alt = raw.alternative as Record<string, unknown>;
    if (alt.name && typeof alt.name === 'string') {
      alternative = {
        name: alt.name,
        reps: typeof alt.reps === 'number' ? alt.reps : undefined,
        distance: typeof alt.distance === 'number' ? alt.distance : undefined,
        calories: typeof alt.calories === 'number' ? alt.calories : undefined,
      };
    }
  }

  // Validate inputType
  const validInputTypes = ['weight', 'calories', 'distance', 'none'] as const;
  const inputType = validInputTypes.includes(raw.inputType as typeof validInputTypes[number])
    ? (raw.inputType as ParsedMovement['inputType'])
    : undefined;

  const validCountingModes = ['per_round', 'per_interval', 'per_station_visit', 'once'] as const;
  const countingMode = validCountingModes.includes(raw.countingMode as typeof validCountingModes[number])
    ? (raw.countingMode as ParsedMovement['countingMode'])
    : undefined;

  const validScoreEntryModes = ['per_round', 'total'] as const;
  const scoreEntryMode = validScoreEntryModes.includes(raw.scoreEntryMode as typeof validScoreEntryModes[number])
    ? (raw.scoreEntryMode as ParsedMovement['scoreEntryMode'])
    : undefined;

  // Validate implementCount (1 or 2)
  const implementCount = (raw.implementCount === 1 || raw.implementCount === 2)
    ? raw.implementCount as 1 | 2
    : undefined;

  // Validate rxCalories
  let rxCalories: ParsedMovement['rxCalories'] = undefined;
  if (raw.rxCalories && typeof raw.rxCalories === 'object') {
    const rc = raw.rxCalories as Record<string, unknown>;
    const male = typeof rc.male === 'number' ? rc.male : undefined;
    const female = typeof rc.female === 'number' ? rc.female : undefined;
    if (male !== undefined || female !== undefined) {
      rxCalories = { male, female };
    }
  }

  return {
    name: raw.name,
    reps: typeof raw.reps === 'number' ? raw.reps : undefined,
    distance: typeof raw.distance === 'number' ? raw.distance : undefined,
    time: typeof raw.time === 'number' ? raw.time : undefined,
    calories: typeof raw.calories === 'number' ? raw.calories : undefined,
    rxCalories,
    rxWeights: validateRxWeights(raw.rxWeights),
    unit: validateMeasurementUnit(raw.unit),
    inputType,
    implementCount,
    isMaxReps: raw.isMaxReps === true ? true : undefined,
    // "role": "buy_in" or "cash_out" from AI means this movement is not repeated per round
    perRound: raw.perRound === false || raw.role === 'buy_in' || raw.role === 'cash_out' ? false : undefined,
    countingMode,
    scoreEntryMode,
    stationLabel: typeof raw.stationLabel === 'string' ? raw.stationLabel : undefined,
    stationIndex: typeof raw.stationIndex === 'number' ? raw.stationIndex : undefined,
    together: raw.together === true ? true : undefined,
    alternative,
    // Preserve role so downstream code can distinguish buy-in from cash-out
    ...(raw.role === 'buy_in' || raw.role === 'cash_out' ? { role: raw.role as 'buy_in' | 'cash_out' } : {}),
  };
}

function validateParsedWorkout(data: unknown): ParsedWorkout {
  const raw = data as Record<string, unknown>;

  // Validate workout type
  const validTypes: WorkoutType[] = ['strength', 'metcon', 'emom', 'amrap', 'for_time', 'mixed'];
  const type = validTypes.includes(raw.type as WorkoutType)
    ? (raw.type as WorkoutType)
    : 'mixed';

  // Validate format
  const validFormats: WorkoutFormat[] = ['for_time', 'intervals', 'amrap', 'amrap_intervals', 'emom', 'strength', 'tabata'];
  const format = validFormats.includes(raw.format as WorkoutFormat)
    ? (raw.format as WorkoutFormat)
    : inferFormatFromType(type);

  // Validate score type
  const validScoreTypes: ScoreType[] = ['time', 'time_per_set', 'rounds_reps', 'load', 'reps', 'pass_fail'];
  const scoreType = validScoreTypes.includes(raw.scoreType as ScoreType)
    ? (raw.scoreType as ScoreType)
    : inferScoreTypeFromFormat(format);

  // Validate exercises
  const exercises: ParsedExercise[] = [];
  const rawExercises = Array.isArray(raw.exercises) ? raw.exercises : [];

  for (const ex of rawExercises) {
    if (typeof ex === 'object' && ex !== null) {
      const exercise = ex as Record<string, unknown>;
      const validExerciseTypes: ExerciseType[] = ['strength', 'cardio', 'skill', 'wod'];

      // Parse buyIn movements (done once before rounds)
      const buyInMovements: ParsedMovement[] = [];
      if (Array.isArray(exercise.buyIn)) {
        for (const mov of exercise.buyIn) {
          const validated = validateMovement(mov);
          if (validated) {
            validated.perRound = false;
            validated.name = `Buy-In: ${validated.name}`;
            buyInMovements.push(validated);
          }
        }
      }

      // Parse main movements array (done per round)
      const coreMovements: ParsedMovement[] = [];
      if (Array.isArray(exercise.movements)) {
        for (const mov of exercise.movements) {
          const validated = validateMovement(mov);
          if (validated) {
            // AI used "role" field to mark buy-in/cash-out inline — add name prefix
            if (validated.role === 'buy_in' && !validated.name.startsWith('Buy-In:')) {
              validated.name = `Buy-In: ${validated.name}`;
            } else if (validated.role === 'cash_out' && !validated.name.startsWith('Cash-Out:')) {
              validated.name = `Cash-Out: ${validated.name}`;
            }
            coreMovements.push(validated);
          }
        }
      }

      // Parse cashOut movements (done once after rounds)
      const cashOutMovements: ParsedMovement[] = [];
      if (Array.isArray(exercise.cashOut)) {
        for (const mov of exercise.cashOut) {
          const validated = validateMovement(mov);
          if (validated) {
            validated.perRound = false;
            validated.name = `Cash-Out: ${validated.name}`;
            cashOutMovements.push(validated);
          }
        }
      }

      // Combine: buyIn (perRound=false) + core + cashOut (perRound=false)
      const movements = [...buyInMovements, ...coreMovements, ...cashOutMovements];

      // Validate optional sections (buy-in / rounds blocks / cash-out)
      let sections: ParsedSection[] | undefined = undefined;
      if (Array.isArray((exercise as any).sections)) {
        const rawSections = (exercise as any).sections as unknown[];
        const parsedSections: ParsedSection[] = [];

        for (const sec of rawSections) {
          if (!sec || typeof sec !== 'object') continue;
          const rawSec = sec as Record<string, unknown>;

          const rawType = rawSec.sectionType;
          const sectionType: ParsedSectionType =
            rawType === 'buy_in' || rawType === 'cash_out' || rawType === 'rounds'
              ? rawType
              : 'rounds';

          const rounds =
            typeof rawSec.rounds === 'number'
              ? rawSec.rounds
              : sectionType === 'rounds'
                ? 1
                : undefined;

          const sectionMovements: ParsedMovement[] = [];
          if (Array.isArray(rawSec.movements)) {
            for (const mov of rawSec.movements) {
              const validated = validateMovement(mov);
              if (validated) {
                sectionMovements.push(validated);
              }
            }
          }

          if (sectionMovements.length > 0) {
            parsedSections.push({
              sectionType,
              rounds,
              movements: sectionMovements,
            });
          }
        }

        if (parsedSections.length > 0) {
          sections = parsedSections;
        }
      }

      const name = String(exercise.name || 'Unknown Exercise');
      const prescription = String(exercise.prescription || '');
      let suggestedSets = typeof exercise.suggestedSets === 'number' ? exercise.suggestedSets : 1;
      let suggestedReps = typeof exercise.suggestedReps === 'number' ? exercise.suggestedReps : undefined;

      // Only infer sets×reps from text when the AI didn't provide them.
      // Trust AI values — regex overrides have caused bugs (e.g., "4:00 x 3" → sets=0).
      const aiProvidedSets = typeof exercise.suggestedSets === 'number' && exercise.suggestedSets > 0;
      const aiProvidedReps = typeof exercise.suggestedReps === 'number' && exercise.suggestedReps > 0;
      if (!aiProvidedSets || !aiProvidedReps) {
        const setsRepsMatch = `${name} ${prescription}`.match(/(\d+)\s*[x]\s*(\d+)/i)
          || `${name} ${prescription}`.match(/(\d+)\s*sets?\s*of\s*(\d+)/i);
        if (setsRepsMatch) {
          const parsedSets = parseInt(setsRepsMatch[1], 10);
          const parsedReps = parseInt(setsRepsMatch[2], 10);
          if (!Number.isNaN(parsedSets) && !Number.isNaN(parsedReps) && parsedSets > 0) {
            if (!aiProvidedSets) suggestedSets = parsedSets;
            if (!aiProvidedReps) suggestedReps = parsedReps;
          }
        }
      }

      // Validate suggestedRepsPerSet
      let suggestedRepsPerSet: number[] | undefined = undefined;
      if (Array.isArray(exercise.suggestedRepsPerSet)) {
        const arr = exercise.suggestedRepsPerSet.filter((v: unknown) => typeof v === 'number' && v > 0) as number[];
        if (arr.length > 0) {
          suggestedRepsPerSet = arr;
          if (suggestedSets < arr.length) {
            suggestedSets = arr.length;
          }
        }
      }

      // Validate ladderReps — AI-returned ascending rep sequence for ladder AMRAPs
      let ladderReps: number[] | undefined = undefined;
      if (Array.isArray(exercise.ladderReps)) {
        const arr = exercise.ladderReps.filter((v: unknown) => typeof v === 'number' && v > 0) as number[];
        if (arr.length >= 3) {
          const isAscending = arr.every((v, i) => i === 0 || v > arr[i - 1]);
          if (isAscending) ladderReps = arr;
        }
      }

      // Validate loggingMode
      const validLoggingModes: ExerciseLoggingMode[] = ['strength', 'for_time', 'amrap', 'amrap_intervals', 'intervals', 'emom', 'cardio', 'cardio_distance', 'bodyweight', 'sets'];
      const loggingMode = validLoggingModes.includes(exercise.loggingMode as ExerciseLoggingMode)
        ? (exercise.loggingMode as ExerciseLoggingMode)
        : undefined;

      // Validate loggingHints
      let loggingHints: ParsedExercise['loggingHints'] = undefined;
      if (exercise.loggingHints && typeof exercise.loggingHints === 'object') {
        const hints = exercise.loggingHints as Record<string, unknown>;
        if (Array.isArray(hints.sharedWeightMovements)) {
          const names = hints.sharedWeightMovements.filter((v: unknown) => typeof v === 'string') as string[];
          if (names.length >= 2) {
            loggingHints = { sharedWeightMovements: names };
          }
        }
      }

      exercises.push({
        name,
        type: validExerciseTypes.includes(exercise.type as ExerciseType)
          ? (exercise.type as ExerciseType)
          : 'wod',
        prescription,
        suggestedSets,
        suggestedReps,
        suggestedRepsPerSet,
        suggestedWeight: typeof exercise.suggestedWeight === 'number' ? exercise.suggestedWeight : undefined,
        rxWeights: validateRxWeights(exercise.rxWeights),
        movements: movements.length > 0 ? movements : undefined,
        sections,
        loggingMode,
        loggingHints,
        workDuration: typeof exercise.workDuration === 'number' && exercise.workDuration > 0 ? exercise.workDuration : undefined,
        restDuration: typeof exercise.restDuration === 'number' && exercise.restDuration > 0 ? exercise.restDuration : undefined,
        ...(ladderReps && { ladderReps }),
      });
    }
  }

  const rawText = typeof raw.rawText === 'string' ? raw.rawText : undefined;

  // Consecutive deduplication only — remove back-to-back identical exercises
  // (Global dedup was killing buy-out exercises that match buy-in)
  const dedupedExercises = exercises.filter((exercise, index) => {
    if (index === 0) return true;
    const prev = exercises[index - 1];
    const sameKey = exercise.name === prev.name
      && exercise.prescription === prev.prescription
      && exercise.suggestedSets === prev.suggestedSets
      && exercise.suggestedReps === prev.suggestedReps;
    if (!sameKey) return true;
    // Same key — check movements
    return JSON.stringify(exercise.movements || []) !== JSON.stringify(prev.movements || []);
  });

  return {
    title: typeof raw.title === 'string' ? raw.title : undefined,
    type,
    format,
    scoreType,
    exercises: dedupedExercises,
    sets: typeof raw.sets === 'number' ? raw.sets : undefined,
    timeCap: typeof raw.timeCap === 'number' ? raw.timeCap : undefined,
    intervalTime: typeof raw.intervalTime === 'number' ? raw.intervalTime : undefined,
    restTime: typeof raw.restTime === 'number' ? raw.restTime : undefined,
    containerRounds: typeof raw.containerRounds === 'number' ? raw.containerRounds : undefined,
    benchmarkName: typeof raw.benchmarkName === 'string' ? raw.benchmarkName : undefined,
    benchmarkModified: typeof raw.benchmarkModified === 'boolean' ? raw.benchmarkModified : undefined,
    partnerWorkout: typeof raw.partnerWorkout === 'boolean' ? raw.partnerWorkout : undefined,
    teamSize: typeof raw.teamSize === 'number' && raw.teamSize >= 2 ? raw.teamSize : undefined,
    rawText,
    difficultyLevel: typeof raw.difficultyLevel === 'number' && raw.difficultyLevel >= 1 && raw.difficultyLevel <= 10
      ? Math.round(raw.difficultyLevel)
      : undefined,
  };
}

// Infer format from workout type if not specified
function inferFormatFromType(type: WorkoutType): WorkoutFormat {
  switch (type) {
    case 'strength': return 'strength';
    case 'amrap': return 'amrap';
    case 'emom': return 'emom';
    case 'for_time': return 'for_time';
    default: return 'for_time';
  }
}

// Infer score type from format
function inferScoreTypeFromFormat(format: WorkoutFormat): ScoreType {
  switch (format) {
    case 'intervals': return 'time_per_set';
    case 'for_time': return 'time';
    case 'amrap': return 'rounds_reps';
    case 'emom': return 'reps';
    case 'strength': return 'load';
    case 'tabata': return 'reps';
    default: return 'time';
  }
}

// Mock function for testing without API
export async function parseWorkoutImageMock(): Promise<ParsedWorkout> {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 1500));

  return {
    title: "Tuesday WOD",
    type: "mixed",
    format: "intervals",
    scoreType: "time_per_set",
    sets: 5,
    exercises: [
      {
        name: "5 Sets For Time",
        type: "wod",
        prescription: "300m Run + 10 Shoulder to Overhead 40/60kg",
        suggestedSets: 5,
        rxWeights: { male: 60, female: 40, unit: 'kg' },
        movements: [
          { name: "Run", distance: 300, unit: "m", inputType: "none" },
          { name: "Shoulder to Overhead", reps: 10, inputType: "weight", rxWeights: { male: 60, female: 40, unit: 'kg' } }
        ]
      }
    ]
  };
}
