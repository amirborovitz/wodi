import { describe, it, expect } from 'vitest';
import { buildLedger } from './wrappedCards';
import { buildRecaps, moveStatMeasure } from '../../../hooks/useRecapData';
import type { WorkoutWithStats } from '../../../hooks/useWorkouts';
import type { MovementTotal } from '../../../types';

// Work measured in TIME reaching the recap at all.
//
// The movement rows used to skip any breakdown entry with no reps, so a core tabata's four
// minutes — and every plank hold before it — fell out silently. Nothing was wrong on screen;
// the row simply was not there, which is the hardest kind of missing to notice.
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

describe('core work measured in minutes', () => {
  it('sums a month of core doses into one row', () => {
    const recap = july([
      workout('a', [{ name: 'Kettlebell Swing', totalReps: 500 }, { name: 'Core', totalTime: 230 }]),
      workout('b', [{ name: 'Kettlebell Swing', totalReps: 400 }, { name: 'Core', totalTime: 230 }]),
      workout('c', [{ name: 'Kettlebell Swing', totalReps: 300 }, { name: 'Core', totalTime: 230 }]),
    ]);

    const core = recap.moves.find(m => m.name === 'Core');
    expect(core).toBeDefined();
    expect(core!.seconds).toBe(690);
    expect(core!.reps).toBe(0);
    expect(core!.workoutCount).toBe(3);
    // 690s is eleven and a half minutes; the row says twelve, in the one unit a reader wants.
    expect(moveStatMeasure(core!)).toBe('12 min');
  });

  it('files named core drills onto the same row as a bare dose', () => {
    // Flutter kicks, hollow rocks and an unnamed core tabata are all the Core family — the
    // registry has always said so; only the rep gate kept the dose out.
    const recap = july([
      workout('a', [{ name: 'Hollow Rock', totalReps: 60 }, { name: 'Core', totalTime: 230 }]),
    ]);

    const core = recap.moves.find(m => m.name === 'Core');
    expect(core!.reps).toBe(60);
    expect(core!.seconds).toBe(230);
    // Reps win when a row has both: it was mostly counted, and the minutes are the detail.
    expect(moveStatMeasure(core!)).toBe('60 reps');
  });

  it('does not let minutes out-rank reps in the ledger', () => {
    // A minute and a rep have no exchange rate. Ranking stays on reps, so four minutes of core
    // can never headline over 500 kettlebell swings.
    const recap = july([
      workout('a', [
        { name: 'Kettlebell Swing', totalReps: 500 },
        { name: 'Pull-up', totalReps: 200 },
        { name: 'Core', totalTime: 230 },
      ]),
    ]);

    const rows = buildLedger(recap).shown;
    const core = rows.find(r => r.name.toLowerCase() === 'core');
    expect(core).toBeDefined();
    expect(core!.unit).toBe('min');
    expect(core!.value).toBe(4);
    expect(rows.indexOf(core!)).toBe(rows.length - 1);
  });
});
