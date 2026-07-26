import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import pkg from './package.json' with { type: 'json' }

// Stamped once per build (this config is evaluated at build time), so the deployed
// bundle carries the exact moment it was built. main.tsx logs it on startup — the
// quickest way to confirm which build is actually live in the browser.
const BUILD_TIME = new Date().toISOString()

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __BUILD_TIME__: JSON.stringify(BUILD_TIME),
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
})
