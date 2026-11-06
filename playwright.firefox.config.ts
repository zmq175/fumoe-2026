import { defineConfig, devices } from '@playwright/test'
import base from './playwright.config'

// Cross-browser login checks; challenge responses remain deterministic mocks.
export default defineConfig({
  ...base,
  outputDir: 'test-results-firefox',
  projects: [{ name: 'firefox', use: { ...devices['Desktop Firefox'], launchOptions: {} } }]
})
