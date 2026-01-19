import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Button, Card } from '../components/ui';
import { parseWorkoutImage } from '../services/openai';
import { collection, addDoc, serverTimestamp, doc, setDoc, increment } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useAuth } from '../context/AuthContext';
import { useRewardData } from '../hooks/useRewardData';
import { RewardScreen } from './RewardScreen';
import { getWorkoutMuscleGroups, getMuscleGroupSummary } from '../services/muscleGroups';
import type { ParsedWorkout, ParsedExercise, ParsedMovement, ExerciseSet, RewardData, Exercise, RxWeights } from '../types';
import styles from './AddWorkoutScreen.module.css';

interface AddWorkoutScreenProps {
  onBack: () => void;
  onWorkoutCreated: () => void;
  initialImage?: File | null;
}

type Step = 'capture' | 'processing' | 'preview' | 'log-results' | 'saving' | 'reward';

interface ExerciseResult {
  exercise: ParsedExercise;
  sets: ExerciseSet[];
  completionTime?: number; // seconds - for "for time" workouts
  notes?: string;
}

interface SavedWorkout {
  id: string;
  title: string;
  type: ParsedWorkout['type'];
  format: ParsedWorkout['format'];
  savedAt: number;
  workout: ParsedWorkout;
}

const SAVED_WORKOUTS_KEY = 'wodboard.savedWorkouts';
const SAVED_WORKOUTS_LIMIT = 12;

// Helper to remove undefined values from objects (Firestore doesn't accept undefined)
function removeUndefined<T>(obj: T): T {
  if (Array.isArray(obj)) {
    return obj.map(removeUndefined) as T;
  }
  if (obj !== null && typeof obj === 'object') {
    // Preserve special Firebase FieldValue objects (serverTimestamp, increment, etc.)
    // and Date objects
    const proto = Object.getPrototypeOf(obj);
    if (proto !== Object.prototype && proto !== null) {
      return obj; // Return special objects unchanged
    }
    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        cleaned[key] = removeUndefined(value);
      }
    }
    return cleaned as T;
  }
  return obj;
}

function readSavedWorkouts(): SavedWorkout[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(SAVED_WORKOUTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter((entry) => (
      entry &&
      typeof entry.id === 'string' &&
      typeof entry.title === 'string' &&
      typeof entry.type === 'string' &&
      typeof entry.format === 'string' &&
      typeof entry.savedAt === 'number' &&
      entry.workout &&
      Array.isArray(entry.workout.exercises)
    ));
  } catch (error) {
    console.warn('Failed to read saved workouts from localStorage', error);
    return [];
  }
}

// Movement alternatives with distance conversions
// Conversions: 100m run = 125m row = 300m bike
interface MovementAlternative {
  name: string;
  distanceMultiplier?: number; // multiply original distance by this
}

const MOVEMENT_ALTERNATIVES: Record<string, MovementAlternative[]> = {
  'run': [
    { name: 'Row', distanceMultiplier: 1.25 },           // 100m run = 125m row
    { name: 'Echo Bike', distanceMultiplier: 3 },        // 100m run = 300m bike
    { name: 'Ski Erg', distanceMultiplier: 1.25 },       // similar to row
    { name: 'AirRunner', distanceMultiplier: 1 },
    { name: 'Treadmill', distanceMultiplier: 1 },
  ],
  'running': [
    { name: 'Row', distanceMultiplier: 1.25 },
    { name: 'Echo Bike', distanceMultiplier: 3 },
    { name: 'Ski Erg', distanceMultiplier: 1.25 },
  ],
  'row': [
    { name: 'Run', distanceMultiplier: 0.8 },            // 125m row = 100m run
    { name: 'Echo Bike', distanceMultiplier: 2.4 },      // 125m row = 300m bike
    { name: 'Ski Erg', distanceMultiplier: 1 },
  ],
  'rowing': [
    { name: 'Run', distanceMultiplier: 0.8 },
    { name: 'Echo Bike', distanceMultiplier: 2.4 },
  ],
  'bike': [
    { name: 'Run', distanceMultiplier: 0.33 },           // 300m bike = 100m run
    { name: 'Row', distanceMultiplier: 0.42 },           // 300m bike = 125m row
    { name: 'Ski Erg', distanceMultiplier: 0.42 },
  ],
  'echo bike': [
    { name: 'Row', distanceMultiplier: 0.42 },
    { name: 'Run', distanceMultiplier: 0.33 },
    { name: 'Ski Erg', distanceMultiplier: 0.42 },
  ],
  'ski erg': [
    { name: 'Row', distanceMultiplier: 1 },
    { name: 'Echo Bike', distanceMultiplier: 2.4 },
    { name: 'Run', distanceMultiplier: 0.8 },
  ],
};

// Check if a movement has alternatives
function getMovementAlternatives(movementName: string): MovementAlternative[] {
  const normalized = movementName.toLowerCase().trim();
  for (const [key, alternatives] of Object.entries(MOVEMENT_ALTERNATIVES)) {
    if (normalized.includes(key)) {
      return alternatives;
    }
  }
  return [];
}

function isAerobicMovement(movement: ParsedMovement): boolean {
  return Boolean(movement.distance || movement.calories || movement.time);
}

function getWeightTarget(exercise?: ParsedExercise): { name: string; rxWeights?: RxWeights } | null {
  if (!exercise) return null;

  if (exercise.rxWeights) {
    return { name: exercise.name, rxWeights: exercise.rxWeights };
  }

  const movementWithRx = exercise.movements?.find(m => m.rxWeights);
  if (movementWithRx) {
    return { name: movementWithRx.name, rxWeights: movementWithRx.rxWeights };
  }

  const gorillaRow = exercise.movements?.find(m => /gorilla row/i.test(m.name));
  if (gorillaRow) {
    return { name: gorillaRow.name };
  }

  return null;
}

// Determine the logging mode for each exercise
type ExerciseLoggingMode = 'strength' | 'intervals' | 'amrap_intervals' | 'for_time' | 'sets';

