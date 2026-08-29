import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { loadMovementRegistry } from './services/movementRegistryService'

// Warm the movement registry at boot. Importing the service already installs the
// bundled seed synchronously, so this only upgrades it to the Firestore copy —
// nothing waits on it, and a failure leaves the seed in place.
void loadMovementRegistry()

// __BUILD_TIME__ / __APP_VERSION__ are injected at build time by vite.config.ts.
// The stamp is UTC ISO (useAppVersion compares it against /version.json verbatim),
// so it stays ISO there and is rendered in the reader's own timezone only here.
const buildStamp = new Date(__BUILD_TIME__)
const localBuildTime = Number.isNaN(buildStamp.getTime())
  ? __BUILD_TIME__
  : buildStamp.toLocaleString()
const WODI_BUILD_ID = `v${__APP_VERSION__} · built ${localBuildTime}`

declare global {
  interface Window {
    __WODI_BUILD_ID__?: string
  }
}

console.warn(`%c[WODI BUILD] ${WODI_BUILD_ID}`, 'font-weight:bold;color:#f5c200')

if (typeof window !== 'undefined') {
  window.__WODI_BUILD_ID__ = WODI_BUILD_ID
  document.title = 'wodi'
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
