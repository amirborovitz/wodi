/**
 * Public pages for famous workouts (wodi.fit/wods/<name>/) and the sitemap that lists them.
 *
 * Built at `vite build` as plain HTML — no app, no JavaScript — so every search engine and
 * link preview can read them. The app's own pages (/, privacy, terms) are listed here too:
 * this is the ONE sitemap, there is no copy in public/.
 */
import type { Plugin } from 'vite';
import { BENCHMARK_WODS, type BenchmarkWod } from './benchmarkWods.ts';

export const SITE_URL = 'https://wodi.fit';

export interface SitePage {
  /** Output file, relative to the build folder. */
  fileName: string;
  /** Public URL path. */
  path: string;
  html: string;
}

const FONTS = 'https://fonts.googleapis.com/css2?family=Anton&family=DM+Mono:wght@500&family=Barlow:wght@500;700;800&family=Barlow+Condensed:wght@900&display=swap';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function wodPath(wod: BenchmarkWod): string {
  return `/wods/${wod.slug}/`;
}

/** The search-result line: what the workout is, in the words people type. */
function wodDescription(wod: BenchmarkWod): string {
  const kind = wod.family === 'Hero' ? 'Hero WOD' : 'benchmark workout';
  return `${wod.name} is a CrossFit ${kind}: ${wod.scheme.replace(/ – /g, '-')} — ${wod.movements.join(', ')}. ${wod.scoredBy} Rx standards, and how wodi turns your result into a poster.`;
}

interface ShellOptions {
  title: string;
  description: string;
  path: string;
  body: string;
  jsonLd: Record<string, unknown>;
}

function shell({ title, description, path, body, jsonLd }: ShellOptions): string {
  const url = `${SITE_URL}${path}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="theme-color" content="#0c0d0f" />
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}" />
<link rel="canonical" href="${url}" />
<link rel="icon" type="image/svg+xml" href="/wodi-mark.svg" />
<meta property="og:type" content="article" />
<meta property="og:site_name" content="wodi" />
<meta property="og:url" content="${url}" />
<meta property="og:title" content="${escapeHtml(title)}" />
<meta property="og:description" content="${escapeHtml(description)}" />
<meta property="og:image" content="${SITE_URL}/wodi-icon-512.png" />
<meta name="twitter:card" content="summary" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="${FONTS}" rel="stylesheet" />
<link rel="stylesheet" href="/wods/wods.css" />
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
</head>
<body>
<header class="top"><a class="wordmark" href="/">wodi<span class="dot">.</span>fit</a><a class="topLink" href="/wods/">Benchmark WODs</a></header>
<main>
${body}
</main>
<footer class="foot">
<p><a class="wordmark small" href="/">wodi<span class="dot">.</span>fit</a> — your CrossFit training buddy.</p>
<p class="fine">Benchmark workouts are listed for reference. wodi is not affiliated with or endorsed by CrossFit, LLC.</p>
<p class="fine"><a href="/privacy.html">Privacy</a> · <a href="/terms.html">Terms</a></p>
</footer>
</body>
</html>
`;
}

