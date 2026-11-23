import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { createOAuth } from './oauth';
import { createApp } from './http';
import { PosterRenderer } from './renderer';
import { WodiService } from './service';

function required(name: string): string {
  const value = process.env[name]; if (!value) throw new Error(`Missing ${name}`); return value;
}
const publicUrl = required('PUBLIC_URL').replace(/\/$/, '');
if (new URL(publicUrl).protocol !== 'https:') throw new Error('PUBLIC_URL must use HTTPS');
initializeApp({ storageBucket: required('FIREBASE_STORAGE_BUCKET') });
const renderer = new PosterRenderer();
const service = new WodiService(getFirestore(), getStorage().bucket(), renderer);
const oauth = await createOAuth(getFirestore(), getAuth(), { publicUrl, firebaseWebConfig: JSON.parse(required('FIREBASE_WEB_CONFIG_JSON')) as Record<string, unknown>, additionalRedirects: process.env.OAUTH_REDIRECT_URIS?.split(',').filter(Boolean) });
const app = createApp(service, oauth.verify, publicUrl, publicUrl);
app.use(oauth.router);
const listener = app.listen(Number(process.env.PORT ?? 8080), '0.0.0.0');
process.on('SIGTERM', () => { listener.close(); void renderer.close(); });
