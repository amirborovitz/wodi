import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import pkg from './package.json' with { type: 'json' }

// Stamped once per build (this config is evaluated at build time), so the deployed
// bundle carries the exact moment it was built. main.tsx logs it on startup — the
// quickest way to confirm which build is actually live in the browser.
const BUILD_TIME = new Date().toISOString()

// The same stamp, written to a tiny always-revalidated file next to index.html.
// This is what lets a RUNNING app notice it has gone stale: the bundle knows the
// build it was compiled from, and /version.json says which build is live. An
// installed iOS PWA has no reload gesture of its own — standalone mode removes
// Safari's chrome, and with it pull-to-refresh — so without this pair there is
// no way for the app to find out a new version exists.
function versionManifest(): Plugin {
  return {
    name: 'wodi-version-manifest',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ version: pkg.version, buildTime: BUILD_TIME }),
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), versionManifest()],
  define: {
    __BUILD_TIME__: JSON.stringify(BUILD_TIME),
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
})
