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
  // meta: quiet context beside the hero score — "12:00 CAP" for a plain AMRAP, or "into round 7"
  // for a ladder AMRAP's partial reps. No rep-total field by design — the poster never carries a
  // checkable reps total for a ladder score; see buildAmrapResultMeta.
  result: { label: string; value: string; meta?: string };
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
  // Ascending-ladder AMRAP bar-chart track — see ArtifactRow.ladderTrack. When present, skins
  // render the normal rx/load/mine row AND additionally render this chart right below it.
  ladderTrack?: { reps: number[]; step: number; partial?: number; cadence?: string };
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
  /^\d+\s*sections?\s+for\s+time(?:\s*[•·-]\s*.*)?$/i,
  /^\d+[-\s]min\s+amrap$/i,           // "12-Min AMRAP"
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

// Suppress section headers that are just describing the workout format
const FORMAT_HEADER_PATTERNS = [
  ...GENERIC_TITLE_PATTERNS,
  ...CADENCE_TITLE_PATTERNS,
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

function formatSourceDate(sourceDate: string | undefined, fallbackDate: Date): string {
  if (!sourceDate) return formatWorkoutDate(fallbackDate);
  const match = sourceDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return formatWorkoutDate(fallbackDate);
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);
  const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const monthLabel = monthNames[month - 1];
  if (!monthLabel || day < 1 || day > 31) return formatWorkoutDate(fallbackDate);
  return `${day} ${monthLabel} ${String(year).slice(-2)}`;
}

