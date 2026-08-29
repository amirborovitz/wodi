/**
 * posterData.ts — PosterWod data structure + builder from CelebrationData.
 *
 * buildPosterWod() converts CelebrationData (computed by useCelebrationData)
 * into the flat PosterWod shape that the three skin components render.
 *
 * rowsOf() flattens a PosterWod into a mixed array of block-header rows and
 * movement line rows — exactly matching the design reference.
 */

import type { CelebrationData } from '../../../../hooks/useCelebrationData';
import type { ArtifactSection, ArtifactRow, StoryMovementLine, HeroResult } from '../../types';
import type { Exercise, MovementTotal, Achievement } from '../../../../types';
// Value import from helpers directly (not the useCelebrationData re-export): the hook module
// transitively initializes Firebase, which the Node poster-corpus harness must never load.
import { shouldLogCelebrationDebug, prescribesSingleMovement } from '../../helpers';
import { formatLoggedLoad } from '../../posterFormatters';
import { getExercisePeakLoad } from '../../movementResolution';
import { timeCapLabelFromText } from '../../../../utils/timeCap';
import { isMaxEffortPractice } from '../../mainPart';
import { prescribesUnbrokenMax } from '../../../logging/story/types';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface PosterTotal {
  label: string; // 'REPS', 'KM', 'CAL', 'TONS'
  value: string;
}

export interface PosterWod {
  type: string;         // 'FOR TIME', 'AMRAP', 'STRENGTH', …
  title: string | null; // Named WOD title (CINDY, FRAN…) or null
  date: string;         // '14 MAY 26'
  format: string;       // '12 ROUNDS', '4 SETS', '12-MIN AMRAP'
  sub: string;          // '30 MIN CAP', 'build to heavy', …
  // Strength only: every completed set's reps spelled out in full ("6-6-5-4-3 reps"), never
  // truncated. Rendered as a quiet sub-line under the movement row, separate from `format`
  // (which states only the set count) — see formatPosterStrengthRepsSequence.
  repsScheme?: string;
  blocks: PosterBlock[];
  // meta: quiet context beside the hero score — "12:00 CAP" for a plain AMRAP, or "into round 7"
  // for a ladder AMRAP's partial reps. No rep-total field by design — the poster never carries a
  // checkable reps total for a ladder score; see buildAmrapResultMeta.
  // The hero. `scores` is present ONLY for a piece made of several independently-timed blocks
  // (two 6-minute AMRAPs, four 3-minute windows — any number): one clock, one score, and no
  // total, because adding independent scores gives a number that describes no part of the
  // workout. Skins that see it render every entry side by side in the hero slot instead of
  // `value`, and the block header rows drop their own copy so each number is printed once.
  result: { label: string; value: string; meta?: string; narrative?: string; scores?: PosterHeroScore[] };
  rx: string | null;    // "RX'D" | "PR" | null
  totals: PosterTotal[]; // Supporting stats for the brand strip
  ep: number;            // Effort Points — shown in brand strip
  teamSize: number;      // Partner workout team size (1 = solo) — SESSION-level, set once by the
                         // AI for the whole multi-part workout. Never use this alone to decide
                         // whether THIS page/card shows partner UI — a sibling part being
                         // partnered does not make this one partnered. Use isPartnerConfirmed.
  // True only when this specific card/page's own content confirmed partner/round-trade language
  // (derived from ArtifactSection.isPartnerConfirmed). Gates ALL partner-specific poster UI —
  // round ledger, TEAM|ME header, "OUR ___" hero label, format-line override. False for an
  // unconfirmed part even when teamSize > 1 at the session level (e.g. a solo strength block
  // sharing a session with a partnered metcon).
  isPartnerConfirmed: boolean;
  // Partner-workout display mode. 'rounds' (partners trade whole rounds, IGUG) means skins must
  // render the round ledger (`rounds` below) instead of a per-movement personal number. 'reps'
  // (flat shared total, no round structure) keeps the existing per-movement TEAM|ME number.
  // 'sections' keeps partner hero/title treatment but renders section prescription rows without
  // a ledger or TEAM/ME header.
  // Meaningless unless isPartnerConfirmed is true.
  split: 'reps' | 'rounds' | 'sections';
  // Round-ledger chips — only present when split === 'rounds'. 'me'/'partner' = whose round;
  // 'pending' = not yet reached (time-capped/partial finish), a flat symbolic state never a
  // computed partial.
  rounds?: ('me' | 'partner' | 'pending')[];
}

export interface PosterHeroScore {
  /** Which clock this number came off — the board's own shorthand ("B.1", "A"). */
  label: string;
  value: string;
  unit?: string;
}

export interface PosterBlock {
  kind: 'block';
  label: string;
  cap?: string;
  score?: string;
  scoreSub?: string;
  /**
   * This header opens a block that ran its own clock, so skins draw a rule across the rest of
   * the row. A gap is not a boundary: without the rule, two separately-timed AMRAPs read as one
   * list with a blank line in it, and nothing on the card says where the first clock stopped.
   */
  ruled?: boolean;
}

export interface PosterLine {
  kind: 'line';
  rx: string;   // "10 Deadlift"
  load: string; // "60/40kg" (prescribed)
  mine: string; // "60kg" (what user did)
  total?: string;
  team: string; // "50" — per-partner share of the prescribed total (partner workouts only)
  // True only when `team` really is a partner share (ArtifactRow.teamShare). The team/me slots
  // are also reused for unrelated "value + load" pairs on solo posters, so this is what tells a
  // genuine TEAM|ME row from that reuse — without it the pairs legend labels a total and a
  // barbell weight as if they were the two athletes' numbers.
  isPartnerShare?: boolean;
  roundLabel?: string; // "R1", "R2", "BUY-IN" — rendered as a chip, not baked into rx
  // Ascending-ladder AMRAP bar-chart track — see ArtifactRow.ladderTrack. When present, skins
  // render the normal rx/load/mine row AND additionally render this chart right below it.
  ladderTrack?: { reps: number[]; step: number; partial?: number; partialMoves?: { done: number; total: number }; cadence?: string; complete?: boolean };
}

export type PosterRow = PosterBlock | PosterLine;

// ─── rowsOf ───────────────────────────────────────────────────────────────

/**
 * Flattens PosterWod.blocks into a mixed array of block-header + line rows.
 * Lines are synthesised from the block's own rows array (attached during build).
 */
export function rowsOf(wod: PosterWod): PosterRow[] {
  return (wod as PosterWodInternal)._rows ?? [];
}

