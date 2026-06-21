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
import type { ArtifactSection, ArtifactRow, StoryMovementLine } from '../../types';
import type { MovementTotal } from '../../../../types';
import { shouldLogCelebrationDebug } from '../../../../hooks/useCelebrationData';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface PosterTotal {
  label: string; // 'REPS', 'KM', 'CAL', 'TONS'
  value: string;
}

export interface PosterWod {
  type: string;         // 'FOR TIME', 'AMRAP', 'STRENGTH', …
  title: string | null; // Named WOD title (CINDY, FRAN…) or null
  date: string;         // '14 MAY 26'
  format: string;       // '12 ROUNDS', '5 × 5', '12-MIN AMRAP'
  sub: string;          // '30 MIN CAP', 'build to heavy', …
  blocks: PosterBlock[];
  result: { label: string; value: string };
  rx: string | null;    // "RX'D" | "PR" | null
  totals: PosterTotal[]; // Supporting stats for the brand strip
  ep: number;            // Effort Points — shown in brand strip
  teamSize: number;      // Partner workout team size (1 = solo)
}

export interface PosterBlock {
  kind: 'block';
  label: string;
  cap?: string;
  score?: string;
  scoreSub?: string;
}

export interface PosterLine {
  kind: 'line';
  rx: string;   // "10 Deadlift"
  load: string; // "60/40kg" (prescribed)
  mine: string; // "60kg" (what user did)
  total?: string;
  team: string; // "50" — per-partner share of the prescribed total (partner workouts only)
  roundLabel?: string; // "R1", "R2", "BUY-IN" — rendered as a chip, not baked into rx
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
  /^\d+\s*rounds?\s+for\s+time$/i,   // "5 Rounds For Time"
  /^\d+\s*rounds?$/i,                 // "5 Rounds"
  /^\d+[-\s]min\s+amrap$/i,           // "12-Min AMRAP"
  /^\d+[-\s]min\s+emom$/i,
];

function isGenericTitle(title: string): boolean {
  return GENERIC_TITLE_PATTERNS.some((p) => p.test(title.trim()));
}

// Suppress section headers that are just describing the workout format
const FORMAT_HEADER_PATTERNS = [
  ...GENERIC_TITLE_PATTERNS,
  /^the\s+wod$/i,
  /^the\s+workout$/i,
];

function isFormatHeader(title: string): boolean {
  return FORMAT_HEADER_PATTERNS.some((p) => p.test(title.trim()));
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

function formatWorkoutDate(date: Date): string {
  // "5 JUN 26"
  return date
    .toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: '2-digit' })
    .toUpperCase()
    .replace(',', '');
}

function buildFormatLine(data: CelebrationData): string {
  // Prefer heroResult.formatLine if it looks meaningful
  if (data.heroResult?.formatLine) {
    const fl = data.heroResult.formatLine.toUpperCase();
    if (fl && fl !== 'WORKOUT') return fl;
  }

  const fmt = data.workoutFormat;
  const exercises = data.exercises;
  const ex0 = exercises[0];

  if (fmt === 'amrap' && data.durationMinutes > 0) {
    return `${data.durationMinutes}-MIN AMRAP`;
  }
  if (fmt === 'emom' && ex0) {
    const intervalCount = ex0.intervalCount ?? ex0.sets?.length;
    if (intervalCount && intervalCount > 1) return `${intervalCount}-SET EMOM`;
  }
  if ((fmt === 'strength' || ex0?.type === 'strength') && ex0) {
    const sets = ex0.sets?.length;
    if (sets && sets > 0) {
      const repsPerSet = ex0.suggestedRepsPerSet?.[0] ?? ex0.sets?.[0]?.targetReps;
      if (repsPerSet) return `${sets} × ${repsPerSet}`;
      return `${sets} SETS`;
    }
  }
  if (fmt === 'for_time') {
    const rounds = ex0?.rounds;
    if (rounds && rounds > 1) return `${rounds} ROUNDS FOR TIME`;
    return 'FOR TIME';
  }
  if (fmt === 'intervals' && ex0) {
    const ic = ex0.intervalCount ?? ex0.sets?.length;
    if (ic && ic > 1) return `${ic} INTERVALS`;
  }

  return mapFormatToType(fmt);
}

