import OpenAI from 'openai';
import type { ParsedWorkout, ParsedExercise, WorkoutType, WorkoutFormat, ScoreType, ExerciseType, RxWeights, ParsedMovement, MeasurementUnit } from '../types';
import { postProcessParsedWorkout } from './workoutPostProcessor';

const openai = new OpenAI({
  apiKey: import.meta.env.VITE_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true // Required for client-side usage
});

const WORKOUT_PARSE_PROMPT = `You are an expert CrossFit workout parser. Parse this workout image into structured JSON.

## OUTPUT FORMAT
Return ONLY valid JSON:
{
  "title": "workout name if visible",
  "rawText": "full workout text from the image (OCR-style, line breaks ok)",
  "type": "strength" | "metcon" | "emom" | "amrap" | "for_time" | "mixed",
  "format": "for_time" | "intervals" | "amrap" | "emom" | "strength" | "tabata",
  "scoreType": "time" | "time_per_set" | "rounds_reps" | "load" | "reps",
  "sets": 5,
  "timeCap": 900,
  "intervalTime": 180,
  "containerRounds": null,
  "benchmarkName": null,
  "benchmarkModified": false,
  "exercises": [
    {
      "name": "Exercise or Block Name",
      "type": "strength" | "cardio" | "skill" | "wod",
      "prescription": "human-readable prescription",
      "suggestedSets": 5,
      "suggestedReps": 10,
      "rxWeights": { "male": 60, "female": 40, "unit": "kg" },
      "movements": [
        { "name": "Run", "distance": 300, "unit": "m" },
        { "name": "Shoulder to Overhead", "reps": 10, "rxWeights": { "male": 60, "female": 40, "unit": "kg" } }
      ]
    }
  ]
}

## CONTAINER/BENCHMARK RECOGNITION
Detect nested workout structures like "7 rounds of Cindy" or "3 rounds of DT":
- **containerRounds**: The OUTER rounds wrapping a benchmark (e.g., 7 in "7 rounds of Cindy")
- **benchmarkName**: Name of recognized benchmark (Cindy, DT, Fran, Grace, etc.)
- **benchmarkModified**: true if benchmark has modifications (different weight, scaled reps, etc.)

### PRIORITY RULES FOR BENCHMARKS:
1. FIRST: If definition is provided in text (e.g., "Cindy = 5/10/15"), use that definition
2. SECOND: If no definition, use standard benchmark with any noted modifications

### STANDARD BENCHMARKS (use these if not defined in text):
- **Cindy**: AMRAP 20 of 5 Pull-ups, 10 Push-ups, 15 Air Squats
- **DT**: 5 rounds of 12 Deadlifts, 9 Hang Power Cleans, 6 Push Jerks @ 70/47.5kg
- **Fran**: 21-15-9 Thrusters 42.5/30kg, Pull-ups
- **Grace**: 30 Clean & Jerks @ 60/42.5kg for time
- **Isabel**: 30 Snatches @ 60/42.5kg for time
- **Helen**: 3 rounds of 400m Run, 21 KB Swings 24/16kg, 12 Pull-ups
- **Diane**: 21-15-9 Deadlifts 102/70kg, Handstand Push-ups
- **Elizabeth**: 21-15-9 Cleans 60/42.5kg, Ring Dips
- **Jackie**: 1000m Row, 50 Thrusters 20/15kg, 30 Pull-ups for time
- **Karen**: 150 Wall Balls 9/6kg for time
- **Annie**: 50-40-30-20-10 Double Unders, Sit-ups
- **Mary**: AMRAP 20 of 5 HSPUs, 10 Pistols, 15 Pull-ups

## FORMAT DETECTION (pick exactly one)
- **amrap_intervals**: "2:30 AMRAP, 1:30 rest x 4", "4 rounds of 3 min AMRAP" → Log ROUNDS PER SET (multiple AMRAPs)
- **intervals**: "5 sets for time", "every 3:00 x 5", "5 x 500m row" → Log TIME PER SET
- **for_time**: "for time", "RFT", "rounds for time" without "x sets" → Log TOTAL time
- **amrap**: "AMRAP 12", "12 min AMRAP" (single AMRAP) → Log rounds + reps
- **emom**: "EMOM", "every 1:00", "E2MOM" → Log completion per minute
- **strength**: "5x5", "3x8 @70%", "build to 1RM" → Log weight per set
- **tabata**: "tabata", "20s on/10s off" → Log reps per interval

## SCORE TYPE (based on format)
- amrap_intervals → "rounds_reps" (rounds per set)
- intervals → "time_per_set"
- for_time → "time"
- amrap → "rounds_reps"
- emom → "reps" or "pass_fail"
- strength → "load"

## WEIGHT PARSING
Parse "40/60 kg" as rxWeights: { female: 40, male: 60, unit: "kg" }
Parse "95/65 lb" as rxWeights: { male: 95, female: 65, unit: "lb" }
Parse "@60kg" or "60kg" as rxWeights: { male: 60, female: 60, unit: "kg" }
Parse "2x22.5 kg db" → note in prescription, rxWeights: { male: 22.5, female: 22.5, unit: "kg" }
IMPORTANT: "twin kb" or "double kb" means 2 kettlebells - DOUBLE the weight for rxWeights
  e.g., "twin kb 16kg" → rxWeights: { male: 32, female: 32, unit: "kg" } (16×2)
  e.g., "2 kb 24kg" → rxWeights: { male: 48, female: 48, unit: "kg" } (24×2)

## MOVEMENT ALIASES (use canonical names)
Barbell: s2oh/stoh → Shoulder to Overhead, dl → Deadlift, bs → Back Squat, fs → Front Squat, pc → Power Clean, sqcl → Squat Clean, ps → Power Snatch, ohs → Overhead Squat, c&j → Clean and Jerk
Gymnastics: hspu → Handstand Push-up, t2b → Toes to Bar, k2e → Knees to Elbow, mu → Muscle-up, c2b → Chest to Bar Pull-up, hs walk → Handstand Walk
Cardio: du → Double Under, su → Single Under, cal → Calories
Equipment: kb → Kettlebell, db → Dumbbell, bb → Barbell, wb → Wall Ball

## EXAMPLES

Input: "5 sets for time of 300m run + 10 shoulder to overhead 40/60 kg"
Output:
{
  "title": null,
  "type": "metcon",
  "format": "intervals",
  "scoreType": "time_per_set",
  "sets": 5,
  "exercises": [{
    "name": "5 Sets For Time",
    "type": "wod",
    "prescription": "300m Run + 10 Shoulder to Overhead 40/60kg",
    "suggestedSets": 5,
    "movements": [
      { "name": "Run", "distance": 300, "unit": "m" },
      { "name": "Shoulder to Overhead", "reps": 10, "rxWeights": { "male": 60, "female": 40, "unit": "kg" } }
    ]
  }]
}

Input: "AMRAP 12: 10 thrusters 43/30kg, 15 pull-ups"
Output:
{
  "type": "amrap",
  "format": "amrap",
  "scoreType": "rounds_reps",
  "timeCap": 720,
  "exercises": [{
    "name": "AMRAP 12",
    "type": "wod",
    "prescription": "10 Thrusters 43/30kg, 15 Pull-ups",
    "suggestedSets": 1,
    "movements": [
      { "name": "Thruster", "reps": 10, "rxWeights": { "male": 43, "female": 30, "unit": "kg" } },
      { "name": "Pull-up", "reps": 15 }
    ]
  }]
}

Input: "Back Squat 5x5 @75%"
Output:
{
  "type": "strength",
  "format": "strength",
  "scoreType": "load",
  "exercises": [{
    "name": "Back Squat",
    "type": "strength",
    "prescription": "5x5 @75%",
    "suggestedSets": 5,
    "suggestedReps": 5
  }]
}

Input: "Push Press 5x3"
Output:
{
  "type": "strength",
  "format": "strength",
  "scoreType": "load",
  "exercises": [{
    "name": "Push Press",
    "type": "strength",
    "prescription": "5x3",
    "suggestedSets": 5,
    "suggestedReps": 3
  }]
}

Input: "2:30 AMRAP, 1:30 rest x 4: 10 heavy russian swings, 25 single unders/50 double unders"
Output:
{
  "type": "metcon",
  "format": "amrap_intervals",
  "scoreType": "rounds_reps",
  "sets": 4,
  "intervalTime": 150,
  "restTime": 90,
  "exercises": [{
    "name": "4x 2:30 AMRAP",
    "type": "wod",
    "prescription": "10 Russian Swings (heavy), 25 SU/50 DU",
    "suggestedSets": 4,
    "movements": [
      { "name": "Russian Kettlebell Swing", "reps": 10 },
      { "name": "Single Under", "reps": 25 },
      { "name": "Double Under", "reps": 50 }
    ]
  }]
}

Input: "Long Metcon Interval: 8 sets out every 2:30 of 300m run, 5 twin KB clean 32/24"
Output:
{
  "type": "metcon",
  "format": "intervals",
  "scoreType": "time_per_set",
  "sets": 8,
  "intervalTime": 150,
  "exercises": [{
    "name": "Long Metcon - 8 sets every 2:30",
    "type": "wod",
    "prescription": "300m Run + 5 Twin KB Clean 32/24kg",
    "suggestedSets": 8,
    "movements": [
      { "name": "Run", "distance": 300, "unit": "m" },
      { "name": "Kettlebell Clean", "reps": 5, "rxWeights": { "male": 64, "female": 48, "unit": "kg" } }
    ]
  }]
}

Input: "7 rounds of Cindy for time"
Output:
{
  "type": "for_time",
  "format": "for_time",
  "scoreType": "time",
  "containerRounds": 7,
  "benchmarkName": "Cindy",
  "benchmarkModified": false,
  "exercises": [{
    "name": "7 Rounds of Cindy",
    "type": "wod",
    "prescription": "7 rounds: 5 Pull-ups, 10 Push-ups, 15 Air Squats",
    "suggestedSets": 7,
    "movements": [
      { "name": "Pull-up", "reps": 5 },
      { "name": "Push-up", "reps": 10 },
      { "name": "Air Squat", "reps": 15 }
    ]
  }]
}

Input: "DT @ 50kg"
Output:
{
  "type": "for_time",
  "format": "for_time",
  "scoreType": "time",
  "containerRounds": 5,
  "benchmarkName": "DT",
  "benchmarkModified": true,
  "exercises": [{
    "name": "DT @ 50kg",
    "type": "wod",
    "prescription": "5 rounds: 12 Deadlifts, 9 Hang Power Cleans, 6 Push Jerks @ 50kg",
    "suggestedSets": 5,
    "movements": [
      { "name": "Deadlift", "reps": 12, "rxWeights": { "male": 50, "female": 50, "unit": "kg" } },
      { "name": "Hang Power Clean", "reps": 9, "rxWeights": { "male": 50, "female": 50, "unit": "kg" } },
      { "name": "Push Jerk", "reps": 6, "rxWeights": { "male": 50, "female": 50, "unit": "kg" } }
    ]
  }]
}

Input: "Cycle 1 - Push: Strict Press 5x3. Superset 3x12: Goblet Squat, V-ups. Metcon: 15 min max cal Ecobike"
Output:
{
  "title": "Cycle 1 - Push",
  "type": "mixed",
  "format": "strength",
  "scoreType": "load",
  "exercises": [
    {
      "name": "Strict Shoulder Press",
      "type": "strength",
      "prescription": "5x3",
      "suggestedSets": 5,
      "suggestedReps": 3
    },
    {
      "name": "Superset: Goblet Squat + V-ups",
      "type": "strength",
      "prescription": "3x12 each movement",
      "suggestedSets": 3,
      "suggestedReps": 12,
      "movements": [
        { "name": "Goblet Squat", "reps": 12 },
        { "name": "V-up", "reps": 12 }
      ]
    },
    {
      "name": "Metcon: Max Cal Ecobike",
      "type": "cardio",
      "prescription": "15 min max calories, teams of 5",
      "suggestedSets": 1,
      "timeCap": 900
    }
  ]
}

## RULES
1. Keep round-based WODs as ONE exercise with movements array
2. Only split into multiple exercises for truly separate blocks (e.g., Strength + Metcon)
3. Always include "format" and "scoreType" fields
4. Parse weight notation into rxWeights object
5. Use canonical movement names
6. IMPORTANT: Exercise name MUST include set count and interval timing (e.g., "8 sets every 2:30" or "5 Sets For Time")
7. SETS x REPS PARSING: "AxB" means A sets of B reps (e.g., "5x3" = suggestedSets:5, suggestedReps:3; "3x10" = suggestedSets:3, suggestedReps:10)
8. If the workout has titled sections (e.g., "Cycle 1 - Push", "Superset x3", "Medium Metcon - Interval"), treat each as a separate exercise block.
9. Do not duplicate exercises; each block should appear once.
10. MULTI-BLOCK WORKOUTS: When a workout has multiple distinct sections (Cycle, Strength, Superset, Metcon, Finisher, etc.), create a SEPARATE exercise for EACH block. Never merge or skip blocks. Count the blocks in the input and ensure your output has the same number of exercises.
11. IMPLIED SUPERSETS: When you see "N sets: exercise1 exercise2" or "N sets of exercise1, exercise2" (multiple exercises under one set count), treat it as a superset. Name it "Superset: exercise1 + exercise2" and include both in movements array with their reps. Example: "3 sets: 10/10 powell raises 10/10 external rotation" becomes a superset with 2 movements, each with reps:10.

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
      max_tokens: 1000,
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

    console.log('[OpenAI Parse] Raw AI response:', {
      exerciseCount: parsed.exercises?.length,
      exercises: parsed.exercises?.map((e: Record<string, unknown>) => ({ name: e.name, type: e.type })),
      rawText: (parsed.rawText as string)?.substring(0, 300),
    });

    if (parsed.error) {
      throw new Error(parsed.error);
    }

    // Validate and transform the response
    const validated = validateParsedWorkout(parsed);

    // Post-process to fix common AI parsing issues
    const postProcessed = postProcessParsedWorkout(validated);

    console.log('[OpenAI Parse] Post-processed:', {
      exercises: postProcessed.exercises?.map(e => ({
        name: e.name,
        movements: e.movements?.map(m => ({
          name: m.name,
          reps: m.reps,
          time: m.time,
          distance: m.distance,
          rxWeights: m.rxWeights,
        })),
      })),
    });

    return postProcessed;
  } catch (error) {
    console.error('Error parsing workout image:', error);
    throw error;
  }
}

const WORKOUT_REFINE_PROMPT = `You are a workout parser refinement engine. You will receive:
- rawText: the OCR/visible text
- parsed: the current parsed JSON

