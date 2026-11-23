import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { Auth } from 'firebase-admin/auth';
export interface Principal { uid: string; scopes: string[] }
export interface AuthConfig { issuer: string; audience: string; jwksUrl: string; uidClaim: string }
/** OAuth tokens are audience-bound. An issuer-managed claim links to the existing Firebase UID. */
export function createVerifier(config: AuthConfig, firebaseAuth: Auth): (token: string) => Promise<Principal> {
  const keys = createRemoteJWKSet(new URL(config.jwksUrl));
  return async token => {
    const { payload } = await jwtVerify(token, keys, { issuer: config.issuer, audience: config.audience, algorithms: ['RS256', 'ES256'] });
    const uid = payload[config.uidClaim];
    if (typeof uid !== 'string' || !/^[\w-]{1,128}$/.test(uid) || !payload.exp) throw new Error('Unlinked account');
    const user = await firebaseAuth.getUser(uid);
    if (user.disabled) throw new Error('Account disabled');
    return { uid, scopes: typeof payload.scope === 'string' ? payload.scope.split(' ') : [] };
  };
}
