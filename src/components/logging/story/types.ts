import type {
  ExerciseLoggingMode,
  ExerciseSet,
  Exercise,
  ParsedExercise,
  ParsedMovement,
  MeasurementUnit,
} from '../../../types';

// ─── Exercise Kind ───────────────────────────────────────────────
// Universal classification: every exercise maps to exactly ONE kind.
// This drives which edit-sheet input component is rendered.

export type ExerciseKind =
  | 'load'             // barbell/db/kb — weight input (same / range / BW)
  | 'reps'             // bodyweight reps — sets completed toggle
  | 'duration'         // holds, planks — seconds per set or total
  | 'distance'         // runs, rows, carries — meters/km
  | 'score_time'       // "for time" metcon — mm:ss completion time
  | 'score_rounds'     // AMRAP — rounds + partial reps
  | 'intervals'        // EMOM / every X:XX — cadence + sets completed
  | 'note';            // fallback — free text

// ─── Load Capture Mode ──────────────────────────────────────────
// How the user wants to record weight for a "load" exercise.

export type LoadMode = 'same' | 'range' | 'bodyweight';

// ─── Story Exercise Result ──────────────────────────────────────
// One per exercise row in the WOD Story. This is the NEW logging
// data model — compact, universal, UI-friendly.
//
// The `toFirestoreExercise()` mapper converts this to the existing
// Exercise/ExerciseSet[] schema for persistence (no migration).

export interface StoryExerciseResult {
  kind: ExerciseKind;

  // ── Source reference (read-only after creation) ──
  exerciseIndex: number;              // index into ParsedWorkout.exercises[]
  exercise: ParsedExercise;           // the full parsed exercise for context

  // ── Common fields ──
  setsCompleted?: number;             // how many sets done (undefined = all)
  setsTotal: number;                  // prescribed sets
  notes?: string;                     // optional free text
  skipped?: boolean;                  // user explicitly skipped (no data entered)

  // ── Kind-specific values ──

  // load
  weight?: number;                    // single weight (same mode) or start weight (range mode)
  weightEnd?: number;                 // end weight (range mode only)
  loadMode?: LoadMode;                // how weight was captured
  implementCount?: 1 | 2;            // single or pair (KB/DB)

  // reps
  repsPerSet?: number;                // if all sets same
  repsTotal?: number;                 // if single-set or total

  // duration
  durationSeconds?: number;           // per-set or total hold time

  // distance
  distanceValue?: number;             // raw number
  distanceUnit?: MeasurementUnit;     // 'm' | 'km' | 'mi'

  // score_time
  timeSeconds?: number;               // completion time in seconds

  // score_rounds
  rounds?: number;                    // full rounds completed
  partialReps?: number;               // extra reps in incomplete round (legacy / derived)
  partialMovements?: string[];        // movement names completed in partial round (social-ready)

  // intervals
  intervalsCompleted?: number;        // how many intervals done
  intervalsTotal?: number;            // prescribed intervals
  intervalWeight?: number;            // weight used (if loaded interval)

  // Superset / multi-movement support
  movementResults?: MovementResult[]; // per-movement overrides for supersets
}

// Per-movement result within a superset or complex exercise
export interface MovementResult {
  movementKey: string;                // unique key (name or name::index)
  movement: ParsedMovement;           // reference to parsed movement
  kind: ExerciseKind;                 // this movement's kind (may differ from parent)
  weight?: number;
  weightEnd?: number;
  loadMode?: LoadMode;
  reps?: number;
  distance?: number;
  distanceUnit?: MeasurementUnit;
  calories?: number;
  durationSeconds?: number;
  implementCount?: 1 | 2;
}

// ─── Movement → Kind classification ─────────────────────────────
// Classifies a single ParsedMovement into an ExerciseKind.
// Mirrors the rescue logic from getMovementInputType() in AddWorkoutScreen —
// AI sometimes marks all superset movements as inputType: 'none', so we
// pattern-match the name to rescue clearly weighted movements.

