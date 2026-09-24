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
 *
 * **Une seule vraie recréation par run** (revue de la story 27.3, SUGGESTION 5). Ce module est
 * importé DEUX FOIS dans le même run — une fois par le processus principal de Playwright, une
 * fois par le worker, qui hérite de `process.env` — et un `prepareE2eDatabase()` sans garde
 * recrée le fichier une seconde fois PENDANT que le `webServer` (démarré une seule fois, par le
 * processus principal) tient déjà une connexion dessus : la base sur disque paraît alors vierge
 * après coup alors que le serveur, lui, continue d'écrire dans le fichier qu'il avait ouvert.
 * Sans impact fonctionnel connu (le serveur ne relit jamais le fichier depuis le disque), mais
 * trompeur pour tout diagnostic « qu'y a-t-il en base après un run ». Le drapeau ci-dessous fait
 * de la première recréation la SEULE ; la seconde importation réutilise le même chemin.
 */
const E2E_DATABASE_URL = hasE2ESpecs()
  ? (process.env.PF_E2E_DB_PREPARED ? process.env.E2E_DATABASE_URL! : prepareE2eDb())
  : ''

function prepareE2eDb(): string {
  const path = prepareE2eDatabase()
  process.env.PF_E2E_DB_PREPARED = '1'
  process.env.E2E_DATABASE_URL = path
  return path
}

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
      /**
       * JAMAIS de réutilisation, même en local.
       *
       * `!process.env.CI` réutilisait silencieusement un `yarn dev` déjà lancé — donc un
       * serveur pointant sur la base de TRAVAIL — pendant que `prepareE2eDatabase()` recréait
       * `_data/e2e.db` pour rien. Les specs, qui créent et suppriment des postes, écrivaient
       * dans les vraies données : exactement le défaut que la base dédiée devait supprimer
       * (revue du 2026-09-05). Le coût est un démarrage de serveur par exécution ; le bénéfice
       * est qu'aucune exécution ne peut plus toucher les données de l'utilisateur.
       */
      reuseExistingServer: false,
      stdout: 'ignore',
      stderr: 'pipe',
    },
  }),
})
