import type { BlockResult, BlockScoreType, ParsedExercise, ParsedSection } from '../../../types';
import type { ExerciseKind, StoryExerciseResult } from './types';

/**
 * Block scoping — how a piece made of separately-scored blocks is logged.
 *
 * An interval AMRAP like "[10:00 AMRAP, 2:00 REST] x 3" over blocks A/B/C is ONE exercise
 * (one piece, one poster) whose blocks each carry their own score. Rather than thread a
 * section index through every input component, the wizard SCOPES the result down to one
 * block — a `StoryExerciseResult` holding just that block's movements and just that block's
 * score — and merges the athlete's edits back on the way out. Every existing input
 * (ScoreRoundsInput, ScoreMovementInputs, …) then works on a block without knowing blocks exist.
 */

export interface ScoredBlock {
  sectionIndex: number;
  section: ParsedSection;
  scoreType: BlockScoreType;
  /** Display name for the wizard header — the board's own label when it wrote one. */
  displayName: string;
}

const SCORE_TYPE_TO_KIND: Record<BlockScoreType, ExerciseKind> = {
  time: 'score_time',
  rounds: 'score_rounds',
  reps: 'reps',
  load: 'load',
};

/**
 * This block's own prescription line. The piece-level prescription lists every block ("A… B…
 * C…"), so showing it on each block page repeats the whole workout three times and buries which
 * block the athlete is actually scoring.
 */
function describeBlock(section: ParsedSection): string {
  return section.movements
    .map((mov) => {
      const qty =
        mov.reps != null ? `${mov.reps} `
        : mov.calories != null ? `${mov.calories} cal `
        : mov.distance != null ? `${mov.distance}m `
        : '';
      const load = mov.rxWeights
        ? ` @${[mov.rxWeights.female, mov.rxWeights.male]
            .filter((w): w is number => w != null)
            .filter((w, i, all) => all.indexOf(w) === i)
            .join('/')}${mov.rxWeights.unit}`
        : '';
      return `${qty}${mov.name}${load}`;
    })
    .join(', ');
}

/**
 * The blocks of this exercise that carry their own score. Empty for every ordinary exercise —
 * which is the signal to log it as a single page, exactly as before.
 */
export function getScoredBlocks(exercise: ParsedExercise): ScoredBlock[] {
  const sections = exercise.sections ?? [];
  const blocks: ScoredBlock[] = [];
  sections.forEach((section, sectionIndex) => {
    if (!section.scoreType) return;
    const label = section.label?.trim();
    blocks.push({
      sectionIndex,
      section,
      scoreType: section.scoreType,
      // The board's label is usually terse ("A", "AMRAP - C"). Prefix a bare letter/number so
      // the wizard header reads "BLOCK A" rather than a lone "A".
      displayName: label
        ? (/^[A-Za-z0-9][.)]?$/.test(label) ? `BLOCK ${label.toUpperCase()}` : label.toUpperCase())
        : `BLOCK ${sectionIndex + 1}`,
    });
  });
  return blocks;
}

/** True when this exercise is logged as several separately-scored block pages. */
export function isBlockScored(exercise: ParsedExercise): boolean {
  return getScoredBlocks(exercise).length > 1;
}

/**
 * Narrows a whole-exercise result down to ONE block: that block's movements, that block's
 * score, and a synthetic single-block exercise so the input components see a coherent,
 * self-contained piece (no sections, no piece-wide ladder/interval scheme to misread).
 */
export function scopeResultToBlock(
  result: StoryExerciseResult,
  block: ScoredBlock,
): StoryExerciseResult {
  const stored = result.blockScores?.[block.sectionIndex];

  const blockExercise: ParsedExercise = {
    ...result.exercise,
    name: block.displayName,
    prescription: describeBlock(block.section),
    movements: block.section.movements,
    // The block IS the piece from here down — piece-wide structure would be read as this
    // block's own and produce the wrong input (a ladder track, an interval estimator).
    sections: undefined,
    suggestedSets: block.section.rounds ?? 1,
    ladderReps: undefined,
    suggestedRepsPerSet: undefined,
    intervalCount: undefined,
    loggingMode: block.scoreType === 'rounds' ? 'amrap' : result.exercise.loggingMode,
  };

  return {
    ...result,
    exercise: blockExercise,
    kind: SCORE_TYPE_TO_KIND[block.scoreType],
    setsTotal: block.section.rounds ?? 1,
    movementResults: (result.movementResults ?? []).filter(
      (mr) => mr.sectionIndex === block.sectionIndex,
    ),
    // Only this block's score is in play — clear the piece-level fields so a sibling block's
    // number can never show up pre-filled in this one's input.
    rounds: block.scoreType === 'rounds' ? stored?.value : undefined,
    timeSeconds: block.scoreType === 'time' ? stored?.value : undefined,
    repsTotal: block.scoreType === 'reps' ? stored?.value : undefined,
    weight: block.scoreType === 'load' ? stored?.value : undefined,
    partialReps: stored?.partialReps,
    partialMovements: stored?.partialMovements,
    blockScores: undefined,
  };
}

/**
 * Folds a patch made against a scoped block back into the whole-exercise result: the block's
 * score lands in blockScores[sectionIndex], and edited movements are written back to their
 * slots in the full movementResults list (matched by key, since the scoped list is a subset).
 */
export function mergeBlockPatch(
  result: StoryExerciseResult,
  block: ScoredBlock,
  patch: Partial<StoryExerciseResult>,
): Partial<StoryExerciseResult> {
  const merged: Partial<StoryExerciseResult> = {};

  if (patch.movementResults) {
    const next = [...(result.movementResults ?? [])];
    for (const mr of patch.movementResults) {
      const i = next.findIndex((m) => m.movementKey === mr.movementKey);
      if (i >= 0) next[i] = mr;
    }
    merged.movementResults = next;
  }

  const scoreValue =
    block.scoreType === 'rounds' ? patch.rounds
    : block.scoreType === 'time' ? patch.timeSeconds
    : block.scoreType === 'reps' ? patch.repsTotal
    : patch.weight;

  const touchesScore =
    scoreValue !== undefined || 'partialReps' in patch || 'partialMovements' in patch;

  if (touchesScore) {
    const scores = [...(result.blockScores ?? [])];
    const previous = scores[block.sectionIndex];
    const value = scoreValue ?? previous?.value;
    // A block with no value yet isn't a result — don't create an empty entry just because the
    // athlete opened the partial-round checklist first.
    if (value != null) {
      scores[block.sectionIndex] = {
        value,
        partialReps: 'partialReps' in patch ? patch.partialReps : previous?.partialReps,
        partialMovements:
          'partialMovements' in patch ? patch.partialMovements : previous?.partialMovements,
      };
      merged.blockScores = scores;
    }
  }

  return merged;
}

/**
 * Copies logged block scores onto the exercise's own sections, so the saved workout carries
 * each block's result next to the block it belongs to (what the poster reads).
 */
export function applyBlockScoresToSections(
  exercise: ParsedExercise,
  blockScores: (BlockResult | undefined)[] | undefined,
): ParsedSection[] | undefined {
  const sections = exercise.sections;
  if (!sections || !blockScores) return sections;
  return sections.map((section, i) => {
    const score = blockScores[i];
    return score && section.scoreType ? { ...section, result: score } : section;
  });
}
