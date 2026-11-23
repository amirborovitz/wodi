import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import express from 'express';
import Provider, { errors, type Configuration, type JWK } from 'oidc-provider';
import { generateKeyPair, exportJWK } from 'jose';
import type { Firestore } from 'firebase-admin/firestore';
import type { Auth } from 'firebase-admin/auth';
import { firestoreOAuthAdapter } from './oauthStore';
import type { Principal } from './auth';
import { SCOPES } from './mcp';
import { rateLimit } from 'express-rate-limit';

export interface OAuthOptions {
  publicUrl: string;
  firebaseWebConfig: Record<string, unknown>;
  additionalRedirects?: string[];
}
const stableCallback = 'https://chatgpt.com/connector_platform_oauth_redirect';

async function signingMaterial(db: Firestore): Promise<{ jwks: { keys: JWK[] }; cookies: string[] }> {
  const ref = db.doc('wodiOAuthKeys/current');
  const prior = await ref.get();
  if (prior.exists) return prior.data() as { jwks: { keys: JWK[] }; cookies: string[] };
  const { privateKey } = await generateKeyPair('RS256', { extractable: true });
  const key = { ...await exportJWK(privateKey), kid: randomBytes(16).toString('hex'), alg: 'RS256', use: 'sig' } as JWK;
  const value = { jwks: { keys: [key] }, cookies: [randomBytes(48).toString('base64url')] };
  return db.runTransaction(async tx => {
    const current = await tx.get(ref);
    if (current.exists) return current.data() as typeof value;
    tx.create(ref, value); return value;
  });
}

