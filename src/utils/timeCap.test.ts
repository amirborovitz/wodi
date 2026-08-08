import { describe, it, expect } from 'vitest';
import {
  parseTimeCapSeconds,
  parseTimedWindowSeconds,
  parsePrescribedCeilingSeconds,
  formatTimeCapLabel,
  timeCapLabelFromText,
} from './timeCap';

describe('parseTimeCapSeconds', () => {
  it('reads marker-first notation the old regexes could not', () => {
    // The board that surfaced this: "T.C - 34 MIN". No previous parser handled a cap marker
    // BEFORE the number, or a dash separator, so the cap was silently dropped everywhere.
    expect(parseTimeCapSeconds('T.C - 34 MIN')).toBe(34 * 60);
    expect(parseTimeCapSeconds('TC: 16min')).toBe(16 * 60);
    expect(parseTimeCapSeconds('time cap 25 minutes')).toBe(25 * 60);
    expect(parseTimeCapSeconds('cap 12')).toBe(12 * 60);
  });

  it('reads trailing-abbreviation notation ending in a period', () => {
    // The dominant house notation in this gym's boards ("< 28 minutes T.C. >"). The old regex
    // ended in \b after "t\.?c\.?" — with a period followed by a space there is no word
    // boundary, so every one of these caps failed to parse.
    expect(parseTimeCapSeconds('< 28 minutes T.C. >')).toBe(28 * 60);
    expect(parseTimeCapSeconds('◁ 20 minutes T.C. ▷')).toBe(20 * 60);
    expect(parseTimeCapSeconds('16 min T.C.')).toBe(16 * 60);
    expect(parseTimeCapSeconds('*42min TC')).toBe(42 * 60);
    expect(parseTimeCapSeconds('20 min cap')).toBe(20 * 60);
  });

  it('supports mm:ss caps', () => {
    expect(parseTimeCapSeconds('TC 7:30')).toBe(7 * 60 + 30);
  });

  it('reads the cap, not the first number that happens to follow the marker', () => {
    // The AI writes a prescription as "35 min cap: 800m run, 40 Thrusters, ...". Marker-first
    // matched "cap: 800" and, being tried first, won — the poster printed "800 MIN CAP". The
    // marker-LAST reading is the specific one here and must take precedence.
    expect(parseTimeCapSeconds('35 min cap: 800m run, 40 Thrusters')).toBe(35 * 60);
    expect(parseTimeCapSeconds('20 min cap: 100 burpees')).toBe(20 * 60);
    // Marker-first still owns the notations only it can read.
    expect(parseTimeCapSeconds('T.C - 34 MIN: 400m run')).toBe(34 * 60);
  });

  it('does not invent a cap where none was written', () => {
    expect(parseTimeCapSeconds('5 rounds for time')).toBeUndefined();
    expect(parseTimeCapSeconds('')).toBeUndefined();
    expect(parseTimeCapSeconds(null)).toBeUndefined();
    // "cap" must not match inside another word, and an AMRAP window is not a cap.
    expect(parseTimeCapSeconds('capacity test 5')).toBeUndefined();
    expect(parseTimeCapSeconds('25 min AMRAP')).toBeUndefined();
  });
});

describe('parseTimedWindowSeconds', () => {
  it('reads AMRAP/EMOM windows, which are a block length and not a cap', () => {
    expect(parseTimedWindowSeconds('25 min AMRAP')).toBe(25 * 60);
    expect(parseTimedWindowSeconds('AMRAP 12')).toBe(12 * 60);
    expect(parseTimedWindowSeconds('EMOM 20')).toBe(20 * 60);
    expect(parseTimedWindowSeconds('E2MOM for 16 min')).toBe(16 * 60);
  });

  it('ignores plain cap notation', () => {
    expect(parseTimedWindowSeconds('T.C - 34 MIN')).toBeUndefined();
  });
});

describe('parsePrescribedCeilingSeconds', () => {
  it('prefers an explicit cap over a timed window when a board carries both', () => {
    expect(parsePrescribedCeilingSeconds('15 min AMRAP, TC 12 min')).toBe(12 * 60);
  });

  it('falls back to the window when no cap is written', () => {
    expect(parsePrescribedCeilingSeconds('15 min AMRAP')).toBe(15 * 60);
  });
});

describe('formatTimeCapLabel / timeCapLabelFromText', () => {
  it('formats whole minutes, sub-minute and mixed caps', () => {
    expect(formatTimeCapLabel(34 * 60)).toBe('34 MIN CAP');
    expect(formatTimeCapLabel(45)).toBe('45 SEC CAP');
    expect(formatTimeCapLabel(7 * 60 + 30)).toBe('7:30 CAP');
  });

  it('renders nothing for an absent or zero cap rather than "0 MIN CAP"', () => {
    expect(formatTimeCapLabel(0)).toBeUndefined();
    expect(formatTimeCapLabel(null)).toBeUndefined();
    expect(timeCapLabelFromText('5 rounds for time')).toBeUndefined();
  });

  it('labels straight from board text', () => {
    expect(timeCapLabelFromText('PART A ... T.C - 34 MIN')).toBe('34 MIN CAP');
  });
});