// Internal shape — rows are stored on a hidden field during build to avoid
// bloating the public interface with a multi-level structure.
interface PosterWodInternal extends PosterWod {
  _rows: PosterRow[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────

const GENERIC_TITLE_PATTERNS = [
  /^today'?s\s+workout$/i,
  /^workout$/i,
  /^wod$/i,
  /^my\s+workout$/i,
  // Format-description strings that get stored as titles
  /^for\s+time$/i,
  /^amrap$/i,
  /^strength$/i,
  /^metcon$/i,
  /^emom$/i,
  /^tabata$/i,
  /^intervals?$/i,
  /^\d+\s*(?:rounds?|times?)\s+for\s+time$/i,   // "5 Rounds For Time", "8 Times For Time"
  /^\d+\s*rounds?$/i,                 // "5 Rounds"
  /^\d+\s*sections?\s+for\s+time(?:\s*[•·-]\s*.*)?$/i,
  /^\d+[-\s]min\s+amrap$/i,           // "12-Min AMRAP"
  /^amrap\s+\d+(\s*min)?$/i,          // "AMRAP 12", "AMRAP 12 Min"
  /^pairs?\s+amrap(\s+\d+)?(\s*min)?$/i, // "Pairs AMRAP 12" — pair-paced; the pairs story lives in the structure sub-line
  /^\d+[-\s]min\s+emom$/i,
  /^\d+\s*min\s+cap$/i,
];

// EMOM cadence strings (e.g. "EVERY 4:00 MIN X 4 ROUNDS") — not a WOD name, so suppress
// as the poster title, but keep for block-section blueprint rendering (structural context).
const CADENCE_TITLE_PATTERNS = [
  /^every\s+[\d:]+\s*min(?:ute)?s?\s*(?:x|×)\s*\d+/i,
];

function isGenericTitle(title: string): boolean {
  const t = title.trim();
  return GENERIC_TITLE_PATTERNS.some((p) => p.test(t))
    || CADENCE_TITLE_PATTERNS.some((p) => p.test(t));
}

// Suppress section headers that are just describing the workout format — but NOT round/section
// counts like "3 ROUNDS" or "6 SECTIONS FOR TIME": those are structural labels a per-section
// block header exists to show, not a redundant restatement of the page's format badge. Listed
// explicitly (not spread from GENERIC_TITLE_PATTERNS) so the two lists can't drift back together.
const FORMAT_HEADER_PATTERNS = [
  /^today'?s\s+workout$/i,
  /^workout$/i,
  /^wod$/i,
  /^my\s+workout$/i,
  /^for\s+time$/i,
  /^amrap$/i,
  /^strength$/i,
  /^metcon$/i,
  /^emom$/i,
  /^tabata$/i,
  /^intervals?$/i,
  /^\d+[-\s]min\s+amrap$/i,
  /^amrap\s+\d+(\s*min)?$/i,
  /^pairs?\s+amrap(\s+\d+)?(\s*min)?$/i,
  /^\d+[-\s]min\s+emom$/i,
  /^\d+\s*min\s+cap$/i,
  ...CADENCE_TITLE_PATTERNS,
  /^the\s+wod$/i,
  /^the\s+workout$/i,
];

function isFormatHeader(title: string): boolean {
  return FORMAT_HEADER_PATTERNS.some((p) => p.test(title.trim()));
}

function normalizePosterHeaderText(value: string | null | undefined): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/[\u00d7x]/g, 'x')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

interface PosterHeaderContext {
  title?: string | null;
  type?: string;
  format?: string;
  sub?: string;
  /**
   * The hero is printing every block's score. The block header rows then carry the label and the
   * clock only — a second copy of the same number beside the prescription is what made the real
   * result look like a load annotation instead of the result.
   */
  hasScoreboard?: boolean;
}

function isDuplicatePosterHeader(value: string | null | undefined, context: PosterHeaderContext): boolean {
  const normalized = normalizePosterHeaderText(value);
  if (!normalized) return false;

  return [context.title, context.type, context.format, context.sub]
    .some((candidate) => normalizePosterHeaderText(candidate) === normalized);
}

// A "N rounds/times/sections for time" header — whether it arrives as a section title or as its
// blueprint cap — is fully restated by the poster's FOR TIME type tag plus the "N ROUNDS" format
// badge. Rendered again as a block header it just duplicates the badge (and, when both the label
// AND the cap are this phrase, duplicates itself — e.g. "8 TIMES FOR TIME" over "8 ROUNDS FOR
// TIME"). Recognise that equivalence so the redundant header is dropped even when the poster
// title is a distinct real WOD name (which stops isDuplicatePosterHeader from catching it).
function isRoundCountForTimeCoveredByFormat(
  value: string | null | undefined,
  context: PosterHeaderContext,
): boolean {
  const match = normalizePosterHeaderText(value).match(
    /^(\d+) (?:rounds?|times?|sections?) for time$/,
  );
  if (!match) return false;
  const typeIsForTime = normalizePosterHeaderText(context.type).includes('for time');
  const formatMatch = normalizePosterHeaderText(context.format).match(/^(\d+) rounds?$/);
  return typeIsForTime && !!formatMatch && formatMatch[1] === match[1];
}

// A bare cadence header ("EVERY 1:30") next to a format line that already states that cadence
// WITH its count ("8 × EVERY 1:30") is the same sentence twice, minus the useful half. Recognise
// the containment so the block header drops out and the count-bearing line speaks alone.
function isCadenceCoveredByFormat(
  value: string | null | undefined,
  context: PosterHeaderContext,
): boolean {
  const normalized = normalizePosterHeaderText(value);
  if (!normalized.startsWith('every ') && !normalized.startsWith('emom ')) return false;
  const format = normalizePosterHeaderText(context.format);
  return format !== normalized && format.endsWith(normalized);
}

function mapFormatToType(format: string | undefined): string {
  switch (format) {
    case 'for_time':        return 'FOR TIME';
    case 'amrap':           return 'AMRAP';
    case 'amrap_intervals': return 'AMRAP';
    case 'intervals':       return 'INTERVALS';
    case 'emom':            return 'EMOM';
    case 'strength':        return 'STRENGTH';
    case 'tabata':          return 'TABATA';
    default:                return 'METCON';
  }
}

export function getPrimaryCarouselPageIndex(data: CelebrationData): number {
  const pages = data.carouselPageData;
  if (!pages || pages.length === 0) return 0;
  const forTimeIndex = pages.findIndex((page) => {
    const ex = page.exercise as unknown as Record<string, unknown>;
    return !page.isStrength && ex['loggingMode'] === 'for_time';
  });
  if (forTimeIndex >= 0) return forTimeIndex;
  const metconIndex = pages.findIndex((page) => !page.isStrength);
  return metconIndex >= 0 ? metconIndex : 0;
}

function formatWorkoutDate(date: Date): string {
  // "5 JUN 26"
  return date
    .toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: '2-digit' })
    .toUpperCase()
    .replace(',', '');
}

/** "2026-06-11" → "11 JUN 26"; null when the string isn't a valid ISO date. */
export function formatIsoPosterDate(iso: string): string | null {
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);
  const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const monthLabel = monthNames[month - 1];
  if (!monthLabel || day < 1 || day > 31) return null;
  return `${day} ${monthLabel} ${String(year).slice(-2)}`;
}

function formatSourceDate(sourceDate: string | undefined, fallbackDate: Date): string {
  return (sourceDate ? formatIsoPosterDate(sourceDate) : null) ?? formatWorkoutDate(fallbackDate);
}

function getPosterCompletedStrengthSets(exercise: Exercise): NonNullable<Exercise['sets']> {
  return exercise.sets.filter((set) => set.completed && ((set.actualReps ?? set.targetReps ?? 0) > 0));
}

// The scheme line replaces the clock on a strength day — a SET COUNT, never a sets×reps
// figure. Reps almost always vary set to set on a build-up day, so "4×4" reads as a promise
// the workout doesn't keep; "4 SETS" states only what's actually constant.
function formatPosterStrengthScheme(exercise: Exercise): string | undefined {
  const completed = getPosterCompletedStrengthSets(exercise);
  if (completed.length === 0) return undefined;
  return `${completed.length} SETS`;
}

// A set's rep count is a story only when the SET IS ONE MOVEMENT ("6-6-5-4-3" on a deadlift
// build-up). When the piece puts several movements in one set — a complex ("1 squat clean +
// 1 front squat + 1 push jerk") or a strength circuit ("5 press / 10/10 DB row / 8/8 SLDL") —
// actualReps is their SUM (3, 23): a number no coach wrote and no athlete entered, which reads
// as a rep scheme and isn't one. The row name spells out each movement's own reps instead —
// buildCelebrationMovementRow gates that on the SAME predicate, so exactly one of the two
// always speaks.
//
// Every set's reps spelled out in full ("6-6-5-4-3"), never ellipsized or collapsed — the
// climbing/descending reps across sets are the whole story of a build-up day. Lives on the
// movement row as a quiet sub-line, separate from the scheme line above (which only states
// the set count).
export function formatPosterStrengthRepsSequence(exercise: Exercise): string | undefined {
  if (!prescribesSingleMovement(exercise)) return undefined;
  const completed = getPosterCompletedStrengthSets(exercise);
  const reps = completed
    .map((set) => set.actualReps ?? set.targetReps)
    .filter((rep): rep is number => typeof rep === 'number' && rep > 0);
  if (reps.length === 0) return undefined;
  return `${reps.join('-')} reps`;
}

/**
 * The structure line under the poster's type pill ("12 MIN", "5 × 3", "8 ROUNDS").
 *
 * Exported for tests only: it reads a part off the session and the choice of WHICH part is the
 * whole bug it exists to not have — worth a regression net without standing up a full
 * CelebrationData to reach it.
 */
