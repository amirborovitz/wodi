import { describe, it, expect } from 'vitest';
import { formatIsoPosterDate } from './posterData';

describe('formatIsoPosterDate', () => {
  it('writes MMM DD YY with a zero-padded day, so the date stepper keeps its width', () => {
    expect(formatIsoPosterDate('2026-09-15')).toBe('SEP 15 26');
    expect(formatIsoPosterDate('2026-09-05')).toBe('SEP 05 26');
    expect(formatIsoPosterDate('2027-01-01')).toBe('JAN 01 27');
  });

  it('refuses anything that is not a real calendar day', () => {
    expect(formatIsoPosterDate('2026-02-30')).toBeNull();
    expect(formatIsoPosterDate('2026-13-01')).toBeNull();
    expect(formatIsoPosterDate('yesterday')).toBeNull();
  });
});
