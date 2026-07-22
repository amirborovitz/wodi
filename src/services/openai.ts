import OpenAI from 'openai';
import type { ParsedWorkout, ParsedExercise, WorkoutType, WorkoutFormat, ScoreType, ExerciseType, RxWeights, ParsedMovement, MeasurementUnit, ExerciseLoggingMode, ParsedSection, ParsedSectionType } from '../types';
import { postProcessParsedWorkout, applyTitlePartnerOverride } from './workoutPostProcessor';

const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;

const openai = new OpenAI({
  apiKey: env?.VITE_OPENAI_API_KEY ?? process.env.VITE_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY,
  dangerouslyAllowBrowser: true // Required for client-side usage
});

// Shared by the segmentation and structuring prompts — canonical-name normalization must be
// identical at both stages or the second stage re-interprets the first stage's output.
const MOVEMENT_ALIASES_SECTION = `## MOVEMENT ALIASES (use canonical names)
Barbell: s2oh/stoh → Shoulder to Overhead, dl → Deadlift, bs → Back Squat, fs → Front Squat, pc → Power Clean, sqcl → Squat Clean, ps → Power Snatch, ohs → Overhead Squat, c&j → Clean and Jerk
Gymnastics: hspu → Handstand Push-up, t2b/ttb → Toes to Bar, k2e → Knees to Elbow, mu → Muscle-up, bmu/b.m.u → Bar Muscle-up, rmu → Ring Muscle-up, c2b → Chest to Bar Pull-up, hs walk → Handstand Walk
Cardio: du → Double Under, su → Single Under, cal → Calories
Equipment: kb → Kettlebell, db → Dumbbell, bb → Barbell, wb → Wall Ball
CRITICAL: Compound movements written as "X to Y" or "X + Y" (e.g., "Power Clean to Push Press", "Hang Clean to Overhead", "Deadlift to Hang Power Clean") are a SINGLE movement. Preserve the FULL compound name — do NOT simplify to just the first movement ("Power Clean to Push Press" is NOT "Power Clean").
CRITICAL: Preserve movement modifiers such as Goblet, Front Rack, Overhead, Walking, Alternating/Alt. "20 goblet alt lunges" → "Goblet Alt Lunge", not plain "Lunge".
CRITICAL: A rep-style qualifier (t&g/tng → Touch-and-Go, ub → Unbroken) describes HOW the reps are done, not a second movement — keep it as a prefix on the one movement it modifies. "8 T&G Power Cleans" → "Touch-and-Go Power Clean", NEVER "Touch + Power Clean" (that reads as the "X + Y compound movement" pattern above, which this is not).`;

const PARSE_INTRO = `You are an expert CrossFit coach and workout parser. You understand workout structure — buy-ins, cash-outs, chippers, EMOMs, intervals, supersets, partner WODs. Parse the workout text into structured JSON, matching the workout's logical blocks.

## OUTPUT FORMAT
Return ONLY valid JSON:
{
  "title": "workout name — see TITLE RULES below",
  "rawText": "the full input text — every line, line breaks preserved",
  // sourceDate: date printed on the original WOD/whiteboard, not the date the user logs it.
  // If a full date is visible, return ISO "YYYY-MM-DD". If only day/month is visible, infer the
  // current year. If no original WOD date is visible, return null.
  "sourceDate": "2026-06-26",
  "type": "strength" | "metcon" | "emom" | "amrap" | "for_time" | "mixed",
  // format: describes the PRIMARY exercise's structure. For mixed sessions (strength + metcon), use the metcon's format. Each exercise's loggingMode is authoritative — format is only used for top-level metadata.
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
      "loggingMode": "strength" | "for_time" | "amrap" | "amrap_intervals" | "intervals" | "emom" | "cardio" | "cardio_distance" | "bodyweight" | "sets" | "free",
      "prescription": "human-readable prescription",
      // isSecondary: see HIGH-LEVEL PARTS section below. false for the session's main part(s)
      // (the strength piece and/or the metcon), true for everything else (warm-up, body armor,
      // mobility, accessory/prehab, skill practice unrelated to the main lifts).
      "isSecondary": false,
      // rawText: ONLY the lines from the whiteboard that belong to THIS block (e.g. just the
      // "B. STRENGTH..." section, not "A." or "C."). When the workout has multiple exercises,
      // each one's rawText must be its own non-overlapping slice — never paste the whole
      // workout's text into every exercise. For a single-exercise workout this can equal the
      // top-level rawText.
      "rawText": "this block's own lines from the whiteboard",
      // suggestedSets is the TOTAL number of working rounds for this exercise.
      // For for_time WODs this usually matches "sets". For EMOM with nested inner rounds
      // ("Every 4 min × 4: 2 rounds of: [movements]"), set suggestedSets = intervals × inner rounds (4 × 2 = 8).
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
        { "name": "Shoulder to Overhead", "reps": 10, "inputType": "weight", "equipment": "barbell", "rxWeights": { "male": 60, "female": 40, "unit": "kg" }, "implementCount": 1, "alternative": { "name": "Alt Name", "reps": 10 } },
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
      // intervalCount: how many repeating clock intervals this block has.
      // Examples: "AMRAP 3:00 x 4" → 4, "Every 4:00 x 3 AMRAP" → 3.
      // Omit for single-block pieces (a plain "AMRAP 12" has no intervals).
      "intervalCount": 4,
      // workDuration: programmed work time for THIS EXERCISE in SECONDS.
      // If the exercise represents one block: total work time for that block.
      // Examples: "AMRAP 12" (single block) → 720, "AMRAP 3:00 x 4" (single exercise, 4 intervals) → 720 (180*4),
      //   "A.1 AMRAP 6:00 (Round 1)" (one of 4 split exercises) → 360, "EMOM 15" → 900, "10 min for time" → 600
      // Omit for strength / sets-for-quality with no time component.
      "workDuration": 720,
      // restDuration: programmed rest time for THIS EXERCISE in SECONDS.
      // Examples: "AMRAP 3:00 x 4" with 1:00 rest (single exercise) → 240 (60*4),
      //   "A.1 AMRAP 6:00 (Round 1)" with 2:00 rest (one of 4 split) → 120. Omit when no prescribed rest.
      "restDuration": 240,
      // partnerWorkout / partnerSplit: is THIS SPECIFIC block the partnered one, and how do
      // partners split it? Independent of the top-level partnerWorkout/teamSize (those apply to
      // the whole session for EP/volume math) — see PARTNER / TEAM WORKOUTS below. Set
      // partnerWorkout: false (not omitted) on a solo strength/skill block even when the session
      // overall is partnered.
      "partnerWorkout": true,
      // "rounds" = partners trade whole rounds (IGUG/"I go you go"/"(N each)"); "reps" = partners
      // share one flat/continuous total, no round structure (e.g. "100 wall balls between you").
      "partnerSplit": "rounds"
    }
  ]
}`;

const RULES_BLOCKS = `## BLOCKS — isSecondary

You usually receive ONE part of a session (a strength piece OR a metcon OR accessory work) —
the session was already split upstream. Parse what you're given; never force extra blocks.
- "isSecondary": true for support work (warm-up, "body armor", mobility/prehab, activation,
  "in between sets" accessories, cool-down); false for the piece the athlete trains for
  (the main lift or the metcon). At most 2 non-secondary exercises.
- CRITICAL — EVERY BLOCK IS A STANDALONE PRACTICE. All structure fields ("loggingMode",
  "stationRotation", "intervalCount", "workDuration", "restDuration", and movement-level
  "stationLabel"/"stationIndex"/"countingMode") describe ONE exercise only — set them on the
  exercise they belong to and nowhere else. NEVER copy a flag from one exercise onto its
  siblings (an interval-shaped block does not make a sibling plain AMRAP "stationRotation":
  true). Top-level "format"/"scoreType" describe the main metcon/WOD exercise.`;

