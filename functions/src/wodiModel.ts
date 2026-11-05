// wodiModel — the app's one door to the AI. The app builds the request exactly as before (prompts,
// schemas and reading the answer back all stay in the app); this function adds the OpenAI key,
// which never leaves the server, and keeps each athlete's daily use in check.
//
// Usage per athlete per day is kept in `aiUsage/{uid}_{day}` (server-only — rules deny every
// client): calls, input/cached/output tokens. That is also the first place cost per user is visible.

import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { defineInt, defineSecret } from 'firebase-functions/params';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { checkModelRequest, usageDay } from './modelRequest.js';

const OPENAI_API_KEY = defineSecret('OPENAI_API_KEY');
/** Model calls per athlete per day. One photo log is ~5–10 calls (read + parts + chat). */
const DAILY_CALL_LIMIT = defineInt('WODI_DAILY_AI_CALLS', { default: 150 });

interface OpenAIErrorBody {
  error?: { message?: string; code?: string | null; type?: string };
}

interface OpenAIUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number };
}

/** Counts the call against today's limit, or refuses it. Admins aren't limited. */
async function takeCall(uid: string, isAdmin: boolean): Promise<FirebaseFirestore.DocumentReference> {
  const day = usageDay(new Date());
  const ref = getFirestore().collection('aiUsage').doc(`${uid}_${day}`);
  const limit = DAILY_CALL_LIMIT.value();
  await getFirestore().runTransaction(async (tx) => {
    const calls = ((await tx.get(ref)).data()?.calls as number | undefined) ?? 0;
    if (!isAdmin && calls >= limit) {
      throw new HttpsError('resource-exhausted', 'Wodi hit today\'s AI limit.', { status: 429, code: 'wodi_daily_limit' });
    }
    tx.set(ref, { uid, day, calls: calls + 1, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  });
  return ref;
}

/** OpenAI's own failure, carried back with its status and code so the app can tell a wait from a dead key. */
function toHttpsError(status: number, body: OpenAIErrorBody): HttpsError {
  const message = body.error?.message ?? `OpenAI returned ${status}`;
  const details = { status, code: body.error?.code ?? body.error?.type ?? null };
  if (status === 429) return new HttpsError('resource-exhausted', message, details);
  if (status >= 500) return new HttpsError('unavailable', message, details);
  return new HttpsError('invalid-argument', message, details);
}

export const wodiModel = onCall(
  { secrets: [OPENAI_API_KEY], timeoutSeconds: 300, memory: '512MiB' },
  async (request): Promise<unknown> => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'sign-in-required');
    const { uid, token } = request.auth;

    const check = checkModelRequest(request.data);
    if (!check.ok) throw new HttpsError('invalid-argument', check.reason);

    const usageRef = await takeCall(uid, token.admin === true);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_API_KEY.value()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(check.body),
    });
    const body = await response.json() as OpenAIErrorBody & { usage?: OpenAIUsage };
    if (!response.ok) {
      logger.warn('wodiModel: OpenAI refused', { uid, status: response.status, code: body.error?.code });
      throw toHttpsError(response.status, body);
    }

    const usage = body.usage ?? {};
    await usageRef.set({
      inputTokens: FieldValue.increment(usage.prompt_tokens ?? 0),
      cachedInputTokens: FieldValue.increment(usage.prompt_tokens_details?.cached_tokens ?? 0),
      outputTokens: FieldValue.increment(usage.completion_tokens ?? 0),
    }, { merge: true });
    return body;
  },
);