function buildFormatLine(data: CelebrationData): string {
  if (data.artifactSections[0]?.partnerDisplayMode === 'sections') {
    const cap = explicitTimeCapSub(data.exercises[0], data.rawText);
    return [
      `${data.artifactSections.length} SECTIONS FOR TIME`,
      cap || null,
    ].filter(Boolean).join(' · ');
  }

  // Confirmed-partner workouts: trust the artifact blueprint — it's already split-aware (computed
  // from the same repeatCount/teamSize data as the round ledger below it) — over
  // heroResult.formatLine or the independent regex fallback chain further down, which run their
  // own separate "for time vs intervals" detection and can disagree (e.g. "12 INTERVALS" header
  // above a "12 ROUNDS FOR TIME" blueprint for the exact same WOD). Gated on isPartnerConfirmed,
  // not raw teamSize — a session-level teamSize doesn't mean THIS card's own block is partnered.
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
  const exercises = data.exercises;
  const ex0 = exercises[0];

  if ((fmt === 'amrap' || fmt === 'amrap_intervals') && data.durationMinutes > 0) {
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
  if (data.artifactSections[0]?.isPartnerConfirmed) {
    return '';
  }
  const fmt = data.workoutFormat;
  const ex0 = data.exercises[0];
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

// A partner score is the team's, never personal — "OUR ___" for any CONFIRMED-partner card,
// regardless of split type (the shared hero never changes between split types; only the
// per-movement readout above it does). Strength stays individual even in a team session.
// isPartner must come from isPartnerConfirmed (this card's own content), never raw teamSize —
// a session-level teamSize doesn't mean this specific card's block is the partnered one.
function buildResultLabel(format: string | undefined, isPartner: boolean): string {
  switch (format) {
    case 'for_time':        return isPartner ? 'OUR TIME' : 'MY TIME';
    case 'amrap':
    case 'amrap_intervals': return isPartner ? 'OUR ROUNDS' : 'TOTAL ROUNDS';
    case 'strength':        return 'TOP SET';
    case 'emom':
    case 'intervals':       return 'ROUNDS HELD';
    default:                return isPartner ? 'OUR RESULT' : 'MY RESULT';
  }
}

function buildResultValue(data: CelebrationData): string {
  const hero = data.heroResult;
  if (!hero) return '--';
  // A ladder AMRAP's unit IS part of the score ("6" + "+10" = rounds + partial reps), not a
  // redundant label restating the unit ("ROUNDS") the result label already states — so it must
  // always render. For every other format, skip it: the result label provides that context, and
  // appending it again risks multi-line wrapping at the hero's large font size.
  if (hero.ladderIntoRound != null && hero.unit) return `${hero.value} ${hero.unit}`;
  return hero.value ?? '--';
}

/**
 * Quiet context beside an AMRAP hero score. A ladder AMRAP's rounds+partial score ("6 +10")
 * gets "into round 7" — which round the partial is logged into — never a rep total (a round is
 * often several movements, so a total can't be verified at a glance; that reconciliation belongs
 * in the log/edit view, not the shared poster). Every other AMRAP falls back to the cap alone.
 */
function buildAmrapResultMeta(
  isAmrap: boolean,
  amrapMinutes: number | undefined,
  heroResult: HeroResult | null | undefined,
): { meta?: string } {
  if (!isAmrap) return {};
  if (heroResult?.ladderIntoRound != null) {
    return { meta: `into round ${heroResult.ladderIntoRound}` };
  }
  return { meta: amrapMinutes ? `${amrapMinutes}:00 CAP` : undefined };
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

    const isCadenceTitle = CADENCE_TITLE_PATTERNS.some((p) => p.test(section.title?.trim() ?? ''));

    if (hasHeader) {
      rows.push({
        kind: 'block',
        // Suppress the label when it's just repeating the poster title, but
        // keep the cap (e.g. "8 sets") so the prescription story is visible.
        label: isDuplicateTitle ? '' : section.title.toUpperCase(),
        cap,
      } satisfies PosterBlock);
    } else if ((isDuplicateTitle || isCadenceTitle) && cap) {
      // Section title was a format/cadence header (suppressed as label) but the
      // blueprint cap carries structural context worth showing (e.g. "EVERY 4 MIN · 4 ROUNDS").
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

// Splits an AI-prescribed ONE-SHOT team total in `primary` into a per-partner share —
// e.g. "100" → "50", "1800m" → "900m", "80 CAL" → "40 cal" (teamSize=2). Only valid for a
// single shared target (e.g. "100 wall balls, split however"). Never call this for a
// per-round/per-turn value (row.repeatCount > 1) — IGUG-style partner rounds alternate whole
// rounds between partners, so the reps/distance/calories *within* one round are never split
// further; dividing them again double-discounts the work.
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
      mine: row.partnerMine ?? '',
      team: '',
      total: undefined,
      roundLabel: row.roundLabel,
      ladderTrack: row.ladderTrack,
    };
  }

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
      // nameWithLoad is pre-computed as "${perRoundDist} ${name}" for relay rows (e.g. "1.3km Echo
      // Bike") — use it instead of bare name when suppressDistanceTotal prevented subNote from
      // carrying the total.
      rxLabel = row.nameWithLoad?.trim() || row.name;
    }
  } else if (row.roundLabel != null) {
    rxLabel = row.primary ?? '';
  } else {
    rxLabel = row.primary ? `${row.primary} ${row.name}` : row.name;
  }

  const load = row.subNote && isRxLoad(row.subNote) ? row.subNote : '';
  const mineRaw = row.suppressMine ? '' : lookupMineValue(mineMap, row.name || rxLabel, rxLabel);
  const total = row.totalNote || (row.subNote && /\btotal\b/i.test(row.subNote) ? row.subNote : undefined);
  const loadSuffix = row.loadNote || extractLoadSuffix(row.nameWithLoad);

  const isPerRoundValue = !!(row.repeatCount && row.repeatCount > 1);

  let team = '';
  let mine = row.suppressMine ? '' : loadSuffix || mineRaw;
  const mineBeforeWipe = mine;
  // Gate on this ROW's own confirmed split (set only when this block's own text confirmed
  // partner language — see partnerSplit.ts), never on the raw teamSize alone. teamSize is a
  // session-level field the AI stamps once for the whole multi-part workout (so EP/volume math
  // scales correctly everywhere) — it does not mean every block in the session is partnered.
  // Using it unguarded here would divide an unconfirmed solo block's values by teamSize purely
  // because a SIBLING block in the same session happens to be partnered.
  if (row.partnerSplit === 'reps' && teamSize && teamSize > 1 && !isPerRoundValue) {
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

  return { kind: 'line', rx: rxLabel.trim(), load, mine, team, total, roundLabel: row.roundLabel, ladderTrack: row.ladderTrack };
}

// ─── Per-page builder (carousel / multi-part workouts) ───────────────────

