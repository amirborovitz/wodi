import { describe, expect, it } from 'vitest';
import { checkModelRequest, MAX_OUTPUT_TOKENS, usageDay } from './modelRequest.js';

const message = [{ role: 'user', content: 'hi' }];

describe('checkModelRequest', () => {
  it('passes a real app request through untouched', () => {
    const body = { model: 'gpt-5.5', messages: message, max_completion_tokens: 1200, temperature: 0 };
    expect(checkModelRequest({ body })).toEqual({ ok: true, body });
  });

  it('passes the older helpers on the cheaper model', () => {
    const body = { model: 'gpt-4o-mini', messages: message, max_tokens: 300 };
    expect(checkModelRequest({ body })).toEqual({ ok: true, body });
  });

  it('adds the output cap when the app named none', () => {
    const check = checkModelRequest({ body: { model: 'gpt-5.5', messages: message } });
    expect(check).toEqual({ ok: true, body: { model: 'gpt-5.5', messages: message, max_completion_tokens: MAX_OUTPUT_TOKENS } });
  });

  it.each([
    [undefined, 'missing-body'],
    [{ body: 'x' }, 'missing-body'],
    [{ body: { model: 'gpt-4.1', messages: message } }, 'model-not-allowed'],
    [{ body: { model: 'gpt-5.5', messages: [] } }, 'missing-messages'],
    [{ body: { model: 'gpt-5.5', messages: message, stream: true } }, 'stream-not-supported'],
    [{ body: { model: 'gpt-5.5', messages: message, n: 4 } }, 'one-answer-only'],
    [{ body: { model: 'gpt-5.5', messages: message, max_completion_tokens: MAX_OUTPUT_TOKENS + 1 } }, 'output-too-large'],
    [{ body: { model: 'gpt-5.5', messages: message, max_tokens: 0 } }, 'output-too-large'],
  ])('refuses %j', (data, reason) => {
    expect(checkModelRequest(data)).toEqual({ ok: false, reason });
  });
});

describe('usageDay', () => {
  it('is the UTC date', () => {
    expect(usageDay(new Date('2026-11-04T23:30:00Z'))).toBe('2026-11-04');
  });
});
