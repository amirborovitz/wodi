import { initializeApp, type FirebaseOptions } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithCustomToken, signInWithEmailAndPassword, browserSessionPersistence, setPersistence, onAuthStateChanged, signOut } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import '@fontsource/barlow/400.css';
import '@fontsource/barlow/600.css';
import '@fontsource/barlow/700.css';
import '@fontsource/barlow/800.css';
import '@fontsource/barlow-condensed/900.css';
import './connect.css';

const element = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const status = (text: string): void => { element('status').textContent = text; };
const uid = location.pathname.split('/').pop()!;
const endpoint = `/oauth/interaction/${encodeURIComponent(uid)}`;
const config = await fetch('/oauth/config').then(response => response.json()) as { firebase: FirebaseOptions };
const firebase = initializeApp(config.firebase), auth = getAuth(firebase), functions = getFunctions(firebase);
await setPersistence(auth, browserSessionPersistence);
const sendCode = httpsCallable<{ email: string }, { sent: true }>(functions, 'sendLoginCode');
const verifyCode = httpsCallable<{ email: string; code: string }, { token: string }>(functions, 'verifyLoginCode');
const labels: Record<string, string> = { openid: 'Identify your Wodi account', email: 'Share your Wodi account email with ChatGPT', profile: 'Share your Wodi display name', offline_access: 'Keep this connection active between chats', 'workouts:read': 'Read your workout history and personal records', 'workouts:write': 'Save workouts you ask to log', 'posters:write': 'Generate your Wodi workout posters', 'posters:read': 'Display your posters in ChatGPT' };
let signedEmail = '';
async function busy(action: () => Promise<void>): Promise<void> {
  const buttons = Array.from(document.querySelectorAll('button'));
  buttons.forEach(button => { button.disabled = true; }); status('');
  try { await action(); } catch (error) { status(error instanceof Error && !error.message.startsWith('Firebase:') ? error.message : 'Sign-in could not be completed. Check your details and try again.'); }
  finally { buttons.forEach(button => { button.disabled = false; }); }
}
onAuthStateChanged(auth, user => {
  element('signin').hidden = !!user; element('consent').hidden = !user;
  element('account').textContent = user?.email ?? 'your Wodi account';
});
element('google').addEventListener('click', () => { void busy(async () => { await signInWithPopup(auth, new GoogleAuthProvider()); }); });
element('switch-account').addEventListener('click', () => { void busy(async () => { await signOut(auth); }); });
element('email-form').addEventListener('submit', event => { event.preventDefault(); void busy(async () => {
  signedEmail = element<HTMLInputElement>('email').value.trim();
  await sendCode({ email: signedEmail }); element('code-form').hidden = false; element('code').focus(); status('Check your email for your Wodi sign-in code.');
}); });
element('code-form').addEventListener('submit', event => { event.preventDefault(); void busy(async () => {
  const response = await verifyCode({ email: signedEmail, code: element<HTMLInputElement>('code').value.trim() });
  await signInWithCustomToken(auth, response.data.token);
}); });
element('password-form').addEventListener('submit', event => { event.preventDefault(); void busy(async () => {
  const email = element<HTMLInputElement>('email').value.trim();
  if (!email) throw new Error('Enter your Wodi email above.');
  await signInWithEmailAndPassword(auth, email, element<HTMLInputElement>('password').value);
}); });
async function complete(deny: boolean): Promise<void> {
  const response = await fetch(`${endpoint}/complete`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(deny ? { deny: true } : { idToken: await auth.currentUser?.getIdToken(true) }) });
  const result = await response.json() as { redirectTo?: string; error?: string };
  if (!response.ok || !result.redirectTo) throw new Error(result.error ?? 'Could not complete connection.');
  const target = new URL(result.redirectTo, location.origin);
  if (target.origin !== location.origin) throw new Error('Invalid connection redirect.');
  location.assign(target.href);
}
element('connect').addEventListener('click', () => { void busy(() => complete(false)); });
element('cancel').addEventListener('click', () => { void busy(() => complete(true)); });
try {
  const response = await fetch(`${endpoint}/details`); const details = await response.json() as { scopes?: string[]; error?: string };
  if (!response.ok) throw new Error(details.error);
  element('scopes').replaceChildren(...(details.scopes ?? []).map(scope => { const li = document.createElement('li'); li.textContent = labels[scope] ?? scope; return li; }));
} catch { status('This connection has expired. Return to ChatGPT and start again.'); element<HTMLButtonElement>('connect').disabled = true; }
