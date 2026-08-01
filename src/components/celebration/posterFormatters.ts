/**
 * Pure string/number formatters for the celebration poster. No domain logic, no other-helper
 * dependencies — just formatting. Extracted from helpers.ts; re-exported from there for API compat.
 */

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

/**
 * THE way a logged load reads on a poster. One weight prints as itself ("50kg"); a build prints
 * every rung the athlete actually stood on, in the order they climbed ("50-52.5-55-57.5-60kg").
 * Same function for a lone lift and for one block of a sequential piece, so a build never renders
 * as a single number just because of where the row came from.
 *
 * Every rung, not just the endpoints: the climb IS the story of a build-up day, and a poster that
 * says "50-65kg" hides whether that took three jumps or seven.
 *
 * Weights arrive PER IMPLEMENT. The "2×" prefix marks a pair the athlete held one in each hand,
 * and only fits a single figure — a pair that also climbed reads as its rungs alone, since
 * "2×45-55kg" parses as arithmetic rather than as a range.
 */
export function formatLoggedLoad(
  weights: readonly number[] | undefined,
  unit: 'kg' | 'lb' = 'kg',
  implementCount = 1,
): string {
  const distinct = [...new Set((weights ?? []).filter((w) => w > 0))];
  if (distinct.length === 0) return '';
  if (distinct.length > 1) return `${distinct.join('-')}${unit}`;
  return implementCount > 1 ? `${implementCount}×${distinct[0]}${unit}` : `${distinct[0]}${unit}`;
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
  // "EMOM 15" / "EMOM for 15 minutes" — the board's own label beats a generic "every 1 min"
  const emom = text.match(/\bemom\s*(?:for\s+)?(\d+)\s*(?:min(?:ute)?s?)?\b/i);
  if (emom) return `EMOM ${emom[1]} MIN`;
  // Boards write the cadence with a trailing colon ("Every 01:30 minutes:") as often as bare, so
  // the terminator allows punctuation — requiring whitespace/end dropped the cadence entirely.
  const mmss = text.match(/every\s+0?(\d+):(\d{2})\s*(?:min(?:utes?)?)?(?:\s*[x×]|(?=[\s:,.]|$))/i);
  if (mmss) {
    const mins = parseInt(mmss[1]);
    const secs = parseInt(mmss[2]);
    return secs === 0 ? `EVERY ${mins} MIN` : `EVERY ${mins}:${secs.toString().padStart(2, '0')}`;
  }
  const simple = text.match(/every\s+(\d+(?:\.\d+)?)\s*min(?:utes?)?\b/i);
  if (simple) return `EVERY ${simple[1]} MIN`;
  return undefined;
}
