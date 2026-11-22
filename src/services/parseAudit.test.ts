import { describe, expect, it } from 'vitest';
import { isLoudEntry, recordTotalsOverruled, takePendingAudit } from './parseAudit';

describe('parseAudit — the AI\'s totals overruled', () => {
  it('records each total the recipe\'s arithmetic replaced, by movement and side', () => {
    takePendingAudit();
    recordTotalsOverruled([
      { movement: 'Echo Bike', stated: 7200, fromRecipe: 5400 },
      { movement: 'Row', side: 'women', stated: 40, fromRecipe: 48 },
    ]);
    const entries = takePendingAudit();
    expect(entries).toEqual([
      { path: 'recipe.totals.Echo Bike', kind: 'override', from: 7200, to: 5400 },
      { path: 'recipe.totals.Row.women', kind: 'override', from: 40, to: 48 },
    ]);
    expect(entries.every(isLoudEntry)).toBe(true);
  });

  it('hands each entry to telemetry once', () => {
    recordTotalsOverruled([{ movement: 'Burpee', stated: 10, fromRecipe: 40 }]);
    expect(takePendingAudit()).toHaveLength(1);
    expect(takePendingAudit()).toEqual([]);
  });

  it('keeps the running tally readable from devtools', () => {
    recordTotalsOverruled([{ movement: 'Thruster', stated: 30, fromRecipe: 45 }]);
    expect(globalThis.wodiParseAudit?.byField().some((f) => f.path === 'recipe.totals.Thruster')).toBe(true);
  });
});