export function buildPosterWodFromPage(
  data: CelebrationData,
  pageIndex: number,
): PosterWod {
  const pages = data.carouselPageData!;
  const page = pages[pageIndex];
  const section = data.perPageSections?.[pageIndex] ?? null;
  const heroResult = data.perPageHeroResults?.[pageIndex] ?? null;

  const date = data.workoutDate;

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

  // 'amrap' and 'amrap_intervals' are both displayed as "AMRAP" everywhere else in this function
  // (the type tag above, mapFormatToType, resultLabel below) — duration extraction must treat
  // them the same way, or a single-AMRAP-block exercise classified as amrap_intervals silently
  // skips the duration entirely while the tag still reads "AMRAP".
  const isAmrap = exFmt === 'amrap' || exFmt === 'amrap_intervals';

  // This exercise's OWN prescribed AMRAP duration (never the workout-wide duration, which mixes
  // in the other parts of a multi-block session) — used for both the title and the format line
  // so the card states the duration instead of bare "AMRAP" duplicating the type tag.
  const amrapMinutes = isAmrap ? extractAmrapMinutes(page.exercise) : undefined;

  const exName = page.exercise.name?.trim().toUpperCase() ?? null;
  let title = exName && !isGenericTitle(exName) ? exName : null;
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
    if (heroResult?.formatLine) {
      const fl = heroResult.formatLine.toUpperCase();
      if (fl && fl !== 'WORKOUT') return fl;
    }
    if (isAmrap && amrapMinutes) return `${amrapMinutes}-MIN AMRAP`;
    return mapFormatToType(exFmt);
  })();

  // Never let the title repeat the format/type string verbatim (e.g. a title that resolved to
  // bare "AMRAP") — matches the de-dup rule already enforced in buildPosterWod.
  if (title && (title.toUpperCase() === format.toUpperCase() || title.toUpperCase() === type.toUpperCase())) {
    title = null;
  }
  if (!title && isPartnerPage) {
    title = 'PARTNER METCON';
  }

  const sub = (() => {
    if (isPartnerPage) return '';
    if (exFmt === 'strength') return 'build to heavy';
    if (isAmrap && amrapMinutes) return `${amrapMinutes} min`;
    if (exFmt === 'for_time') return explicitTimeCapSub(page.exercise, data.rawText);
    return '';
  })();

  const mineMap = buildMineMap(data);
  const teamSize = data.teamSize ?? 1;
  const rows: PosterRow[] = section ? sectionsToRows([section], mineMap, title, teamSize) : [];

  const resultLabel = (() => {
    switch (exFmt) {
      case 'for_time': return isPartnerPage ? 'OUR TIME' : 'MY TIME';
      case 'amrap': case 'amrap_intervals': return isPartnerPage ? 'OUR ROUNDS' : 'ROUNDS';
      case 'strength': return 'TOP SET';
      case 'emom': case 'intervals': return 'ROUNDS HELD';
      default: return isPartnerPage ? 'OUR RESULT' : 'RESULT';
    }
  })();
  const resultValue = heroResult
    ? resultLabel === 'ROUNDS HELD'
      ? heroResult.value
      : `${heroResult.value}${heroResult.unit ? ` ${heroResult.unit}` : ''}`
    : '--';
  const { meta: resultMeta } = buildAmrapResultMeta(isAmrap, amrapMinutes, heroResult);

  const rx: string | null = data.isPR ? 'PR' : null;
  const totals = buildTotals(data, resultValue);

  const sectionLedger = section?.roundLedger;
  const split: PosterWod['split'] = sectionLedger ? 'rounds' : section?.partnerDisplayMode === 'sections' ? 'sections' : 'reps';
  const rounds = sectionLedger?.rounds;

  return {
    type, title, date: formatSourceDate(data.sourceDate, date), format, sub,
    blocks: [],
    result: { label: resultLabel, value: resultValue, meta: resultMeta },
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

export function buildPosterWod(
  data: CelebrationData,
): PosterWod {
  const date = data.workoutDate;

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
  const dateStr = formatSourceDate(data.sourceDate, date);

  const isPartnerConfirmed = !!data.artifactSections[0]?.isPartnerConfirmed;
  const sectionLedger = data.artifactSections[0]?.roundLedger;
  const split: PosterWod['split'] = sectionLedger ? 'rounds' : data.artifactSections[0]?.partnerDisplayMode === 'sections' ? 'sections' : 'reps';
  const rounds = sectionLedger?.rounds;
  if (!title && isPartnerConfirmed) {
    title = 'PARTNER METCON';
  }

  // Result
  const resultLabel = buildResultLabel(data.workoutFormat, isPartnerConfirmed);
  const resultValue = buildResultValue(data);
  const isAmrap = data.workoutFormat === 'amrap' || data.workoutFormat === 'amrap_intervals';
  const amrapMinutes = data.durationMinutes > 0 ? Math.round(data.durationMinutes) : undefined;
  const { meta: resultMeta } = buildAmrapResultMeta(isAmrap, amrapMinutes, data.heroResult);

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
    result: { label: resultLabel, value: resultValue, meta: resultMeta },
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
