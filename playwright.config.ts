import { existsSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { defineConfig, devices } from '@playwright/test'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Évite de lancer `yarn dev` quand il n'y a pas encore de spec à exécuter.
function hasE2ESpecs(): boolean {
  const dir = resolve(__dirname, 'tests/e2e')
  if (!existsSync(dir)) return false
  return readdirSync(dir, { recursive: true })
    .some(f => typeof f === 'string' && (f.endsWith('.spec.ts') || f.endsWith('.spec.js')))
}

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  ],
  ...(hasE2ESpecs() && {
    webServer: {
      command: 'yarn dev',
      url: 'http://localhost:3000',
      reuseExistingServer: !process.env.CI,
      stdout: 'ignore',
      stderr: 'pipe',
    },
  }),
})
