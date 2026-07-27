import { describe, it, expect } from 'vitest';
import { normalizeMovementName } from './workoutPostProcessor';

describe('normalizeMovementName', () => {
  it('canonicalises a bare movement name', () => {
    expect(normalizeMovementName('db thruster')).toBe('DB Thruster');
    expect(normalizeMovementName('dumbbell thruster')).toBe('DB Thruster');
  });

  it('keeps board qualifiers the alias table does not know', () => {
    // Alias substitution used to return the bare canonical, throwing away every unmatched word.
    // A board writing "SYNC DUAL DB THRUSTERS" lost its "Sync Dual" while the sibling movement
    // "Sync Dual Dumbbell Devil Press" (no alias hit) kept its full name — one board, two
    // naming conventions on the same poster.
    expect(normalizeMovementName('Sync Dual DB Thruster')).toBe('Sync Dual DB Thruster');
    expect(normalizeMovementName('Weighted DB Thruster')).toBe('Weighted DB Thruster');
  });

  it('leaves a name with no alias hit intact', () => {
    // Proof that the saved "DB Thruster" for a board reading "12 Sync Dual Dumbbell Thrusters"
    // did NOT come from this function: the plural form matches no alias, so the normalizer
    // passes it straight through. That truncation happened upstream, in the AI's movement name.
    expect(normalizeMovementName('Sync Dual Dumbbell Thrusters')).toBe('Sync Dual Dumbbell Thrusters');
    expect(normalizeMovementName('Sync Dual Dumbbell Devil Press')).toBe('Sync Dual Dumbbell Devil Press');
  });

  it('still preserves the prefix modifiers it already handled', () => {
    expect(normalizeMovementName('alternating db snatch')).toMatch(/^Alt /);
  });
});
