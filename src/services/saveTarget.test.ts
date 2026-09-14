import { describe, expect, it } from 'vitest';
import { resolveSaveTarget } from './saveTarget';

/**
 * The routing a save must keep. The screen owns WHEN the session's workout id is set (after the
 * first save, or on opening a saved workout for edit) and cleared (only on starting a different
 * board); this pins what each state means.
 */
describe('resolveSaveTarget', () => {
  it('creates a workout when the session has not written one yet — the first save of a new board', () => {
    expect(resolveSaveTarget(null)).toEqual({ kind: 'create' });
    expect(resolveSaveTarget(undefined)).toEqual({ kind: 'create' });
  });

  it('updates the workout the session already wrote — however the athlete got back to Save', () => {
    // Save → Edit → Save, Save → Edit → back → Save, and editing a workout opened from history
    // all reach here with the id set, and must all land on the same document.
    expect(resolveSaveTarget('abc123')).toEqual({ kind: 'update', workoutId: 'abc123' });
  });

  it('never treats an empty id as a workout to update', () => {
    expect(resolveSaveTarget('')).toEqual({ kind: 'create' });
  });
});
