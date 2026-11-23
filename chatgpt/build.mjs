import { build } from 'esbuild';
import { createGenerator } from 'ts-json-schema-generator';
import { mkdir, writeFile, copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';
await mkdir('dist', { recursive: true });
const schema = createGenerator({ path: 'src/contracts.ts', tsconfig: 'tsconfig.json', type: 'WorkoutLog', skipTypeCheck: true }).createSchema('WorkoutLog');
await writeFile('dist/log-schema.json', JSON.stringify(schema));
await build({ entryPoints: ['src/server.ts'], outfile: 'dist/server.mjs', bundle: true, platform: 'node', format: 'esm', packages: 'external' });
await build({ entryPoints: ['test/workflow.e2e.ts'], outfile: 'dist/workflow.e2e.mjs', bundle: true, platform: 'node', format: 'esm', packages: 'external' });
await build({ entryPoints: ['test/oauth.e2e.ts'], outfile: 'dist/oauth.e2e.mjs', bundle: true, platform: 'node', format: 'esm', packages: 'external' });
await build({ entryPoints: ['test/renderer.test.ts'], outfile: 'dist/renderer.test.mjs', bundle: true, platform: 'node', format: 'esm', packages: 'external' });
await build({ entryPoints: ['src/render.tsx'], outfile: 'dist/render.js', bundle: true, platform: 'browser', format: 'esm', jsx: 'automatic',
  alias: { react: resolve('../node_modules/react'), 'react-dom': resolve('../node_modules/react-dom') },
  plugins: [{ name: 'render-profile', setup(b) {
    b.onResolve({ filter: /context\/AuthContext$/ }, () => ({ path: new URL('./src/renderProfile.ts', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') }));
  } }],
  define: { 'process.env.NODE_ENV': '"production"' }, loader: { '.woff2': 'dataurl', '.woff': 'dataurl' }
});
const widget = await build({ entryPoints: ['src/widget.ts'], bundle: true, platform: 'browser', format: 'esm', write: false });
await writeFile('dist/widget.html', `<!doctype html><html><head><meta charset="utf-8"></head><body><main id="posters" aria-label="Wodi workout posters"></main><script type="module">${widget.outputFiles[0].text.replace(/<\/script/gi, '<\\/script')}</script></body></html>`);
await build({ entryPoints: ['src/connect.ts'], outfile: 'dist/connect.js', bundle: true, platform: 'browser', format: 'esm', loader: { '.woff2': 'dataurl', '.woff': 'dataurl' } });
await copyFile('src/connect.html', 'dist/connect.html');
await copyFile('../public/privacy.html', 'dist/privacy.html');
await copyFile('../public/terms.html', 'dist/terms.html');
await copyFile('../public/legal.css', 'dist/legal.css');