Your job: return a corrected ParsedWorkout JSON that:
1) Preserves the original meaning and structure.
2) Splits complex, multi-block workouts into correct exercises when needed.
3) Adds containerRounds / benchmarkName when explicit.
4) Keeps movements accurate with per-round reps and weights.

CRITICAL: Count the distinct sections in the raw text (look for: Cycle, Strength, Superset, Metcon, Finisher, Interval, AMRAP, EMOM, numbered items like "1.", "2.", "3.", etc.).
The number of exercises in your output MUST match the number of distinct blocks in the input.

If rawText mentions 3 blocks but parsed only has 2 exercises, you MUST add the missing block.
If rawText has numbered items (1. Push Press, 2. Superset, 3. Metcon), each numbered item is a SEPARATE exercise.

Return ONLY valid JSON in this schema:
{
  "title": "workout name if visible",
  "rawText": "full raw text",
  "type": "strength" | "metcon" | "emom" | "amrap" | "for_time" | "mixed",
  "format": "for_time" | "intervals" | "amrap" | "emom" | "strength" | "tabata",
  "scoreType": "time" | "time_per_set" | "rounds_reps" | "load" | "reps",
  "sets": 5,
  "timeCap": 900,
  "intervalTime": 180,
  "containerRounds": null,
  "benchmarkName": null,
  "benchmarkModified": false,
  "rawText": "full raw text",
  "exercises": [
    {
      "name": "Exercise or Block Name",
      "type": "strength" | "cardio" | "skill" | "wod",
      "prescription": "human-readable prescription",
      "suggestedSets": 5,
      "suggestedReps": 10,
      "rxWeights": { "male": 60, "female": 40, "unit": "kg" },
      "movements": [
        { "name": "Run", "distance": 300, "unit": "m" },
        { "name": "Shoulder to Overhead", "reps": 10, "rxWeights": { "male": 60, "female": 40, "unit": "kg" } }
      ]
    }
  ]
}