function buildSubLine(data: CelebrationData): string {
  const fmt = data.workoutFormat;
  const ex0 = data.exercises[0];
  if (fmt === 'strength') {
    return 'build to heavy';
  }
  if (fmt === 'amrap' && data.durationMinutes > 0) {
    return `${Math.round(data.durationMinutes)} min`;
  }
  const cap = explicitTimeCapSub(ex0, data.rawText);
  if (cap) return cap;
  return '';
}

function explicitTimeCapSub(exercise: CelebrationData['exercises'][number] | undefined, rawText?: string): string {
  const source = `${exercise?.name ?? ''} ${exercise?.prescription ?? ''} ${rawText ?? ''}`;
  const match = source.match(/\b(\d+)\s*(?:min(?:ute)?s?|minutes?)\s*(?:t\.?c\.?|time\s*cap|cap)\b/i);
  return match ? `${parseInt(match[1], 10)} MIN CAP` : '';
}

// Totals shown in the brand strip: REPS · EFFORT · KM/CAL
// Volume (TONS/KG) is replaced by Effort Points per design spec.
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

function buildResultLabel(format: string | undefined): string {
  switch (format) {
    case 'for_time':        return 'MY TIME';
    case 'amrap':
    case 'amrap_intervals': return 'TOTAL ROUNDS';
    case 'strength':        return 'TOP SET';
    default:                return 'MY RESULT';
  }
}

function buildResultValue(data: CelebrationData): string {
  const hero = data.heroResult;
  if (!hero) return '--';
  // Don't append unit — the result label ("MY TIME", "TOP SET") provides context.
  // Keeping the value clean prevents multi-line wrapping at large font sizes.
  return hero.value ?? '--';
}

/**
 * Converts ArtifactSection[] → PosterRow[] (block header + lines per section).
 * Sections with empty/generic titles get no block header row.
 */
function sectionsToRows(sections: ArtifactSection[], mineMap?: Map<string, string>, wodTitle?: string | null, teamSize?: number): PosterRow[] {
  const rows: PosterRow[] = [];

  for (const section of sections) {
    const isDuplicateTitle =
      !!wodTitle &&
      section.title?.toUpperCase() === wodTitle.toUpperCase();
    const hasHeader =
      section.title &&
      section.title !== '' &&
      !isFormatHeader(section.title);
    const cap = section.blueprint ?? section.eyebrow ?? '';

    if (hasHeader) {
      rows.push({
        kind: 'block',
        // Suppress the label when it's just repeating the poster title, but
        // keep the cap (e.g. "8 sets") so the prescription story is visible.
        label: isDuplicateTitle ? '' : section.title.toUpperCase(),
        cap,
      } satisfies PosterBlock);
    } else if (isDuplicateTitle && cap) {
      // Section title was a format header but there's still a cap worth showing.
      rows.push({ kind: 'block', label: '', cap } satisfies PosterBlock);
    }

    for (const row of section.rows) {
      rows.push(artifactRowToPosterLine(row, mineMap, teamSize));
    }
  }

  return rows;
}

// Build a name→weight map from storyMovements (includes progression strings).
function buildMineMapFromStory(storyMovements: StoryMovementLine[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const sm of storyMovements) {
    const key = sm.name.toLowerCase().trim();
    const unit = sm.unit ?? 'kg';
    if (sm.weightProgression && sm.weightProgression.length > 1) {
      const uniq = [...new Set(sm.weightProgression)];
      map.set(key, uniq.length > 1 ? `${uniq.join('-')}${unit}` : `${uniq[0]}${unit}`);
    } else if (sm.weight && sm.weight > 0) {
      map.set(key, `${sm.weight}${unit}`);
    }
  }
  return map;
}

