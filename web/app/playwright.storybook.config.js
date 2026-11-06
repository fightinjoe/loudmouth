import { defineConfig, devices } from '@playwright/test'

const value = process.env.STORYBOOK_TEST_PORT ?? '6007'
if (!/^[1-9]\d*$/.test(value) || Number(value) > 65535) {
  throw new Error('STORYBOOK_TEST_PORT must be an integer from 1 to 65535')
}
const port = Number(value)
const baseURL = `http://localhost:${port}`

export default defineConfig({
  testDir: './e2e/storybook',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 60_000,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL, serviceWorkers: 'block', trace: 'retain-on-failure' },
  projects: [
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
    { name: 'desktop-chromium', use: { browserName: 'chromium', viewport: { width: 1280, height: 900 } } },
  ],
  webServer: {
    command: `npm run build-storybook && npm run preview -- --config .storybook/vite.config.ts --outDir storybook-static --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 180_000,
  },
})
