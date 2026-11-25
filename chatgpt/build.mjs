import { build } from 'esbuild';
import { mkdir, writeFile, copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';
await mkdir('dist', { recursive: true });
await build({ entryPoints: ['src/server.ts'], outfile: 'dist/server.mjs', bundle: true, platform: 'node', format: 'esm', packages: 'external' });
await build({ entryPoints: ['test/workflow.e2e.ts'], outfile: 'dist/workflow.e2e.mjs', bundle: true, platform: 'node', format: 'esm', packages: 'external' });
await build({ entryPoints: ['test/oauth.e2e.ts'], outfile: 'dist/oauth.e2e.mjs', bundle: true, platform: 'node', format: 'esm', packages: 'external' });
await build({ entryPoints: ['test/renderer.test.ts'], outfile: 'dist/renderer.test.mjs', bundle: true, platform: 'node', format: 'esm', packages: 'external' });
await build({ entryPoints: ['test/boardFlow.test.ts'], outfile: 'dist/boardFlow.test.mjs', bundle: true, platform: 'node', format: 'esm', packages: 'external' });
await mkdir('dist/fixtures', { recursive: true });
await copyFile('test/fixtures/board-20261119.json', 'dist/fixtures/board-20261119.json');
await build({ entryPoints: ['src/render.tsx'], outfile: 'dist/render.js', bundle: true, platform: 'browser', format: 'esm', jsx: 'automatic',
  alias: { react: resolve('../node_modules/react'), 'react-dom': resolve('../node_modules/react-dom') },
  plugins: [{ name: 'render-profile', setup(b) {
    b.onResolve({ filter: /context\/AuthContext$/ }, () => ({ path: new URL('./src/renderProfile.ts', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') }));
  } }],
  define: { 'process.env.NODE_ENV': '"production"' }, loader: { '.woff2': 'dataurl', '.woff': 'dataurl' }
});
const widget = await build({ entryPoints: ['src/widget.ts'], bundle: true, platform: 'browser', format: 'esm', write: false });
await writeFile('dist/widget.html', `<!doctype html><html><head><meta charset="utf-8"></head><body><main id="posters" aria-label="Wodi workout posters"></main><script type="module">${widget.outputFiles[0].text.replace(/<\/script/gi, '<\\/script')}</script></body></html>`);
// Wodi's answer card: the app's own chat controls (React + CSS modules + fonts), inlined into one page.
const card = await build({ entryPoints: ['src/boardCard.tsx'], outdir: 'dist/board-card', bundle: true, platform: 'browser', format: 'esm', jsx: 'automatic', write: false, minify: true,
  alias: { react: resolve('../node_modules/react'), 'react-dom': resolve('../node_modules/react-dom') },
  // woff2 only: every browser ChatGPT runs in reads it, and the .woff fallbacks would double the card.
  define: { 'process.env.NODE_ENV': '"production"' }, loader: { '.woff2': 'dataurl', '.woff': 'empty' },
});
const cardFile = (ext) => card.outputFiles.find((f) => f.path.endsWith(ext))?.text ?? '';
await writeFile('dist/board-card.html', `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;background:transparent}${cardFile('.css').replace(/<\/style/gi, '<\\/style')}</style></head><body><div id="root"></div><script type="module">${cardFile('.js').replace(/<\/script/gi, '<\\/script')}</script></body></html>`);
await build({ entryPoints: ['src/connect.ts'], outfile: 'dist/connect.js', bundle: true, platform: 'browser', format: 'esm', loader: { '.woff2': 'dataurl', '.woff': 'dataurl' } });
await copyFile('src/connect.html', 'dist/connect.html');
await copyFile('../public/privacy.html', 'dist/privacy.html');
await copyFile('../public/terms.html', 'dist/terms.html');
await copyFile('../public/legal.css', 'dist/legal.css');
