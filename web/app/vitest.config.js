import { defineConfig } from 'vitest/config'

// Unit tests only. Playwright end-to-end specs live in ./e2e and are run by
// `npm run test:e2e`, not Vitest — exclude them here so Vitest doesn't try to
// load @playwright/test (which throws outside the Playwright runner).
export default defineConfig({
  test: {
    include: ['src/__tests__/**/*.{test,spec}.{js,mjs,cjs}'],
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
  },
})