const RULES_METCON_STRUCTURE = `## ROUND / SECTION STRUCTURE (BUY-IN -> ROUNDS x [BLOCK] -> CASH-OUT)

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
- LETTERED SUB-BLOCKS UNDER ONE SCORE: a single for-time piece may label its sequential blocks
  A./B./C. under ONE "For time" header and ONE time cap (e.g. "For time: A. 10 rounds: [block]
  B. 10 rounds: [block] C. 10 rounds: [block], 40 min T.C."). These are round sections of ONE
  exercise — one "sections" entry per block with that block's "rounds" count — NOT separate
  exercises. The athlete logs one total time for the whole piece.
- CRITICAL DISTINCTION: The previous rule only means "do not copy the whole round block N
  times." It does NOT mean dedupe repeated movements that appear multiple times inside the
  round block itself. If the per-round prescription says "200m run, 10 deadlift, 200m run,
  10 power clean", the movements[] array MUST contain Run, Deadlift, Run, Power Clean in
  that order. Those repeated Run entries are real work inside each round, not simulated
  rounds.
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
- CRITICAL — RFT INTRA-ROUND REPEATS: In RFT / rounds-for-time workouts, preserve the
  exact movement sequence inside ONE round, counting every printed occurrence literally —
  including a repeat that appears immediately before the FINAL movement in the round. The
  last movement is not exempt just because it ends the round. If a movement appears
  multiple times inside that per-round sequence, include it multiple times in movements[].
  Example:
  "4 RFT: 200m Run, 10 Deadlift, 200m Run, 10 Power Clean, 200m Run, 10 Front Squat,
  200m Run, 10 Shoulder to Overhead, 200m Run, 10 Pull-up" ->
  movements: [Run 200m, Deadlift 10, Run 200m, Power Clean 10, Run 200m,
  Front Squat 10, Run 200m, Shoulder to Overhead 10, Run 200m, Pull-up 10],
  suggestedSets: 4. Do NOT collapse those five Run entries into one, and do not drop the
  one immediately before the last movement.

## FORMAT DETECTION (pick exactly one)
| Format | Trigger | scoreType |
|--------|---------|-----------|
| amrap_intervals | "2:30 AMRAP x 4", multiple AMRAPs with rest, "every X:XX → buy-in + AMRAP for remaining time" — word "AMRAP" MUST appear | rounds_reps |
| intervals | "5 sets for time", "every 3:00 x 5", "every 11 min x 3: [fixed work]" — fixed amounts per interval, NO "AMRAP" in text | time_per_set |
| for_time | "for time", "RFT" (no "x sets") | time |
| amrap | "AMRAP 12" (single) | rounds_reps |
| emom | "EMOM", "every 1:00", "E2MOM" | reps |
| strength | "5x5", "3x8 @70%", "build to 1RM" | load |
| tabata | "tabata", "20s on/10s off" | reps |`;

const RULES_QUANTITIES = `## WEIGHT PARSING
- "40/60 kg" → rxWeights: { female: 40, male: 60, unit: "kg" } (higher = male)
- "@60kg" → rxWeights: { male: 60, female: 60, unit: "kg" }
- "twin kb 16kg" or "2 kb 24kg" → rxWeights: 16 (per implement), implementCount: 2

## DISTANCE PARSING
- "~50m" or "approx 50m" → distance: 50 (use the numeric value as-is, ignore ~ / approx)
- "50m" → distance: 50
- Carries (farmer carry, suitcase carry, yoke, etc.) with prescribed distance: set distance field, inputType: "none"
- Equipment DIMENSIONS are never distances: box height ("box step-ups (30cm)", "24\" box"), wall ball target height, sled/rig heights. Do NOT set "distance" from them — keep the movement's reps: "8 weighted box step-ups (30cm)" → { "name": "Weighted Box Step-up", "reps": 8 } (30cm is the box height)

## REP RANGES
When a movement prescribes a rep RANGE ("10-12 pull-ups", "16-20 KB swings"), set "reps" to the
midpoint rounded to the nearest whole rep and "repsDisplay" to the range exactly as the coach
wrote it: "10-12" → reps: 11, repsDisplay: "10-12". The midpoint exists only so computed totals
are fair — every displayed prescription uses "repsDisplay". Omit "repsDisplay" for single rep counts.

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
- CRITICAL: a missing written weight does NOT make a loaded movement "none". A push press, thruster, or "weighted X" with no weight on the board is still inputType "weight" — that is exactly when the athlete must be asked what they lifted.

## MOVEMENT EQUIPMENT
Every movement performed with an external load MUST also include "equipment" — the implement the load is on (include it even when the board writes no weight):
- "barbell": barbell lifts (deadlift, back/front squat, press family, clean, snatch, thruster with a bar)
- "dumbbell": DB movements
- "kettlebell": KB movements
- "other": everything else — wall ball / med ball, plate, sandbag, D-ball, sled, weighted vest, and any "weighted X" with no stated implement ("weighted box step-ups", "weighted pull-ups"). When unsure which implement, use "other".
A DOUBLE implement (implementCount 2 — "twin", "double", "2x", "pair" of DBs or KBs, e.g. "twin DB's / KB's push press", "double DB thrusters") is ALWAYS "dumbbell" or "kettlebell", NEVER "barbell" — you cannot hold two barbells. Keep implementCount 2 AND set equipment "dumbbell" (or "kettlebell" if the board says KB). A press/clean/thruster done with two DBs/KBs is NOT a barbell lift.
The logging UI merges same-equipment movements into ONE weight input, so "equipment" decides what shares a bar and what gets asked separately. Omit the field for unweighted movements.`;

const RULES_STATIONS = `## ROTATING STATION LABELS
When an interval workout has labeled stations (A, B, C… or Station 1, 2, 3…), set "stationLabel" on the FIRST movement of each station only.
- "A. MAX BIKE\nB. 10 Renegade Row + MAX Step Up\nC. MAX ROW" → Bike gets stationLabel "A", Renegade Row gets stationLabel "B" (Step Up omits it), Row gets stationLabel "C"
- EMOM minute slots are stations too: "min 1: 10-12 pull-ups\nmin 2: 16-20 KB swings\nmin 3: 15 box jumps" → stationLabel "Min 1" / "Min 2" / "Min 3". This is a display label only — keep reps as the per-minute value and suggestedSets as usual.
- Only emit stationLabel when the workout explicitly labels its stations (letters, numbers, or minute slots).

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
- Prescribed per-round values that should still be multiplied by rounds/visits (e.g. 10 Renegade Row, 20 DB Snatch) also use scoreEntryMode: "per_round"`;

