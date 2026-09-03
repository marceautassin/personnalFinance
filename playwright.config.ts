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

/**
 * Port du serveur de dev sous test. Configurable, parce que `3000` est un port très disputé :
 * quand un autre projet l'occupe, `reuseExistingServer` réutilise SILENCIEUSEMENT ce serveur
 * étranger et toutes les specs échouent en « element(s) not found », sans que rien n'indique
 * que l'app testée n'a jamais démarré (constaté le 2026-09-04, port pris par un autre projet).
 */
const PORT = Number(process.env.E2E_PORT ?? 3000)
const BASE_URL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    /**
     * Disclaimer (G1) déjà acquitté. Il est rendu en `<dialog>.showModal()` APRÈS hydratation :
     * tant qu'il est ouvert, il intercepte tous les clics de la page. Le flag vit en
     * `localStorage`, donc il réapparaissait dans chaque contexte Playwright neuf.
     *
     * Six specs ne l'acquittaient pas (`debts`, `fixed-charges`, `forecast`, `parametres`,
     * `revenues`, `sas`) et ne passaient que par chance de timing ; les six échouaient au
     * 2026-09-04. Les six autres le faisaient à la main, chacune sa copie. Le pré-remplir ici
     * supprime la course pour toutes les specs, y compris celles à venir.
     *
     * Une spec qui voudrait tester le disclaimer lui-même doit remettre l'état à zéro avec
     * `test.use({ storageState: { cookies: [], origins: [] } })`.
     */
    storageState: {
      cookies: [],
      origins: [
        {
          origin: BASE_URL,
          localStorage: [{ name: 'pf_disclaimer_seen_v1', value: '1' }],
        },
      ],
    },
  },
  // Chromium seul : cf. PRD §Browser Matrix, amendée le 2026-09-04.
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  ...(hasE2ESpecs() && {
    webServer: {
      command: `yarn dev --port ${PORT}`,
      url: BASE_URL,
      reuseExistingServer: !process.env.CI,
      stdout: 'ignore',
      stderr: 'pipe',
    },
  }),
})