export function buildFormatLine(data: CelebrationData): string {
  if (data.artifactSections[0]?.partnerDisplayMode === 'sections') {
    return 'FOR TIME';
  }
  // Confirmed-partner workouts: trust the artifact blueprint over independent format guesses.
  if (data.artifactSections[0]?.isPartnerConfirmed) {
    const sectionBlueprint = data.artifactSections[0]?.blueprint;
    if (sectionBlueprint) return sectionBlueprint.toUpperCase();
  }

  // Prefer heroResult.formatLine if it looks meaningful
  if (data.heroResult?.formatLine) {
    const fl = data.heroResult.formatLine.toUpperCase();
    if (fl && fl !== 'WORKOUT') return fl;
  }

  const fmt = data.workoutFormat;
  // The part the format line is DESCRIBING, not the session's first exercise. `fmt` is already
  // the main part's own format, so pairing it with exercises[0] mixed two different blocks: a
  // metcon EMOM read its set count off the 3-set core accessory logged before it and the poster
  // announced "3 SETS". Falls back to the raw list for a session with no main part flagged.
  const exercises = data.posterMainExercises.length > 0 ? data.posterMainExercises : data.exercises;
  const ex0 = exercises[0];

  // The FormatTag pill already states the format word (AMRAP/EMOM/FOR TIME/etc) — the design
  // doc's hierarchy explicitly forbids repeating it here ("NEVER: Repeat the workout name in
  // the title AND subtitle"). This line's job is to add the structure detail the pill can't
  // carry (duration, set count, rounds), not restate the format.
  if ((fmt === 'amrap' || fmt === 'amrap_intervals') && data.durationMinutes > 0) {
    return `${data.durationMinutes} MIN`;
  }
  if (fmt === 'emom' && ex0) {
    // A station EMOM's interval count is not a set count an athlete recognises — 25 intervals is
    // five rounds through five stations, and "25 SETS" reads as 25 rounds. The blueprint block
    // above the rows already states the clock, the rounds and the work/rest, so say nothing.
    const stationCount = new Set(
      (ex0.movements ?? []).map((m) => m.stationLabel?.trim()).filter(Boolean),
    ).size;
    if (stationCount > 1) return '';
    const intervalCount = ex0.intervalCount ?? ex0.sets?.length;
    if (intervalCount && intervalCount > 1) return `${intervalCount} SETS`;
  }
  if ((fmt === 'strength' || ex0?.type === 'strength') && ex0) {
    const scheme = formatPosterStrengthScheme(ex0);
    if (scheme) return scheme;
    const sets = ex0.sets?.length;
    if (sets && sets > 0) {
      const repsPerSet = ex0.suggestedRepsPerSet?.[0] ?? ex0.sets?.[0]?.targetReps;
      if (repsPerSet) return `${sets} × ${repsPerSet}`;
      return `${sets} SETS`;
    }
  }
  if (fmt === 'for_time') {
    const rounds = ex0?.rounds;
    if (rounds && rounds > 1) return `${rounds} ROUNDS`;
    return 'FOR TIME';
  }
  if (fmt === 'intervals' && ex0) {
    const ic = ex0.intervalCount ?? ex0.sets?.length;
    if (ic && ic > 1) return `${ic} INTERVALS`;
  }

  return mapFormatToType(fmt);
}

// Sectioned partner sub-line. Counts only sections that render as blocks — the sections
// array may lead with a rows-less 'Blueprint' header section carrying the format line
// (see buildPageArtifactSections), which is not a block the athlete sees.
// Exported for the poster-corpus harness.
const COUNT_WORDS: Record<number, string> = { 2: 'two', 3: 'three', 4: 'four', 5: 'five' };

export function partnerBlocksSub(
  sections: CelebrationData['artifactSections'],
  teamSize?: number,
): string {
  const blockCount = sections.filter((section) => section.rows.length > 0).length;
  const blocks = `${COUNT_WORDS[blockCount] ?? blockCount} blocks`;
  // "your partner" is singular for a pair only. A team of four has three of them, and calling
  // them one partner is the same team-of-2 assumption that used to halve their numbers.
  const squad = !teamSize || teamSize <= 2
    ? 'you & your partner'
    : `your team of ${COUNT_WORDS[teamSize] ?? teamSize}`;
  return `${squad} - ${blocks}`;
}

function buildSubLine(data: CelebrationData): string {
  if (data.artifactSections[0]?.partnerDisplayMode === 'sections') {
    return partnerBlocksSub(data.artifactSections, data.teamSize);
  }
  if (data.artifactSections[0]?.isPartnerConfirmed) {
    return '';
  }
  const fmt = data.workoutFormat;
  const ex0 = data.exercises[0];
  // A load cue over a practice that never touched a weight.
  if (data.exercises.length === 1 && ex0 && isMaxEffortPractice(ex0)) return '';
  if (fmt === 'strength') {
    return 'build to heavy';
  }
  if ((fmt === 'amrap' || fmt === 'amrap_intervals') && data.durationMinutes > 0) {
    return `${Math.round(data.durationMinutes)} min`;
  }
  const cap = explicitTimeCapSub(ex0, data.rawText);
  if (cap) return cap;
  return '';
}

/**
 * This exercise's own prescribed AMRAP duration, in minutes — extracted ONLY from its own
 * rawText/prescription/name (never the shared workout-level rawText), so in a multi-part
 * workout a sibling block's duration can never bleed onto this one's poster page. Mirrors
 * extractTimeCap's AMRAP pattern in workoutPostProcessor.ts, scoped per-exercise.
 */
function extractAmrapMinutes(exercise: CelebrationData['exercises'][number] | undefined): number | undefined {
  if (!exercise) return undefined;
  const source = `${exercise.rawText ?? ''} ${exercise.prescription ?? ''} ${exercise.name ?? ''}`;
  const match = source.match(/(\d+)\s*min(?:ute)?s?\s*amrap/i) ?? source.match(/amrap\s*(\d+)\s*min/i);
  return match ? parseInt(match[1], 10) : undefined;
}

// The clock must always land on an AMRAP poster (design spec: "one round, stated plainly …
// × UNTIL CLOCK"). The format line ("20 MIN") may only be dropped when the title actually
// carries the duration — a blanket isAmrap clear erases the clock entirely both when the
// title was nulled as a duplicate of the format and when the workout has a real name.
function dedupeAmrapFormat(
  title: string | null,
  format: string,
  type: string,
  isAmrap: boolean,
  amrapMinutes: number | undefined,
): string {
  if (isAmrap && amrapMinutes) {
    const titleCarriesClock = !!title && title.toUpperCase().includes(`${amrapMinutes} MIN`);
    return titleCarriesClock ? '' : format;
  }
  return title && format.toUpperCase() === type.toUpperCase() ? '' : format;
}

function explicitTimeCapSub(exercise: CelebrationData['exercises'][number] | undefined, rawText?: string): string {
  const source = `${exercise?.name ?? ''} ${exercise?.prescription ?? ''} ${rawText ?? ''}`;
  return timeCapLabelFromText(source) ?? '';
}

// Totals shown in the brand strip: REPS · EFFORT · KM/CAL
// Volume (TONS/KG) is replaced by Effort Points per design spec.
// Poster truth standard: derived totals never render off guessed structure. The workout as
// written and the athlete's own numbers stay; only the computed-totals layer is dropped.
// (EP and stats aggregates keep consuming the estimated numbers — approximate beats absent
// there — this gate is display-only, at the single point every skin reads from.)
function stripEstimatedTotals(rows: PosterRow[]): PosterRow[] {
  return rows.map((row) => (row.kind === 'line' && row.total ? { ...row, total: undefined } : row));
}

function buildTotals(data: CelebrationData, heroValue: string): PosterTotal[] {
  const items: PosterTotal[] = [];

  if (data.totalReps > 0) {
    items.push({ label: 'REPS', value: data.totalReps.toLocaleString() });
  }
  if (data.totalDistance >= 1000) {
    items.push({ label: 'KM', value: (data.totalDistance / 1000).toFixed(2) });
  } else if (data.totalDistance > 0) {
    items.push({ label: 'M', value: Math.round(data.totalDistance).toString() });
  }
  if (data.totalCalories > 0) {
    items.push({ label: 'CAL', value: data.totalCalories.toLocaleString() });
  }

  return items.filter((t) => t.value !== heroValue).slice(0, 2);
}

// A partner score is the team's, never personal — "OUR ___" for any CONFIRMED-partner card,
// regardless of split type (the shared hero never changes between split types; only the
// per-movement readout above it does). Strength stays individual even in a team session.
// isPartner must come from isPartnerConfirmed (this card's own content), never raw teamSize —
// a session-level teamSize doesn't mean this specific card's block is the partnered one.
export function buildResultLabel(
  format: string | undefined,
  isPartner: boolean,
  heroUnit?: string,
  // The hero is a scoreboard of several independent clocks, so there is no total to label. "TOTAL
  // ROUNDS" over two separate AMRAP scores invites the reader to add them, which is the one thing
  // those numbers must never be.
  isScoreboard = false,
): string {
  // The label follows the hero's unit before falling back to the format — a fallback hero
  // (EP when no time was logged, calories on a cardio EMOM) must never sit under "MY TIME".
  if (heroUnit === 'REPS') return isPartner ? 'OUR REPS' : 'TOTAL REPS';
  // "EP" alone doesn't survive a screenshot — a stranger needs to read it as a score.
  if (heroUnit === 'EP') return 'EFFORT';
  if (heroUnit === 'CAL') return 'CALORIES';
  // Distance heroes were missing here, so a cardio EMOM's "3.0" (km) sat under the format's
  // "ROUNDS" — a label that contradicted the poster's own "3.00 KM TOTAL" row beside it and
  // read as a wrong round count. Any unit the hero can produce must be handled BEFORE the
  // format switch, which knows the workout's shape but not what was actually measured.
  if (heroUnit === 'KM' || heroUnit === 'M') return 'DISTANCE';
  if (heroUnit === 'KG') return 'TOP SET';
  if (heroUnit === 'KG PR') return 'PR';
  // An open-count hero names its own score: the movement the board declined to prescribe
  // ("BURPEES" over 46). That name is whatever the coach wrote, so it can't be enumerated the
  // way the units above are — but every enumerable unit has now been handled, leaving only the
  // clock's own measures below. Falling through to the format switch is what printed "TOTAL
  // ROUNDS" over a burpee count on a board whose rounds were prescribed.
  if (heroUnit && heroUnit !== 'MIN' && heroUnit !== 'ROUNDS') {
    return isPartner ? `OUR ${heroUnit}` : heroUnit;
  }
  switch (format) {
    case 'for_time':        return isPartner ? 'OUR TIME' : 'MY TIME';
    case 'amrap':
    case 'amrap_intervals':
      return isPartner ? 'OUR ROUNDS' : isScoreboard ? 'ROUNDS' : 'TOTAL ROUNDS';
    case 'strength':        return 'TOP SET';
    case 'emom':
    case 'intervals':       return 'ROUNDS';
    default:                return isPartner ? 'OUR RESULT' : 'MY RESULT';
  }
}

