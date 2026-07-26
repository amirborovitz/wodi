type DateOrder = 'day_first' | 'month_first' | 'year_first';

interface DateCandidate {
  iso: string;
  distanceDays: number;
  order: DateOrder;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const ORDER_PRIORITY: Record<DateOrder, number> = {
  day_first: 0,
  month_first: 1,
  year_first: 2,
};

function toIsoCalendarDate(year: number, month: number, day: number): string | undefined {
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    return undefined;
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function expandYear(rawYear: number, referenceYear: number): number {
  if (rawYear >= 100) return rawYear;
  const century = Math.floor(referenceYear / 100) * 100;
  return [century - 100 + rawYear, century + rawYear, century + 100 + rawYear]
    .sort((a, b) => Math.abs(a - referenceYear) - Math.abs(b - referenceYear))[0];
}

function addCandidate(
  candidates: DateCandidate[],
  year: number,
  month: number,
  day: number,
  order: DateOrder,
  referenceDate: Date,
): void {
  const iso = toIsoCalendarDate(year, month, day);
  if (!iso) return;
  const referenceUtc = Date.UTC(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate(),
  );
  const candidateUtc = Date.UTC(year, month - 1, day);
  const distanceDays = Math.abs(candidateUtc - referenceUtc) / DAY_MS;
  if (!candidates.some((candidate) => candidate.iso === iso && candidate.order === order)) {
    candidates.push({ iso, distanceDays, order });
  }
}

function collectTokenCandidates(
  token: string,
  referenceDate: Date,
  candidates: DateCandidate[],
): void {
  const parts = token.split(/[-/.]/);
  if (parts.length !== 3) return;
  const [firstText, secondText, thirdText] = parts;
  const first = Number.parseInt(firstText, 10);
  const second = Number.parseInt(secondText, 10);
  const third = Number.parseInt(thirdText, 10);
  if (![first, second, third].every(Number.isFinite)) return;

  const referenceYear = referenceDate.getFullYear();
  if (firstText.length === 4) {
    addCandidate(candidates, first, second, third, 'year_first', referenceDate);
    return;
  }
  if (thirdText.length === 4) {
    addCandidate(candidates, third, second, first, 'day_first', referenceDate);
    addCandidate(candidates, third, first, second, 'month_first', referenceDate);
    return;
  }

  addCandidate(candidates, expandYear(third, referenceYear), second, first, 'day_first', referenceDate);
  addCandidate(candidates, expandYear(third, referenceYear), first, second, 'month_first', referenceDate);
  const yearFirst = expandYear(first, referenceYear);
  if (Math.abs(yearFirst - referenceYear) <= 2) {
    addCandidate(candidates, yearFirst, second, third, 'year_first', referenceDate);
  }
}

function collectDateCandidates(
  text: string | undefined,
  referenceDate: Date,
  candidates: DateCandidate[],
  allowAmbiguousHyphen: boolean,
): void {
  if (!text) return;
  const tokenPattern = allowAmbiguousHyphen
    ? /\b(?:\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})\b/g
    : /\b(?:\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/.]\d{1,2}[/.]\d{2,4})\b/g;
  const tokens = text.match(tokenPattern);
  tokens?.forEach((token) => collectTokenCandidates(token, referenceDate, candidates));
}

/**
 * Resolves ambiguous numeric dates using calendar validity first, proximity to
 * the workout/capture date second, and day-first notation as the final tie-break.
 */
export function resolveSourceDate(
  parsedSourceDate: string | undefined,
  rawText: string | undefined,
  referenceDate: Date,
): string | undefined {
  const candidates: DateCandidate[] = [];
  collectDateCandidates(parsedSourceDate, referenceDate, candidates, true);
  collectDateCandidates(rawText, referenceDate, candidates, false);
  candidates.sort((a, b) =>
    a.distanceDays - b.distanceDays
    || ORDER_PRIORITY[a.order] - ORDER_PRIORITY[b.order],
  );
  return candidates[0]?.iso;
}
