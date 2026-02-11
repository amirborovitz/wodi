// Firebase imports reserved for future use
// import { collection, doc, getDoc, setDoc, addDoc, query, where, getDocs, increment as firestoreIncrement, serverTimestamp } from 'firebase/firestore';
// import { db } from './firebase';
import OpenAI from 'openai';
import type {
  ParsedExercise,
  WorkoutFormat,
  ExerciseLoggingMode,
  LoggingPatternFields,
  LearnedLoggingPattern,
  LoggingGuidanceRequest,
  LoggingGuidanceResponse,
} from '../types';

const openai = new OpenAI({
  apiKey: import.meta.env.VITE_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true
});

// ============================================
// EXPLICIT RULES (highest confidence)
// ============================================

// Patterns that ALWAYS indicate calories
const EXPLICIT_CALORIE_PATTERNS = [
  /max\s*cal/i, /for\s*cal/i, /\d+\s*cal\b/i, /calories/i,
];

// Patterns that ALWAYS indicate distance
const EXPLICIT_DISTANCE_PATTERNS = [
  /\d+\s*m\b/, /\d+\s*meter/i, /\d+\s*metre/i,
  /\d+\s*km\b/i, /\d+\s*mile/i, /\d+\s*mi\b/,
  /\d+\s*yard/i, /\d+\s*yd\b/i,
  /for distance/i, /max distance/i,
];

// Bodyweight exercises - reps only
const BODYWEIGHT_PATTERNS = [
  'pull-up', 'pullup', 'pull up',
  'push-up', 'pushup', 'push up',
  'burpee', 'burpees',
  'air squat', 'airsquat',
  'sit-up', 'situp', 'sit up',
  'v-up', 'vup', 'v up',
  'toes to bar', 't2b', 'ttb',
  'knees to elbow', 'k2e', 'kte',
  'muscle-up', 'muscleup', 'muscle up',
  'handstand push-up', 'hspu',
  'handstand walk', 'hs walk',
  'pistol', 'pistols',
  'box jump', 'box step',
  'double under', 'du', 'single under', 'su',
  'rope climb',
];

// Weighted implement patterns
const WEIGHTED_IMPLEMENT_PATTERNS = [
  'goblet', 'kettlebell', 'kb', 'dumbbell', 'db', 'barbell', 'bb',
  'press', 'deadlift', 'clean', 'snatch', 'thruster', 'front rack', 'overhead',
  'back squat', 'front squat',
];

export function getDefaultFields(mode: ExerciseLoggingMode): LoggingPatternFields {
  switch (mode) {
    case 'strength':
    case 'sets':
      return { showWeight: true, showReps: true, showTime: false, showDistance: false, showCalories: false, showRounds: false, defaultUnit: 'kg' };
    case 'cardio':
      return { showWeight: false, showReps: false, showTime: false, showDistance: false, showCalories: true, showRounds: false, defaultUnit: 'cal' };
    case 'cardio_distance':
      return { showWeight: false, showReps: false, showTime: false, showDistance: true, showCalories: false, showRounds: false, defaultUnit: 'm' };
    case 'for_time':
      return { showWeight: false, showReps: false, showTime: true, showDistance: false, showCalories: false, showRounds: false };
    case 'amrap':
      return { showWeight: false, showReps: true, showTime: false, showDistance: false, showCalories: false, showRounds: true };
    case 'amrap_intervals':
      return { showWeight: false, showReps: true, showTime: false, showDistance: false, showCalories: false, showRounds: true };
    case 'intervals':
      return { showWeight: false, showReps: false, showTime: true, showDistance: false, showCalories: false, showRounds: false };
    case 'bodyweight':
      return { showWeight: false, showReps: true, showTime: false, showDistance: false, showCalories: false, showRounds: false };
    default:
      return { showWeight: true, showReps: true, showTime: false, showDistance: false, showCalories: false, showRounds: false };
  }
}