const WEIGHTED_NAME_PATTERNS = [
  'carry', 'walk', 'goblet', 'kettlebell', 'kb', 'dumbbell', 'db', 'barbell', 'bb',
  'press', 'deadlift', 'clean', 'snatch', 'thruster', 'front rack', 'overhead',
  'squat', 'lunge', 'curl', 'row', 'swing',
];

const BODYWEIGHT_NAME_PATTERNS = [
  'pull-up', 'pullup', 'pull up',
  'push-up', 'pushup', 'push up',
  'burpee', 'air squat', 'airsquat',
  'sit-up', 'situp', 'sit up',
  'v-up', 'vup',
  'toes to bar', 't2b', 'ttb',
  'knees to elbow', 'k2e',
  'muscle-up', 'muscleup', 'muscle up',
  'handstand push-up', 'hspu',
  'handstand walk', 'hs walk',
  'pistol', 'box jump', 'box step',
  'double under', 'du', 'single under',
  'hollow', 'plank', 'l-sit',
  'ring dip', 'ring row',
  'strict dip', 'kipping',
  'chest to bar', 'c2b', 'ctb',
];

const CARDIO_MACHINE_PATTERNS = [
  'echo bike', 'assault bike', 'air bike', 'airbike', 'airdyne',
  'ski erg', 'skierg', 'rower', 'rowing', 'row erg', 'bike erg', 'bikeerg',
];

const DISTANCE_CARDIO_PATTERNS = [
  'run', 'running', 'sprint', 'swim', 'swimming',
  'sled push', 'sled pull', 'sled drag',
];

function classifyMovementName(name: string): 'weight' | 'bodyweight' | 'cardio_machine' | 'distance_cardio' | 'unknown' {
  const n = name.toLowerCase();
  if (CARDIO_MACHINE_PATTERNS.some(p => n.includes(p))) return 'cardio_machine';
  // Check bodyweight BEFORE weighted (e.g., "chest to bar" shouldn't match "bar")
  if (BODYWEIGHT_NAME_PATTERNS.some(p => n.includes(p))) return 'bodyweight';
  if (/\bbanded?\b|band\b|rotation|hold\b/i.test(n)) return 'bodyweight';
  if (DISTANCE_CARDIO_PATTERNS.some(p => n.includes(p))) return 'distance_cardio';
  if (WEIGHTED_NAME_PATTERNS.some(p => n.includes(p))) return 'weight';
  return 'unknown';
}

export function movementToKind(mov: ParsedMovement): ExerciseKind {
  const nameClass = classifyMovementName(mov.name);

  // Hard override: cardio machines → calories (distance-like)
  if (nameClass === 'cardio_machine') {
    if (mov.inputType === 'calories' || (mov.calories && mov.calories > 0)) return 'distance';
    return 'distance';
  }

  // AI-classified inputType takes priority
  if (mov.inputType === 'weight') return 'load';
  if (mov.inputType === 'calories') return 'distance';
  if (mov.inputType === 'distance') return 'distance';

  // Rescue: AI says 'none' but name is clearly weighted → load
  if (mov.inputType === 'none' || mov.isBodyweight) {
    if (nameClass === 'weight' && !mov.isBodyweight) return 'load';
    if (mov.time && mov.time > 0) return 'duration';
    return 'reps';
  }

  // No inputType from AI — full fallback heuristics
  if (nameClass === 'weight' && !mov.isBodyweight) return 'load';
  if (nameClass === 'distance_cardio') {
    return mov.distance ? 'reps' : 'distance';
  }
  if (mov.distance && mov.distance > 0) return 'distance';
  if (mov.time && mov.time > 0) return 'duration';
  if (mov.calories && mov.calories > 0) return 'distance';
  if (mov.rxWeights) return 'load';
  return 'reps';
}

// ─── Row State ──────────────────────────────────────────────────
// Visual state of an ExerciseRow in the story.

export type RowState = 'empty' | 'partial' | 'filled';

// ─── Mapping helpers ────────────────────────────────────────────

const LOGGING_MODE_TO_KIND: Record<ExerciseLoggingMode, ExerciseKind> = {
  strength:         'load',
  sets:             'load',
  bodyweight:       'reps',
  cardio:           'distance',     // calories → we treat as distance-like
  cardio_distance:  'distance',
  for_time:         'score_time',
  amrap:            'score_rounds',
  amrap_intervals:  'score_rounds',
  intervals:        'intervals',
  emom:             'intervals',
};

