import { defineConfig } from 'vitest/config'

// Node 25+ defines a global `localStorage` that is undefined without
// --localstorage-file. Vitest 4 skips DOM keys already present on the global,
// so it hides happy-dom's storage. Disable Node's Web Storage where this Node
// supports the flag; Vitest 5 overrides it itself, so remove this after upgrading.
const execArgv = process.allowedNodeEnvironmentFlags.has('--no-experimental-webstorage')
  ? ['--no-experimental-webstorage']
  : []

// Unit tests only. Playwright end-to-end specs live in ./e2e and are run by
// `npm run test:e2e`, not Vitest — exclude them here so Vitest doesn't try to
// load @playwright/test (which throws outside the Playwright runner).
export default defineConfig({
  test: {
    include: ['src/__tests__/**/*.{test,spec}.{js,mjs,cjs}'],
    execArgv,
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
    server: {
      deps: {
        external: [/\/api\/src\/schema\//],
      },
    },
  },
})
