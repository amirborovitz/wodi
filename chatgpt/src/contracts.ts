import type { ParsedWorkout } from '../../src/types/index';
import type { StoryExerciseResult } from '../../src/components/logging/story/types';

/** Schema is generated from the app's actual contracts, rather than a second hand-written model. */
export interface WorkoutLog {
  parsed_workout: ParsedWorkout;
  results: StoryExerciseResult[];
  trained_at: string;
  request_id: string;
  is_test?: boolean;
}
