import { describe, expect, it } from 'vitest';
import { BENCHMARK_WODS } from './benchmarkWods.ts';
import { SITE_URL, buildSitePages, renderSitemap, wodPath } from './wodPages.ts';

/** What a reader sees: the page with its tags, scripts and styles taken out. */
function visibleText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<[^>]+>/g, ' ');
}

function metaContent(html: string, attr: string): string {
  return html.match(new RegExp(`${attr}" content="([^"]*)"`))?.[1] ?? '';
}

describe('benchmark WOD pages', () => {
  const pages = buildSitePages();

  it('gives every workout its own page, plus the index', () => {
    expect(pages.map(page => page.path)).toEqual(['/wods/', ...BENCHMARK_WODS.map(wodPath)]);
    expect(new Set(BENCHMARK_WODS.map(wod => wod.slug)).size).toBe(BENCHMARK_WODS.length);
  });

  it.each(buildSitePages())('$path is a complete, findable page', ({ path, html }) => {
    expect(html).toContain(`<link rel="canonical" href="${SITE_URL}${path}" />`);
    expect(html.match(/<h1>/g)).toHaveLength(1);
    expect(html).toMatch(/<title>[^<]+\| wodi<\/title>/);
    expect(metaContent(html, 'name="description').length).toBeGreaterThan(50);
  });

  // CLAUDE.md: Wodi is a training buddy, never a "log" or a "tracker".
  it.each(buildSitePages())('$path never calls wodi a log or a tracker', ({ html }) => {
    const words = `${visibleText(html)} ${metaContent(html, 'name="description')} ${html.match(/<title>([^<]*)/)?.[1] ?? ''}`;
    expect(words).not.toMatch(/\blog(s|ged|ging|book)?\b|\btrack(er|ing)?\b/i);
  });

  it('links every workout page from the index', () => {
    const index = pages[0].html;
    for (const wod of BENCHMARK_WODS) expect(index).toContain(`href="${wodPath(wod)}"`);
  });

  it('lists the app and every workout in the one sitemap', () => {
    const sitemap = renderSitemap(pages);
    for (const path of ['/', '/privacy.html', '/terms.html', ...pages.map(page => page.path)]) {
      expect(sitemap).toContain(`<loc>${SITE_URL}${path}</loc>`);
    }
  });
});
