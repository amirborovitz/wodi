import type { StoryExerciseResult, MovementResult } from './types';
import { prescribesBuildingLoad } from './types';
import { LoadInput } from './LoadInput';
import { ScoreTimeInput, ScoreRoundsInput, RoundsPerIntervalInput, OpenRepsPerIntervalInput } from './ScoreInputs';
import { RepsSetsInput } from './RepsSetsInput';
import { DurationInput, DistanceInput, NoteInput } from './MinorInputs';
import { SupersetInput } from './SupersetInput';
import { ScoreMovementInputs } from './ScoreMovementInputs';
import { LadderInput } from './LadderInput';
import { DescendingSetTrack } from './DescendingSetTrack';
import { FreeScoreInput } from './FreeScoreInput';
import { hasSameMovementsEveryRound } from '../../../utils/sectionShape';
import { resolveBlockScore } from '../../../services/blockScore';

interface InputRouterProps {
  result: StoryExerciseResult;
  onChange: (patch: Partial<StoryExerciseResult>) => void;
  teamSize?: number;
  onSubstitutionOpenChange?: (open: boolean) => void;
  /** Most recent logged max per movement (lowercased name) — seeds the max-effort stepper. */
  lastMaxReps?: Record<string, number>;
}

/**
 * Routes an ExerciseKind to its corresponding input component.
 * Rendered by StoryLogResults inside WizardExerciseScreen, one part per page.
 *
 * Trust the AI: movementResults carry inputType from the parser.
 * If a movement says inputType: "weight", we show a weight input —
 * regardless of whether the exercise is scored, single, or superset.
 */
