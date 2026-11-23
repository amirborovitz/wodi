import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { getAuth } from 'firebase-admin/auth';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { WodiService } from '../src/service';
import { PosterRenderer } from '../src/renderer';
import { createVerifier } from '../src/auth';
import { createApp } from '../src/http';
import { SCOPES } from '../src/mcp';
import type { WorkoutLog } from '../src/contracts';
import { writeFile, mkdir } from 'node:fs/promises';

async function listen(server: Server): Promise<string> {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert(address && typeof address !== 'string');
  return `http://127.0.0.1:${address.port}`;
}
const exercise = { name: 'Back Squat', type: 'strength' as const, prescription: '3 sets of 5', suggestedSets: 3, suggestedReps: 5, loggingMode: 'strength' as const };
const log: WorkoutLog = {
  parsed_workout: { title: 'Squat day', type: 'strength', format: 'strength', scoreType: 'load', exercises: [exercise] },
  results: [{ kind: 'load', exerciseIndex: 0, exercise, setsTotal: 3, setsCompleted: 3, weight: 80, loadMode: 'same', repsPerSet: 5 }],
  trained_at: '2026-11-22T08:00:00Z', request_id: 'squat-e2e',
};
test('authenticated MCP → Firestore → original poster skins → Storage → ChatGPT images', { timeout: 240_000 }, async t => {
  assert(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_STORAGE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST, 'Run with firebase emulators:exec; never against production');
  const firebase = initializeApp({ projectId: 'demo-wodi', storageBucket: 'demo-wodi.appspot.com' });
  const db = getFirestore(firebase), auth = getAuth(firebase), renderer = new PosterRenderer();
  const service = new WodiService(db, getStorage(firebase).bucket(), renderer);
  const suffix = Date.now().toString();
  const uid = `alice-${suffix}`, other = `bob-${suffix}`;
  for (const user of [uid, other]) { await auth.createUser({ uid: user }); await db.doc(`users/${user}`).set({ weight: 75, stats: { totalWorkouts: 0, totalVolume: 0 } }); }
  const keys = await generateKeyPair('RS256');
  const jwk = { ...await exportJWK(keys.publicKey), kid: 'test-key', alg: 'RS256', use: 'sig' };
  const jwks = createServer((_req, res) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ keys: [jwk] })); });
  const jwksUrl = await listen(jwks);
  const issuer = 'https://issuer.example/';
  let publicUrl = '';
  const verifier = (token: string) => createVerifier({ issuer, audience: `${publicUrl}/mcp`, jwksUrl, uidClaim: 'firebase_uid' }, auth)(token);
  const server = createServer(); publicUrl = await listen(server);
  server.on('request', createApp(service, verifier, publicUrl, issuer));
  const token = async (user: string, scopes = SCOPES, audience = `${publicUrl}/mcp`, expired = false): Promise<string> => new SignJWT({ firebase_uid: user, scope: scopes.join(' ') }).setProtectedHeader({ alg: 'RS256', kid: 'test-key' }).setIssuer(issuer).setAudience(audience).setSubject(user).setIssuedAt().setExpirationTime(expired ? '0s' : '5m').sign(keys.privateKey);
  const connect = async (bearer: string): Promise<Client> => {
    const client = new Client({ name: 'e2e', version: '1' });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${publicUrl}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${bearer}` } } }));
    return client;
  };
  const clients: Client[] = [];
  try {
    await t.test('discovery, missing token, wrong audience, expired token, malicious origin', async () => {
      const metadata = await fetch(`${publicUrl}/.well-known/oauth-protected-resource/mcp`).then(r => r.json());
      assert.equal(metadata.resource, `${publicUrl}/mcp`);
      for (const bearer of ['', await token(uid, SCOPES, 'wrong'), await token(uid, SCOPES, `${publicUrl}/mcp`, true)]) {
        const response = await fetch(`${publicUrl}/mcp`, { method: 'POST', headers: { Authorization: `Bearer ${bearer}` } });
        assert.equal(response.status, 401); assert.match(response.headers.get('www-authenticate')!, /resource_metadata/);
      }
      assert.equal((await fetch(`${publicUrl}/mcp`, { method: 'POST', headers: { Origin: 'https://evil.example' } })).status, 403);
    });
    const client = await connect(await token(uid)); clients.push(client);
    const call = async (name: string, args: Record<string, unknown>) => client.callTool({ name, arguments: args });
    await t.test('preserves history tools and publishes full logging contract', async () => {
      const { tools } = await client.listTools();
      assert.equal(tools.length, 6);
      assert(tools.some(tool => tool.name === 'movement_history'));
      assert(JSON.stringify(tools.find(tool => tool.name === 'log_workout')!.inputSchema).includes('prescription'));
    });
    let workoutId = '';
    await t.test('logs once across concurrent retries, persists app totals and PR', async () => {
      const results = await Promise.all([call('log_workout', log as unknown as Record<string, unknown>), call('log_workout', log as unknown as Record<string, unknown>)]);
      assert(!results[0].isError, JSON.stringify(results[0]));
      workoutId = (results[0].structuredContent as { workout_id: string }).workout_id;
      assert.equal((results[1].structuredContent as { workout_id: string }).workout_id, workoutId);
      const workout = await service.workout(uid, workoutId);
      assert.equal(workout.totalReps, 15); assert.equal(workout.totalVolume, 1200);
      assert.equal((await db.doc(`users/${uid}`).get()).get('stats.totalWorkouts'), 1);
      assert.equal((await service.records(uid)).length, 1);
      const conflict = await call('log_workout', { ...log, trained_at: '2026-11-21T08:00:00Z' }); assert.equal(conflict.isError, true);
    });
    let posterId = '';
    await t.test('renders every existing skin as a real 1080px PNG and retrieves images', async () => {
      const skins = ['slab', 'chalk', 'flare', 'stadium', 'press', 'blueprint', 'hazard', 'ink', 'foil', 'aurum', 'sun'];
      for (const skin of skins) {
        const generated = await call('generate_poster', { workout_id: workoutId, skin });
        assert(!generated.isError, JSON.stringify(generated));
        posterId = (generated.structuredContent as { poster_id: string }).poster_id;
        const poster = await call('get_poster', { poster_id: posterId });
        assert(!poster.isError, JSON.stringify(poster));
        const images = (poster.content as { type: string; data?: string }[]).filter(c => c.type === 'image');
        assert.equal(images.length, 1);
        const bytes = Buffer.from(images[0].data!, 'base64');
        assert.equal(bytes.readUInt32BE(16), 1080); assert(bytes.length > 10000);
        await mkdir('test-artifacts', { recursive: true }); await writeFile(`test-artifacts/${skin}.png`, bytes);
        const retry = await call('generate_poster', { workout_id: workoutId, skin });
        assert.equal((retry.structuredContent as { poster_id: string }).poster_id, posterId);
      }
      const resources = await client.listResources();
      const ui = resources.resources.find(r => r.uri.startsWith('ui://'))!;
      const widget = await client.readResource({ uri: ui.uri });
      assert.equal(widget.contents[0].mimeType, 'text/html;profile=mcp-app');
      assert('text' in widget.contents[0] && widget.contents[0].text.includes('data:image/png;base64,'));
    });
    await t.test('rejects cross-user reads, invalid input, and insufficient scopes', async () => {
      const bob = await connect(await token(other)); clients.push(bob);
      assert.equal((await bob.callTool({ name: 'get_poster', arguments: { poster_id: posterId } })).isError, true);
      assert.equal((await bob.callTool({ name: 'generate_poster', arguments: { workout_id: workoutId, skin: 'sun' } })).isError, true);
      const reader = await connect(await token(uid, ['workouts:read'])); clients.push(reader);
      assert.equal((await reader.callTool({ name: 'log_workout', arguments: log as unknown as Record<string, unknown> })).isError, true);
      assert.equal((await call('log_workout', { ...log, request_id: 'negative', results: [{ ...log.results[0], weight: -10 }] })).isError, true);
      assert.equal((await call('generate_poster', { workout_id: '../users/alice', skin: 'sun' })).isError, true);
      assert.equal((await call('generate_poster', { workout_id: workoutId, skin: 'invented' })).isError, true);
    });
    await t.test('test logs do not update athlete counters or records', async () => {
      await service.log(uid, { ...log, request_id: 'test-log', is_test: true });
      assert.equal((await db.doc(`users/${uid}`).get()).get('stats.totalWorkouts'), 1);
      assert.equal((await service.records(uid)).length, 1);
    });
    await t.test('deleting a workout revokes cached poster reads', async () => {
      await db.collection('workouts').doc(workoutId).delete();
      assert.equal((await call('get_poster', { poster_id: posterId })).isError, true);
    });
  } finally {
    for (const client of clients) await client.close();
    await renderer.close();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await new Promise<void>(resolve => jwks.close(() => resolve()));
    await db.terminate(); await deleteApp(firebase);
  }
});
