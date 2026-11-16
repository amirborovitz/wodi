import { describe, expect, it } from 'vitest';
import { bodyAreaLevel, bodyAreaSessions, isBodyUntouched } from './bodyAreas';

const session = (...names: string[]) => ({ workloadBreakdown: { movements: names.map((name) => ({ name })) } });

describe('bodyAreaSessions — which parts of the body the week worked', () => {
  it('a thruster works legs and shoulders', () => {
    const s = bodyAreaSessions([session('Thruster')]);
    expect(s.quads).toBe(1);
    expect(s.shoulders).toBe(1);
    expect(s.hamstrings).toBe(0);
  });

  it('counts sessions, not movements: two leg movements in one workout is one leg session', () => {
    expect(bodyAreaSessions([session('Back Squat', 'Walking Lunge')]).quads).toBe(1);
  });

  it('three workouts that hit legs light legs three times', () => {
    const s = bodyAreaSessions([session('Back Squat'), session('Run'), session('Box Jump')]);
    expect(s.quads).toBe(3);
    expect(bodyAreaLevel(s.quads)).toBe(3);
  });

  it('a movement the registry cannot place lights nothing', () => {
    expect(isBodyUntouched(bodyAreaSessions([session('Zorbleflip')]))).toBe(true);
  });
});

describe('bodyAreaTally — the list beside the figure', () => {
  it('lists only trained parts, most sessions first, capped at the rows that fit', async () => {
    const { bodyAreaTally } = await import('./bodyAreas');
    const s = bodyAreaSessions([session('Back Squat'), session('Back Squat', 'Pull-up'), session('Run')]);
    const rows = bodyAreaTally(s, 3);
    expect(rows.map((r) => [r.label, r.level])).toEqual([['Quads', 3], ['Glutes', 2], ['Arms', 1]]);
    expect(rows.some((r) => r.label === 'Chest')).toBe(false);
  });
});
