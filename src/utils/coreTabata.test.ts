import { describe, it, expect } from 'vitest';
import { isTabataBlock, isCoreWorkBlock, isCoreTabataBlock, coreTabataDoseSeconds } from './coreTabata';

/** The shape the parser actually saves for "C. Cash out - Core TABATA" (BURN, 2026-09-24). */
const coreTabataFromBoard = {
  name: 'Core Tabata',
  prescription: 'Cash out - Core TABATA',
  rawText: 'C. Cash out - Core TABATA',
  intervalCount: 8,
  workDuration: 160,
  restDuration: 80,
  intervalSeconds: 20,
  intervalRestSeconds: 10,
  movements: [{ name: 'Cash-out: Core' }],
};

describe('isTabataBlock', () => {
  it('reads the protocol off the cadence, not off the word', () => {
    expect(isTabataBlock(coreTabataFromBoard)).toBe(true);
    // Same block, the word removed everywhere. The clock is what makes it a tabata.
    expect(isTabataBlock({
      name: 'Cash out', intervalSeconds: 20, intervalRestSeconds: 10, intervalCount: 8,
    })).toBe(true);
  });

  it('is not fooled by a clock that only looks similar', () => {
    // 30/10 is a common accessory interval and is not tabata.
    expect(isTabataBlock({ intervalSeconds: 30, intervalRestSeconds: 10, intervalCount: 8 })).toBe(false);
    // 20/10 for longer than eight windows is a different piece.
    expect(isTabataBlock({ intervalSeconds: 20, intervalRestSeconds: 10, intervalCount: 16 })).toBe(false);
    // Work with no rest is an EMOM-shaped block, whatever the window.
    expect(isTabataBlock({ intervalSeconds: 20, intervalCount: 8 })).toBe(false);
    expect(isTabataBlock({ name: 'Bench Press' })).toBe(false);
    expect(isTabataBlock(null)).toBe(false);
  });
});

describe('isCoreWorkBlock', () => {
  it('falls back to the block title when the board named no movement', () => {
    expect(isCoreWorkBlock({ name: 'Core Tabata', movements: [] })).toBe(true);
    expect(isCoreWorkBlock({ name: 'Core Tabata' })).toBe(true);
  });

  it('reads the named movements when there are any', () => {
    expect(isCoreWorkBlock({
      name: 'Cash out',
      movements: [{ name: 'Flutter Kick' }, { name: 'Hollow Rock' }, { name: 'V-up' }],
    })).toBe(true);
  });

  it('needs EVERY movement to be midline — one countable one makes it a metcon', () => {
    expect(isCoreWorkBlock({
      name: 'Cash out',
      movements: [{ name: 'Hollow Rock' }, { name: 'Burpee' }],
    })).toBe(false);
    expect(isCoreWorkBlock({ name: 'Cash out', movements: [{ name: 'Thruster' }] })).toBe(false);
  });

  it('says no when there is nothing at all to judge', () => {
    expect(isCoreWorkBlock({ movements: [] })).toBe(false);
    expect(isCoreWorkBlock(null)).toBe(false);
  });
});

describe('isCoreTabataBlock', () => {
  it('takes the board that started this', () => {
    expect(isCoreTabataBlock(coreTabataFromBoard)).toBe(true);
  });

  it('needs both facts', () => {
    // A tabata of thrusters is a scored piece — it keeps its logging screen.
    expect(isCoreTabataBlock({
      name: 'Tabata Thrusters',
      intervalSeconds: 20, intervalRestSeconds: 10, intervalCount: 8,
      movements: [{ name: 'Thruster' }],
    })).toBe(false);
    // Core work that is not on a tabata clock keeps its reps.
    expect(isCoreTabataBlock({
      name: 'Core circuit',
      movements: [{ name: 'Hollow Rock' }, { name: 'V-up' }],
    })).toBe(false);
  });
});

describe('coreTabataDoseSeconds', () => {
  it('is the block clock: eight 20s windows and the seven rests between them', () => {
    expect(coreTabataDoseSeconds(coreTabataFromBoard)).toBe(230);
    // Which is the four minutes everyone calls a tabata, once rounded for display.
    expect(Math.round(coreTabataDoseSeconds(coreTabataFromBoard) / 60)).toBe(4);
  });
});