const RULES_MOVEMENT_CORE = `## IMPLEMENT COUNT (DB/KB)
Every DB or KB movement MUST include "implementCount": 1 or 2.
- rxWeights is ALWAYS the weight of ONE implement (never pre-doubled)
- implementCount: 2 when "twin", "double", "2x", "pair" is explicit, OR the movement naturally uses two (DB Thrusters, DB Front Squats, Farmers Carry)
- implementCount: 1 for single-arm or single-implement movements (DB Snatch, Alt DB Clean, American Kettlebell Swing, Goblet Squat, Turkish Get-up)
- "KB Swing(s)" without Russian specified means "American Kettlebell Swing"; Russian/American swing labels only apply to kettlebell swings.
- "A.KB", "A. KB", "AKS", "AKBS" = "American Kettlebell Swing" (overhead / 360°). NOT "Alt" or "Alternating".
- "R.KB", "R. KB", "RKS", "RKBS" = "Russian Kettlebell Swing" (eye/chest height / 180°).
- When ambiguous, default to 1

## LOGGING MODE (per exercise)
Every exercise MUST include "loggingMode" — this is the MOST IMPORTANT field per exercise and determines which logging UI the user sees. Set it independently for each exercise regardless of the workout's overall format.
- "strength": barbell/DB/KB lifts with sets×reps (5x5 Back Squat, 3x8 DB Press)
- "for_time": complete work ASAP, log total time (RFT, chipper, partner IGUG, team workouts with total cal/rep targets)
- "amrap": as many rounds as possible in time limit
- "amrap_intervals": multiple AMRAP blocks with rest (3x AMRAP 3:00, rest 1:00) OR "every X:XX" with explicit "AMRAP" text — the word "AMRAP" MUST appear. "Every 11 min x 3: 100 cal Echo Bike + 20 DB Snatch" is NOT amrap_intervals — it is emom (fixed amounts per round)
- "emom": ANY fixed time-window structure where the athlete logs weight/reps — NOT their time. Includes strict EMOM (every 1 min), E2MOM, E3MOM, "every 4:00 min", "every 5 min", "every X:XX × N rounds" with fixed movements. The interval duration is PRESCRIBED; the athlete logs WHAT they did, never how long it took. Examples: "EMOM 10: 3 Squat Cleans", "Every 4:00 min x 4 rounds: 8 Thrusters + 8 T2B + 8 Box Jumps", "E3MOM x 5: 5 Deadlifts @80%"
- "intervals": sets where the athlete's TIME PER SET is the score — they are racing the clock. Use ONLY when athletes are expected to log a split time per set. Examples: "5×400m for time, 2 min rest", "4 sets for time: 10 DL + 10 Box Jumps, rest = work time". NOT for "every X min" structures where a time window is prescribed.
- "cardio": machine work scored by calories (single machine, no other movements)
- "cardio_distance": cardio scored by distance (single machine, no other movements)
- "bodyweight": reps-only bodyweight work (no weight needed)
- "sets": generic fallback for sets-based work (weight/reps per set)
- "free": ESCAPE HATCH — the part's structure genuinely fits none of the modes above. NEVER
  force-fit an exotic structure into the wrong mode just to avoid "free": a wrong mode corrupts
  the athlete's numbers, "free" just asks them for one score. Still transcribe the part's own
  rawText faithfully and list its movements with any visible reps/weights.

CRITICAL emom vs intervals: "Every 4:00 min x 4 rounds: 8 Thrusters + 8 TTB + 8 Box Jumps" → "emom" (prescribed window, log weight). "5 sets for time, 2 min rest" → "intervals" (race the clock, log split times). When in doubt: if the time is the window you work WITHIN, it's "emom". If the time is WHAT YOU'RE MEASURING, it's "intervals".

CRITICAL nested EMOM rounds: When an EMOM has inner rounds ("Every X min × N: M rounds of: [movements]"), set suggestedSets = N × M (total effective rounds). Example: "Every 4 min × 4 rounds: 2 rounds of: 8 Thrusters, 8 T2B, 8 Box Jumps" → suggestedSets: 8 (4 × 2). The movements keep reps as the per-round value (reps: 8). This ensures totalReps = suggestedSets × reps = 8 × 8 = 64.

CRITICAL: Partner/IGUG/team workouts where teams complete a target (e.g., "300 cal echo bike" or "100 rounds") are ALWAYS "for_time" — even if the word "interval" appears in the text. "intervals" mode means individually-timed sets with rest, NOT partner rotation.

## LOGGING HINTS (per exercise)
When movements share input fields, add "loggingHints":
- Barbell complexes ("1 Power Clean + 1 Squat Clean"): set sharedWeightMovements with all movement names that share the same bar.
- Only for movements physically sharing one implement (barbell, single KB).
- Do NOT group movements using different implements (barbell squat + KB swing).

${MOVEMENT_ALIASES_SECTION}

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
1. Only split into multiple exercises for truly separate blocks (e.g., Strength + Metcon, Skill + WOD). A single WOD = one exercise — UNLESS the workout alternates between different movement blocks (A.1/A.2, odd/even minutes with different movements). Alternating blocks need separate exercises for separate round scores. SEQUENTIAL LIFTS UNDER ONE HEADING = ONE exercise with SECTIONS (not separate exercises, not one flat block): when a strength piece flows one movement "Into:"/"then" another under a single heading and EACH block has its OWN set count — e.g. "4 sets Every 1:30: 2 Push Press / Into: / 4 sets Every 1:30: 2 Push Jerk" — emit ONE exercise whose "sections" has one "rounds" section PER block, each with that block's own "rounds" (set count) and its own movement(s). Also list each movement once in top-level "movements[]" for reference. These blocks are done SEQUENTIALLY at INDEPENDENT weights (Push Press across its 4 sets, THEN Push Jerk across its 4 sets), so they must NOT be flattened into one shared block. This differs from a SIMULTANEOUS "+"-joined complex done together each set on one bar (e.g. "1 Power Clean + 1 Push Jerk"), which stays a single flat "movements[]" list with NO sections (one shared weight). See examples 4b (sequential → sections) and 4c (simultaneous → flat).
2. Exercise names MUST include set count/timing (e.g., "8 Rounds For Time", "5 sets every 2:30"). "AxB" = A sets of B reps.
3. Movement alternatives ("40 DU / 60 singles"): use "alternative" field, easier movement as primary. Do NOT create two separate movements.
4. ALWAYS include "difficultyLevel" (1–10) at the top level. Rate the programmed difficulty, not athlete fitness. Use the full range: 1=active recovery, 3=easy, 5=moderate benchmark pace, 7=hard, 8=very hard, 10=brutal. Consider load relative to body weight, total volume, time cap, and movement complexity. Example: "50 cal Echo Bike + 50 Thrusters @30kg × 3 rounds" = 8.
5. Prescription fidelity: "prescription" MUST paraphrase the actual whiteboard text. NEVER invent descriptors like "build to heavy", "heavy singles", "for quality" unless those exact words appear in the source. But DO preserve coach LOADING & EXECUTION cues that ARE written — starting/target percentages ("start at ~65%", "@70% build up"), progression cues ("build up weight", "add weight each set", "ascending"), tempo, and setup notes ("from the floor", "touch and go"). These tell the athlete how to load; keep them in the prescription (e.g. "4 sets Every 1:30: 2 Push Press — start ~65% and build up, from the floor"). Do NOT drop a written percentage or "build up" cue.
6. RPE / RIR strength work: "@0-1 R.I.R" / "@2-3 R.I.R" / "@7 RPE" are intensity constraints, NOT rep counts. Set suggestedReps from the rep count in the prescription (e.g., "5 C2B @0-1 RIR" → suggestedReps: 5). NEVER sum multiple movement reps across a superset to produce suggestedReps. For a superset exercise with different rep counts per movement, omit suggestedReps entirely.
7. Compound movement names: ALWAYS preserve the full name — "Burpee Step Up", "Burpee Box Jump Over", "Burpee Broad Jump" are distinct movements. Do NOT simplify to "Burpee".
8. ROUND-ALTERNATING PAIRS: one line offering two movements marked "(alternates)" / "alternating" inside a rounds structure (e.g. "Push press/thrusters (alternates)" in "8 rounds of:") means the athlete switches movement each round — half the rounds are one, half the other. Emit ONE movement named as the pair ("Push Press / Thruster") with the per-round reps if the board OR the athlete's context note gives a count (the note is authoritative — "it is 8 alternating push press/thrusters" → reps: 8). If neither gives one, OMIT "reps" entirely — never invent it. Do NOT emit two separate per-round movements (that double-counts the work every round), and do NOT use the "alternative" field (that means an either/or scaling choice, not alternation).`;

const RULES_BENCHMARKS = `## CONTAINER/BENCHMARK RECOGNITION
- containerRounds: outer rounds wrapping a benchmark (7 in "7 rounds of Cindy")
- benchmarkName: Cindy, DT, Fran, Grace, Isabel, Helen, Diane, Elizabeth, Jackie, Karen, Annie, Mary
- benchmarkModified: true if weight/reps differ from standard
- If definition is provided in text, use that; otherwise use standard benchmark`;

const RULES_REP_SCHEMES = `## VARIABLE REP SCHEMES
"[6-5-4-3-2]" or "21-15-9" → suggestedRepsPerSet array, suggestedSets = array length.
Bracket notation like "[20-16-12-8-4]" in a for_time workout → suggestedRepsPerSet: [20, 16, 12, 8, 4], suggestedSets: 5.
CRITICAL: NEVER treat a bracketed descending rep scheme as "N rounds of the same reps". "[20-16-12-8-4]" is 5 DIFFERENT sets, not 5 rounds of 20.
CRITICAL — PER-MOVEMENT INDEPENDENT SCHEMES: when SEVERAL movements EACH carry their OWN bracketed rep scheme and the schemes DIFFER (e.g. "[50-40-30] air squats, [30-20-10] push press, 15 box jumps after each set"), a single "suggestedRepsPerSet" CANNOT represent them — it holds only ONE scheme, so applying it to every movement falsely claims they all descend 50-40-30. Instead emit ONE "rounds":1 section PER round, each listing EVERY movement with ITS OWN rep for that round (the pyramid model). A fixed-rep add-on ("15 box jumps after each set") repeats its CONSTANT rep count every round. Do NOT collapse divergent per-movement schemes into one suggestedRepsPerSet, and do NOT drop the fixed add-on movement.
Example: "For time: [50-40-30] air squats / [30-20-10] twin DB/KB push press / 15 box jumps after each set" ->
  sections: [
    { sectionType: "rounds", rounds: 1, movements: [Air Squat 50, DB Push Press 30 (implementCount 2), Box Jump 15] },
    { sectionType: "rounds", rounds: 1, movements: [Air Squat 40, DB Push Press 20 (implementCount 2), Box Jump 15] },
    { sectionType: "rounds", rounds: 1, movements: [Air Squat 30, DB Push Press 10 (implementCount 2), Box Jump 15] }
  ]
  (top-level movements[] lists each unique movement once, with its round-1 reps, for reference.)`;

