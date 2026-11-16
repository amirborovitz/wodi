import { describe, expect, it } from 'vitest';
import { buildWeekSoFarStrip } from './useWeekSoFarStrip';
import type { BodyAreaSessions } from '../data/bodyAreas';

const none: BodyAreaSessions = { shoulders: 0, chest: 0, arms: 0, back: 0, core: 0, glutes: 0, quads: 0, hamstrings: 0, calves: 0 };

describe('buildWeekSoFarStrip — "This week" on Home', () => {
  it('says the time is time moving, with the sessions beside it', () => {
    const strip = buildWeekSoFarStrip({ sessions: 4, moveMinutes: 155, bodyAreas: { ...none, quads: 3 } });
    expect([strip.hero, strip.heroUnit, strip.sessions]).toEqual(['2:35', 'hrs moving', { count: '4', unit: 'sessions' }]);
    expect(strip.body?.tally.map((r) => r.label)).toEqual(['Quads']);
  });

  it('leads with sessions when no workout logged a time, and draws no body when nothing resolved', () => {
    const strip = buildWeekSoFarStrip({ sessions: 1, moveMinutes: 0, bodyAreas: none });
    expect([strip.hero, strip.heroUnit, strip.sessions, strip.body]).toEqual(['1', 'session', null, null]);
  });
});
