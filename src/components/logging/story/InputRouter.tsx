import type { StoryExerciseResult, MovementResult } from './types';
import { LoadInput } from './LoadInput';
import { ScoreTimeInput } from './ScoreInputs';
import { RepsSetsInput } from './RepsSetsInput';
import { DurationInput, DistanceInput, NoteInput } from './MinorInputs';
import { SupersetInput } from './SupersetInput';
import { ScoreMovementInputs } from './ScoreMovementInputs';
import { LadderInput } from './LadderInput';
import { DescendingSetTrack } from './DescendingSetTrack';

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

  // Scored exercises: for_time keeps the time input; AMRAP drops the round counter —
  // movement-level inputs (weight, cal, reps) are the actual logging story.
  if (kind === 'score_time' || kind === 'score_rounds') {
    const isLadder = !!(result.exercise.ladderReps && result.exercise.ladderReps.length > 0);

    // For ladder AMRAP, bodyweight reps movements are determined by the rung —
    // only weighted/distance movements need user input.
    const visibleMovements = isLadder
      ? movements.filter(mr => mr.kind === 'load' || mr.kind === 'distance')
      : movements;
    const inputMovements = visibleMovements.filter(
      mr => mr.kind === 'load' || mr.kind === 'distance'
    );
    const showMovements = visibleMovements.length > 0;
    const isAmrapIntervals = result.exercise.loggingMode === 'amrap_intervals';

    const descRepsPerSet = result.exercise.suggestedRepsPerSet;
    const isDescLadder = !isLadder
      && kind === 'score_time'
      && descRepsPerSet
      && descRepsPerSet.length >= 3;

    return (
      <>
        {kind === 'score_time' && (
          <ScoreTimeInput result={result} onChange={onChange} />
        )}
        {isLadder && (
          <LadderInput result={result} onChange={onChange} />
        )}
        {isDescLadder && (
          <DescendingSetTrack
            repsPerSet={descRepsPerSet!}
            setsCompleted={result.setsCompleted}
            onChange={(n) => onChange({ setsCompleted: n })}
          />
        )}
        {showMovements && (
          <ScoreMovementInputs
            movements={visibleMovements}
            inputMovements={inputMovements}
            variant={isAmrapIntervals ? 'amrap_intervals' : 'default'}
            roundsTotal={isAmrapIntervals ? (result.exercise.intervalCount ?? result.setsTotal) : undefined}
            teamSize={teamSize}
            onChange={(index: number, patch: Partial<MovementResult>) => {
              const next = [...movements];
              const key = visibleMovements[index]?.movementKey;
              const globalIdx = key ? next.findIndex(m => m.movementKey === key) : -1;
              const i = globalIdx >= 0 ? globalIdx : index;
              next[i] = { ...next[i], ...patch };
              onChange({ movementResults: next });
            }}
            onBatch={(updated) => {
              // Merge updated visible movements back into the full array
              const next = [...movements];
              updated.forEach(mr => {
                const i = next.findIndex(m => m.movementKey === mr.movementKey);
                if (i >= 0) next[i] = mr;
              });
              onChange({ movementResults: next });
            }}
          />
        )}
      </>
    );
  }

  // Superset: multiple movements → dedicated per-movement input.
  // Exception: EMOM/intervals with mixed bodyweight/cardio movements (e.g. Cindy)
  // still go to ScoreMovementInputs. But an all-weighted complex (e.g. Power Clean +
  // Squat Clean + Push Jerk EMOM) gets SupersetInput for shared barbell weight.
  const isWeightedComplex = kind === 'intervals' && movements.every(mr => mr.kind === 'load');
  if (movements.length > 1 && (kind !== 'intervals' || isWeightedComplex)) {
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
      // Just show per-movement inputs — the interval count is fixed and redundant.
      return (
        <ScoreMovementInputs
          movements={movements}
          inputMovements={movements.filter(mr => mr.kind === 'load' || mr.kind === 'distance')}
          teamSize={teamSize}
          onChange={(index: number, patch: Partial<MovementResult>) => {
            const next = [...movements];
            next[index] = { ...next[index], ...patch };
            onChange({ movementResults: next });
          }}
          onBatch={(next) => onChange({ movementResults: next })}
        />
      );
    }
    case 'note':
      return <NoteInput result={result} onChange={onChange} />;
    default:
      return <NoteInput result={result} onChange={onChange} />;
  }
}
