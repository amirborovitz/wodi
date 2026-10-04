import { describe, expect, it } from 'vitest';
import { sameOpening, type ChatOpening } from './useTellWodiChat';

// The chat follows Wodi's opening until the athlete speaks. A copy with the same words must not
// count as a change — that's the endless re-render that blanked the chat opened from Today.
describe('sameOpening', () => {
  const a: ChatOpening = { text: 'Fran yesterday — 5:42.', highlight: '5:42', link: { label: 'yesterday', workoutId: 'w1' } };

  it('a fresh copy with the same words is the same opening', () => {
    expect(sameOpening(a, { ...a, link: { ...a.link! } })).toBe(true);
  });

  it('new words, a new highlight or a different poster is a change', () => {
    expect(sameOpening(a, { ...a, text: 'Strength today. Nice work.' })).toBe(false);
    expect(sameOpening(a, { ...a, highlight: null })).toBe(false);
    expect(sameOpening(a, { ...a, link: { label: 'yesterday', workoutId: 'w2' } })).toBe(false);
    expect(sameOpening(a, { ...a, link: null })).toBe(false);
  });
});