const RULES_LADDERS_PARTNERS = `## ASCENDING LADDER REP SCHEMES
When an AMRAP workout has a strictly ascending rep sequence, set ladderReps to the sequence.
- "2-4-6-8-10---" → ladderReps: [2, 4, 6, 8, 10], loggingMode: "amrap"
- "1-2-3-4-5 each" → ladderReps: [1, 2, 3, 4, 5], loggingMode: "amrap"
- "21-15-9" is NOT a ladder (descending) → suggestedRepsPerSet: [21, 15, 9], NO ladderReps
- ladderReps applies ONLY to ascending sequences in AMRAP workouts. Do not set it for strength or for_time.
- FIXED ADD-ON MOVEMENTS: if a movement is done every round at a CONSTANT rep count alongside the ladder (e.g. "2-4-6-8-10-12 KB lunges + push press, 6 burpees after each set"), set "perRound": false on that movement and keep its real fixed reps value. Decide this from the "after each round/set" language, NOT from whether its rep count happens to match one of the ladder rungs — a fixed "6 burpees" stays fixed even if the ladder also passes through 6.

## PARTNER / TEAM WORKOUTS
- A partner workout means the WORK IS SHARED OR SPLIT between athletes: a team total divided up, whole rounds traded (IGUG), or one shared score built by both. Pair language alone is NOT enough — see PAIR-PACED below for pairs that only time each other.
- "IGUG", "I go you go", "in pairs", "with a partner" WITH shared/split work → partnerWorkout: true, teamSize: 2
- "teams of N", "group of N", "in a team of N" → partnerWorkout: true, teamSize: N
- A board TITLED or headed "Partner WOD" / "Partner Metcon" is a partner workout even when no other partner phrasing appears in the body → partnerWorkout: true, teamSize: 2 (unless a different team size is stated). Keep that heading line in rawText — it is part of the board.
- "(6 each)" → suggestedSets: 6 (per-person count for the logging UI, NOT total).
- CRITICAL: For partner workouts with sections, sections.rounds = TOTAL rounds (e.g., "6 rounds (3 each)" → sections.rounds: 6, suggestedSets: 3). The app computes per-person share as sections.rounds × partnerFactor. Never pre-divide sections.rounds by team size.
- "together" movements: when a movement says "(together)" or "run together", set "together": true on that movement. This means ALL partners do the full amount (not split). Example: "600m run (together)" → distance: 600, together: true.
- MULTI-SECTION WORKOUTS: If ANY section of the workout uses partner/team language (e.g., "B. METCON: In pairs, I go you go…"), set partnerWorkout: true and teamSize at the TOP LEVEL of the parsed output, not just on the exercise. This ensures the partner factor is applied correctly for the entire session.
- CRITICAL PARTNER SPLIT DISTINCTION: There are two partner workout shapes. Use partnerSplit: "rounds" only when partners explicitly trade/own complete rounds, e.g. "6 rounds (3 each)", "alternate full rounds", or a single total round target completed round-by-round. For sectioned for-time partner workouts ("In pairs: 3 rounds ... then 3 rounds ... then buy-out/cash-out"), use partnerSplit: "reps" even if the instructions say "I go you go" or "split however"; each exercise inside the section is shared/split unless that movement is marked together. Keep section.rounds as the prescribed section repeat count.
- PER-EXERCISE partnerWorkout/partnerSplit (on EACH exercise object, separate from and in addition to the top-level fields above): the top-level fields describe the whole SESSION (for EP/volume math); they do NOT mean every exercise is partnered. On EACH exercise, set its OWN partnerWorkout/partnerSplit: a strength or skill block is partnerWorkout: false even when a sibling metcon block in the same session is partnered — set this explicitly, don't omit it. For the exercise that IS partnered: partnerSplit: "rounds" when partners trade whole rounds (IGUG/"I go you go"/"(N each)"), or partnerSplit: "reps" when partners share one flat/continuous total with no round structure (e.g. "100 wall balls between you, split however"). The per-person round count for "rounds" continues to be suggestedSets, per the "(N each)" rule above — do not add a separate count field.
- ROTATING STATION HEADCOUNT: "5 groups starting at different stations (7 people max)" / "max 6 per station" are logistics notes, NOT team designations. Do NOT set partnerWorkout or teamSize from headcount-per-station language. Only set teamSize when athletes are explicitly working together as one unit (IGUG, In Pairs, Team of N completing a shared target).

### PAIR-PACED AMRAP (pairs as the clock — NOT a partner workout)
When P1 and P2 do DIFFERENT activities simultaneously and swap ("In pairs: P1 200m run, P2 AMRAP of 6 Thrusters + 6 Burpees", "continue from where you stopped"), the pair structure only PACES the work: each athlete performs the full work of both stations and owns their own score — the partner's fixed task is just the interval timer. This is NOT a partner workout:
- partnerWorkout: false and NO teamSize at the top level, AND partnerWorkout: false on the exercise (set it explicitly).
- Emit ONE exercise (never split P1/P2 into separate exercises). loggingMode: "amrap", workDuration = the piece's total time.
- movements = the pacer movement FIRST, stamped "relay": true (any modality: 200m run, 10 cal Echo Bike, 10 box jumps — keep its real per-trip quantity, inputType "distance" for distance pacers), followed by the AMRAP movements.
- prescription = a short narration of the swap structure so a viewer understands the format (e.g., "In pairs — P1 runs 200m while P2 AMRAPs; swap each run, continue where you stopped"), NOT a movement list.
- The score is the athlete's OWN rounds ("score is total rounds completed" in this shape means each athlete counts their own).

Only treat such a piece as a true partner workout when the board explicitly makes the score one shared team total that both athletes build together.`;

const RULES_SKILL_TIMECAP = `## SKILL / PRACTICE BLOCKS
"Practice", "build weight", "movement focus", "for quality", "quality sets" → type: "skill", suggestedSets: N (number of stated sets), NO suggestedReps, NO movements from other blocks.
Example: "A. 3 sets, for quality: 10 ring rows, 15 prone T-raises" → exercise type: "skill", suggestedSets: 3.

## TIME CAP
"T.C." / "TC" / "time cap" → timeCap in seconds. "16 min T.C." → timeCap: 960.`;

const EXAMPLES_METCON_BASIC = `### 1. Buy-in + Rounds + Cash-out
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

`;

const EXAMPLE_STRENGTH = `### 4. Strength
Input: "Back Squat 5x5 @75%"
Output:
{
  "type": "strength", "format": "strength", "scoreType": "load",
  "exercises": [{ "name": "Back Squat", "type": "strength", "loggingMode": "strength", "prescription": "5x5 @75%", "suggestedSets": 5, "suggestedReps": 5 }]
}

### 4b. SEQUENTIAL strength complex chained by "Into:" — ONE exercise, one SECTION per block
Input: "4 sets, Every 01:30: 2 Push Press / Into: / 4 sets, Every 01:30: 2 Push Jerk / start at ~65% and build up, from the floor"
Output:
{
  "type": "strength", "format": "emom", "scoreType": "load",
  "exercises": [{
    "name": "Weightlifting", "type": "strength", "loggingMode": "emom",
    "prescription": "4 sets Every 1:30: 2 Push Press, then 4 sets Every 1:30: 2 Push Jerk — start ~65% and build up, from the floor",
    "suggestedSets": 8,
    "movements": [
      { "name": "Push Press", "reps": 2, "inputType": "weight", "equipment": "barbell" },
      { "name": "Push Jerk", "reps": 2, "inputType": "weight", "equipment": "barbell" }
    ],
    "sections": [
      { "sectionType": "rounds", "rounds": 4, "movements": [ { "name": "Push Press", "reps": 2, "inputType": "weight", "equipment": "barbell" } ] },
      { "sectionType": "rounds", "rounds": 4, "movements": [ { "name": "Push Jerk", "reps": 2, "inputType": "weight", "equipment": "barbell" } ] }
    ]
  }]
}
Why sections: each lift is its OWN block at its OWN building weight — the athlete logs Push Press across its 4 sets, THEN Push Jerk across its 4 sets. One "rounds" section per block keeps the two progressions independent for logging and the poster. Generalizes to N blocks (3+ lifts chained by "Into:"/"then") and any per-block set count.

### 4c. SIMULTANEOUS barbell complex ("+"-joined, done together each set) — ONE flat block, NO sections
Input: "Every 2:00 x 5: 1 Power Clean + 1 Hang Clean + 1 Push Jerk (same bar)"
Output:
{
  "type": "strength", "format": "emom", "scoreType": "load",
  "exercises": [{
    "name": "Barbell Complex", "type": "strength", "loggingMode": "emom",
    "prescription": "Every 2:00 x 5: 1 Power Clean + 1 Hang Clean + 1 Push Jerk",
    "suggestedSets": 5,
    "movements": [
      { "name": "Power Clean", "reps": 1, "inputType": "weight", "equipment": "barbell" },
      { "name": "Hang Clean", "reps": 1, "inputType": "weight", "equipment": "barbell" },
      { "name": "Push Jerk", "reps": 1, "inputType": "weight", "equipment": "barbell" }
    ]
  }]
}
Why NO sections: the three lifts are ONE unbroken set on ONE bar at ONE weight, all done every round (a "+"-joined complex). A single flat "movements[]" is correct — one shared weight. Contrast 4b, where "Into:" separates blocks each with its own set count and its own building weight.`;

