import OpenAI from 'openai';
import type { ParsedWorkout, ParsedExercise, WorkoutType, WorkoutFormat, ScoreType, ExerciseType, RxWeights, ParsedMovement, MeasurementUnit } from '../types';
import { postProcessParsedWorkout } from './workoutPostProcessor';

const openai = new OpenAI({
  apiKey: import.meta.env.VITE_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true // Required for client-side usage
});

const WORKOUT_PARSE_PROMPT = `You are an expert CrossFit coach and workout parser. You understand workout structure — buy-ins, cash-outs, chippers, EMOMs, intervals, supersets, partner WODs. Parse the workout image into structured JSON, matching the workout's logical blocks.

## OUTPUT FORMAT
Return ONLY valid JSON:
{
  "title": "workout name if visible",
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
  "exercises": [
    {
      "name": "Exercise or Block Name",
      "type": "strength" | "cardio" | "skill" | "wod",
      "prescription": "human-readable prescription",
      "suggestedSets": 5,
      "suggestedReps": 10,
      "suggestedRepsPerSet": [6, 5, 4, 3, 2],
      "rxWeights": { "male": 60, "female": 40, "unit": "kg" },
      "buyIn": [{ "name": "Run", "distance": 600, "unit": "m" }],
      "movements": [
        { "name": "Shoulder to Overhead", "reps": 10, "inputType": "weight", "rxWeights": { "male": 60, "female": 40, "unit": "kg" }, "implementCount": 1, "alternative": { "name": "Alt Name", "reps": 10 } }
      ],
      "cashOut": [{ "name": "Run", "distance": 600, "unit": "m" }]
    }
  ]
}

## FORMAT DETECTION (pick exactly one)
| Format | Trigger | scoreType |
|--------|---------|-----------|
| amrap_intervals | "2:30 AMRAP x 4", multiple AMRAPs with rest | rounds_reps |
| intervals | "5 sets for time", "every 3:00 x 5" | time_per_set |
| for_time | "for time", "RFT" (no "x sets") | time |
| amrap | "AMRAP 12" (single) | rounds_reps |
| emom | "EMOM", "every 1:00", "E2MOM" | reps |
| strength | "5x5", "3x8 @70%", "build to 1RM" | load |
| tabata | "tabata", "20s on/10s off" | reps |

## WEIGHT PARSING
- "40/60 kg" → rxWeights: { female: 40, male: 60, unit: "kg" } (higher = male)
- "@60kg" → rxWeights: { male: 60, female: 60, unit: "kg" }
- "twin kb 16kg" or "2 kb 24kg" → rxWeights: 16 (per implement), implementCount: 2

## MOVEMENT INPUT CLASSIFICATION
Every movement MUST include "inputType":
- "weight": barbell/KB/DB movements needing weight logged per set (deadlift, squat, press, clean, snatch, thruster, swing, lunge, wall ball, goblet, row with weight, shoulder to overhead, clean and jerk, etc.)
- "calories": cardio machines when scored by calories (echo bike, assault bike, row erg, ski erg — "max cal", "15 cal")
- "distance": cardio when distance is NOT prescribed and user must enter it (e.g., "run" with no distance specified)
- "none": bodyweight movements (pull-ups, push-ups, toes-to-bar, burpees, air squats, box jumps, double unders, sit-ups, muscle-ups, HSPU, rope climbs, pistols) AND movements where distance/calories are already prescribed in the rep count

## IMPLEMENT COUNT (DB/KB)
Every DB or KB movement MUST include "implementCount": 1 or 2.
- rxWeights is ALWAYS the weight of ONE implement (never pre-doubled)
- implementCount: 2 when "twin", "double", "2x", "pair" is explicit, OR the movement naturally uses two (DB Thrusters, DB Front Squats, Farmers Carry)
- implementCount: 1 for single-arm movements (DB Snatch, Alt DB Clean, KB Swing, Goblet Squat, Turkish Get-up)
- When ambiguous, default to 1

## MOVEMENT ALIASES (use canonical names)
Barbell: s2oh/stoh → Shoulder to Overhead, dl → Deadlift, bs → Back Squat, fs → Front Squat, pc → Power Clean, sqcl → Squat Clean, ps → Power Snatch, ohs → Overhead Squat, c&j → Clean and Jerk
Gymnastics: hspu → Handstand Push-up, t2b/ttb → Toes to Bar, k2e → Knees to Elbow, mu → Muscle-up, bmu/b.m.u → Bar Muscle-up, rmu → Ring Muscle-up, c2b → Chest to Bar Pull-up, hs walk → Handstand Walk
Cardio: du → Double Under, su → Single Under, cal → Calories
Equipment: kb → Kettlebell, db → Dumbbell, bb → Barbell, wb → Wall Ball

## KEY GUIDELINES
1. Only split into multiple exercises for truly separate blocks (e.g., Strength + Metcon, Skill + WOD). A single WOD = one exercise.
2. Exercise names MUST include set count/timing (e.g., "8 Rounds For Time", "5 sets every 2:30"). "AxB" = A sets of B reps.
3. Movement alternatives ("40 DU / 60 singles"): use "alternative" field, easier movement as primary. Do NOT create two separate movements.

## CONTAINER/BENCHMARK RECOGNITION
- containerRounds: outer rounds wrapping a benchmark (7 in "7 rounds of Cindy")
- benchmarkName: Cindy, DT, Fran, Grace, Isabel, Helen, Diane, Elizabeth, Jackie, Karen, Annie, Mary
- benchmarkModified: true if weight/reps differ from standard
- If definition is provided in text, use that; otherwise use standard benchmark

## VARIABLE REP SCHEMES
"[6-5-4-3-2]" or "21-15-9" → suggestedRepsPerSet array, suggestedSets = array length.

## PARTNER / TEAM WORKOUTS
- "IGUG", "I go you go", "in pairs", "with a partner" → partnerWorkout: true, teamSize: 2
- "teams of N", "group of N", "in a team of N" → partnerWorkout: true, teamSize: N
- "(6 each)" → suggestedSets: 6 (per-person count, NOT total).

## SKILL / PRACTICE BLOCKS
"Practice", "build weight", "movement focus" → type: "skill", suggestedSets: 1, NO suggestedReps, NO movements from other blocks.

## TIME CAP
"T.C." / "TC" / "time cap" → timeCap in seconds. "16 min T.C." → timeCap: 960.

## EXAMPLES

### 1. Buy-in + Rounds + Cash-out
Input: "For Time: 600m Run (buy in), 8 RFT: 8 Push Press 40/50kg, 8 TTB, 8 KB Swings 24/16kg, then 600m Run"
Output:
{
  "type": "for_time", "format": "for_time", "scoreType": "time",
  "exercises": [
    { "name": "8 Rounds For Time", "type": "wod", "prescription": "600m Run buy-in, 8 RFT: 8 Push Jerk 40/50kg, 8 TTB, 8 KB Swings 24/16kg, then 600m Run", "suggestedSets": 8,
      "buyIn": [{ "name": "Run", "distance": 600, "unit": "m", "inputType": "none" }],
      "movements": [
        { "name": "Push Jerk", "reps": 8, "inputType": "weight", "rxWeights": { "male": 50, "female": 40, "unit": "kg" } },
        { "name": "Toes to Bar", "reps": 8, "inputType": "none" },
        { "name": "Kettlebell Swing", "reps": 8, "inputType": "weight", "rxWeights": { "male": 24, "female": 16, "unit": "kg" } }
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
  "exercises": [{ "name": "AMRAP 12", "type": "wod", "prescription": "10 Thrusters 43/30kg, 15 Pull-ups", "suggestedSets": 1,
    "movements": [
      { "name": "Thruster", "reps": 10, "inputType": "weight", "rxWeights": { "male": 43, "female": 30, "unit": "kg" } },
      { "name": "Pull-up", "reps": 15, "inputType": "none" }
    ] }]
}

### 3. Strength
Input: "Back Squat 5x5 @75%"
Output:
{
  "type": "strength", "format": "strength", "scoreType": "load",
  "exercises": [{ "name": "Back Squat", "type": "strength", "prescription": "5x5 @75%", "suggestedSets": 5, "suggestedReps": 5 }]
}

### 4. Intervals
Input: "5 sets for time of 300m run + 10 shoulder to overhead 40/60 kg"
Output:
{
  "type": "metcon", "format": "intervals", "scoreType": "time_per_set", "sets": 5,
  "exercises": [{ "name": "5 Sets For Time", "type": "wod", "prescription": "300m Run + 10 Shoulder to Overhead 40/60kg", "suggestedSets": 5,
    "movements": [
      { "name": "Run", "distance": 300, "unit": "m", "inputType": "none" },
      { "name": "Shoulder to Overhead", "reps": 10, "inputType": "weight", "rxWeights": { "male": 60, "female": 40, "unit": "kg" } }
    ] }]
}

### 5. Mixed session (Strength + Superset + Metcon)
Input: "Cycle 1 - Push: Strict Press 5x3. Superset 3x12: Goblet Squat, V-ups. Metcon: 15 min max cal Ecobike"
Output:
{
  "title": "Cycle 1 - Push", "type": "mixed", "format": "strength", "scoreType": "load",
  "exercises": [
    { "name": "Strict Shoulder Press", "type": "strength", "prescription": "5x3", "suggestedSets": 5, "suggestedReps": 3 },
    { "name": "Superset: Goblet Squat + V-ups", "type": "strength", "prescription": "3x12 each movement", "suggestedSets": 3, "suggestedReps": 12,
      "movements": [{ "name": "Goblet Squat", "reps": 12, "inputType": "weight" }, { "name": "V-up", "reps": 12, "inputType": "none" }] },
    { "name": "Metcon: Max Cal Ecobike", "type": "cardio", "prescription": "15 min max calories", "suggestedSets": 1, "timeCap": 900 }
  ]
}

### 6. Partner RFT with time cap
Input: "With a partner IGUG (6 each): 10 Deadlifts 60/40kg, 40 D.U./60 Singles, 15 Box Jumps. 16 min T.C."
Output:
{
  "type": "for_time", "format": "for_time", "scoreType": "time", "partnerWorkout": true, "teamSize": 2, "sets": 6, "timeCap": 960,
  "exercises": [{ "name": "Partner RFT (6 each)", "type": "wod", "prescription": "6 rounds each: 10 DL 60/40kg, 40 DU/60 SU, 15 Box Jumps", "suggestedSets": 6,
    "movements": [
      { "name": "Deadlift", "reps": 10, "inputType": "weight", "rxWeights": { "male": 60, "female": 40, "unit": "kg" } },
      { "name": "Single Under", "reps": 60, "inputType": "none", "alternative": { "name": "Double Under", "reps": 40 } },
      { "name": "Box Jump", "reps": 15, "inputType": "none" }
    ] }]
}

### 7. Container benchmark
Input: "7 rounds of Cindy for time"
Output:
{
  "type": "for_time", "format": "for_time", "scoreType": "time", "containerRounds": 7, "benchmarkName": "Cindy", "benchmarkModified": false,
  "exercises": [{ "name": "7 Rounds of Cindy", "type": "wod", "prescription": "7 rounds: 5 Pull-ups, 10 Push-ups, 15 Air Squats", "suggestedSets": 7,
    "movements": [{ "name": "Pull-up", "reps": 5, "inputType": "none" }, { "name": "Push-up", "reps": 10, "inputType": "none" }, { "name": "Air Squat", "reps": 15, "inputType": "none" }] }]
}

### 8. Chipper
Input: "For time: 50 wall balls 9/6kg, 40 pull-ups, 30 box jumps, 20 thrusters 42.5/30kg, 10 muscle-ups"
Output:
{
  "type": "for_time", "format": "for_time", "scoreType": "time",
  "exercises": [{ "name": "Chipper For Time", "type": "wod", "prescription": "50 Wall Balls 9/6kg, 40 Pull-ups, 30 Box Jumps, 20 Thrusters 42.5/30kg, 10 Muscle-ups", "suggestedSets": 1,
    "movements": [
      { "name": "Wall Ball", "reps": 50, "inputType": "weight", "rxWeights": { "male": 9, "female": 6, "unit": "kg" } },
      { "name": "Pull-up", "reps": 40, "inputType": "none" },
      { "name": "Box Jump", "reps": 30, "inputType": "none" },
      { "name": "Thruster", "reps": 20, "inputType": "weight", "rxWeights": { "male": 42.5, "female": 30, "unit": "kg" } },
      { "name": "Muscle-up", "reps": 10, "inputType": "none" }
    ] }]
}

If image is not a workout, return: {"error": "Could not parse workout from image"}`;

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
      max_tokens: 1500,
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
          name: m.name, reps: m.reps, distance: m.distance, perRound: m.perRound,
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

  // Validate implementCount (1 or 2)
  const implementCount = (raw.implementCount === 1 || raw.implementCount === 2)
    ? raw.implementCount as 1 | 2
    : undefined;

  return {
    name: raw.name,
    reps: typeof raw.reps === 'number' ? raw.reps : undefined,
    distance: typeof raw.distance === 'number' ? raw.distance : undefined,
    time: typeof raw.time === 'number' ? raw.time : undefined,
    calories: typeof raw.calories === 'number' ? raw.calories : undefined,
    rxWeights: validateRxWeights(raw.rxWeights),
    unit: validateMeasurementUnit(raw.unit),
    inputType,
    implementCount,
    perRound: raw.perRound === false ? false : undefined,
    alternative,
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
          if (validated) coreMovements.push(validated);
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

      const name = String(exercise.name || 'Unknown Exercise');
      const prescription = String(exercise.prescription || '');
      let suggestedSets = typeof exercise.suggestedSets === 'number' ? exercise.suggestedSets : 1;
      let suggestedReps = typeof exercise.suggestedReps === 'number' ? exercise.suggestedReps : undefined;

      const setsRepsMatch = `${name} ${prescription}`.match(/(\d+)\s*[x]\s*(\d+)/i)
        || `${name} ${prescription}`.match(/(\d+)\s*sets?\s*of\s*(\d+)/i);
      if (setsRepsMatch) {
        const parsedSets = parseInt(setsRepsMatch[1], 10);
        const parsedReps = parseInt(setsRepsMatch[2], 10);
        if (!Number.isNaN(parsedSets) && !Number.isNaN(parsedReps)) {
          if (suggestedSets !== parsedSets || suggestedReps !== parsedReps) {
            suggestedSets = parsedSets;
            suggestedReps = parsedReps;
          }
        }
      }

      // Validate suggestedRepsPerSet
      let suggestedRepsPerSet: number[] | undefined = undefined;
      if (Array.isArray(exercise.suggestedRepsPerSet)) {
        const arr = exercise.suggestedRepsPerSet.filter((v: unknown) => typeof v === 'number' && v > 0) as number[];
        if (arr.length > 0) {
          suggestedRepsPerSet = arr;
          // Ensure suggestedSets matches array length
          if (suggestedSets !== arr.length) {
            suggestedSets = arr.length;
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
