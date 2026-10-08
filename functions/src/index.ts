// Email sign-in with a 6-digit code.
//
// A code, not a link: on iPhone a link in an email opens Safari, never the Wodi icon on the home
// screen, so someone who installed the app would end up signed in to the wrong place. A code is
// typed wherever the person already is.
//
// sendLoginCode   — emails a fresh code (one per address every 30s, valid 10 minutes).
// verifyLoginCode — checks it (5 tries) and returns a Firebase custom token for that email's
//                   account, creating the account on first sign-in. An address that already
//                   signs in with Google gets the SAME account: the code proves the inbox.

import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { defineSecret, defineString } from 'firebase-functions/params';
import { setGlobalOptions } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

initializeApp();
setGlobalOptions({ maxInstances: 10 });

const RESEND_API_KEY = defineSecret('RESEND_API_KEY');
/** e.g. `Wodi <hello@yourdomain.com>` — the domain must be verified in Resend. Set in functions/.env. */
const LOGIN_EMAIL_FROM = defineString('LOGIN_EMAIL_FROM');

const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_AFTER_MS = 30 * 1000;
const MAX_ATTEMPTS = 5;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface LoginCodeDoc {
  codeHash: string;
  sentAt: Timestamp;
  expiresAt: Timestamp;
  attempts: number;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function normalizeEmail(raw: unknown): string {
  const email = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
    throw new HttpsError('invalid-argument', 'invalid-email');
  }
  return email;
}

/** Server-only collection (rules deny every client). Keyed by a hash so the doc id isn't the address. */
function loginCodeRef(email: string) {
  return getFirestore().collection('loginCodes').doc(sha256(email));
}

function hashCode(email: string, code: string): string {
  return sha256(`${email}:${code}`);
}

async function sendCodeEmail(email: string, code: string): Promise<boolean> {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY.value()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: LOGIN_EMAIL_FROM.value(),
      to: [email],
      subject: `${code} is your Wodi code`,
      text: `Your Wodi sign-in code is ${code}\n\nIt works for 10 minutes. If you didn't ask for it, you can ignore this email.`,
      html: `<div style="font-family:Helvetica,Arial,sans-serif;max-width:420px;margin:0 auto;padding:32px 24px;background:#0c0d0f;color:#f2f0eb;border-radius:16px;text-align:center">
  <p style="margin:0 0 20px;font-size:15px;color:rgba(242,240,235,0.6)">Your Wodi sign-in code</p>
  <p style="margin:0 0 20px;font-size:40px;font-weight:800;letter-spacing:10px;color:#f5c200">${code}</p>
  <p style="margin:0;font-size:13px;color:rgba(242,240,235,0.38)">It works for 10 minutes. If you didn't ask for it, you can ignore this email.</p>
</div>`,
    }),
  });
  if (!response.ok) {
    logger.error('Login code email failed', { status: response.status, body: await response.text() });
  }
  return response.ok;
}

export const sendLoginCode = onCall({ secrets: [RESEND_API_KEY] }, async (request): Promise<{ sent: true }> => {
  const email = normalizeEmail(request.data?.email);
  const ref = loginCodeRef(email);
  const now = Date.now();

  const existing = await ref.get();
  const lastSentAt = (existing.data() as LoginCodeDoc | undefined)?.sentAt;
  if (lastSentAt && now - lastSentAt.toMillis() < RESEND_AFTER_MS) {
    throw new HttpsError('resource-exhausted', 'too-soon');
  }

  const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
  const doc: LoginCodeDoc = {
    codeHash: hashCode(email, code),
    sentAt: Timestamp.fromMillis(now),
    expiresAt: Timestamp.fromMillis(now + CODE_TTL_MS),
    attempts: 0,
  };
  await ref.set(doc);

  if (!(await sendCodeEmail(email, code))) {
    // Nothing reached the inbox — don't make them wait out the resend window for it.
    await ref.delete();
    throw new HttpsError('unavailable', 'email-failed');
  }
  return { sent: true };
});

/** The account that owns this inbox — the existing one (any provider), or a new one. */
async function uidForEmail(email: string): Promise<string> {
  const auth = getAuth();
  try {
    const user = await auth.getUserByEmail(email);
    if (!user.emailVerified) await auth.updateUser(user.uid, { emailVerified: true });
    return user.uid;
  } catch (error) {
    if ((error as { code?: string }).code !== 'auth/user-not-found') throw error;
    const created = await auth.createUser({ email, emailVerified: true });
    return created.uid;
  }
}

export const verifyLoginCode = onCall(async (request): Promise<{ token: string }> => {
  const email = normalizeEmail(request.data?.email);
  const code = typeof request.data?.code === 'string' ? request.data.code.replace(/\D/g, '') : '';
  if (code.length !== 6) throw new HttpsError('invalid-argument', 'invalid-code');

  const ref = loginCodeRef(email);
  const outcome = await getFirestore().runTransaction(async (tx): Promise<'ok' | 'wrong' | 'expired'> => {
    const snap = await tx.get(ref);
    const doc = snap.data() as LoginCodeDoc | undefined;
    if (!doc) return 'expired';
    if (doc.expiresAt.toMillis() < Date.now() || doc.attempts >= MAX_ATTEMPTS) {
      tx.delete(ref);
      return 'expired';
    }
    const matches = timingSafeEqual(Buffer.from(doc.codeHash), Buffer.from(hashCode(email, code)));
    if (!matches) {
      tx.update(ref, { attempts: doc.attempts + 1 });
      return 'wrong';
    }
    return 'ok';
  });

  if (outcome === 'expired') throw new HttpsError('failed-precondition', 'code-expired');
  if (outcome === 'wrong') throw new HttpsError('permission-denied', 'wrong-code');

  // The code is spent only once the sign-in exists — a server-side failure here leaves it usable
  // for a retry instead of reporting a correct code as "expired".
  const uid = await uidForEmail(email);
  const token = await getAuth().createCustomToken(uid);
  await ref.delete();
  return { token };
});
