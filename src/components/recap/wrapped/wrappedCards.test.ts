import { describe, it, expect } from 'vitest';
import { buildLedger, ledgerVoice } from './wrappedCards';
import { buildRecaps } from '../../../hooks/useRecapData';
import type { WorkoutWithStats } from '../../../hooks/useWorkouts';
import type { MovementTotal } from '../../../types';

const NOW = new Date(2026, 7, 12);
const JULY_ID = 'month-2026-07';
const IN_JULY = new Date(2026, 6, 15);

function workout(id: string, movements: MovementTotal[]): WorkoutWithStats {
  return {
    id,
    userId: 'u1',
    date: IN_JULY,
    title: 'WOD',
    type: 'metcon',
    exercises: [],
    totalReps: 0,
    totalVolume: 0,
    workloadBreakdown: { movements, grandTotalReps: 0, grandTotalVolume: 0 },
  } as unknown as WorkoutWithStats;
}

function july(ws: WorkoutWithStats[]) {
  const recap = buildRecaps(ws, NOW).recaps.find(r => r.id === JULY_ID);
  if (!recap) throw new Error('expected a July recap');
  return recap;
}

describe('buildLedger', () => {
  it('never lists the move the top-move card already gave a whole screen to', () => {
    const recap = july([
      workout('a', [
        { name: 'Kettlebell Swing', totalReps: 500 },
        { name: 'Pull-up', totalReps: 200 },
        { name: 'Barbell Clean', totalReps: 150 },
      ]),
    ]);

    const ledger = buildLedger(recap);
    expect(recap.topMove?.name).toBeDefined();
    expect(ledger.shown.map(r => r.name)).not.toContain(recap.topMove?.name);
  });

  it('ranks by reps across families and conditioning alike', () => {
    const recap = july([
      workout('a', [
        { name: 'Barbell Clean', totalReps: 300 },
        { name: 'Pull-up', totalReps: 120 },
        { name: 'Double Under', totalReps: 800 },
        { name: 'Sit-up', totalReps: 200 },
      ]),
    ]);

    const ledger = buildLedger(recap);
    const reps = ledger.shown.map(r => r.reps);
    expect(reps).toEqual([...reps].sort((a, b) => b - a));
  });

  it('shortens implement boilerplate the way a poster would', () => {
    const recap = july([
      workout('a', [
        { name: 'Kettlebell Swing', totalReps: 500 },
        { name: 'Barbell Clean', totalReps: 300 },
      ]),
    ]);

    const ledger = buildLedger(recap);
    // Whichever of the two headlines, the other keeps its poster label.
    const names = [recap.topMove?.name, ...ledger.shown.map(r => r.name)];
    expect(names).not.toContain('Barbell Clean');
    expect(ledger.shown.map(r => r.name)).not.toContain('Kettlebell Swing');
  });

  it('collapses the tail past eight rows rather than dropping those reps', () => {
    const recap = july([
      workout('a', [
        { name: 'Barbell Clean', totalReps: 900 },
        { name: 'Barbell Snatch', totalReps: 800 },
        { name: 'Back Squat', totalReps: 700 },
        { name: 'Deadlift', totalReps: 600 },
        { name: 'Push Press', totalReps: 500 },
        { name: 'Pull-up', totalReps: 400 },
        { name: 'Burpee', totalReps: 300 },
        { name: 'Double Under', totalReps: 200 },
        { name: 'Sit-up', totalReps: 100 },
        { name: 'Wall Ball', totalReps: 50 },
      ]),
    ]);

    const ledger = buildLedger(recap);
    expect(ledger.shown.length).toBeLessThanOrEqual(8);
    if (ledger.restCount > 0) {
      expect(ledger.restReps).toBeGreaterThan(0);
    }
  });
});

describe('ledger rows always say something about themselves', () => {
  it('falls back to how often a one-flavour movement came up', () => {
    const recap = july([
      workout('a', [
        { name: 'Kettlebell Swing', totalReps: 500 },
        { name: 'Double Under', totalReps: 300 },
      ]),
      workout('b', [
        { name: 'Kettlebell Swing', totalReps: 200 },
        { name: 'Double Under', totalReps: 100 },
      ]),
    ]);

    const ledger = buildLedger(recap);
    expect(ledger.shown.length).toBeGreaterThan(0);
    // A missing detail line is what made the rhythm read as broken data.
    for (const row of ledger.shown) {
      expect(row.detail).not.toBe('');
    }
    expect(ledger.shown.some(r => r.detail === 'in 2 workouts')).toBe(true);
  });
});

describe('ledgerVoice', () => {
  it('reads the movement that led the list', () => {
    const recap = july([
      workout('a', [
        { name: 'Barbell Clean', totalReps: 900 },
        { name: 'Double Under', totalReps: 850 },
        { name: 'Pull-up', totalReps: 120 },
      ]),
    ]);

    const ledger = buildLedger(recap);
    expect(ledger.shown[0].name).toBe('Double Under');
    expect(ledgerVoice(ledger.shown)).toBe('you basically skipped rope for a living');
  });

  it('falls back to the category rather than inventing a line', () => {
    const recap = july([
      workout('a', [
        { name: 'Barbell Clean', totalReps: 950 },
        { name: 'Thruster', totalReps: 900 },
        { name: 'Double Under', totalReps: 400 },
      ]),
    ]);

    const ledger = buildLedger(recap);
    expect(ledger.shown[0].name).toBe('Shoulder to Overhead');
    expect(ledgerVoice(ledger.shown)).toBe('you kept picking it back up');
  });

  it('says nothing at all when there is no list', () => {
    expect(ledgerVoice([])).toBeNull();
  });
});