/**
 * The hero number, always carrying its unit somewhere the reader can see.
 *
 * Most labels state the unit themselves ("TOTAL REPS", "CALORIES"), and repeating it reads
 * "TOTAL REPS · 108 REPS" while risking a wrap at the hero's font size. But some don't —
 * "DISTANCE" over a bare "1.0" leaves the single most important question on the poster
 * unanswered, and a screenshot of it is unreadable to anyone. So: append the unit only when the
 * label doesn't already say it. ResultValue renders a trailing unit small beside the number.
 */
export function buildResultValue(hero: HeroResult | null | undefined, label: string): string {
  const raw = hero?.value ?? '--';
  if (raw === '--') return raw;
  // "~" marks a hero summed from per-window recollections ("roughly how many burpees each
  // window?"). It rides on the VALUE rather than the label so it survives every skin unchanged
  // and can never drift away from the number it qualifies. Same rule as the ghost rung: never
  // render precision the athlete didn't log.
  const value = hero?.approximate ? `~${raw}` : raw;
  // A clock states its own unit ("12:34" is not 12.34 of anything) — "12:34min" reads as noise.
  if (value.includes(':')) return value;
  // The measure only ("KG PR" is the PR badge's business; the number is in kilos).
  const unit = hero?.unit?.trim().split(/\s+/)[0];
  if (!unit) return value;
  // A value that already ends in its unit (weights arrive as "65kg") must not gain a second one.
  if (new RegExp(`${unit}$`, 'i').test(value)) return value;
  return label.toUpperCase().includes(unit.toUpperCase()) ? value : `${value}${unit.toLowerCase()}`;
}

/**
 * WHAT the aerobic hero was done on ("ECHO BIKE", "RUN"). A cardio number is meaningless without
 * its machine — "50 CAL" could be a bike, a rower or a ski, and each is a different workout. The
 * hero already resolved which movement it belongs to; this surfaces it beside the number.
 *
 * Cardio only. A strength hero's lift is already named by the movement row above it, so repeating
 * it under the number is noise.
 */
export function aerobicHeroSubject(hero: HeroResult | null | undefined): string | undefined {
  const unit = hero?.unit?.toUpperCase();
  const isAerobic = unit === 'CAL' || unit === 'KM' || unit === 'M';
  return isAerobic ? hero?.subtitle : undefined;
}

function formatPosterWeightValue(weight: number, unit = 'kg'): string {
  const value = Number.isInteger(weight) ? `${weight}` : `${weight}`;
  return `${value}${unit}`;
}

function normalizeAchievementMovementName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// Single source of truth for "does this achievement belong to this page/part?" — a session can
// PR in one part (e.g. the deadlift) while a sibling part (e.g. the metcon) has none, so an
// achievement badge must only ever attach to the page whose movements it actually matches, never
// the whole session. Used by both the per-part poster builder and useCelebrationData's per-page
// hero result.
export function achievementMatchesMovementList(
  achievement: Pick<Achievement, 'movement'>,
  movements: MovementTotal[],
): boolean {
  if (!achievement.movement) return false;
  const achievementName = normalizeAchievementMovementName(achievement.movement);
  return movements.some((m) => {
    const movementName = normalizeAchievementMovementName(m.name);
    return (
      movementName === achievementName
      || movementName.includes(achievementName)
      || achievementName.includes(movementName)
    );
  });
}

function loadUnitOf(movements: MovementTotal[]): 'kg' | 'lb' {
  return movements.find((movement) =>
    (movement.weightProgression?.length ?? 0) > 0 || (movement.weight ?? 0) > 0,
  )?.unit === 'lb' ? 'lb' : 'kg';
}

// THE top set: the heaviest load anywhere in the exercise, over every place one is recorded.
// Never derived from the breakdown alone — see collectExerciseLoadWeights for why a repeated
// lift's peak is invisible there.
function getTopSetValue(exercise: Exercise, movements: MovementTotal[] = []): string | null {
  const peak = getExercisePeakLoad(exercise, movements);
  return peak ? formatPosterWeightValue(peak.weight, loadUnitOf(movements)) : null;
}

function getSingleStrengthTopSetValue(data: CelebrationData): string | null {
  if (data.workoutFormat !== 'strength') return null;
  const movements = data.activeBreakdown?.movements ?? [];
  const peak = Math.max(
    ...data.exercises.map((exercise) => getExercisePeakLoad(exercise, movements)?.weight ?? 0),
    0,
  );
  return peak > 0 ? formatPosterWeightValue(peak, loadUnitOf(movements)) : null;
}

/**
 * Quiet context beside an AMRAP hero score. A ladder AMRAP's rounds+partial score ("6 +10")
 * gets "into round 7" — which round the partial is logged into — never a rep total (a round is
 * often several movements, so a total can't be verified at a glance; that reconciliation belongs
 * in the log/edit view, not the shared poster). Plain AMRAPs already carry their clock in the
 * poster format line, so repeating "20:00 CAP" beside the score is redundant.
 */
function buildAmrapResultMeta(
  isAmrap: boolean,
  heroResult: HeroResult | null | undefined,
): { meta?: string } {
  if (!isAmrap) return {};
  if (heroResult?.ladderIntoRungReps != null) {
    return { meta: `into the ${heroResult.ladderIntoRungReps}s` };
  }
  return {};
}

/**
 * The one quiet line under the hero number, whichever of its three sources fills it.
 *
 * THE single producer, called by both poster builders AND the snapshot harness. It used to be
 * an inline `a ?? b` chain re-typed at each of the three call sites, and the harness's copy was
 * already a beat behind the app's — so a hero note could ship without a fixture ever showing it.
 *
 * Precedence is narrowest-first: the ladder's own rung note, then the "this is a sum" note, then
 * the machine an aerobic score was set on.
 */
export function buildHeroResultMeta(
  isAmrap: boolean,
  hero: HeroResult | null | undefined,
): string | undefined {
  return buildAmrapResultMeta(isAmrap, hero).meta
    ?? openCountWindowsMeta(hero)
    ?? aerobicHeroSubject(hero);
}

/**
 * The note that turns an open-count hero from one effort into the sum it actually is.
 *
 * "~11 BURPEES" over a board run four times reads as eleven burpees in one go — a far smaller
 * day than the athlete had, and the loudest number on the card. This says which it is.
 *
 * Not gated on the AMRAP format: a for-time piece that ends "…then max devil press" earns the
 * same note off the same field, because the ambiguity is in the SUM, not in the clock.
 */
function openCountWindowsMeta(hero: HeroResult | null | undefined): string | undefined {
  const windows = hero?.openCountWindows;
  return windows && windows > 1 ? `total across ${windows} rounds` : undefined;
}

/**
 * Converts ArtifactSection[] → PosterRow[] (block header + lines per section).
 * Sections with empty/generic titles get no block header row.
 */