function list(items: readonly string[], className: string): string {
  return `<ul class="${className}">${items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
}

/** The sample poster: the result is the loudest thing on it, the name a small label above. */
function samplePoster(wod: BenchmarkWod): string {
  return `<figure class="poster" aria-label="A sample wodi poster for ${escapeHtml(wod.name)}">
<div class="posterHead"><span class="chip">${escapeHtml(wod.scoring.toUpperCase())}</span><span class="rule"></span></div>
<p class="posterName">${escapeHtml(wod.name.toUpperCase())}</p>
<p class="posterScheme">${escapeHtml(wod.scheme)}</p>
${list(wod.movements, 'posterRows')}
<div class="posterHero"><span class="disc"></span><span class="posterLabel">${escapeHtml(wod.sampleLabel)}</span><span class="posterResult">${escapeHtml(wod.sampleResult)}</span></div>
<div class="posterFoot">wodi<span class="dot">.</span>fit</div>
</figure>`;
}

export function renderWodPage(wod: BenchmarkWod): string {
  const others = BENCHMARK_WODS.filter(other => other.slug !== wod.slug);
  const body = `<article class="wod">
<p class="eyebrow">${wod.family === 'Hero' ? 'Hero WOD' : 'Benchmark WOD'} · ${escapeHtml(wod.scoring)}</p>
<h1>${escapeHtml(wod.name)}</h1>
<p class="scheme">${escapeHtml(wod.scheme)}</p>
<p class="about">${escapeHtml(wod.about)}</p>

<section class="card" aria-labelledby="rx">
<h2 id="rx" class="eyebrow">The workout</h2>
${list(wod.movements, 'movements')}
${wod.standards.length > 0 ? `<h3 class="eyebrow sub">Rx standards · women / men</h3>${list(wod.standards, 'standards')}` : '<p class="note">Bodyweight only.</p>'}
<h3 class="eyebrow sub">How it's scored</h3>
<p class="note">${escapeHtml(wod.scoredBy)}</p>
</section>

<section class="frame" aria-labelledby="frame">
<h2 id="frame">Frame your ${escapeHtml(wod.name)}<span class="dot">.</span></h2>
<p>Snap the board at your box. wodi reads it, asks how it went, remembers your time for next time — and turns it into a poster like this one.</p>
${samplePoster(wod)}
<a class="cta" href="/">Get started with wodi</a>
</section>

<nav class="more" aria-labelledby="more">
<h2 id="more" class="eyebrow">More benchmark WODs</h2>
<ul class="chips">${others.map(other => `<li><a href="${wodPath(other)}">${escapeHtml(other.name)}</a></li>`).join('')}</ul>
</nav>
</article>`;

  return shell({
    title: `${wod.name} Workout — ${wod.scheme.replace(/ – /g, '-')}: ${wod.movements.join(', ')} | wodi`,
    description: wodDescription(wod),
    path: wodPath(wod),
    body,
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'ExercisePlan',
      name: wod.name,
      url: `${SITE_URL}${wodPath(wod)}`,
      description: wodDescription(wod),
      exerciseType: 'CrossFit',
    },
  });
}

export function renderWodIndex(): string {
  const groups: { title: string; wods: BenchmarkWod[] }[] = [
    { title: 'The Girls', wods: BENCHMARK_WODS.filter(wod => wod.family === 'Girl') },
    { title: 'Hero WODs', wods: BENCHMARK_WODS.filter(wod => wod.family === 'Hero') },
  ];
  const body = `<article class="wod">
<p class="eyebrow">CrossFit benchmarks</p>
<h1>Benchmark WODs</h1>
<p class="about">The workouts every box comes back to. What each one is, the Rx standards, and how it's scored — then snap the board and let wodi frame your result.</p>
${groups.map(group => `<section class="group" aria-label="${escapeHtml(group.title)}">
<h2 class="eyebrow">${escapeHtml(group.title)}</h2>
<ul class="index">${group.wods.map(wod => `<li><a href="${wodPath(wod)}"><span class="indexName">${escapeHtml(wod.name)}</span><span class="indexLine">${escapeHtml(wod.scheme)} · ${escapeHtml(wod.movements.join(', '))}</span></a></li>`).join('')}</ul>
</section>`).join('\n')}
<a class="cta" href="/">Get started with wodi</a>
</article>`;

  return shell({
    title: 'CrossFit Benchmark WODs — Fran, Murph, Cindy, Grace & more | wodi',
    description: 'The classic CrossFit benchmark workouts — Fran, Grace, Helen, Cindy, Murph, DT and more — with Rx standards and scoring. Snap the board and wodi turns your result into a poster.',
    path: '/wods/',
    body,
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: 'CrossFit Benchmark WODs',
      url: `${SITE_URL}/wods/`,
    },
  });
}

export function buildSitePages(): SitePage[] {
  return [
    { fileName: 'wods/index.html', path: '/wods/', html: renderWodIndex() },
    ...BENCHMARK_WODS.map(wod => ({ fileName: `wods/${wod.slug}/index.html`, path: wodPath(wod), html: renderWodPage(wod) })),
  ];
}

export function renderSitemap(pages: readonly SitePage[]): string {
  const paths = ['/', '/privacy.html', '/terms.html', ...pages.map(page => page.path)];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${paths.map(path => `  <url><loc>${SITE_URL}${path}</loc></url>`).join('\n')}
</urlset>
`;
}

/** Writes the workout pages and the sitemap into the build. */
export function wodPages(): Plugin {
  return {
    name: 'wodi-wod-pages',
    apply: 'build',
    generateBundle() {
      const pages = buildSitePages();
      for (const page of pages) {
        this.emitFile({ type: 'asset', fileName: page.fileName, source: page.html });
      }
      this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: renderSitemap(pages) });
    },
  };
}
