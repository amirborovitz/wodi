import type { StoryExerciseResult, MovementResult } from './types';
import { LoadInput } from './LoadInput';
import { ScoreTimeInput, ScoreRoundsInput } from './ScoreInputs';
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
  onSubstitutionOpenChange?: (open: boolean) => void;
}

/**
 * Routes an ExerciseKind to its corresponding input component.
 * Used inside EditExerciseSheet to render the right editor.
 *
 * Trust the AI: movementResults carry inputType from the parser.
 * If a movement says inputType: "weight", we show a weight input —
 * regardless of whether the exercise is scored, single, or superset.
 */
export function InputRouter({ result, onChange, teamSize, onSubstitutionOpenChange }: InputRouterProps) {
  const kind = result.kind;
  const movements = result.movementResults ?? [];
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

    // A relay-distance movement is a prescribed fixed distance (e.g. 200m run) that
    // renders as a relay-count stepper. When one exists the ROUNDS counter is redundant —
    // the relay stepper IS the score input. We hide ScoreRoundsInput and sync the relay
    // count back into result.rounds so the celebration screen still gets the right number.
    const relayMr = inputMovements.find(
      mr => mr.kind === 'distance' &&
        (mr.movement.distance ?? 0) > 0 &&
        !(mr.movement.inputType === 'calories' || (mr.movement.calories ?? 0) > 0)
    );
    const hasRelay = !!relayMr;
    // Pure relay: run IS the score (no other scored movements). In IGYG workouts the relay
    // count and AMRAP rounds are separate — both inputs are shown independently.
    const isPureRelay = hasRelay && inputMovements.filter(mr => mr !== relayMr).length === 0;
    const syncRelay = (next: MovementResult[]): Partial<StoryExerciseResult> => {
      if (!isPureRelay) return {};
      const updated = next.find(
        m => m.kind === 'distance' &&
          (m.movement.distance ?? 0) > 0 &&
          !(m.movement.inputType === 'calories' || (m.movement.calories ?? 0) > 0)
      );
      if (!updated || updated.distance == null || !updated.movement.distance) return {};
      return { rounds: Math.round(updated.distance / updated.movement.distance) };
    };

    return (
      <>
        {kind === 'score_time' && (
          <ScoreTimeInput result={result} onChange={onChange} />
        )}
        {kind === 'score_rounds' && !isAmrapIntervals && !isLadder && !isPureRelay && (
          <ScoreRoundsInput result={result} onChange={onChange} />
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
            isRelayContext={hasRelay && kind === 'score_rounds'}
            teamSize={teamSize}
            onSubstitutionOpenChange={onSubstitutionOpenChange}
            onChange={(index: number, patch: Partial<MovementResult>) => {
              const next = [...movements];
              const key = visibleMovements[index]?.movementKey;
              const globalIdx = key ? next.findIndex(m => m.movementKey === key) : -1;
              const i = globalIdx >= 0 ? globalIdx : index;
              next[i] = { ...next[i], ...patch };
              onChange({ movementResults: next, ...syncRelay(next) });
            }}
            onBatch={(updated) => {
              const next = [...movements];
              updated.forEach(mr => {
                const i = next.findIndex(m => m.movementKey === mr.movementKey);
                if (i >= 0) next[i] = mr;
              });
              onChange({ movementResults: next, ...syncRelay(next) });
            }}
          />
        )}
      </>
    );
  }

  // Superset: multiple movements → dedicated per-movement input.
  // Exception: EMOM with mixed bodyweight/cardio movements (e.g. Cindy)
  // still go to ScoreMovementInputs. But an all-weighted complex (e.g. Power Clean +
  // Squat Clean + Push Jerk EMOM) gets SupersetInput for shared barbell weight.
  // (kind 'intervals' is EMOM-only now — "X sets for time" maps to 'score_time' above.)
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
      // EMOM: no time/score input — just confirm per-movement weight/distance.
      return (
        <ScoreMovementInputs
          movements={movements}
          inputMovements={movements.filter(mr => mr.kind === 'load' || mr.kind === 'distance')}
          teamSize={teamSize}
          onSubstitutionOpenChange={onSubstitutionOpenChange}
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
