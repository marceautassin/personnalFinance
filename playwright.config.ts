import { existsSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { defineConfig, devices } from '@playwright/test'
import { prepareE2eDatabase } from './tests/e2e/global-setup'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Évite de lancer `yarn dev` quand il n'y a pas encore de spec à exécuter.
function hasE2ESpecs(): boolean {
  const dir = resolve(__dirname, 'tests/e2e')
  if (!existsSync(dir)) return false
  return readdirSync(dir, { recursive: true })
    .some(f => typeof f === 'string' && (f.endsWith('.spec.ts') || f.endsWith('.spec.js')))
}

/**
 * Port du serveur de dev sous test. Volontairement HORS de `3000` : quand un autre projet
 * occupe ce port très disputé, `reuseExistingServer` réutilise SILENCIEUSEMENT ce serveur
 * étranger et toutes les specs échouent en « element(s) not found », sans que rien n'indique
 * que l'app testée n'a jamais démarré (constaté deux fois le 2026-09-04, port pris par l'API
 * d'un autre projet qui répondait `Cannot GET /categories`). Surchargeable via `E2E_PORT`.
 */
const PORT = Number(process.env.E2E_PORT ?? 3178)
const BASE_URL = `http://localhost:${PORT}`

/**
 * Base dédiée aux E2E — jamais celle de travail. Recréée MAINTENANT, au chargement de la
 * config, parce que Playwright lance le `webServer` avant tout `globalSetup`.
 */
const E2E_DATABASE_URL = hasE2ESpecs() ? prepareE2eDatabase() : ''

export default defineConfig({
  testDir: './tests/e2e',
  /**
   * Exécution SÉRIELLE, et c'est structurel : toutes les specs partagent **une seule base
   * SQLite** (celle du serveur de dev). En parallèle, une spec qui crée puis supprime ses
   * données croise celles d'une autre — constaté le 2026-09-04 sur `categories` puis `debts`,
   * qui passaient seules et échouaient en suite, avec des erreurs sans rapport avec leur objet.
   *
   * Le parallélisme ne redeviendra sûr qu'avec une base par worker. En attendant, `workers: 1`
   * coûte quelques secondes et rend la suite fiable — un test rouge redevient un signal.
   */
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  /**
   * Chromium seul, alors que la PRD réécrite place **Chromium ET Firefox** au support V1.
   * Playwright ne fournit pas de binaire Firefox pour `ubuntu26.04-x64` et celui présent sur
   * le poste est corrompu : la couverture automatisée Firefox est impossible ici. Le support
   * reste un engagement produit ; le mode de vérification est à trancher (contrôle manuel,
   * conteneur, ou autre machine).
   */
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  ...(hasE2ESpecs() && {
    webServer: {
      command: `yarn dev --port ${PORT}`,
      // Le serveur sous test lit la base DÉDIÉE, pas `_data/personnalfinance.db`.
      env: { DATABASE_URL: E2E_DATABASE_URL },
      url: BASE_URL,
      reuseExistingServer: !process.env.CI,
      stdout: 'ignore',
      stderr: 'pipe',
    },
  }),
})
