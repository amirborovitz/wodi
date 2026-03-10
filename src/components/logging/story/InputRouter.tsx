import type { StoryExerciseResult, MovementResult } from './types';
import { LoadInput } from './LoadInput';
import { ScoreTimeInput, ScoreRoundsInput } from './ScoreInputs';
import { RepsSetsInput } from './RepsSetsInput';
import { DurationInput, DistanceInput, IntervalsInput, NoteInput } from './MinorInputs';
import { SupersetInput } from './SupersetInput';
import { ScoreMovementInputs } from './ScoreMovementInputs';

interface InputRouterProps {
  result: StoryExerciseResult;
  onChange: (patch: Partial<StoryExerciseResult>) => void;
}

/**
 * Routes an ExerciseKind to its corresponding input component.
 * Used inside EditExerciseSheet to render the right editor.
 *
 * Trust the AI: movementResults carry inputType from the parser.
 * If a movement says inputType: "weight", we show a weight input —
 * regardless of whether the exercise is scored, single, or superset.
 */
export function InputRouter({ result, onChange }: InputRouterProps) {
  const kind = result.kind;
  const movements = result.movementResults ?? [];

  // Scored exercises: score input is primary, then compact inline
  // inputs for any movements the AI tagged as needing user input.
  if (kind === 'score_time' || kind === 'score_rounds') {
    const inputMovements = movements.filter(
      mr => mr.kind === 'load' || mr.kind === 'distance'
    );
    // DEBUG: trace why weight inputs may not appear
    console.log('[InputRouter] score mode:', kind, 'movements:', movements.length, 'inputMovements:', inputMovements.length, movements.map(m => `${m.movement.name}→${m.kind}`));
    return (
      <>
        {kind === 'score_time'
          ? <ScoreTimeInput result={result} onChange={onChange} />
          : <ScoreRoundsInput result={result} onChange={onChange} />
        }
        {inputMovements.length > 0 && (
          <ScoreMovementInputs
            movements={movements}
            inputMovements={inputMovements}
            onChange={(index: number, patch: Partial<MovementResult>) => {
              const next = [...movements];
              next[index] = { ...next[index], ...patch };
              onChange({ movementResults: next });
            }}
          />
        )}
      </>
    );
  }

  // Superset: multiple movements → dedicated per-movement input
  if (movements.length > 1) {
    return <SupersetInput result={result} onChange={onChange} />;
  }

  // Detect if this is a KB/DB movement that needs implement toggle
  const hasImplement = result.exercise.movements?.some(
    m => m.implementCount != null && m.implementCount > 0
  ) ?? false;

  // Detect if this interval has weighted movements
  const hasIntervalWeight = kind === 'intervals' && result.exercise.movements?.some(
    m => m.rxWeights != null || m.inputType === 'weight'
  );

  switch (kind) {
    case 'load':
      return <LoadInput result={result} onChange={onChange} showImplement={hasImplement} />;
    case 'reps':
      return <RepsSetsInput result={result} onChange={onChange} />;
    case 'duration':
      return <DurationInput result={result} onChange={onChange} />;
    case 'distance':
      return <DistanceInput result={result} onChange={onChange} />;
    case 'intervals':
      return <IntervalsInput result={result} onChange={onChange} showWeight={!!hasIntervalWeight} />;
    case 'note':
      return <NoteInput result={result} onChange={onChange} />;
    default:
      return <NoteInput result={result} onChange={onChange} />;
  }
}
