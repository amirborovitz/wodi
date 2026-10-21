import { describe, it, expect } from 'vitest';
import { readClockAnswer } from './clockAnswer';

describe('a finish time the athlete types', () => {
  it('"2130" is 21:30 — the AI read it as 2,130 seconds (35:30) on 2026-10-11', () => {
    expect(readClockAnswer('2130')).toBe(21 * 60 + 30);
  });

  it('reads every way a clock gets typed on a phone', () => {
    expect(readClockAnswer('21:30')).toBe(1290);
    expect(readClockAnswer('21.30')).toBe(1290);
    expect(readClockAnswer('21 30')).toBe(1290);
    expect(readClockAnswer('17;24')).toBe(1044);
    expect(readClockAnswer('17,24')).toBe(1044);
    expect(readClockAnswer('930')).toBe(570);
    expect(readClockAnswer('9:05')).toBe(545);
    expect(readClockAnswer('1:02:15')).toBe(3735);
    expect(readClockAnswer('21m30s')).toBe(1290);
    expect(readClockAnswer('21 min')).toBe(1260);
    expect(readClockAnswer('21')).toBe(1260);
  });

  it('leaves anything else to the AI — words, or a number that is not a clock', () => {
    expect(readClockAnswer('about 21 and a half, brutal')).toBeNull();
    expect(readClockAnswer('capped at 18 + 12 reps')).toBeNull();
    expect(readClockAnswer('2190')).toBeNull(); // 90 seconds isn't a clock reading
    expect(readClockAnswer('21:75')).toBeNull();
    expect(readClockAnswer('')).toBeNull();
  });
});
