import { describe, it, expect } from 'vitest';
import { buildRecordCelebration, type CarouselPage } from './useCelebrationData';
import type { Achievement, Exercise } from '../types';

const firstRunningGrace: Achievement = {
  type: 'benchmark',
  title: 'First Attempt!',
  subtitle: 'Running GRACE · 9:00',
  wodName: 'Running GRACE',
  value: 540,
  icon: 'star',
};

const fasterRunningGrace: Achievement = {
  ...firstRunningGrace,
  title: 'Fastest Time!',
  subtitle: 'Running GRACE · 9:00 (-1:00)',
  previousBest: 600,
  icon: 'medal',
};

const backSquatPR: Achievement = {
  type: 'pr',
  title: 'New PR!',
  subtitle: '140kg Back Squat',
  movement: 'Back Squat',
  value: 140,
  previousBest: 135,
  icon: 'trophy',
};

function page(exercise: Partial<Exercise>): CarouselPage {
  return { exercise: exercise as Exercise, movements: [], isStrength: false };
}

const PAGES: CarouselPage[] = [
  page({ name: 'Front Squat', type: 'strength' }),
  page({ name: '3 Rounds For Time', type: 'wod', wodName: 'Running GRACE' }),
];

describe('the record moment — what the poster rises with', () => {
  it('fires for a named workout logged for the first time', () => {
    const moment = buildRecordCelebration([firstRunningGrace], PAGES);
    expect(moment).toEqual({
      kind: 'named-wod',
      wodName: 'Running GRACE',
      value: 540,
      previousBest: undefined,
      isFirstEver: true,
      extraCount: 0,
      pageIndex: 1,
    });
  });

  it('carries the old time so a faster run can count down to the new one', () => {
    const moment = buildRecordCelebration([fasterRunningGrace], PAGES);
    expect(moment).toMatchObject({ kind: 'named-wod', value: 540, previousBest: 600, isFirstEver: false });
  });

  it('points at the part that ran it, so tapping opens that slide', () => {
    expect(buildRecordCelebration([firstRunningGrace], PAGES)?.pageIndex).toBe(1);
  });

  it('lets a lift PR lead, and counts the named record among the rest', () => {
    const moment = buildRecordCelebration([backSquatPR, firstRunningGrace], PAGES);
    expect(moment).toMatchObject({ kind: 'lift', movement: 'Back Squat', extraCount: 1 });
  });

  it('stays silent when a named workout was logged but beat nothing', () => {
    const slower: Achievement = { ...fasterRunningGrace, title: '2nd Fastest!' };
    expect(buildRecordCelebration([slower], PAGES)).toBeNull();
  });

  it('stays silent when the session set no records at all', () => {
    const generic: Achievement = { type: 'generic', title: 'Well Done!', subtitle: '', icon: 'star' };
    expect(buildRecordCelebration([generic], PAGES)).toBeNull();
  });
});