export function applyExplicitRules(
  exercise: ParsedExercise,
  workoutFormat?: WorkoutFormat
): LoggingGuidanceResponse | null {
  const text = `${exercise.name} ${exercise.prescription}`.toLowerCase();
  const movements = exercise.movements || [];

  // 1. Check for explicit calorie patterns
  if (EXPLICIT_CALORIE_PATTERNS.some(p => p.test(text))) {
    return {
      loggingMode: 'cardio',
      fields: getDefaultFields('cardio'),
      confidence: 1.0,
      source: 'rule',
      explanation: 'Explicit calorie target in workout text',
    };
  }

  // 2. Check for explicit distance patterns
  if (EXPLICIT_DISTANCE_PATTERNS.some(p => p.test(text))) {
    return {
      loggingMode: 'cardio_distance',
      fields: getDefaultFields('cardio_distance'),
      confidence: 1.0,
      source: 'rule',
      explanation: 'Explicit distance target in workout text',
    };
  }

  // 3. Check for AMRAP patterns (THIS exercise, not workout format)
  const isAmrapPattern = text.includes('amrap');
  if (isAmrapPattern && (text.includes('x') || text.includes('rest'))) {
    return {
      loggingMode: 'amrap_intervals',
      fields: getDefaultFields('amrap_intervals'),
      confidence: 1.0,
      source: 'rule',
      explanation: 'Multiple AMRAP intervals detected',
    };
  }
  if (isAmrapPattern && movements.length >= 1) {
    return {
      loggingMode: 'amrap',
      fields: getDefaultFields('amrap'),
      confidence: 1.0,
      source: 'rule',
      explanation: 'AMRAP workout detected',
    };
  }

  // 4. Check for "for time" patterns
  const isForTimePattern =
    text.includes('for time') ||
    /\brounds?\s+for\s+time\b/i.test(text) ||
    /^\d+\s*rft\b/i.test(exercise.name) ||
    text.includes('sets for time');

  // Force for_time mode for mixed WODs (multiple movements with different types)
  const hasDistanceOrCalories = movements.some(mov => Boolean(mov.distance || mov.calories || mov.time));
  const hasReps = movements.some(mov => Boolean(mov.reps && mov.reps > 0));
  const isMixedWod = hasDistanceOrCalories && hasReps && movements.length > 1;

  if (isForTimePattern || (workoutFormat === 'for_time' && isMixedWod)) {
    return {
      loggingMode: 'for_time',
      fields: getDefaultFields('for_time'),
      confidence: 1.0,
      source: 'rule',
      explanation: 'For time workout detected',
    };
  }

  // 5. Check for interval patterns (explicit in exercise)
  if (workoutFormat === 'intervals' && /every\s+\d|sets?\s+(for\s+time|every)/i.test(text)) {
    return {
      loggingMode: 'intervals',
      fields: getDefaultFields('intervals'),
      confidence: 1.0,
      source: 'rule',
      explanation: 'Interval workout with time per set',
    };
  }

  // 6. Check for strength exercises
  if (exercise.type === 'strength' || workoutFormat === 'strength') {
    return {
      loggingMode: 'strength',
      fields: getDefaultFields('strength'),
      confidence: 1.0,
      source: 'rule',
      explanation: 'Strength exercise detected',
    };
  }

  // 7. Check for pure bodyweight (no weight indicators)
  const isBodyweight = BODYWEIGHT_PATTERNS.some(p => text.includes(p));
  const hasWeight = exercise.rxWeights || /\d+\s*(kg|lb|pound)/i.test(text) || text.includes('weighted');
  const hasWeightedImplement = WEIGHTED_IMPLEMENT_PATTERNS.some(p => text.includes(p));

  if (isBodyweight && !hasWeight && !hasWeightedImplement) {
    return {
      loggingMode: 'bodyweight',
      fields: getDefaultFields('bodyweight'),
      confidence: 0.9,
      source: 'rule',
      explanation: 'Bodyweight exercise without weight specification',
    };
  }

  // No explicit rule matched - return null to try cache/AI
  return null;
}

// ============================================
// FIREBASE CACHE OPERATIONS
// ============================================

// Learned patterns disabled — Firestore collection has no security rules
// and has never contained data. Returns null to fall through to rule/AI classification.
export async function getLearnedLoggingPattern(
  _exerciseName: string,
  _prescription: string
): Promise<LearnedLoggingPattern | null> {
  return null;
}

// Pattern saving disabled — Firestore collection has no security rules
export async function saveLoggingPattern(
  _exerciseName: string,
  _prescription: string,
  _loggingMode: ExerciseLoggingMode,
  _fields: LoggingPatternFields,
  _source: 'rule' | 'ai' | 'user_correction',
  _aiExplanation?: string,
  _confidence: number = 0.8
): Promise<string> {
  return '';
}

// Pattern usage recording disabled — Firestore collection has no security rules
export async function recordPatternUsage(
  _patternId: string,
  _wasAccepted: boolean
): Promise<void> {
  // No-op
}

// ============================================
// AI CLASSIFICATION
// ============================================

const LOGGING_GUIDANCE_PROMPT = `You are a CrossFit workout logging expert. Given an exercise, determine how it should be logged.

Exercise: "{name}"
Prescription: "{prescription}"
Workout Context: "{rawText}"

LOGGING MODES:
- strength: weight/reps per set (barbell/dumbbell/kettlebell movements)
- cardio: calories (echo bike, assault bike, rower for max cal)
- cardio_distance: distance (runs, rows for meters, swims)
- for_time: completion time (WODs with multiple movements for time)
- amrap: rounds + reps achieved (single AMRAP)
- amrap_intervals: rounds per set (multiple AMRAPs with rest)
- intervals: time per set (e.g., "5 sets every 3:00")
- bodyweight: reps only (pull-ups, push-ups, air squats without weight)
- sets: generic sets with weight/reps

DECISION LOGIC:
1. If "max cal" or "for cal" mentioned → cardio
2. If distance specified (400m, 1 mile) → cardio_distance
3. If "AMRAP" mentioned → amrap or amrap_intervals
4. If "for time" with multiple movements → for_time
5. If barbell/KB/DB movement → strength or sets
6. If pure bodyweight movement → bodyweight

Return ONLY valid JSON:
{
  "loggingMode": "cardio",
  "fields": {
    "showWeight": false,
    "showReps": false,
    "showTime": false,
    "showDistance": false,
    "showCalories": true,
    "showRounds": false,
    "defaultUnit": "cal"
  },
  "explanation": "Echo bike max effort tracks calories burned",
  "confidence": 0.85
}`;

