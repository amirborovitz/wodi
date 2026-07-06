/**
 * Pure computation helpers for the celebration screen.
 * No React, no hooks, no JSX — only TypeScript + domain types.
 *
 * Previously exported from WorkoutScreen.tsx and imported by useCelebrationData.
 * Now these live here; WorkoutScreen re-exports them for backward compat during migration.
 */

import type {
  Exercise,
  MovementTotal,
  WorkloadBreakdown,
  WorkoutFormat,
  ParsedSection,
  ParsedSectionType,
  ParsedMovement,
} from '../../types';
import type {
  ArtifactRow,
  ArtifactSection,
  HeroResult,
  HighlightStampData,
  StoryMovementLine,
} from './types';
import {
  isBwVolumeMovement,
} from '../../services/workloadCalculation';
import {
  DEFAULT_CELEBRATION_STICKER_CONFIG,
  type CelebrationStickerConfig,
} from '../../services/celebrationStickerConfig';
import { detectPartnerSplit, buildRoundLedger, type PartnerSplitInfo } from './partnerSplit';

// ─── Formatting helpers ───────────────────────────────────────────────────────

export function formatDurationFromSeconds(totalSeconds: number): { num: string; unit: string } {
  if (totalSeconds === 0) return { num: '--', unit: '' };
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.round(totalSeconds % 60);
  if (mins >= 60) {
    const hrs = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    return { num: `${hrs}:${remainingMins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`, unit: '' };
  }
  if (secs > 0) return { num: `${mins}:${secs.toString().padStart(2, '0')}`, unit: '' };
  return { num: `${mins}`, unit: 'min' };
}

export function formatDistanceSplit(meters: number): { num: string; unit: string } {
  if (meters >= 1000) return { num: `${(meters / 1000).toFixed(1)}`, unit: 'km' };
  return { num: `${Math.round(meters)}`, unit: 'm' };
}

