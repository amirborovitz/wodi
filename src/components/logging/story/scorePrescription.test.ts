import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ParsedExercise } from '../../../types';
import { createBlankResult } from './types';
import { ScoreMovementInputs } from './ScoreMovementInputs';
import { InputRouter } from './InputRouter';
import { buildPrescriptionRow } from './useScorePrescription';
import { patchScoreMovements, echoOccurrence, occurrenceDiffers } from './useScoreMovementEdits';
import { buildSubstitutionPatch } from './substitutionPatch';

const daniel: ParsedExercise = {
  name: 'Daniel', type: 'wod', loggingMode: 'for_time', suggestedSets: 1,
  prescription: '50 Pull-ups, 400m Run, 21 Thrusters, 800m Run, 21 Thrusters, 400m Run, 50 Pull-ups',
  movements: [
    { name: 'Pull-up', reps: 50, inputType: 'none' },
    { name: 'Run', distance: 400, inputType: 'distance' },
    { name: 'Thruster', reps: 21, inputType: 'weight', equipment: 'barbell', rxWeights: { male: 42.5, female: 30, unit: 'kg' } },
    { name: 'Run', distance: 800, inputType: 'distance' },
    { name: 'Thruster', reps: 21, inputType: 'weight', equipment: 'barbell', rxWeights: { male: 42.5, female: 30, unit: 'kg' } },
    { name: 'Run', distance: 400, inputType: 'distance' },
    { name: 'Pull-up', reps: 50, inputType: 'none' },
  ],
};

// This Node-only runner uses classic JSX for the imported UI components.
beforeAll(() => vi.stubGlobal('React', React));
afterAll(() => vi.unstubAllGlobals());

describe('compact for-time prescription', () => {
  it('renders all seven occurrences in order, with closed optional editors and one shared weight', () => {
    const result = createBlankResult(daniel, 0, 'for_time', 'male');
    const change = vi.fn();
    const html = renderToStaticMarkup(React.createElement(InputRouter, {
      result, onChange: change,
    }));
    const labels = [...html.matchAll(/<summary[^>]*>(.*?)<\/summary>/g)]
      .map(match => match[1].replace(/<[^>]+>/g, ''));
    expect(labels).toHaveLength(7);
    ['50 Pull-up', '400m Run', '21 Thruster', '800m Run', '21 Thruster', '400m Run', '50 Pull-up']
      .forEach((label, index) => expect(labels[index]).toContain(label));
    expect(html).not.toMatch(/<details[^>]*\bopen[=> ]/);
    expect(html.match(/aria-label="Barbell weight"/g)).toHaveLength(1);
    expect(html).toContain('Thruster · both sets');
    expect(change).not.toHaveBeenCalled();
  });

  it('keeps an unfamiliar prescribed movement visible without an empty edit button', () => {
    const base = createBlankResult(daniel, 0, 'for_time', 'male').movementResults![0];
    const html = renderToStaticMarkup(React.createElement(ScoreMovementInputs, {
      movements: [{ ...base, movement: { name: 'Coach special', reps: 12 }, kind: 'reps' }],
      compact: true, onChange: vi.fn(),
    }));
    expect(html).toContain('12 Coach special');
    expect(html).not.toContain('<details');
  });

  it('a swap and its undo affect only the selected run and leave the board intact', () => {
    const movements = createBlankResult(daniel, 0, 'for_time', 'male').movementResults!;
    const middle = movements[3];
    const changed = patchScoreMovements(movements, middle, buildSubstitutionPatch(middle, {
      originalName: 'Run', selectedName: 'Echo Bike', substitutionType: 'equivalent',
      targetUnit: 'distance', originalValue: 800, adjustedValue: 2400,
    }), 'occurrence');
    expect([changed[1].distance, changed[3].distance, changed[5].distance]).toEqual([400, 2400, 400]);
    expect(changed[1]).toBe(movements[1]);
    expect(changed[5]).toBe(movements[5]);
    expect(buildPrescriptionRow(changed[3])).toMatchObject({ label: '800m Run', personal: 'You: Echo Bike · 2400m' });
    const restored = patchScoreMovements(changed, changed[3], buildSubstitutionPatch(changed[3], null), 'occurrence');
    expect(restored[3].distance).toBe(800);
    expect(buildPrescriptionRow(restored[3]).personal).toBe('');
  });

  it('keeps grouped-board edits grouped', () => {
    const movements = createBlankResult(daniel, 0, 'for_time', 'male').movementResults!;
    const next = patchScoreMovements(movements, movements[0], { reps: 30 }, 'movement');
    expect([next[0].reps, next[6].reps]).toEqual([30, 30]);
    expect(next[1]).toBe(movements[1]);
  });

  it('shows ranges, per-side work and complete ladder schemes without totals', () => {
    const base = createBlankResult(daniel, 0, 'for_time', 'male').movementResults![0];
    expect(buildPrescriptionRow({ ...base, movement: { name: 'KB Windmill', reps: 11, repsDisplay: '10–12', perSide: true } }).label)
      .toBe('10–12 each side KB Windmill');
    expect(buildPrescriptionRow({ ...base, kind: 'distance', movement: { name: 'Run', distance: 800, unit: 'km' }, prescribedScheme: [800, 600, 400] }).label)
      .toBe('800–600–400m Run');
  });
});

