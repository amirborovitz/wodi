import { describe, it, expect } from 'vitest';
import type { Exercise, MovementTotal } from '../../types';
import { computeHeroResult } from './helpers';
import { posterPageFormat, mapFormatToType } from './faces/HandwrittenFace/posterData';

// What a core tabata's poster page says. The board is "C. Cash out - Core TABATA" and it shares
// a session with a 12-minute metcon — which is how the page used to end up claiming both the
// metcon's FOR TIME badge and its time cap.
const coreTabata: Exercise = {
  id: 'ex-2',
  name: 'Core Tabata',
  type: 'wod',
  loggingMode: 'intervals',
  prescription: 'Cash out - Core TABATA',
  rawText: 'C. Cash out - Core TABATA',
  intervalCount: 8,
  intervalSeconds: 20,
  intervalRestSeconds: 10,
  sets: [],
  movements: [{ name: 'Cash-out: Core', inputType: 'none', equipment: 'none' }],
} as unknown as Exercise;

const doseOnly: MovementTotal[] = [{ name: 'Core', exerciseIndex: 1, totalTime: 230 }];

describe('a core tabata page wears its own format', () => {
  it('reads TABATA off the clock, not the session', () => {
    // The session is a for-time metcon. The page is not.
    expect(posterPageFormat(coreTabata, 'for_time', false)).toBe('tabata');
    expect(mapFormatToType(posterPageFormat(coreTabata, 'for_time', false) as 'tabata')).toBe('TABATA');
  });

  // The gap that let the badge be wrong: 'intervals' and 'emom' were absent from the page
  // builder's own loggingMode list, so both fell through to whatever the SESSION said.
  it('stops an interval or EMOM part inheriting a sibling metcon format', () => {
    const emom = { ...coreTabata, loggingMode: 'emom', intervalSeconds: 60, intervalRestSeconds: undefined, intervalCount: 16 } as unknown as Exercise;
    expect(posterPageFormat(emom, 'for_time', false)).toBe('emom');

    const intervals = { ...coreTabata, loggingMode: 'intervals', intervalSeconds: 90, intervalRestSeconds: undefined, intervalCount: 12 } as unknown as Exercise;
    expect(posterPageFormat(intervals, 'for_time', false)).toBe('intervals');
  });
});

describe('a core tabata heroes its dose', () => {
  it('prints the four minutes, never a rep count or a fallback EP', () => {
    const hero = computeHeroResult([coreTabata], 'for_time', 0, 94, 12, false, doseOnly);

    expect(hero.value).toBe('4');
    expect(hero.unit).toBe('MIN');
    // The protocol, which is the only line on the card that can state the structure.
    expect(hero.formatLine).toBe('Tabata · 8 × 20/10');
  });

  it('beats the EP fallback that would otherwise claim the page', () => {
    // Nothing is logged against this part — by design, there is nothing to log. Before, that
    // emptiness sent the page to the session's EP or to the fabricated per-window rep count.
    const hero = computeHeroResult([coreTabata], 'for_time', 0, 94, 12, false, []);
    expect(hero.unit).toBe('MIN');
    expect(hero.value).toBe('4');
  });
});
