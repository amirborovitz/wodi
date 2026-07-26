import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// __BUILD_TIME__ / __APP_VERSION__ are injected at build time by vite.config.ts.
const WODI_BUILD_ID = `v${__APP_VERSION__} · built ${__BUILD_TIME__}`

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