export function loggingModeToKind(mode: ExerciseLoggingMode): ExerciseKind {
  return LOGGING_MODE_TO_KIND[mode] ?? 'note';
}

// ─── Row state derivation ───────────────────────────────────────

function isMovementFilled(mr: MovementResult): boolean {
  switch (mr.kind) {
    case 'load':
      return (mr.weight != null && mr.weight > 0) || mr.loadMode === 'bodyweight';
    case 'reps':
      return true; // bodyweight reps are always "done" (prescription carries them)
    case 'duration':
      return mr.durationSeconds != null && mr.durationSeconds > 0;
    case 'distance':
      return (mr.distance != null && mr.distance > 0) || (mr.calories != null && mr.calories > 0);
    default:
      return true; // note, etc.
  }
}

export function getRowState(result: StoryExerciseResult): RowState {
  // Scored exercises (for_time, AMRAP): primary state is always the score,
  // NOT the per-movement fill state. Movements are context, not targets.
  const isScored = result.kind === 'score_time' || result.kind === 'score_rounds';

  // Superset: check movementResults (but not for scored exercises)
  if (!isScored && result.movementResults && result.movementResults.length > 0) {
    const filled = result.movementResults.filter(mr => isMovementFilled(mr)).length;
    if (filled === result.movementResults.length) return 'filled';
    if (filled > 0) return 'partial';
    return 'empty';
  }

  switch (result.kind) {
    case 'load':
      if (result.weight != null && result.weight > 0) return 'filled';
      if (result.loadMode === 'bodyweight') return 'filled';
      return 'empty';

    case 'reps':
      if (result.setsCompleted != null) return 'filled';
      return 'empty';

    case 'duration':
      if (result.durationSeconds != null && result.durationSeconds > 0) return 'filled';
      return 'empty';

    case 'distance':
      if (result.distanceValue != null && result.distanceValue > 0) return 'filled';
      return 'empty';

    case 'score_time':
      if (result.timeSeconds != null && result.timeSeconds > 0) return 'filled';
      return 'empty';

    case 'score_rounds':
      if (result.rounds != null && result.rounds > 0) return 'filled';
      if (result.partialReps != null && result.partialReps > 0) return 'partial';
      if (result.partialMovements != null && result.partialMovements.length > 0) return 'partial';
      return 'empty';

    case 'intervals':
      if (result.intervalsCompleted != null && result.intervalsCompleted > 0) {
        return result.intervalsCompleted >= (result.intervalsTotal ?? 0) ? 'filled' : 'partial';
      }
      return 'empty';

    case 'note':
      if (result.notes && result.notes.trim().length > 0) return 'filled';
      return 'empty';

    default:
      return 'empty';
  }
}

// ─── Check if result has no user-entered data ────────────────────

export function isResultEmpty(result: StoryExerciseResult): boolean {
  return getRowState(result) === 'empty';
}

// ─── Human-readable label for what's missing ─────────────────────

export function getMissingLabel(kind: ExerciseKind): string {
  switch (kind) {
    case 'load':         return 'weight';
    case 'reps':         return 'reps';
    case 'duration':     return 'time';
    case 'distance':     return 'distance';
    case 'score_time':   return 'completion time';
    case 'score_rounds': return 'rounds';
    case 'intervals':    return 'intervals completed';
    case 'note':         return 'notes';
    default:             return 'data';
  }
}

// ─── Trinity color for exercise kind ────────────────────────────

export function kindToTrinityColor(kind: ExerciseKind): string {
  switch (kind) {
    case 'load':         return 'var(--color-volume)';   // yellow
    case 'reps':         return 'var(--color-metcon)';   // magenta
    case 'duration':     return 'var(--color-sessions)'; // cyan
    case 'distance':     return 'var(--color-metcon)';   // magenta
    case 'score_time':   return 'var(--color-metcon)';   // magenta
    case 'score_rounds': return 'var(--color-metcon)';   // magenta
    case 'intervals':    return 'var(--color-sessions)'; // cyan
    case 'note':         return 'var(--color-text-secondary)';
    default:             return 'var(--color-text-secondary)';
  }
}

