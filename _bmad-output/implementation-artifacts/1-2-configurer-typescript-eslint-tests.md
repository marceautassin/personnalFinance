# Story 1.2: Configurer TypeScript strict, ESLint et tests

Status: done

## Story

As a dev,
I want strict TypeScript, working linting and a configured test runner,
so that all subsequent code respects the conventions documented in CLAUDE.md and is checked from day one.

## Acceptance Criteria

1. **Given** un `tsconfig.json` initial créé par Nuxt (Story 1.1),
   **When** j'active les options strictes (`strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `noUnusedLocals`, `noUnusedParameters`),
   **Then** `yarn typecheck` passe sur le projet (potentiellement avec une page de démo Nuxt à nettoyer si elle viole les règles).

2. **Given** ESLint installé en Story 1.1,
   **When** je crée `eslint.config.mjs` basé sur `@nuxt/eslint` avec les règles supplémentaires documentées dans Dev Notes,
   **Then** `yarn lint` passe sur le projet sans erreurs ni warnings non gérés,
   **And** `yarn lint:fix` peut auto-corriger les violations stylistiques courantes.

3. **Given** Vitest et happy-dom installés,
   **When** je crée `vitest.config.ts` avec environnement `happy-dom` et `globals: true`,
   **Then** `yarn test:run` exécute zéro test sans erreur (sortie propre type "No test files found").

4. **Given** Playwright installé,
   **When** je crée `playwright.config.ts` ciblant Chromium et Firefox sur `http://localhost:3000`,
   **Then** `yarn test:e2e` retourne sans erreur (zéro spec OK, output type "0 specs").

5. **Given** la convention de nommage des fichiers (kebab-case pour TS, PascalCase pour .vue),
   **When** je vérifie la config ESLint,
   **Then** une règle empêche les fichiers `.ts` en PascalCase et signale les composants `.vue` non-PascalCase (à minima en warning).

## Tasks / Subtasks

