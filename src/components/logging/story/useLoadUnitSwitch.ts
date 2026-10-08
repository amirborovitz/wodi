import { useCallback, useMemo, type Dispatch, type SetStateAction } from 'react';
import type { StoryExerciseResult } from './types';
import { partLoadUnit, setLoadUnit } from './athleteLoadUnit';
import type { LoadUnit } from '../../../utils/loadUnits';

export interface LoadUnitSwitch {
  unit: LoadUnit;
  onChange: (unit: LoadUnit) => void;
}

/**
 * The kg / lb switch on a logging page — the forms' way of saying which unit they lifted in. Shown
 * only on a part with loads. Flipping it moves every load on the part, and, when the board left
 * them silent, every silent load in the workout (setLoadUnit); the profile follows on save.
 */
export function useLoadUnitSwitch(
  results: StoryExerciseResult[],
  setResults: Dispatch<SetStateAction<StoryExerciseResult[]>>,
  exerciseIndex: number,
): LoadUnitSwitch | undefined {
  const part = results.find((r) => r.exerciseIndex === exerciseIndex);
  const unit = useMemo(() => (part ? partLoadUnit(part.exercise) : undefined), [part]);
  const onChange = useCallback((next: LoadUnit): void => {
    setResults((prev) => setLoadUnit(prev, exerciseIndex, undefined, next));
  }, [setResults, exerciseIndex]);
  return unit ? { unit, onChange } : undefined;
}