// ─── Firestore mapper ───────────────────────────────────────────
// Converts the new StoryExerciseResult → existing Exercise format.
// No Firestore schema changes needed.

export function toFirestoreExercise(result: StoryExerciseResult): Exercise {
  const { exercise, kind } = result;
  const sets: ExerciseSet[] = [];

  switch (kind) {
    case 'load': {
      const total = result.setsCompleted ?? result.setsTotal;
      for (let i = 0; i < total; i++) {
        let weight: number | undefined;
        if (result.loadMode === 'bodyweight') {
          weight = undefined;
        } else if (result.loadMode === 'range' && result.weight != null && result.weightEnd != null) {
          // Interpolate weight across sets
          const fraction = total > 1 ? i / (total - 1) : 0;
          weight = Math.round((result.weight + fraction * (result.weightEnd - result.weight)) * 2) / 2;
        } else {
          weight = result.weight;
        }

        sets.push({
          id: `set-${i}`,
          setNumber: i + 1,
          targetReps: exercise.suggestedReps,
          actualReps: result.repsPerSet ?? exercise.suggestedReps,
          weight,
          completed: true,
        });
      }
      break;
    }

    case 'reps': {
      const total = result.setsCompleted ?? result.setsTotal;
      for (let i = 0; i < total; i++) {
        sets.push({
          id: `set-${i}`,
          setNumber: i + 1,
          targetReps: exercise.suggestedReps,
          actualReps: result.repsPerSet ?? result.repsTotal ?? exercise.suggestedReps,
          completed: true,
        });
      }
      break;
    }

    case 'duration': {
      const total = result.setsCompleted ?? result.setsTotal;
      for (let i = 0; i < total; i++) {
        sets.push({
          id: `set-${i}`,
          setNumber: i + 1,
          time: result.durationSeconds,
          completed: true,
        });
      }
      break;
    }

    case 'distance': {
      sets.push({
        id: 'set-0',
        setNumber: 1,
        distance: result.distanceValue,
        completed: true,
      });
      break;
    }

    case 'score_time': {
      sets.push({
        id: 'set-0',
        setNumber: 1,
        time: result.timeSeconds,
        completed: true,
      });
      break;
    }

    case 'score_rounds': {
      sets.push({
        id: 'set-0',
        setNumber: 1,
        actualReps: result.partialReps ?? 0,
        completed: true,
      });
      break;
    }

    case 'intervals': {
      const total = result.intervalsCompleted ?? result.intervalsTotal ?? 0;
      for (let i = 0; i < total; i++) {
        sets.push({
          id: `set-${i}`,
          setNumber: i + 1,
          weight: result.intervalWeight,
          completed: true,
        });
      }
      break;
    }

    case 'note':
    default: {
      sets.push({
        id: 'set-0',
        setNumber: 1,
        completed: true,
      });
      break;
    }
  }

  return {
    id: `exercise-${result.exerciseIndex}`,
    name: exercise.name,
    type: exercise.type,
    prescription: exercise.prescription,
    sets,
    rxWeights: exercise.rxWeights,
    movements: exercise.movements,
    rounds: result.rounds,
  };
}

// ─── Fill minimal result (fast-path "Mark as Done") ──────────────
// Fills the minimum data to make getRowState() return 'filled'.

