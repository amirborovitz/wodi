import { collection, doc, getDoc, setDoc, query, where, getDocs, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
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

// Normalize exercise text for pattern matching
function normalizeExerciseText(name: string, prescription: string): string {
  return `${name} ${prescription}`
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Extract keywords from exercise text
function extractKeywords(text: string): string[] {
  const normalized = text.toLowerCase();
  const keywords: string[] = [];

  // Equipment keywords
  const equipment = ['bike', 'echo', 'assault', 'rower', 'row', 'ski', 'erg', 'sled', 'barbell', 'dumbbell', 'kettlebell'];
  equipment.forEach(eq => {
    if (normalized.includes(eq)) keywords.push(eq);
  });

  // Movement keywords
  const movements = ['run', 'swim', 'walk', 'push', 'pull', 'squat', 'press', 'clean', 'snatch', 'deadlift'];
  movements.forEach(mov => {
    if (normalized.includes(mov)) keywords.push(mov);
  });

  // Metric keywords
  const metrics = ['cal', 'calories', 'meter', 'mile', 'km', 'distance', 'time', 'reps'];
  metrics.forEach(met => {
    if (normalized.includes(met)) keywords.push(met);
  });

  return [...new Set(keywords)];
}

// Check if we have a learned pattern for this exercise
export async function getLearnedPattern(
  exerciseName: string,
  prescription: string
): Promise<LearnedExercisePattern | null> {
  try {
    const normalized = normalizeExerciseText(exerciseName, prescription);
    const keywords = extractKeywords(normalized);

    if (keywords.length === 0) return null;

    // Query for patterns with matching keywords
    const patternsRef = collection(db, 'learnedExercisePatterns');
    const q = query(patternsRef, where('keywords', 'array-contains-any', keywords.slice(0, 10)));
    const snapshot = await getDocs(q);

    if (snapshot.empty) return null;

    // Find best matching pattern
    let bestMatch: LearnedExercisePattern | null = null;
    let bestScore = 0;

    snapshot.docs.forEach(docSnap => {
      const pattern = docSnap.data() as LearnedExercisePattern;
      // Score based on keyword overlap
      const patternKeywords = new Set(pattern.keywords);
      const matchCount = keywords.filter(k => patternKeywords.has(k)).length;
      const score = matchCount / Math.max(keywords.length, pattern.keywords.length);

      if (score > bestScore && score >= 0.5) {
        bestScore = score;
        bestMatch = pattern;
      }
    });

    return bestMatch;
  } catch (error) {
    console.warn('Failed to get learned pattern:', error);
    return null;
  }
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

// Save a learned pattern to Firestore
export async function saveLearnedPattern(
  exerciseName: string,
  prescription: string,
  classification: {
    metricType: ExerciseMetricType;
    inputType: 'weighted' | 'bodyweight' | 'cardio_calories' | 'cardio_distance';
  },
  source: 'rule' | 'ai' | 'user_feedback',
  aiReasoning?: string,
  confidence: number = 0.8
): Promise<void> {
  try {
    const normalized = normalizeExerciseText(exerciseName, prescription);
    const keywords = extractKeywords(normalized);

    // Create a deterministic ID based on the pattern
    const patternId = btoa(normalized).replace(/[^a-zA-Z0-9]/g, '').substring(0, 20);

    const patternRef = doc(db, 'learnedExercisePatterns', patternId);
    const existing = await getDoc(patternRef);

    const pattern: Partial<LearnedExercisePattern> = {
      exercisePattern: normalized,
      keywords,
      metricType: classification.metricType,
      inputType: classification.inputType,
      source,
      confidence,
      lastUsed: new Date(),
      ...(aiReasoning && { aiReasoning }),
    };

    if (existing.exists()) {
      // Update existing pattern
      await setDoc(patternRef, {
        ...pattern,
        usageCount: (existing.data().usageCount || 0) + 1,
        // Increase confidence if same classification
        confidence: existing.data().metricType === classification.metricType
          ? Math.min(1, (existing.data().confidence || 0.5) + 0.05)
          : confidence,
      }, { merge: true });
    } else {
      // Create new pattern
      await setDoc(patternRef, {
        ...pattern,
        id: patternId,
        usageCount: 1,
        createdAt: serverTimestamp(),
      });
    }

    console.log('[LearnedPattern] Saved pattern:', normalized, classification);
  } catch (error) {
    console.warn('Failed to save learned pattern:', error);
  }
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