Rules:
- Keep round-based WODs as ONE exercise with movements array unless clearly multiple blocks.
- If the text defines a benchmark (e.g., "Cindy = 5/10/15"), use that definition.
- If multiple blocks exist (e.g., "Cindy + DT + Cash-out"), split into separate exercises.
- Preserve all titled sections (Cycle, Superset, Metcon, Interval, etc.) as distinct exercises.
- Ensure sets x reps like "5x3" becomes suggestedSets=5 and suggestedReps=3.
- Never duplicate the same exercise block unless the raw text explicitly repeats it.
- If you are unsure, preserve the original parsed structure and just correct obvious errors.
- IMPLIED SUPERSETS: "N sets: exercise1 exercise2" or "N sets of exercise1, exercise2" means superset. Name it "Superset: exercise1 + exercise2" with both in movements array. Example: "3 sets: 10/10 powell raises 10/10 external rotation" = superset with 2 movements (reps:10 each), suggestedSets:3.`;

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

  return {
    name: raw.name,
    reps: typeof raw.reps === 'number' ? raw.reps : undefined,
    distance: typeof raw.distance === 'number' ? raw.distance : undefined,
    time: typeof raw.time === 'number' ? raw.time : undefined,
    calories: typeof raw.calories === 'number' ? raw.calories : undefined,
    rxWeights: validateRxWeights(raw.rxWeights),
    unit: validateMeasurementUnit(raw.unit),
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

      // Parse movements array if present
      const movements: ParsedMovement[] = [];
      if (Array.isArray(exercise.movements)) {
        for (const mov of exercise.movements) {
          const validated = validateMovement(mov);
          if (validated) movements.push(validated);
        }
      }

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

      exercises.push({
        name,
        type: validExerciseTypes.includes(exercise.type as ExerciseType)
          ? (exercise.type as ExerciseType)
          : 'wod',
        prescription,
        suggestedSets,
        suggestedReps,
        suggestedWeight: typeof exercise.suggestedWeight === 'number' ? exercise.suggestedWeight : undefined,
        rxWeights: validateRxWeights(exercise.rxWeights),
        movements: movements.length > 0 ? movements : undefined,
      });
    }
  }

  const rawText = typeof raw.rawText === 'string' ? raw.rawText : undefined;

  // Global deduplication - check all pairs, not just consecutive
  const seen = new Map<string, number>(); // key -> first index
  const dedupedExercises = exercises.filter((exercise, index) => {
    const key = `${exercise.name}|${exercise.prescription}|${exercise.suggestedSets}|${exercise.suggestedReps}`;
    if (seen.has(key)) {
      // It's a duplicate - only keep if movements differ
      const firstIndex = seen.get(key)!;
      const firstMovements = JSON.stringify(exercises[firstIndex].movements || []);
      const currentMovements = JSON.stringify(exercise.movements || []);
      return firstMovements !== currentMovements;
    }
    seen.set(key, index);
    return true;
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
          { name: "Run", distance: 300, unit: "m" },
          { name: "Shoulder to Overhead", reps: 10, rxWeights: { male: 60, female: 40, unit: 'kg' } }
        ]
      }
    ]
  };
}
