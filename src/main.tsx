import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

const WODI_BUILD_ID = '2026-05-29-poster-whiteboard-v9'

declare global {
  interface Window {
    __WODI_BUILD_ID__?: string
  }
}

console.warn(`[WODI BUILD] ${WODI_BUILD_ID}`)
console.log('APP LOADED', { build: WODI_BUILD_ID, loadedAt: new Date().toISOString() })

if (typeof window !== 'undefined') {
  window.__WODI_BUILD_ID__ = WODI_BUILD_ID
  document.title = 'wodi'
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