export function formatDistanceValue(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(2)} km`;
  return `${Math.round(meters)} m`;
}

export function normalizeIntervalNotation(raw: string): string {
  return raw.replace(
    /every\s+(\d+(?:\.\d+)?)\s*(minutes?|mins?)\b/gi,
    (_match, value: string) => {
      if (!value.includes('.')) return `every ${value} min`;
      const totalSeconds = Math.round(parseFloat(value) * 60);
      const mins = Math.floor(totalSeconds / 60);
      const secs = totalSeconds % 60;
      return `every ${mins}:${secs.toString().padStart(2, '0')}`;
    },
  );
}

export function formatAmrapRounds(rounds: number): string {
  const intPart = Math.floor(rounds);
  if (rounds % 1 !== 0) return intPart === 0 ? '½' : `${intPart}½`;
  return `${intPart}`;
}

export function fmtTimeSocial(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h}:${(m % 60).toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function formatStickerMovementName(name: string): string {
  return name
    .replace(/\bDumbbell\b/gi, 'DB')
    .replace(/\bKettlebell\b/gi, 'KB')
    .replace(/\bAmerican\b/gi, 'AM')
    .replace(/\bRussian\b/gi, 'RU')
    .replace(/\bHandstand Push[- ]?Ups?\b/gi, 'HSPU')
    .replace(/\bToes[- ]to[- ]Bar\b/gi, 'TTB')
    .replace(/\bChest[- ]to[- ]Bar\b/gi, 'C2B')
    .replace(/\bDouble[- ]Unders?\b/gi, 'DU')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

export function formatStampLoad(weight: number, unit?: string): string {
  const rounded = Number.isInteger(weight) ? `${weight}` : weight.toFixed(1);
  return `${rounded}${unit === 'lb' ? 'LB' : 'KG'}`;
}

export function stableRotation(seed: string, index: number): number {
  let hash = index * 97;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 600;
  }
  return parseFloat((-3 + hash / 100).toFixed(1));
}

export function normalizeBlueprint(text: string): string {
  return text
    .replace(/\bR\.P\.E\.?\b/gi, 'RPE')
    .replace(/\bR\.I\.R\.?\b/gi, 'RIR')
    .replace(/\bE\.M\.O\.M\.?\b/gi, 'EMOM');
}

export function extractEveryXCadence(text: string): string | undefined {
  const mmss = text.match(/every\s+0?(\d+):(\d{2})\s*(?:min(?:utes?)?)?(?:\s*[x×]|(?=\s|$))/i);
  if (mmss) {
    const mins = parseInt(mmss[1]);
    const secs = parseInt(mmss[2]);
    return secs === 0 ? `EVERY ${mins} MIN` : `EVERY ${mins}:${secs.toString().padStart(2, '0')}`;
  }
  const simple = text.match(/every\s+(\d+(?:\.\d+)?)\s*min(?:utes?)?\b/i);
  if (simple) return `EVERY ${simple[1]} MIN`;
  return undefined;
}

// ─── Debug ───────────────────────────────────────────────────────────────────

export function shouldLogCelebrationDebug(): boolean {
  return typeof window !== 'undefined'
    && window.localStorage.getItem('wodi:debugCelebration') === '1';
}

// ─── Round / prescription helpers ────────────────────────────────────────────

export function getPrescribedRoundCount(exercises: Exercise[], rawText?: string): number | undefined {
  const candidates = [
    rawText,
    ...exercises.flatMap((exercise) => [exercise.name, exercise.prescription]),
  ].filter(Boolean).join('\n');
  const normalized = normalizeIntervalNotation(candidates).replace(/(\d+)\.(\d{2})/g, '$1:$2');
  const intervalMatch = normalized.match(/(?:every\s+)?\d+(?::\d{2})?\s*(?:min(?:ute)?s?)?\s*[x×]\s*(\d+)\s*(?:sets?|rounds?|intervals?)\b/i);
  if (intervalMatch) return parseInt(intervalMatch[1], 10);
  const rftMatch = normalized.match(/\b(\d+)\s*rft\b/i);
  if (rftMatch) return parseInt(rftMatch[1], 10);
  const roundsForTimeMatch = normalized.match(/\b(\d+)\s*rounds?\s+for\s+time\b/i);
  if (roundsForTimeMatch) return parseInt(roundsForTimeMatch[1], 10);
  const exerciseRounds = exercises
    .map((exercise) => exercise.rounds)
    .filter((rounds): rounds is number => typeof rounds === 'number' && rounds > 0);
  if (exerciseRounds.length === 1) return exerciseRounds[0];
  if (exerciseRounds.length > 1 && new Set(exerciseRounds).size === 1) return exerciseRounds[0];
  return undefined;
}

export function getPrescriptionRepeatCount(exercise: Exercise): number | undefined {
  const text = `${exercise.name || ''} ${exercise.prescription || ''}`.replace(/\s+/g, ' ');
  const setsMatch = text.match(/\b(\d+)\s*sets?\b/i);
  if (setsMatch) return parseInt(setsMatch[1], 10);
  const multiplierMatch = text.match(/(?:[xX]|×)\s*(\d+)\s*(?:sets?|rounds?)\b/i);
  if (multiplierMatch) return parseInt(multiplierMatch[1], 10);
  const rftMatch = text.match(/\b(\d+)\s*rft\b/i);
  if (rftMatch) return parseInt(rftMatch[1], 10);
  const roundsMatch = text.match(/\b(\d+)\s*rounds?\b/i);
  if (roundsMatch) return parseInt(roundsMatch[1], 10);
  if (exercise.suggestedRepsPerSet && exercise.suggestedRepsPerSet.length > 0) {
    return exercise.suggestedRepsPerSet.length;
  }
  return exercise.rounds
    || exercise.sets?.filter((set) => set.completed).length
    || exercise.sets?.length
    || undefined;
}

function getNestedRoundsOfMultiplier(exercise?: Exercise | null): number | undefined {
  const text = `${exercise?.prescription || ''} ${exercise?.rawText || ''}`.replace(/\s+/g, ' ');
  const match = text.match(/\b(\d+)\s*rounds?\s+of\b/i);
  if (!match) return undefined;
  const rounds = parseInt(match[1], 10);
  return rounds > 1 ? rounds : undefined;
}

function formatNestedRoundBlueprint(base: string, exercise?: Exercise | null): string {
  const nestedRounds = getNestedRoundsOfMultiplier(exercise);
  if (!nestedRounds || nestedRounds <= 1) return base;
  return `${base} · ${nestedRounds} rounds of`;
}

function getEffectiveMovementRepeatCount(
  exercise: Exercise | null | undefined,
  baseRepeatCount?: number,
): number | undefined {
  const nestedRounds = getNestedRoundsOfMultiplier(exercise);
  const completedSets = exercise?.sets?.filter((set) => set.completed).length || undefined;
  const plannedSets = exercise?.sets?.length || undefined;
  const candidates = [
    baseRepeatCount && nestedRounds ? baseRepeatCount * nestedRounds : undefined,
    completedSets,
    plannedSets,
    baseRepeatCount,
  ].filter((value): value is number => typeof value === 'number' && value > 0);
  return candidates.length > 0 ? Math.max(...candidates) : undefined;
}

export function inferRoundCountFromMovements(
  exercise: Exercise,
  movements: MovementTotal[],
): number | undefined {
  for (const pMov of (exercise.movements || [])) {
    const name = pMov.name.toLowerCase();
    const actual = movements.find((m) => m.name.toLowerCase() === name);
    if (pMov.reps && pMov.reps > 0 && actual?.totalReps && actual.totalReps > 0) {
      const ratio = actual.totalReps / pMov.reps;
      if (Number.isInteger(ratio) && ratio >= 2 && ratio <= 50) return ratio;
    }
    if (pMov.distance && pMov.distance > 0 && actual?.totalDistance && actual.totalDistance > 0) {
      const ratio = actual.totalDistance / pMov.distance;
      if (Number.isInteger(ratio) && ratio >= 2 && ratio <= 50) return ratio;
    }
  }
  return undefined;
}

// How many rounds of a teamSize>1 round-trade WOD were actually completed — for the round
// ledger's filled-vs-pending split. Unlike inferRoundCountFromMovements (which requires a clean
// 2-50 integer ratio, since it's backfilling a missing round count), this floors and clamps, so
// a time-capped WOD that stopped mid-round never reads as having completed its final round.
// actual.totalReps already reflects only what was actually logged, never a full-prescription
// assumption, so this generalizes to any capped/partial finish, not just a complete one.
export function inferCompletedRounds(
  totalRounds: number,
  exercise: Exercise,
  movements: MovementTotal[],
): number {
  let best = 0;
  for (const pMov of exercise.movements || []) {
    const actual = movements.find((m) => m.name.toLowerCase() === pMov.name.toLowerCase());
    if (pMov.reps && pMov.reps > 0 && actual?.totalReps) {
      best = Math.max(best, Math.floor(actual.totalReps / pMov.reps));
    }
  }
  return best > 0 ? Math.min(totalRounds, best) : totalRounds;
}

export function getSectionedMovementRepeatCounts(exercise?: Exercise | null): Map<string, number> | undefined {
  if (!exercise?.sections?.length) return undefined;
  const repeatCounts = new Map<string, number>();
  for (const section of exercise.sections) {
    const repeats = section.sectionType === 'rounds' ? (section.rounds ?? 1) : 1;
    for (const movement of section.movements || []) {
      const key = movement.name.toLowerCase();
      repeatCounts.set(key, (repeatCounts.get(key) || 0) + repeats);
    }
  }
  return repeatCounts.size > 0 ? repeatCounts : undefined;
}

// True when a movement name appears more than once in a flat (non-sectioned) per-round
// movement list — e.g. a run interleaved between every other movement, or a chipper's
// repeated lines. That repetition is real structure the AI preserved on purpose and must
// not be collapsed into a single aggregated row.
function hasIntraRoundRepeat(movements: ParsedMovement[]): boolean {
  const seen = new Set<string>();
  for (const movement of movements) {
    const key = movement.name.toLowerCase();
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}

function getSectionedRoundTradeCount(exercise?: Exercise | null): number | undefined {
  if (!exercise?.sections?.length) return undefined;
  const repeatedRoundTotal = exercise.sections.reduce((sum, section) => {
    const rounds = section.sectionType === 'rounds' ? (section.rounds ?? 1) : 0;
    return rounds > 1 ? sum + rounds : sum;
  }, 0);
  if (repeatedRoundTotal > 1) return repeatedRoundTotal;

  const total = exercise.sections.reduce((sum, section) => (
    section.sectionType === 'rounds' ? sum + (section.rounds ?? 1) : sum
  ), 0);
  return total > 1 ? total : undefined;
}

function inferPartnerRoundLedgerCompletedRounds(totalRounds: number, exercise: Exercise, movements: MovementTotal[]): number {
  const hasFinishedTime = exercise.sets?.some((set) => set.completed && (set.time ?? 0) > 0);
  if (hasFinishedTime) return totalRounds;
  return inferCompletedRounds(totalRounds, exercise, movements);
}

export function getSectionedForTimeLabel(exercise?: Exercise | null): string | undefined {
  const roundSections = exercise?.sections?.filter((section) => section.sectionType === 'rounds') || [];
  if (roundSections.length <= 1) return undefined;

  const isProgressive = roundSections.every((s) => (s.rounds ?? 1) === 1)
    && roundSections.some((s, i) => i > 0 && (s.movements ?? []).length !== (roundSections[i - 1].movements ?? []).length);
  if (isProgressive) return `progressive ${roundSections.length}-round chipper`;

  const movCounts = roundSections.map((s) => (s.movements ?? []).length);
  const isPyramid = roundSections.every((s) => (s.rounds ?? 1) === 1)
    && movCounts[0] > 0
    && movCounts.every((c) => c === movCounts[0])
    && roundSections.some((s, i) => i > 0 && (s.movements ?? []).some((mov, j) => {
      const prevMov = (roundSections[i - 1].movements ?? [])[j];
      return !!prevMov && (mov.reps !== prevMov.reps || mov.distance !== prevMov.distance || mov.calories !== prevMov.calories);
    }));
  if (isPyramid) return `${roundSections.length}-round pyramid for time`;

  const roundCounts = roundSections
    .map((section) => section.rounds)
    .filter((rounds): rounds is number => typeof rounds === 'number' && rounds > 0);
  if (roundCounts.length === roundSections.length && new Set(roundCounts).size === 1) {
    return `${roundSections.length} x ${roundCounts[0]} rounds for time`;
  }
  return `${roundSections.length} sections for time`;
}

// ─── Ladder helpers ───────────────────────────────────────────────────────────

export function getLadderRungValue(reps: number[], idx: number): number {
  if (idx < reps.length) return reps[idx];
  const step = reps.length >= 2 ? reps[reps.length - 1] - reps[reps.length - 2] : 2;
  return reps[reps.length - 1] + step * (idx - reps.length + 1);
}

/**
 * Per-implement weight to display for a ladder movement — prefers what was actually logged
 * over the prescribed Rx, since this is the "what I did" layer. MovementTotal.weight for a
 * twin-implement movement is the EFFECTIVE weight used for volume math (per-implement × 2), so
 * it's divided back down to the per-dumbbell/kettlebell value that was actually entered.
 */
function deriveDisplayWeight(
  prescribed: { weight?: number; implementCount?: 1 | 2 } | undefined,
  actual: MovementTotal | undefined,
): number | undefined {
  if (actual?.weight && actual.weight > 0) {
    return prescribed?.implementCount === 2 ? actual.weight / 2 : actual.weight;
  }
  return prescribed?.weight && prescribed.weight > 0 ? prescribed.weight : undefined;
}

/**
 * Ascending-ladder AMRAP section: ONE bar-chart track (rendered by the poster skin — see
 * ArtifactRow.ladderTrack) showing the climb, with the scaling movement names + weight listed
 * once beside it — never the movement names repeated once per round, and never a flat "2→12"
 * range that hides the per-round climb. The fixed per-round add-on (e.g. burpees) gets its own
 * normal row via buildCelebrationMovementRow, exactly like any other movement on the poster.
 */
function splitLadderMovements(exercise: Exercise): { scaling: ParsedMovement[]; fixed: ParsedMovement[] } {
  return {
    scaling: (exercise.movements ?? []).filter((m) => m.perRound !== false),
    fixed: (exercise.movements ?? []).filter((m) => m.perRound === false),
  };
}

function buildLadderRows(exercise: Exercise, movements: MovementTotal[]): ArtifactRow[] | undefined {
  const ladderReps = exercise.ladderReps;
  if (!ladderReps || ladderReps.length === 0) return undefined;

  const { scaling: scalingMovements, fixed: fixedMovements } = splitLadderMovements(exercise);
  if (scalingMovements.length === 0) return undefined;

  let weight: number | undefined;
  let unit = 'kg';
  let weightSuffix = '';
  for (const mov of scalingMovements) {
    const actual = findBreakdownForParsedMovement(mov, movements);
    const prescribedWeight = mov.rxWeights?.male || mov.rxWeights?.female;
    const w = deriveDisplayWeight({ weight: prescribedWeight, implementCount: mov.implementCount }, actual);
    if (w != null) {
      weight = w;
      unit = actual?.unit === 'lb' ? 'lb' : (mov.rxWeights?.unit ?? 'kg');
      weightSuffix = mov.implementCount === 2 ? ' each' : '';
      break;
    }
  }

  const step = exercise.ladderStep ?? 0;
  const partial = exercise.ladderPartial ?? 0;

  // Per-round increment — stated explicitly so the climb rule is read, not guessed.
  const cadence = ladderReps.length >= 2 ? ladderReps[1] - ladderReps[0] : undefined;
  const cadenceLabel = cadence != null ? `+${cadence} REPS EVERY ROUND` : undefined;

  const fixedRows: ArtifactRow[] = fixedMovements.map((mov) => {
    const actual = findBreakdownForParsedMovement(mov, movements);
    const perRound = mov.reps ?? mov.calories ?? mov.distance ?? undefined;
    const unitLabel = mov.reps != null ? '' : mov.calories != null ? ' CAL' : mov.distance != null ? 'M' : '';
    return {
      primary: '',
      name: formatRepMovementNameForPoster(mov.name, mov.reps),
      loadNote: perRound != null ? `${perRound}${unitLabel} EVERY ROUND` : undefined,
      accent: (actual?.color ?? 'magenta') as ArtifactRow['accent'],
    };
  });

  const trackRow: ArtifactRow = {
    primary: '',
    name: scalingMovements.map((m) => formatRepMovementNameForPoster(m.name, m.reps ?? ladderReps[0])).join(' + '),
    loadNote: weight != null ? `${weight}${unit}${weightSuffix}` : undefined,
    accent: 'yellow',
    ladderTrack: { reps: ladderReps, step, partial: partial > 0 ? partial : undefined, cadence: cadenceLabel },
  };

  return [trackRow, ...fixedRows];
}

function buildDescendingLadderRows(
  exercise: Exercise,
  movements: MovementTotal[],
  reps: number[],
  completed: number,
): ArtifactRow[] {
  const prescribedMovements = exercise.sections?.length
    ? exercise.sections.flatMap((section) => section.movements || [])
    : (exercise.movements || []);
  const ladderMovements = prescribedMovements.filter((movement) =>
    movement.reps != null && movement.distance == null && movement.calories == null,
  );
  const rowMovements = ladderMovements.length > 0 ? ladderMovements : prescribedMovements;
  const names = rowMovements
    .map((movement) => formatRepMovementNameForPoster(movement.name, reps[0] ?? movement.reps))
    .filter(Boolean);

  const weightedMovement = rowMovements.find((movement) => movement.inputType === 'weight' || movement.rxWeights);
  const weightedTotal = weightedMovement
    ? movements.find((movement) =>
        normalizeStampMovementName(movement.name) === normalizeStampMovementName(weightedMovement.name)
        || normalizeStampMovementName(movement.originalMovement ?? '') === normalizeStampMovementName(weightedMovement.name),
      )
    : undefined;
  const loggedWeight = weightedTotal?.weight;
  const rxWeight = weightedMovement?.rxWeights?.male ?? weightedMovement?.rxWeights?.female;
  const weight = loggedWeight ?? rxWeight;
  const unit = weightedTotal?.unit === 'lb' ? 'lb' : (weightedMovement?.rxWeights?.unit ?? 'kg');

  return [{
    primary: reps.join('-'),
    name: names.join(' + ') || exercise.name,
    loadNote: weight && weight > 0 ? `${weight}${unit}` : undefined,
    accent: weight && weight > 0 ? 'yellow' : 'magenta',
    ladderTrack: { reps, step: completed, complete: true },
  }];
}

export function parseDescLadderScheme(
  exercise: Exercise,
  /** Shared workout-level rawText — only safe when the caller knows this exercise IS the whole
   * workout. Prefer exercise.rawText (this block's own scoped slice) whenever it's present;
   * for a multi-exercise workout, callers should pass undefined here rather than the shared
   * blob, so one part's bracket notation can never match against a sibling part. */
  rawText?: string,
): number[] | undefined {
  if (exercise.suggestedRepsPerSet && exercise.suggestedRepsPerSet.length >= 3) {
    return exercise.suggestedRepsPerSet;
  }
  const scopedRawText = exercise.rawText || rawText;
  const searchText = [scopedRawText, exercise.prescription, exercise.name].filter(Boolean).join(' ');
  const match = searchText.match(/\[(\d+(?:\s*[-–]\s*\d+){2,})\]/);
  if (!match) return undefined;
  const nums = match[1].split(/\s*[-–]\s*/).map(Number).filter((n) => n > 0);
  return nums.length >= 3 ? nums : undefined;
}

// ─── Barbell complex detection ────────────────────────────────────────────────

function parseForTimeRepScheme(
  exercise: Exercise,
  rawText?: string,
): number[] | undefined {
  const parsed = parseDescLadderScheme(exercise, rawText);
  if (parsed) return parsed;

  const scopedRawText = exercise.rawText || rawText;
  const searchText = [scopedRawText, exercise.prescription, exercise.name].filter(Boolean).join(' ');
  const matches = Array.from(searchText.matchAll(/\b(\d+(?:\s*[-\u2013]\s*\d+){2,})\b/g));
  for (const match of matches) {
    const nums = match[1].split(/\s*[-\u2013]\s*/).map(Number).filter((n) => n > 0);
    const isMonotonic = nums.every((n, i) => i === 0 || n < nums[i - 1])
      || nums.every((n, i) => i === 0 || n > nums[i - 1]);
    if (nums.length >= 3 && isMonotonic) return nums;
  }
  return undefined;
}

export const BARBELL_PATTERNS = ['clean', 'jerk', 'snatch', 'press', 'deadlift', 'squat', 'thruster', 'pull'];

const BARBELL_ABBREVS: Record<string, string> = {
  'power clean': 'PC', 'hang power clean': 'HPC', 'squat clean': 'SC',
  'hang clean': 'HC', 'clean': 'CL', 'push jerk': 'PJ', 'split jerk': 'SJ',
  'push press': 'PP', 'strict press': 'SP', 'shoulder press': 'SP',
  'power snatch': 'PS', 'hang snatch': 'HS', 'snatch': 'SN',
  'overhead squat': 'OHS', 'front squat': 'FS', 'back squat': 'BS',
  'deadlift': 'DL', 'sumo deadlift': 'SDL', 'thruster': 'THR',
};

function abbreviateBarbellName(name: string): string {
  const lower = name.toLowerCase();
  for (const [pattern, abbr] of Object.entries(BARBELL_ABBREVS)) {
    if (lower === pattern || lower.endsWith(pattern) || lower.startsWith(pattern)) return abbr;
  }
  return name.split(/\s+/).map((w) => w[0]?.toUpperCase() ?? '').join('');
}

export interface BarbellComplex {
  complexName: string;
  abbreviatedName: string;
  weight: number;
  weightEnd?: number;
  weightProgression?: number[];
  unit: string;
  repsPerRound: number;
  totalRounds: number;
}

export function detectBarbellComplex(movements: MovementTotal[], rounds: number): BarbellComplex | null {
  if (movements.length < 2) return null;
  if (!movements.every((m) =>
    (m.color === 'yellow' || (m.weight && m.weight > 0) || (m.weightProgression && m.weightProgression.length > 0))
    && !m.totalCalories
    && !m.totalDistance,
  )) return null;
  if (!movements.every((m) => BARBELL_PATTERNS.some((p) => m.name.toLowerCase().includes(p)))) return null;

  const weights = movements.map((m) => m.weight || (m.weightProgression?.length ? Math.max(...m.weightProgression) : 0));
  const baseWeight = weights.find((w) => w > 0) ?? 0;
  if (baseWeight <= 0) return null;
  const tolerance = movements[0].unit === 'lb' ? 5 : 2.5;
  if (!weights.every((w) => w <= 0 || Math.abs(w - baseWeight) <= tolerance)) return null;

  const effectiveRounds = rounds > 1 ? rounds : 1;
  const perRoundReps = movements.map((m) => {
    const totalReps = m.totalReps || 0;
    return effectiveRounds > 1 ? Math.round(totalReps / effectiveRounds) : totalReps;
  });
  const maxPerRound = Math.max(...perRoundReps);
  if (maxPerRound === 0) return null;

  const progSource = movements.find((m) => m.weightProgression && m.weightProgression.length > 1);
  const weightProg = progSource?.weightProgression;
  const startWeight = weightProg ? weightProg[0] : baseWeight;
  const peakWeight = weightProg ? Math.max(...weightProg) : baseWeight;

  return {
    complexName: movements.map((m) => m.name).join(' + '),
    abbreviatedName: movements.map((m) => abbreviateBarbellName(m.name)).join('+'),
    weight: startWeight,
    weightEnd: peakWeight !== startWeight ? peakWeight : undefined,
    weightProgression: weightProg,
    unit: movements[0].unit === 'lb' ? 'lb' : 'kg',
    repsPerRound: perRoundReps[0],
    totalRounds: rounds > 1 ? rounds : (movements[0].totalReps || rounds),
  };
}

// ─── Movement finders ─────────────────────────────────────────────────────────

export function findMovementTotal(
  movements: MovementTotal[],
  movName: string,
  exerciseIndex?: number,
): MovementTotal | undefined {
  const lower = movName.toLowerCase();
  if (exerciseIndex !== undefined) {
    const scoped = movements.find(
      (m) => m.exerciseIndex === exerciseIndex
        && (m.name.toLowerCase() === lower || m.originalMovement?.toLowerCase() === lower),
    );
    if (scoped) return scoped;
  }
  return movements.find(
    (m) => m.name.toLowerCase() === lower || m.originalMovement?.toLowerCase() === lower,
  );
}

export function findBreakdownForParsedMovement(
  movement: NonNullable<Exercise['movements']>[number],
  breakdownMovements: MovementTotal[],
): MovementTotal | undefined {
  const target = movement.name.toLowerCase();
  return breakdownMovements.find((candidate) => {
    const name = candidate.name.toLowerCase();
    const original = candidate.originalMovement?.toLowerCase();
    return name === target || original === target;
  });
}

// ─── Repair undercounted breakdown ───────────────────────────────────────────

export function repairUndercountedBreakdown(
  breakdown: WorkloadBreakdown,
  exercises: Exercise[],
): WorkloadBreakdown {
  const debug = shouldLogCelebrationDebug();
  const movements = breakdown.movements.map((movement) => ({ ...movement }));
  const byName = new Map<string, MovementTotal>();
  movements.forEach((movement) => byName.set(movement.name.toLowerCase(), movement));
  let changed = false;

  for (const exercise of exercises) {
    if (exercise.sections && exercise.sections.length > 0) continue;
    const repeats = getEffectiveMovementRepeatCount(exercise, getPrescriptionRepeatCount(exercise));
    if (!repeats || repeats <= 1 || !exercise.movements || exercise.movements.length === 0) continue;
    const repScheme = exercise.suggestedRepsPerSet && exercise.suggestedRepsPerSet.length > 1
      ? exercise.suggestedRepsPerSet
      : undefined;

    for (const movement of exercise.movements) {
      const target = byName.get(movement.name.toLowerCase());
      if (!target) continue;

      const isBuyInCashOut = movement.role === 'buy_in'
        || movement.role === 'cash_out'
        || movement.perRound === false
        || movement.countingMode === 'once'
        || /^(cash[-\s]?out|buy[-\s]?in)\s*:/i.test(movement.name);
      if (isBuyInCashOut) continue;

      // Station-rotation movements run on only a subset of the intervals (3 of 6 in an
      // alternating two-station AMRAP), so reps × prescription-round-count over-counts them —
      // their breakdown totals already carry the correct per-visit multiplier from save time.
      // Gate on STRUCTURAL markers only, never countingMode: a post-processor bug (fixed
      // 2026-07-06) stamped per_station_visit onto plain-AMRAP movements in multi-part
      // sessions, collapsing their save-time totals to one round — exactly the undercount
      // this repair exists to heal.
      if (movement.stationLabel != null || movement.stationIndex != null) continue;

      const isVariableSchemeMovement = !!(
        repScheme
        && movement.reps
        && movement.reps === repScheme[0]
      );
      const expectedReps = isVariableSchemeMovement
        ? repScheme.reduce((sum, reps) => sum + reps, 0)
        : movement.reps && movement.reps > 0
          ? Math.round(movement.reps * repeats)
          : undefined;
      const expectedDistance = movement.distance && movement.distance > 0
        ? Math.round(movement.distance * repeats)
        : undefined;
      const expectedCalories = movement.calories && movement.calories > 0
        ? Math.round(movement.calories * repeats)
        : undefined;

      const before = {
        totalReps: target.totalReps,
        totalDistance: target.totalDistance,
        totalCalories: target.totalCalories,
      };

      if (expectedReps && (!target.totalReps || target.totalReps < expectedReps)) {
        target.totalReps = expectedReps;
        changed = true;
      }
      if (expectedDistance && (!target.totalDistance || target.totalDistance < expectedDistance)) {
        target.totalDistance = expectedDistance;
        changed = true;
      }
      if (expectedCalories && (!target.totalCalories || target.totalCalories < expectedCalories)) {
        target.totalCalories = expectedCalories;
        changed = true;
      }

      if (debug && (
        before.totalReps !== target.totalReps
        || before.totalDistance !== target.totalDistance
        || before.totalCalories !== target.totalCalories
      )) {
        console.log('[CelebrationDebug] repaired undercounted movement', {
          exercise: exercise.name,
          movement: movement.name,
          repeats,
          before,
          after: { totalReps: target.totalReps, totalDistance: target.totalDistance, totalCalories: target.totalCalories },
        });
      }
    }
  }

  if (!changed) return breakdown;

  const grandTotalReps = movements.reduce((sum, movement) => sum + (movement.totalReps || 0), 0);
  const grandTotalVolume = movements.reduce((sum, movement) => (
    movement.weight && movement.weight > 0 && movement.totalReps && movement.totalReps > 0
      ? sum + movement.weight * movement.totalReps
      : sum
  ), 0);
  const grandTotalDistance = movements.reduce((sum, movement) => sum + (movement.totalDistance || 0), 0);
  const grandTotalCalories = movements.reduce((sum, movement) => sum + (movement.totalCalories || 0), 0);

  return {
    ...breakdown,
    movements,
    grandTotalReps: Math.round(grandTotalReps),
    grandTotalVolume: Math.round(grandTotalVolume),
    grandTotalDistance: grandTotalDistance > 0 ? Math.round(grandTotalDistance) : breakdown.grandTotalDistance,
    grandTotalCalories: grandTotalCalories > 0 ? Math.round(grandTotalCalories) : breakdown.grandTotalCalories,
  };
}

// ─── Vibe / format labels ─────────────────────────────────────────────────────

export function getRewardVibeLabel(
  format: WorkoutFormat | undefined,
  totalReps: number,
  durationMinutes: number,
  totalDistance: number,
  totalCalories: number,
  hasLadder?: boolean,
): string {
  if (hasLadder) return 'THE CLIMB';
  if (format === 'strength') return 'STRENGTH';
  if (durationMinutes > 0 && durationMinutes <= 12) return 'SPRINT';
  if (totalCalories >= 80 || totalDistance >= 2000) return 'ENGINE';
  if (totalReps >= 220 || format === 'amrap') return 'GRIND';
  if (format === 'intervals' || format === 'emom' || format === 'amrap_intervals') return 'SURGE';
  return 'LOCKED IN';
}

export function inferWorkoutFormatForExercise(ex: Exercise, globalFormat?: WorkoutFormat): WorkoutFormat | undefined {
  const rx = normalizeIntervalNotation(`${ex.name || ''} ${ex.prescription || ''}`).toLowerCase();
  if (ex.type === 'strength') return 'strength';
  if (/\b(?:teams?\s+of|i\s*go\s*y(?:ou|o?u?)\s*go|igug|partner|in\s+pairs?)\b/i.test(rx)) return 'intervals';
  if (/amrap/i.test(rx) && /every\s+\d+:\d+|e\d+mom|emom/i.test(rx)) return 'amrap_intervals';
  if (/amrap/i.test(rx)) return 'amrap';
  if (/for\s*time|\brft\b|\d+\s*rounds?\s*for\s*time/i.test(rx)) return 'for_time';
  if (/every\s+\d+:\d+|e\d+mom|emom/i.test(rx)) return 'emom';
  if (/intervals?/i.test(rx)) return 'intervals';
  return globalFormat;
}

export function inferTeamSizeFromText(text?: string): number | undefined {
  if (!text) return undefined;
  const teamOf = text.match(/\bteams?\s+of\s+(\d+)\b/i)
    || text.match(/\bgroups?\s+of\s+(\d+)\b/i)
    || text.match(/\b(\d+)[-\s]*(?:person|people|athlete)\b/i);
  if (teamOf) {
    const size = parseInt(teamOf[1], 10);
    if (size > 1 && size <= 12) return size;
  }
  if (/\b(?:in\s+pairs?|partner)\b/i.test(text)) return 2;
  return undefined;
}

// ─── Engine / sticker stamps ──────────────────────────────────────────────────

export function getEngineThresholdStamp(
  movements: MovementTotal[],
  config: CelebrationStickerConfig,
): HighlightStampData | null {
  const running = [...movements]
    .filter((m) => /run|running/i.test(m.name) && (m.totalDistance || 0) > config.runDistanceStickerMinMeters)
    .sort((a, b) => (b.totalDistance || 0) - (a.totalDistance || 0))[0];
  if (running) {
    return { title: 'RUN DISTANCE', value: formatDistanceValue(running.totalDistance || 0).toUpperCase(), note: running.name.toUpperCase(), color: 'yellow', rotation: -2 };
  }

  const rowing = [...movements]
    .filter((m) => /row|rowing|rower/i.test(m.name) && (m.totalDistance || 0) > config.rowDistanceStickerMinMeters)
    .sort((a, b) => (b.totalDistance || 0) - (a.totalDistance || 0))[0];
  if (rowing) {
    return { title: 'ROW DISTANCE', value: formatDistanceValue(rowing.totalDistance || 0).toUpperCase(), note: rowing.name.toUpperCase(), color: 'yellow', rotation: -2 };
  }

  const biking = [...movements]
    .filter((m) => /bike|cycling|cycle|echo|assault|airbike|erg bike/i.test(m.name) && (m.totalDistance || 0) > config.bikeDistanceStickerMinMeters)
    .sort((a, b) => (b.totalDistance || 0) - (a.totalDistance || 0))[0];
  if (biking) {
    return { title: 'BIKE DISTANCE', value: formatDistanceValue(biking.totalDistance || 0).toUpperCase(), note: biking.name.toUpperCase(), color: 'yellow', rotation: -2 };
  }

  const calories = [...movements]
    .filter((m) => (m.totalCalories || 0) > config.calorieStickerMinCalories)
    .sort((a, b) => (b.totalCalories || 0) - (a.totalCalories || 0))[0];
  if (calories) {
    return { title: 'CAL BURN', value: `${calories.totalCalories} CAL`, note: calories.name.toUpperCase(), color: 'yellow', rotation: -2 };
  }

  return null;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function normalizeStampMovementName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

type ExerciseWithMovementResultMaps = Exercise & {
  movementWeights?: Record<string, number>;
  implementCounts?: Record<string, number>;
};

function lookupMovementResultMapValue<T>(
  map: Record<string, T> | undefined,
  movementName: string,
): T | undefined {
  if (!map) return undefined;
  return map[movementName]
    ?? map[normalizeStampMovementName(movementName)]
    ?? Object.entries(map).find(([key]) =>
      normalizeStampMovementName(key) === normalizeStampMovementName(movementName),
    )?.[1];
}

function resolveMovementEnteredLoad(
  movement: MovementTotal,
  exercises: Exercise[],
): { weight: number; unit?: string } | null {
  const movementKey = normalizeStampMovementName(movement.name);
  const originalKey = movement.originalMovement
    ? normalizeStampMovementName(movement.originalMovement)
    : undefined;

  for (const exercise of exercises as ExerciseWithMovementResultMaps[]) {
    const parsedMovements = exercise.sections?.length
      ? exercise.sections.flatMap((section) => section.movements || [])
      : (exercise.movements || []);

    const parsed = parsedMovements.find((candidate) => {
      const candidateKey = normalizeStampMovementName(candidate.name);
      return candidateKey === movementKey || candidateKey === originalKey;
    });
    if (!parsed) continue;

    const enteredWeight = lookupMovementResultMapValue(exercise.movementWeights, parsed.name)
      ?? lookupMovementResultMapValue(exercise.movementWeights, movement.name);
    const prescribedWeight = parsed.rxWeights?.male ?? parsed.rxWeights?.female;
    const perImplementWeight = enteredWeight ?? prescribedWeight;
    if (!perImplementWeight || perImplementWeight <= 0) continue;

    const enteredImplementCount = lookupMovementResultMapValue(exercise.implementCounts, parsed.name)
      ?? lookupMovementResultMapValue(exercise.implementCounts, movement.name);
    const implementCount = enteredImplementCount
      ?? movement.implementCount
      ?? parsed.implementCount
      ?? 1;

    return {
      weight: implementCount > 1 ? perImplementWeight * implementCount : perImplementWeight,
      unit: movement.unit ?? parsed.rxWeights?.unit,
    };
  }

  return null;
}

export function getFlexHighlightStamp(
  movements: MovementTotal[],
  achievements?: Array<{ type: string; movement?: string; value?: number }>,
  exercises: Exercise[] = [],
  format?: WorkoutFormat,
  durationMinutes: number = 0,
  isMetconContext?: boolean,
  stickerConfig: CelebrationStickerConfig = DEFAULT_CELEBRATION_STICKER_CONFIG,
): HighlightStampData | null {
  if (!movements || movements.length === 0) return null;

  const prAchievement = achievements?.find((a) =>
    a.type === 'pr' && a.movement && a.value
    && (() => {
      const achievementName = normalizeStampMovementName(a.movement!);
      return movements.some((m) => {
        const movName = normalizeStampMovementName(m.name);
        return movName === achievementName || movName.includes(achievementName) || achievementName.includes(movName);
      });
    })(),
  );
  if (prAchievement?.movement && prAchievement.value) {
    return { title: '★ NEW PR ★', value: formatStampLoad(prAchievement.value), note: prAchievement.movement.toUpperCase(), color: 'yellow', rotation: -3 };
  }

  const emomStickerHasCardio = format === 'emom'
    && movements.some((m) => (m.totalCalories || 0) > 0 || (m.totalDistance || 0) > 0);
  const isConditioningStickerContext = isMetconContext
    || emomStickerHasCardio
    || format === 'amrap'
    || format === 'amrap_intervals'
    || format === 'for_time'
    || format === 'intervals'
    || format === 'tabata';
  if (isConditioningStickerContext) {
    const conditioningEngineThreshold = getEngineThresholdStamp(movements, stickerConfig);
    if (conditioningEngineThreshold) return conditioningEngineThreshold;
  }

  const peakWeight = (m: MovementTotal) => {
    const movementLoad = resolveMovementEnteredLoad(m, exercises);
    if (movementLoad) return movementLoad.weight;
    if (isConditioningStickerContext) return m.weight || 0;
    return m.weightProgression && m.weightProgression.length > 0
      ? Math.max(...m.weightProgression)
      : (m.weight || 0);
  };
  const peakUnit = (m: MovementTotal) =>
    resolveMovementEnteredLoad(m, exercises)?.unit ?? m.unit;

  const heaviest = [...movements]
    .filter((m) => peakWeight(m) > 0)
    .sort((a, b) => peakWeight(b) - peakWeight(a))[0];
  const hasStrengthBlock = !isMetconContext && (format === 'strength' || format === 'emom' || exercises.some((e) => e.type === 'strength'));
  if (!isConditioningStickerContext && !isMetconContext && heaviest && (peakWeight(heaviest) >= 60 || hasStrengthBlock)) {
    const stampRounds = exercises.length === 1
      ? (exercises[0]?.sets?.filter((s) => s.completed)?.length || exercises[0]?.sets?.length || 1)
      : 1;
    const complex = detectBarbellComplex(movements, stampRounds);
    if (complex) {
      const complexMovementNames = complex.complexName.toLowerCase();
      const complexPR = achievements?.find((a) =>
        a.type === 'pr' && a.movement && complexMovementNames.includes(a.movement.toLowerCase()),
      );
      const peakW = complex.weightEnd ?? complex.weight;
      const peakLabel = formatStampLoad(peakW, complex.unit);
      if (complexPR) {
        return { title: '★ NEW PR ★', value: `${peakLabel} COMPLEX`, note: complex.abbreviatedName, color: 'magenta', rotation: 2, variant: 'complex' };
      }
      const weightLabel = complex.weightEnd
        ? `${formatStampLoad(complex.weight, complex.unit)}→${peakLabel}`
        : peakLabel;
      return { title: 'HEAVIEST HIT', value: `${weightLabel} COMPLEX`, note: complex.abbreviatedName, color: 'magenta', rotation: 2, variant: 'complex' };
    }
    return { title: 'HEAVIEST HIT', value: formatStampLoad(peakWeight(heaviest), peakUnit(heaviest)), note: heaviest.name.toUpperCase(), color: 'yellow', rotation: -3 };
  }

  const engineThreshold = getEngineThresholdStamp(movements, stickerConfig);
  if (engineThreshold) return engineThreshold;

  const workhorseScore = (m: MovementTotal): number => {
    const wtReps = (m.totalReps || 0) * Math.max(1, m.weight || 0);
    const calEq = (m.totalCalories || 0) * 10;
    const distEq = (m.totalDistance || 0) * 0.5;
    return Math.max(wtReps, calEq, distEq);
  };

  const workhorse = [...movements]
    .filter((m) => workhorseScore(m) > 0)
    .sort((a, b) => workhorseScore(b) - workhorseScore(a))[0];

  if (workhorse) {
    const value = workhorse.totalCalories
      ? `${workhorse.totalCalories} CAL`
      : workhorse.totalDistance
        ? formatDistanceValue(workhorse.totalDistance).toUpperCase()
        : `${workhorse.totalReps} REPS`;
    return { title: 'WORKHORSE', value, note: workhorse.name.toUpperCase(), color: 'magenta', rotation: 2.5 };
  }

  const distanceBased = [...movements]
    .filter((m) => (m.totalDistance || 0) > 0)
    .sort((a, b) => (b.totalDistance || 0) - (a.totalDistance || 0))[0];
  const calorieFallback = [...movements]
    .filter((m) => (m.totalCalories || 0) > 0)
    .sort((a, b) => (b.totalCalories || 0) - (a.totalCalories || 0))[0];
  const pureEngine = movements.every((m) =>
    (m.totalDistance || 0) > 0 || (m.totalCalories || 0) > 0 || (m.totalTime || 0) > 0,
  );
  if (pureEngine || distanceBased || calorieFallback || durationMinutes > 0) {
    if (format === 'for_time' && durationMinutes > 0) return null;
    const sprintLabel = durationMinutes > 0 && durationMinutes <= 12;
    return {
      title: sprintLabel ? 'SPRINT' : 'THE GRIND',
      value: durationMinutes > 0
        ? fmtTimeSocial(Math.max(0, Math.round(durationMinutes * 60)))
        : calorieFallback
          ? `${calorieFallback.totalCalories} CAL`
          : formatDistanceValue(distanceBased?.totalDistance || 0).toUpperCase(),
      note: durationMinutes > 0
        ? (format === 'for_time' ? 'RFT' : 'UNBROKEN')
        : (calorieFallback?.name || distanceBased?.name || 'ENGINE').toUpperCase(),
      color: 'magenta',
      rotation: -2,
    };
  }

  return null;
}

// ─── Prescription movement line ───────────────────────────────────────────────

function formatPrescriptionMovementLine(movements: NonNullable<Exercise['movements']>): string | undefined {
  const parts = movements
    .map((movement) => {
      const qty = movement.reps != null
        ? `${movement.reps}`
        : movement.calories != null
          ? `${movement.calories} CAL`
          : movement.distance != null
            ? (movement.distance >= 1000 ? `${(movement.distance / 1000).toFixed(1)}KM` : `${movement.distance}M`)
            : '';
      const displayName = movement.reps != null && movement.reps !== 1
        ? pluralizeMovementLabel(movement.name)
        : movement.name;
      const name = formatStickerMovementName(displayName);
      return [qty, name].filter(Boolean).join(' ');
    })
    .filter(Boolean);
  return parts.length ? parts.join(' • ') : undefined;
}

// ─── Celebration movement row builder ────────────────────────────────────────

function getMovementDisplayNameFromContext(
  movement: Pick<ParsedMovement, 'name' | 'implementCount'>,
  contextText?: string,
): string {
  const name = movement.name;
  if (!contextText || /\b(?:db|dumbbell|kb|kettlebell|twin|double)\b/i.test(name)) {
    return name;
  }
  const nameWords = name.toLowerCase().split(/\s+/).filter(Boolean);
  const clauses = contextText.split(/[\n,;]+/).map((c) => c.trim()).filter(Boolean);
  const matchingClause = clauses.find((clause) => {
    const lower = clause.toLowerCase();
    return nameWords.every((word) => new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}s?\\b`).test(lower));
  });
  if (!matchingClause) return name;
  const escapedName = nameWords
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('\\s+');
  const compoundMatch = matchingClause.match(new RegExp(`\\b(${escapedName})(\\s*(?:&|\\+|and|to)\\s+[a-z][a-z\\s-]*)`, 'i'));
  if (compoundMatch) {
    const suffix = compoundMatch[2]
      .replace(/\s+(?:@|\d+(?:\.\d+)?\s*(?:kg|lb|lbs)?|rx|tc|cap).*$/i, '')
      .trim();
    if (suffix) {
      const displaySuffix = suffix
        .toLowerCase()
        .replace(/\b[a-z]/g, (char) => char.toUpperCase())
        .replace(/\bAnd\b/g, 'and')
        .replace(/\bTo\b/g, 'to');
      return `${name}${suffix}`
        .replace(suffix, displaySuffix)
        .replace(/\s+/g, ' ')
        .trim();
    }
  }
  const source = matchingClause.toLowerCase();
  const hasDb = /\b(?:db'?s?|dumbbells?)\b/i.test(source);
  const hasKb = /\b(?:kb'?s?|kettlebells?)\b/i.test(source);
  if (!hasDb && !hasKb) return name;
  const isPair = movement.implementCount === 2 || /\b(?:twin|double|pair|two|2x|2\s*x)\b/i.test(source);
  const equipment = hasDb ? 'DB' : 'KB';
  const prefix = isPair ? `Twin ${equipment}` : equipment;
  return `${prefix} ${name}`;
}

function buildCelebrationMovementRow(params: {
  movementName: string;
  prescribed?: { reps?: number; distance?: number; calories?: number; weight?: number; implementCount?: 1 | 2 };
  actual?: MovementTotal;
  repeatCount?: number;
  isLadder?: boolean;
  isStrength?: boolean;
  suppressCalorieTotal?: boolean;
  suppressDistanceTotal?: boolean;
  partnerSplit?: 'reps' | 'rounds';
}): ArtifactRow {
  const { movementName, prescribed, actual, repeatCount, isStrength, suppressCalorieTotal, suppressDistanceTotal, isLadder, partnerSplit } = params;
  const weight = prescribed?.implementCount === 2 && prescribed.weight
    ? prescribed.weight
    : actual?.weight ?? prescribed?.weight;
  const weightEachSuffix = prescribed?.implementCount === 2 ? ' each' : '';
  const unit = actual?.unit === 'lb' ? 'lb' : 'kg';
  const unitUpper = unit.toUpperCase();
  const hasWeight = (weight || 0) > 0;
  let accent: ArtifactRow['accent'] = hasWeight ? 'yellow' : (actual?.color || 'magenta');
  const subNoteParts: string[] = [];
  const totalLabel = (value: number, u?: string) => `${value}${u ? ` ${u}` : ''} total`;

  const perRoundReps = prescribed?.reps || (
    !isLadder && repeatCount && repeatCount > 1 && actual?.totalReps
      ? Math.round(actual.totalReps / repeatCount)
      : !isLadder ? actual?.totalReps : undefined
  );
  const substitutedDistance = actual?.wasSubstituted
    ? actual.distancePerRep || (
      actual.totalDistance && repeatCount && repeatCount > 1 && prescribed?.distance
        && actual.totalDistance > prescribed.distance * repeatCount
        ? Math.round(actual.totalDistance / repeatCount)
        : actual?.totalDistance
    )
    : undefined;
  const perRoundDistance = actual?.distancePerRep
    || prescribed?.distance
    || substitutedDistance
    || (
      actual?.wasSubstituted && repeatCount && repeatCount > 1 && actual?.totalDistance
        ? actual.totalDistance
        : repeatCount && repeatCount > 1 && actual?.totalDistance
          ? Math.round(actual.totalDistance / repeatCount)
          : actual?.totalDistance
    );
  const perRoundCalories = prescribed?.calories || (
    actual?.wasSubstituted && repeatCount && repeatCount > 1 && actual?.totalCalories
      ? actual.totalCalories
      : repeatCount && repeatCount > 1 && actual?.totalCalories
        ? Math.round(actual.totalCalories / repeatCount)
        : actual?.totalCalories
  );

  const totalReps = actual?.totalReps
    || (repeatCount && repeatCount > 1 && perRoundReps ? perRoundReps * repeatCount : undefined);
  const totalDistance = actual?.totalDistance && actual.totalDistance > 0
    ? actual.totalDistance
    : (perRoundDistance && repeatCount && repeatCount > 1 ? perRoundDistance * repeatCount : perRoundDistance);
  const totalCalories = actual?.totalCalories
    || (repeatCount && repeatCount > 1 && perRoundCalories ? perRoundCalories * repeatCount : undefined);

  let primary = '-';
  if (perRoundDistance && perRoundDistance > 0) {
    const hasPrescribedDist = (prescribed?.distance ?? 0) > 0;
    const relayCount = hasPrescribedDist && totalDistance && totalDistance > perRoundDistance
      ? Math.round(totalDistance / perRoundDistance)
      : 0;
    const isCleanRelay = actual?.wasSubstituted && relayCount >= 2
      && Math.abs(relayCount * perRoundDistance - (totalDistance ?? 0)) < 1;
    primary = isCleanRelay ? `${relayCount}×` : `${perRoundDistance}m`;
    if (!suppressDistanceTotal && totalDistance && totalDistance !== perRoundDistance) {
      subNoteParts.push(`${formatDistanceValue(totalDistance).toLowerCase()} total`);
    }
    accent = 'magenta';
  } else if (perRoundCalories && perRoundCalories > 0) {
    primary = `${perRoundCalories} CAL`;
    if (!suppressCalorieTotal && totalCalories && totalCalories !== perRoundCalories) {
      subNoteParts.push(totalLabel(totalCalories, 'cal'));
    }
    accent = 'magenta';
  } else if (isStrength && hasWeight) {
    if (actual?.weightProgression && actual.weightProgression.length > 1) {
      const min = Math.min(...actual.weightProgression);
      const max = Math.max(...actual.weightProgression);
      primary = min === max ? `${max}${unitUpper}` : `${min}->${max}${unitUpper}`;
    } else {
      primary = `${weight}${unitUpper}`;
    }
    if (totalReps && totalReps > 0) subNoteParts.push(totalLabel(totalReps));
    accent = 'yellow';
  } else if (perRoundReps && perRoundReps > 0) {
    primary = `${perRoundReps}`;
    if (hasWeight) {
      if (totalReps && totalReps > 0) subNoteParts.push(`${totalReps} total reps`);
      accent = 'yellow';
    } else if (totalReps && totalReps !== perRoundReps) {
      subNoteParts.push(totalLabel(totalReps));
    }
  } else if (hasWeight) {
    primary = `${weight}${unitUpper}`;
    accent = 'yellow';
  }

  const baseDisplayName = actual?.wasSubstituted && actual.name ? actual.name : movementName;
  const displayName = perRoundReps && perRoundReps !== 1 && !isStrength
    ? pluralizeMovementLabel(baseDisplayName)
    : baseDisplayName;
  const hasLoggedWeight = (actual?.weight || 0) > 0;
  const hasPrescribedDistForRelay = (prescribed?.distance ?? 0) > 0 && (perRoundDistance ?? 0) > 0;
  const relayCountForName = hasPrescribedDistForRelay && totalDistance && perRoundDistance && totalDistance > perRoundDistance
    ? Math.round(totalDistance / perRoundDistance)
    : 0;
  const isRelayRow = actual?.wasSubstituted && relayCountForName >= 2
    && perRoundDistance != null
    && Math.abs(relayCountForName * perRoundDistance - (totalDistance ?? 0)) < 1;
  const relayDistLabel = isRelayRow && perRoundDistance != null
    ? (perRoundDistance >= 1000 ? `${(perRoundDistance / 1000).toFixed(1)}km` : `${perRoundDistance}m`)
    : null;
  const nameWithLoad = relayDistLabel != null
    ? `${relayDistLabel} ${displayName}`
    : hasLoggedWeight && (perRoundReps ?? 0) > 0 && !isStrength
      ? `${displayName} @ ${weight}${unit}${weightEachSuffix}`
      : undefined;

  const result = {
    primary,
    name: displayName,
    nameWithLoad,
    loadNote: hasWeight ? `${weight}${unit}${weightEachSuffix}` : undefined,
    subNote: subNoteParts.slice(0, 1).join(' · ') || undefined,
    totalNote: subNoteParts.find((part) => /\btotal\b/i.test(part)),
    accent,
    repeatCount,
    partnerSplit,
  };

  if (shouldLogCelebrationDebug()) {
    console.log('[CelebrationDebug:buildCelebrationMovementRow]', {
      movementName,
      weight,
      hasWeight,
      actualWeight: actual?.weight,
      prescribedWeight: prescribed?.weight,
      isStrength,
      perRoundReps,
      totalReps,
      result,
    });
  }

  return result;
}

// ─── Progressive chipper helpers ─────────────────────────────────────────────

function isProgressiveChipper(exercise: Exercise | null | undefined): boolean {
  if (!exercise?.sections?.length) return false;
  const roundSections = exercise.sections.filter((s) => s.sectionType === 'rounds');
  if (roundSections.length < 2) return false;
  if (!roundSections.every((s) => (s.rounds ?? 1) === 1)) return false;
  const counts = roundSections.map((s) => (s.movements ?? []).length);
  return counts.some((c, i) => i > 0 && c !== counts[i - 1]);
}

function isPyramidChipper(exercise: Exercise | null | undefined): boolean {
  if (!exercise?.sections?.length) return false;
  const roundSections = exercise.sections.filter((s) => s.sectionType === 'rounds');
  if (roundSections.length < 2) return false;
  if (!roundSections.every((s) => (s.rounds ?? 1) === 1)) return false;
  const counts = roundSections.map((s) => (s.movements ?? []).length);
  if (counts[0] === 0 || counts.some((c) => c !== counts[0])) return false;
  return roundSections.some((s, i) => {
    if (i === 0) return false;
    const prev = roundSections[i - 1];
    return (s.movements ?? []).some((mov, j) => {
      const prevMov = (prev.movements ?? [])[j];
      return !!prevMov && (mov.reps !== prevMov.reps || mov.distance !== prevMov.distance || mov.calories !== prevMov.calories);
    });
  });
}

function abbreviateMovementForPoster(name: string): string {
  return name
    .replace(/\bDumbbell\b/gi, 'DB')
    .replace(/\bKettlebell\b/gi, 'KB')
    .replace(/\bBurpees? Over Bar\b/gi, 'BOB')
    .replace(/\bBent Over Row\b/gi, 'BOR')
    .replace(/\bHandstand Push-?up\b/gi, 'HSPU')
    .replace(/\bToes to Bar\b/gi, 'T2B')
    .replace(/\bDouble Unders?\b/gi, 'DU')
    .replace(/\bAmerican Kettlebell Swing\b/gi, 'AKS');
}

function pluralizeMovementLabel(name: string): string {
  const cleaned = name.replace(/\s+/g, ' ').trim();
  if (!cleaned) return cleaned;
  if (/^(?:HSPU|T2B|TTB|C2B|DU|BOB|BOR|AKS)$/i.test(cleaned)) return cleaned;

  const lastWordMatch = cleaned.match(/([A-Za-z][A-Za-z-]*)$/);
  if (!lastWordMatch) return cleaned;

  const lastWord = lastWordMatch[1];
  if (/ups$/i.test(lastWord)) return cleaned;
  if (/press$/i.test(lastWord)) return cleaned.replace(/press$/i, (match) => `${match}es`);
  if (/[^aeiou]y$/i.test(lastWord)) return cleaned.replace(/y$/i, (match) => (match === 'Y' ? 'IES' : 'ies'));
  if (/(?:s|x|z|ch|sh)$/i.test(lastWord)) return cleaned.replace(new RegExp(`${lastWord}$`), `${lastWord}es`);
  return `${cleaned}s`;
}

function formatRepMovementNameForPoster(name: string, reps?: number): string {
  const abbreviated = abbreviateMovementForPoster(name);
  return reps != null && reps !== 1 ? pluralizeMovementLabel(abbreviated) : abbreviated;
}

function formatProgressiveMovementData(
  movements: ParsedMovement[],
  prevNames: Set<string>,
  diffOnly: boolean,
  plusPrefix: boolean = false,
): { movement: string; weight?: string } {
  const toShow = diffOnly ? movements.filter((m) => !prevNames.has(m.name.toLowerCase())) : movements;
  if (toShow.length === 0) return { movement: '' };

  const parts = toShow.map((m) => {
    const qty = m.reps != null ? `${m.reps}` : m.calories != null ? `${m.calories}cal` : m.distance != null ? `${m.distance}m` : '';
    const name = formatRepMovementNameForPoster(m.name, m.reps);
    return qty ? `${qty} ${name}` : name;
  });

  const weightedMov = toShow.find((m) => m.rxWeights?.male != null);
  const weight = weightedMov?.rxWeights?.male != null ? `${weightedMov.rxWeights.male}kg` : undefined;

  return { movement: (plusPrefix ? '+ ' : '') + parts.join(' · '), weight };
}

function buildProgressiveChipperRows(sections: ParsedSection[], showAllMovements = false): ArtifactRow[] {
  const rows: ArtifactRow[] = [];
  let roundIndex = 1;
  let prevMovNames: Set<string> = new Set();
  const totalRounds = sections.filter((s) => s.sectionType === 'rounds').length;

  for (const section of sections) {
    const movements = section.movements ?? [];
    if (section.sectionType === 'buy_in') {
      const { movement, weight } = formatProgressiveMovementData(movements, new Set(), false);
      rows.push({ roundLabel: 'BUY-IN', name: 'buy-in', primary: movement, subNote: weight, accent: 'yellow' });
    } else if (section.sectionType === 'cash_out') {
      const { movement, weight } = formatProgressiveMovementData(movements, new Set(), false);
      rows.push({ roundLabel: 'CASH-OUT', name: 'cash-out', primary: movement, subNote: weight, accent: 'yellow' });
    } else {
      const isFirst = roundIndex === 1;
      const isLast = roundIndex === totalRounds;
      // Building chipper: R1 full, R2…R(n-1) diff with + prefix, Rn full cumulative
      // Pyramid chipper (showAllMovements): always show full movements per section
      const diffOnly = !showAllMovements && !isFirst && !isLast;
      const { movement, weight } = formatProgressiveMovementData(movements, prevMovNames, diffOnly, diffOnly);
      rows.push({ roundLabel: `R${roundIndex}`, name: `round-${roundIndex}`, primary: movement, subNote: weight, accent: 'magenta' });
      prevMovNames = new Set(movements.map((m) => m.name.toLowerCase()));
      roundIndex++;
    }
  }
  return rows;
}

// ─── Multi-section For Time renderer ─────────────────────────────────────────

function hasBodyweightPrescription(exercise: Exercise, movement: ParsedMovement): boolean {
  if (movement.isBodyweight) return true;
  const targetWords = normalizeStampMovementName(movement.name).split(/\s+/).filter(Boolean);
  if (targetWords.length === 0) return false;
  const source = `${exercise.rawText || ''}\n${exercise.prescription || ''}`;
  const clauses = source.split(/[\n,;]+/).map((line) => line.trim()).filter(Boolean);
  return clauses.some((clause) => {
    const normalizedClause = normalizeStampMovementName(clause);
    const mentionsMovement = targetWords.every((word) => normalizedClause.includes(word));
    return mentionsMovement && /\b(?:b\s*w|bw|body\s*weight|bodyweight)\b/i.test(clause.replace(/\./g, ''));
  });
}

function formatSectionRxLoad(exercise: Exercise, movement: ParsedMovement): string {
  if (hasBodyweightPrescription(exercise, movement)) return '';
  if (movement.inputType !== 'weight') return '';
  const male = movement.rxWeights?.male;
  const female = movement.rxWeights?.female;
  if (!male && !female) return '';
  const unit = movement.rxWeights?.unit ?? 'kg';
  const implementPrefix = movement.implementCount && movement.implementCount > 1
    ? `${movement.implementCount}x`
    : '';
  if (male && female && male !== female) return ` @ ${implementPrefix}${male}/${female}${unit}`;
  return ` @ ${implementPrefix}${male ?? female}${unit}`;
}

function formatSectionMovementPart(exercise: Exercise, movement: ParsedMovement, multiplier = 1): { text: string; hasWeight: boolean } {
  const qty = movement.reps != null
    ? `${movement.reps * multiplier}`
    : movement.calories != null
      ? /\bcal(?:orie|ories)?\b/i.test(movement.name)
        ? `${movement.calories * multiplier}`
        : `${movement.calories * multiplier} CAL`
      : movement.distance != null
        ? formatDistanceValue(movement.distance * multiplier).toUpperCase()
        : '';
  const load = formatSectionRxLoad(exercise, movement);
  const together = movement.together ? ' (together)' : '';
  return {
    text: [qty, `${formatRepMovementNameForPoster(movement.name, movement.reps != null ? movement.reps * multiplier : undefined)}${together}${load}`].filter(Boolean).join(' '),
    hasWeight: load !== '',
  };
}

// One poster row per literal movement occurrence, in the exact order the AI parsed them —
// used when a flat (non-sectioned) per-round movement list has a repeated name (e.g. a run
// interleaved between every other movement). Reuses buildCelebrationMovementRow so a repeated
// movement renders with the exact same two-column (name + weight/total) styling as every other
// row on the poster — just called once per literal occurrence instead of once per unique name.
function buildSequentialMovementRows(
  prescribedMovements: ParsedMovement[],
  actualMovements: MovementTotal[],
  options: {
    repeatCount?: number;
    movementRepeatCounts?: Map<string, number>;
    isStrength?: boolean;
    descLadderScheme?: number[];
    partnerSplit?: 'reps' | 'rounds';
  } = {},
): ArtifactRow[] {
  return prescribedMovements.map((movement): ArtifactRow => {
    const key = movement.name.toLowerCase();
    const actual = actualMovements.find((m) =>
      m.name.toLowerCase() === key || m.originalMovement?.toLowerCase() === key,
    );
    return buildCelebrationMovementRow({
      movementName: movement.name,
      prescribed: {
        reps: movement.reps,
        distance: movement.distance,
        calories: movement.calories,
        weight: movement.rxWeights?.male || movement.rxWeights?.female,
        implementCount: movement.implementCount,
      },
      actual,
      repeatCount: options.movementRepeatCounts?.get(key) ?? options.repeatCount,
      suppressDistanceTotal: true,
      suppressCalorieTotal: true,
      isStrength: options.isStrength,
      isLadder: !!options.descLadderScheme,
      partnerSplit: options.partnerSplit,
    });
  });
}

/**
 * One poster row per section — each section gets a [N×] chip on its first
 * movement so the reader can see "3× pull-up · push-up · lunge, then 3× run ·
 * power clean, then echo bike" rather than a flat unmarked list.
 *
 * Uses prescribed movement data (not breakdown) so movements that weren't
 * tracked separately (e.g. "together" runs) still appear on the poster.
 */
function buildMultiSectionForTimeSections(
  exercise: Exercise,
  teamSize?: number,
  splitInfo?: PartnerSplitInfo,
  isPartnerConfirmed = !!splitInfo,
): ArtifactSection[] {
  if (!exercise.sections?.length) return [];

  const sections: ArtifactSection[] = [];
  let tradedRoundOffset = 0;
  let sectionIndex = 0;

  for (const section of exercise.sections) {
    const sectionMovements = section.movements ?? [];
    if (sectionMovements.length === 0) continue;

    const rounds = section.rounds ?? 1;
    const sectionLetter = String.fromCharCode(65 + sectionIndex);
    sectionIndex += 1;

    const moveParts = sectionMovements.map((m) => formatSectionMovementPart(exercise, m)).filter((part) => part.text);
    if (moveParts.length === 0) continue;

    let personalRoundsForSection = 0;
    if (splitInfo?.split === 'rounds' && teamSize && teamSize > 1 && section.sectionType === 'rounds' && rounds > 1) {
      for (let i = 0; i < rounds; i += 1) {
        if ((tradedRoundOffset + i) % teamSize === 0) personalRoundsForSection += 1;
      }
      tradedRoundOffset += rounds;
    }

    const sectionTitle = section.sectionType === 'buy_in'
      ? `${sectionLetter} · BUY-IN`
      : section.sectionType === 'cash_out'
        ? `${sectionLetter} · BUY-OUT`
        : rounds > 1
          ? `${sectionLetter} · ${rounds} ROUNDS`
          : sectionLetter;
    const rows = moveParts.map((part, index): ArtifactRow => {
      const rowPartnerMine = personalRoundsForSection > 0
        ? formatSectionMovementPart(exercise, sectionMovements[index], personalRoundsForSection).text
        : undefined;
      return {
        primary: part.text,
        name: '',
        partnerSplit: splitInfo?.split,
        partnerMine: rowPartnerMine,
        accent: part.hasWeight ? 'yellow' : 'magenta',
      };
    });
    sections.push({
      eyebrow: undefined,
      title: sectionTitle,
      blueprint: undefined,
      rows,
      isPartnerConfirmed,
      partnerDisplayMode: isPartnerConfirmed ? 'sections' : undefined,
    });
  }

  return sections;
}

// ─── Artifact section builders ────────────────────────────────────────────────

export function buildRewardArtifactSections(
  exercises: Exercise[],
  movements: MovementTotal[],
  rawText?: string,
  format?: WorkoutFormat,
  teamSize?: number,
): ArtifactSection[] {
  if (!movements || movements.length === 0) return [];

  const mainExercise = exercises[0];
  // rawText is shared across ALL exercises in the workout — only safe to use as a text-matching
  // fallback when mainExercise IS the whole workout. Otherwise prefer mainExercise.rawText
  // (handled inside parseDescLadderScheme) and don't let a sibling block's text leak in here.
  const scopedRawText = exercises.length === 1 ? rawText : mainExercise?.rawText;
  const capText = `${mainExercise?.name || ''} ${mainExercise?.prescription || ''} ${scopedRawText || ''}`;
  const capMatch = capText.match(/\b(\d+)\s*(?:min(?:ute)?s?|minutes?)\s*(?:t\.?c\.?|time\s*cap|cap)\b/i);
  const timeCapLabel = capMatch ? `${parseInt(capMatch[1], 10)} MIN CAP` : undefined;
  const isForTime = /for\s*time|\brft\b/i.test(capText);
  const repeatCount = getPrescribedRoundCount(exercises, scopedRawText)
    || (mainExercise ? getPrescriptionRepeatCount(mainExercise) : undefined)
    || (isForTime && mainExercise ? inferRoundCountFromMovements(mainExercise, movements) : undefined);
  const everyCadence = !isForTime ? extractEveryXCadence(capText) : undefined;
  const descLadderScheme = isForTime && mainExercise ? parseForTimeRepScheme(mainExercise, scopedRawText) : undefined;
  const blueprintRaw = repeatCount && repeatCount > 1
    ? [
        isForTime
          ? (descLadderScheme
              ? `${descLadderScheme.join('-')} for time`
              : getSectionedForTimeLabel(mainExercise) || `${repeatCount} rounds for time`)
          : everyCadence ? formatNestedRoundBlueprint(`${everyCadence} · ${repeatCount} rounds`, mainExercise)
          : `${repeatCount} rounds`,
        timeCapLabel ? `· ${timeCapLabel}` : null,
      ].filter(Boolean).join(' ')
    : rawText
      ? rawText.split('\n').map((line) => line.trim()).find(Boolean)
      : exercises.map((exercise) => exercise.prescription).find(Boolean);
  const blueprint = blueprintRaw ? normalizeBlueprint(blueprintRaw) : undefined;

  const prescribedByName = new Map<string, { reps?: number; distance?: number; calories?: number; weight?: number; implementCount?: 1 | 2 }>();
  const prescribedMovements = mainExercise?.sections?.length
    ? mainExercise.sections.flatMap((section) => section.movements || [])
    : (mainExercise?.movements || []);
  for (const movement of prescribedMovements) {
    prescribedByName.set(movement.name.toLowerCase(), {
      reps: movement.reps,
      distance: movement.distance,
      calories: movement.calories,
      weight: movement.rxWeights?.male || movement.rxWeights?.female,
      implementCount: movement.implementCount,
    });
  }

  const stampRounds = exercises.length === 1
    ? (exercises[0]?.sets?.filter((s) => s.completed)?.length || exercises[0]?.sets?.length || 1)
    : 1;
  const complex = detectBarbellComplex(movements, stampRounds);
  if (complex) {
    const unit = complex.unit;
    const startLabel = `${complex.weight}${unit.toUpperCase()}`;
    const peakLabel = complex.weightEnd ? `${complex.weightEnd}${unit.toUpperCase()}` : startLabel;
    const weightDisplay = complex.weightEnd ? `${startLabel} → ${peakLabel}` : startLabel;
    const primaryDisplay = complex.weightEnd ? `${startLabel}→${peakLabel}` : startLabel;
    return [{
      eyebrow: complex.complexName.toUpperCase(),
      title: 'Complex',
      blueprint: `${complex.totalRounds}× ${weightDisplay}`,
      watermark: 'COMPLEX',
      rows: [{
        primary: primaryDisplay,
        name: `× ${complex.totalRounds} COMPLEX`,
        subNote: `${complex.repsPerRound} REP${complex.repsPerRound !== 1 ? 'S' : ''} EA. · ${complex.abbreviatedName}`,
        accent: 'yellow',
      }],
    }];
  }

  // Progressive chipper: render section-by-section story instead of flat movement list
  if (isProgressiveChipper(mainExercise)) {
    return [{
      eyebrow: 'FOR TIME',
      title: 'Blueprint',
      blueprint: blueprint ?? undefined,
      rows: buildProgressiveChipperRows(mainExercise!.sections!),
    }];
  }

  // Pyramid/palindrome chipper: same movement count per section, different reps/distances
  if (isPyramidChipper(mainExercise)) {
    const pyramidSections = mainExercise!.sections!.filter((s) => s.sectionType === 'rounds');
    const pyramidBlueprint = normalizeBlueprint([
      `${pyramidSections.length}-round pyramid for time`,
      timeCapLabel ? `· ${timeCapLabel}` : null,
    ].filter(Boolean).join(' '));
    return [{
      eyebrow: 'FOR TIME',
      title: 'Blueprint',
      blueprint: pyramidBlueprint,
      rows: buildProgressiveChipperRows(mainExercise!.sections!, true),
    }];
  }

  const isIGYG = /\b(?:i\s*go\s*you\s*go|igug|igyg)\b/i.test(capText);
  const relayMovement = isIGYG
    ? movements.find((m) => (m.distancePerRep ?? 0) > 0 && (m.totalDistance ?? 0) > 0)
    : undefined;

  // Strength is individual even in a team session — a "6 sets" rep scheme is not a round-trade
  // structure, and each partner lifts their own top set. Never run partner-split detection on it.
  const isStrengthSection = mainExercise?.type === 'strength';
  const partnerRoundCount = getSectionedRoundTradeCount(mainExercise) ?? repeatCount;
  const splitInfo = teamSize && teamSize > 1 && !isStrengthSection
    ? detectPartnerSplit({
        teamSize,
        scopedText: capText,
        prescribedRoundCount: partnerRoundCount,
        aiPartnerWorkout: mainExercise?.partnerWorkout,
        aiPartnerSplit: mainExercise?.partnerSplit,
        aiPersonalRounds: mainExercise?.personalRounds,
      })
    : undefined;
  const roundLedger = splitInfo?.split === 'rounds' && mainExercise
    ? {
        totalRounds: splitInfo.totalRounds!,
        personalRounds: splitInfo.personalRounds!,
        rounds: buildRoundLedger(
          splitInfo.totalRounds!,
          inferPartnerRoundLedgerCompletedRounds(splitInfo.totalRounds!, mainExercise, movements),
        ),
      }
    : undefined;

  // Multi-section For Time: independent sections with their own round counts
  // (e.g. "3 rounds of A, then 3 rounds of B, then cash-out C"). Not progressive
  // or pyramid chippers — those are handled above. This path shows each section
  // on its own row with a [N×] chip so the poster tells the full structural story.
  const roundSectionsCount = (mainExercise?.sections ?? []).filter(
    (s) => s.sectionType === 'rounds',
  ).length;
  if (roundSectionsCount > 1 && isForTime) {
    // Sectioned partner for-time workouts are one social story with A/B/C prescription rows.
    // Even if a section says IGUG, rendering the whole card as a round ledger collapses the
    // workout into unreadable full-width rows. Keep the partner hero/title, but only use the
    // flat-share TEAM/ME row contract when the detected split is truly 'reps'.
    const sectionSplitInfo = splitInfo?.split === 'reps' ? splitInfo : undefined;
    const multiSectionSections = buildMultiSectionForTimeSections(mainExercise!, teamSize, sectionSplitInfo, !!splitInfo);
    if (multiSectionSections.length > 0) {
      return multiSectionSections;
    }
  }

  // Ascending-ladder AMRAP: render the climb as a single bar-chart track, never a flat "2→12"
  // range or movement names repeated once per round
  if (mainExercise?.ladderReps && mainExercise.ladderReps.length > 0) {
    const ladderRows = buildLadderRows(mainExercise, movements);
    if (ladderRows) {
      return [{
        eyebrow: 'AMRAP',
        title: 'Blueprint',
        blueprint: blueprint ?? undefined,
        rows: ladderRows,
      }];
    }
  }

  const prescribedOrder = prescribedMovements.map((m) => normalizeStampMovementName(m.name));

  function findPrescribedIndex(movName: string): number {
    const norm = normalizeStampMovementName(movName);
    // 1. Exact normalized match
    let idx = prescribedOrder.findIndex((n) => n === norm);
    if (idx !== -1) return idx;
    // 2. Substring match (handles aliases like "KBS" ↔ "Kettlebell Swing")
    idx = prescribedOrder.findIndex((n) => n.includes(norm) || norm.includes(n));
    return idx;
  }

  const orderedForRows = prescribedOrder.length > 1
    ? [...movements].sort((a, b) => {
        const aCandidates = [a.originalMovement, a.name].filter(Boolean) as string[];
        const bCandidates = [b.originalMovement, b.name].filter(Boolean) as string[];
        const ai = Math.min(...aCandidates.map(findPrescribedIndex).map((i) => i === -1 ? 999 : i));
        const bi = Math.min(...bCandidates.map(findPrescribedIndex).map((i) => i === -1 ? 999 : i));
        return ai - bi;
      })
    : movements;

  let blueprintSub: string | undefined;
  if (relayMovement) {
    const perTrip = relayMovement.distancePerRep!;
    const relayLabel = `${perTrip >= 1000 ? `${(perTrip / 1000).toFixed(1)}KM` : `${perTrip}M`} ${relayMovement.name.toUpperCase()}`;
    const relayOriginalName = relayMovement.originalMovement?.toLowerCase() ?? relayMovement.name.toLowerCase();
    const amrapPrescribed = prescribedMovements.filter((m) =>
      m.name.toLowerCase() !== relayMovement.name.toLowerCase()
      && m.name.toLowerCase() !== relayOriginalName,
    );
    const amrapLine = formatPrescriptionMovementLine(amrapPrescribed);
    blueprintSub = amrapLine ? `P1: ${relayLabel} ↔ P2: ${amrapLine}` : `RELAY: ${relayLabel}`;
  } else {
    blueprintSub = prescribedMovements.length > 0
      ? formatPrescriptionMovementLine(prescribedMovements)
      : undefined;
  }

  const movementRepeatCounts = getSectionedMovementRepeatCounts(mainExercise);
  const rowRepeatCount = getEffectiveMovementRepeatCount(mainExercise, repeatCount);
  const rows = (!mainExercise?.sections?.length && hasIntraRoundRepeat(prescribedMovements))
    ? buildSequentialMovementRows(prescribedMovements, movements, {
        repeatCount: rowRepeatCount,
        movementRepeatCounts,
        descLadderScheme,
        partnerSplit: splitInfo?.split,
      })
    : orderedForRows.map((movement): ArtifactRow => {
        const prescribed = prescribedByName.get(movement.name.toLowerCase())
          ?? (movement.originalMovement ? prescribedByName.get(movement.originalMovement.toLowerCase()) : undefined);
        const parsedMovement = mainExercise?.movements?.find((candidate) => {
          const name = candidate.name.toLowerCase();
          return name === movement.name.toLowerCase() || name === movement.originalMovement?.toLowerCase();
        });

        return buildCelebrationMovementRow({
          movementName: parsedMovement
            ? getMovementDisplayNameFromContext(parsedMovement, capText)
            : movement.name,
          prescribed,
          actual: movement,
          repeatCount: movementRepeatCounts?.get(movement.originalMovement?.toLowerCase() || movement.name.toLowerCase()) ?? rowRepeatCount,
          suppressDistanceTotal: true,
          isLadder: !!descLadderScheme,
          partnerSplit: splitInfo?.split,
        });
      });

  if (shouldLogCelebrationDebug()) {
    console.warn('[CelebrationDebug:v20260503-single-artifact]', {
      path: 'buildRewardArtifactSections',
      rawText,
      exercises: exercises.map((ex) => ({ name: ex.name, prescription: ex.prescription, rounds: ex.rounds })),
      repeatCount,
      blueprint,
      rows,
    });
  }

  return [{
    eyebrow: isIGYG ? 'I GO YOU GO' : isForTime ? 'FOR TIME' : format === 'emom' ? undefined : 'METCON',
    title: 'Blueprint',
    blueprint: blueprint ?? undefined,
    blueprintSub,
    rows,
    hiddenCount: 0,
    roundLedger,
    isPartnerConfirmed: !!splitInfo,
  }];
}

// ─── Explicit work/rest durations from prescription text ─────────────────────
// Used only to disambiguate the AI's workDuration/restDuration semantics (cumulative vs
// per-interval) in the station blueprint — never to override an unambiguous AI value.

function clockTokenToSeconds(token: string): number | undefined {
  const clock = token.match(/^(\d{1,2}):(\d{2})$/);
  if (clock) return parseInt(clock[1], 10) * 60 + parseInt(clock[2], 10);
  const unit = token.match(/^(\d+(?:\.\d+)?)\s*(min(?:ute)?s?|sec(?:ond)?s?)$/i);
  if (unit) return /^s/i.test(unit[2]) ? Math.round(parseFloat(unit[1])) : Math.round(parseFloat(unit[1]) * 60);
  return undefined;
}

const TIME_TOKEN_PATTERN = String.raw`(\d{1,2}:\d{2}|\d+(?:\.\d+)?\s*(?:min(?:ute)?s?|sec(?:ond)?s?))`;

function parseExplicitRestSeconds(text: string): number | undefined {
  const match = text.match(new RegExp(`${TIME_TOKEN_PATTERN}\\s*(?:min(?:ute)?s?\\s*)?rest`, 'i'))
    ?? text.match(new RegExp(`rest\\s*[:=]?\\s*${TIME_TOKEN_PATTERN}`, 'i'));
  return match ? clockTokenToSeconds(match[1].trim()) : undefined;
}

function parseExplicitWorkSeconds(text: string): number | undefined {
  const match = text.match(new RegExp(`${TIME_TOKEN_PATTERN}\\s*(?:min(?:ute)?s?\\s*)?(?:amrap|work)`, 'i'))
    ?? text.match(new RegExp(`(?:amrap|work)\\s*[:=]?\\s*${TIME_TOKEN_PATTERN}`, 'i'));
  return match ? clockTokenToSeconds(match[1].trim()) : undefined;
}

export function buildPageArtifactSection(
  exercise: Exercise,
  movements: MovementTotal[],
  isStrength: boolean,
  rawText?: string,
  teamSize?: number,
): ArtifactSection | null {
  if (!movements || movements.length === 0) return null;

  // Ascending-ladder AMRAP: render the climb as a single bar-chart track, never a flat "2→12"
  // range or movement names repeated once per round
  if (exercise.ladderReps && exercise.ladderReps.length > 0) {
    const ladderRows = buildLadderRows(exercise, movements);
    if (ladderRows) {
      return {
        eyebrow: 'WOD',
        title: exercise.name,
        rows: ladderRows,
        hiddenCount: 0,
      };
    }
  }

  const stationLabelMap: Record<string, string> = {};
  const prescribedRepsMap: Record<string, number> = {};
  const prescribedCalsMap: Record<string, number> = {};
  const prescribedDistMap: Record<string, number> = {};
  const prescribedWeightMap: Record<string, number> = {};
  const prescribedImplementMap: Record<string, 1 | 2> = {};
  const prescribedMaxMap: Record<string, boolean> = {};
  const prescribedRxLabelMap: Record<string, string> = {};
  const prescribedAltMap: Record<string, string> = {};
  const stationOrderMap: Record<string, number> = {};
  const stationLabelsInOrder: string[] = [];
  let stationIdx = 0;
  const formatStationDistance = (meters: number): string => (
    meters >= 1000
      ? `${meters % 1000 === 0 ? meters / 1000 : (meters / 1000).toFixed(1)}km`
      : `${meters}m`
  );
  const prescribedMovements = exercise.sections?.length
    ? exercise.sections.flatMap((section) => section.movements || [])
    : (exercise.movements || []);
  for (const m of prescribedMovements) {
    const key = m.name.toLowerCase();
    if (m.stationLabel) {
      stationLabelMap[key] = m.stationLabel;
      if (!stationLabelsInOrder.includes(m.stationLabel)) stationLabelsInOrder.push(m.stationLabel);
    }
    if (m.reps) prescribedRepsMap[key] = m.reps;
    if (m.calories) prescribedCalsMap[key] = m.calories;
    if (m.distance) prescribedDistMap[key] = m.distance;
    if (m.rxWeights?.male || m.rxWeights?.female) {
      prescribedWeightMap[key] = m.rxWeights.male || m.rxWeights.female || 0;
      const rxUnit = m.rxWeights.unit === 'lb' ? 'lb' : 'kg';
      const { male, female } = m.rxWeights;
      prescribedRxLabelMap[key] = male && female && male !== female
        ? `${male}/${female}${rxUnit}`
        : `${male || female}${rxUnit}`;
    }
    if (m.alternative?.name) {
      const altQty = m.alternative.reps ? `${m.alternative.reps}`
        : m.alternative.distance ? formatStationDistance(m.alternative.distance)
        : m.alternative.calories ? `${m.alternative.calories} cal`
        : '';
      prescribedAltMap[key] = [altQty, m.alternative.name].filter(Boolean).join(' ');
    }
    if (m.implementCount) prescribedImplementMap[key] = m.implementCount;
    if (m.isMaxReps || /\bmax\b/i.test(m.name)) prescribedMaxMap[key] = true;
    if (!(key in stationOrderMap)) stationOrderMap[key] = stationIdx++;
  }
  const hasStations = Object.keys(stationLabelMap).length > 0;

  const orderedMovements = hasStations
    ? [...movements].sort((a, b) =>
        (stationOrderMap[a.name.toLowerCase()] ?? 999) - (stationOrderMap[b.name.toLowerCase()] ?? 999),
      )
    : movements;

  const exerciseOnlyText = `${exercise.name || ''} ${exercise.prescription || ''}`;
  const scopedExerciseText = exerciseOnlyText.trim() || rawText;
  const repeatCount = getPrescribedRoundCount([exercise], scopedExerciseText)
    || getPrescriptionRepeatCount(exercise)
    || inferRoundCountFromMovements(exercise, movements);
  const getStationVisitCount = (totalIntervals: number, stationCount: number, stationIndex: number): number => {
    if (totalIntervals <= 0 || stationCount <= 0) return 1;
    const baseVisits = Math.floor(totalIntervals / stationCount);
    const remainder = totalIntervals % stationCount;
    return baseVisits + (stationIndex < remainder ? 1 : 0);
  };
  const formatStationHeaderDuration = (seconds: number): string => {
    const rounded = Math.round(seconds);
    const mins = Math.floor(rounded / 60);
    const secs = rounded % 60;
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };
  const getStationHeaderCap = (stationLabel?: string): string | undefined => {
    if (!stationLabel || !repeatCount || stationLabelsInOrder.length <= 1) return undefined;
    const stationIndex = Math.max(0, stationLabelsInOrder.indexOf(stationLabel));
    const visits = getStationVisitCount(repeatCount, stationLabelsInOrder.length, stationIndex);
    const workPerVisit = exercise.workDuration && repeatCount > 0
      ? formatStationHeaderDuration(exercise.workDuration / repeatCount)
      : undefined;
    return [`${visits} rds`, workPerVisit].filter(Boolean).join(' · ');
  };
  // Strength is individual even in a team session — a "6 sets" rep scheme is not a round-trade
  // structure, and each partner lifts their own top set. Never run partner-split detection on it.
  // Scoped text for the partner-language gate specifically: prefer this exercise's OWN rawText
  // (the AI's per-block slice, e.g. "In pairs, I go you go") over exerciseOnlyText alone — the
  // partner phrasing often lives only in the original wording, not in the normalized
  // name/prescription fields. Mirrors the exercise.rawText-first convention parseDescLadderScheme
  // already uses; kept separate from exerciseOnlyText itself since that's relied on by several
  // unrelated pre-existing regex checks below (for_time/relay/AMRAP-minute detection) that this
  // fix shouldn't touch.
  const exercisePartnerScopedText = `${exercise.rawText || ''} ${exerciseOnlyText}`;
  const partnerRoundCount = getSectionedRoundTradeCount(exercise) ?? repeatCount;
  const splitInfo = teamSize && teamSize > 1 && !isStrength
    ? detectPartnerSplit({
        teamSize,
        scopedText: exercisePartnerScopedText,
        prescribedRoundCount: partnerRoundCount,
        aiPartnerWorkout: exercise.partnerWorkout,
        aiPartnerSplit: exercise.partnerSplit,
        aiPersonalRounds: exercise.personalRounds,
      })
    : undefined;
  const isTeamIGUG = splitInfo?.split === 'rounds';
  const personalRepeatCount = isTeamIGUG ? splitInfo!.personalRounds : repeatCount;
  const roundLedger = isTeamIGUG
    ? {
        totalRounds: splitInfo!.totalRounds!,
        personalRounds: splitInfo!.personalRounds!,
        rounds: buildRoundLedger(
          splitInfo!.totalRounds!,
          inferPartnerRoundLedgerCompletedRounds(splitInfo!.totalRounds!, exercise, movements),
        ),
      }
    : undefined;
  const capMatch = exerciseOnlyText.match(
    /\b(\d+)\s*(?:min(?:ute)?s?|minutes?)\s*(?:t\.?c\.?|time\s*cap|cap)\b/i,
  );
  const timeCapLabel = capMatch ? `${parseInt(capMatch[1], 10)} MIN CAP` : undefined;
  const isExerciseForTime = /for\s*time|\brft\b/i.test(exerciseOnlyText);
  const descSchemeGlobal = !isStrength && isExerciseForTime
    ? parseForTimeRepScheme(exercise, rawText)
    : undefined;
  const descSchemeCompleted = descSchemeGlobal
    ? (exercise.rounds != null && exercise.rounds < descSchemeGlobal.length
        ? exercise.rounds
        : descSchemeGlobal.length)
    : undefined;

  let blueprint: string | undefined;
  if (hasStations) {
    const stationCount = Object.keys(stationLabelMap).length;
    const roundsMatch = (exercise.prescription || '').match(/(\d+)\s*rounds?/i);
    const rounds = exercise.rounds || (roundsMatch ? parseInt(roundsMatch[1]) : null);
    // Prefer the AI's own workDuration/restDuration (trusted, no regex) over a guess — a
    // hardcoded "1 min each" here would silently lie about the actual work/rest split.
    const formatStationDuration = (seconds: number): string => {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return secs > 0 ? `${mins}:${String(secs).padStart(2, '0')}` : `${mins} min`;
    };
    // workDuration/restDuration are CUMULATIVE across all rounds (per the AI's own contract —
    // e.g. "2:00 AMRAP x 6" -> workDuration: 720), not per-round — divide back down to get the
    // single work/rest interval to display. The AI sometimes violates the contract and returns
    // the PER-INTERVAL value instead: when the exercise's own text prescribes exactly that
    // duration (e.g. "[02:00 AMRAP / 01:00 REST] x 6" saved with restDuration: 60), dividing
    // would invent a fictional split ("0:10 rest") — so a value matching the text's explicit
    // work/rest is shown as-is.
    const timingText = `${exercise.rawText || ''} ${exerciseOnlyText}`.replace(/(\d+)\.(\d{2})/g, '$1:$2');
    const perIntervalSeconds = (cumulative: number | undefined, explicit: number | undefined): number | undefined => {
      if (!cumulative || !rounds) return undefined;
      return cumulative === explicit ? explicit : cumulative / rounds;
    };
    const workSeconds = perIntervalSeconds(exercise.workDuration, parseExplicitWorkSeconds(timingText));
    const restSeconds = perIntervalSeconds(exercise.restDuration, parseExplicitRestSeconds(timingText));
    const workLabel = workSeconds ? formatStationDuration(workSeconds) : undefined;
    const restLabel = restSeconds ? formatStationDuration(restSeconds) : undefined;
    const timingLabel = workLabel
      ? (restLabel ? `${workLabel} work / ${restLabel} rest` : `${workLabel} each`)
      : `${stationCount} stations`;
    blueprint = [rounds ? `${rounds} rounds` : null, timingLabel].filter(Boolean).join(' · ');
  } else if (!isStrength && repeatCount && repeatCount > 1) {
    const forTime = /for\s*time|\brft\b/i.test(exerciseOnlyText);
    const descScheme = forTime ? parseForTimeRepScheme(exercise, rawText) : undefined;
    const pageCadence = !forTime ? extractEveryXCadence(exerciseOnlyText) : undefined;
    const amrapMinMatch = !forTime && !pageCadence
      ? exerciseOnlyText.match(/\b(\d+)\s*(?:min(?:ute)?s?)\s*amrap\b/i)
      : undefined;
    const amrapMin = amrapMinMatch ? parseInt(amrapMinMatch[1], 10) : undefined;
    blueprint = [
      descScheme ? `[${descScheme.join('-')}] for time`
        : forTime ? (getSectionedForTimeLabel(exercise) || `${repeatCount} rounds for time`)
        : amrapMin ? `${amrapMin} min AMRAP`
        : pageCadence ? formatNestedRoundBlueprint(`${pageCadence} · ${repeatCount} rounds`, exercise)
        : `${repeatCount} rounds`,
      timeCapLabel ? `(${timeCapLabel})` : null,
    ].filter(Boolean).join(' ');
  } else if (isStrength) {
    const setCount = repeatCount
      || exercise.sets?.filter((set) => set.completed).length
      || exercise.sets?.length
      || exercise.rounds;
    blueprint = setCount && setCount > 1 ? `${setCount} sets` : 'Strength';
  } else {
    const raw = normalizeBlueprint(exercise.prescription || exercise.name || '');
    const isExerciseForTime2 = /for\s*time|\brft\b/i.test(exerciseOnlyText);
    if (raw.length > 55) {
      blueprint = isExerciseForTime2
        ? (timeCapLabel ? `For time (${timeCapLabel})` : 'For time')
        : raw.slice(0, 52) + '…';
    } else {
      blueprint = raw;
    }
  }

  const pageRoundSectionsCount = (exercise.sections ?? []).filter((s) => s.sectionType === 'rounds').length;
  const pageIsSectionedForTime = !isStrength && pageRoundSectionsCount > 1 && /for\s*time|\brft\b/i.test(exercisePartnerScopedText);
  if (pageIsSectionedForTime) {
    const sectionSplitInfo = splitInfo?.split === 'reps' ? splitInfo : undefined;
    const sections = buildMultiSectionForTimeSections(exercise, teamSize, sectionSplitInfo, !!splitInfo);
    if (sections.length > 0) {
      return {
        ...sections[0],
        title: exercise.name,
        blueprint,
        rows: sections.flatMap((section) => section.rows),
        hiddenCount: 0,
        isPartnerConfirmed: !!splitInfo,
        partnerDisplayMode: splitInfo ? 'sections' : undefined,
      };
    }
  }

  const isRelaySection = /relay/i.test(exerciseOnlyText)
    || (movements.length === 1 && (movements[0].distancePerRep ?? 0) > 0 && !movements[0].totalReps);
  const blueprintSub = !isStrength && !isRelaySection && prescribedMovements.length > 0
    ? formatPrescriptionMovementLine(prescribedMovements)
    : undefined;

  const strengthBubbleScheme = isStrength && (exercise.suggestedRepsPerSet?.length ?? 0) >= 3
    ? exercise.suggestedRepsPerSet
    : undefined;

  if (descSchemeGlobal && descSchemeCompleted) {
    const rows = buildDescendingLadderRows(exercise, movements, descSchemeGlobal, descSchemeCompleted);
    return {
      eyebrow: 'WOD',
      title: exercise.name,
      blueprint,
      blueprintSub,
      rows,
      hiddenCount: 0,
      descLadderScheme: descSchemeGlobal,
      descLadderCompleted: descSchemeCompleted,
      isPartnerConfirmed: !!splitInfo,
    };
  }

  const movementRepeatCounts = getSectionedMovementRepeatCounts(exercise);
  const rowRepeatCount = getEffectiveMovementRepeatCount(exercise, personalRepeatCount);
  const rows = (!hasStations && !exercise.sections?.length && hasIntraRoundRepeat(prescribedMovements))
    ? buildSequentialMovementRows(prescribedMovements, movements, {
        repeatCount: rowRepeatCount,
        movementRepeatCounts,
        isStrength,
        descLadderScheme: descSchemeGlobal,
        partnerSplit: splitInfo?.split,
      })
    : orderedMovements.map((movement): ArtifactRow => {
        const key = movement.name.toLowerCase();
        const stationLabel = stationLabelMap[key];

        if (hasStations) {
          const prescReps = prescribedRepsMap[key];
          const prescCals = prescribedCalsMap[key];
          const prescDist = prescribedDistMap[key];
          // isMaxReps is stamped by the post-processor on save (logging writes the athlete's
          // per-round reps into movement.reps, so "no prescribed value" alone stops being a
          // reliable signal after save). The absence check remains for docs saved before the
          // stamp existed.
          const isMaxMovement = Boolean(prescribedMaxMap[key])
            || (!(prescDist && prescDist > 0) && !(prescCals && prescCals > 0) && !(prescReps && prescReps > 0));
          const wUnit = movement.unit === 'lb' ? 'lb' : 'kg';
          const displayName = movement.name.replace(/\bDbs?\b/g, (token) => token.toUpperCase());
          const totalR = movement.totalReps || 0;
          const totalC = movement.totalCalories || 0;
          const totalD = movement.totalDistance || 0;

          let fullLine: string;
          let rxLoadTag: string | undefined;
          let totalNote: string | undefined;

          if (isMaxMovement) {
            // Max-effort movement: the prescription is just "Max <movement>"; the Rx load rides
            // along as a quiet tag and the logged aggregate is the row's value ("24 reps").
            fullLine = `Max ${displayName}`;
            rxLoadTag = prescribedRxLabelMap[key]
              || ((movement.weight || 0) > 0 ? `${movement.weight}${wUnit}` : undefined);
            totalNote = totalD > 0 ? (totalD >= 1000 ? `${(totalD / 1000).toFixed(1)} km` : `${totalD}m`)
              : totalC > 0 ? `${totalC} cal`
              : totalR > 0 ? `${totalR} reps`
              : undefined;
          } else {
            // Fixed prescription: one line as the athlete would read it off the whiteboard
            // ("200m Run", "50 Double Under / 80 Singles"). The per-station round count in the
            // ST. header already says how many times it ran — no derived totals.
            const qty = prescDist && prescDist > 0 ? formatStationDistance(prescDist)
              : prescCals && prescCals > 0 ? `${prescCals} cal`
              : `${prescReps}`;
            const altSuffix = prescribedAltMap[key] ? ` / ${prescribedAltMap[key]}` : '';
            const loadSuffix = (movement.weight || 0) > 0 ? ` @ ${movement.weight}${wUnit}`
              : prescribedRxLabelMap[key] ? ` @ ${prescribedRxLabelMap[key]}` : '';
            fullLine = `${qty} ${displayName}${altSuffix}${loadSuffix}`;
          }

          // Station rows always carry the COMPLETE display line in primary (the poster line
          // converter renders it verbatim and never re-appends the name). The station letter
          // renders as the ST. header block above, via roundLabel on the station's first row.
          const base: ArtifactRow = {
            primary: fullLine,
            name: displayName,
            subNote: rxLoadTag,
            totalNote,
            accent: isMaxMovement ? 'yellow' : (movement.color || 'magenta'),
            stationRow: true,
            suppressMine: true,
          };
          if (stationLabel) {
            return {
              ...base,
              roundLabel: stationLabel.toUpperCase(),
              stationHeaderCap: getStationHeaderCap(stationLabel),
            };
          }
          return base;
        }

        const prescribed = {
          reps: prescribedRepsMap[key],
          distance: prescribedDistMap[key],
          calories: prescribedCalsMap[key],
          weight: prescribedWeightMap[key],
          implementCount: prescribedImplementMap[key],
        };
        const parsedMovement = exercise.movements?.find((candidate) => {
          const name = candidate.name.toLowerCase();
          return name === movement.name.toLowerCase() || name === movement.originalMovement?.toLowerCase();
        });

        const row = buildCelebrationMovementRow({
          movementName: parsedMovement
            ? getMovementDisplayNameFromContext(parsedMovement, `${exercise.name || ''} ${exercise.prescription || ''} ${rawText || ''}`)
            : movement.name,
          prescribed,
          actual: movement,
          repeatCount: movementRepeatCounts?.get(movement.originalMovement?.toLowerCase() || movement.name.toLowerCase()) ?? rowRepeatCount,
          isStrength,
          partnerSplit: splitInfo?.split,
        });

        if (descSchemeGlobal && !prescribed.distance && !prescribed.calories) {
          const isLadderMov = prescribed.reps != null && descSchemeGlobal.includes(prescribed.reps);
          const movWeight = movement.weight ?? prescribed.weight;
          const wUnit = movement.unit === 'lb' ? 'LB' : 'KG';
          const isWeighted = (movWeight ?? 0) > 0;
          if (isWeighted) {
            row.primary = `@${movWeight}${wUnit}`;
          } else if (movement.totalReps) {
            row.primary = `${movement.totalReps}`;
          }
          if (isLadderMov) {
            const schemeTotal = descSchemeGlobal.slice(0, descSchemeCompleted).reduce((s, n) => s + n, 0);
            row.subNote = `${schemeTotal} total`;
          }
        }

        return row;
      });

  if (shouldLogCelebrationDebug()) {
    console.warn('[CelebrationDebug:v20260503-page-artifact]', {
      path: 'buildPageArtifactSection',
      exercise: { name: exercise.name, prescription: exercise.prescription, rounds: exercise.rounds },
      isStrength,
      repeatCount,
      blueprint,
      rows,
    });
  }

  const exerciseOnlyIsIGYG = rawText ? /\b(?:i\s*go\s*you\s*go|igug|igyg)\b/i.test(rawText) : false;
  const sectionEyebrow = isRelaySection ? 'RELAY' : exerciseOnlyIsIGYG ? 'PARTNER AMRAP' : 'WOD';

  return {
    eyebrow: sectionEyebrow,
    title: exercise.name,
    blueprint,
    blueprintSub,
    rows,
    hiddenCount: 0,
    ...((descSchemeGlobal || strengthBubbleScheme) && {
      descLadderScheme: descSchemeGlobal ?? strengthBubbleScheme,
      descLadderCompleted: descSchemeCompleted ?? strengthBubbleScheme?.length,
    }),
    roundLedger,
    isPartnerConfirmed: !!splitInfo,
  };
}

// ─── Hero result ──────────────────────────────────────────────────────────────

// Forward-declare internal builders used by computeHeroResult
function isStrengthExercise(ex: Exercise): boolean {
  if (ex.type === 'strength') return true;
  if (ex.movements && ex.movements.length > 0) return false;
  return false;
}

function findMetconExercise(exercises: Exercise[]): Exercise {
  if (exercises.length === 0) return { id: '', name: '', type: 'wod', prescription: '', sets: [] };
  if (exercises.length === 1) return exercises[0];
  const metcon = exercises.find((ex) => !isStrengthExercise(ex));
  return metcon ?? exercises[0];
}

function formatRepScheme(repsPerSet?: number[]): string | undefined {
  return repsPerSet && repsPerSet.length > 1 ? repsPerSet.join('-') : undefined;
}

function buildAccomplishmentStory(movements: MovementTotal[]): string | undefined {
  if (!movements || movements.length === 0) return undefined;
  const parts: string[] = [];
  for (const m of movements) {
    const name = m.name
      .replace(/Toes[- ]to[- ]Bar/i, 'TTB')
      .replace(/Chest[- ]to[- ]Bar/i, 'C2B')
      .replace(/Handstand Push[- ]?Ups?/i, 'HSPU')
      .replace(/Muscle[- ]?Ups?/i, 'MU')
      .replace(/Double[- ]?Unders?/i, 'DU');
    if (m.totalCalories && m.totalCalories > 0) parts.push(`${m.totalCalories} ${name.toLowerCase()} cals`);
    else if (m.totalDistance && m.totalDistance > 0) {
      const dist = m.totalDistance >= 1000 ? `${(m.totalDistance / 1000).toFixed(1)}km` : `${Math.round(m.totalDistance)}m`;
      parts.push(`${dist} ${name.toLowerCase()}`);
    } else if (m.totalReps && m.totalReps > 0) parts.push(`${m.totalReps} ${name.toLowerCase()}`);
  }
  return parts.length === 0 ? undefined : parts.join(' · ');
}

function buildStoryMovements(
  movements: MovementTotal[],
  rounds: number,
  teamSize?: number,
  repsPerSet?: number[],
): StoryMovementLine[] | undefined {
  if (!movements || movements.length === 0) return undefined;
  const lines: StoryMovementLine[] = [];
  const isPartner = teamSize && teamSize > 1;
  const factor = isPartner ? teamSize : 1;

  const complex = detectBarbellComplex(movements, rounds);
  if (complex) {
    lines.push({ perRound: '', name: '', total: '', sectionHeader: complex.complexName.toUpperCase(), sectionColor: 'yellow' });
    const roundsLabel = complex.totalRounds > 1 ? `${complex.totalRounds} ROUNDS` : '';
    lines.push({ perRound: complex.repsPerRound === 1 ? '1 COMPLEX' : `${complex.repsPerRound}× COMPLEX`, name: '', total: roundsLabel, color: 'yellow', weight: complex.weight, unit: complex.unit });
    return lines;
  }

  for (const m of movements) {
    const name = m.name;
    const color = m.color;
    const unit = m.unit === 'lb' ? 'lb' : 'kg';

    if (m.weightProgression && m.weightProgression.length > 0) {
      lines.push({ perRound: '', name, total: '', color, weightProgression: m.weightProgression, unit });
      continue;
    }

    if (m.weight && m.weight > 0 && !m.totalReps && !m.totalCalories && !m.totalDistance) {
      lines.push({ perRound: `${m.weight}`, name, total: '', color: color ?? 'yellow', weight: m.weight, unit });
      continue;
    }

    const wasSubstituted = m.wasSubstituted || false;
    const originalMovement = m.originalMovement;
    const substitutionType = m.substitutionType;
    const movFactor = m.together ? 1 : factor;
    const showPartnerNote = isPartner && !m.together;

    let substitutedPerRound: string | undefined;
    if (wasSubstituted) {
      const subDistPerRound = m.distancePerRep ?? (m.totalDistance && rounds > 1 ? Math.round(m.totalDistance / rounds) : m.totalDistance);
      const subCalsPerRound = m.totalCalories && rounds > 1 ? Math.round(m.totalCalories / rounds) : m.totalCalories;
      if (subDistPerRound && subDistPerRound > 0) {
        substitutedPerRound = subDistPerRound >= 1000 ? `${(subDistPerRound / 1000).toFixed(1)}km` : `${subDistPerRound}m`;
      } else if (subCalsPerRound && subCalsPerRound > 0) {
        substitutedPerRound = `${subCalsPerRound} cal`;
      }
    }

    if (m.totalCalories && m.totalCalories > 0) {
      const workoutTotal = Math.round(m.totalCalories * movFactor);
      const personal = m.totalCalories;
      const perRound = rounds > 1 ? `${Math.round(workoutTotal / rounds)} cal` : `${workoutTotal} cal`;
      const total = rounds > 1 ? `${workoutTotal} cal total` : '';
      const partnerNote = showPartnerNote ? `your part ${personal} cal` : undefined;
      lines.push({ perRound, name, total, color: color ?? 'magenta', partnerNote, wasSubstituted, originalMovement, substitutionType, substitutedPerRound });
    } else if (m.totalDistance && m.totalDistance > 0) {
      const workoutTotalDist = Math.round(m.totalDistance * movFactor);
      const personalDist = m.totalDistance;
      const fmtWorkoutTotal = workoutTotalDist >= 1000 ? `${(workoutTotalDist / 1000).toFixed(1)}km` : `${workoutTotalDist}m`;
      const perDist = rounds > 1 && m.distancePerRep
        ? (m.distancePerRep >= 1000 ? `${(m.distancePerRep / 1000).toFixed(1)}km` : `${Math.round(m.distancePerRep)}m`)
        : fmtWorkoutTotal;
      const total = rounds > 1 ? `${fmtWorkoutTotal} total` : '';
      let partnerNote: string | undefined;
      if (showPartnerNote) {
        partnerNote = `your part ${personalDist >= 1000 ? `${(personalDist / 1000).toFixed(1)}km` : `${personalDist}m`}`;
      }
      lines.push({ perRound: perDist, name, total, color: color ?? 'magenta', partnerNote, wasSubstituted, originalMovement, substitutionType, substitutedPerRound });
    } else if (m.totalReps && m.totalReps > 0) {
      const workoutTotalReps = Math.round(m.totalReps * movFactor);
      const personalReps = m.totalReps;
      const repScheme = formatRepScheme(repsPerSet);
      const perRound = repScheme ?? (rounds > 1 ? `${Math.round(workoutTotalReps / rounds)}` : `${workoutTotalReps}`);
      const total = (rounds > 1 || repScheme) ? `${workoutTotalReps} total` : '';
      const isBodyweight = isBwVolumeMovement(name);
      const partnerNote = showPartnerNote ? `your part ${personalReps}` : undefined;
      lines.push({ perRound, name, total, color: color ?? 'magenta', weight: m.weight, unit: !isBodyweight ? unit : undefined, partnerNote, wasSubstituted, originalMovement, substitutionType, substitutedPerRound });
    }
  }

  return lines.length > 0 ? lines : undefined;
}

function buildSectionedStoryMovements(
  sections: ParsedSection[],
  movements: MovementTotal[],
  teamSize?: number,
  exerciseIndex?: number,
): StoryMovementLine[] | undefined {
  if (!sections || sections.length <= 1) return undefined;
  const lines: StoryMovementLine[] = [];

  for (const section of sections) {
    const rounds = section.rounds ?? 1;
    const isPartnerSection = teamSize && teamSize > 1;
    const isIGUG = isPartnerSection && section.sectionType === 'rounds' && rounds > 1;
    const personalRounds = isIGUG ? Math.round(rounds / (teamSize as number)) : rounds;
    const headerLabel = section.sectionType === 'buy_in' ? 'BUY-IN'
      : section.sectionType === 'cash_out' ? 'CASH-OUT'
      : isIGUG ? `×${rounds} ROUNDS (${personalRounds} each)`
      : `×${rounds} ROUNDS`;

    lines.push({ perRound: '', name: '', total: '', sectionHeader: headerLabel });

    for (const mov of section.movements) {
      const actual = findMovementTotal(movements, mov.name, exerciseIndex);
      const name = actual?.wasSubstituted ? actual.name : mov.name;
      const unit = actual?.unit === 'lb' ? 'lb' : 'kg';
      const color = actual?.color;

      if (actual?.weightProgression && actual.weightProgression.length > 0) {
        lines.push({ perRound: '', name, total: '', color, weightProgression: actual.weightProgression, unit });
        continue;
      }

      const isPartner = teamSize && teamSize > 1;
      const isTogether = mov.together || actual?.together;
      const rxW = mov.rxWeights?.male || mov.rxWeights?.female;
      const isBodyweight = isBwVolumeMovement(name);
      const wasSubstituted = actual?.wasSubstituted || false;
      const originalMovement = actual?.originalMovement;
      const substitutionType = actual?.substitutionType;

      let substitutedPerRound: string | undefined;
      if (wasSubstituted && actual) {
        const subDist = actual.distancePerRep ?? (actual.totalDistance ? Math.round(actual.totalDistance / sections.length) : 0);
        const subCals = actual.totalCalories ? Math.round(actual.totalCalories / sections.length) : 0;
        if (subDist > 0) {
          substitutedPerRound = subDist >= 1000 ? `${(subDist / 1000).toFixed(1)}km` : `${subDist}m`;
        } else if (subCals > 0) {
          substitutedPerRound = `${subCals} cal`;
        }
      }

      if (mov.calories && mov.calories > 0) {
        const totalCal = mov.calories;
        const personalCal = (!isIGUG && isPartner && !isTogether) ? Math.round(totalCal / (teamSize as number)) : totalCal;
        const partnerNote = isPartner && !isIGUG ? (isTogether ? 'together' : `your part ${personalCal} cal`) : undefined;
        const totalCalLine = rounds > 1 ? `${totalCal * personalRounds} cal total` : '';
        lines.push({ perRound: `${totalCal} cal`, name, total: totalCalLine, color: color ?? 'magenta', partnerNote, wasSubstituted, originalMovement, substitutionType, substitutedPerRound });
      } else if (mov.distance && mov.distance > 0) {
        const totalDist = mov.distance;
        const personalDist = (!isIGUG && isPartner && !isTogether) ? Math.round(totalDist / (teamSize as number)) : totalDist;
        const fmtTotal = totalDist >= 1000 ? `${(totalDist / 1000).toFixed(1)}km` : `${totalDist}m`;
        const fmtPersonal = personalDist >= 1000 ? `${(personalDist / 1000).toFixed(1)}km` : `${personalDist}m`;
        const partnerNote = isPartner && !isIGUG ? (isTogether ? 'together' : `your part ${fmtPersonal}`) : undefined;
        const distPersonalTotal = totalDist * personalRounds;
        const totalLine = rounds > 1 ? (distPersonalTotal >= 1000 ? `${(distPersonalTotal / 1000).toFixed(1)}km total` : `${distPersonalTotal}m total`) : '';
        lines.push({ perRound: fmtTotal, name, total: totalLine, color: color ?? 'magenta', partnerNote, wasSubstituted, originalMovement, substitutionType, substitutedPerRound });
      } else if (mov.reps && mov.reps > 0) {
        const totalReps = mov.reps;
        const personalRepsDisplay = (!isIGUG && isPartner && !isTogether) ? Math.round(totalReps / (teamSize as number)) : totalReps;
        const partnerNote = isPartner && !isIGUG ? (isTogether ? 'together' : `your part ${personalRepsDisplay}`) : undefined;
        lines.push({ perRound: `${totalReps}`, name, total: rounds > 1 ? `${totalReps * personalRounds} total` : '', color: color ?? 'magenta', weight: actual?.weight ?? rxW ?? undefined, unit: !isBodyweight ? unit : undefined, partnerNote, wasSubstituted, originalMovement, substitutionType, substitutedPerRound });
      }
    }
  }

  return lines.length > 0 ? lines : undefined;
}


function formatSegmentForExercise(ex: Exercise, globalFormat: string | undefined): string {
  const rx = normalizeIntervalNotation((ex.name || '') + ' ' + (ex.prescription || '')).toLowerCase();
  const hasAmrap = /amrap/i.test(rx);
  const hasEmom = /every\s+\d+:\d+|e\d+mom|emom/i.test(rx);
  if (hasAmrap && hasEmom) {
    const intervalMatch = rx.match(/every\s+(\d+):(\d+)\s*(?:min(?:ute)?s?)?\s*[x×]\s*(\d+)/i);
    if (intervalMatch) { const mins = parseInt(intervalMatch[1], 10); const sets = parseInt(intervalMatch[3], 10); return `${sets} × ${mins}:${intervalMatch[2]} AMRAP`; }
    return 'AMRAP Intervals';
  }
  if (hasAmrap) {
    const capMatch = rx.match(/(\d+)\s*min(?:ute)?s?\s*amrap/i) || rx.match(/amrap\s*:?\s*(\d{1,2})(?!\d|m)/i);
    const mins = capMatch ? parseInt(capMatch[1], 10) : 0;
    return mins > 0 ? `${mins} min AMRAP` : 'AMRAP';
  }
  if (hasEmom) {
    const intervalMatch = rx.match(/every\s+(\d+):(\d+)\s*(?:min(?:ute)?s?)?\s*[x×]\s*(\d+)/i);
    if (intervalMatch) { const mins = parseInt(intervalMatch[1], 10); const secs = parseInt(intervalMatch[2], 10); const sets = parseInt(intervalMatch[3], 10); const interval = secs > 0 ? `${mins}:${intervalMatch[2]}` : `${mins}`; return `E${interval}MOM × ${sets}`; }
    const capMatch = rx.match(/emom\s+(\d+)/i) || rx.match(/(\d+)\s*(?:min(?:ute)?s?)?\s*emom/i);
    const mins = capMatch ? parseInt(capMatch[1], 10) : 0;
    return mins > 0 ? `${mins} min EMOM` : 'EMOM';
  }
  if (/for\s*time|rft|\d+\s*rounds?\s*for\s*time/i.test(rx)) {
    const rounds = ex.rounds;
    if (rounds && rounds > 1) return `${rounds} RFT`;
    const roundMatch = rx.match(/(\d+)\s*(?:rounds?\s*(?:for\s*time)?|rft)/i);
    const r = roundMatch ? parseInt(roundMatch[1], 10) : 0;
    return r > 1 ? `${r} RFT` : 'For Time';
  }
  if (ex.type === 'strength' || /\d+x\d+|\d+\s*sets?\s*of/i.test(rx)) return 'Strength';
  if (/intervals?/i.test(rx)) { const sets = ex.sets?.length || ex.rounds || 0; return sets > 0 ? `${sets} Sets` : 'Intervals'; }
  const globalLabels: Record<string, string> = { for_time: 'For Time', amrap: 'AMRAP', amrap_intervals: 'AMRAP', emom: 'EMOM', intervals: 'Intervals', strength: 'Strength', tabata: 'Tabata' };
  return globalLabels[globalFormat || ''] || 'WOD';
}

function buildFormatLine(format: string | undefined, exercises: Exercise[], _durationMinutes: number, timeCap?: number, teamSize?: number): string | undefined {
  const formatLabels: Record<string, string> = { for_time: 'For Time', amrap: 'AMRAP', amrap_intervals: 'AMRAP', emom: 'EMOM', intervals: 'Intervals', strength: 'Strength', tabata: 'Tabata' };
  if (!format) return undefined;
  const partnerSuffix = teamSize && teamSize > 1 ? (teamSize === 2 ? ' · In Pairs' : ` · Team of ${teamSize}`) : '';
  if (exercises.length > 1 && format !== 'amrap_intervals') {
    const segments = exercises.map((ex) => formatSegmentForExercise(ex, format));
    const deduped = segments.filter((seg, i) => i === 0 || seg !== segments[i - 1]);
    return deduped.join(' + ') + partnerSuffix;
  }
  const label = formatLabels[format] || format.replace(/_/g, ' ');
  let base = label;
  if (format === 'amrap_intervals') {
    const ex = exercises[0];
    const count = exercises.length > 1 ? exercises.length : 0;
    const minMatch = (ex?.name || '').match(/(\d+)\s*min/i);
    const mins = minMatch ? parseInt(minMatch[1], 10) : 0;
    if (count > 0 && mins > 0) base = count + ' × ' + mins + ' MIN AMRAP';
    else if (count > 0) base = count + ' × AMRAP';
    else base = 'AMRAP Intervals';
  } else if (format === 'amrap') {
    const cap = timeCap ? Math.round(timeCap / 60) : 0;
    base = cap > 0 ? `${cap} min ${label}` : label;
  } else if (format === 'emom') {
    const ex = exercises[0];
    const intervalSets = ex?.sets?.length || 0;
    const normalizedPrescription = normalizeIntervalNotation(ex?.prescription || '');
    const intervalTime = normalizedPrescription.match(/every\s+(\d+:\d+)/i)?.[1] || normalizedPrescription.match(/(\d+:\d+)\s*min/i)?.[1];
    if (intervalSets > 0 && intervalTime) base = `${intervalSets} × every ${intervalTime}`;
    else { const cap = timeCap ? Math.round(timeCap / 60) : 0; base = cap > 0 ? `${cap} min ${label}` : label; }
  } else if (format === 'intervals') {
    const ex = exercises[0];
    const intervalSets = ex?.sets?.length || ex?.rounds || 0;
    const normalizedPrescription = normalizeIntervalNotation(ex?.prescription || '');
    const intervalTime = normalizedPrescription.match(/every\s+(\d+:\d+)/i)?.[1] || normalizedPrescription.match(/(\d+:\d+)\s*min/i)?.[1];
    if (intervalSets > 0 && intervalTime) base = `${intervalSets} × every ${intervalTime}`;
    else { const rounds = ex?.rounds; base = rounds && rounds > 1 ? `${rounds} Sets ${label}` : label; }
  } else if (format === 'for_time') {
    const ex = exercises[0];
    const hasSections = ex?.sections && ex.sections.length > 1;
    if (!hasSections) { const rounds = ex?.rounds; if (rounds && rounds > 1) base = `${rounds} Rounds ${label}`; }
  } else if (format === 'strength') {
    const ex = exercises[0];
    if (ex) {
      const completedSets = ex.sets.filter((s) => s.completed);
      const reps = completedSets[0]?.actualReps ?? completedSets[0]?.targetReps;
      if (completedSets.length > 0 && reps) base = `${completedSets.length}×${reps} ${ex.name}`;
    }
    // Strength work is individual even in team sessions — team designation belongs on the metcon
    return base;
  }
  return base + partnerSuffix;
}

function buildLadderStoryMovements(exercise: Exercise, movements: MovementTotal[]): StoryMovementLine[] | undefined {
  if (!movements || movements.length === 0) return undefined;
  const ladderReps = exercise.ladderReps!;
  const ladderStep = exercise.ladderStep!;
  const firstRung = ladderReps[0];
  const lastIdx = ladderStep - 1;
  const lastRung = lastIdx < ladderReps.length
    ? ladderReps[lastIdx]
    : (() => { const step = ladderReps.length >= 2 ? ladderReps[ladderReps.length - 1] - ladderReps[ladderReps.length - 2] : 2; return ladderReps[ladderReps.length - 1] + step * (lastIdx - ladderReps.length + 1); })();

  let expectedLadderSum = 0;
  for (let j = 0; j < ladderStep; j++) {
    if (j < ladderReps.length) { expectedLadderSum += ladderReps[j]; }
    else { const step = ladderReps.length >= 2 ? ladderReps[ladderReps.length - 1] - ladderReps[ladderReps.length - 2] : 2; expectedLadderSum += ladderReps[ladderReps.length - 1] + step * (j - ladderReps.length + 1); }
  }

  const lines: StoryMovementLine[] = [];
  for (const m of movements) {
    const name = m.name;
    const color = m.color;
    const isBodyweight = isBwVolumeMovement(name);
    const unit = m.unit === 'lb' ? 'lb' : 'kg';
    const displayName = m.weight && m.weight > 0 && !isBodyweight ? `${name} @${m.weight}${unit}` : name;
    const totalReps = m.totalReps || 0;
    const isLadderMov = totalReps > 0 && totalReps === expectedLadderSum;
    if (isLadderMov) {
      lines.push({ perRound: `${firstRung}→${lastRung}`, name: displayName, total: `${totalReps} reps total`, color: color ?? 'magenta', weight: m.weight });
    } else {
      const perRound = ladderStep > 0 && totalReps > 0 ? Math.round(totalReps / ladderStep) : totalReps;
      lines.push({ perRound: `${perRound}`, name: displayName, total: ladderStep > 1 && totalReps > 0 ? `×${ladderStep} = ${totalReps}` : '', color: color ?? 'magenta', weight: m.weight });
    }
  }
  return lines.length > 0 ? lines : undefined;
}

function buildMixedStoryMovements(exercises: Exercise[], movements: MovementTotal[], _rawText?: string): StoryMovementLine[] | undefined {
  const lines: StoryMovementLine[] = [];
  for (let exIdx = 0; exIdx < exercises.length; exIdx++) {
    const ex = exercises[exIdx];
    const rx = normalizeIntervalNotation((ex.name || '') + ' ' + (ex.prescription || '')).toLowerCase();
    const isStrength = ex.type === 'strength';
    const isEmom = /emom|e\d+mom|every\s+\d+:\d+/i.test(rx);
    const isAmrap = /amrap/i.test(rx);
    const isForTime = /for\s*time|rft/i.test(rx);
    const cleanName = ex.name.replace(/^(?:part\s+)?[A-Z][).:\s-]+/i, '').replace(/^(?:STRENGTH|METCON)\s*(?:\([^)]*\))?\s*[-:]\s*/i, '').trim() || ex.name;
    let headerLabel: string;
    let headerColor: 'yellow' | 'magenta' | 'cyan';
    if (isEmom && isAmrap) {
      const intervalMatch = rx.match(/every\s+(\d+):(\d+)\s*(?:min(?:ute)?s?)?\s*[x×]\s*(\d+)/i);
      if (intervalMatch) { const mins = parseInt(intervalMatch[1], 10); const sets = parseInt(intervalMatch[3], 10); headerLabel = `${sets} × ${mins}:${intervalMatch[2]} AMRAP`; }
      else { const rounds = ex.rounds || ex.sets?.length || 0; headerLabel = rounds > 0 ? `${rounds} × AMRAP` : 'AMRAP INTERVALS'; }
      headerColor = 'magenta';
    } else if (isEmom) {
      const intervalMatch = rx.match(/every\s+(\d+):(\d+)\s*(?:min(?:ute)?s?)?\s*[x×]\s*(\d+)/i);
      if (intervalMatch) { const mins = parseInt(intervalMatch[1], 10); const secs = parseInt(intervalMatch[2], 10); const sets = parseInt(intervalMatch[3], 10); const interval = secs > 0 ? `${mins}:${intervalMatch[2]}` : `${mins}`; headerLabel = `E${interval}MOM × ${sets}`; }
      else { const rounds = ex.rounds || ex.sets?.length || 0; headerLabel = rounds > 0 ? `EMOM × ${rounds}` : 'EMOM'; }
      headerColor = 'cyan';
    } else if (isAmrap) { headerLabel = cleanName.toUpperCase(); headerColor = 'magenta'; }
    else if (isForTime) { headerLabel = cleanName.toUpperCase(); headerColor = 'magenta'; }
    else if (isStrength) { const strengthMovName = ex.movements?.[0]?.name || cleanName.replace(/\s*\([^)]*\)\s*/g, '').trim(); headerLabel = `STRENGTH · ${(strengthMovName || cleanName).toUpperCase()}`; headerColor = 'yellow'; }
    else { headerLabel = cleanName.toUpperCase(); headerColor = 'magenta'; }

    lines.push({ perRound: '', name: '', total: '', sectionHeader: headerLabel, sectionColor: headerColor });

    const exMovements = ex.movements || [];
    const rounds = ex.rounds || ex.sets?.length || 1;
    if (exMovements.length > 0) {
      let lastStationLabel: string | undefined;
      for (const mov of exMovements) {
        if (mov.stationLabel && mov.stationLabel !== lastStationLabel) {
          lastStationLabel = mov.stationLabel;
          lines.push({ perRound: '', name: '', total: '', sectionHeader: mov.stationLabel.toUpperCase(), sectionColor: 'magenta' });
        }
        const actual = findMovementTotal(movements, mov.name, exIdx);
        const displayName = actual?.wasSubstituted ? actual.name : mov.name;
        const totalReps = actual?.totalReps;
        const totalCals = actual?.totalCalories;
        const totalDist = actual?.totalDistance;
        const color = actual?.color;
        const unit = actual?.unit === 'lb' ? 'lb' : 'kg';
        const perRoundReps = mov.reps || 0;
        const perRoundCals = mov.calories || 0;
        const perRoundDist = mov.distance || 0;
        const repScheme = formatRepScheme(ex.suggestedRepsPerSet);
        const isBodyweight = isBwVolumeMovement(displayName);
        const weight = actual?.weight ?? (mov.rxWeights?.male || mov.rxWeights?.female);
        let movProgression = actual?.weightProgression;
        if (!movProgression && isStrength && weight && ex.sets && ex.sets.length > 1) {
          const perSetW = ex.sets.map((s) => s.weight).filter((w): w is number => typeof w === 'number' && w > 0);
          if (perSetW.length > 1 && !perSetW.every((w) => w === perSetW[0])) movProgression = perSetW;
        }
        if (movProgression && movProgression.length > 1) {
          const wUnit = actual?.unit === 'lb' ? 'lb' : (mov.rxWeights?.unit || 'kg');
          const movTotalReps = totalReps || (perRoundReps > 0 && rounds > 0 ? perRoundReps * rounds : undefined);
          lines.push({ perRound: '', name: displayName, total: '', color: color ?? 'yellow', weightProgression: movProgression, unit: wUnit, strengthTotalReps: movTotalReps && movTotalReps > 0 ? movTotalReps : undefined });
          continue;
        }
        if (perRoundCals > 0 || totalCals) {
          const perVal = perRoundCals || (totalCals ? Math.round(totalCals / rounds) : 0);
          lines.push({ perRound: `${perVal} cal`, name: displayName, total: totalCals ? `${totalCals} cal total` : '', color: color ?? 'magenta' });
        } else if (perRoundDist > 0 || totalDist) {
          const perVal = perRoundDist || (totalDist ? Math.round(totalDist / rounds) : 0);
          const dist = perVal >= 1000 ? `${(perVal / 1000).toFixed(1)}km` : `${perVal}m`;
          lines.push({ perRound: dist, name: displayName, total: totalDist ? (totalDist >= 1000 ? `${(totalDist / 1000).toFixed(1)}km total` : `${totalDist}m total`) : '', color: color ?? 'magenta' });
        } else if (perRoundReps > 0 || totalReps) {
          const perVal = repScheme ?? `${perRoundReps || (totalReps ? Math.round(totalReps / rounds) : 0)}`;
          lines.push({ perRound: perVal, name: displayName, total: totalReps && (rounds > 1 || repScheme) ? `${totalReps} total` : '', color: color ?? 'magenta', weight: !isBodyweight ? weight : undefined, unit: !isBodyweight ? unit : undefined });
        }
      }
    } else {
      const sets = ex.sets || [];
      const perSetWeights: number[] = [];
      for (const set of sets) { if (set.weight && set.weight > 0) perSetWeights.push(set.weight); }
      const hasVarying = perSetWeights.length > 1 && !perSetWeights.every((w) => w === perSetWeights[0]);
      let burnout: { reps: number; weight: number } | undefined;
      const completedSets = sets.filter((s) => s.completed && s.actualReps && s.actualReps > 0);
      if (completedSets.length >= 2) {
        const lastSet = completedSets[completedSets.length - 1];
        const prevSet = completedSets[completedSets.length - 2];
        if (lastSet.isMax || (lastSet.actualReps! > prevSet.actualReps! && lastSet.weight && lastSet.weight < Math.max(...perSetWeights))) {
          burnout = { reps: lastSet.actualReps!, weight: lastSet.weight || 0 };
        }
      }
      const strengthTotalReps = completedSets.reduce((sum, s) => sum + (s.actualReps || 0), 0);
      const cleanExName = ex.name.replace(/^(?:part\s+)?[A-Z][).:\s-]+/i, '').replace(/^(?:STRENGTH|METCON)\s*(?:\([^)]*\))?\s*[-:]\s*/i, '').trim() || ex.name;
      if (hasVarying) {
        const ladderWeights = burnout ? perSetWeights.slice(0, -1) : perSetWeights;
        lines.push({ perRound: '', name: cleanExName, total: '', color: 'yellow', weightProgression: ladderWeights, unit: 'kg', burnout, strengthTotalReps: strengthTotalReps > 0 ? strengthTotalReps : undefined });
      } else if (perSetWeights.length > 0) {
        const matched = findMovementTotal(movements, ex.name, exIdx);
        lines.push({ perRound: `${perSetWeights[0]}`, name: ex.name, total: matched?.totalReps ? `${matched.totalReps} reps` : '', color: 'yellow', weight: perSetWeights[0], unit: 'kg', strengthTotalReps: strengthTotalReps > 0 ? strengthTotalReps : undefined });
      }
    }
  }
  return lines.length > 0 ? lines : undefined;
}