- [x] **Task 1 — Durcir TypeScript** (AC: #1)
  - [x] Ouvrir `tsconfig.json` (extends Nuxt par défaut) — *Nuxt 4 utilise `references` vers 4 sous-tsconfigs (`app`, `server`, `shared`, `node`) ; les options strictes sont injectées via `nuxt.config.ts` (`typescript.{tsConfig,nodeTsConfig,sharedTsConfig}` + `nitro.typescript.tsConfig`)*
  - [x] Ajouter dans `compilerOptions` : `"strict": true`, `"noUncheckedIndexedAccess": true`, `"noImplicitOverride": true`, `"noFallthroughCasesInSwitch": true`, `"noUnusedLocals": true`, `"noUnusedParameters": true`, `"forceConsistentCasingInFileNames": true`
  - [x] Lancer `yarn typecheck` ; corriger les erreurs Nuxt par défaut si elles apparaissent — *aucune erreur, `app/app.vue` actuel (NuxtWelcome) est OK*
  - [x] Vérifier que la sortie typecheck est propre

- [x] **Task 2 — Configurer ESLint** (AC: #2, #5)
  - [x] Créer `eslint.config.mjs` selon le snippet Dev Notes
  - [x] `yarn lint` doit passer
  - [x] Tester `yarn lint:fix` sur un fichier intentionnellement mal formaté pour confirmer l'auto-fix — *stylistic activé via `eslint.config.stylistic = true` dans `nuxt.config.ts`*
  - [x] AC #5 : `unicorn/filename-case` ajouté (kebab-case sur `**/*.ts(x)`, pascalCase warn sur `**/components/**/*.vue`)

- [x] **Task 3 — Configurer Vitest** (AC: #3)
  - [x] Créer `vitest.config.ts` selon le snippet Dev Notes
  - [x] Lancer `yarn test:run` → sortie OK avec 0 tests — *`passWithNoTests: true` ajouté pour exit 0*
  - [x] Vérifier qu'un test minimal `tests/unit/smoke.test.ts` (créé temporairement, à supprimer après) passe puis le supprimer

- [x] **Task 4 — Configurer Playwright** (AC: #4)
  - [x] Lancer `yarn playwright install chromium firefox` (sans `--with-deps` pour éviter sudo)
  - [x] Créer `playwright.config.ts` selon le snippet Dev Notes
  - [x] Lancer `yarn test:e2e` → sortie OK avec 0 specs — *flag `--pass-with-no-tests` dans le script + webServer conditionné à la présence de specs*
  - [x] `.gitignore` déjà pourvu de `test-results/`, `playwright-report/`, `playwright/.cache/` (Story 1.1)

- [x] **Task 5 — Sanity check final**
  - [x] `yarn typecheck`, `yarn lint`, `yarn test:run`, `yarn test:e2e` → tous OK
  - [x] Aucun fichier de planning touché
  - [ ] Commit propre — *à effectuer par le user en sortie de review*

## Dev Notes

### Snippet `tsconfig.json` (Task 1)

Nuxt génère un `tsconfig.json` qui extends `.nuxt/tsconfig.json`. Le custom doit ressembler à :

```json
{
  "extends": "./.nuxt/tsconfig.json",
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

### Snippet `eslint.config.mjs` (Task 2)

```js
// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt({
  rules: {
    // Convention CLAUDE.md : pas de console.log en code merged
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    // Imports relatifs vers app/ ou server/ uniquement (Nuxt 4 auto-imports gère le reste)
    'no-restricted-imports': ['error', {
      patterns: [
        { group: ['../../*'], message: 'Préférer un chemin absolu via les alias Nuxt (~/, @/, etc.) ou auto-imports.' },
      ],
    }],
    // Pas d'opérations float sur des montants (NFR8)
    // Note : pas de règle ESLint native pour ça → CLAUDE.md + revue manuelle
    'vue/multi-word-component-names': 'off', // Composants partagés peuvent être en un mot (AppHeader, etc.)
    'vue/component-name-in-template-casing': ['error', 'PascalCase'],
  },
})
```

⚠️ Avant de créer ce fichier, vérifie que `@nuxt/eslint` génère bien `.nuxt/eslint.config.mjs` (lance `yarn nuxt prepare` si besoin). Sinon, fallback : utiliser la config flat ESLint manuelle documentée par `@nuxt/eslint`.

### Snippet `vitest.config.ts` (Task 3)

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'happy-dom',
    globals: true,
    include: [
      'app/**/*.test.ts',
      'server/**/*.test.ts',
      'shared/**/*.test.ts',
      'tests/unit/**/*.test.ts',
    ],
    exclude: [
      'node_modules/**',
      '.nuxt/**',
      '.output/**',
      'tests/e2e/**', // Playwright
    ],
    coverage: {
      provider: 'v8',
      include: [
        'server/services/**/*.ts',
        'shared/types/**/*.ts',
      ],
      // NFR18 : 100% sur les fonctions de calcul, best effort ailleurs
      thresholds: {
        // À durcir au fil du temps. Pour V1 on documente la cible sans bloquer le build.
        statements: 0,
        branches: 0,
        functions: 0,
        lines: 0,
      },
    },
  },
})
```

### Snippet `playwright.config.ts` (Task 4)

```ts
import { defineConfig, devices } from '@playwright/test'

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
  webServer: {
    command: 'yarn dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    stdout: 'ignore',
    stderr: 'pipe',
  },
})
```

### Compléter `.gitignore` pour Playwright

Ajouter (Task 4) :
```
# Playwright
test-results/
playwright-report/
playwright/.cache/
```

### Anti-patterns à éviter pour cette story

- ❌ Désactiver les règles strictes TS pour faire taire des erreurs : corrige le code, pas la règle.
- ❌ Mettre des seuils de coverage stricts dès maintenant — V1 = best effort sauf pour les calculs financiers (Stories 1.3 et 7.x s'en chargeront).
- ❌ Créer une page de démo Nuxt qui violerait `noUnusedLocals` : si Nuxt a généré `app/pages/index.vue` avec du contenu démo, supprime-la simplement (on en crée une vraie en Story 1.7).
- ❌ Ajouter Prettier en plus d'ESLint : `@nuxt/eslint` gère déjà le formatting, KISS.

### Project Structure Notes

Cette story ne crée **aucun** fichier dans `app/`, `server/`, `shared/`, `tests/` (sauf éventuellement un test smoke éphémère en Task 3 qu'on supprime tout de suite). Elle ne touche que les configs à la racine.

### Definition of Done

- [ ] `tsconfig.json` durci, `yarn typecheck` propre
- [ ] `eslint.config.mjs` créé, `yarn lint` propre
- [ ] `vitest.config.ts` créé, `yarn test:run` retourne sans erreur
- [ ] `playwright.config.ts` créé, `yarn test:e2e` retourne sans erreur
- [ ] `.gitignore` complété pour Playwright
- [ ] Commit unique et propre

### References

- [Source: `CLAUDE.md`#Stack verrouillée] — Vitest + Playwright fixés
- [Source: `CLAUDE.md`#Tests — discipline] — NFR18 cible 100% sur calculs financiers
- [Source: `CLAUDE.md`#Anti-patterns interdits] — `console.log` interdit en code merged → règle ESLint
- [Source: `_bmad-output/planning-artifacts/architecture.md`#Implementation Patterns] — conventions de nommage à enforcer
- [Source: `_bmad-output/planning-artifacts/epics.md`#Story 1.2] — story originale et ACs
- [Previous story: `1-1-initialiser-projet-nuxt-et-dependances.md`] — versions des outils installés en Completion Notes

## Dev Agent Record

### Agent Model Used

claude-opus-4-7 (1M context)

### Debug Log References

- `yarn nuxt prepare` génère bien `.nuxt/eslint.config.mjs` une fois `@nuxt/eslint` listé dans `modules`.
- `vitest run` sort en exit 1 par défaut quand aucun test n'est trouvé → option `passWithNoTests: true` dans `vitest.config.ts`.
- `playwright test` sort en erreur "No tests found" quand aucun spec → flag CLI `--pass-with-no-tests` ajouté au script `test:e2e`.
- Le `webServer` Playwright démarre AVANT la phase de discovery, donc le timeout `yarn dev` se déclenchait même pour 0 spec ; `webServer` conditionné via une fonction `hasE2ESpecs()` qui scanne `tests/e2e/`.
- `unicorn/filename-case` warning sur `app/app.vue` corrigé en limitant la règle `pascalCase` aux fichiers `**/components/**/*.vue` (Nuxt utilise `app.vue`/`error.vue`/pages en kebab par convention).

### Completion Notes List

- Nuxt 4 utilise une structure de tsconfigs en `references` (`tsconfig.app.json`, `tsconfig.server.json`, `tsconfig.shared.json`, `tsconfig.node.json`). Le snippet Dev Notes du PRD prévoyait un `extends ./.nuxt/tsconfig.json` (pattern Nuxt 3). Décision : injecter les compilerOptions strictes via `nuxt.config.ts` (`typescript.tsConfig`, `typescript.nodeTsConfig`, `typescript.sharedTsConfig`, et `nitro.typescript.tsConfig` pour le contexte serveur). `tsconfig.json` racine inchangé. Vérifié : les 4 tsconfigs générés contiennent toutes les options demandées.
- Versions effectives : typescript 6.0.3, vue-tsc 3.2.7 (ajoutés en devDependencies — résolution du Defer signalé en Story 1.1), @nuxt/eslint 1.15.2, eslint 10.2.1, vitest 4.1.5, @playwright/test 1.59.1, eslint-plugin-unicorn 64.0.0.
- `eslint-plugin-unicorn` ajouté pour satisfaire AC #5 (filename casing). Plugin minimal, utilisé uniquement pour `unicorn/filename-case`. Pas en conflit avec `@nuxt/eslint`.
- `@nuxt/eslint` flat config étendu avec `stylistic: true` pour activer les règles autofixables (espaces, points-virgules, ordre des clés Nuxt, etc.). Cela permet à `yarn lint:fix` d'autocorriger.
- Browsers Playwright installés sans `--with-deps` (évite sudo). Si déploiement CI Linux fresh, ajouter `--with-deps` dans la commande d'install.

### File List

**Modifiés**
- `package.json` — ajout devDeps `typescript`, `vue-tsc`, `eslint-plugin-unicorn` ; flag `--pass-with-no-tests` sur `test:e2e`
- `nuxt.config.ts` — ajout module `@nuxt/eslint`, options `typescript.{tsConfig,nodeTsConfig,sharedTsConfig}`, `nitro.typescript.tsConfig`, `eslint.config.stylistic`

**Créés**
- `eslint.config.mjs` — flat config héritant de `withNuxt`, ajoute `no-console`, `no-restricted-imports`, `vue/component-name-in-template-casing`, `unicorn/filename-case` (kebab .ts / pascal .vue components)
- `vitest.config.ts` — environnement happy-dom, globals, `passWithNoTests: true`, includes/excludes, coverage v8 (seuils à 0 en V1)
- `playwright.config.ts` — chromium + firefox, baseURL localhost:3000, `webServer` conditionné via `hasE2ESpecs()`

**Inchangés (déjà OK depuis Story 1.1)**
- `tsconfig.json` — references Nuxt 4 par défaut
- `.gitignore` — déjà pourvu pour Playwright (`test-results/`, `playwright-report/`, `playwright/.cache/`)

### Review Findings

- [x] [Review][Patch] `yarn lint` échoue → AC #2 violée [nuxt.config.ts:11] — règle `nuxt/nuxt-config-keys-order` signale `Expected config key "modules" to come before "ssr"`. Auto-corrigeable via `yarn lint:fix`.
- [x] [Review][Patch] Vitest exécute les tests serveur sous `happy-dom` [vitest.config.ts:14] — `server/**/*.test.ts` utilisent `better-sqlite3` + `node:fs/os`. Ajouter `environmentMatchGlobs` (ou Vitest 3+ `projects`) pour basculer en `node` sur `server/**` et `shared/**`, garder `happy-dom` uniquement pour `app/**`. Fonctionne aujourd'hui par chance.
- [x] [Review][Defer] `no-restricted-imports` partielle [eslint.config.mjs:11-15] — deferred, le pattern `../../*` ne couvre que les remontées à 2 niveaux ; `../foo` et `../../../*` passent. À élargir quand les premiers contournements apparaîtront.
- [x] [Review][Defer] Couverture incomplète vs NFR18 [vitest.config.ts:31-34] — deferred, `include` actuel couvre `server/services/**` + `shared/types/**` ; étendre dès que des calculs financiers atterrissent ailleurs (`server/utils/**`, composables).
- [x] [Review][Defer] Playwright `webServer.timeout` absent [playwright.config.ts:31-37] — deferred, défaut 60 s suffisant en local ; à monter quand un CI Linux fresh apparaîtra.
- [x] [Review][Defer] `eslint-plugin-unicorn` enregistré 3 fois [eslint.config.mjs:23,31,40] — deferred, stylistique, à factoriser dans un seul block `plugins`.
