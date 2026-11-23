import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import express from 'express';
import { request, type APIRequestContext } from 'playwright';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { randomBytes, createHash } from 'node:crypto';
import { createOAuth } from '../src/oauth';
import { SCOPES } from '../src/mcp';

test('Wodi OAuth: Firebase sign-in, explicit consent, PKCE, resource binding, refresh rotation and revocation', { timeout: 120_000 }, async t => {
  assert(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST, 'Emulators required');
  const firebase = initializeApp({ projectId: 'demo-wodi' }); const db = getFirestore(firebase), auth = getAuth(firebase);
  const uid = `oauth-${Date.now()}`;
  await auth.createUser({ uid, email: `${uid}@example.test`, emailVerified: true });
  await db.doc(`users/${uid}`).set({ weight: 75, stats: {} });
  const custom = await auth.createCustomToken(uid);
  const signIn = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=test`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: custom, returnSecureToken: true }) }).then(r => r.json()) as { idToken: string };
  assert(signIn.idToken);
  const app = express(), server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`, callback = `${base}/test/callback`, resource = `${base}/mcp`;
  const oauth = await createOAuth(db, auth, { publicUrl: base, firebaseWebConfig: { projectId: 'demo-wodi' }, additionalRedirects: [callback] });
  app.use(oauth.router);
  const contexts: APIRequestContext[] = [];
  const start = async (scopes = SCOPES): Promise<{ browser: APIRequestContext; interaction: string; verifier: string }> => {
    const browser = await request.newContext({ baseURL: base }); contexts.push(browser);
    const verifier = randomBytes(32).toString('base64url');
    const query = new URLSearchParams({ client_id: 'wodi-chatgpt', response_type: 'code', redirect_uri: callback, resource, scope: ['openid', 'email', 'offline_access', ...scopes].join(' '), state: 'expected-state', code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' });
    const response = await browser.get(`/oauth/authorize?${query}`, { maxRedirects: 0 });
    assert.equal(response.status(), 303, await response.text());
    const interaction = response.headers().location;
    assert(interaction.includes('/oauth/interaction/'), interaction);
    assert.equal((await browser.get(interaction)).status(), 200);
    return { browser, interaction, verifier };
  };
  const approve = async (flow: Awaited<ReturnType<typeof start>>, body: Record<string, unknown> = { idToken: signIn.idToken }): Promise<URL> => {
    const complete = await flow.browser.post(`${flow.interaction}/complete`, { data: body, headers: { Origin: base } });
    assert.equal(complete.status(), 200, await complete.text());
    const { redirectTo } = await complete.json() as { redirectTo: string };
    const response = await flow.browser.get(redirectTo, { maxRedirects: 0 });
    assert([302, 303].includes(response.status()), await response.text());
    const target = new URL(response.headers().location, base);
    assert.equal(target.pathname, '/test/callback', target.href);
    assert.equal(target.searchParams.get('state'), 'expected-state'); assert.equal(target.searchParams.get('iss'), base);
    return target;
  };
  try {
    await t.test('discovery and dynamic registration publish PKCE and reject unrelated redirects', async () => {
      const response = await fetch(`${base}/.well-known/openid-configuration`).then(r => r.json());
      assert(response.code_challenge_methods_supported.includes('S256')); assert.equal(response.authorization_response_iss_parameter_supported, true);
      const client = await request.newContext({ baseURL: base }); contexts.push(client);
      const valid = await client.post('/oauth/register', { data: { client_name: 'ChatGPT', redirect_uris: ['https://chatgpt.com/connector_platform_oauth_redirect'], token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'] } });
      assert.equal(valid.status(), 201, await valid.text()); assert((await valid.json()).client_id);
      const invalid = await client.post('/oauth/register', { data: { redirect_uris: ['https://evil.example/callback'], token_endpoint_auth_method: 'none' } });
      assert.equal(invalid.status(), 400);
      const remote = await client.post('/oauth/register', { data: { redirect_uris: ['https://chatgpt.com/connector_platform_oauth_redirect'], token_endpoint_auth_method: 'none', sector_identifier_uri: 'https://127.0.0.1/private' } });
      assert.equal(remote.status(), 400);
    });
    let access = '', refresh = '';
    await t.test('sign in with the existing Firebase UID and approve requested scopes', async () => {
      const flow = await start();
      const noOrigin = await flow.browser.post(`${flow.interaction}/complete`, { data: { idToken: signIn.idToken } }); assert.equal(noOrigin.status(), 403);
      const forged = await flow.browser.post(`${flow.interaction}/complete`, { data: { idToken: 'forged' }, headers: { Origin: base } }); assert.equal(forged.status(), 400);
      const target = await approve(flow); assert(target.searchParams.get('code'));
      const response = await flow.browser.post('/oauth/token', { form: { grant_type: 'authorization_code', client_id: 'wodi-chatgpt', code: target.searchParams.get('code')!, redirect_uri: callback, resource, code_verifier: flow.verifier } });
      assert.equal(response.status(), 200, await response.text());
      const tokens = await response.json(); access = tokens.access_token; refresh = tokens.refresh_token; assert(access && refresh);
      const principal = await oauth.verify(access); assert.equal(principal.uid, uid); assert(principal.scopes.includes('workouts:write'));
    });
    await t.test('wrong PKCE verifier and wrong resource cannot redeem a code', async () => {
      for (const wrong of ['pkce', 'resource']) {
        const flow = await start(), target = await approve(flow);
        const response = await flow.browser.post('/oauth/token', { form: { grant_type: 'authorization_code', client_id: 'wodi-chatgpt', code: target.searchParams.get('code')!, redirect_uri: callback, resource: wrong === 'resource' ? 'https://wrong.example/mcp' : resource, code_verifier: wrong === 'pkce' ? randomBytes(32).toString('base64url') : flow.verifier } });
        assert.equal(response.status(), 400);
      }
    });
    await t.test('declining consent issues no authorization code', async () => { const target = await approve(await start(), { deny: true }); assert.equal(target.searchParams.get('error'), 'access_denied'); assert(!target.searchParams.has('code')); });
    await t.test('refresh tokens rotate and revocation invalidates access', async () => {
      const client = contexts[0];
      const renewed = await client.post('/oauth/token', { form: { grant_type: 'refresh_token', client_id: 'wodi-chatgpt', refresh_token: refresh, resource } });
      assert.equal(renewed.status(), 200, await renewed.text());
      const tokens = await renewed.json(); assert.notEqual(tokens.refresh_token, refresh); assert.equal((await oauth.verify(tokens.access_token)).uid, uid);
      const revoked = await client.post('/oauth/revoke', { form: { client_id: 'wodi-chatgpt', token: tokens.access_token, token_type_hint: 'access_token' } }); assert.equal(revoked.status(), 200);
      await assert.rejects(() => oauth.verify(tokens.access_token));
      const replay = await client.post('/oauth/token', { form: { grant_type: 'refresh_token', client_id: 'wodi-chatgpt', refresh_token: refresh, resource } }); assert.equal(replay.status(), 400);
    });
    await t.test('authorization codes are single-use and reuse revokes their grant', async () => {
      const flow = await start(), target = await approve(flow);
      const form = { grant_type: 'authorization_code', client_id: 'wodi-chatgpt', code: target.searchParams.get('code')!, redirect_uri: callback, resource, code_verifier: flow.verifier };
      const first = await flow.browser.post('/oauth/token', { form }); assert.equal(first.status(), 200);
      const tokens = await first.json(); const replay = await flow.browser.post('/oauth/token', { form }); assert.equal(replay.status(), 400);
      await assert.rejects(() => oauth.verify(tokens.access_token));
    });
    await t.test('disabled Firebase accounts lose access immediately', async () => {
      const flow = await start(), target = await approve(flow);
      const response = await flow.browser.post('/oauth/token', { form: { grant_type: 'authorization_code', client_id: 'wodi-chatgpt', code: target.searchParams.get('code')!, redirect_uri: callback, resource, code_verifier: flow.verifier } });
      assert.equal(response.status(), 200); access = (await response.json()).access_token;
      assert.equal((await oauth.verify(access)).uid, uid);
      await auth.updateUser(uid, { disabled: true }); await assert.rejects(() => oauth.verify(access));
    });
  } finally {
    for (const context of contexts) await context.dispose();
    await new Promise<void>(resolve => server.close(() => resolve())); await db.terminate(); await deleteApp(firebase);
  }
});
