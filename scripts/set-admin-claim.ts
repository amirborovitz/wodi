/**
 * set-admin-claim.ts — grants (or with --revoke, removes) the `admin` custom claim on one account.
 *
 * Admin used to be an email address compiled into the app, which put it in the public bundle.
 * Now the app (AuthContext `isAdmin`) and firestore.rules (`isAdmin()`) both read this claim from
 * the sign-in token, so the address lives only on the command line. Same service-account key as
 * admin-dump-workouts.ts — kept OUTSIDE the repo, passed by path, never committed.
 *
 *   npx tsx scripts/set-admin-claim.ts --key C:\path\to\key.json --email you@example.com [--revoke]
 *
 * The claim reaches the app on the next token refresh — sign out and back in to see it at once.
 */
import fs from 'node:fs';
import { cert, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

function arg(name: string): string {
  const args = process.argv.slice(2);
  const value = args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
  if (!value) {
    console.error(`Missing ${name}. Usage: --key <service-account.json> --email <address> [--revoke]`);
    process.exit(1);
  }
  return value;
}

async function main(): Promise<void> {
  const keyPath = arg('--key');
  const email = arg('--email').trim().toLowerCase();
  const revoke = process.argv.includes('--revoke');
  initializeApp({ credential: cert(JSON.parse(fs.readFileSync(keyPath, 'utf8'))) });

  const auth = getAuth();
  const account = await auth.getUserByEmail(email);
  const claims = { ...(account.customClaims ?? {}) };
  if (revoke) delete claims.admin;
  else claims.admin = true;
  await auth.setCustomUserClaims(account.uid, claims);
  console.log(`${revoke ? 'Revoked' : 'Granted'} admin for ${email} (${account.uid}).`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
