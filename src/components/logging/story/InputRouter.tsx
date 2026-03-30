import type { StoryExerciseResult, MovementResult } from './types';
import { LoadInput } from './LoadInput';
import { ScoreTimeInput, ScoreRoundsInput } from './ScoreInputs';
import { LadderInput } from './LadderInput';
import { RepsSetsInput } from './RepsSetsInput';
import { DurationInput, DistanceInput, IntervalsInput, NoteInput } from './MinorInputs';
import { SupersetInput } from './SupersetInput';
import { ScoreMovementInputs } from './ScoreMovementInputs';

interface InputRouterProps {
  result: StoryExerciseResult;
  onChange: (patch: Partial<StoryExerciseResult>) => void;
  teamSize?: number;
}

/**
 * Routes an ExerciseKind to its corresponding input component.
 * Used inside EditExerciseSheet to render the right editor.
 *
 * Trust the AI: movementResults carry inputType from the parser.
 * If a movement says inputType: "weight", we show a weight input —
 * regardless of whether the exercise is scored, single, or superset.
 */
export function InputRouter({ result, onChange, teamSize }: InputRouterProps) {
  const kind = result.kind;
  const movements = result.movementResults ?? [];

  // Scored exercises: score input is primary, then compact inline
  // inputs for any movements the AI tagged as needing user input.
  if (kind === 'score_time' || kind === 'score_rounds') {
    const inputMovements = movements.filter(
      mr => mr.kind === 'load' || mr.kind === 'distance'
    );
    // Show ScoreMovementInputs whenever there are movements —
    // even if none need weight/distance input, they may have substitution alternatives.
    const showMovements = movements.length > 0;
    // Ladder AMRAP: use step sliders instead of round counter
    const isLadder = kind === 'score_rounds' && result.exercise.ladderReps && result.exercise.ladderReps.length > 0;

    return (
      <>
        {kind === 'score_time'
          ? <ScoreTimeInput result={result} onChange={onChange} />
          : isLadder
            ? <LadderInput result={result} onChange={onChange} />
            : <ScoreRoundsInput result={result} onChange={onChange} />
        }
        {showMovements && (
          <ScoreMovementInputs
            movements={movements}
            inputMovements={inputMovements}
            teamSize={teamSize}
            onChange={(index: number, patch: Partial<MovementResult>) => {
              const next = [...movements];
              next[index] = { ...next[index], ...patch };
              onChange({ movementResults: next });
            }}
            onBatch={(next) => onChange({ movementResults: next })}
          />
        )}
      </>
    );
  }

  // Superset: multiple movements → dedicated per-movement input
  // (but NOT for intervals — those get handled in the switch below)
  if (movements.length > 1 && kind !== 'intervals') {
    return <SupersetInput result={result} onChange={onChange} />;
  }

  // Detect if this is a KB/DB movement that needs implement toggle
  const hasImplement = result.exercise.movements?.some(
    m => m.implementCount != null && m.implementCount > 0
  ) ?? false;

  switch (kind) {
    case 'load':
      return <LoadInput result={result} onChange={onChange} showImplement={hasImplement} />;
    case 'reps':
      return <RepsSetsInput result={result} onChange={onChange} />;
    case 'duration':
      return <DurationInput result={result} onChange={onChange} />;
    case 'distance':
      return <DistanceInput result={result} onChange={onChange} />;
    case 'intervals': {
      // Show per-movement weight/distance inputs for interval exercises with movements
      const intervalInputMovements = movements.filter(
        mr => mr.kind === 'load' || mr.kind === 'distance'
      );
      return (
        <>
          <IntervalsInput result={result} onChange={onChange} showWeight={false} />
          {intervalInputMovements.length > 0 && (
            <ScoreMovementInputs
              movements={movements}
              inputMovements={intervalInputMovements}
              teamSize={teamSize}
              onChange={(index: number, patch: Partial<MovementResult>) => {
                const next = [...movements];
                next[index] = { ...next[index], ...patch };
                onChange({ movementResults: next });
              }}
              onBatch={(next) => onChange({ movementResults: next })}
            />
          )}
        </>
      );
    }
    case 'note':
      return <NoteInput result={result} onChange={onChange} />;
    default:
      return <NoteInput result={result} onChange={onChange} />;
  }
}