export async function getLoggingGuidanceFromAI(
  request: LoggingGuidanceRequest
): Promise<LoggingGuidanceResponse> {
  try {
    const prompt = LOGGING_GUIDANCE_PROMPT
      .replace('{name}', request.exerciseName)
      .replace('{prescription}', request.prescription)
      .replace('{rawText}', request.workoutContext || '');

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini', // Use cheaper model for classification
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 300,
    });

    const content = response.choices[0]?.message?.content || '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in AI response');

    const result = JSON.parse(jsonMatch[0]);

    // Validate and normalize the response
    const loggingMode = validateLoggingMode(result.loggingMode);
    const fields = result.fields || getDefaultFields(loggingMode);

    return {
      loggingMode,
      fields,
      confidence: result.confidence || 0.75,
      source: 'ai',
      explanation: result.explanation || 'AI classification',
    };
  } catch (error) {
    console.error('[LoggingPatternLearning] AI classification failed:', error);
    // Return safe default
    return {
      loggingMode: 'sets',
      fields: getDefaultFields('sets'),
      confidence: 0.3,
      source: 'ai',
      explanation: 'AI classification failed, using default',
    };
  }
}

function validateLoggingMode(mode: string): ExerciseLoggingMode {
  const validModes: ExerciseLoggingMode[] = [
    'strength', 'cardio', 'cardio_distance', 'for_time',
    'amrap', 'amrap_intervals', 'intervals', 'bodyweight', 'sets'
  ];
  return validModes.includes(mode as ExerciseLoggingMode)
    ? mode as ExerciseLoggingMode
    : 'sets';
}

// ============================================
// MAIN ENTRY POINT
// ============================================

export async function getLoggingGuidance(
  exercise: ParsedExercise,
  workoutFormat?: WorkoutFormat,
  workoutContext?: string
): Promise<LoggingGuidanceResponse> {
  const exerciseName = exercise.name;
  const prescription = exercise.prescription;

  // 1. Try explicit rules first (highest confidence)
  const ruleResult = applyExplicitRules(exercise, workoutFormat);
  if (ruleResult && ruleResult.confidence >= 0.9) {
    console.log('[LoggingPatternLearning] Using rule:', ruleResult.explanation);
    return ruleResult;
  }

  // 2. Check cached patterns
  try {
    const cachedPattern = await getLearnedLoggingPattern(exerciseName, prescription);
    if (cachedPattern && cachedPattern.confidence >= 0.7) {
      console.log('[LoggingPatternLearning] Using cached pattern:', cachedPattern.exercisePattern, cachedPattern.confidence);
      return {
        loggingMode: cachedPattern.loggingMode,
        fields: cachedPattern.fields,
        confidence: cachedPattern.confidence,
        source: 'cache',
        explanation: cachedPattern.aiExplanation || `Learned pattern: ${cachedPattern.exercisePattern}`,
        patternId: cachedPattern.id,
      };
    }
  } catch (error) {
    console.warn('[LoggingPatternLearning] Cache lookup failed:', error);
  }

  // 3. If we have a medium-confidence rule, use it rather than calling AI
  if (ruleResult && ruleResult.confidence >= 0.7) {
    console.log('[LoggingPatternLearning] Using medium-confidence rule:', ruleResult.explanation);
    return ruleResult;
  }

  // 4. Fall back to AI for uncertain cases
  console.log('[LoggingPatternLearning] Calling AI for:', exerciseName);
  const aiResult = await getLoggingGuidanceFromAI({
    exerciseName,
    prescription,
    workoutContext,
    workoutFormat,
  });

  // 5. Cache the AI result for future use
  if (aiResult.confidence >= 0.6) {
    const patternId = await saveLoggingPattern(
      exerciseName,
      prescription,
      aiResult.loggingMode,
      aiResult.fields,
      'ai',
      aiResult.explanation,
      aiResult.confidence
    );
    aiResult.patternId = patternId;
  }

  return aiResult;
}

// ============================================
// USER CORRECTION HANDLING
// ============================================

export async function recordUserCorrection(
  exerciseName: string,
  prescription: string,
  originalPatternId: string | undefined,
  correctedMode: ExerciseLoggingMode,
  correctedFields: LoggingPatternFields
): Promise<void> {
  // If there was an original pattern, mark it as corrected
  if (originalPatternId) {
    await recordPatternUsage(originalPatternId, false);
  }

  // Save the user's correction as a new pattern with high confidence
  await saveLoggingPattern(
    exerciseName,
    prescription,
    correctedMode,
    correctedFields,
    'user_correction',
    'User manually selected this logging mode',
    0.95
  );

  console.log('[LoggingPatternLearning] Recorded user correction:', correctedMode);
}