describe('repeated movements on the ordered board', () => {
  it('names which occurrence a row is, and what the row opens', () => {
    const result = createBlankResult(daniel, 0, 'for_time', 'male');
    const html = renderToStaticMarkup(React.createElement(InputRouter, {
      result, onChange: vi.fn(),
    }));
    const summaries = [...html.matchAll(/<summary[^>]*>(.*?)<\/summary>/g)]
      .map(match => match[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
    // Seven rows, four distinct movements: every repeat says where it sits in the sequence.
    expect(summaries[0]).toContain('1 of 2');
    expect(summaries[6]).toContain('2 of 2');
    expect(summaries[1]).toContain('1 of 3');
    expect(summaries[3]).toContain('2 of 3');
    expect(summaries[5]).toContain('3 of 3');
    // The runs open a distance; the thrusters take the shared bar above, and say so.
    expect(summaries[1]).toContain('Distance · swap');
    expect(summaries[2]).toContain('Weight above');
    // The rows open; they do not add. No '+' left claiming otherwise.
    summaries.forEach(summary => expect(summary).not.toContain('+'));
  });

  it('carries a swap to the other occurrences at the athlete’s ratio, not its raw number', () => {
    const movements = createBlankResult(daniel, 0, 'for_time', 'male').movementResults!;
    const eightHundred = movements[3];
    const swapped = patchScoreMovements(movements, eightHundred, buildSubstitutionPatch(eightHundred, {
      originalName: 'Run', selectedName: 'Echo Bike', substitutionType: 'equivalent',
      targetUnit: 'distance', originalValue: 800, adjustedValue: 2400,
    }), 'occurrence');

    // Nobody bikes 2400m twice to replace a 400m run: each run converts from its OWN distance.
    const echoed = [1, 5].map(i => echoOccurrence(swapped[3], swapped[i]));
    expect(echoed.map(patch => patch.distance)).toEqual([1200, 1200]);
    expect(echoed[0].substitution).toMatchObject({
      selectedName: 'Echo Bike', originalValue: 400, adjustedValue: 1200,
    });
  });

  it('scales a typed-over distance the same way, and offers the bulk action only once one differs', () => {
    const movements = createBlankResult(daniel, 0, 'for_time', 'male').movementResults!;
    expect(occurrenceDiffers(movements[1], movements[3])).toBe(false);

    // The athlete cut the 800 short at 600 — three quarters of what was written.
    const cutShort = { ...movements[3], distance: 600 };
    expect(occurrenceDiffers(cutShort, movements[1])).toBe(true);
    expect(echoOccurrence(cutShort, movements[1]).distance).toBe(300);
  });

  it('carries a weight across untouched — a barbell is the same barbell every time', () => {
    const movements = createBlankResult(daniel, 0, 'for_time', 'male').movementResults!;
    const loaded = { ...movements[2], weight: 35 };
    expect(echoOccurrence(loaded, movements[4]).weight).toBe(35);
  });
});
