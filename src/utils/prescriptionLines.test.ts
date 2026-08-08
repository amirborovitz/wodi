import { describe, it, expect } from 'vitest';
import { buildPrescriptionLines } from './prescriptionLines';
import type { ParsedExercise } from '../types';

// The board that motivated this (04/08/26): a 3-tier descending ladder whose tiers each open with
// their own run. The confirmation screen showed only a title and the AI's one-line paraphrase, so
// a parse that lost the run looked identical to a correct one.
const LADDER = {
  name: 'Pyramid Chipper For Time',
  loggingMode: 'for_time',
  sections: [800, 600, 400].map((distance, i) => ({
    sectionType: 'rounds',
    rounds: 1,
    movements: [
      { name: 'Run', distance, unit: 'm' },
      { name: 'Thruster', reps: [40, 30, 20][i] },
      { name: 'Box Jump', reps: [40, 30, 20][i] },
      { name: 'Burpees Over Bar', reps: [20, 30, 40][i] },
    ],
  })),
} as unknown as ParsedExercise;

describe('buildPrescriptionLines', () => {
  it('states each ladder movement once, carrying its whole scheme', () => {
    expect(buildPrescriptionLines(LADDER)).toEqual([
      { name: 'Run', qty: '800-600-400m' },
      { name: 'Thruster', qty: '40-30-20' },
      { name: 'Box Jump', qty: '40-30-20' },
      { name: 'Burpees Over Bar', qty: '20-30-40' },
    ]);
  });

  it('collapses a movement that holds the same count every tier', () => {
    const constant = JSON.parse(JSON.stringify(LADDER)) as ParsedExercise;
    constant.sections!.forEach((s) => { s.movements[2].reps = 15; });

    expect(buildPrescriptionLines(constant)[2]).toEqual({ name: 'Box Jump', qty: '15' });
  });

  it('keeps every occurrence of an interleaved movement, in board order', () => {
    // A chipper that runs between stations must not collapse to one "Run" line — the athlete
    // has to see all four trips to know the parse kept them.
    const chipper = {
      name: 'Endurance Relay For Time',
      loggingMode: 'for_time',
      movements: [
        { name: 'Run', distance: 300, unit: 'm' },
        { name: 'Power Clean', reps: 100 },
        { name: 'Run', distance: 300, unit: 'm' },
        { name: 'Thruster', reps: 60 },
      ],
    } as unknown as ParsedExercise;

    expect(buildPrescriptionLines(chipper).map((l) => `${l.qty} ${l.name}`)).toEqual([
      '300m Run', '100 Power Clean', '300m Run', '60 Thruster',
    ]);
  });

  it('tags a once-only block so it cannot read as per-round work', () => {
    const withBuyIn = {
      name: 'Hopper For Time',
      loggingMode: 'for_time',
      sections: [
        { sectionType: 'buy_in', rounds: 1, movements: [{ name: 'Row', distance: 1000, unit: 'm' }] },
        { sectionType: 'rounds', rounds: 5, movements: [{ name: 'Pull-up', reps: 25 }] },
      ],
    } as unknown as ParsedExercise;

    expect(buildPrescriptionLines(withBuyIn)).toEqual([
      { name: 'Row', qty: '1000m', role: 'buy_in' },
      { name: 'Pull-up', qty: '25' },
    ]);
  });

  it('lifts a "Buy-In:" name prefix into the role rather than printing it', () => {
    const prefixed = {
      name: 'For Time',
      loggingMode: 'for_time',
      movements: [
        { name: 'Buy-In: Run', distance: 400, unit: 'm' },
        { name: 'Wall Ball', reps: 50 },
      ],
    } as unknown as ParsedExercise;

    expect(buildPrescriptionLines(prefixed)).toEqual([
      { name: 'Run', qty: '400m', role: 'buy_in' },
      { name: 'Wall Ball', qty: '50' },
    ]);
  });

  it('renders calories and unprescribed movements without inventing a number', () => {
    const mixed = {
      name: 'For Time',
      loggingMode: 'for_time',
      movements: [
        { name: 'Echo Bike', calories: 12 },
        { name: 'Max Handstand Hold' },
      ],
    } as unknown as ParsedExercise;

    expect(buildPrescriptionLines(mixed)).toEqual([
      { name: 'Echo Bike', qty: '12 cal' },
      { name: 'Max Handstand Hold', qty: '' },
    ]);
  });
});
