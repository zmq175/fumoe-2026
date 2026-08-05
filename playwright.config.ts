import { defineConfig, devices } from '@playwright/test'

const executablePath=process.env.PLAYWRIGHT_EXECUTABLE_PATH
const port=process.env.PLAYWRIGHT_PORT??'4173'
const baseURL=`http://127.0.0.1:${port}`

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL, trace: 'on-first-retry' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'],launchOptions:executablePath?{executablePath}:undefined } }],
  webServer: { command: `npm run build && npm run preview -- --host 127.0.0.1 --port ${port}`, url: baseURL, reuseExistingServer: !process.env.CI, timeout: 120_000, env: { ...process.env, VITE_TURNSTILE_SITE_KEY: 'e2e-test-site-key' } }
})
