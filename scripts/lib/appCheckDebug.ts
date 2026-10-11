/**
 * App Check for local scripts (corpus, check-wod) — so they can reach Gemini through Firebase AI
 * Logic, which refuses any request without a valid App Check token.
 *
 * Browsers attest with reCAPTCHA; Node can't, so a script trades a DEBUG TOKEN — a secret
 * registered once in the Firebase console (App Check → Apps → Manage debug tokens) and kept in
 * .env.local as APPCHECK_DEBUG_TOKEN — for a short-lived App Check token, through the same
 * exchange the web SDK's debug mode uses. Script-only: the app attests with reCAPTCHA.
 */
import { initializeAppCheck, CustomProvider } from 'firebase/app-check';

let installed = false;

export async function installScriptAppCheck(): Promise<void> {
  const debugToken = process.env.APPCHECK_DEBUG_TOKEN;
  if (installed || !debugToken) return;
  const { app } = await import('../../src/services/firebase');
  const { projectId, appId, apiKey } = app.options;
  initializeAppCheck(app, {
    provider: new CustomProvider({
      getToken: async () => {
        const response = await fetch(
          `https://firebaseappcheck.googleapis.com/v1/projects/${projectId}/apps/${appId}:exchangeDebugToken?key=${apiKey}`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ debugToken }) },
        );
        const body = await response.json() as { token?: string; ttl?: string; error?: { message?: string } };
        if (!response.ok || !body.token) {
          throw new Error(`App Check debug exchange failed (${response.status}): ${body.error?.message ?? 'no token'}. Is APPCHECK_DEBUG_TOKEN registered in the console?`);
        }
        const ttlSeconds = parseFloat(body.ttl ?? '3600');
        return { token: body.token, expireTimeMillis: Date.now() + ttlSeconds * 1000 };
      },
    }),
    isTokenAutoRefreshEnabled: false,
  });
  installed = true;
}