export function sectionsToRows(
  sections: ArtifactSection[],
  mineMap?: Map<string, string>,
  headerContext: PosterHeaderContext = {},
): PosterRow[] {
  const rows: PosterRow[] = [];

  for (const section of sections) {
    const isDuplicateTitle =
      isDuplicatePosterHeader(section.title, { title: headerContext.title })
      || isRoundCountForTimeCoveredByFormat(section.title, headerContext);
    // Station sections carry their structure in the poster title ("[2:00/1:00] × 6") and in the
    // blueprint cap below — a section-level block on top would restate both.
    const hasStationRows = section.rows.some((row) => row.stationRow && row.roundLabel);
    const hasHeader =
      !hasStationRows &&
      section.title &&
      section.title !== '' &&
      !isFormatHeader(section.title);
    const cap = section.blueprint ?? section.eyebrow ?? '';

    const isCadenceTitle = !hasStationRows
      && CADENCE_TITLE_PATTERNS.some((p) => p.test(section.title?.trim() ?? ''));

    // 'Blueprint' is the section builders' generic placeholder title — it says nothing an
    // athlete reads. The structure cap ("EMOM 15 MIN · 5 ROUNDS") IS the header: promote it
    // into the label slot so the prescription line gets the header's visual weight.
    const isGenericTitle = /^blueprint$/i.test(section.title?.trim() ?? '');
    const capDuplicatesPosterHeader = isDuplicatePosterHeader(cap, headerContext)
      || isRoundCountForTimeCoveredByFormat(cap, headerContext)
      || isCadenceCoveredByFormat(cap, headerContext);

    // A separately-scored block (an A/B/C interval AMRAP) always gets its header row: the
    // label identifies the block and the score is the athlete's result for it. This is the
    // producer for PosterBlock.score — the slot every skin renders and nothing used to fill.
    if (section.blockScore) {
      rows.push({
        kind: 'block',
        label: section.title.toUpperCase(),
        cap: capDuplicatesPosterHeader ? '' : cap,
        ruled: true,
        ...(headerContext.hasScoreboard
          ? {}
          : { score: section.blockScore.value, scoreSub: section.blockScore.unit }),
      } satisfies PosterBlock);
    } else if (hasHeader) {
      // Suppress the label when it's just repeating the poster title, but
      // keep the cap (e.g. "8 sets") so the prescription story is visible.
      const label = isDuplicateTitle || (isGenericTitle && capDuplicatesPosterHeader)
        ? ''
        : isGenericTitle ? cap.toUpperCase() : section.title.toUpperCase();
      const visibleCap = capDuplicatesPosterHeader ? '' : cap;
      // Never emit a block with nothing to show (duplicate title AND no cap) — it renders
      // as a blank spacer row.
      if (label || visibleCap) {
        rows.push({ kind: 'block', label, cap: isGenericTitle ? '' : visibleCap } satisfies PosterBlock);
      }
    } else if (!hasStationRows && (isDuplicateTitle || isCadenceTitle) && cap && !capDuplicatesPosterHeader) {
      // Section title was a format/cadence header (suppressed as label) but the
      // blueprint cap carries structural context worth showing (e.g. "EVERY 4 MIN · 4 ROUNDS").
      rows.push({ kind: 'block', label: '', cap } satisfies PosterBlock);
    } else if (hasStationRows && cap) {
      // Station rows carry only their own letter, so the clock has to be stated once above them
      // ("EMOM 25 MIN · 5 ROUNDS · 0:50 WORK / 0:10 REST"). It is the same for every station on
      // the board, which is exactly why it belongs here and not repeated on each row.
      rows.push({ kind: 'block', label: cap.toUpperCase(), cap: '' } satisfies PosterBlock);
    }

    for (const row of section.rows) {
      // The station letter rides ON the row, as the chip every skin already renders. A station
      // is one line of whiteboard ("ST. 1 — Max Echo Bike — 40 cal"), and giving each one a
      // full-width header block above its single line turned a five-station board into eleven
      // rows of mostly label.
      rows.push(artifactRowToPosterLine(row, mineMap));
    }
  }

  return rows;
}

function formatStationBlockLabel(label: string): string {
  const numeric = label.match(/\b[A-Z]\.(\d+)\b/i);
  if (numeric) return `ST. ${numeric[1]}`;
  const station = label.match(/\b(?:station|st)\.?\s*(\d+|[A-Z])\b/i);
  if (station) return `ST. ${station[1].toUpperCase()}`;
  return label.toUpperCase();
}

// Build a name→weight map from storyMovements (includes progression strings).
export function buildMineMapFromStory(storyMovements: StoryMovementLine[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const sm of storyMovements) {
    const key = sm.name.toLowerCase().trim();
    const unit = sm.unit === 'lb' ? 'lb' : 'kg';
    const value = formatLoggedLoad(
      sm.weightProgression?.length ? sm.weightProgression : sm.weight ? [sm.weight] : [],
      unit,
    );
    if (value) map.set(key, value);
  }
  return map;
}

// Build from workload breakdown — covers weighted, distance, and calorie movements.
export function buildMineMapFromBreakdown(movements: MovementTotal[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const m of movements) {
    const key = m.name.toLowerCase().trim();
    let value = '';

    if (m.weight && m.weight > 0) {
      const unit = m.unit === 'lb' ? 'lb' : 'kg';
      // Breakdown weight is the effective total (per-implement × implementCount, for volume).
      // Display must stay per-implement — "2×15kg" for twin DBs, never the summed "30kg" the
      // athlete didn't lift on one implement. Progressions are stored per-implement already.
      const impl = (m.implementCount ?? 1) > 1 ? m.implementCount! : 1;
      const perImpl = impl > 1 ? Math.round((m.weight / impl) * 10) / 10 : m.weight;
      value = formatLoggedLoad(m.weightProgression?.length ? m.weightProgression : [perImpl], unit, impl);
    } else if ((m.totalDistance ?? 0) > 0) {
      const dist = m.totalDistance!;
      value = dist >= 1000 ? `${(dist / 1000).toFixed(2)}km` : `${Math.round(dist)}m`;
    } else if ((m.totalCalories ?? 0) > 0) {
      value = `${m.totalCalories}cal`;
    }

    if (value) {
      map.set(key, value);
      if (m.originalMovement) map.set(m.originalMovement.toLowerCase().trim(), value);
    }
  }
  return map;
}

// Merged mine map: breakdown (always present) + storyMovements (richer data when available).
function buildMineMap(data: CelebrationData): Map<string, string> {
  const base = buildMineMapFromBreakdown(data.activeBreakdown?.movements ?? []);
  const story = data.heroResult?.storyMovements
    ? buildMineMapFromStory(data.heroResult.storyMovements)
    : new Map<string, string>();
  // Story data takes priority (has progression info); breakdown fills gaps.
  return new Map([...base, ...story]);
}

// Filter out total-recap strings ("500 total", "6.00 km total").
// Keep Rx loads ("60/40", "400m", "20/28kg", "45/30").
function isRxLoad(subNote: string): boolean {
  if (!subNote) return false;
  return !/\btotal\b/i.test(subNote);
}

// "ME" is only meaningful for partner rows when it's a personal weight —
// distance/rep/calorie "mine" values come from the same prescribed total as
// the TEAM share and would just duplicate it.
function isWeightValue(value: string): boolean {
  return /(kg|lb)\b/i.test(value);
}

// Do a row's two load readouts say the same thing? Compared loosely on purpose: the inline
// prescription and the value column are formatted by different builders, so "@ 50 kg" and
// "50kg" are the same fact and must collapse, while "35/50kg" and "50kg" are not.
function sameLoadText(a: string, b: string): boolean {
  const normalize = (value: string): string => value.toLowerCase().replace(/\s+/g, '');
  return normalize(a) === normalize(b);
}

// Pulls the logged weight out of `nameWithLoad` ("Hang Power Clean @ 40kg" → "40kg").
// Poster prescriptions abbreviate and pluralize ("20 Alt DB Snatches") while breakdown names
// are canonical singular ("Alt Dumbbell Snatch") — both sides must normalize to the same
// tokens or the logged-weight lookup silently misses.
const MOVEMENT_TOKEN_ALIASES: Record<string, string> = {
  db: 'dumbbell',
  kb: 'kettlebell',
  bb: 'barbell',
  alt: 'alternating',
};

function singularizeMovementToken(word: string): string {
  if (word.length <= 2 || word.endsWith('ss')) return word;
  if (/(sses|ches|shes|xes|zes)$/.test(word)) return word.slice(0, -2); // presses → press
  return word.endsWith('s') ? word.slice(0, -1) : word;
}

function normalizeMovementKey(value: string): string[] {
  const stop = new Set(['and', 'the', 'with', 'for', 'time', 'rounds', 'round']);
  return value
    .toLowerCase()
    .replace(/&|\+/g, ' ')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter((word) => word.length > 1 && !stop.has(word))
    .map((word) => {
      const singular = singularizeMovementToken(word);
      return MOVEMENT_TOKEN_ALIASES[singular] ?? singular;
    });
}

function lookupMineValue(mineMap: Map<string, string> | undefined, rowName: string, rxLabel: string): string {
  if (!mineMap) return '';

  const exact = mineMap.get(rowName.toLowerCase().trim());
  if (exact) return exact;

  const rowWords = normalizeMovementKey(`${rowName} ${rxLabel}`);
  if (rowWords.length === 0) return '';

  for (const [key, value] of mineMap.entries()) {
    if (!isWeightValue(value)) continue;
    const keyWords = normalizeMovementKey(key);
    if (keyWords.length === 0) continue;

    const shared = keyWords.filter((word) => rowWords.includes(word)).length;
    const keyInsideRow = keyWords.every((word) => rowWords.includes(word));
    const rowInsideKey = rowWords.length <= keyWords.length && rowWords.every((word) => keyWords.includes(word));
    if (keyInsideRow || rowInsideKey || shared >= Math.min(2, keyWords.length)) {
      return value;
    }
  }

  return '';
}