export function fillMinimalResult(result: StoryExerciseResult): StoryExerciseResult {
  const patched = { ...result };

  // Superset: mark all movements as filled
  if (patched.movementResults && patched.movementResults.length > 0) {
    patched.movementResults = patched.movementResults.map(mr => {
      const updated = { ...mr };
      if (updated.kind === 'load' && !updated.weight && updated.loadMode !== 'bodyweight') {
        updated.loadMode = 'bodyweight';
      }
      return updated;
    });
    return patched;
  }

  switch (patched.kind) {
    case 'load':
      if (!patched.weight && patched.loadMode !== 'bodyweight') {
        patched.loadMode = 'bodyweight';
      }
      break;
    case 'reps':
      if (patched.setsCompleted == null) {
        patched.setsCompleted = patched.setsTotal;
      }
      break;
    case 'score_time':
      if (!patched.timeSeconds) {
        patched.timeSeconds = 1;
      }
      break;
    case 'score_rounds':
      if (!patched.rounds) {
        patched.rounds = 1;
      }
      break;
    case 'intervals':
      if (!patched.intervalsCompleted) {
        patched.intervalsCompleted = patched.intervalsTotal ?? 1;
      }
      break;
    case 'duration':
      if (!patched.durationSeconds) {
        patched.durationSeconds = 1;
      }
      break;
    case 'distance':
      if (!patched.distanceValue) {
        patched.distanceValue = 1;
      }
      break;
    case 'note':
      if (!patched.notes) {
        patched.notes = 'Done';
      }
      break;
  }

  return patched;
}

// ─── Create blank result from parsed exercise ───────────────────

export function createBlankResult(
  exercise: ParsedExercise,
  index: number,
  loggingMode: ExerciseLoggingMode,
  userSex?: 'male' | 'female' | 'other' | 'prefer_not_to_say',
): StoryExerciseResult {
  const kind = loggingModeToKind(loggingMode);

  const base: StoryExerciseResult = {
    kind,
    exerciseIndex: index,
    exercise,
    setsTotal: exercise.suggestedSets || 1,
  };

  // Always initialize per-movement results when movements exist.
  // Trust the AI: each movement carries inputType, rxWeights, etc.
  // that determine what inputs the UI should render.
  if (exercise.movements && exercise.movements.length > 0) {
    const seen = new Map<string, number>();
    base.movementResults = exercise.movements.map((mov) => {
      const count = seen.get(mov.name) ?? 0;
      seen.set(mov.name, count + 1);
      const movementKey = count > 0 ? `${mov.name}::${count}` : mov.name;

      const movKind = movementToKind(mov);
      const mr: MovementResult = {
        movementKey,
        movement: mov,
        kind: movKind,
      };
      // Pre-fill from prescription, using user's sex for Rx selection
      const isFemale = userSex === 'female';
      if (movKind === 'load') {
        mr.loadMode = 'same';
        const rxW = mov.rxWeights;
        if (rxW) {
          mr.weight = isFemale ? (rxW.female ?? rxW.male) : (rxW.male ?? rxW.female);
        }
      }
      if (movKind === 'duration' && mov.time) {
        mr.durationSeconds = mov.time;
      }
      if (movKind === 'distance') {
        if (mov.inputType === 'calories' || (mov.calories != null && mov.calories > 0)) {
          // Use sex-appropriate Rx calories if available
          const rxCal = mov.rxCalories;
          if (rxCal) {
            mr.calories = isFemale ? (rxCal.female ?? rxCal.male) : (rxCal.male ?? rxCal.female);
          } else if (mov.calories) {
            mr.calories = mov.calories;
          }
        } else if (mov.distance) {
          mr.distance = mov.distance;
        }
      }
      if (mov.implementCount) {
        mr.implementCount = mov.implementCount;
      }
      return mr;
    });
  }

  // Kind-specific pre-fill (works alongside movementResults)
  switch (kind) {
    case 'load':
      base.loadMode = 'same';
      if (exercise.suggestedWeight) base.weight = exercise.suggestedWeight;
      break;

    case 'reps':
      base.repsPerSet = exercise.suggestedReps;
      break;

    case 'intervals':
      base.intervalsTotal = exercise.suggestedSets || 1;
      base.intervalsCompleted = exercise.suggestedSets || 1; // Default: all completed
      break;

    case 'score_time': {
      // For Time: prefill with time cap if available in prescription
      const rx = exercise.prescription?.toLowerCase() ?? '';
      const capMatch = rx.match(/(\d+)\s*(?:min(?:ute)?s?)\s*(?:cap|time\s*cap)/i);
      if (capMatch) {
        base.timeSeconds = parseInt(capMatch[1], 10) * 60;
      }
      break;
    }

    case 'score_rounds':
      // AMRAP: nothing to pre-fill (user enters rounds)
      break;
  }

  return base;
}