const EXAMPLES_METCON_ADVANCED = `### 5. Intervals
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

### 6. Strength block with nested-round EMOM sibling
Input: "Every 04:00 min x 4 rounds:\n2 rounds of:\n8 Thrusters @30/40kg\n8 T.T.B\n8 box jumps"
Output:
{
  "title": "IRON SURGE", "type": "emom", "format": "emom", "scoreType": "load",
  "exercises": [
    {
      "name": "Every 4:00 min x 4 rounds", "type": "wod", "loggingMode": "emom", "isSecondary": false,
      "prescription": "2 rounds of: 8 Thrusters @30/40kg, 8 T.T.B, 8 Box Jumps", "suggestedSets": 8,
      "movements": [
        { "name": "Thruster", "reps": 8, "inputType": "weight", "rxWeights": { "male": 40, "female": 30, "unit": "kg" } },
        { "name": "Toes to Bar", "reps": 8, "inputType": "none" },
        { "name": "Box Jump", "reps": 8, "inputType": "none" }
      ]
    }
  ]
}
NOTE: "Every 4:00 min x 4 rounds" → "emom" (prescribed time window, log weight). suggestedSets = 8 = 4 intervals × 2 inner rounds — always multiply through so totalReps is correct.

### 7. Partner RFT with time cap
Input: "With a partner IGUG (6 each): 10 Deadlifts 60/40kg, 40 D.U./60 Singles, 15 Box Jumps. 16 min T.C."
Output:
{
  "type": "for_time", "format": "for_time", "scoreType": "time", "partnerWorkout": true, "teamSize": 2, "sets": 6, "timeCap": 960,
  "exercises": [{ "name": "Partner RFT (6 each)", "type": "wod", "loggingMode": "for_time", "prescription": "6 rounds each: 10 DL 60/40kg, 40 DU/60 SU, 15 Box Jumps", "suggestedSets": 6,
    "partnerWorkout": true, "partnerSplit": "rounds",
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
  "exercises": [{ "name": "Every 4:00 x 3 AMRAP", "type": "wod", "loggingMode": "amrap_intervals", "prescription": "200m Run buy-in, then AMRAP: 4 Bar Muscle-up, 8 Box Jumps, 10 KB Swings @24/32kg", "suggestedSets": 3, "intervalCount": 3, "workDuration": 720, "restDuration": 0,
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

Exception for alternating stations: when the text says "(alt)", "alternate", "alternating stations", or "two groups starting at different stations" and labels blocks like B.1 / B.2 under one repeated interval clock, keep ONE metcon exercise with stationRotation: true, loggingMode: "amrap_intervals", intervalCount set to the total interval count, and stationLabel/stationIndex/countingMode: "per_station_visit" on the first movement of each station. The total interval count is distributed across stations. Example: "[02:00 AMRAP / 01:00 REST] x 6 (alt): B.1 200m Run + Max DB Devil Press, B.2 50 DU + Max Sit-ups" means 6 total intervals, 2 stations, 3 visits per station.

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

### 14b. ALTERNATING stations under one clock — ONE exercise, never separate exercises
Input: "[02:00 min AMRAP / 01:00 min REST] x 6 (alt'):
B.1. 200m run
Max single DB alt' Devil press @15/22.5kg
B.2. 50 D.U. / 80 singles
Max sit ups
* Two groups, starting at different stations. (B.1 / B.2)"
Output:
{
  "title": "ALT STATIONS", "type": "amrap", "format": "amrap_intervals", "scoreType": "rounds_reps",
  "timeCap": 1080, "intervalTime": 120, "sets": 6,
  "exercises": [{
    "name": "02:00 min AMRAP x 6", "type": "wod", "loggingMode": "amrap_intervals",
    "prescription": "[02:00 AMRAP / 01:00 REST] x 6 (alt'): B.1 200m Run + Max Devil Press, B.2 50 Double Unders + Max Sit-ups",
    "suggestedSets": 1, "stationRotation": true, "intervalCount": 6, "workDuration": 720, "restDuration": 360,
    "movements": [
      { "name": "Run", "distance": 200, "stationLabel": "B.1", "countingMode": "per_station_visit", "inputType": "distance" },
      { "name": "Single DB Alt Devil Press", "isMaxReps": true, "countingMode": "per_station_visit", "inputType": "weight", "rxWeights": { "male": 22.5, "female": 15, "unit": "kg" } },
      { "name": "Double Under", "reps": 50, "alternative": { "name": "Single Under", "reps": 80 }, "stationLabel": "B.2", "countingMode": "per_station_visit", "inputType": "none" },
      { "name": "Sit-up", "isMaxReps": true, "countingMode": "per_station_visit", "inputType": "none" }
    ]
  }]
}
NOTE: The difference from example 14 is the ROTATION: "(alt)" / "alternate" / "two groups starting at different stations" means the SAME interval clock cycles through the stations — that is ONE exercise with stationRotation: true and stationLabel on the first movement of each station, NEVER separate exercises per station. 6 total intervals ÷ 2 stations = 3 visits per station. workDuration/restDuration stay CUMULATIVE across all 6 intervals (720 / 360).

### 15. Pair-paced AMRAP (P1 and P2 do different activities and swap — NOT a partner workout)
Input: "In pairs, 15 minutes AMRAP: P1 - 200m run. P2 - AMRAP: 4 Power Cleans @40/60kg, 6 Push-ups, 8 Sit-ups. * Continue from where you stopped. ** Score is the total rounds completed."
Output:
{
  "title": "Pairs AMRAP 15",
  "type": "amrap",
  "format": "amrap",
  "scoreType": "rounds_reps",
  "partnerWorkout": false,
  "timeCap": 900,
  "exercises": [
    {
      "name": "Pairs AMRAP 15",
      "type": "wod",
      "loggingMode": "amrap",
      "partnerWorkout": false,
      "prescription": "In pairs — P1 runs 200m while P2 AMRAPs; swap each run, continue where you stopped",
      "suggestedSets": 1,
      "workDuration": 900,
      "movements": [
        { "name": "Run", "distance": 200, "unit": "m", "relay": true, "inputType": "distance" },
        { "name": "Power Clean", "reps": 4, "inputType": "weight", "rxWeights": { "male": 60, "female": 40, "unit": "kg" } },
        { "name": "Push-up", "reps": 6, "inputType": "none" },
        { "name": "Sit-up", "reps": 8, "inputType": "none" }
      ]
    }
  ]
}
NOTE: ONE exercise — the pacer keeps its per-trip quantity with "relay": true (the athlete logs how many trips they did; the AMRAP rounds counter is separate). Same shape when the pacer is a machine or bodyweight movement ("P1: 10 cal Echo Bike while P2 AMRAPs" → { "name": "Echo Bike", "calories": 10, "relay": true, "inputType": "calories" }). partnerWorkout stays false: nothing is shared or split — the pair is only the clock.

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
NOTE: Each section with different reps/distances gets its own sections entry with rounds: 1. The movements[] at top lists unique movements (deduplicated) for reference. DO NOT flatten all sections into one movement list — the pyramid structure must be preserved.`;

const PARSE_FOOTER = 'If the text is not a workout, return: {"error": "Could not parse workout from text"}';

const RULES_CORE = [RULES_BLOCKS, RULES_QUANTITIES, RULES_MOVEMENT_CORE, RULES_REP_SCHEMES, RULES_SKILL_TIMECAP].join('\n\n');
const RULES_METCON = [RULES_METCON_STRUCTURE, RULES_STATIONS, RULES_BENCHMARKS, RULES_LADDERS_PARTNERS].join('\n\n');