export async function createOAuth(db: Firestore, auth: Auth, options: OAuthOptions): Promise<{ provider: Provider; router: express.Router; verify: (token: string) => Promise<Principal> }> {
  const { publicUrl } = options;
  const resource = `${publicUrl}/mcp`;
  const secrets = await signingMaterial(db);
  const redirects = [stableCallback, ...(options.additionalRedirects ?? [])];
  const allowedRedirect = (uri: string): boolean => redirects.includes(uri) || /^https:\/\/chatgpt\.com\/connector\/oauth\/[A-Za-z0-9_-]+$/.test(uri);
  const config: Configuration = {
    adapter: firestoreOAuthAdapter(db), jwks: secrets.jwks,
    cookies: { keys: secrets.cookies, short: { httpOnly: true, sameSite: 'lax' }, long: { httpOnly: true, sameSite: 'lax' } },
    clients: [{ client_id: 'wodi-chatgpt', client_name: 'ChatGPT', redirect_uris: redirects, response_types: ['code'], grant_types: ['authorization_code', 'refresh_token'], token_endpoint_auth_method: 'none' }],
    subjectTypes: ['public'], scopes: ['openid', 'email', 'profile', 'offline_access'],
    claims: { openid: ['sub'], email: ['email', 'email_verified'], profile: ['name'] },
    responseTypes: ['code'], pkce: { required: (): boolean => true },
    ttl: { AccessToken: 3600, IdToken: 3600, AuthorizationCode: 120, Interaction: 600, Session: 86400, RefreshToken: 30 * 86400, Grant: 90 * 86400 },
    features: {
      devInteractions: { enabled: false }, registration: { enabled: true }, revocation: { enabled: true, allowedPolicy: (_ctx, client, token): boolean => token.clientId === client.clientId },
      resourceIndicators: { enabled: true,
        getResourceServerInfo: (_ctx, indicator) => {
          if (indicator !== resource) throw new errors.InvalidTarget();
          return { audience: resource, scope: SCOPES.join(' '), accessTokenFormat: 'opaque', accessTokenTTL: 3600 };
        },
      },
    },
    interactions: { url: (_ctx, interaction): string => `/oauth/interaction/${interaction.uid}` },
    routes: { authorization: '/oauth/authorize', token: '/oauth/token', registration: '/oauth/register', jwks: '/oauth/jwks', revocation: '/oauth/revoke', userinfo: '/oauth/userinfo', end_session: '/oauth/logout' },
    extraClientMetadata: { properties: ['wodi_client'], validator: (_ctx, _key, _value, metadata): void => {
      const extra = metadata as unknown as Record<string, unknown>;
      if (['sector_identifier_uri', 'jwks_uri', 'request_uris'].some(field => extra[field] != null)) throw new errors.InvalidClientMetadata('Remote client metadata URLs are not supported');
      if (!metadata.redirect_uris?.length || !metadata.redirect_uris.every(allowedRedirect)) throw new errors.InvalidClientMetadata('Redirect URI is not an allowed ChatGPT callback');
      if (metadata.token_endpoint_auth_method !== 'none') throw new errors.InvalidClientMetadata('Use public-client PKCE authentication');
      if (metadata.grant_types?.some(grant => !['authorization_code', 'refresh_token'].includes(grant))) throw new errors.InvalidClientMetadata('Unsupported grant');
      if (metadata.response_types?.some(response => response !== 'code')) throw new errors.InvalidClientMetadata('Only authorization codes are supported');
    } },
    issueRefreshToken: (_ctx, client): boolean => client.grantTypeAllowed('refresh_token'),
    rotateRefreshToken: (): boolean => true,
    expiresWithSession: (): boolean => false,
    findAccount: async (_ctx, accountId) => {
      const user = await auth.getUser(accountId);
      if (user.disabled) return undefined;
      return { accountId, claims: async () => ({ sub: accountId, email: user.email, email_verified: user.emailVerified, name: user.displayName }) };
    },
    renderError: async ctx => { ctx.type = 'html'; ctx.body = '<!doctype html><title>Wodi connection</title><h1>Connection could not be completed</h1><p>Return to ChatGPT and try connecting again.</p><a href="https://www.wodi.fit">Open Wodi</a>'; },
  };
  const provider = new Provider(publicUrl, config);
  provider.proxy = true;
  const router = express.Router();
  router.use('/oauth/register', rateLimit({ windowMs: 3600_000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false }));
  router.use('/oauth/token', rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false }));
  router.use('/oauth/interaction', rateLimit({ windowMs: 60_000, limit: 90, standardHeaders: 'draft-8', legacyHeaders: false }));
  const sameOrigin: express.RequestHandler = (req, res, next): void => {
    if (req.headers.origin !== publicUrl || !req.is('application/json')) { res.sendStatus(403); return; }
    next();
  };
  router.get('/oauth/config', (_req, res) => { res.json({ firebase: options.firebaseWebConfig, appUrl: 'https://www.wodi.fit' }); });
  router.get('/oauth/connect.js', (_req, res) => { res.type('application/javascript').send(readFileSync(new URL('../dist/connect.js', import.meta.url))); });
  router.get('/oauth/connect.css', (_req, res) => { res.type('text/css').send(readFileSync(new URL('../dist/connect.css', import.meta.url))); });
  router.get('/oauth/interaction/:uid', async (req, res) => {
    try { const details = await provider.interactionDetails(req, res); if (details.uid !== req.params.uid) throw new Error(); res.set('Cache-Control', 'no-store').set('Referrer-Policy', 'no-referrer').set('Content-Security-Policy', "default-src 'self'; script-src 'self' https://apis.google.com https://www.gstatic.com https://ssl.gstatic.com; style-src 'self'; font-src 'self' data:; connect-src 'self' https://*.googleapis.com https://*.cloudfunctions.net https://*.firebaseapp.com https://*.run.app; frame-src https://*.firebaseapp.com; img-src 'self' data:; frame-ancestors 'none'").type('html').send(readFileSync(new URL('../dist/connect.html', import.meta.url))); }
    catch { res.status(400).send('Connection expired. Return to ChatGPT and connect again.'); }
  });
  router.get('/oauth/interaction/:uid/details', async (req, res) => {
    try {
      const details = await provider.interactionDetails(req, res);
      if (details.uid !== req.params.uid) throw new Error();
      const requested = String(details.params.scope ?? '').split(' ').filter(scope => [...SCOPES, 'openid', 'email', 'profile', 'offline_access'].includes(scope));
      res.set('Cache-Control', 'no-store').json({ scopes: requested, clientName: 'ChatGPT' });
    } catch { res.status(400).json({ error: 'Connection expired. Start again from ChatGPT.' }); }
  });
  router.post('/oauth/interaction/:uid/complete', sameOrigin, express.json({ limit: '16kb' }), async (req, res) => {
    try {
      const details = await provider.interactionDetails(req, res);
      if (details.uid !== req.params.uid) throw new Error('Expired connection');
      if (req.body.deny === true) { const redirectTo = await provider.interactionResult(req, res, { error: 'access_denied', error_description: 'User declined Wodi connection' }, { mergeWithLastSubmission: false }); res.json({ redirectTo }); return; }
      if (typeof req.body.idToken !== 'string') throw new Error('Sign in to Wodi first');
      const identity = await auth.verifyIdToken(req.body.idToken, true);
      const user = await auth.getUser(identity.uid);
      if (user.disabled) throw new Error('Account unavailable');
      if (!(await db.doc(`users/${identity.uid}`).get()).exists) throw new Error('Open www.wodi.fit and finish your profile, then connect again.');
      const grant = details.grantId ? await provider.Grant.find(details.grantId) : undefined;
      const consent = grant && grant.accountId === identity.uid ? grant : new provider.Grant({ accountId: identity.uid, clientId: String(details.params.client_id) });
      const requested = String(details.params.scope ?? '').split(' ');
      consent.addOIDCScope(requested.filter(scope => ['openid', 'email', 'profile', 'offline_access'].includes(scope)).join(' '));
      consent.addResourceScope(resource, requested.filter(scope => SCOPES.includes(scope)).join(' '));
      const grantId = await consent.save();
      const redirectTo = await provider.interactionResult(req, res, { login: { accountId: identity.uid, remember: true }, consent: { grantId } }, { mergeWithLastSubmission: false });
      res.json({ redirectTo });
    } catch (error) { res.status(400).json({ error: error instanceof Error && /Open www|Sign in/.test(error.message) ? error.message : 'Unable to connect. Sign in again and retry.' }); }
  });
  router.use(provider.callback());
  const verify = async (raw: string): Promise<Principal> => {
    const token = await provider.AccessToken.find(raw);
    if (!token || !token.isValid || token.aud !== resource || !token.accountId || !(await provider.Grant.find(token.grantId))) throw new Error('Invalid access token');
    const user = await auth.getUser(token.accountId);
    if (user.disabled) throw new Error('Account disabled');
    return { uid: user.uid, scopes: (token.scope ?? '').split(' ') };
  };
  return { provider, router, verify };
}
