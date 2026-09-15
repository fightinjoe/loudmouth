import { readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, devices } from '@playwright/test'

function readLocalPort() {
  let contents
  try {
    contents = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '.env.local'),
      'utf8',
    )
  } catch (error) {
    if (error.code === 'ENOENT') return undefined
    throw error
  }

  return parseEnv(contents).PLAYWRIGHT_PORT
}

function parsePort(value) {
  const candidate = value ?? '4173'
  if (!/^[1-9]\d*$/.test(candidate)) {
    throw new Error('PLAYWRIGHT_PORT must be an integer from 1 to 65535')
  }

  const port = Number(candidate)
  if (port > 65535) {
    throw new Error('PLAYWRIGHT_PORT must be an integer from 1 to 65535')
  }
  return port
}

const PORT = parsePort(process.env.PLAYWRIGHT_PORT ?? readLocalPort())
const BASE_URL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  projects: [
    // Mobile viewport — the app is mobile-first (audio is mobile-only).
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
  ],
  // Build once, serve the production bundle. Testing the built app (not the
  // dev server) matches what ships and catches build-only issues.
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
