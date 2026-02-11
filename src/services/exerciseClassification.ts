// Firebase imports reserved for future use
// import { collection, doc, getDoc, setDoc, query, where, getDocs, serverTimestamp } from 'firebase/firestore';
// import { db } from './firebase';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: import.meta.env.VITE_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true
});

// Types for exercise classification
export type ExerciseMetricType = 'weight_reps' | 'reps_only' | 'calories' | 'distance' | 'time';

export interface LearnedExercisePattern {
  id: string;
  // Pattern matching
  exercisePattern: string; // Normalized pattern (e.g., "echo bike max cal")
  keywords: string[]; // Key terms that identify this pattern

  // Classification result
  metricType: ExerciseMetricType;
  inputType: 'weighted' | 'bodyweight' | 'cardio_calories' | 'cardio_distance';

  // Learning metadata
  source: 'rule' | 'ai' | 'user_feedback';
  confidence: number; // 0-1
  usageCount: number;
  lastUsed: Date;
  createdAt: Date;

  // AI reasoning (if classified by AI)
  aiReasoning?: string;
}

// Learned patterns disabled — Firestore collection has no security rules
// and has never contained data. Returns null to fall through to rule/AI classification.
export async function getLearnedPattern(
  _exerciseName: string,
  _prescription: string
): Promise<LearnedExercisePattern | null> {
  return null;
}

// Use AI to classify an ambiguous exercise
export async function classifyExerciseWithAI(
  exerciseName: string,
  prescription: string,
  workoutContext?: string
): Promise<{
  metricType: ExerciseMetricType;
  inputType: 'weighted' | 'bodyweight' | 'cardio_calories' | 'cardio_distance';
  reasoning: string;
  confidence: number;
}> {
  const prompt = `You are a CrossFit workout analyzer. Given an exercise from a workout, determine what metric the athlete should track.

Exercise: "${exerciseName}"
Prescription: "${prescription}"
${workoutContext ? `Workout context: "${workoutContext}"` : ''}

Analyze and return a JSON object with:
1. metricType: One of "weight_reps" (track weight and reps), "reps_only" (just count reps), "calories" (track calories burned), "distance" (track distance covered), "time" (track completion time)
2. inputType: One of "weighted" (needs weight input), "bodyweight" (reps only), "cardio_calories" (calories tracking), "cardio_distance" (distance tracking)
3. reasoning: Brief explanation of why this metric is appropriate
4. confidence: Number 0-1 indicating how confident you are

Examples:
- "15 min max cal echo bike" → calories, cardio_calories (explicitly says "max cal")
- "400m run" → distance, cardio_distance (explicit distance)
- "echo bike" (no metric specified) → calories, cardio_calories (default for bike is usually calories)
- "5x5 back squat" → weight_reps, weighted (strength training)
- "3x10 pull-ups" → reps_only, bodyweight (no weight mentioned)

Return ONLY valid JSON, no explanation.`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini', // Use cheaper model for classification
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 200,
    });

    const content = response.choices[0]?.message?.content || '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');

    const result = JSON.parse(jsonMatch[0]);

    return {
      metricType: result.metricType || 'weight_reps',
      inputType: result.inputType || 'weighted',
      reasoning: result.reasoning || 'AI classification',
      confidence: result.confidence || 0.7,
    };
  } catch (error) {
    console.error('AI classification failed:', error);
    // Return safe default
    return {
      metricType: 'weight_reps',
      inputType: 'weighted',
      reasoning: 'AI classification failed, using default',
      confidence: 0.3,
    };
  }
}

// Learned pattern saving disabled — Firestore collection has no security rules
export async function saveLearnedPattern(
  _exerciseName: string,
  _prescription: string,
  _classification: {
    metricType: ExerciseMetricType;
    inputType: 'weighted' | 'bodyweight' | 'cardio_calories' | 'cardio_distance';
  },
  _source: 'rule' | 'ai' | 'user_feedback',
  _aiReasoning?: string,
  _confidence: number = 0.8
): Promise<void> {
  // No-op
}

// Main function to classify exercise with learning
export async function smartClassifyExercise(
  exerciseName: string,
  prescription: string,
  workoutContext?: string
): Promise<{
  metricType: ExerciseMetricType;
  inputType: 'weighted' | 'bodyweight' | 'cardio_calories' | 'cardio_distance';
  confidence: number;
  source: 'rule' | 'learned' | 'ai';
  reason: string;
}> {
  const text = `${exerciseName} ${prescription}`.toLowerCase();

  // 1. Check for EXPLICIT indicators (highest priority, rule-based)
  if (/max\s*cal|for\s*cal|\d+\s*cal\b|calories/i.test(text)) {
    return {
      metricType: 'calories',
      inputType: 'cardio_calories',
      confidence: 1,
      source: 'rule',
      reason: 'Explicit calorie target in text',
    };
  }

  if (/\d+\s*m\b|\d+\s*meter|\d+\s*km|\d+\s*mile|for distance/i.test(text)) {
    return {
      metricType: 'distance',
      inputType: 'cardio_distance',
      confidence: 1,
      source: 'rule',
      reason: 'Explicit distance target in text',
    };
  }

  // 2. Check for learned patterns
  const learned = await getLearnedPattern(exerciseName, prescription);
  if (learned && learned.confidence >= 0.7) {
    return {
      metricType: learned.metricType,
      inputType: learned.inputType,
      confidence: learned.confidence,
      source: 'learned',
      reason: `Learned pattern: ${learned.aiReasoning || learned.exercisePattern}`,
    };
  }

  // 3. Use AI for ambiguous cases
  const aiResult = await classifyExerciseWithAI(exerciseName, prescription, workoutContext);

  // 4. Save the AI result for future use
  await saveLearnedPattern(
    exerciseName,
    prescription,
    { metricType: aiResult.metricType, inputType: aiResult.inputType },
    'ai',
    aiResult.reasoning,
    aiResult.confidence
  );

  return {
    metricType: aiResult.metricType,
    inputType: aiResult.inputType,
    confidence: aiResult.confidence,
    source: 'ai',
    reason: aiResult.reasoning,
  };
}
