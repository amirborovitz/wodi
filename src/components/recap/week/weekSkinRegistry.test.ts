import { describe, expect, it } from 'vitest';
import { weekSkinFor } from './weekSkinRegistry';

describe('weekSkinFor — the week arrives in your own poster style', () => {
  it('uses your favourite style when it has a week version', () => {
    expect(weekSkinFor(['hazard', 'slab']).id).toBe('hazard');
  });

  it('skips a favourite with no week version and takes your next one', () => {
    expect(weekSkinFor(['sun', 'blueprint', 'chalk']).id).toBe('chalk');
  });

  it('falls back to Slab', () => {
    expect(weekSkinFor([]).id).toBe('slab');
  });
});
