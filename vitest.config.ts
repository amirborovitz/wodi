import { defineConfig } from 'vitest/config'

// Unit-test runner for the pure calc layer (EP, workload, stats aggregation).
// Kept separate from vite.config.ts so app-build config and test config don't entangle.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // The calc functions are pure; no DOM/browser globals needed.
  },
})
