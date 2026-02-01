import { collection, doc, getDoc, setDoc, query, where, getDocs, serverTimestamp, increment as firestoreIncrement } from 'firebase/firestore';
import { db } from './firebase';
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
// PATTERN MATCHING UTILITIES
// ============================================

function normalizeExerciseText(name: string, prescription: string): string {
  return `${name} ${prescription}`
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractKeywords(text: string): string[] {
  const normalized = text.toLowerCase();
  const keywords: string[] = [];

  // Equipment keywords
  const equipment = [
    'bike', 'echo', 'assault', 'air', 'airdyne',
    'rower', 'row', 'rowing', 'erg',
    'ski', 'skierg',
    'sled', 'prowler',
    'barbell', 'dumbbell', 'kettlebell', 'kb', 'db', 'bb',
    'wall ball', 'medicine ball', 'med ball',
  ];
  equipment.forEach(eq => {
    if (normalized.includes(eq)) keywords.push(eq.split(' ')[0]); // Use first word
  });

  // Movement keywords
  const movements = [
    'run', 'sprint', 'swim', 'walk', 'carry',
    'push', 'pull', 'press', 'squat', 'lunge',
    'clean', 'snatch', 'deadlift', 'jerk',
    'burpee', 'thruster', 'cluster',
  ];
  movements.forEach(mov => {
    if (normalized.includes(mov)) keywords.push(mov);
  });

  // Metric keywords (high priority)
  const metricKeywords: Record<string, string> = {
    'max cal': 'cal',
    'for cal': 'cal',
    'calories': 'cal',
    'cal ': 'cal',
    'meter': 'distance',
    'mile': 'distance',
    ' m ': 'distance',
    ' km': 'distance',
    'distance': 'distance',
    'for time': 'time',
    'rft': 'time',
    'amrap': 'amrap',
    'rounds': 'rounds',
  };
  Object.entries(metricKeywords).forEach(([pattern, keyword]) => {
    if (normalized.includes(pattern)) keywords.push(keyword);
  });

  return [...new Set(keywords)];
}

function generatePatternId(text: string): string {
  // Create a deterministic ID based on the normalized pattern
  return btoa(text).replace(/[^a-zA-Z0-9]/g, '').substring(0, 24);
}

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

// Cardio machines - can track calories OR distance depending on workout text
const CARDIO_MACHINE_PATTERNS = [
  'echo bike', 'ecobike', 'assault bike', 'air bike', 'airbike', 'airdyne',
  'ski erg', 'skierg', 'ski-erg',
  'rower', 'rowing', 'row erg', 'rowerg',
  'bike erg', 'bikeerg',
];

// Distance-based cardio - typically track distance
const DISTANCE_CARDIO_PATTERNS = [
  'run', 'running', 'sprint',
  'swim', 'swimming',
  'walk', 'walking', 'hike',
  'sled push', 'sled pull', 'sled drag',
  'farmer carry', 'farmers carry', 'farmer walk',
  'yoke carry', 'yoke walk',
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

export async function getLearnedLoggingPattern(
  exerciseName: string,
  prescription: string
): Promise<LearnedLoggingPattern | null> {
  try {
    const normalized = normalizeExerciseText(exerciseName, prescription);
    const keywords = extractKeywords(normalized);

    if (keywords.length === 0) return null;

    // Query for patterns with matching keywords
    const patternsRef = collection(db, 'learnedLoggingPatterns');
    const q = query(patternsRef, where('keywords', 'array-contains-any', keywords.slice(0, 10)));
    const snapshot = await getDocs(q);

    if (snapshot.empty) return null;

    // Find best matching pattern
    let bestMatch: LearnedLoggingPattern | null = null;
    let bestScore = 0;

    snapshot.docs.forEach(docSnap => {
      const pattern = docSnap.data() as LearnedLoggingPattern;
      // Score based on keyword overlap
      const patternKeywords = new Set(pattern.keywords);
      const matchCount = keywords.filter(k => patternKeywords.has(k)).length;
      const score = matchCount / Math.max(keywords.length, pattern.keywords.length);

      // Also boost score if the pattern string matches well
      const patternNormalized = pattern.exercisePattern.toLowerCase();
      if (normalized.includes(patternNormalized) || patternNormalized.includes(normalized)) {
        const boost = 0.2;
        const boostedScore = Math.min(1, score + boost);
        if (boostedScore > bestScore) {
          bestScore = boostedScore;
          bestMatch = pattern;
        }
      } else if (score > bestScore && score >= 0.5) {
        bestScore = score;
        bestMatch = pattern;
      }
    });

    return bestMatch;
  } catch (error) {
    console.warn('[LoggingPatternLearning] Failed to get learned pattern:', error);
    return null;
  }
}

export async function saveLoggingPattern(
  exerciseName: string,
  prescription: string,
  loggingMode: ExerciseLoggingMode,
  fields: LoggingPatternFields,
  source: 'rule' | 'ai' | 'user_correction',
  aiExplanation?: string,
  confidence: number = 0.8
): Promise<string> {
  try {
    const normalized = normalizeExerciseText(exerciseName, prescription);
    const keywords = extractKeywords(normalized);
    const patternId = generatePatternId(normalized);

    const patternRef = doc(db, 'learnedLoggingPatterns', patternId);
    const existing = await getDoc(patternRef);

    const now = new Date();

    if (existing.exists()) {
      const existingData = existing.data() as LearnedLoggingPattern;
      // Update existing pattern
      await setDoc(patternRef, {
        loggingMode,
        fields,
        source,
        confidence: source === 'user_correction'
          ? 0.95
          : existingData.loggingMode === loggingMode
            ? Math.min(1, existingData.confidence + 0.05)
            : confidence,
        usageCount: firestoreIncrement(1),
        lastUsed: now,
        ...(aiExplanation && { aiExplanation }),
      }, { merge: true });
    } else {
      // Create new pattern
      const newPattern: Omit<LearnedLoggingPattern, 'createdAt'> & { createdAt: ReturnType<typeof serverTimestamp> } = {
        id: patternId,
        exercisePattern: normalized,
        keywords,
        loggingMode,
        fields,
        source,
        confidence,
        usageCount: 1,
        correctCount: source === 'user_correction' ? 1 : 0,
        correctionCount: 0,
        lastUsed: now,
        createdAt: serverTimestamp() as unknown as Date,
        ...(aiExplanation && { aiExplanation }),
      };
      await setDoc(patternRef, newPattern);
    }

    console.log('[LoggingPatternLearning] Saved pattern:', normalized, loggingMode);
    return patternId;
  } catch (error) {
    console.warn('[LoggingPatternLearning] Failed to save pattern:', error);
    return '';
  }
}

export async function recordPatternUsage(
  patternId: string,
  wasAccepted: boolean
): Promise<void> {
  if (!patternId) return;

  try {
    const patternRef = doc(db, 'learnedLoggingPatterns', patternId);
    const existing = await getDoc(patternRef);

    if (!existing.exists()) return;

    const existingData = existing.data() as LearnedLoggingPattern;

    if (wasAccepted) {
      // User accepted without changes - boost confidence
      const newCorrectCount = (existingData.correctCount || 0) + 1;
      const totalUsage = newCorrectCount + (existingData.correctionCount || 0);
      const newConfidence = Math.min(1.0, newCorrectCount / totalUsage);

      await setDoc(patternRef, {
        correctCount: firestoreIncrement(1),
        confidence: newConfidence,
        lastUsed: new Date(),
      }, { merge: true });
    } else {
      // User overrode - reduce confidence (actual correction saves new pattern)
      await setDoc(patternRef, {
        correctionCount: firestoreIncrement(1),
        lastUsed: new Date(),
      }, { merge: true });

      // Recalculate confidence
      const newCorrectionCount = (existingData.correctionCount || 0) + 1;
      const totalUsage = (existingData.correctCount || 0) + newCorrectionCount;
      const newConfidence = (existingData.correctCount || 0) / totalUsage;

      await setDoc(patternRef, {
        confidence: newConfidence,
      }, { merge: true });
    }
  } catch (error) {
    console.warn('[LoggingPatternLearning] Failed to record usage:', error);
  }
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