// Kind-scoped prompt: a strength/accessory part skips the metcon structure rules and examples it
// can never use (~70% of the prompt's tokens). Beyond cost, this is what lets a multi-part
// session structure its parts in PARALLEL without bursting through OpenAI's per-minute token
// limit. No kind (single-pass fallback, corpus/check-wod scripts) gets the full prompt.
function buildParsePrompt(kind?: WorkoutPartSegment['kind']): string {
  const liftOnly = kind === 'strength' || kind === 'accessory';
  return [
    PARSE_INTRO,
    RULES_CORE,
    ...(liftOnly ? [] : [RULES_METCON]),
    '## EXAMPLES',
    ...(liftOnly ? [EXAMPLE_STRENGTH] : [EXAMPLES_METCON_BASIC, EXAMPLE_STRENGTH, EXAMPLES_METCON_ADVANCED]),
    PARSE_FOOTER,
  ].join('\n\n');
}

// Athlete-supplied context/correction, injected into segmentation and structuring calls.
// It outranks the board text: the athlete may state facts that were never written down
// (e.g. the coach said "grab a partner" verbally, so the whiteboard has no partner marking).
function athleteContextBlock(note: string): { type: 'text'; text: string } {
  return {
    type: 'text',
    text: 'ATHLETE CONTEXT — the athlete who did this workout added the note below. '
      + 'It is authoritative: it comes from the athlete directly and may state facts that are '
      + 'NOT written in the workout text (e.g. that it was a partner workout, the real time cap, '
      + 'a movement the text got wrong). Apply it even where it contradicts the text.\n\n'
      + note,
  };
}

/**
 * Parse a workout from plain text (no image).
 * `kind` scopes the prompt to the part's shape (see buildParsePrompt); omit it for full coverage.
 * Returns the raw AI JSON string for debugging, plus the parsed result.
 */
export async function parseWorkoutText(
  text: string,
  sourceLabel: 'TEXT' | 'IMAGE' = 'TEXT',
  kind?: WorkoutPartSegment['kind'],
  athleteNote?: string,
): Promise<{ raw: string; parsed: ParsedWorkout }> {
  const startedAt = performance.now();
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: buildParsePrompt(kind) },
          { type: 'text', text: `Here is the workout text to parse:\n\n${text}` },
          ...(athleteNote ? [athleteContextBlock(athleteNote)] : []),
        ],
      },
    ],
    max_tokens: 4000,
    temperature: 0.2,
  });
  console.info(`[TIMING] structure (${kind ?? 'full'}): ${Math.round(performance.now() - startedAt)}ms`);

  const content = response.choices[0]?.message?.content || '';
  let jsonStr = content;
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) jsonStr = jsonMatch[1];

  const rawJson = jsonStr.trim();
  const data = JSON.parse(rawJson);
  const validated = validateParsedWorkout(data);
  const postProcessed = postProcessParsedWorkout(validated);

  logAiWorkoutSummary(`${sourceLabel} PARSE AI`, data);
  logAiWorkoutSummary(`${sourceLabel} PARSE POST`, postProcessed);

  return { raw: rawJson, parsed: postProcessed };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

// One console.table row per movement, in literal array order — makes a missing/duplicated
// occurrence (e.g. a dropped interleaved "Run") visually obvious at a glance instead of
// requiring the reader to expand a collapsed array in devtools.
function movementDebugRow(value: unknown, index: number): Record<string, unknown> {
  const movement = asRecord(value);
  if (!movement) return { '#': index };
  const rxWeights = asRecord(movement.rxWeights);
  return {
    '#': index,
    name: typeof movement.name === 'string' ? movement.name : '?',
    reps: typeof movement.reps === 'number' ? movement.reps : '',
    distance: typeof movement.distance === 'number'
      ? `${movement.distance}${typeof movement.unit === 'string' ? movement.unit : 'm'}`
      : '',
    calories: typeof movement.calories === 'number' ? movement.calories : '',
    weight: rxWeights?.male ?? rxWeights?.female ?? '',
    input: typeof movement.inputType === 'string' ? movement.inputType : '',
    equip: typeof movement.equipment === 'string' ? movement.equipment : '',
  };
}

function logAiWorkoutSummary(label: string, workout: unknown): void {
  const root = asRecord(workout);
  const exercises = Array.isArray(root?.exercises) ? root.exercises : [];
  console.info(`[${label}]`, {
    title: typeof root?.title === 'string' ? root.title : undefined,
    format: typeof root?.format === 'string' ? root.format : undefined,
    exerciseCount: exercises.length,
  });
  exercises.forEach((entry, index) => {
    const exercise = asRecord(entry);
    const movements = Array.isArray(exercise?.movements) ? exercise.movements : [];
    const sections = Array.isArray(exercise?.sections) ? exercise.sections : [];
    const sectionMovements = sections.flatMap((section) => {
      const sectionRecord = asRecord(section);
      return Array.isArray(sectionRecord?.movements) ? sectionRecord.movements : [];
    });
    const source = sectionMovements.length > 0 ? sectionMovements : movements;
    console.info(
      `[${label}] exercise ${index + 1}: ${typeof exercise?.name === 'string' ? exercise.name : '?'} `
      + `· loggingMode=${typeof exercise?.loggingMode === 'string' ? exercise.loggingMode : '?'} `
      + `· suggestedSets=${typeof exercise?.suggestedSets === 'number' ? exercise.suggestedSets : '?'} `
      + `· ${source.length} movement${source.length === 1 ? '' : 's'} per round`,
    );
    console.table(source.map(movementDebugRow));
  });
}

export async function parseWorkoutImage(base64Image: string): Promise<ParsedWorkout> {
  try {
    const startedAt = performance.now();
    const segmented = await segmentWorkoutImage(base64Image);
    console.info(`[TIMING] transcribe+segment: ${Math.round(performance.now() - startedAt)}ms`);
    if (!segmented) {
      throw new Error('Could not parse workout from image');
    }
    // The board's text is the segmented parts themselves — stage 1 transcribes and splits in one
    // read, so there is no separate verbatim transcription to fall back on.
    const boardText = segmented.parts.map((part) => part.text).join('\n\n');
    return await structureSegments(boardText, segmented, 'IMAGE');
  } catch (error) {
    console.error('Error parsing workout image:', error);
    throw error;
  }
}

// ─── Stage 1: read + normalize + segment ─────────────────────────────────────
// One small prompt with one job: produce the session's CLEANED text (canonical movement names,
// expanded shorthand) split into its standalone parts. For images this same call also does the
// transcription — reading pixels pairs safely with line-grouping because neither requires
// interpretation; it was the huge STRUCTURING prompt that caused dropped lines when combined
// with OCR. Structure interpretation happens AFTERWARD, once per part — so no session-level
// reading can leak into a sibling part, and the structuring prompt never has to juggle
// multi-part bookkeeping.

export interface WorkoutPartSegment {
  label?: string;
  kind: 'strength' | 'metcon' | 'accessory';
  text: string;
}

export interface SegmentedWorkout {
  title?: string;
  parts: WorkoutPartSegment[];
}

