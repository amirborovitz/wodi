import { describe, it, expect } from 'vitest';
import { buildPosterWod, buildPosterWodFromPage } from './posterData';
import type { CelebrationData } from '../../../../hooks/useCelebrationData';
import type { Exercise } from '../../../../types';

// Part C of the real session of 2026-09-16: a metcon the coach named "Running GRACE".
const RUNNING_GRACE: Exercise = {
  id: 'exercise-2',
  name: '3 Rounds For Time',
  type: 'wod',
  loggingMode: 'for_time',
  rounds: 3,
  prescription: '"Running GRACE" - 3 RFT: 300m Run, 10 Clean and Jerk @40/60kg. Two heats - 01:00 min delay. 12 minutes time cap.',
  rawText: 'C. METCON (Short)\n"Running GRACE" - 3 RFT:\n300m run\n10 Clean and Jerk @40/60kg\n\n* Two heats - 01:00 min Delay\n◃ 12 minutes T.C. ▹',
  sets: [{ id: 'set-summary', setNumber: 1, completed: true, actualReps: 30, weight: 37.5, time: 540 }],
  movements: [
    { name: 'Run', distance: 300, inputType: 'none' },
    { name: 'Clean and Jerk', reps: 10, inputType: 'weight' },
  ],
} as unknown as Exercise;

const data = (exercise: Exercise): CelebrationData => ({
  exercises: [exercise],
  workoutFormat: 'for_time',
  artifactSections: [],
  heroResult: null,
  durationMinutes: 9,
  rewardDisplayTitle: 'WOD',
  workoutDate: new Date('2026-09-16T06:00:00Z'),
  totalReps: 0,
  totalDistance: 0,
  totalCalories: 0,
  isCarousel: true,
  carouselPageData: [{ exercise, movements: [], isStrength: false }],
  perPageSections: [[]],
  perPageHeroResults: [null],
} as unknown as CelebrationData);

describe('named metcon — the poster headline', () => {
  it('an unnamed part keeps today\'s card: no headline, the format line, the cap', () => {
    const w = buildPosterWodFromPage(data(RUNNING_GRACE), 0);
    expect({ type: w.type, title: w.title, format: w.format, sub: w.sub, rx: w.rx })
      .toEqual({ type: 'FOR TIME', title: null, format: 'FOR TIME', sub: '12 MIN CAP', rx: null });
  });

  it('headlines the coach\'s name and drops the structure underneath', () => {
    const named = { ...RUNNING_GRACE, wodName: 'Running GRACE' } as unknown as Exercise;
    const w = buildPosterWodFromPage(data(named), 0);
    expect({ title: w.title, format: w.format, sub: w.sub })
      .toEqual({ title: 'RUNNING GRACE', format: '3 ROUNDS FOR TIME', sub: '12 MIN CAP' });
  });

  it('says the name once when the block is named after the workout', () => {
    // "7 Rounds of Cindy" under a CINDY headline printed the name twice, one line apart.
    const cindy = {
      ...RUNNING_GRACE, name: '7 Rounds of Cindy', wodName: 'Cindy', rounds: 7,
    } as unknown as Exercise;
    const w = buildPosterWodFromPage(data(cindy), 0);
    expect(w.title).toBe('CINDY');
    expect(w.format).toBe('7 ROUNDS');
  });

  it('falls back to the plain format when the block name is only the name', () => {
    const named = { ...RUNNING_GRACE, name: 'Running GRACE', wodName: 'Running GRACE' } as unknown as Exercise;
    const w = buildPosterWodFromPage(data(named), 0);
    expect(w.title).toBe('RUNNING GRACE');
    expect(w.format).not.toContain('RUNNING GRACE');
  });

  it('badges the page whose named workout set a record', () => {
    const named = { ...RUNNING_GRACE, wodName: 'Running GRACE' } as unknown as Exercise;
    const withRecord = {
      ...data(named),
      activeAchievements: [{
        type: 'benchmark', title: 'First Attempt!', subtitle: 'Running GRACE · 9:00',
        wodName: 'Running GRACE', value: 540, icon: 'star',
      }],
    } as unknown as CelebrationData;
    expect(buildPosterWodFromPage(withRecord, 0).rx).toBe('FIRST');
  });

  it('never badges a sibling part with another part\'s named record', () => {
    const named = { ...RUNNING_GRACE, wodName: 'Fran' } as unknown as Exercise;
    const otherRecord = {
      ...data(named),
      activeAchievements: [{
        type: 'benchmark', title: 'Fastest Time!', subtitle: 'Running GRACE · 9:00',
        wodName: 'Running GRACE', value: 540, icon: 'medal',
      }],
    } as unknown as CelebrationData;
    expect(buildPosterWodFromPage(otherRecord, 0).rx).toBeNull();
  });

  it('headlines the name on a single-part session too, over the session title', () => {
    const named = { ...RUNNING_GRACE, wodName: 'Running GRACE' } as unknown as Exercise;
    const solo = { ...data(named), isCarousel: false, carouselPageData: null } as unknown as CelebrationData;
    expect(buildPosterWod(solo).title).toBe('RUNNING GRACE');
  });
});