function getExerciseLoggingMode(exercise: ParsedExercise, workoutFormat?: string): ExerciseLoggingMode {
  const name = exercise.name.toLowerCase();
  const prescription = exercise.prescription.toLowerCase();

  // Strength exercises always use weight/reps per set
  if (exercise.type === 'strength') {
    return 'strength';
  }

  // Check for AMRAP interval patterns (must check before for_time)
  if (workoutFormat === 'amrap_intervals' ||
      (name.includes('amrap') && (name.includes('x') || name.includes('rest')))) {
    return 'amrap_intervals';
  }

  // "X sets for time" = do all sets continuously, record ONE total time
  // This is for_time mode, NOT intervals (which would record time per set)
  if (name.includes('sets for time') ||
      prescription.includes('sets for time') ||
      /^\d+\s*sets?\s*(for time|ft)/i.test(name) ||
      /^\d+\s*sets?\s*(for time|ft)/i.test(prescription) ||
      workoutFormat === 'for_time') {
    return 'for_time';
  }

  // Check for other for-time patterns
  const isForTime = name.includes('for time') ||
    name.includes('round') ||
    prescription.includes('for time') ||
    /^\d+\s*(round|rft)/i.test(name);

  if (isForTime) {
    return 'for_time';
  }

  // Intervals format = record time per set (rare, explicit only)
  if (workoutFormat === 'intervals') {
    return 'intervals';
  }

  if (workoutFormat === 'strength') {
    return 'strength';
  }

  // Default to sets (weight/reps per set)
  return 'sets';
}

// Legacy helper for backwards compatibility
function isForTimeWorkout(exercise: ParsedExercise, _workoutType: string, workoutFormat?: string): boolean {
  const mode = getExerciseLoggingMode(exercise, workoutFormat);
  return mode === 'for_time';
}