const SEGMENT_SPEC = `Return ONLY valid JSON:
{
  "title": "session title if one is clearly written on the board, else omit",
  "parts": [
    { "label": "A", "kind": "strength" | "metcon" | "accessory", "text": "the part's lines, cleaned, newline-separated" }
  ]
}

NORMALIZATION (apply inside each part's text):
- Replace shorthand/abbreviations with canonical movement names. Fix obvious typos and OCR noise.
- PRESERVE everything else exactly: every line, every quantity (reps, weights, distances, calories, times, percentages), line order, round markers ("x 6", "(alt')", "21-15-9"), and coach notes. Never merge, reorder, summarize, or drop a line — even a short line repeating an earlier one.

${MOVEMENT_ALIASES_SECTION}

SEGMENTATION:
- A session has 1-3+ parts, usually labeled (A./B./C.) or separated by headers (STRENGTH, METCON, WOD, Cool Down). Every input line belongs to EXACTLY ONE part.
- The unit of a part is the SCORE, never the label. Before splitting on A./B./C. labels, check what governs the labeled blocks: a format/scoring header written ONCE above them ("For time:", "AMRAP 25", "Chipper") and/or a single time cap written once below covering all of them means the blocks run on ONE clock toward ONE score — they are ONE part, with the internal labels kept inside its text. The same holds for blocks joined by connectors ("Into:", "then", "A+B+C for time") and for a partner piece with one finish time. Example: "For time: / A. 10 rounds: [...] / B. 10 rounds: [...] / C. 10 rounds: [...] / 40 min T.C." is ONE metcon part.
- Labels split into separate parts only when each labeled block is SEPARATELY LETTERED (its own A./B./C.) AND scored on its own — it carries its own format/scoring line ("A. Every 1:30 x 8: ...", "B. 16 min AMRAP: ..."), its own clock or time cap, or is a different kind of training. Blocks scored independently are separate parts even when unlabeled.
- A per-block cadence/scheme line alone does NOT promote a sub-block to its own part. What binds sub-blocks into ONE part is a SHARED GOVERNING SCOPE: they sit under a single top-level label (one "A."), or under one scoring header / one time cap. Sub-bullets or lines within that scope stay ONE part even when each repeats its own cadence/scheme line — and whether or not a connector ("Into:", "then", "immediately into") joins them. The connector is a hint, not the trigger; the trigger is the shared scope. Contrast: "A. 4 sets Every 1:30: 2 Push Press / Into: / 4 sets Every 1:30: 2 Push Jerk" is ONE strength part (both bullets share the single label A.) — do NOT split it into Push Press and Push Jerk parts; whereas "A. Every 1:30 x 8: [...] / B. 16 min AMRAP: [...]" is TWO parts (two separate top-level letters, each with its own scoring).
- "kind" per part: "strength" = lifting sets/percentages work; "metcon" = the conditioning piece (for time / AMRAP / EMOM / intervals / chipper); "accessory" = warm-up, cool-down, mobility, activation, "body armor", unrelated skill practice.
- A footnote or shared note (e.g. "* Two groups, starting at different stations") belongs to the part it modifies — keep it inside that part's text.
- A date written on the board goes into the FIRST part's text (a later step reads it from there).
- Single-part boards return one part. Never invent parts that are not on the board.

If the input is not a workout, return: {"error": "Could not parse workout"}`;

const WORKOUT_SEGMENT_PROMPT = `You are a CrossFit session editor. You receive the raw transcription of a gym whiteboard and return it CLEANED and SPLIT INTO PARTS as JSON. You do NOT interpret structure (rounds, scoring, logging) — a later step does that per part.

${SEGMENT_SPEC}`;

const IMAGE_SEGMENT_PROMPT = `You are a CrossFit session editor. Read the workout whiteboard/photo and return its text TRANSCRIBED, CLEANED and SPLIT INTO PARTS as JSON. You do NOT interpret structure (rounds, scoring, logging) — a later step does that per part.

TRANSCRIPTION (do this first — fidelity is the whole job):
- Transcribe every piece of visible text exactly as written — title, date, section labels, all movements, reps, weights, and numbers — preserving line breaks and order.
- Include every line, even a short line that repeats one you already transcribed (e.g. a connector like "200m run" appearing multiple times, once before each of several movements).
- A period inside an abbreviation (S.T.O.H., D.U., T.T.B., K.B.S., A.M.R.A.P.) is NOT a line or sentence terminator — do not let it cause you to skip or merge the line that follows it. The single most commonly dropped line is a short repeating connector immediately before the LAST movement in a round — verify that exact position.
- Before answering, recount the visible lines in the image and verify every one of them appears in exactly one part.

${SEGMENT_SPEC}`;

// 'not_workout' = the model explicitly said the input isn't a workout (don't bother retrying);
// 'invalid' = malformed/empty response (a retry may succeed).
type SegmentationOutcome = SegmentedWorkout | 'not_workout' | 'invalid';

function validateSegmentedWorkout(data: unknown): SegmentationOutcome {
  const root = asRecord(data);
  if (!root) return 'invalid';
  if (typeof root.error === 'string') return 'not_workout';
  const rawParts = Array.isArray(root.parts) ? root.parts : [];
  const parts = rawParts.flatMap((entry): WorkoutPartSegment[] => {
    const part = asRecord(entry);
    if (!part || typeof part.text !== 'string' || part.text.trim().length === 0) return [];
    const kind = part.kind === 'strength' || part.kind === 'accessory' ? part.kind : 'metcon';
    return [{
      ...(typeof part.label === 'string' && part.label.trim() ? { label: part.label.trim() } : {}),
      kind,
      text: part.text.trim(),
    }];
  });
  if (parts.length === 0) return 'invalid';
  return {
    ...(typeof root.title === 'string' && root.title.trim() ? { title: root.title.trim() } : {}),
    parts,
  };
}

async function requestSegmentation(
  content: OpenAI.Chat.Completions.ChatCompletionContentPart[],
): Promise<SegmentationOutcome> {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content }],
    max_tokens: 1500,
    temperature: 0,
    response_format: { type: 'json_object' },
  });

  const raw = response.choices[0]?.message?.content || '';
  const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = (jsonMatch ? jsonMatch[1] : raw).trim();
  try {
    return validateSegmentedWorkout(JSON.parse(jsonStr));
  } catch {
    return 'invalid';
  }
}

async function segmentWorkoutText(text: string, athleteNote?: string): Promise<SegmentedWorkout | null> {
  const outcome = await requestSegmentation([
    { type: 'text', text: WORKOUT_SEGMENT_PROMPT },
    { type: 'text', text: `Here is the transcribed workout text:\n\n${text}` },
    ...(athleteNote ? [athleteContextBlock(athleteNote)] : []),
  ]);
  return typeof outcome === 'object' ? outcome : null;
}

async function segmentWorkoutImage(base64Image: string): Promise<SegmentedWorkout | null> {
  const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
    { type: 'text', text: IMAGE_SEGMENT_PROMPT },
    {
      type: 'image_url',
      image_url: { url: `data:image/jpeg;base64,${base64Image}`, detail: 'high' },
    },
  ];
  // One retry on malformed output only — recapturing the photo is expensive for the user,
  // but a "this isn't a workout" verdict is final.
  for (let attempt = 0; attempt < 2; attempt++) {
    const outcome = await requestSegmentation(content).catch((): SegmentationOutcome => 'invalid');
    if (typeof outcome === 'object') return outcome;
    if (outcome === 'not_workout') return null;
    console.warn(`[SEGMENT] image segmentation attempt ${attempt + 1} returned invalid JSON`);
  }
  return null;
}

// ─── Stage 3: structure each part independently, then merge ──────────────────
// Each part is a STANDALONE practice: it gets its own structuring call over its own text, so
// there is exactly one authoritative reading of each part and no session-level field can
// redefine a sibling. Session-level fields on the merged result describe the primary part.

function mergeSegmentedParses(
  originalText: string,
  segmented: SegmentedWorkout,
  partParses: ParsedWorkout[],
): ParsedWorkout {
  // Primary = the part the poster leads with, whose session-level fields (format, scoreType…)
  // describe the merged workout. A part can be segmented as 'metcon' yet contain only
  // isSecondary exercises (the AI marks a skill-practice EMOM secondary) — its format must not
  // become the session format over the real main metcon's.
  const isMainPart = (index: number): boolean =>
    partParses[index].exercises.some((exercise) => exercise.isSecondary !== true);
  const primaryIndex = (() => {
    const mainMetcon = segmented.parts.findIndex((part, index) => part.kind === 'metcon' && isMainPart(index));
    if (mainMetcon >= 0) return mainMetcon;
    const anyMetcon = segmented.parts.findIndex((part) => part.kind === 'metcon');
    return anyMetcon >= 0 ? anyMetcon : 0;
  })();
  const primary = partParses[primaryIndex];

  const exercises: ParsedExercise[] = partParses.flatMap((parse, index) => {
    const part = segmented.parts[index];
    return parse.exercises.map((exercise) => ({
      ...exercise,
      rawText: exercise.rawText || part.text,
      ...(part.kind === 'accessory' ? { isSecondary: true } : {}),
    }));
  });

  const firstDefined = <K extends keyof ParsedWorkout>(key: K): ParsedWorkout[K] =>
    primary[key] ?? partParses.find((parse) => parse[key] != null)?.[key] as ParsedWorkout[K];

  return {
    ...primary,
    title: segmented.title || primary.title,
    rawText: originalText,
    exercises,
    teamSize: firstDefined('teamSize'),
    // A session is a partner session when ANY part is partnered. firstDefined alone gets this
    // wrong: the primary (first metcon) part may be a solo sibling whose post-processed
    // explicit `false` would win over another part's `true` (?? only skips null/undefined).
    partnerWorkout: partParses.some((parse) => parse.partnerWorkout === true)
      ? true
      : firstDefined('partnerWorkout'),
    sourceDate: firstDefined('sourceDate'),
  };
}

/**
 * Full text→workout pipeline: segment the session into standalone parts, structure each part
 * with its own AI call (in parallel), and merge. Falls back to the single-pass parse when
 * segmentation is unavailable — never worse than the legacy behavior.
 */