// Build from workload breakdown — covers weighted, distance, and calorie movements.
function buildMineMapFromBreakdown(movements: MovementTotal[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const m of movements) {
    const key = m.name.toLowerCase().trim();
    let value = '';

    if (m.weight && m.weight > 0) {
      const unit = m.unit === 'lb' ? 'lb' : 'kg';
      const prog = m.weightProgression;
      value = prog && prog.length > 1
        ? (() => { const uniq = [...new Set(prog)]; return uniq.length > 1 ? `${uniq.join('-')}${unit}` : `${uniq[0]}${unit}`; })()
        : `${m.weight}${unit}`;
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

// Splits the AI-prescribed total in `primary` into a per-partner share —
// e.g. "100" → "50", "1800m" → "900m", "80 CAL" → "40 cal" (teamSize=2).
// Returns '' for shapes that aren't a shareable team total (weights, relay legs "5×").
function computeTeamShare(primary: string, teamSize: number): string {
  const p = primary.trim();

  const cal = p.match(/^(\d+(?:\.\d+)?)\s*cal$/i);
  if (cal) {
    return `${Math.round(parseFloat(cal[1]) / teamSize)} cal`;
  }

  const dist = p.match(/^(\d+(?:\.\d+)?)\s*(km|m)$/i);
  if (dist) {
    const meters = dist[2].toLowerCase() === 'km' ? parseFloat(dist[1]) * 1000 : parseFloat(dist[1]);
    const share = meters / teamSize;
    return share >= 1000 ? `${(share / 1000).toFixed(2)}km` : `${Math.round(share)}m`;
  }

  const reps = p.match(/^(\d+(?:\.\d+)?)$/);
  if (reps) {
    return `${Math.round(parseFloat(reps[1]) / teamSize)}`;
  }

  return '';
}

// "ME" is only meaningful for partner rows when it's a personal weight —
// distance/rep/calorie "mine" values come from the same prescribed total as
// the TEAM share and would just duplicate it.
function isWeightValue(value: string): boolean {
  return /(kg|lb)\b/i.test(value);
}

// Pulls the logged weight out of `nameWithLoad` ("Hang Power Clean @ 40kg" → "40kg").
function normalizeMovementKey(value: string): string[] {
  const stop = new Set(['and', 'the', 'with', 'for', 'time', 'rounds', 'round']);
  return value
    .toLowerCase()
    .replace(/&|\+/g, ' ')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter((word) => word.length > 1 && !stop.has(word));
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

function artifactRowToPosterLine(row: ArtifactRow, mineMap?: Map<string, string>, teamSize?: number): PosterLine {
  const primaryTrimmed = (row.primary ?? '').trim();
  const relayMatch = primaryTrimmed.match(/^(\d+)×$/);

  let rxLabel: string;
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
      rxLabel = row.name; // fallback: just "Run"
    }
  } else if (row.roundLabel != null) {
    rxLabel = row.primary ?? '';
  } else {
    rxLabel = row.primary ? `${row.primary} ${row.name}` : row.name;
  }

  const load = row.subNote && isRxLoad(row.subNote) ? row.subNote : '';
  const mineRaw = lookupMineValue(mineMap, row.name, rxLabel);
  const total = row.totalNote || (row.subNote && /\btotal\b/i.test(row.subNote) ? row.subNote : undefined);
  const loadSuffix = row.loadNote || extractLoadSuffix(row.nameWithLoad);

  let team = '';
  let mine = loadSuffix || mineRaw;
  const mineBeforeWipe = mine;
  if (teamSize && teamSize > 1) {
    team = computeTeamShare(row.primary ?? '', teamSize);
    if (team) {
      mine = loadSuffix || (isWeightValue(mineRaw) ? mineRaw : '');
    }
  } else if (total && !isWeightValue(mine)) {
    mine = '';
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

  return { kind: 'line', rx: rxLabel.trim(), load, mine, team, total, roundLabel: row.roundLabel };
}

// ─── Per-page builder (carousel / multi-part workouts) ───────────────────

export function buildPosterWodFromPage(
  data: CelebrationData,
  pageIndex: number,
  workoutDate?: Date,
): PosterWod {
  const pages = data.carouselPageData!;
  const page = pages[pageIndex];
  const section = data.perPageSections?.[pageIndex] ?? null;
  const heroResult = data.perPageHeroResults?.[pageIndex] ?? null;

  const date = workoutDate ?? new Date();

  const exName = page.exercise.name?.trim().toUpperCase() ?? null;
  const title = exName && !isGenericTitle(exName) ? exName : null;

  // Prefer the exercise's own loggingMode/type over the whole workout's format.
  // This prevents Part A's "emom" format from stamping Part B's METCON card.
  const ex = page.exercise as unknown as Record<string, unknown>;
  const exLoggingMode = ex['loggingMode'] as string | undefined;
  const exType = ex['type'] as string | undefined;
  const exFmt: string = page.isStrength
    ? 'strength'
    : exLoggingMode === 'for_time' || exLoggingMode === 'amrap' || exLoggingMode === 'strength'
      ? exLoggingMode
      : exType === 'strength' ? 'strength'
      : data.workoutFormat ?? 'for_time';

  // Map to display label — for metcon workouts with non-strength type, prefer METCON
  const type = exFmt === 'for_time' ? 'FOR TIME'
    : exFmt === 'amrap' ? 'AMRAP'
    : exFmt === 'strength' ? 'STRENGTH'
    : exFmt === 'emom' ? 'METCON'
    : mapFormatToType(exFmt as Parameters<typeof mapFormatToType>[0]);

  const format = (() => {
    if (heroResult?.formatLine) {
      const fl = heroResult.formatLine.toUpperCase();
      if (fl && fl !== 'WORKOUT') return fl;
    }
    return mapFormatToType(exFmt);
  })();

  const sub = (() => {
    if (exFmt === 'strength') return 'build to heavy';
    if (exFmt === 'amrap' && data.durationMinutes > 0) return `${Math.round(data.durationMinutes)} min`;
    if (exFmt === 'for_time') return explicitTimeCapSub(page.exercise, data.rawText);
    return '';
  })();

  const mineMap = buildMineMap(data);
  const teamSize = data.teamSize ?? 1;
  const rows: PosterRow[] = section ? sectionsToRows([section], mineMap, title, teamSize) : [];

  const resultLabel = (() => {
    switch (exFmt) {
      case 'for_time': return 'MY TIME';
      case 'amrap': case 'amrap_intervals': return 'ROUNDS';
      case 'strength': return 'TOP SET';
      default: return 'RESULT';
    }
  })();
  const resultValue = heroResult
    ? `${heroResult.value}${heroResult.unit ? ` ${heroResult.unit}` : ''}`
    : '--';

  const rx: string | null = data.isPR ? 'PR' : null;
  const totals = buildTotals(data, resultValue);

  return {
    type, title, date: formatWorkoutDate(date), format, sub,
    blocks: [],
    result: { label: resultLabel, value: resultValue },
    rx,
    totals,
    ep: Math.round(data.totalEP ?? 0),
    teamSize,
    _rows: rows,
  } as PosterWodInternal;
}

// ─── Main builder ──────────────────────────────────────────────────────────

export function buildPosterWod(
  data: CelebrationData,
  workoutDate?: Date,
): PosterWod {
  const date = workoutDate ?? new Date();

  // Title — null when generic or when it would duplicate the format string
  const rawTitle = data.rewardDisplayTitle ?? '';
  let title: string | null = rawTitle && !isGenericTitle(rawTitle)
    ? rawTitle.toUpperCase()
    : null;

  const type = mapFormatToType(data.workoutFormat);
  const format = buildFormatLine(data);
  const sub = buildSubLine(data);

  // Clear title if it duplicates the format or type string
  if (title && (
    title.toUpperCase() === format.toUpperCase() ||
    title.toUpperCase() === type.toUpperCase()
  )) {
    title = null;
  }
  const dateStr = formatWorkoutDate(date);

  // Result
  const resultLabel = buildResultLabel(data.workoutFormat);
  const resultValue = buildResultValue(data);

  // RX badge
  const rx: string | null = data.isPR ? 'PR' : null;

  // Totals for brand strip
  const totals = buildTotals(data, resultValue);

  // Build mine map: breakdown movements + storyMovements merged
  const mineMap = buildMineMap(data);
  const teamSize = data.teamSize ?? 1;

  // Flatten artifact sections into rows
  const rows = sectionsToRows(data.artifactSections, mineMap, title, teamSize);

  const wod: PosterWodInternal = {
    type,
    title,
    date: dateStr,
    format,
    sub,
    blocks: [],
    result: { label: resultLabel, value: resultValue },
    rx,
    totals,
    ep: Math.round(data.totalEP ?? 0),
    teamSize,
    _rows: rows,
  };

  return wod;
}
