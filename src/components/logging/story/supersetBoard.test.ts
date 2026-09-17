import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ParsedExercise } from '../../../types';
import { createBlankResult } from './types';
import { InputRouter } from './InputRouter';

// A strength circuit reads as one board — a line per station, the editor behind a tap — the same
// row the ordered for-time board uses. The real FBB accessory circuit of 2026-09-15 drew three
// full-height start/peak cards, and the athlete scrolled past all of them to reach Next.
const accessoryCircuit: ParsedExercise = {
  name: '3 Sets Accessory', type: 'strength', loggingMode: 'strength', suggestedSets: 3,
  prescription: '3 sets: 10/10 Single Leg Hip Thrust, 10 Shoulder Lateral Raise, 15 Prone Banded Hamstring Curl',
  movements: [
    { name: 'Single Leg Hip Thrust', reps: 10, inputType: 'weight', equipment: 'other' },
    { name: 'Shoulder Lateral Raise', reps: 10, inputType: 'weight', equipment: 'dumbbell', implementCount: 2 },
    { name: 'Prone Banded Hamstring Curl', reps: 15, inputType: 'weight', equipment: 'other' },
  ],
};

// This Node-only runner uses classic JSX for the imported UI components.
beforeAll(() => vi.stubGlobal('React', React));
afterAll(() => vi.unstubAllGlobals());

const summaries = (html: string): string[] =>
  [...html.matchAll(/<summary[^>]*>(.*?)<\/summary>/g)].map((match) => match[1].replace(/<[^>]+>/g, ''));

describe('strength circuit board', () => {
  it('reads one line per station, and opens only the first weight still owed', () => {
    const result = createBlankResult(accessoryCircuit, 0, 'strength', 'male');
    const html = renderToStaticMarkup(React.createElement(InputRouter, { result, onChange: vi.fn() }));
    const rows = summaries(html);
    expect(rows).toHaveLength(3);
    ['Single Leg Hip Thrust', 'Shoulder Lateral Raise', 'Prone Banded Hamstring Curl']
      .forEach((name, index) => expect(rows[index]).toContain(name));
    expect(rows[0]).toContain('30 reps');
    expect(html.match(/<details[^>]*\bopen[=> ]/g)).toHaveLength(1);
    expect(html).toMatch(/<details[^>]*\bopen[^>]*><summary[^>]*>.*?Single Leg Hip Thrust/);
  });

  it('reads back an entered build on the closed row, and opens nothing once every weight is in', () => {
    const blank = createBlankResult(accessoryCircuit, 0, 'strength', 'male');
    const result = {
      ...blank,
      movementResults: blank.movementResults!.map((mr, index) => ({
        ...mr, weight: 30 + index * 5, weightEnd: 35 + index * 5, loadMode: 'range' as const,
      })),
    };
    const html = renderToStaticMarkup(React.createElement(InputRouter, { result, onChange: vi.fn() }));
    expect(summaries(html)[0]).toContain('You: 30 → 35 kg');
    expect(html).not.toMatch(/<details[^>]*\bopen[=> ]/);
  });
});