export async function parseWorkoutSession(
  text: string,
  sourceLabel: 'TEXT' | 'IMAGE' = 'TEXT',
  athleteNote?: string,
): Promise<ParsedWorkout> {
  const segmented = await segmentWorkoutText(text, athleteNote).catch((error): null => {
    console.warn('[SEGMENT] segmentation failed, falling back to single-pass parse:', error);
    return null;
  });

  if (!segmented) {
    const { parsed } = await parseWorkoutText(text, sourceLabel, undefined, athleteNote);
    return withUserContext(parsed, athleteNote);
  }

  return withUserContext(await structureSegments(text, segmented, sourceLabel, athleteNote), athleteNote);
}

// Stamps the athlete's note on the parse so it persists with the workout and future
// re-parses can include the full correction history.
function withUserContext(parsed: ParsedWorkout, athleteNote?: string): ParsedWorkout {
  return athleteNote ? { ...parsed, userContext: athleteNote } : parsed;
}

async function structureSegments(
  originalText: string,
  segmented: SegmentedWorkout,
  sourceLabel: 'TEXT' | 'IMAGE',
  athleteNote?: string,
): Promise<ParsedWorkout> {
  console.info('[SEGMENT]', {
    title: segmented.title,
    parts: segmented.parts.map((part) => `${part.label ?? '?'} ${part.kind} (${part.text.split('\n').length} lines)`),
  });

  if (segmented.parts.length === 1) {
    const part = segmented.parts[0];
    const { parsed } = await parseWorkoutText(part.text, sourceLabel, part.kind, athleteNote);
    // The part was structured without the session title, so the title-aware partner
    // override runs here — once the title is back on the workout.
    return applyTitlePartnerOverride({
      ...parsed,
      rawText: originalText,
      ...(segmented.title ? { title: segmented.title } : {}),
    });
  }

  // Parallel: kind-scoped prompts (see buildParsePrompt) keep a multi-part burst inside the
  // per-minute token limit that used to force this loop sequential, and structurePart's retry
  // ladder absorbs any 429 stragglers.
  const startedAt = performance.now();
  const partParses = await Promise.all(
    segmented.parts.map((part) => structurePart(part, sourceLabel, athleteNote)),
  );
  console.info(`[TIMING] structured ${segmented.parts.length} parts in parallel: ${Math.round(performance.now() - startedAt)}ms`);
  return applyTitlePartnerOverride(mergeSegmentedParses(originalText, segmented, partParses));
}

// Structures one segmented part, retrying failures before demoting to 'free' (a parseable
// part must never end up as a bare score screen because of a transient error). The second
// delay is long on purpose: multi-part sessions fire several full-prompt calls back to back,
// and OpenAI's tokens-per-MINUTE limit doesn't clear in 2 seconds — a short retry lands in
// the same window and fails identically. An empty parse (possible stochastic refusal) gets
// one more chance; a second empty is a real refusal (e.g. a cool-down blurb) and degrades.
const STRUCTURE_RETRY_DELAYS_MS = [2_000, 20_000];

async function structurePart(part: WorkoutPartSegment, sourceLabel: 'TEXT' | 'IMAGE', athleteNote?: string): Promise<ParsedWorkout> {
  const label = part.label ?? '?';
  for (let attempt = 0; attempt <= STRUCTURE_RETRY_DELAYS_MS.length; attempt++) {
    try {
      const { parsed } = await parseWorkoutText(part.text, sourceLabel, part.kind, athleteNote);
      if (parsed.exercises.length > 0) return parsed;
      if (attempt >= 1) {
        console.warn(`[SEGMENT] part ${label} structured empty twice — keeping it as a free part`);
        return buildFreePartFallback(part);
      }
      console.warn(`[SEGMENT] part ${label} structured empty — retrying once`);
    } catch (error) {
      if (attempt >= STRUCTURE_RETRY_DELAYS_MS.length) {
        console.warn(`[SEGMENT] part ${label} failed to structure after ${attempt + 1} attempts — keeping it as a free part:`, error);
        return buildFreePartFallback(part);
      }
      console.warn(`[SEGMENT] part ${label} structure attempt ${attempt + 1} failed — retrying:`, error);
    }
    await new Promise((resolve) => setTimeout(resolve, STRUCTURE_RETRY_DELAYS_MS[Math.min(attempt, STRUCTURE_RETRY_DELAYS_MS.length - 1)]));
  }
  return buildFreePartFallback(part);
}

// Minimal ParsedWorkout wrapper for a part the structuring step could not handle: one 'free'
// exercise carrying the part's verbatim text. Never used as the session's primary metadata
// unless every other part failed too.
function buildFreePartFallback(part: WorkoutPartSegment): ParsedWorkout {
  const lines = part.text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const name = lines[0] ?? 'Workout Part';
  return {
    title: name,
    type: 'mixed',
    format: 'for_time',
    scoreType: 'time',
    exercises: [{
      name,
      type: part.kind === 'strength' ? 'strength' : 'wod',
      prescription: lines.slice(1).join(', ') || name,
      suggestedSets: 1,
      loggingMode: 'free',
      rawText: part.text,
      ...(part.kind === 'accessory' ? { isSecondary: true } : {}),
    }],
  };
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

  // Validate equipment
  const validEquipment = ['barbell', 'dumbbell', 'kettlebell', 'other', 'none'] as const;
  const equipment = validEquipment.includes(raw.equipment as typeof validEquipment[number])
    ? (raw.equipment as ParsedMovement['equipment'])
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
    repsDisplay: typeof raw.repsDisplay === 'string' && raw.repsDisplay.trim() ? raw.repsDisplay.trim() : undefined,
    distance: typeof raw.distance === 'number' ? raw.distance : undefined,
    time: typeof raw.time === 'number' ? raw.time : undefined,
    calories: typeof raw.calories === 'number' ? raw.calories : undefined,
    rxCalories,
    rxWeights: validateRxWeights(raw.rxWeights),
    unit: validateMeasurementUnit(raw.unit),
    inputType,
    equipment,
    implementCount,
    isMaxReps: raw.isMaxReps === true ? true : undefined,
    // "role": "buy_in" or "cash_out" from AI means this movement is not repeated per round
    perRound: raw.perRound === false || raw.role === 'buy_in' || raw.role === 'cash_out' ? false : undefined,
    countingMode,
    scoreEntryMode,
    stationLabel: typeof raw.stationLabel === 'string' ? raw.stationLabel : undefined,
    stationIndex: typeof raw.stationIndex === 'number' ? raw.stationIndex : undefined,
    together: raw.together === true ? true : undefined,
    relay: raw.relay === true ? true : undefined,
    alternative,
    // Preserve role so downstream code can distinguish buy-in from cash-out
    ...(raw.role === 'buy_in' || raw.role === 'cash_out' ? { role: raw.role as 'buy_in' | 'cash_out' } : {}),
  };
}

export function validateParsedWorkout(data: unknown): ParsedWorkout {
  const raw = data as Record<string, unknown>;
  const sourceDate = typeof raw.sourceDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.sourceDate)
    ? raw.sourceDate
    : undefined;

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
      if (Array.isArray(exercise.sections)) {
        const rawSections = exercise.sections as unknown[];
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
      const validLoggingModes: ExerciseLoggingMode[] = ['strength', 'for_time', 'amrap', 'amrap_intervals', 'intervals', 'emom', 'cardio', 'cardio_distance', 'bodyweight', 'sets', 'free'];
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
        stationRotation: exercise.stationRotation === true ? true : undefined,
        intervalCount: typeof exercise.intervalCount === 'number' && exercise.intervalCount > 0 ? exercise.intervalCount : undefined,
        workDuration: typeof exercise.workDuration === 'number' && exercise.workDuration > 0 ? exercise.workDuration : undefined,
        restDuration: typeof exercise.restDuration === 'number' && exercise.restDuration > 0 ? exercise.restDuration : undefined,
        ...(ladderReps && { ladderReps }),
        ...(typeof exercise.rawText === 'string' && exercise.rawText.trim() && { rawText: exercise.rawText }),
        ...(typeof exercise.isSecondary === 'boolean' && { isSecondary: exercise.isSecondary }),
        ...(typeof exercise.partnerWorkout === 'boolean' && { partnerWorkout: exercise.partnerWorkout }),
        ...((exercise.partnerSplit === 'reps' || exercise.partnerSplit === 'rounds') && { partnerSplit: exercise.partnerSplit }),
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
    sourceDate,
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