function extractLoadSuffix(nameWithLoad: string | undefined): string {
  if (!nameWithLoad) return '';
  const match = nameWithLoad.match(/@\s*(.+)$/);
  return match ? match[1].trim() : '';
}

function artifactRowToPosterLine(row: ArtifactRow, mineMap?: Map<string, string>): PosterLine {
  // Round-trade partner row (IGUG): whoever's up does the WHOLE round, so there's no personal
  // "share" of this movement to compute — primary/relay/team-share logic below doesn't apply.
  // Full prescription, full-width, weight inline via nameWithLoad (e.g. "Clean & Jerk @ 45kg").
  // The round ledger (rendered separately from PosterWod.rounds) carries the personal stat here.
  if (row.partnerSplit === 'rounds') {
    // Full per-round prescription in one string — "5 Clean & Jerk @ 45kg" — since there's no
    // separate value column for these rows to carry the reps/weight instead.
    const loadSuffix = row.loadNote ? ` @ ${row.loadNote}` : '';
    const rxLabel = row.primary ? `${row.primary} ${row.name}${loadSuffix}` : `${row.name}${loadSuffix}`;
    return {
      kind: 'line',
      rx: rxLabel.trim(),
      load: '',
      mine: '',
      team: '',
      total: undefined,
      roundLabel: row.roundLabel,
      ladderTrack: row.ladderTrack,
    };
  }

  const primaryTrimmed = (row.primary ?? '').trim();
  const relayMatch = primaryTrimmed.match(/^(\d+)×$/);

  let rxLabel: string;
  let stationChip: string | undefined;
  if (relayMatch) {
    // Relay row (e.g. "5×"). Reconstruct per-round prescription from the total in subNote.
    const relayCount = parseInt(relayMatch[1], 10);
    const sub = row.subNote ?? '';

    const distMatch = sub.match(/(\d+(?:\.\d+)?)\s*(km|m)\s*total/i);
    const calMatch  = sub.match(/(\d+)\s*cal\s*total/i);

    if (distMatch && relayCount > 0) {
      const totalM = distMatch[2].toLowerCase() === 'km'
        ? parseFloat(distMatch[1]) * 1000
        : parseFloat(distMatch[1]);
      const perM = Math.round(totalM / relayCount);
      const perStr = perM >= 1000 ? `${(perM / 1000).toFixed(1)}km` : `${perM}m`;
      rxLabel = `${perStr} ${row.name}`.trim(); // "400m Run"
    } else if (calMatch && relayCount > 0) {
      const perCal = Math.round(parseInt(calMatch[1], 10) / relayCount);
      rxLabel = `${perCal}cal ${row.name}`.trim(); // "19cal Echo Bike"
    } else {
      // nameWithLoad is pre-computed as "${perRoundDist} ${name}" for relay rows (e.g. "1.3km Echo
      // Bike") — use it instead of bare name when suppressDistanceTotal prevented subNote from
      // carrying the total.
      rxLabel = row.nameWithLoad?.trim() || row.name;
    }
  } else if (row.stationRow || row.roundLabel != null) {
    // Station rows carry their complete display line in primary — never re-append the name.
    rxLabel = row.primary ?? '';
    // Shortened here rather than at the builder: "STATION 1" is the board's own wording and the
    // row keeps it, but the chip is a few characters wide and "ST. 1" is what fits.
    if (row.stationRow && row.roundLabel) {
      stationChip = formatStationBlockLabel(row.roundLabel);
    }
  } else {
    rxLabel = row.primary ? `${row.primary} ${row.name}` : row.name;
  }

  const load = row.subNote && isRxLoad(row.subNote) ? row.subNote : '';
  // Rows stamped with a mineKey (structured movement rows) resolve "mine" by EXACT key —
  // the builder already did the prescription↔breakdown join. Word matching survives only for
  // keyless rows (whiteboard-verbatim lines, legacy chipper/ladder rows), where the row text
  // is the only handle on the movement.
  const mineRaw = row.suppressMine ? ''
    : row.mineOverride ?? (row.mineKey
      ? (mineMap?.get(row.mineKey.toLowerCase().trim()) ?? '')
      : lookupMineValue(mineMap, row.name || rxLabel, rxLabel));
  const total = row.totalNote || (row.subNote && /\btotal\b/i.test(row.subNote) ? row.subNote : undefined);
  const loadSuffix = row.loadNote || extractLoadSuffix(row.nameWithLoad);

  let team = '';
  let mine = row.suppressMine ? '' : loadSuffix || mineRaw;
  const mineBeforeWipe = mine;
  // Per-partner flat share is resolved ONCE upstream (computeMovementTeamShare in helpers.ts)
  // and carried on row.teamShare — computed from movement data, so it honors (together) work and
  // per-round values that a display-string regex here never could. This layer only reads it.
  if (row.teamShare) {
    team = row.teamShare;
    mine = loadSuffix || (isWeightValue(mineRaw) ? mineRaw : '');
  } else if (total && !isWeightValue(mine)) {
    mine = '';
  }

  // ONE LOAD, ONE PLACE. A section row states the prescribed weight inline ("8 Push Presses
  // @ 50kg") and the value column states the logged one ("50kg") — when they are the same
  // number that is one fact printed at both ends of the same line. The value column keeps it:
  // it is the athlete's own number, in the slot every other row uses for loads.
  //
  // Only an IDENTICAL load is dropped. "@ 35/50kg" beside a logged "40kg" is the board's
  // prescription and what the athlete actually lifted — two facts, and the poster owes the
  // reader both.
  // Trimmed first: a row with no movement name appends an empty one, so the load is not
  // actually last until the trailing space is gone.
  rxLabel = rxLabel.trim();
  const inlineLoad = rxLabel.match(/\s+@\s+(\S+)$/);
  if (inlineLoad && mine && sameLoadText(inlineLoad[1], mine)) {
    rxLabel = rxLabel.slice(0, inlineLoad.index).trimEnd();
  }

  if (shouldLogCelebrationDebug()) {
    console.log('[CelebrationDebug:artifactRowToPosterLine]', {
      rowName: row.name,
      rowLoadNote: row.loadNote,
      rowNameWithLoad: row.nameWithLoad,
      rowTotalNote: row.totalNote,
      rowSubNote: row.subNote,
      loadSuffix,
      mineRaw,
      total,
      mineBeforeWipe,
      mineAfterWipe: mine,
      isWeightValueResult: isWeightValue(mineBeforeWipe),
    });
  }

  return {
    kind: 'line',
    rx: rxLabel.trim(),
    load,
    mine,
    team,
    ...(row.teamShare ? { isPartnerShare: true } : {}),
    total,
    roundLabel: stationChip ?? row.roundLabel,
    ladderTrack: row.ladderTrack,
  };
}

// ─── Per-page builder (carousel / multi-part workouts) ───────────────────

