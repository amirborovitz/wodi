import { describe, it, expect } from 'vitest';
import { buildRecaps } from './useRecapData';
import type { WorkoutWithStats } from './useWorkouts';
import type { MovementTotal } from '../types';

// A fixed "today" so period boundaries never depend on when the suite runs.
const NOW = new Date(2026, 7, 12);          // 12 Aug 2026
const JULY_ID = 'month-2026-07';
const IN_JULY = new Date(2026, 6, 15);

function workout(
  id: string,
  date: Date,
  movements: MovementTotal[],
  sourceDate?: string,
): WorkoutWithStats {
  return {
    id,
    userId: 'u1',
    date,
    ...(sourceDate ? { sourceDate } : {}),
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

describe('buildRecaps — movement families', () => {
  it('merges overhead press variants into one Shoulder to Overhead row', () => {
    const recap = july([
      workout('a', IN_JULY, [
        { name: 'Push Press', totalReps: 30 },
        { name: 'Push Jerk', totalReps: 20 },
        { name: 'Strict Press', totalReps: 10 },
      ]),
    ]);

    expect(recap.moves.map(m => [m.name, m.reps]))
      .toEqual([['Barbell Shoulder to Overhead', 60]]);
  });

  it('splits a family into variant sub-lines without splitting the row', () => {
    const recap = july([
      workout('a', IN_JULY, [
        { name: 'Russian Kettlebell Swing', totalReps: 200 },
        { name: 'American Kettlebell Swing', totalReps: 150 },
      ]),
    ]);

    expect(recap.moves[0].name).toBe('Kettlebell Swing');
    expect(recap.moves[0].reps).toBe(350);
    expect(recap.moves[0].variants).toEqual([
      { name: 'Russian', reps: 200, workoutCount: 1 },
      { name: 'American', reps: 150, workoutCount: 1 },
    ]);
  });

  it('merges alias spellings of one variant into a single sub-line', () => {
    const recap = july([
      workout('a', IN_JULY, [
        { name: 'Russian KB Swing', totalReps: 60 },
        { name: 'Russian Kettlebell Swing', totalReps: 40 },
        { name: 'American KB Swing', totalReps: 30 },
        { name: 'American KBS', totalReps: 20 },
      ]),
    ]);

    expect(recap.moves[0].name).toBe('Kettlebell Swing');
    expect(recap.moves[0].reps).toBe(150);
    expect(recap.moves[0].variants).toEqual([
      { name: 'Russian', reps: 100, workoutCount: 1 },
      { name: 'American', reps: 50, workoutCount: 1 },
    ]);
  });

  it('keeps every clean variant visible under one family total', () => {
    const recap = july([
      workout('a', IN_JULY, [
        { name: 'Power Clean', totalReps: 100 },
        { name: 'Hang Power Clean', totalReps: 50 },
        { name: 'Squat Clean', totalReps: 20 },
      ]),
    ]);

    expect(recap.moves[0].name).toBe('Barbell Clean');
    expect(recap.moves[0].reps).toBe(170);
    expect(recap.moves[0].variants.map(v => [v.name, v.reps]))
      .toEqual([['Power', 100], ['Hang Power', 50], ['Squat', 20]]);
  });

  it('keeps strict and kipping pull-ups apart, despite both words being modifiers', () => {
    const recap = july([
      workout('a', IN_JULY, [
        { name: 'Strict Pull-up', totalReps: 40 },
        { name: 'Kipping Pull-ups', totalReps: 60 },
        { name: 'Chest to Bar Pull-up', totalReps: 30 },
      ]),
    ]);

    expect(recap.moves[0].name).toBe('Pull-up');
    expect(recap.moves[0].reps).toBe(130);
    expect(recap.moves[0].variants.map(v => [v.name, v.reps]))
      .toEqual([['Kipping', 60], ['Strict', 40], ['Chest to Bar', 30]]);
  });

  it('counts a family once per workout, however many legs it had', () => {
    const recap = july([
      workout('a', IN_JULY, [
        { name: 'Back Squat', totalReps: 30 },
        { name: 'Front Squat', totalReps: 20 },
      ]),
      workout('b', IN_JULY, [{ name: 'Air Squat', totalReps: 50 }]),
    ]);

    expect(recap.moves[0].name).toBe('Squat');
    expect(recap.moves[0].workoutCount).toBe(2);
    // The variant that appeared in only one of them says so.
    expect(recap.moves[0].variants.find(v => v.name === 'Air')?.workoutCount).toBe(1);
  });

  it('merges implements inside a pattern-first family but keeps them as variants', () => {
    const recap = july([
      workout('a', IN_JULY, [
        { name: 'Goblet Squat', totalReps: 60 },
        { name: 'Air Squat', totalReps: 50 },
        { name: 'Back Squat', totalReps: 20 },
      ]),
    ]);

    expect(recap.moves).toHaveLength(1);
    expect(recap.moves[0].name).toBe('Squat');
    expect(recap.moves[0].reps).toBe(130);
    expect(recap.moves[0].variants.map(v => v.name)).toEqual(['Goblet', 'Air', 'Back']);
  });

  it('collapses plurals and section prefixes onto one row', () => {
    const recap = july([
      workout('a', IN_JULY, [
        { name: 'Russian Twist', totalReps: 60 },
        { name: 'Russian Twists', totalReps: 40 },
      ]),
      workout('b', IN_JULY, [
        { name: 'Dumbbell Hip Thrust', totalReps: 30 },
        { name: 'Buy-in: Dumbbell Hip Thrust', totalReps: 20 },
      ]),
    ]);

    const byName = new Map(recap.moves.map(m => [m.name, m.reps]));
    expect(byName.get('Core')).toBe(100);
    expect(byName.get('Dumbbell Hip Thrust')).toBe(50);
  });

  it('gives an unrecognised movement its own row, no family, and a flag', () => {
    const { recaps, unknownMovements } = buildRecaps([
      workout('a', IN_JULY, [
        { name: 'Tibialis Raise', totalReps: 40 },
        { name: 'Back Squat', totalReps: 20 },
      ]),
    ], NOW);
    const recap = recaps.find(r => r.id === JULY_ID)!;

    const unknown = recap.moves.find(m => m.name === 'Tibialis Raise');
    expect(unknown?.reps).toBe(40);
    expect(unknown?.familyId).toBeNull();
    expect(recap.moves.find(m => m.name === 'Squat')?.familyId).toBe('squat');

    expect(unknownMovements.map(u => u.rawName)).toEqual(['Tibialis Raise']);
  });

  it('does not double-report a flag when a workout lands in both a month and a season', () => {
    // Seasons re-walk the same workouts; the flag queue counts occurrences, so
    // collecting from both would inflate the number triage ranks by.
    const { unknownMovements } = buildRecaps([
      workout('a', new Date(2026, 3, 10), [{ name: 'Tibialis Raise', totalReps: 40 }]),
    ], NOW);
    expect(unknownMovements).toHaveLength(1);
  });
});

describe('buildRecaps — conditioning never outranks the barbell', () => {
  it('keeps a huge double-under count off the family board without hiding it', () => {
    const recap = july([
      workout('a', IN_JULY, [
        { name: 'Double Unders', totalReps: 1000 },
        { name: 'Power Clean', totalReps: 50 },
      ]),
    ]);

    // The founding bug: 1,000 skips outranking 50 cleans on raw reps.
    expect(recap.topMove?.name).toBe('Barbell Clean');
    expect(recap.families.map(f => f.name)).toEqual(['Barbell Clean']);
    // Not deleted — moved to the section where its scale means something.
    expect(recap.conditioning.map(c => [c.name, c.reps])).toEqual([['Double Under', 1000]]);
    // And still on the full ledger, at the top of it, where reps are just reps.
    expect(recap.moves[0].name).toBe('Double Under');
  });

  it('files burpees as conditioning too', () => {
    const recap = july([
      workout('a', IN_JULY, [
        { name: 'Burpees', totalReps: 380 },
        { name: 'Back Squat', totalReps: 40 },
      ]),
    ]);

    expect(recap.topMove?.name).toBe('Squat');
    expect(recap.conditioning.map(c => c.name)).toEqual(['Burpee']);
  });

  it('lets conditioning headline when it is the only thing there was', () => {
    // A month of nothing but skipping is still that month. An empty headline
    // would be a worse lie than naming the double-unders.
    const recap = july([
      workout('a', IN_JULY, [{ name: 'Double Unders', totalReps: 800 }]),
    ]);

    expect(recap.topMove?.name).toBe('Double Under');
    expect(recap.families.map(f => f.name)).toEqual(['Double Under']);
  });

  it('never features an unrecognised movement, however many reps it carried', () => {
    const recap = july([
      workout('a', IN_JULY, [
        { name: 'Tibialis Raise', totalReps: 400 },
        { name: 'Back Squat', totalReps: 20 },
      ]),
    ]);

    expect(recap.topMove?.name).toBe('Squat');
    expect(recap.families.map(f => f.name)).toEqual(['Squat']);
  });

  it('has no top move when nothing in the period resolved to a known family', () => {
    const recap = july([
      workout('a', IN_JULY, [{ name: 'Tibialis Raise', totalReps: 40 }]),
    ]);

    expect(recap.topMove).toBeNull();
    expect(recap.families).toEqual([]);
  });
});

describe('buildRecaps — compound movements count under both components', () => {
  it('files a thruster as a squat AND a shoulder to overhead, not a third family', () => {
    const recap = july([
      workout('a', IN_JULY, [
        { name: 'Air Squat', totalReps: 60 },
        { name: 'Push Press', totalReps: 30 },
        { name: 'Thrusters', totalReps: 45 },
      ]),
    ]);

    const byName = new Map(recap.moves.map(m => [m.name, m]));
    // A thruster is a front squat welded to a push press. Both rows are honest
    // answers to "how much of this pattern did I do", so both go up.
    expect(byName.get('Squat')?.reps).toBe(105);
    expect(byName.get('Barbell Shoulder to Overhead')?.reps).toBe(75);
    // ...and it never becomes a third row competing with the two it feeds.
    expect(recap.moves.map(m => m.name)).not.toContain('Barbell Thruster');
  });

  it('names the compound on each component row, so the total is legible', () => {
    const recap = july([
      workout('a', IN_JULY, [
        { name: 'Front Squat', totalReps: 60 },
        { name: 'Push Press', totalReps: 30 },
        { name: 'Thruster', totalReps: 45 },
      ]),
    ]);

    const byName = new Map(recap.moves.map(m => [m.name, m]));
    // "Squat 105 · Thruster 45" — the sub-line says WHY the row is what it is.
    expect(byName.get('Squat')?.variants.map(v => [v.name, v.reps]))
      .toEqual([['Front', 60], ['Thruster', 45]]);
    expect(byName.get('Barbell Shoulder to Overhead')?.variants.map(v => [v.name, v.reps]))
      .toEqual([['Thruster', 45], ['Push Press', 30]]);
  });

  it('counts the workout once for each component family', () => {
    const recap = july([
      workout('a', IN_JULY, [{ name: 'Thruster', totalReps: 30 }]),
      workout('b', IN_JULY, [{ name: 'Air Squat', totalReps: 20 }]),
    ]);

    const byName = new Map(recap.moves.map(m => [m.name, m]));
    expect(byName.get('Squat')?.workoutCount).toBe(2);
    expect(byName.get('Barbell Shoulder to Overhead')?.workoutCount).toBe(1);
  });

  it('carries the implement onto both component rows', () => {
    const recap = july([
      workout('a', IN_JULY, [{ name: 'Dumbbell Thrusters', totalReps: 40 }]),
    ]);

    // Squat is pattern-first so it stays "Squat"; shoulder to overhead is
    // implement-split, so a DB thruster must not land on the barbell row.
    expect(recap.moves.map(m => m.name).sort())
      .toEqual(['Dumbbell Shoulder to Overhead', 'Squat']);
  });
});

describe('buildRecaps — core never outranks the barbell', () => {
  it('ranks a bigger Core total behind the barbell it beat on reps', () => {
    const recap = july([
      workout('a', IN_JULY, [
        { name: 'Russian Twist', totalReps: 605 },
        { name: 'Power Clean', totalReps: 603 },
        { name: 'Push Press', totalReps: 560 },
      ]),
    ]);

    // The live bug: 605 sit-ups outranking 603 cleans on raw reps, and taking the
    // headline with it. Category comes first; reps only order within a category.
    expect(recap.topMove?.name).toBe('Barbell Clean');
    expect(recap.families.map(f => f.name)).toEqual([
      'Barbell Clean', 'Barbell Shoulder to Overhead', 'Core',
    ]);
    // Not hidden — it was real work, it just lands last.
    expect(recap.families.at(-1)?.reps).toBe(605);
  });

  it('files sit-ups as core rather than gymnastics, so pull-ups outrank them', () => {
    const recap = july([
      workout('a', IN_JULY, [
        { name: 'Sit-ups', totalReps: 400 },
        { name: 'Pull-ups', totalReps: 60 },
      ]),
    ]);

    expect(recap.topMove?.name).toBe('Pull-up');
    expect(recap.families.map(f => f.name)).toEqual(['Pull-up', 'Sit-up']);
  });

  it('lets core headline when it was the only thing there was', () => {
    const recap = july([
      workout('a', IN_JULY, [{ name: 'Russian Twist', totalReps: 200 }]),
    ]);

    expect(recap.topMove?.name).toBe('Core');
  });

  it('ranks core behind conditioning too, not just the barbell', () => {
    const recap = july([
      workout('a', IN_JULY, [
        { name: 'Russian Twist', totalReps: 500 },
        { name: 'Burpees', totalReps: 120 },
      ]),
    ]);

    expect(recap.topMove?.name).toBe('Burpee');
  });
});

describe('buildRecaps — the conditioning note', () => {
  it('states the per-session rate of the biggest conditioning movement', () => {
    const recap = july([
      workout('a', IN_JULY, [{ name: 'Double Unders', totalReps: 500 }]),
      workout('b', IN_JULY, [{ name: 'Double Unders', totalReps: 350 }]),
    ]);

    expect(recap.conditioningNote).toBe('≈ 425 double unders a session');
  });

  it('says nothing from a single session — a rate over one session is the total', () => {
    const recap = july([
      workout('a', IN_JULY, [{ name: 'Double Unders', totalReps: 800 }]),
    ]);

    expect(recap.conditioningNote).toBeNull();
  });

  it('says nothing when there was no conditioning at all', () => {
    const recap = july([workout('a', IN_JULY, [{ name: 'Back Squat', totalReps: 25 }])]);
    expect(recap.conditioningNote).toBeNull();
  });
});

describe('buildRecaps — the engine card', () => {
  it('leads with kilometres and keeps every other aerobic figure in its own unit', () => {
    const recap = july([
      workout('a', IN_JULY, [{ name: 'Echo Bike', totalDistance: 91000 }]),
      workout('b', IN_JULY, [{ name: 'Echo Bike', totalCalories: 707 }]),
      workout('c', IN_JULY, [{ name: 'Run', totalDistance: 5100 }]),
    ]);

    const engine = recap.aerobic;
    expect(engine?.value).toBe('91');
    expect(engine?.unit).toBe('KM');
    expect(engine?.machine).toBe('Echo Bike');
    // Nothing summed across machines, nothing converted between units.
    expect(engine?.rest).toBe('+ Run 5.1 km · Echo Bike 707 cal');
  });

  it('leads with calories when the period measured no real distance', () => {
    const recap = july([
      workout('a', IN_JULY, [{ name: 'Echo Bike', totalCalories: 420 }]),
      workout('b', IN_JULY, [{ name: 'Ski', totalDistance: 600 }]),
    ]);

    // "600 m" is not the flex the card exists for; a calorie figure with a machine
    // attached is. The 600 m is still named, just not as the headline.
    expect(recap.aerobic?.value).toBe('420');
    expect(recap.aerobic?.unit).toBe('CAL');
    expect(recap.aerobic?.rest).toBe('+ Ski 600 m');
  });

  it('has no rest line when the hero was the only aerobic figure', () => {
    const recap = july([
      workout('a', IN_JULY, [{ name: 'Row', totalDistance: 12000 }]),
    ]);

    expect(recap.aerobic?.value).toBe('12');
    expect(recap.aerobic?.rest).toBeNull();
  });

  it('has no engine card at all for a period with no aerobic work', () => {
    const recap = july([workout('a', IN_JULY, [{ name: 'Back Squat', totalReps: 25 }])]);
    expect(recap.aerobic).toBeNull();
  });
});

describe('buildRecaps — the PR reads as a jump', () => {
  function prWorkout(id: string, movement: string, value: number, previousBest?: number): WorkoutWithStats {
    return {
      ...workout(id, IN_JULY, [{ name: movement, totalReps: 5 }]),
      isPR: true,
      achievements: [{
        type: 'pr', title: 'New PR!', subtitle: '', movement, value,
        ...(previousBest === undefined ? {} : { previousBest }),
        icon: 'trophy',
      }],
    } as unknown as WorkoutWithStats;
  }

  it('carries the previous best and the PR count', () => {
    const recap = july([
      prWorkout('a', 'Clean & Jerk', 45, 42),
      prWorkout('b', 'Clean & Jerk', 48, 45),
      prWorkout('c', 'Clean & Jerk', 50, 48),
    ]);

    expect(recap.heaviest).toEqual({ move: 'Clean & Jerk', value: '50kg' });
    expect(recap.prDelta).toBe('up from 48kg · your 3rd PR this month');
  });

  it('still says something when no previous best was recorded', () => {
    const recap = july([prWorkout('a', 'Deadlift', 150)]);
    expect(recap.prDelta).toBe('your 1st PR this month');
  });

  it('drops a previous best that is not below the PR', () => {
    // A "previous best" at or above the lift is stale data, and "up from 55kg"
    // under a 50kg PR is worse than saying nothing.
    const recap = july([prWorkout('a', 'Snatch', 50, 55)]);
    expect(recap.prDelta).toBe('your 1st PR this month');
  });

  it('has no delta for a period with no PR', () => {
    const recap = july([workout('a', IN_JULY, [{ name: 'Back Squat', totalReps: 25 }])]);
    expect(recap.heaviest).toBeNull();
    expect(recap.prDelta).toBeNull();
  });
});

describe('buildRecaps — this-month highlights', () => {
  it('measures frequency as a different question from volume', () => {
    const recap = july([
      // Cleans win on reps; wall balls win on how often they came up.
      workout('a', IN_JULY, [{ name: 'Power Clean', totalReps: 300 }, { name: 'Wall Ball', totalReps: 20 }]),
      workout('b', IN_JULY, [{ name: 'Wall Ball', totalReps: 20 }]),
      workout('c', IN_JULY, [{ name: 'Wall Ball', totalReps: 20 }]),
    ]);

    const byKind = new Map(recap.highlights.map(h => [h.kind, h]));
    expect(byKind.get('most_frequent')?.subject).toBe('Wall Ball');
    expect(byKind.get('most_frequent')?.detail).toBe('3 workouts');
  });

  it('never names the top move — that fact already has its own card', () => {
    const recap = july([
      workout('a', IN_JULY, [{ name: 'Power Clean', totalReps: 300 }, { name: 'Russian Kettlebell Swing', totalReps: 90 }]),
      workout('b', IN_JULY, [{ name: 'Power Clean', totalReps: 300 }, { name: 'Russian Kettlebell Swing', totalReps: 90 }]),
    ]);

    expect(recap.topMove?.name).toBe('Barbell Clean');
    // Cleans win reps, frequency AND the barbell axis — and saying so here is
    // just the top move card again in 11px. The kettlebell fact still lands.
    expect(recap.highlights.map(h => h.subject)).not.toContain('Barbell Clean');
    expect(recap.highlights.some(h => h.subject === 'Kettlebell Swing')).toBe(true);
  });

  it('reads the implement off the registry rather than a second taxonomy', () => {
    const recap = july([
      // Wall balls headline, so the barbell and kettlebell facts are the only
      // ones naming their movements — no dedupe collision to muddy the check.
      workout('a', IN_JULY, [
        { name: 'Wall Ball', totalReps: 300 },
        { name: 'Deadlift', totalReps: 200 },
        { name: 'Russian Kettlebell Swing', totalReps: 120 },
      ]),
    ]);

    const byKind = new Map(recap.highlights.map(h => [h.kind, h]));
    expect(recap.topMove?.name).toBe('Wall Ball');
    expect(byKind.get('most_barbell')?.subject).toBe('Barbell Deadlift');
    expect(byKind.get('most_kettlebell')?.subject).toBe('Kettlebell Swing');
  });

  it('counts variety, and never repeats one family across two facts', () => {
    const recap = july([
      workout('a', IN_JULY, [
        { name: 'Back Squat', totalReps: 60 },
        { name: 'Front Squat', totalReps: 50 },
        { name: 'Air Squat', totalReps: 40 },
        { name: 'Push Press', totalReps: 30 },
      ]),
    ]);

    // Squat is the headline, so it's off this card entirely; the shoulder work
    // it beat is what's left to say. One family, one fact, at most.
    const subjects = recap.highlights.map(h => h.subject);
    expect(recap.topMove?.name).toBe('Squat');
    expect(subjects).not.toContain('Squat');
    expect(new Set(subjects).size).toBe(subjects.length);
  });

  it('names a staple lift that never came up at all', () => {
    const recap = july([
      workout('a', IN_JULY, [{ name: 'Back Squat', totalReps: 60 }]),
    ]);

    // An absence is a fact about a month that no board built from what you DID
    // can surface. Only one is named, so the card doesn't become a list of gaps.
    const untouched = recap.highlights.filter(h => h.kind === 'never_touched');
    expect(untouched.map(h => h.subject)).toEqual(['Shoulder to Overhead']);
  });

  it('reports no absence when every staple was trained', () => {
    const recap = july([
      workout('a', IN_JULY, [
        { name: 'Push Press', totalReps: 40 },
        { name: 'Back Squat', totalReps: 30 },
        { name: 'Power Clean', totalReps: 20 },
        { name: 'Deadlift', totalReps: 10 },
      ]),
    ]);

    expect(recap.highlights.some(h => h.kind === 'never_touched')).toBe(false);
  });
});

describe('buildRecaps — cardio in its own units', () => {
  it('keeps calories and distance in separate columns, never summed', () => {
    const recap = july([
      workout('a', IN_JULY, [{ name: 'Echo Bike', totalCalories: 100 }]),
      workout('b', IN_JULY, [{ name: 'Assault Bike', totalCalories: 80 }]),
      workout('c', IN_JULY, [{ name: 'Bike', totalDistance: 5000 }]),
    ]);

    expect(recap.cardio).toHaveLength(1);
    const bike = recap.cardio[0];
    // Echo + Assault + an unnamed bike is a FAMILY, not a machine. Naming it after
    // either one would credit work to a bike that was never ridden.
    expect(bike.name).toBe('Bike');
    expect(bike.calories).toBe(180);
    expect(bike.calorieSessions).toBe(2);
    expect(bike.distance).toBe(5000);
    expect(bike.distanceSessions).toBe(1);
  });

  it('counts sessions per unit, because a month measured two ways was', () => {
    const recap = july([
      workout('a', IN_JULY, [{ name: 'Row', totalDistance: 1000 }]),
      workout('b', IN_JULY, [{ name: 'Row', totalDistance: 2000 }]),
      workout('c', IN_JULY, [{ name: 'Row', totalCalories: 40 }]),
    ]);

    expect(recap.cardio[0].distance).toBe(3000);
    expect(recap.cardio[0].distanceSessions).toBe(2);
    expect(recap.cardio[0].calories).toBe(40);
    expect(recap.cardio[0].calorieSessions).toBe(1);
  });

  it('counts one session per workout even when a WOD has several legs on one machine', () => {
    const recap = july([
      workout('a', IN_JULY, [
        { name: 'Echo Bike', totalCalories: 20 },
        { name: 'Echo Bike', totalCalories: 20 },
        { name: 'Echo Bike', totalCalories: 20 },
      ]),
    ]);

    expect(recap.cardio[0].calories).toBe(60);
    expect(recap.cardio[0].calorieSessions).toBe(1);
  });

  it('never routes a barbell row into the cardio Row machine', () => {
    const recap = july([
      workout('a', IN_JULY, [
        { name: 'Bent Over Row', totalReps: 40 },
        { name: 'Row', totalDistance: 1000 },
      ]),
    ]);

    expect(recap.cardio.map(c => c.name)).toEqual(['Row']);
    expect(recap.cardio[0].distance).toBe(1000);
    // The strength row keeps its reps in the rep ledger, under its own
    // implement-prefixed row — never folded into the erg.
    expect(recap.moves.map(m => m.name)).toContain('Barbell Row');
    expect(recap.moves.find(m => m.name === 'Barbell Row')?.reps).toBe(40);
  });

  it('ranks machines by how often you were on them, across mixed units', () => {
    const recap = july([
      workout('a', IN_JULY, [{ name: 'Row', totalDistance: 5000 }]),
      workout('b', IN_JULY, [{ name: 'Echo Bike', totalCalories: 30 }]),
      workout('c', IN_JULY, [{ name: 'Echo Bike', totalCalories: 30 }]),
      workout('d', IN_JULY, [{ name: 'Echo Bike', totalDistance: 4000 }]),
    ]);

    // 3 bike sessions beat 1 row session — never compared by raw magnitude,
    // which would have put 5000 m ahead of 60 cal.
    expect(recap.cardio.map(c => c.name)).toEqual(['Echo Bike', 'Row']);
  });

  it('names the machine when the period only ever rode one bike', () => {
    const recap = july([
      workout('a', IN_JULY, [{ name: 'Echo Bike', totalDistance: 16000 }]),
      workout('b', IN_JULY, [{ name: 'Echo Bike', totalCalories: 400 }]),
      // A bare "Bike" names no machine, so it can't contradict the Echo — it
      // rides along under the same row without blurring the label.
      workout('c', IN_JULY, [{ name: 'Bike', totalCalories: 300 }]),
    ]);

    expect(recap.cardio[0].name).toBe('Echo Bike');
    expect(recap.cardio[0].calories).toBe(700);
    expect(recap.cardio[0].distance).toBe(16000);
  });

  it('reports no cardio for a period that had none, so the card is skipped', () => {
    const recap = july([workout('a', IN_JULY, [{ name: 'Back Squat', totalReps: 25 }])]);
    expect(recap.cardio).toEqual([]);
  });
});

describe('buildRecaps — period is the trained date, not the logged date', () => {
  it('files a session trained on Jul 31 but logged Aug 1 into the July recap', () => {
    const recap = july([
      workout('a', new Date(2026, 7, 1, 9, 30), [{ name: 'Back Squat', totalReps: 25 }], '2026-07-31'),
    ]);

    expect(recap.workouts).toBe(1);
    expect(recap.moves[0].name).toBe('Squat');
    expect(recap.moves[0].reps).toBe(25);
  });

  it('pulls a workout OUT of the month it was logged in', () => {
    // Logged 1 Aug, trained 31 Jul — August must not claim it.
    const { recaps } = buildRecaps(
      [workout('a', new Date(2026, 7, 1), [{ name: 'Back Squat', totalReps: 25 }], '2026-07-31')],
      NOW,
    );
    expect(recaps.map(r => r.id)).toContain(JULY_ID);
    expect(recaps.map(r => r.id)).not.toContain('month-2026-08');
  });

  it('files a workout logged today but trained last month, which would otherwise vanish', () => {
    // The current period is excluded from every recap, so without the source date
    // this session would appear in no recap at all until September.
    const recap = july([
      workout('a', NOW, [{ name: 'Deadlift', totalReps: 12 }], '2026-07-20'),
    ]);
    expect(recap.workouts).toBe(1);
  });

  it('ignores an unparseable source date and falls back to the logged date', () => {
    const recap = july([
      workout('a', IN_JULY, [{ name: 'Back Squat', totalReps: 25 }], 'not-a-date'),
    ]);
    expect(recap.workouts).toBe(1);
  });

  it('respects the source date across a quarter boundary too', () => {
    // Trained 30 Jun (Q2), logged 2 Jul (Q3).
    const { recaps } = buildRecaps(
      [workout('a', new Date(2026, 6, 2), [{ name: 'Snatch', totalReps: 10 }], '2026-06-30')],
      NOW,
    );
    const q2 = recaps.find(r => r.id === 'season-2026-q2');
    expect(q2).toBeDefined();
    expect(q2!.workouts).toBe(1);
    expect(recaps.find(r => r.id === 'season-2026-q3')).toBeUndefined();
  });
});
