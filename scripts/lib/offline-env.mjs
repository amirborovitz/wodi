// Preload for scripts that run the app's own code under Node (`node --import tsx --import ./scripts/lib/offline-env.mjs …`).
//
// Two things Vite normally does for that code, done here instead:
//  - CSS modules: the edit round-trip reaches a component that imports one. Nothing renders, so
//    every class name resolves to itself.
//  - firebase.ts initialises Auth on import and refuses an empty API key. These scripts never use
//    the client SDK (admin scripts use firebase-admin), so any placeholder satisfies it.
import { register } from 'node:module';

process.env.VITE_FIREBASE_API_KEY ||= 'offline-script';

register('data:text/javascript,' + encodeURIComponent(`
export async function load(url, context, next) {
  if (url.endsWith('.css')) {
    return { format: 'module', source: 'export default new Proxy({}, { get: (_, key) => String(key) });', shortCircuit: true };
  }
  return next(url, context);
}`));
