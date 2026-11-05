import { describe, expect, it } from 'vitest';
import { toModelError } from './modelClient';
import { isDailyLimitError, isQuotaExhaustedError, isRateLimitError } from './openai';

/** What a failed `wodiModel` call looks like in the app: a Functions error carrying OpenAI's status/code. */
function functionFailure(message: string, details: unknown): Error {
  return Object.assign(new Error(message), { code: 'functions/resource-exhausted', details });
}

describe('toModelError — the app still tells a wait from a dead key from a full day', () => {
  it('an OpenAI rate limit through the function is a rate limit', () => {
    const error = toModelError(functionFailure('Rate limit reached for gpt-5.5', { status: 429, code: 'rate_limit_exceeded' }));
    expect(isRateLimitError(error)).toBe(true);
    expect(isQuotaExhaustedError(error)).toBe(false);
    expect(isDailyLimitError(error)).toBe(false);
  });

  it('an out-of-credit key through the function is quota exhausted', () => {
    const error = toModelError(functionFailure('You exceeded your current quota', { status: 429, code: 'insufficient_quota' }));
    expect(isQuotaExhaustedError(error)).toBe(true);
  });

  it("today's limit is its own thing — not 'wait 2 minutes'", () => {
    const error = toModelError(functionFailure("Wodi hit today's AI limit.", { status: 429, code: 'wodi_daily_limit' }));
    expect(isDailyLimitError(error)).toBe(true);
    expect(isRateLimitError(error)).toBe(false);
  });

  it('a failure without details passes through unchanged', () => {
    const error = new Error('network down');
    expect(toModelError(error)).toBe(error);
  });
});