export function AddWorkoutScreen({ onBack, onWorkoutCreated, initialImage }: AddWorkoutScreenProps) {
  const { user } = useAuth();
  const { calculateRewardData } = useRewardData();
  const [step, setStep] = useState<Step>('capture');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [parsedWorkout, setParsedWorkout] = useState<ParsedWorkout | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Wizard state
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
  const [exerciseResults, setExerciseResults] = useState<ExerciseResult[]>([]);
  const [currentSets, setCurrentSets] = useState<ExerciseSet[]>([]);
  const [completionMinutes, setCompletionMinutes] = useState<string>('');
  const [completionSeconds, setCompletionSeconds] = useState<string>('');

  // Interval workout state (for "intervals" format with time_per_set scoring)
  const [currentIntervalSet, setCurrentIntervalSet] = useState(1);
  const [intervalSplitTimes, setIntervalSplitTimes] = useState<number[]>([]); // seconds per set

  // AMRAP interval state (for "amrap_intervals" format)
  const [intervalRounds, setIntervalRounds] = useState<number[]>([]); // rounds per set
  const [currentRounds, setCurrentRounds] = useState<string>(''); // current set rounds input
  const [workoutWeight, setWorkoutWeight] = useState<string>(''); // weight used (e.g., KB weight)

  // Movement alternatives state (maps original movement to selected alternative)
  const [selectedAlternatives, setSelectedAlternatives] = useState<Record<string, string>>({});
  // Custom distances for alternatives (maps movement name to user-edited distance)
  const [customDistances, setCustomDistances] = useState<Record<string, number>>({});

  // Reward screen state
  const [rewardData, setRewardData] = useState<RewardData | null>(null);
  const [savedWorkouts, setSavedWorkouts] = useState<SavedWorkout[]>([]);

  useEffect(() => {
    setSavedWorkouts(readSavedWorkouts());
  }, []);

  // Process initial image if provided (from HomeScreen file picker)
  useEffect(() => {
    if (!initialImage) return;

    const processInitialImage = async () => {
      const url = URL.createObjectURL(initialImage);
      setImageUrl(url);
      setStep('processing');
      setError(null);

      try {
        const base64 = await fileToBase64(initialImage);
        const workout = await parseWorkoutImage(base64);
        setParsedWorkout(workout);
        addSavedWorkout(workout);
        setStep('preview');
      } catch (err) {
        console.error('Error parsing workout:', err);
        setError('Failed to parse workout. Please try again or enter manually.');
        setStep('capture');
      }
    };

    processInitialImage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialImage]);

  const persistSavedWorkouts = (next: SavedWorkout[]) => {
    setSavedWorkouts(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(SAVED_WORKOUTS_KEY, JSON.stringify(next));
    }
  };

  const addSavedWorkout = (workout: ParsedWorkout) => {
    const newEntry: SavedWorkout = {
      id: typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: workout.title?.trim() || "Untitled WOD",
      type: workout.type,
      format: workout.format,
      savedAt: Date.now(),
      workout,
    };

    setSavedWorkouts((prev) => {
      const next = [
        newEntry,
        ...prev.filter((entry) => (
          entry.title !== newEntry.title ||
          entry.type !== newEntry.type ||
          entry.format !== newEntry.format
        ))
      ].slice(0, SAVED_WORKOUTS_LIMIT);

      if (typeof window !== 'undefined') {
        window.localStorage.setItem(SAVED_WORKOUTS_KEY, JSON.stringify(next));
      }

      return next;
    });
  };

  const handleSelectSavedWorkout = (saved: SavedWorkout) => {
    setParsedWorkout(saved.workout);
    setImageUrl(null);
    setError(null);
    setStep('preview');
  };

  const handleRemoveSavedWorkout = (id: string) => {
    const next = savedWorkouts.filter((entry) => entry.id !== id);
    persistSavedWorkouts(next);
  };

  const handleClearSavedWorkouts = () => {
    persistSavedWorkouts([]);
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Reset input value so selecting the same file again triggers onChange
    event.target.value = '';

    // Create preview URL
    const url = URL.createObjectURL(file);
    setImageUrl(url);
    setStep('processing');
    setError(null);

    try {
      // Convert to base64 for API
      const base64 = await fileToBase64(file);
      const workout = await parseWorkoutImage(base64);
      setParsedWorkout(workout);
      addSavedWorkout(workout);
      setStep('preview');
    } catch (err) {
      console.error('Error parsing workout:', err);
      setError('Failed to parse workout. Please try again or enter manually.');
      setStep('capture');
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Remove data:image/...;base64, prefix
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleConfirmWorkout = () => {
    if (!parsedWorkout) return;

    // Debug: log the parsed workout to understand what format was detected
    console.log('Parsed workout:', {
      type: parsedWorkout.type,
      format: parsedWorkout.format,
      scoreType: parsedWorkout.scoreType,
      exercises: parsedWorkout.exercises.map(e => ({
        name: e.name,
        type: e.type,
        mode: getExerciseLoggingMode(e, parsedWorkout.format),
        rxWeights: e.rxWeights
      }))
    });

    // Initialize wizard - start with first exercise
    setCurrentExerciseIndex(0);
    setExerciseResults([]);

    // Reset interval state
    setCurrentIntervalSet(1);
    setIntervalSplitTimes([]);
    setIntervalRounds([]);
    setCurrentRounds('');
    setWorkoutWeight('');
    setCompletionMinutes('');
    setCompletionSeconds('');
    setSelectedAlternatives({});
    setCustomDistances({});

    // Create initial sets for first exercise
    const firstExercise = parsedWorkout.exercises[0];
    initializeSetsForExercise(firstExercise);

    setStep('log-results');
  };

  // Get the current exercise and its logging mode
  const currentExercise = parsedWorkout?.exercises[currentExerciseIndex];
  const currentExerciseMode = currentExercise
    ? getExerciseLoggingMode(currentExercise, parsedWorkout?.format)
    : 'sets';

  // Per-exercise checks based on logging mode
  const isCurrentExerciseInterval = currentExerciseMode === 'intervals';
  const isCurrentExerciseAmrapInterval = currentExerciseMode === 'amrap_intervals';
  const isCurrentExerciseForTime = currentExerciseMode === 'for_time';
  const isCurrentExerciseStrength = currentExerciseMode === 'strength' || currentExerciseMode === 'sets';

  // Get total sets for interval exercises
  const totalIntervalSets = currentExercise?.suggestedSets || parsedWorkout?.sets || 1;

  const weightTarget = currentExercise ? getWeightTarget(currentExercise) : null;
  const weightLabel = weightTarget?.name ? `${weightTarget.name} Weight` : 'Weight Used';

  // Get movements with available alternatives
  const movementsWithAlternatives = currentExercise?.movements?.map(m => ({
    ...m,
    alternatives: getMovementAlternatives(m.name),
  })).filter(m => m.alternatives.length > 0 && isAerobicMovement(m)) || [];

  // Handle selecting an alternative for a movement
  const handleSelectAlternative = (originalMovement: string, alternative: string, originalDistance?: number) => {
    if (!alternative || alternative === originalMovement) {
      // Clearing the alternative
      setSelectedAlternatives(prev => {
        const next = { ...prev };
        delete next[originalMovement];
        return next;
      });
      setCustomDistances(prev => {
        const next = { ...prev };
        delete next[originalMovement];
        return next;
      });
    } else {
      // Setting an alternative - calculate default distance
      const altInfo = getMovementAlternatives(originalMovement).find(a => a.name === alternative);
      const defaultDistance = altInfo?.distanceMultiplier && originalDistance
        ? Math.round(originalDistance * altInfo.distanceMultiplier)
        : originalDistance || 0;

      setSelectedAlternatives(prev => ({
        ...prev,
        [originalMovement]: alternative,
      }));
      setCustomDistances(prev => ({
        ...prev,
        [originalMovement]: defaultDistance,
      }));
    }
  };

  // Handle changing the custom distance for an alternative
  const handleCustomDistanceChange = (movementName: string, distance: number) => {
    setCustomDistances(prev => ({
      ...prev,
      [movementName]: distance,
    }));
  };

  // Handle recording a single interval split time
  const handleRecordIntervalSplit = () => {
    const mins = parseInt(completionMinutes) || 0;
    const secs = parseInt(completionSeconds) || 0;
    const splitTime = mins * 60 + secs;

    if (splitTime > 0) {
      const newSplits = [...intervalSplitTimes, splitTime];
      setIntervalSplitTimes(newSplits);

      // Check if this was the last set for this exercise
      if (currentIntervalSet >= totalIntervalSets) {
        // Save this exercise's results and move to next exercise (or save workout)
        finishIntervalExercise(newSplits);
      } else {
        // Move to next set
        setCurrentIntervalSet(prev => prev + 1);
        setCompletionMinutes('');
        setCompletionSeconds('');
      }
    }
  };

  // Finish interval exercise and move to next or save
  const finishIntervalExercise = (splitTimes: number[]) => {
    if (!parsedWorkout || !currentExercise) return;

    const weight = parseFloat(workoutWeight) || undefined;

    // Build sets array with split times
    const sets: ExerciseSet[] = splitTimes.map((time, i) => ({
      id: `set-${i}`,
      setNumber: i + 1,
      time,
      weight,
      completed: true,
    }));

    // Save exercise result
    const result: ExerciseResult = {
      exercise: currentExercise,
      sets,
      completionTime: splitTimes.reduce((sum, t) => sum + t, 0),
    };

    const newResults = [...exerciseResults, result];
    setExerciseResults(newResults);

    // Check if this was the last exercise
    if (currentExerciseIndex >= parsedWorkout.exercises.length - 1) {
      // All exercises done, save the entire workout
      saveWorkout(newResults);
    } else {
      // Move to next exercise
      const nextIndex = currentExerciseIndex + 1;
      setCurrentExerciseIndex(nextIndex);
      const nextExercise = parsedWorkout.exercises[nextIndex];
      initializeSetsForExercise(nextExercise);

      // Reset interval state for next exercise
      setCurrentIntervalSet(1);
      setIntervalSplitTimes([]);
      setWorkoutWeight('');
      setCompletionMinutes('');
      setCompletionSeconds('');
    }
  };

  // Handle recording rounds for AMRAP interval workout
  const handleRecordAmrapRounds = () => {
    const rounds = parseFloat(currentRounds) || 0;

    if (rounds > 0) {
      const newRounds = [...intervalRounds, rounds];
      setIntervalRounds(newRounds);

      // Check if this was the last set for this exercise
      if (currentIntervalSet >= totalIntervalSets) {
        // Save this exercise's results and move to next exercise (or save workout)
        finishAmrapIntervalExercise(newRounds);
      } else {
        // Move to next set
        setCurrentIntervalSet(prev => prev + 1);
        setCurrentRounds('');
      }
    }
  };

  // Finish AMRAP interval exercise and move to next or save
  const finishAmrapIntervalExercise = (rounds: number[]) => {
    if (!parsedWorkout || !currentExercise) return;

    const weight = parseFloat(workoutWeight) || undefined;

    // Build sets array with rounds
    const sets: ExerciseSet[] = rounds.map((roundCount, i) => ({
      id: `set-${i}`,
      setNumber: i + 1,
      actualReps: roundCount, // Using actualReps to store rounds
      weight,
      completed: true,
    }));

    // Save exercise result
    const result: ExerciseResult = {
      exercise: currentExercise,
      sets,
    };

    const newResults = [...exerciseResults, result];
    setExerciseResults(newResults);

    // Check if this was the last exercise
    if (currentExerciseIndex >= parsedWorkout.exercises.length - 1) {
      // All exercises done, save the entire workout
      saveWorkout(newResults);
    } else {
      // Move to next exercise
      const nextIndex = currentExerciseIndex + 1;
      setCurrentExerciseIndex(nextIndex);
      const nextExercise = parsedWorkout.exercises[nextIndex];
      initializeSetsForExercise(nextExercise);

      // Reset interval state for next exercise
      setCurrentIntervalSet(1);
      setIntervalRounds([]);
      setCurrentRounds('');
      setWorkoutWeight('');
    }
  };

  const initializeSetsForExercise = (exercise: ParsedExercise) => {
    const numSets = exercise.suggestedSets || 1;
    const sets: ExerciseSet[] = Array.from({ length: numSets }, (_, i) => ({
      id: `set-${i}`,
      setNumber: i + 1,
      targetReps: exercise.suggestedReps,
      actualReps: undefined,
      weight: exercise.suggestedWeight,
      completed: false,
    }));
    setCurrentSets(sets);
  };

  const updateSet = (setIndex: number, field: keyof ExerciseSet, value: number | undefined) => {
    setCurrentSets(prev => prev.map((set, i) =>
      i === setIndex ? { ...set, [field]: value, completed: true } : set
    ));
  };

  const handleNextExercise = () => {
    if (!parsedWorkout) return;

    const currentExercise = parsedWorkout.exercises[currentExerciseIndex];
    const isForTime = isForTimeWorkout(currentExercise, parsedWorkout.type, parsedWorkout.format);

    // Calculate completion time in seconds
    let completionTime: number | undefined;
    if (isForTime && (completionMinutes || completionSeconds)) {
      const mins = parseInt(completionMinutes) || 0;
      const secs = parseInt(completionSeconds) || 0;
      completionTime = mins * 60 + secs;
    }

    // Save current exercise results
    const result: ExerciseResult = {
      exercise: currentExercise,
      sets: currentSets,
      completionTime,
    };

    const newResults = [...exerciseResults, result];
    setExerciseResults(newResults);

    // Check if this was the last exercise
    if (currentExerciseIndex >= parsedWorkout.exercises.length - 1) {
      // Save workout
      saveWorkout(newResults);
    } else {
      // Move to next exercise
      const nextIndex = currentExerciseIndex + 1;
      setCurrentExerciseIndex(nextIndex);
      initializeSetsForExercise(parsedWorkout.exercises[nextIndex]);
      // Reset time fields for next exercise
      setCompletionMinutes('');
      setCompletionSeconds('');
    }
  };

  const handlePreviousExercise = () => {
    if (!parsedWorkout || currentExerciseIndex === 0) return;

    // Go back to previous exercise
    const prevIndex = currentExerciseIndex - 1;
    setCurrentExerciseIndex(prevIndex);

    // Restore previous exercise's sets if we have results
    if (exerciseResults[prevIndex]) {
      setCurrentSets(exerciseResults[prevIndex].sets);
      // Restore time if it was a for-time workout
      if (exerciseResults[prevIndex].completionTime) {
        const totalSeconds = exerciseResults[prevIndex].completionTime!;
        setCompletionMinutes(Math.floor(totalSeconds / 60).toString());
        setCompletionSeconds((totalSeconds % 60).toString());
      } else {
        setCompletionMinutes('');
        setCompletionSeconds('');
      }
      // Remove the last result since we're going back
      setExerciseResults(prev => prev.slice(0, -1));
    } else {
      initializeSetsForExercise(parsedWorkout.exercises[prevIndex]);
      setCompletionMinutes('');
      setCompletionSeconds('');
    }
  };

  const saveWorkout = async (results: ExerciseResult[]) => {
    if (!user || !parsedWorkout) return;

    setStep('saving');

    try {
      // Calculate total volume, duration, and reps
      let totalVolume = 0;
      let totalReps = 0;
      let totalDuration = 0; // in seconds
      const exercises: Exercise[] = results.map((result, index) => {
        const sets = result.sets.map(set => {
          if (set.weight && set.actualReps) {
            totalVolume += set.weight * set.actualReps;
          }
          if (set.actualReps) {
            totalReps += set.actualReps;
          }
          // Remove undefined values - Firestore doesn't accept them
          const cleanSet: ExerciseSet = {
            id: set.id,
            setNumber: set.setNumber,
            completed: set.completed,
            ...(set.targetReps !== undefined && { targetReps: set.targetReps }),
            ...(set.actualReps !== undefined && { actualReps: set.actualReps }),
            ...(set.weight !== undefined && { weight: set.weight }),
            ...(set.time !== undefined && { time: set.time }),
            ...(set.distance !== undefined && { distance: set.distance }),
          };
          return cleanSet;
        });

        // Add completion time to total duration
        if (result.completionTime) {
          totalDuration += result.completionTime;
        }

        return {
          id: `exercise-${index}`,
          name: result.exercise.name,
          type: result.exercise.type,
          prescription: result.exercise.prescription,
          sets,
        };
      });

      const workoutTitle = parsedWorkout.title || "Today's Workout";
      const durationMinutes = totalDuration > 0 ? totalDuration / 60 : 0;

      // Create workout document
      const workoutData = {
        userId: user.id,
        date: new Date(),
        title: workoutTitle,
        type: parsedWorkout.type,
        status: 'completed',
        exercises,
        duration: totalDuration > 0 ? Math.round(totalDuration / 60) : null,
        durationSeconds: totalDuration > 0 ? totalDuration : null,
        notes: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      await addDoc(collection(db, 'workouts'), removeUndefined(workoutData));

      // Update user stats
      const userRef = doc(db, 'users', user.id);
      await setDoc(userRef, {
        stats: {
          totalWorkouts: increment(1),
          totalVolume: increment(totalVolume),
        },
      }, { merge: true });

      // Calculate muscle groups from exercise names
      const exerciseNames = exercises.map(e => e.name);
      const muscleData = getWorkoutMuscleGroups(exerciseNames);
      const muscleGroups = {
        muscles: muscleData.muscles,
        byRegion: muscleData.byRegion,
        summary: getMuscleGroupSummary(exerciseNames),
      };

      // Calculate reward data and show reward screen
      const reward = await calculateRewardData(
        user.id,
        {
          title: workoutTitle,
          type: parsedWorkout.type,
          format: parsedWorkout.format,
          exercises,
          durationMinutes,
          totalVolume,
          totalReps,
          muscleGroups,
        },
        user.stats?.currentStreak || 0,
        (user.stats?.totalWorkouts || 0) + 1
      );

      setRewardData(reward);

      // Brief pause for saving animation, then show reward
      setTimeout(() => {
        setStep('reward');
      }, 600);
    } catch (err) {
      console.error('Error saving workout:', err);
      setError('Failed to save workout. Please try again.');
      setStep('log-results');
    }
  };

  return (
    <div className={styles.container}>
      {/* Header */}
      <header className={styles.header}>
        <button className={styles.backButton} onClick={onBack}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h1 className={styles.title}>Add Workout</h1>
        <div className={styles.spacer} />
      </header>

      {/* Content based on step */}
      {step === 'capture' && (
        <motion.div
          className={styles.captureContainer}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {/* Hidden file inputs */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            className={styles.hiddenInput}
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileSelect}
            className={styles.hiddenInput}
          />

          {/* Main capture area */}
          <Card variant="outlined" padding="lg" className={styles.captureCard}>
            <div className={styles.captureIcon}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="12" cy="13" r="4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h2 className={styles.captureTitle}>Capture your WOD</h2>
            <p className={styles.captureText}>
              Take a photo or upload an image of your workout
            </p>

            <div className={styles.captureButtons}>
              <Button
                onClick={() => cameraInputRef.current?.click()}
                size="lg"
                fullWidth
                icon={
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" strokeLinecap="round" strokeLinejoin="round" />
                    <circle cx="12" cy="13" r="4" />
                  </svg>
                }
              >
                Take Photo
              </Button>
              <Button
                variant="secondary"
                onClick={() => fileInputRef.current?.click()}
                size="lg"
                fullWidth
                icon={
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                }
              >
                Upload Image
              </Button>
            </div>
          </Card>

          {error && (
            <motion.div
              className={styles.error}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              {error}
            </motion.div>
          )}

          {savedWorkouts.length > 0 && (
            <div className={styles.savedSection}>
              <div className={styles.savedHeader}>
                <h3 className={styles.savedTitle}>Saved WODs</h3>
                <button
                  type="button"
                  className={styles.clearSaved}
                  onClick={handleClearSavedWorkouts}
                >
                  Clear all
                </button>
              </div>
              <div className={styles.savedList}>
                {savedWorkouts.map((saved) => (
                  <div key={saved.id} className={styles.savedItem}>
                    <button
                      type="button"
                      className={styles.savedSelect}
                      onClick={() => handleSelectSavedWorkout(saved)}
                    >
                      <div className={styles.savedItemInfo}>
                        <span className={styles.savedItemTitle}>{saved.title}</span>
                        <span className={styles.savedItemMeta}>
                          <span>{saved.type}</span>
                          <span>{saved.format}</span>
                          <span>{new Date(saved.savedAt).toLocaleDateString()}</span>
                        </span>
                      </div>
                    </button>
                    <button
                      type="button"
                      className={styles.savedDelete}
                      onClick={() => handleRemoveSavedWorkout(saved.id)}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Manual entry option */}
          <button className={styles.manualLink}>
            Or enter manually
          </button>
        </motion.div>
      )}

      {step === 'processing' && (
        <motion.div
          className={styles.processingContainer}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          {imageUrl && (
            <div className={styles.imagePreview}>
              <img src={imageUrl} alt="Workout" />
            </div>
          )}
          <div className={styles.processingContent}>
            <div className={styles.spinner} />
            <h2 className={styles.processingTitle}>Analyzing workout...</h2>
            <p className={styles.processingText}>
              Our AI is reading your WOD
            </p>
          </div>
        </motion.div>
      )}

      {step === 'preview' && parsedWorkout && (
        <motion.div
          className={styles.previewContainer}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {imageUrl && (
            <div className={styles.imagePreviewSmall}>
              <img src={imageUrl} alt="Workout" />
            </div>
          )}

          <Card padding="md" className={styles.previewCard}>
            <h2 className={styles.previewTitle}>
              {parsedWorkout.title || 'Today\'s Workout'}
            </h2>
            <div className={styles.previewTypes}>
              <span className={styles.previewType}>{parsedWorkout.type}</span>
              <span className={styles.previewFormat}>{parsedWorkout.format}</span>
            </div>

            <div className={styles.exerciseList}>
              {parsedWorkout.exercises.map((exercise, index) => (
                <div key={index} className={styles.exerciseItem}>
                  <span className={styles.exerciseName}>{exercise.name}</span>
                  <span className={styles.exercisePrescription}>
                    {exercise.prescription}
                  </span>
                </div>
              ))}
            </div>
          </Card>

          <div className={styles.previewActions}>
            <Button
              variant="secondary"
              onClick={() => setStep('capture')}
              size="lg"
            >
              Retake
            </Button>
            <Button
              onClick={handleConfirmWorkout}
              size="lg"
            >
              Looks Good
            </Button>
          </div>
        </motion.div>
      )}

      {/* AMRAP Intervals - rounds per set */}
      {step === 'log-results' && parsedWorkout && isCurrentExerciseAmrapInterval && (
        <motion.div
          className={styles.wizardContainer}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          key={`amrap-interval-${currentIntervalSet}`}
        >
          {/* Progress indicator */}
          <div className={styles.progressBar}>
            <div className={styles.progressText}>
              AMRAP {currentIntervalSet} of {totalIntervalSets}
            </div>
            <div className={styles.progressTrack}>
              <div
                className={styles.progressFill}
                style={{
                  width: `${(currentIntervalSet / totalIntervalSets) * 100}%`
                }}
              />
            </div>
          </div>

          {/* Workout details */}
          <Card padding="lg" className={styles.exerciseCard}>
            <h2 className={styles.exerciseName}>
              {parsedWorkout.exercises[0]?.name || 'AMRAP Intervals'}
            </h2>
            <p className={styles.exercisePrescriptionLarge}>
              {parsedWorkout.exercises[0]?.prescription}
            </p>

            {/* Show movements if available */}
            {parsedWorkout.exercises[0]?.movements && (
              <div className={styles.movementsList}>
                {parsedWorkout.exercises[0].movements.map((mov, i) => {
                  const selectedAlt = selectedAlternatives[mov.name];
                  // Use custom distance if set, otherwise fall back to original
                  const displayDistance = selectedAlt && customDistances[mov.name] !== undefined
                    ? customDistances[mov.name]
                    : mov.distance;
                  const displayUnit = mov.unit || 'm';
                  return (
                    <div key={i} className={styles.movementItem}>
                      {displayDistance && `${displayDistance}${displayUnit} `}
                      {mov.reps && `${mov.reps}x `}
                      {selectedAlt ? (
                        <span className={styles.altMovement}>{selectedAlt}</span>
                      ) : (
                        mov.name
                      )}
                      {mov.rxWeights && ` (${mov.rxWeights.female || mov.rxWeights.male}/${mov.rxWeights.male}kg)`}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Movement alternatives (shown on first set only) */}
            {currentIntervalSet === 1 && movementsWithAlternatives.length > 0 && (
              <div className={styles.alternativesSection}>
                <label className={styles.alternativesLabel}>Substitutions</label>
                {movementsWithAlternatives.map((mov) => {
                  const selectedAlt = selectedAlternatives[mov.name];
                  return (
                    <div key={mov.name} className={styles.alternativeGroup}>
                      <div className={styles.alternativeRow}>
                        <span className={styles.alternativeOriginal}>
                          {mov.distance && `${mov.distance}m `}{mov.name}
                        </span>
                        <select
                          className={styles.alternativeSelect}
                          value={selectedAlt || ''}
                          onChange={(e) => handleSelectAlternative(mov.name, e.target.value, mov.distance)}
                        >
                          <option value="">Original</option>
                          {mov.alternatives.map((alt) => (
                            <option key={alt.name} value={alt.name}>
                              {alt.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      {selectedAlt && mov.distance && (
                        <div className={styles.distanceEditRow}>
                          <input
                            type="number"
                            inputMode="numeric"
                            value={customDistances[mov.name] || ''}
                            onChange={(e) => handleCustomDistanceChange(mov.name, parseInt(e.target.value) || 0)}
                            className={styles.distanceInput}
                            min="0"
                          />
                          <span className={styles.distanceUnit}>m</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Rounds input */}
            <div className={styles.roundsInputContainer}>
              <label className={styles.timeLabel}>Rounds Completed</label>
              <input
                type="number"
                inputMode="decimal"
                step="0.5"
                value={currentRounds}
                onChange={(e) => setCurrentRounds(e.target.value)}
                placeholder="e.g., 3.5"
                className={styles.roundsInput}
                min="0"
              />
              <span className={styles.roundsHint}>Use decimals for partial rounds (e.g., 3.5)</span>
            </div>

            {/* Weight input (shown on first set only) */}
            {currentIntervalSet === 1 && (
              <div className={styles.weightInputContainer}>
                <label className={styles.timeLabel}>Weight Used (optional)</label>
                <div className={styles.weightInputRow}>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={workoutWeight}
                    onChange={(e) => setWorkoutWeight(e.target.value)}
                    placeholder="e.g., 24"
                    className={styles.weightInput}
                    min="0"
                  />
                  <span className={styles.weightUnit}>kg</span>
                </div>
              </div>
            )}

            {/* Show previous rounds */}
            {intervalRounds.length > 0 && (
              <div className={styles.splitsContainer}>
                <label className={styles.splitsLabel}>Previous AMRAPs</label>
                <div className={styles.splitsList}>
                  {intervalRounds.map((rounds, i) => (
                    <div key={i} className={styles.splitItem}>
                      <span>AMRAP {i + 1}:</span>
                      <span>{rounds} rds</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>

          {/* Navigation */}
          <div className={styles.wizardActions}>
            <Button
              variant="secondary"
              onClick={onBack}
              size="lg"
            >
              Cancel
            </Button>
            <Button
              onClick={handleRecordAmrapRounds}
              size="lg"
              disabled={!currentRounds}
            >
              {currentIntervalSet >= totalIntervalSets ? 'Finish Workout' : 'Next AMRAP'}
            </Button>
          </div>
        </motion.div>
      )}

      {/* Time-based Intervals - time per set */}
      {step === 'log-results' && parsedWorkout && isCurrentExerciseInterval && (
        <motion.div
          className={styles.wizardContainer}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          key={`interval-${currentIntervalSet}`}
        >
          {/* Progress indicator for intervals */}
          <div className={styles.progressBar}>
            <div className={styles.progressText}>
              Set {currentIntervalSet} of {totalIntervalSets}
            </div>
            <div className={styles.progressTrack}>
              <div
                className={styles.progressFill}
                style={{
                  width: `${(currentIntervalSet / totalIntervalSets) * 100}%`
                }}
              />
            </div>
          </div>

          {/* Workout details */}
          <Card padding="lg" className={styles.exerciseCard}>
            <h2 className={styles.exerciseName}>
              {parsedWorkout.exercises[0]?.name || 'Interval Workout'}
            </h2>
            <p className={styles.exercisePrescriptionLarge}>
              {parsedWorkout.exercises[0]?.prescription}
            </p>

            {/* Show movements if available */}
            {parsedWorkout.exercises[0]?.movements && (
              <div className={styles.movementsList}>
                {parsedWorkout.exercises[0].movements.map((mov, i) => {
                  const selectedAlt = selectedAlternatives[mov.name];
                  // Use custom distance if set, otherwise fall back to original
                  const displayDistance = selectedAlt && customDistances[mov.name] !== undefined
                    ? customDistances[mov.name]
                    : mov.distance;
                  const displayUnit = mov.unit || 'm';
                  return (
                    <div key={i} className={styles.movementItem}>
                      {displayDistance && `${displayDistance}${displayUnit} `}
                      {mov.reps && `${mov.reps}x `}
                      {selectedAlt ? (
                        <span className={styles.altMovement}>{selectedAlt}</span>
                      ) : (
                        mov.name
                      )}
                      {mov.rxWeights && ` (${mov.rxWeights.female || mov.rxWeights.male}/${mov.rxWeights.male}kg)`}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Movement alternatives (shown on first set only) */}
            {currentIntervalSet === 1 && movementsWithAlternatives.length > 0 && (
              <div className={styles.alternativesSection}>
                <label className={styles.alternativesLabel}>Substitutions</label>
                {movementsWithAlternatives.map((mov) => {
                  const selectedAlt = selectedAlternatives[mov.name];
                  return (
                    <div key={mov.name} className={styles.alternativeGroup}>
                      <div className={styles.alternativeRow}>
                        <span className={styles.alternativeOriginal}>
                          {mov.distance && `${mov.distance}m `}{mov.name}
                        </span>
                        <select
                          className={styles.alternativeSelect}
                          value={selectedAlt || ''}
                          onChange={(e) => handleSelectAlternative(mov.name, e.target.value, mov.distance)}
                        >
                          <option value="">Original</option>
                          {mov.alternatives.map((alt) => (
                            <option key={alt.name} value={alt.name}>
                              {alt.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      {selectedAlt && mov.distance && (
                        <div className={styles.distanceEditRow}>
                          <input
                            type="number"
                            inputMode="numeric"
                            value={customDistances[mov.name] || ''}
                            onChange={(e) => handleCustomDistanceChange(mov.name, parseInt(e.target.value) || 0)}
                            className={styles.distanceInput}
                            min="0"
                          />
                          <span className={styles.distanceUnit}>m</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Time input for this set */}
            <div className={styles.timeInputContainer}>
              <label className={styles.timeLabel}>Set {currentIntervalSet} Time</label>
              <div className={styles.timeInputs}>
                <div className={styles.timeInputGroup}>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={completionMinutes}
                    onChange={(e) => setCompletionMinutes(e.target.value)}
                    placeholder="00"
                    className={styles.timeInput}
                    min="0"
                  />
                  <span className={styles.timeUnit}>min</span>
                </div>
                <span className={styles.timeSeparator}>:</span>
                <div className={styles.timeInputGroup}>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={completionSeconds}
                    onChange={(e) => setCompletionSeconds(e.target.value)}
                    placeholder="00"
                    className={styles.timeInput}
                    min="0"
                    max="59"
                  />
                  <span className={styles.timeUnit}>sec</span>
                </div>
              </div>
            </div>

            {/* Weight input (shown on first set only if exercise has rx weights) */}
            {currentIntervalSet === 1 && weightTarget && (
              <div className={styles.weightInputContainer}>
                <label className={styles.timeLabel}>{weightLabel}</label>
                <div className={styles.weightInputRow}>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={workoutWeight}
                    onChange={(e) => setWorkoutWeight(e.target.value)}
                    placeholder={weightTarget.rxWeights?.male?.toString() || ''}
                    className={styles.weightInput}
                    min="0"
                  />
                  <span className={styles.weightUnit}>
                    {weightTarget.rxWeights?.unit || 'kg'}
                  </span>
                </div>
                {weightTarget.rxWeights && (
                  <span className={styles.rxHint}>
                    Rx: {weightTarget.rxWeights.female}/{weightTarget.rxWeights.male} {weightTarget.rxWeights.unit}
                  </span>
                )}
              </div>
            )}

            {/* Show previous splits */}
            {intervalSplitTimes.length > 0 && (
              <div className={styles.splitsContainer}>
                <label className={styles.splitsLabel}>Previous Splits</label>
                <div className={styles.splitsList}>
                  {intervalSplitTimes.map((time, i) => (
                    <div key={i} className={styles.splitItem}>
                      <span>Set {i + 1}:</span>
                      <span>{Math.floor(time / 60)}:{(time % 60).toString().padStart(2, '0')}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>

          {/* Navigation */}
          <div className={styles.wizardActions}>
            <Button
              variant="secondary"
              onClick={onBack}
              size="lg"
            >
              Cancel
            </Button>
            <Button
              onClick={handleRecordIntervalSplit}
              size="lg"
              disabled={!completionMinutes && !completionSeconds}
            >
              {currentIntervalSet >= totalIntervalSets ? 'Finish Workout' : 'Next Set'}
            </Button>
          </div>
        </motion.div>
      )}

      {/* Regular exercises - strength/sets or for-time */}
      {step === 'log-results' && parsedWorkout && (isCurrentExerciseStrength || isCurrentExerciseForTime) && (
        <motion.div
          className={styles.wizardContainer}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          key={currentExerciseIndex}
        >
          {/* Workout title */}
          {parsedWorkout.title && (
            <h2 className={styles.workoutTitle}>{parsedWorkout.title}</h2>
          )}

          {/* Progress indicator */}
          <div className={styles.progressBar}>
            <div className={styles.progressText}>
              Exercise {currentExerciseIndex + 1} of {parsedWorkout.exercises.length}
            </div>
            <div className={styles.progressTrack}>
              <div
                className={styles.progressFill}
                style={{
                  width: `${((currentExerciseIndex + 1) / parsedWorkout.exercises.length) * 100}%`
                }}
              />
            </div>
          </div>

          {/* Current exercise */}
          <Card padding="lg" className={styles.exerciseCard}>
            <h2 className={styles.exerciseName}>
              {parsedWorkout.exercises[currentExerciseIndex].name}
            </h2>
            <p className={styles.exercisePrescriptionLarge}>
              {parsedWorkout.exercises[currentExerciseIndex].prescription}
            </p>

            {/* Show time input for "for time" workouts, otherwise show sets */}
            {isForTimeWorkout(parsedWorkout.exercises[currentExerciseIndex], parsedWorkout.type, parsedWorkout.format) ? (
              <>
                {/* Show movements if available */}
                {currentExercise?.movements && (
                  <div className={styles.movementsList}>
                    {currentExercise.movements.map((mov, i) => {
                      const selectedAlt = selectedAlternatives[mov.name];
                      // Use custom distance if set, otherwise fall back to original
                      const displayDistance = selectedAlt && customDistances[mov.name] !== undefined
                        ? customDistances[mov.name]
                        : mov.distance;
                      const displayUnit = mov.unit || 'm';
                      return (
                        <div key={i} className={styles.movementItem}>
                          {displayDistance && `${displayDistance}${displayUnit} `}
                          {mov.reps && `${mov.reps}x `}
                          {selectedAlt ? (
                            <span className={styles.altMovement}>{selectedAlt}</span>
                          ) : (
                            mov.name
                          )}
                          {mov.rxWeights && ` (${mov.rxWeights.female}/${mov.rxWeights.male}kg)`}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Movement alternatives */}
                {movementsWithAlternatives.length > 0 && (
                  <div className={styles.alternativesSection}>
                    <label className={styles.alternativesLabel}>Substitutions</label>
                    {movementsWithAlternatives.map((mov) => {
                      const selectedAlt = selectedAlternatives[mov.name];
                      return (
                        <div key={mov.name} className={styles.alternativeGroup}>
                          <div className={styles.alternativeRow}>
                            <span className={styles.alternativeOriginal}>
                              {mov.distance && `${mov.distance}m `}{mov.name}
                            </span>
                            <select
                              className={styles.alternativeSelect}
                              value={selectedAlt || ''}
                              onChange={(e) => handleSelectAlternative(mov.name, e.target.value, mov.distance)}
                            >
                              <option value="">Original</option>
                              {mov.alternatives.map((alt) => (
                                <option key={alt.name} value={alt.name}>
                                  {alt.name}
                                </option>
                              ))}
                            </select>
                          </div>
                          {selectedAlt && mov.distance && (
                            <div className={styles.distanceEditRow}>
                              <input
                                type="number"
                                inputMode="numeric"
                                value={customDistances[mov.name] || ''}
                                onChange={(e) => handleCustomDistanceChange(mov.name, parseInt(e.target.value) || 0)}
                                className={styles.distanceInput}
                                min="0"
                              />
                              <span className={styles.distanceUnit}>m</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Weight input (once) */}
                {weightTarget && (
                  <div className={styles.weightInputContainer}>
                    <label className={styles.timeLabel}>{weightLabel}</label>
                    <div className={styles.weightInputRow}>
                      <input
                        type="number"
                        inputMode="decimal"
                        value={workoutWeight}
                        onChange={(e) => setWorkoutWeight(e.target.value)}
                        placeholder={weightTarget.rxWeights?.male?.toString() || ''}
                        className={styles.weightInput}
                        min="0"
                      />
                      <span className={styles.weightUnit}>
                        {weightTarget.rxWeights?.unit || 'kg'}
                      </span>
                    </div>
                    {weightTarget.rxWeights && (
                      <span className={styles.rxHint}>
                        Rx: {weightTarget.rxWeights.female}/{weightTarget.rxWeights.male} {weightTarget.rxWeights.unit}
                      </span>
                    )}
                  </div>
                )}

                {/* Time input */}
                <div className={styles.timeInputContainer}>
                  <label className={styles.timeLabel}>Total Time</label>
                  <div className={styles.timeInputs}>
                    <div className={styles.timeInputGroup}>
                      <input
                        type="number"
                        inputMode="numeric"
                        value={completionMinutes}
                        onChange={(e) => setCompletionMinutes(e.target.value)}
                        placeholder="00"
                        className={styles.timeInput}
                        min="0"
                      />
                      <span className={styles.timeUnit}>min</span>
                    </div>
                    <span className={styles.timeSeparator}>:</span>
                    <div className={styles.timeInputGroup}>
                      <input
                        type="number"
                        inputMode="numeric"
                        value={completionSeconds}
                        onChange={(e) => setCompletionSeconds(e.target.value)}
                        placeholder="00"
                        className={styles.timeInput}
                        min="0"
                        max="59"
                      />
                      <span className={styles.timeUnit}>sec</span>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* Sets */}
                <div className={styles.setsContainer}>
                  {currentSets.map((set, setIndex) => (
                    <div key={set.id} className={styles.setRow}>
                      <span className={styles.setNumber}>Set {set.setNumber}</span>

                      <div className={styles.setInputs}>
                        <div className={styles.inputGroup}>
                          <label>Weight (kg)</label>
                          <input
                            type="number"
                            inputMode="decimal"
                            value={set.weight ?? ''}
                            onChange={(e) => updateSet(
                              setIndex,
                              'weight',
                              e.target.value ? parseFloat(e.target.value) : undefined
                            )}
                            placeholder="0"
                            className={styles.setInput}
                          />
                        </div>

                        <div className={styles.inputGroup}>
                          <label>Reps</label>
                          <input
                            type="number"
                            inputMode="numeric"
                            value={set.actualReps ?? ''}
                            onChange={(e) => updateSet(
                              setIndex,
                              'actualReps',
                              e.target.value ? parseInt(e.target.value) : undefined
                            )}
                            placeholder={set.targetReps?.toString() || '0'}
                            className={styles.setInput}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Add set button */}
                <button
                  className={styles.addSetButton}
                  onClick={() => setCurrentSets(prev => [
                    ...prev,
                    {
                      id: `set-${prev.length}`,
                      setNumber: prev.length + 1,
                      targetReps: parsedWorkout.exercises[currentExerciseIndex].suggestedReps,
                      actualReps: undefined,
                      weight: undefined,
                      completed: false,
                    }
                  ])}
                >
                  + Add Set
                </button>
              </>
            )}
          </Card>

          {/* Navigation */}
          <div className={styles.wizardActions}>
            <Button
              variant="secondary"
              onClick={handlePreviousExercise}
              disabled={currentExerciseIndex === 0}
              size="lg"
            >
              Back
            </Button>
            <Button
              onClick={handleNextExercise}
              size="lg"
            >
              {currentExerciseIndex >= parsedWorkout.exercises.length - 1
                ? 'Save Workout'
                : 'Next Exercise'
              }
            </Button>
          </div>
        </motion.div>
      )}

      {step === 'saving' && (
        <motion.div
          className={styles.processingContainer}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <div className={styles.processingContent}>
            <div className={styles.spinner} />
            <h2 className={styles.processingTitle}>Saving workout...</h2>
          </div>
        </motion.div>
      )}

      {step === 'reward' && rewardData && (
        <RewardScreen
          data={rewardData}
          onDone={onWorkoutCreated}
        />
      )}
    </div>
  );
}
