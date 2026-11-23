import { chromium, type Browser } from 'playwright';
import { readFile } from 'node:fs/promises';
import type { WorkoutWithStats } from '../../src/hooks/useWorkouts';

export class PosterRenderer {
  private browser?: Promise<Browser>;
  constructor(private readonly assets = new URL('../dist/', import.meta.url)) {}
  async render(workout: WorkoutWithStats, weight?: number): Promise<Buffer[]> {
    this.browser ??= chromium.launch({ headless: true });
    const browser = await this.browser;
    const context = await browser.newContext({ viewport: { width: 360, height: 900 }, deviceScaleFactor: 3, timezoneId: 'UTC' });
    try {
      // No URLs supplied by a workout may cause network requests (including photos).
      await context.route('**/*', route => route.abort());
      const page = await context.newPage();
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      const css = await readFile(new URL('render.css', this.assets), 'utf8');
      // A synthetic origin gives existing preference helpers access to localStorage.
      // The HTML is fulfilled in-process; no DNS or HTTP request leaves Chromium.
      await page.route('https://wodi-print.invalid/', route => route.fulfill({ contentType: 'text/html', body: '<html><head></head><body><div id="root"></div></body></html>' }));
      await page.goto('https://wodi-print.invalid/');
      await page.addStyleTag({ content: `${css}\n*{box-sizing:border-box}body{margin:0;background:#0c0d0f}.poster-page{width:360px}` });
      await page.addScriptTag({ type: 'module', content: await readFile(new URL('render.js', this.assets), 'utf8') });
      await page.waitForFunction(() => typeof window.wodiRender === 'function');
      const skins = await page.evaluate(() => window.wodiSkins);
      if (workout.posterSkin && !skins.includes(workout.posterSkin)) throw new Error('Unknown poster skin');
      await page.evaluate(({ workout, weight }) => window.wodiRender(workout, weight), { workout, weight });
      try {
        await page.waitForFunction(() => Array.from(document.querySelectorAll('.poster-page')).length > 0 && Array.from(document.querySelectorAll('.poster-page')).every(e => e.getBoundingClientRect().height > 100), undefined, { timeout: 10_000 });
      } catch { throw new Error(`Poster rendering failed: ${errors.join('; ') || 'layout did not stabilize'}`); }
      await page.evaluate(async () => { await document.fonts.ready; await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame); });
      const pages = page.locator('.poster-page');
      const images: Buffer[] = [];
      for (let i = 0; i < await pages.count(); i++) images.push(await pages.nth(i).screenshot({ type: 'png', animations: 'disabled' }));
      return images;
    } finally { await context.close(); }
  }
  async close(): Promise<void> { if (this.browser) await (await this.browser).close(); }
}