function formatClockSeconds(seconds: number): string {
  const rounded = Math.round(seconds);
  const mins = Math.floor(rounded / 60);
  const secs = rounded % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

function formatAlternatingStationClock(exercise: Exercise): { title: string } | undefined {
  // "02:00" → "2:00" — the clock reads cleaner without the whiteboard's leading zero.
  const stripLeadingZero = (clock: string): string => clock.replace(/^0(?=\d:)/, '');
  const text = `${exercise.name || ''} ${exercise.prescription || ''}`.replace(/(\d+)\.(\d{2})/g, '$1:$2');
  const match = text.match(/(\d{1,2}:\d{2})\s*(?:min(?:ute)?s?)?\s*amrap\s*\/\s*(\d{1,2}:\d{2})\s*(?:min(?:ute)?s?)?\s*rest.*?(?:[xX*×]\s*)(\d+)/i);
  if (match) return { title: `[${stripLeadingZero(match[1])}/${stripLeadingZero(match[2])}] × ${match[3]}` };

  const count = exercise.intervalCount || exercise.rounds || exercise.sets?.length;
  if (!count || !exercise.workDuration) return undefined;
  const work = formatClockSeconds(exercise.workDuration / count);
  const rest = exercise.restDuration ? formatClockSeconds(exercise.restDuration / count) : undefined;
  return { title: rest ? `[${work}/${rest}] × ${count}` : `[${work}] × ${count}` };
}

export function buildPosterWodFromPage(
  data: CelebrationData,
  pageIndex: number,
): PosterWod {
  const pages = data.carouselPageData!;
  const page = pages[pageIndex];
  const sections = data.perPageSections?.[pageIndex] ?? [];
  // Page-level flags (partner status, blueprint, ledger) are stamped uniformly across a page's
  // sections by the builders — the first section is the page's authority for them.
  const section = sections[0] ?? null;
  const heroResult = data.perPageHeroResults?.[pageIndex] ?? null;
  // Present only when this page's piece ran several independent clocks — see PosterWod.result.
  const heroScores = heroResult?.blockScores;

  const date = data.workoutDate;

  // Prefer the exercise's own loggingMode/type over the whole workout's format.
  // This prevents Part A's "emom" format from stamping Part B's METCON card.
  const ex = page.exercise as unknown as Record<string, unknown>;
  const exLoggingMode = ex['loggingMode'] as string | undefined;
  const exType = ex['type'] as string | undefined;
  const exFmt: string = page.isStrength
    ? 'strength'
    : exLoggingMode === 'for_time' || exLoggingMode === 'amrap' || exLoggingMode === 'amrap_intervals' || exLoggingMode === 'strength' || exLoggingMode === 'free'
      ? exLoggingMode
      : exType === 'strength' ? 'strength'
      : data.workoutFormat ?? 'for_time';

  // A practice scored by a max test is neither a format nor a load story, so neither the
  // session's format ("FOR TIME", inherited from a sibling metcon) nor "STRENGTH" describes it.
  // It also must not read "PRACTICE" — the title already says so, and the tag exists to add what
  // the title can't.
  const isMaxPractice = isMaxEffortPractice(page.exercise);

  // Map to display label via the same canonical mapping the summary card uses
  // (mapFormatToType) — 'free' is the one label it doesn't cover.
  const type = isMaxPractice
    ? 'SKILL'
    : exFmt === 'free' ? 'WOD' : mapFormatToType(exFmt as Parameters<typeof mapFormatToType>[0]);

  // 'amrap' and 'amrap_intervals' are both displayed as "AMRAP" everywhere else in this function
  // (the type tag above, mapFormatToType, resultLabel below) — duration extraction must treat
  // them the same way, or a single-AMRAP-block exercise classified as amrap_intervals silently
  // skips the duration entirely while the tag still reads "AMRAP".
  const isAmrap = exFmt === 'amrap' || exFmt === 'amrap_intervals';
  const hasStationBlocks = sections.some((s) => s.rows.some((row) => row.stationRow && row.roundLabel));
  const stationClock = hasStationBlocks ? formatAlternatingStationClock(page.exercise) : undefined;

  // This exercise's OWN prescribed AMRAP duration (never the workout-wide duration, which mixes
  // in the other parts of a multi-block session) — used for both the title and the format line
  // so the card states the duration instead of bare "AMRAP" duplicating the type tag.
  const amrapMinutes = isAmrap ? extractAmrapMinutes(page.exercise) : undefined;

  const exName = page.exercise.name?.trim().toUpperCase() ?? null;
  let title = stationClock?.title ?? (exName && !isGenericTitle(exName) ? exName : null);
  if (!title && isAmrap && amrapMinutes) {
    title = `${amrapMinutes} MIN`;
  }

  // This page's OWN confirmed status, never the session-level teamSize — a sibling page being
  // partnered doesn't make this page partnered (e.g. a solo strength page sharing a session with
  // a partnered metcon page).
  const isPartnerPage = !!section?.isPartnerConfirmed;

  const format = (() => {
    // Partner pages: trust the artifact blueprint (already split-aware) over an independent
    // format guess, for the same reason buildPosterWod does — see that function's comment.
    if (isPartnerPage && section?.blueprint) return section.blueprint.toUpperCase();
    // Station pages: the title already carries the interval clock ("[2:00/1:00] × 6") — pair
    // it with the station descriptor instead of a formatLine restating AMRAP.
    if (stationClock) return 'alt. stations';
    // A format line that just repeats the type tag ("AMRAP" under an AMRAP chip) adds
    // nothing — fall through to the more specific duration variants.
    if (heroResult?.formatLine) {
      const fl = heroResult.formatLine.toUpperCase();
      if (fl && fl !== 'WORKOUT' && fl !== type) return fl;
    }
    // FormatTag pill already reads "AMRAP" — state the duration only, not the format word again.
    if (isAmrap && amrapMinutes) return `${amrapMinutes} MIN`;
    // The strength scheme counts sets that logged reps — on a max practice that is the ONE tested
    // set, so it printed "1 SETS" directly above the block's own "5 SETS" blueprint.
    if (page.isStrength && !isMaxPractice) {
      const scheme = formatPosterStrengthScheme(page.exercise);
      if (scheme) return scheme;
    }
    if (isMaxPractice) return '';
    return mapFormatToType(exFmt);
  })();

  // Never let the title repeat the format/type string verbatim (e.g. a title that resolved to
  // bare "AMRAP") — matches the de-dup rule already enforced in buildPosterWod.
  if (title && (title.toUpperCase() === format.toUpperCase() || title.toUpperCase() === type.toUpperCase())) {
    title = null;
  }
  if (!title && isPartnerPage) {
    title = section?.partnerDisplayMode === 'sections' ? 'PARTNER WOD' : 'PARTNER METCON';
  }
  // The per-set reps sequence tells a build-up story ("6-6-5-4-3"). A max test has exactly one
  // number, so the sequence is just the hero repeated in a quieter font.
  const repsScheme = page.isStrength && !isMaxPractice
    ? formatPosterStrengthRepsSequence(page.exercise)
    : undefined;

  const sub = (() => {
    if (section?.partnerDisplayMode === 'sections') return partnerBlocksSub(data.artifactSections, data.teamSize);
    if (isPartnerPage) return '';
    // Pair-paced pieces state their swap structure ("in pairs · swap each 200m run") — the
    // format is unreadable from the movement rows alone.
    if (section?.structureNote) return section.structureNote;
    // Station pages: the "alt. stations" format line stands alone (the clock title already
    // carries the durations).
    if (stationClock) return '';
    // "build to heavy" is a load cue — meaningless on a practice that never touched a weight.
    if (isMaxPractice) return '';
    if (exFmt === 'strength') return 'build to heavy';
    if (isAmrap && amrapMinutes) return '';
    if (exFmt === 'for_time') return explicitTimeCapSub(page.exercise, data.rawText);
    return '';
  })();

  const mineMap = buildMineMap(data);
  const teamSize = data.teamSize ?? 1;
  const totalsEstimated = !!data.activeBreakdown?.estimated;
  const builtRows: PosterRow[] = sections.length > 0
    ? sectionsToRows(sections, mineMap, { title, type, format, sub, hasScoreboard: !!heroScores?.length })
    : [];
  const rows = totalsEstimated ? stripEstimatedTotals(builtRows) : builtRows;
  const strengthTopSet = page.isStrength && !isMaxPractice
    ? getTopSetValue(page.exercise, page.movements)
    : null;

  const resultLabel = (() => {
    if (strengthTopSet) return 'TOP SET';
    // A max is not a total. "TOTAL REPS" over a single tested set both misstates what the number
    // is and reads as a second, different fact beside the row that already says "Max Toes to Bar".
    if (isMaxPractice) return prescribesUnbrokenMax(page.exercise) ? 'MAX UNBROKEN' : 'MAX REPS';
    // The label follows the hero's unit before the format, same rule as buildResultLabel —
    // a fallback hero (EP when no time was logged) must never sit under "MY TIME".
    if (heroResult?.unit === 'REPS') return isPartnerPage ? 'OUR REPS' : 'TOTAL REPS';
    if (heroResult?.unit === 'EP') return 'EP';
    if (heroResult?.unit === 'CAL') return 'CALORIES';
    // Same gap as buildResultLabel: without these, a distance or weight hero inherits the
    // format's label and contradicts its own number.
    if (heroResult?.unit === 'KM' || heroResult?.unit === 'M') return 'DISTANCE';
    if (heroResult?.unit === 'KG') return 'TOP SET';
    if (heroResult?.unit === 'KG PR') return 'PR';
    // Free part: the label follows whichever score type the athlete picked.
    if (exFmt === 'free') {
      switch (heroResult?.unit) {
        case 'MIN':    return isPartnerPage ? 'OUR TIME' : 'MY TIME';
        case 'ROUNDS': return isPartnerPage ? 'OUR ROUNDS' : 'ROUNDS';
        case 'KG':     return 'TOP SET';
        default:       return isPartnerPage ? 'OUR SCORE' : 'MY SCORE';
      }
    }
    // Same rule as buildResultLabel: a hero that names its own score outranks the format. A
    // page whose block leaves one movement open is scored in that movement, not in rounds.
    const openUnit = heroResult?.unit;
    if (openUnit && !['MIN', 'ROUNDS', 'REPS', 'EP', 'CAL', 'KM', 'M', 'KG', 'KG PR'].includes(openUnit)) {
      return isPartnerPage ? `OUR ${openUnit}` : openUnit;
    }
    switch (exFmt) {
      case 'for_time': return isPartnerPage ? 'OUR TIME' : 'MY TIME';
      case 'amrap': case 'amrap_intervals': return isPartnerPage ? 'OUR ROUNDS' : 'ROUNDS';
      case 'strength': return 'TOP SET';
      case 'emom': case 'intervals': return 'ROUNDS';
      default: return isPartnerPage ? 'OUR RESULT' : 'RESULT';
    }
  })();
  const resultValue = strengthTopSet ?? buildResultValue(heroResult, resultLabel);
  // Station pages: the interval clock in the title already states the cap, so the AMRAP note is
  // suppressed — the sum/machine notes below still apply, as they always did.
  const resultMeta = buildHeroResultMeta(isAmrap && !stationClock, heroResult);

  // Page-scoped, not session-scoped: a PR in one part (e.g. the deadlift) must never badge a
  // sibling part (e.g. the metcon) just because they share a session-level isPR flag.
  const pagePr = (data.activeAchievements ?? []).find(
    (a) => a.type === 'pr' && a.movement && a.value && achievementMatchesMovementList(a, page.movements),
  );
  const rx: string | null = pagePr ? 'PR' : null;
  const totals = totalsEstimated ? [] : buildTotals(data, resultValue);

  const sectionLedger = section?.roundLedger;
  const split: PosterWod['split'] = sectionLedger ? 'rounds' : section?.partnerDisplayMode === 'sections' ? 'sections' : 'reps';
  const rounds = sectionLedger?.rounds;

  // Same rule as buildPosterWod: on a named page the format renders as the sub-line under the
  // title — drop it when it just repeats the type pill verbatim ("FOR TIME" pill + "FOR TIME").
  const dedupedFormat = dedupeAmrapFormat(title, format, type, isAmrap, amrapMinutes);

  return {
    type, title, date: formatSourceDate(data.sourceDate, date), format: dedupedFormat, sub, repsScheme,
    blocks: [],
    result: { label: resultLabel, value: resultValue, meta: resultMeta, narrative: heroResult?.amrapNarrative, scores: heroScores },
    rx,
    totals,
    ep: Math.round(data.totalEP ?? 0),
    teamSize,
    isPartnerConfirmed: isPartnerPage,
    split,
    rounds,
    _rows: rows,
  } as PosterWodInternal;
}

// ─── Main builder ──────────────────────────────────────────────────────────

/**
 * Every poster page of a session, in reading order — the single definition of
 * "what this workout looks like as posters".
 *
 * The lead page is the primary part (the metcon, via getPrimaryCarouselPageIndex),
 * followed by the remaining parts in board order. Everything that shows a whole
 * workout — the celebration carousel, a feed post — reads this, so a feed card
 * can never disagree with the deck the athlete swiped through. Surfaces that
 * show exactly one poster (the thumbnails) take index 0.
 */
export function buildPosterWodPages(data: CelebrationData): PosterWod[] {
  const pages = data.carouselPageData;
  if (!data.isCarousel || !pages || pages.length <= 1) return [buildPosterWod(data)];

  const primary = getPrimaryCarouselPageIndex(data);
  return [
    // Identical to buildPosterWodFromPage(data, primary) — buildPosterWod routes
    // there for a carousel — so the lead page and the thumbnail stay one thing.
    buildPosterWod(data),
    ...pages
      .map((_, i) => i)
      .filter((i) => i !== primary)
      .map((i) => buildPosterWodFromPage(data, i)),
  ];
}

export function buildPosterWod(
  data: CelebrationData,
): PosterWod {
  if (data.isCarousel && data.carouselPageData?.length) {
    return buildPosterWodFromPage(data, getPrimaryCarouselPageIndex(data));
  }

  const date = data.workoutDate;

  // Title — null when generic or when it would duplicate the format string
  const rawTitle = data.rewardDisplayTitle ?? '';
  let title: string | null = rawTitle && !isGenericTitle(rawTitle)
    ? rawTitle.toUpperCase()
    : null;

  // Same rule as the page builder: a practice scored by a max test is not a load story. A
  // practice logged on its own renders through THIS path, so it needs the identical treatment —
  // otherwise the wording depends on whether a metcon happened to be logged beside it.
  const soloMaxPractice = data.exercises.length === 1 && !!data.exercises[0]
    && isMaxEffortPractice(data.exercises[0]);
  // The part this poster speaks for. Every line below describes "the workout", and on a session
  // that logged an accessory block first, exercises[0] is not it — see buildFormatLine.
  const mainEx = data.posterMainExercises[0] ?? data.exercises[0];
  const type = soloMaxPractice ? 'SKILL' : mapFormatToType(data.workoutFormat);
  const isAmrap = data.workoutFormat === 'amrap' || data.workoutFormat === 'amrap_intervals';
  const amrapMinutes = isAmrap
    ? (extractAmrapMinutes(mainEx) ?? (data.durationMinutes > 0 ? Math.round(data.durationMinutes) : undefined))
    : undefined;
  if (!title && isAmrap && amrapMinutes) {
    title = `${amrapMinutes} MIN`;
  }
  const format = buildFormatLine(data);
  // Pair-paced structure note outranks the generic sub-line — same rule as the page builder.
  const structureNote = data.artifactSections.find((s) => s.structureNote)?.structureNote;
  const sub = structureNote ?? (isAmrap && amrapMinutes ? '' : buildSubLine(data));
  const isStrengthWod = data.workoutFormat === 'strength' || mainEx?.type === 'strength';
  const repsScheme = isStrengthWod && mainEx && !soloMaxPractice
    ? formatPosterStrengthRepsSequence(mainEx)
    : undefined;

  // Clear title if it duplicates the format or type string
  if (title && (
    title.toUpperCase() === format.toUpperCase() ||
    title.toUpperCase() === type.toUpperCase()
  )) {
    title = null;
  }
  const dateStr = formatSourceDate(data.sourceDate, date);

  const isPartnerConfirmed = !!data.artifactSections[0]?.isPartnerConfirmed;
  const sectionLedger = data.artifactSections[0]?.roundLedger;
  const split: PosterWod['split'] = sectionLedger ? 'rounds' : data.artifactSections[0]?.partnerDisplayMode === 'sections' ? 'sections' : 'reps';
  const rounds = sectionLedger?.rounds;
  if (!title && isPartnerConfirmed) {
    title = split === 'sections' ? 'PARTNER WOD' : 'PARTNER METCON';
  }

  // Result
  const strengthTopSet = soloMaxPractice ? null : getSingleStrengthTopSetValue(data);
  const resultLabel = strengthTopSet
    ? 'TOP SET'
    : soloMaxPractice
      ? (prescribesUnbrokenMax(data.exercises[0]) ? 'MAX UNBROKEN' : 'MAX REPS')
      : buildResultLabel(data.workoutFormat, isPartnerConfirmed, data.heroResult?.unit, !!data.heroResult?.blockScores?.length);
  const resultValue = strengthTopSet ?? buildResultValue(data.heroResult, resultLabel);
  const resultMeta = buildHeroResultMeta(isAmrap, data.heroResult);

  // RX badge
  const rx: string | null = data.isPR ? 'PR' : null;

  // Totals for brand strip
  const totalsEstimated = !!data.activeBreakdown?.estimated;
  const totals = totalsEstimated ? [] : buildTotals(data, resultValue);

  // Build mine map: breakdown movements + storyMovements merged
  const mineMap = buildMineMap(data);
  const teamSize = data.teamSize ?? 1;

  // Flatten artifact sections into rows
  // On a named poster the format renders as the sub-line under the title — when it just
  // repeats the type pill verbatim ("EMOM" pill + "EMOM" sub-line), drop it. Unnamed posters
  // keep it: there the format IS the headline.
  const dedupedFormat = dedupeAmrapFormat(title, format, type, isAmrap, amrapMinutes);
  const builtRows = sectionsToRows(data.artifactSections, mineMap, { title, type, format: dedupedFormat, sub, hasScoreboard: !!data.heroResult?.blockScores?.length });
  const rows = totalsEstimated ? stripEstimatedTotals(builtRows) : builtRows;

  const wod: PosterWodInternal = {
    type,
    title,
    date: dateStr,
    format: dedupedFormat,
    sub,
    repsScheme,
    blocks: [],
    result: { label: resultLabel, value: resultValue, meta: resultMeta, narrative: data.heroResult?.amrapNarrative, scores: data.heroResult?.blockScores },
    rx,
    totals,
    ep: Math.round(data.totalEP ?? 0),
    teamSize,
    isPartnerConfirmed,
    split,
    rounds,
    _rows: rows,
  };

  return wod;
}
