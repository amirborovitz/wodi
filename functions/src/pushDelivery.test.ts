import { describe, expect, it } from 'vitest';
import { deadTokenIndexes, pushPayload, THREAD_LINK } from './pushDelivery.js';

describe('pushPayload', () => {
  it('sends data only — the service worker draws the notification', () => {
    const payload = pushPayload({ body: 'Fran is still waiting.', link: THREAD_LINK });
    expect(payload.data).toEqual({ title: 'Wodi', body: 'Fran is still waiting.', link: '/?wodi=thread' });
    expect(payload).not.toHaveProperty('notification');
  });
});

describe('deadTokenIndexes', () => {
  it('drops only tokens that will never work again', () => {
    expect(deadTokenIndexes([
      { success: true },
      { success: false, error: { code: 'messaging/registration-token-not-registered' } },
      { success: false, error: { code: 'messaging/internal-error' } },
      { success: false, error: { code: 'messaging/invalid-registration-token' } },
    ])).toEqual([1, 3]);
  });
});
