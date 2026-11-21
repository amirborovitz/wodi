/**
 * Re-read named corpus boards through the app's real pipeline, every AI call sent to the
 * wodiModel Cloud Function as a signed-in user — the app's own route and budget, no OpenAI key on
 * this machine. Keeps each fixture's recorded segmentation (re-reading parts only), and records
 * one when the fixture has none (a new board).
 *
 *   npm run corpus:rerecord -- <idTokenFile> <fixture-name> [<fixture-name> ...]
 *
 * The ID token is the signed-in user's (Firebase Auth, about an hour); the file is read, never
 * printed. Each call counts against that user's daily AI limit unless they are an admin.
 */
import fs from 'node:fs';
import path from 'node:path';
import OpenAI from 'openai';
import { requestKey } from './aiReplay';

const REPO = process.cwd();
const URL = 'https://us-central1-wodboard-17f3d.cloudfunctions.net/wodiModel';
const [tokenFile, ...names] = process.argv.slice(2);
const token = fs.readFileSync(tokenFile, 'utf8').replace(/^\uFEFF/, '').trim();
process.env.OPENAI_API_KEY ||= 'via-function';

type Body = { messages?: Array<{ content?: unknown }> };
const proto = (OpenAI as unknown as { Chat: { Completions: { prototype: { create: (b: Body) => Promise<unknown> } } } }).Chat.Completions.prototype;

let kept: Record<string, string> = {};
let store: Record<string, string> = {};
let live = 0;
proto.create = async (body: Body) => {
  const key = requestKey(body);
  if (key.startsWith('segment|') && kept[key] != null) {
    store[key] = kept[key];
    return { choices: [{ message: { content: kept[key] } }] };
  }
  live += 1;
  const res = await fetch(URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ data: { body } }),
  });
  const json = await res.json() as { result?: { choices?: Array<{ message?: { content?: string } }> }; error?: { message?: string } };
  if (!res.ok || !json.result) throw new Error(`wodiModel ${res.status}: ${json.error?.message ?? 'no result'}`);
  store[key] = json.result.choices?.[0]?.message?.content ?? '';
  return json.result;
};

const { parseWorkoutSession } = await import('../src/services/openai');
const quiet = { info: console.info, log: console.log, warn: console.warn };
for (const name of names) {
  const file = path.join(REPO, 'fixtures/wods', `${name}.json`);
  const raw = fs.readFileSync(file, 'utf8');
  const crlf = raw.includes('\r\n');
  const fixture = JSON.parse(raw.replace(/^\uFEFF/, ''));
  kept = Object.fromEntries(Object.entries(fixture.aiResponses ?? {}).filter(([k]) => k.startsWith('segment|'))) as Record<string, string>;
  store = {};
  console.info = () => {}; console.log = () => {}; console.warn = () => {};
  try {
    await parseWorkoutSession(fixture.rawText);
  } catch (error) {
    Object.assign(console, quiet);
    console.error(`FAILED ${name}: ${(error as Error).message}`);
    continue;
  } finally {
    Object.assign(console, quiet);
  }
  fixture.aiResponses = store;
  const out = JSON.stringify(fixture, null, 2) + '\n';
  fs.writeFileSync(file, crlf ? out.replace(/\n/g, '\r\n') : out);
  console.log(`re-read ${name}: ${Object.keys(store).length} answers`);
}
console.log(`live AI calls: ${live}`);
