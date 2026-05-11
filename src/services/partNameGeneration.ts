import type { Exercise, WorkoutFormat } from '../types';
import type { WorkoutWithStats } from '../hooks/useWorkouts';

const FALLBACK_NAMES = [
  'ANVIL', 'FURNACE', 'HAMMER', 'PULSE', 'TORCH', 'TANK', 'SLAB', 'RIFT',
  'KILN', 'GRIND', 'FORGE', 'SPARK', 'VOLT', 'HEAT', 'DRIVE', 'BURN',
  'IRON', 'SURGE', 'ROAR', 'VAULT', 'STOKE', 'BOLT', 'QUAKE', 'STEAM',
];

export const PART_NAME_MAX_CHARS = 10;

function cleanPartName(value: string): string | null {
  const cleaned = value
    .replace(/["'`]/g, '')
    .replace(/[^a-zA-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
  if (!cleaned) return null;
  if (cleaned.length > PART_NAME_MAX_CHARS) return null;
  if (cleaned.split(' ').length > 2) return null;
  return cleaned;
}

function formatExerciseForNaming(exercise: Exercise, format?: WorkoutFormat) {
  return {
    name: exercise.name,
    type: exercise.type,
    format,
    prescription: exercise.prescription,
    rounds: exercise.rounds,
    movements: exercise.movements?.map((movement) => ({
      name: movement.name,
      reps: movement.reps,
      distance: movement.distance,
      calories: movement.calories,
      inputType: movement.inputType,
      implementCount: movement.implementCount,
      rxWeights: movement.rxWeights,
    })),
    sets: exercise.sets?.map((set) => ({
      reps: set.actualReps ?? set.targetReps,
      weight: set.weight,
      time: set.time,
      distance: set.distance,
      calories: set.calories,
    })),
  };
}

async function generateAnthropicPartName(
  exercise: Exercise,
  format: WorkoutFormat | undefined,
  avoidNames: string[],
): Promise<string | null> {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY as string | undefined;
  if (!apiKey) return null;

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 6500);
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: import.meta.env.VITE_ANTHROPIC_MODEL || 'claude-sonnet-4-5-20250929',
        max_tokens: 16,
        temperature: 0.9,
        messages: [{
          role: 'user',
          content: [
            'You name CrossFit workouts.',
            `Given the workout part data below, return a single 1-2 word name in caps. HARD LIMIT: ${PART_NAME_MAX_CHARS} characters total, including spaces.`,
            'Prefer one word, 4-8 characters. The name must fit as a big poster wordmark.',
            'The name should be evocative and punchy, like a workout nickname, not a description.',
            'Avoid literal movement names. Avoid numbered names.',
            'Good examples: ANVIL, TORCH, FURNACE, GRIND, HAMMER, PULSE, RIFT, KILN.',
            `Avoid these recently used names for this user: ${avoidNames.join(', ') || 'none'}.`,
            `Part data: ${JSON.stringify(formatExerciseForNaming(exercise, format))}`,
            `Return only the name, no explanation, no quotes. If unsure, choose a short name under ${PART_NAME_MAX_CHARS} characters.`,
          ].join('\n'),
        }],
      }),
    });

    if (!response.ok) return null;
    const data = await response.json() as { content?: Array<{ type: string; text?: string }> };
    const text = data.content?.find((item) => item.type === 'text')?.text;
    return text ? cleanPartName(text) : null;
  } catch (error) {
    console.warn('Part name generation failed, using local fallback:', error);
    return null;
  } finally {
    window.clearTimeout(timeout);
  }
}

function localPartName(exercise: Exercise, avoidNames: Set<string>, index: number): string {
  const text = `${exercise.name} ${exercise.prescription} ${exercise.movements?.map((movement) => movement.name).join(' ') || ''}`.toLowerCase();
  const preferred = [
    /\b(deadlift|squat|press|clean|snatch|jerk)\b/.test(text) ? 'ANVIL' : null,
    /\b(bike|run|row|ski|burpee|thruster)\b/.test(text) ? 'FURNACE' : null,
    /\b(amrap|emom|every|rounds?|rft|for time)\b/.test(text) ? 'GRIND' : null,
  ].filter((name): name is string => Boolean(name));

  for (const name of [...preferred, ...FALLBACK_NAMES.slice(index), ...FALLBACK_NAMES]) {
    if (!avoidNames.has(name)) return name;
  }
  return `MAY ${index + 1}`;
}

export function getRecentPartNames(workouts: WorkoutWithStats[]): string[] {
  return workouts
    .flatMap((workout) => workout.exercises || [])
    .map((exercise) => cleanPartName(exercise.partNameOverride || exercise.aiPartName || ''))
    .filter((name): name is string => Boolean(name))
    .slice(0, 10);
}

export async function addGeneratedPartNames(
  exercises: Exercise[],
  params: {
    format?: WorkoutFormat;
    recentNames?: string[];
  } = {},
): Promise<Exercise[]> {
  const used = new Set((params.recentNames || []).map((name) => name.toUpperCase()));
  const named: Exercise[] = [];

  for (let index = 0; index < exercises.length; index += 1) {
    const exercise = exercises[index];
    const generated = await generateAnthropicPartName(exercise, params.format, Array.from(used))
      || localPartName(exercise, used, index);
    used.add(generated);
    named.push({ ...exercise, aiPartName: generated });
  }

  return named;
}

export function getPartWordmarkFallback(date: Date | undefined, index: number): string {
  const d = date || new Date();
  const month = d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
  const day = d.getDate();
  const letter = String.fromCharCode(65 + index);
  return `${month} ${day} ${letter}`;
}
