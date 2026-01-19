import OpenAI from 'openai';
import type { ParsedWorkout, ParsedExercise, WorkoutType, WorkoutFormat, ScoreType, ExerciseType, RxWeights, ParsedMovement } from '../types';

const openai = new OpenAI({
  apiKey: import.meta.env.VITE_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true // Required for client-side usage
});

const WORKOUT_PARSE_PROMPT = `You are an expert CrossFit workout parser. Parse this workout image into structured JSON.

## OUTPUT FORMAT
Return ONLY valid JSON:
{
  "title": "workout name if visible",
  "type": "strength" | "metcon" | "emom" | "amrap" | "for_time" | "mixed",
  "format": "for_time" | "intervals" | "amrap" | "emom" | "strength" | "tabata",
  "scoreType": "time" | "time_per_set" | "rounds_reps" | "load" | "reps",
  "sets": 5,
  "timeCap": 900,
  "intervalTime": 180,
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

## RULES
1. Keep round-based WODs as ONE exercise with movements array
2. Only split into multiple exercises for truly separate blocks (e.g., Strength + Metcon)
3. Always include "format" and "scoreType" fields
4. Parse weight notation into rxWeights object
5. Use canonical movement names

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

    if (parsed.error) {
      throw new Error(parsed.error);
    }

    // Validate and transform the response
    return validateParsedWorkout(parsed);
  } catch (error) {
    console.error('Error parsing workout image:', error);
    throw error;
  }
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
    unit: typeof raw.unit === 'string' ? raw.unit : undefined,
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

      exercises.push({
        name: String(exercise.name || 'Unknown Exercise'),
        type: validExerciseTypes.includes(exercise.type as ExerciseType)
          ? (exercise.type as ExerciseType)
          : 'wod',
        prescription: String(exercise.prescription || ''),
        suggestedSets: typeof exercise.suggestedSets === 'number' ? exercise.suggestedSets : 1,
        suggestedReps: typeof exercise.suggestedReps === 'number' ? exercise.suggestedReps : undefined,
        suggestedWeight: typeof exercise.suggestedWeight === 'number' ? exercise.suggestedWeight : undefined,
        rxWeights: validateRxWeights(exercise.rxWeights),
        movements: movements.length > 0 ? movements : undefined,
      });
    }
  }

  return {
    title: typeof raw.title === 'string' ? raw.title : undefined,
    type,
    format,
    scoreType,
    exercises,
    sets: typeof raw.sets === 'number' ? raw.sets : undefined,
    timeCap: typeof raw.timeCap === 'number' ? raw.timeCap : undefined,
    intervalTime: typeof raw.intervalTime === 'number' ? raw.intervalTime : undefined,
    restTime: typeof raw.restTime === 'number' ? raw.restTime : undefined,
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
