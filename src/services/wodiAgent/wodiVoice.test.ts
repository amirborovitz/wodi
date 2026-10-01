import { describe, expect, it } from 'vitest';
import { firstMeasured, headlineSegments, voiceSegments } from './wodiVoice';

const numbers = (segments: ReturnType<typeof voiceSegments>) =>
  segments.filter((s) => s.number).map((s) => `${s.text}${s.key ? '*' : ''}`);

describe('voiceSegments — a thread answer sets its numbers like a log', () => {
  it('lifts loads, reps and clocks, and leaves dates and counts alone', () => {
    expect(numbers(voiceSegments('100kg × 5 on 22 Sep.'))).toEqual(['100kg × 5']);
    expect(numbers(voiceSegments('Fran was 5:42 on Thursday — 18s faster than June.'))).toEqual(['5:42']);
    expect(numbers(voiceSegments('You trained 3 times this month, last on 30 Jun.'))).toEqual([]);
  });

  it('keeps every character, in order', () => {
    const text = 'Up 20kg since 12 Aug — 140kg × 3.';
    expect(voiceSegments(text).map((s) => s.text).join('')).toBe(text);
  });
});

describe('headlineSegments — Wodi\'s message highlights the one value it names', () => {
  it('only the named value is yellow; a date is never highlighted', () => {
    const text = 'Devil Press — top set 17.5kg on 30 Jun and 23 Jun.';
    expect(numbers(headlineSegments(text, '17.5kg'))).toEqual(['17.5kg*']);
    expect(headlineSegments(text, '17.5kg').map((s) => s.text).join('')).toBe(text);
  });

  it('nothing named, nothing highlighted', () => {
    expect(numbers(headlineSegments("What'd you do today?", null))).toEqual([]);
  });

  it('finds the first measured value to name', () => {
    expect(firstMeasured('Devil Press — top set 17.5kg on 30 Jun and 23 Jun.')).toBe('17.5kg');
    expect(firstMeasured('Back squat — last logged 3 Sep, 28 days ago.')).toBeNull();
  });
});