export function computeHeroResult(
  exercises: Exercise[],
  format: string | undefined,
  _totalVolume: number,
  totalEP: number,
  durationMinutes: number,
  isPR: boolean,
  movements: MovementTotal[],
  timeCap?: number,
  prMovementName?: string,
  prWeight?: number,
  teamSize?: number,
  rawText?: string,
): HeroResult {
  const storyLine = buildAccomplishmentStory(movements);
  const formatLine = buildFormatLine(format, exercises, durationMinutes, timeCap, teamSize);
  const isMixed = exercises.length > 1;
  const singleExerciseRounds = !isMixed
    ? (exercises[0]?.sets?.filter((s) => s.completed)?.length || exercises[0]?.sets?.length || 1)
    : 1;

  function buildStory(rounds: number = 1): ReturnType<typeof buildStoryMovements> {
    if (isMixed) return buildMixedStoryMovements(exercises, movements, rawText);
    const ex = exercises[0];
    if (ex?.ladderReps && ex.ladderReps.length > 0 && ex.ladderStep != null && ex.ladderStep > 0) return buildLadderStoryMovements(ex, movements);
    if (ex?.sections && ex.sections.length > 1) return buildSectionedStoryMovements(ex.sections, movements, teamSize, 0);
    const originalOrder = ex?.movements?.map((m) => normalizeStampMovementName(m.name)) ?? [];
    const orderedMovements = originalOrder.length > 1
      ? [...movements].sort((a, b) => {
          const findIdx = (name: string) => {
            const norm = normalizeStampMovementName(name);
            let i = originalOrder.findIndex((n) => n === norm);
            if (i === -1) i = originalOrder.findIndex((n) => n.includes(norm) || norm.includes(n));
            return i === -1 ? 999 : i;
          };
          const ai = Math.min(findIdx(a.name), a.originalMovement ? findIdx(a.originalMovement) : 999);
          const bi = Math.min(findIdx(b.name), b.originalMovement ? findIdx(b.originalMovement) : 999);
          return ai - bi;
        })
      : movements;
    return buildStoryMovements(orderedMovements, rounds, teamSize, ex?.suggestedRepsPerSet);
  }

  if (isPR && prWeight) {
    return { value: `${prWeight}`, unit: 'KG PR', subtitle: prMovementName?.toUpperCase(), formatLine, storyLine, storyMovements: buildStory(1), accentClass: 'accentGold' };
  }

  const amrapExercise = isMixed
    ? exercises.find((ex) => /amrap/i.test((ex.name + ' ' + ex.prescription).toLowerCase()))
    : (format === 'amrap' || format === 'amrap_intervals') ? exercises[0] : undefined;

  if (amrapExercise) {
    const isLadder = amrapExercise.ladderReps && amrapExercise.ladderReps.length > 0 && amrapExercise.ladderStep != null;
    if (isLadder) {
      // An AMRAP ladder score IS rounds + partial reps — lead with that ("6 +10"), not a raw
      // rep count nobody watching can verify. amrapExercise.sets[0].actualReps is the scaling
      // movements' combined total (per-movement reps × movement count, used for the workload
      // breakdown) — it is NOT "total reps for the workout" and must never be shown as the hero.
      const step = amrapExercise.ladderStep || 0;
      if (step > 0) {
        const partial = amrapExercise.ladderPartial || 0;
        return {
          value: `${step}`,
          unit: partial > 0 ? `+${partial}` : undefined,
          formatLine, storyLine,
          storyMovements: buildStory(step),
          accentClass: 'accentMagenta',
          // The poster never carries a rep total for a ladder score (no way to verify it at a
          // glance) — just which round the partial is logged into, beside the rounds+partial hero.
          ladderIntoRound: partial > 0 ? step + 1 : undefined,
        };
      }
    }
    // Alternating-station interval AMRAP: exercise.rounds is the prescribed interval count
    // (the "× 6" on the clock), never a logged score — the real score is the reps accumulated
    // on the max-effort movements ("Max Devil Press" + "Max Sit-up" → 39 reps). Prescribed
    // structure must never become the hero.
    // Gate on STRUCTURAL markers only, never countingMode — a post-processor bug (fixed
    // 2026-07-06) stamped per_station_visit onto plain-AMRAP movements in multi-part sessions,
    // and those exercises DO have a real logged rounds score that must stay the hero.
    const stationMovements = amrapExercise.movements ?? [];
    const isStationRotation = stationMovements.some((m) =>
      m.stationLabel != null || m.stationIndex != null);
    if (isStationRotation) {
      const maxTotalReps = stationMovements
        .filter((m) => m.isMaxReps || /\bmax\b/i.test(m.name))
        .reduce((sum, m) => sum + (findBreakdownForParsedMovement(m, movements)?.totalReps || 0), 0);
      if (maxTotalReps > 0) {
        return {
          value: `${maxTotalReps}`,
          unit: 'REPS',
          formatLine, storyLine,
          storyMovements: buildStory(amrapExercise.rounds || 1),
          accentClass: 'accentMagenta',
        };
      }
      // No max-effort reps logged — fall through to calories/EP/duration, never the structure.
    } else {
      const totalRounds = (format === 'amrap_intervals' && exercises.length > 1)
        ? exercises.reduce((sum, ex) => sum + (ex.rounds || 0), 0)
        : (amrapExercise.rounds || 0);
      if (totalRounds > 0) return { value: formatAmrapRounds(totalRounds), unit: 'ROUNDS', formatLine, storyLine, storyMovements: buildStory(Math.floor(totalRounds)), accentClass: 'accentMagenta' };
    }
  }

  const metconEx = findMetconExercise(exercises);
  const metconTime = metconEx.sets.find((s) => s.completed && s.time && s.time > 0)?.time;
  const anyTime = exercises.flatMap((ex) => ex.sets).find((s) => s.completed && s.time && s.time > 0)?.time;
  const cadenceText = [rawText, ...exercises.flatMap((ex) => [ex.name, ex.prescription])].filter(Boolean).join(' ');
  const isFixedCadence = /\b(?:emom|e\d+mom|every\s+\d+(?::\d{2})?\s*(?:min(?:ute)?s?)?)\b/i.test(cadenceText);
  const prescribedCadenceRounds = isFixedCadence ? getPrescribedRoundCount(exercises, rawText) : undefined;
  const isForTimeFormat = format === 'for_time' || (format === 'intervals' && !prescribedCadenceRounds);
  const metconIsForTime = isMixed && /for\s*time|rft|\d+\s*rounds?\s*for/i.test((metconEx.name + ' ' + metconEx.prescription).toLowerCase());

  if (isForTimeFormat || metconIsForTime) {
    const heroTime = metconTime ?? anyTime;
    const fallbackDurationSeconds = durationMinutes > 0 ? Math.round(durationMinutes * 60) : 0;
    if (heroTime || fallbackDurationSeconds > 0) {
      const rounds = metconEx.rounds || (!isMixed ? singleExerciseRounds : 1);
      const displayTime = heroTime
        ? (isMixed && fallbackDurationSeconds > heroTime ? fallbackDurationSeconds : heroTime)
        : fallbackDurationSeconds;
      return { value: fmtTimeSocial(displayTime), unit: 'MIN', formatLine, storyLine, storyMovements: buildStory(rounds), accentClass: 'accentMagenta' };
    }
  }

  const emomHasCardio = format === 'emom' && movements.some((m) => (m.totalCalories || 0) > 0 || (m.totalDistance || 0) > 0);

  // Fixed-cadence EMOM/intervals: the score is the prescribed structure, not a finish time.
  if ((format === 'emom' || (format === 'intervals' && prescribedCadenceRounds)) && !emomHasCardio) {
    const ex0 = exercises[0];
    const prescribedRounds =
      prescribedCadenceRounds ??
      getPrescribedRoundCount(exercises, rawText) ??
      ex0?.intervalCount ??
      ex0?.sets?.length ??
      0;
    if (prescribedRounds > 0) {
      return {
        value: `${prescribedRounds}`,
        unit: 'ROUNDS',
        formatLine, storyLine,
        storyMovements: buildStory(prescribedRounds),
        accentClass: 'accentMagenta',
      };
    }
  }

  if ((format === 'strength' || isMixed) && format !== 'amrap_intervals') {
    const allWeights = exercises.flatMap((ex) => ex.sets.filter((s) => s.completed).map((s) => s.weight ?? 0));
    const peak = Math.max(...allWeights, 0);
    if (peak > 0) return { value: `${peak}`, unit: 'KG', formatLine, storyLine, storyMovements: buildStory(singleExerciseRounds), accentClass: 'accentGold' };
  }

  const totalCaloriesAcrossMovements = movements.reduce((sum, m) => sum + (m.totalCalories || 0), 0);
  const topCalorieMovement = [...movements].filter((m) => (m.totalCalories || 0) > 0).sort((a, b) => (b.totalCalories || 0) - (a.totalCalories || 0))[0];
  // For cardio-based EMOMs, any logged calories are the meaningful result — no minimum threshold
  if ((totalCaloriesAcrossMovements >= 50 || (format === 'emom' && emomHasCardio && totalCaloriesAcrossMovements > 0)) && topCalorieMovement) {
    const storyWithoutCalTotal = buildStory(singleExerciseRounds)?.map((line) => (line.total?.endsWith('cal total') ? { ...line, total: '' } : line));
    return { value: `${totalCaloriesAcrossMovements}`, unit: 'CAL', subtitle: topCalorieMovement.name.toUpperCase(), formatLine, storyLine, storyMovements: storyWithoutCalTotal, accentClass: 'accentMagenta' };
  }

  if (totalEP > 0) return { value: `+${totalEP}`, unit: 'EP', formatLine, storyLine, storyMovements: buildStory(singleExerciseRounds), accentClass: 'accentGreen' };
  if (durationMinutes > 0) return { value: `${durationMinutes}`, unit: 'MIN', formatLine, storyLine, accentClass: 'accentMagenta' };

  return { value: '✓', unit: '', formatLine, storyLine, accentClass: 'accentCyan' };
}

// Suppress unused import warning — ParsedSection and ParsedSectionType are used
// indirectly via the sections parameter type in buildSectionedStoryMovements
void (undefined as unknown as ParsedSection);
void (undefined as unknown as ParsedSectionType);
