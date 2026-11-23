import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PosterRenderer } from '../src/renderer';
import type { WorkoutWithStats } from '../../src/hooks/useWorkouts';
import type { PosterSkinId } from '../../src/types';
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
const workout: WorkoutWithStats = {
  id: 'print-test', userId: 'test', title: 'Squat day', date: new Date('2026-11-22T08:00:00Z'), createdAt: new Date(), updatedAt: new Date(),
  type: 'strength', format: 'strength', status: 'completed', totalReps: 15, totalVolume: 1200,
  exercises: [{ id: 'squat', name: 'Back Squat', type: 'strength', prescription: '3 sets of 5', loggingMode: 'strength', sets: [1, 2, 3].map(n => ({ id: `set-${n}`, setNumber: n, actualReps: 5, weight: 80, completed: true })) }],
};
test('real renderer prints all current skins and every multipart page', { timeout: 180_000 }, async () => {
  const renderer = new PosterRenderer();
  try {
    for (const skin of ['slab', 'chalk', 'flare', 'stadium', 'press', 'blueprint', 'hazard', 'ink', 'foil', 'aurum', 'sun'] as PosterSkinId[]) {
      const images = await renderer.render({ ...workout, posterSkin: skin });
      assert.equal(images.length, 1); assert.equal(images[0].readUInt32BE(16), 1080);
    }
    const multipart = { ...workout, type: 'mixed' as const, exercises: [...workout.exercises, { ...workout.exercises[0], id: 'press', name: 'Strict Press' }] };
    const images = await renderer.render(multipart); assert.equal(images.length, 2);
  } finally { await renderer.close(); }
});

test('inline widget receives MCP Apps tool results and displays image pages', { timeout: 30_000 }, async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<iframe title="Wodi poster"></iframe>');
    const html = await readFile(new URL('../dist/widget.html', import.meta.url), 'utf8');
    await page.evaluate(html => {
      const frame = document.querySelector('iframe')!;
      window.addEventListener('message', event => {
        if (event.source !== frame.contentWindow) return;
        const message = event.data;
        if (message.method === 'ui/initialize') frame.contentWindow!.postMessage({ jsonrpc: '2.0', id: message.id, result: { protocolVersion: '2026-01-26', hostInfo: { name: 'Test host', version: '1' }, hostCapabilities: {}, hostContext: { theme: 'dark' } } }, '*');
        if (message.method === 'ui/notifications/initialized') {
          const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6X8AAAAASUVORK5CYII=';
          frame.contentWindow!.postMessage({ jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: { content: [], structuredContent: { pages: 2 }, _meta: { images: [image, image] } } }, '*');
        }
      });
      frame.srcdoc = html;
    }, html);
    const frame = page.frameLocator('iframe');
    await frame.locator('img').nth(1).waitFor();
    assert.equal(await frame.locator('img').count(), 2);
    assert.equal(await frame.locator('img').nth(1).getAttribute('alt'), 'Wodi workout poster, page 2');
    assert.equal(await frame.locator('img').first().evaluate((img: HTMLImageElement) => img.naturalWidth), 1);
  } finally { await browser.close(); }
});
