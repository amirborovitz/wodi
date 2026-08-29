import { describe, it, expect } from 'vitest';
import { diffParse } from './parseAudit';
import type { ParsedWorkout } from '../types';

/**
 * The audit's only job is telling a BACKFILL apart from an OVERRIDE, because that distinction is
 * the whole rule: filling a field the AI left empty is sanctioned, replacing one it filled is a
 * defect. Everything else here — paths, array handling — exists to make the resulting list
 * readable enough to triage.
 */

const workout = (over: Partial<ParsedWorkout> = {}): ParsedWorkout => ({
  title: 'Test',
  type: 'for_time',
  format: 'for_time',
  scoreType: 'time',
  exercises: [],
  ...over,
});

describe('parseAudit — backfill vs override', () => {
  it('calls filling an empty field a backfill', () => {
    const entries = diffParse(workout({ timeCap: undefined }), workout({ timeCap: 900 }));
    expect(entries).toEqual([{ path: 'timeCap', kind: 'backfill', from: undefined, to: 900 }]);
  });

  it('treats null and empty string as empty too', () => {
    const before = workout({ title: '' });
    const after = workout({ title: 'Fran' });
    expect(diffParse(before, after)[0].kind).toBe('backfill');
  });

  it('calls replacing an answered field an override', () => {
    const entries = diffParse(workout({ timeCap: 600 }), workout({ timeCap: 900 }));
    expect(entries).toEqual([{ path: 'timeCap', kind: 'override', from: 600, to: 900 }]);
  });

  it('says nothing when the parse was used as returned', () => {
    expect(diffParse(workout({ timeCap: 600 }), workout({ timeCap: 600 }))).toEqual([]);
  });

  it('reports a value being CLEARED as an override, not a backfill', () => {
    // Deleting the AI's answer is still overruling it — the direction doesn't matter.
    const entries = diffParse(workout({ timeCap: 600 }), workout({ timeCap: undefined }));
    expect(entries).toEqual([{ path: 'timeCap', kind: 'override', from: 600, to: undefined }]);
  });
});

describe('parseAudit — nested paths', () => {
  const withMovement = (name: string, reps: number): ParsedWorkout => workout({
    exercises: [{
      name: 'Metcon',
      type: 'wod',
      prescription: '21-15-9',
      suggestedSets: 1,
      movements: [{ name: 'Thruster', reps: 21 }, { name, reps }],
    }],
  });

  it('names the exact field it found, index and all', () => {
    const entries = diffParse(withMovement('Pull-up', 21), withMovement('Pull-up', 15));
    expect(entries).toEqual([{
      path: 'exercises[0].movements[1].reps',
      kind: 'override',
      from: 21,
      to: 15,
    }]);
  });

  it('reports a rewritten movement name as an override', () => {
    // The real case this was built to catch: normalisation turning a swing the AI described
    // into an "American" one the board never said.
    const entries = diffParse(
      withMovement('Alternating Kettlebell Swing', 21),
      withMovement('Alt American Kettlebell Swing', 21),
    );
    expect(entries[0].kind).toBe('override');
    expect(entries[0].path).toBe('exercises[0].movements[1].name');
  });

  it('reports a rebuilt list once, by length, instead of one entry per shifted index', () => {
    const before = workout({
      exercises: [{ name: 'Chipper', type: 'wod', prescription: 'x', suggestedSets: 1, movements: [{ name: 'Run' }] }],
    });
    const after = workout({
      exercises: [{
        name: 'Chipper',
        type: 'wod',
        prescription: 'x',
        suggestedSets: 1,
        movements: [{ name: 'Run' }, { name: 'Burpee' }, { name: 'Run' }],
      }],
    });

    const entries = diffParse(before, after);
    expect(entries).toEqual([{
      path: 'exercises[0].movements',
      kind: 'override',
      from: 1,
      to: 3,
    }]);
  });

  it('calls building a list the AI never returned a backfill', () => {
    const before = workout({
      exercises: [{ name: 'Chipper', type: 'wod', prescription: 'x', suggestedSets: 1, movements: [] }],
    });
    const after = workout({
      exercises: [{ name: 'Chipper', type: 'wod', prescription: 'x', suggestedSets: 1, movements: [{ name: 'Run' }] }],
    });
    expect(diffParse(before, after)[0].kind).toBe('backfill');
  });
});
