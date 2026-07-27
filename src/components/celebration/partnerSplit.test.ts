import { describe, it, expect } from 'vitest';
import { buildRoundLedger } from './partnerSplit';

describe('buildRoundLedger', () => {
  it('draws no ledger when nothing alternated', () => {
    // The board that surfaced this: "IN TEAMS OF 2 / I GO U GO", but every movement marked
    // (EACH) or SYNC — so both athletes complete all 5 rounds. The old builder cycled by
    // teamSize regardless and told the athlete they had done 3 of 5 rounds.
    expect(buildRoundLedger(5, 5, 5, 2)).toBeUndefined();
    // A personal count above the total is likewise not a trade.
    expect(buildRoundLedger(5, 5, 6, 2)).toBeUndefined();
  });

  it('places exactly personalRounds rounds on "me", leading off when the share is larger', () => {
    const ledger = buildRoundLedger(5, 5, 3, 2);
    expect(ledger).toEqual(['me', 'partner', 'me', 'partner', 'me']);
    expect(ledger!.filter(r => r === 'me')).toHaveLength(3);
  });

  it('lets the partner lead when mine is the smaller share', () => {
    // 2 of 5 rounds are mine — the athlete went second, so rounds 2 and 4 are theirs.
    const ledger = buildRoundLedger(5, 5, 2, 2);
    expect(ledger).toEqual(['partner', 'me', 'partner', 'me', 'partner']);
    expect(ledger!.filter(r => r === 'me')).toHaveLength(2);
  });

  it('cycles by team size for teams of three', () => {
    expect(buildRoundLedger(9, 9, 3, 3)).toEqual([
      'me', 'partner', 'partner',
      'me', 'partner', 'partner',
      'me', 'partner', 'partner',
    ]);
  });

  it('marks rounds past the completed count as pending, never partial', () => {
    expect(buildRoundLedger(5, 3, 3, 2)).toEqual(['me', 'partner', 'me', 'pending', 'pending']);
  });

  it('returns undefined for degenerate inputs rather than an empty strip', () => {
    expect(buildRoundLedger(0, 0, 0, 2)).toBeUndefined();
    expect(buildRoundLedger(5, 5, 0, 2)).toBeUndefined();
  });
});