export function InputRouter({ result, onChange, teamSize, onSubstitutionOpenChange, lastMaxReps }: InputRouterProps) {
  const kind = result.kind;
  const movements = result.movementResults ?? [];
  if (kind === 'score_time' || kind === 'score_rounds' || kind === 'score_open_reps') {
    const isLadder = !!(result.exercise.ladderReps && result.exercise.ladderReps.length > 0);

    // What this block is actually scored by, read from the block rather than its format name.
    // A board can run on an AMRAP clock and still have no rounds to earn: "[2:00 AMRAP] x4 —
    // 2 rounds of 8 Push Press + 8 Box Jumps, into max burpees" prescribes both rounds, so the
    // only number the athlete brings is the burpees.
    const blockScore = resolveBlockScore(result.exercise);
    // The per-window grid answers ONE question — "how many X each window?" — so it only fits a
    // block with a single open movement. A station board leaves every station open, and there is
    // no single X to ask about: the bike was taking the grid while the other four stations were
    // demoted to side tiles, two logging surfaces disagreeing about the same workout. With
    // several open movements each station is simply its own tile, answered once as a per-round
    // average, and the visit count turns that into the total.
    const openMovements = blockScore.type === 'open_reps' ? blockScore.movements : [];
    const isPerStationBoard = openMovements.length > 1;
    const scoresOpenCount = kind === 'score_open_reps'
      && blockScore.type === 'open_reps'
      && !isPerStationBoard;
    const openMovementKey = scoresOpenCount ? openMovements[0].name.toLowerCase() : null;

    // For ladder AMRAP, bodyweight reps movements are determined by the rung —
    // only weighted/distance movements need user input.
    //
    // The open movement is dropped here because its count is the block's SCORE and already has
    // its own per-window input below. Left in, it also drew a max-reps tile from
    // ScoreMovementInputs (getTileConfig's isMaxBodyweight branch) — so the athlete was asked
    // for the same burpees twice, in two different shapes, with no hint which one counted.
    const visibleMovements = (isLadder
      ? movements.filter(mr => mr.kind === 'load' || mr.kind === 'distance')
      : movements
    ).filter(mr => !openMovementKey || mr.movement.name.toLowerCase() !== openMovementKey);
    const inputMovements = visibleMovements.filter(
      mr => mr.kind === 'load' || mr.kind === 'distance'
    );
    const isAmrapIntervals = result.exercise.loggingMode === 'amrap_intervals';

    // Round-alternating partner AMRAP-intervals (IGUG "I go, you go"): whoever's up for an
    // interval does the FULL prescribed round, so per-movement per-round precision is both
    // unnecessary and actively wrong. Swap the rounds counter for a single "rounds per
    // interval" estimate + weight-only tiles. Solo and flat-shared-total partner
    // AMRAP-intervals score like a plain AMRAP: total rounds + weight/substitution tiles —
    // prescribed reps are prescription, never an input.
    const isRoundsSplitPartner = result.exercise.partnerWorkout === true
      && result.exercise.partnerSplit === 'rounds';
    const useSimplifiedIntervalRounds = isAmrapIntervals && isRoundsSplitPartner && !isLadder;

    // `exercise.intervalCount` is the board's TOTAL turn count across the whole shared session
    // (e.g. "x4" = 4 turns total). When partners alternate, only half those turns are this
    // athlete's own — dividing by teamSize here is what keeps the "rounds per interval" estimate
    // from silently doubling into a fictional team total (this is never a team score; see the
    // partner-split note above).
    const totalIntervalCount = result.exercise.intervalCount ?? result.setsTotal ?? 1;
    const personalIntervalCount = useSimplifiedIntervalRounds && teamSize && teamSize > 1
      ? Math.max(1, Math.round(totalIntervalCount / teamSize))
      : totalIntervalCount;

    // The simplified path only ever needs weight/distance tiles (bodyweight reps are derived from
    // the rounds estimate, same as a plain AMRAP) — everything else keeps showing all movements.
    const displayMovements = useSimplifiedIntervalRounds ? inputMovements : visibleMovements;
    const showMovements = displayMovements.length > 0;

    const descRepsPerSet = result.exercise.suggestedRepsPerSet;
    const isDescLadder = !isLadder
      && kind === 'score_time'
      && descRepsPerSet
      && descRepsPerSet.length >= 3;

    // A relay-distance movement is a prescribed fixed distance (e.g. 200m run) whose personal
    // trip count can diverge from the round count — the AI stamps `relay: true` on pair-paced
    // pacers ("P1 runs while P2 AMRAPs, swap"); teamSize > 1 stays as the fallback for partner
    // docs saved before the flag existed. It renders as a relay-count stepper. When it's the
    // only scored movement the ROUNDS counter is redundant — the relay stepper IS the score
    // input: we hide ScoreRoundsInput and sync the relay count back into result.rounds.
    // For a plain solo AMRAP the ROUNDS counter already counts every trip, so prescribed-distance
    // movements take no input instead (distancePrescribedByStructure).
    //
    // A for-time per-movement ladder is the other shape where the board already states every
    // metre: its tiers prescribe 800/600/400m, and a single input box can only hold one of them —
    // it showed 800 and would have logged that as the whole run. Its prescribed reps (40-30-20
    // thrusters, 20-30-40 burpees) already take no input for exactly this reason; the distance
    // is no different. The athlete's unknowns here are the TIME and the weight they chose.
    const isPerMovementLadder = kind === 'score_time' && hasSameMovementsEveryRound(result.exercise);
    const relayMr = inputMovements.find(
      mr => mr.kind === 'distance' &&
        (mr.movement.distance ?? 0) > 0 &&
        !(mr.movement.inputType === 'calories' || (mr.movement.calories ?? 0) > 0)
    );
    const hasRelay = !!relayMr && (relayMr.movement.relay === true || (teamSize ?? 1) > 1);
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
        {kind === 'score_rounds' && !useSimplifiedIntervalRounds && !isLadder && !isPureRelay && (
          <ScoreRoundsInput result={result} onChange={onChange} />
        )}
        {scoresOpenCount && blockScore.type === 'open_reps' && !isLadder && (
          <OpenRepsPerIntervalInput
            result={result}
            movementName={blockScore.movements[0].name}
            intervals={blockScore.intervals}
            seed={lastMaxReps?.[blockScore.movements[0].name.toLowerCase()]}
            onChange={onChange}
          />
        )}
        {useSimplifiedIntervalRounds && (
          <RoundsPerIntervalInput
            result={result}
            intervalCount={personalIntervalCount}
            onChange={onChange}
          />
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
            movements={displayMovements}
            isRelayContext={hasRelay && kind === 'score_rounds'}
            // Prescribed distances are display-only on any scored-by-structure block: the board
            // states every metre, so there is nothing to type. Open-reps blocks are the same —
            // their prescribed work is fully written, which is precisely why the score is the
            // one movement that isn't.
            distancePrescribedByStructure={(kind === 'score_rounds' || kind === 'score_open_reps' || isPerMovementLadder) && !hasRelay}
            perStation={isPerStationBoard}
            teamSize={teamSize}
            onSubstitutionOpenChange={onSubstitutionOpenChange}
            onChange={(index: number, patch: Partial<MovementResult>) => {
              const next = [...movements];
              const key = displayMovements[index]?.movementKey;
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

  // Free/unclassified part: one generic score entry (athlete picks time/rounds/reps/load) plus a
  // row per movement. Reached two ways — the parser couldn't classify the board, or the athlete
  // turned down the reading it did produce (flattenResult) — and the input is identical either
  // way, because the question is: nothing here is being multiplied, so what did you actually do?
  //
  // Every movement gets a row, not just the loaded and distance ones. `flat` is what makes a
  // prescribed "10 Pull-ups" take an input: with no rounds counter above it there is nothing left
  // to multiply that 10 by, so the athlete states the total or the reps are simply lost.
  // Must run BEFORE the superset branch — a multi-movement free part is not a superset.
  if (kind === 'free_score') {
    return (
      <>
        <FreeScoreInput result={result} onChange={onChange} />
        {movements.length > 0 && (
          <ScoreMovementInputs
            movements={movements}
            flat
            teamSize={teamSize}
            onSubstitutionOpenChange={onSubstitutionOpenChange}
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

  // Superset: multiple movements → dedicated per-movement input.
  // Exception: EMOM with mixed bodyweight/cardio movements (e.g. Cindy)
  // still go to ScoreMovementInputs. But an all-weighted complex (e.g. Power Clean +
  // Squat Clean + Push Jerk EMOM) gets SupersetInput for shared barbell weight.
  // (kind 'intervals' is EMOM-only now — "X sets for time" maps to 'score_time' above.)
  const isWeightedComplex = kind === 'intervals' && movements.length > 0
    && movements.every(mr => mr.kind === 'load');
  // A single-lift EMOM the board tells you to BUILD across ("4 sets, Every 1:30: 2 Clean & Jerk
  // — start at ~65% and build up") is a weight progression, same as a strength block: it needs
  // Start/Peak, not the one weight tile ScoreMovementInputs would give it. SupersetInput's
  // progressive path handles one weighted movement as happily as several.
  const isBuildingLift = isWeightedComplex
    && result.setsTotal > 1
    && prescribesBuildingLoad(result.exercise);
  if ((movements.length > 1 || isBuildingLift) && (kind !== 'intervals' || isWeightedComplex)) {
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
      return <RepsSetsInput result={result} onChange={onChange} lastMaxReps={lastMaxReps} />;
    case 'duration':
      return <DurationInput result={result} onChange={onChange} />;
    case 'distance':
      return <DistanceInput result={result} onChange={onChange} />;
    case 'intervals': {
      // EMOM: no time/score input — just confirm per-movement weight/distance.
      return (
        <ScoreMovementInputs
          movements={movements}
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
