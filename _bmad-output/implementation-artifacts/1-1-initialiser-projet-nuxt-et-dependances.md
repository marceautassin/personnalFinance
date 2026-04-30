# Story 1.1: Initialiser le projet Nuxt 4 et installer les dépendances

Status: done

## Story

As a dev,
I want to bootstrap the Nuxt 4 project with all required dependencies and base configuration,
so that the development environment is ready for feature work and all subsequent stories can start from a sane baseline.

## Acceptance Criteria

1. **Given** un répertoire de projet contenant uniquement les artefacts de planning (`_bmad-output/`, `CLAUDE.md`, `_bmad/`, `.claude/`, `.agents/`, `docs/`),
   **When** j'exécute l'initialisation Nuxt 4 puis `yarn install`,
   **Then** un projet Nuxt 4 est initialisé avec la structure `app/`, `server/`, `nuxt.config.ts`, `tsconfig.json`, `package.json`, `yarn.lock`,
   **And** `yarn dev` lance Nuxt sans erreur sur `http://localhost:3000`,
   **And** les artefacts de planning préexistants ne sont pas écrasés.

2. **Given** un projet Nuxt initialisé,
   **When** j'exécute les commandes `yarn add` listées dans les Dev Notes,
   **Then** toutes les dépendances sont installées sans conflit dans `package.json` et `yarn.lock`,
   **And** `yarn dev` redémarre sans erreur.

3. **Given** les dépendances installées,
   **When** je modifie `nuxt.config.ts` selon le snippet fourni dans les Dev Notes,
   **Then** la configuration est appliquée au prochain `yarn dev` (mode SPA, modules Pinia activé, devtools activé, pas de css par défaut).

4. **Given** le projet configuré,
   **When** je crée `.env.example` (avec `ANTHROPIC_API_KEY=`) et que je m'assure que `.gitignore` contient `_data/`, `.env`, `.output/`, `.nuxt/`, `node_modules/`, `dist/`,
   **Then** ces fichiers sont présents et conformes aux règles documentées dans `CLAUDE.md`.

5. **Given** le projet configuré,
   **When** j'ajoute les scripts npm dans `package.json` selon la liste fournie dans les Dev Notes,
   **Then** chaque commande est disponible (`dev`, `build`, `start`, `db:push`, `db:generate`, `apply-migration`, `db:studio`, `test`, `test:run`, `test:e2e`, `lint`, `lint:fix`, `typecheck`).
   *Note* : `db:*`, `test*`, `lint*`, `typecheck` peuvent retourner des erreurs "outils non installés" à ce stade — c'est acceptable, ils seront fonctionnels après les Stories 1.2 et 1.4 (les scripts doivent simplement être déclarés correctement dans `package.json`).

## Tasks / Subtasks

- [x] **Task 1 — Initialiser Nuxt 4 sans casser les docs existants** (AC: #1)
  - [x] Vérifier l'état du répertoire courant avant init (`ls` pour confirmer la présence de `_bmad-output/`, `CLAUDE.md`, etc.)
  - [x] Choisir la stratégie d'init : Option A — init dans `nuxt-temp/` puis merge à la racine
  - [x] Exécuter l'init Nuxt 4 (`npx nuxi@latest init nuxt-temp --packageManager yarn --no-install --no-gitInit --template minimal`)
  - [x] Vérifier que `_bmad-output/`, `CLAUDE.md`, `_bmad/`, `.claude/`, `.agents/`, `docs/` sont intacts (md5 de `CLAUDE.md` capturé avant/après : `44eb5ba585f34a0687448b610a9675ef` identique)
  - [x] Lancer `yarn install` (113s, succès — `nuxt prepare` exécuté en postinstall)
  - [x] Vérifier que `yarn dev` démarre sur `http://localhost:3000` sans erreur (Nuxt 4.4.4 + Nitro 2.13.4 + Vite 7.3.2 + Vue 3.5.33)

- [x] **Task 2 — Installer les dépendances métier** (AC: #2)
  - [x] Batch 1 runtime : `@pinia/nuxt pinia drizzle-orm better-sqlite3 unpdf @anthropic-ai/sdk zod`
  - [x] `reka-ui` (composants headless)
  - [x] Batch dev : `drizzle-kit @types/better-sqlite3 vitest @vitest/ui happy-dom @playwright/test @nuxt/eslint eslint`
  - [x] Vérifier `yarn dev` redémarre sans erreur (`yarn typecheck` lancé après et passe)

- [x] **Task 3 — Configurer `nuxt.config.ts`** (AC: #3)
  - [x] Remplacé le contenu de `nuxt.config.ts` selon le snippet (ssr:false, devtools, modules pinia, css [], compatibilityDate '2026-01-01')

- [x] **Task 4 — Créer `.env.example` et compléter `.gitignore`** (AC: #4)
  - [x] Créé `.env.example` avec `ANTHROPIC_API_KEY=` + commentaires sur les surcharges optionnelles (DATABASE_URL, PDF_STORAGE_DIR)
  - [x] `.env` réel absent (vérifié)
  - [x] Complété `.gitignore` : ajout de `_data/`, `.vscode/*` avec exceptions, `test-results/`, `playwright-report/`, `playwright/.cache/`, `tests/fixtures/pdfs/*.pdf`. Le template Nuxt avait déjà `.output`, `.nuxt`, `.nitro`, `.cache`, `dist`, `node_modules`, `logs`, `*.log`, `.DS_Store`, `.fleet`, `.idea`, `.env`, `.env.*`, `!.env.example`

- [x] **Task 5 — Ajouter les scripts npm** (AC: #5)
  - [x] Renommé `name` de `nuxt-temp` → `personnalfinance` dans `package.json`
  - [x] Ajouté tous les scripts : `dev`, `build`, `start`, `preview`, `generate`, `postinstall`, `db:push`, `db:generate`, `apply-migration`, `db:studio`, `test`, `test:run`, `test:e2e`, `lint`, `lint:fix`, `typecheck`

- [x] **Task 6 — Sanity check final**
  - [x] `yarn dev` → Nuxt démarré sur localhost:3000, port libéré ensuite
  - [x] `yarn typecheck` → 0 erreur, 10s (auto-install vue-tsc 3.2.7 + typescript 6.0.3 par `nuxt typecheck`)
  - [x] `CLAUDE.md` intact (hash identique avant/après)
  - [x] Aucun fichier de planning modifié

## Dev Notes

### Contexte projet — à lire avant de démarrer

Cette story est la **toute première** d'un projet greenfield. Avant de coder :

1. **Lire `CLAUDE.md`** à la racine du projet — contient les principes (KISS, YAGNI, DRY, SOLID), conventions, anti-patterns, garde-fous sécurité.
2. **Lire `_bmad-output/planning-artifacts/architecture.md`** — sections "Starter Template Evaluation" (commandes exactes), "Project Structure" (arbo cible), "Core Architectural Decisions" (D1-D10, en particulier D10 sur les commandes locales).
3. **Lire `_bmad-output/planning-artifacts/prd.md`** — section "Web Application Specific Requirements" pour comprendre le mode SPA, browsers cibles, etc.
4. Le PRD parle de "Nuxt 3" comme raccourci ; **on aligne sur Nuxt 4** (version stable courante en avril 2026), confirmé en Architecture §Starter Template.

### Stratégie d'initialisation Nuxt — point critique

⚠️ **Le répertoire courant n'est pas vide** : il contient `_bmad-output/`, `CLAUDE.md`, `_bmad/`, `.claude/`, `.agents/`, `docs/`. La commande `npx nuxi@latest init .` peut refuser ou poser des questions interactives.

**Stratégies recommandées (par ordre de préférence) :**

**Option A — Init dans un sous-dossier temporaire puis merge (le plus sûr) :**
```bash
npx nuxi@latest init nuxt-temp
# Déplacer le contenu de nuxt-temp/* vers la racine, sauf si conflit avec un fichier existant
mv nuxt-temp/{app,public,nuxt.config.ts,tsconfig.json,package.json,server,README.md} ./
# Pour .gitignore : merger plutôt qu'écraser (voir Task 4)
cat nuxt-temp/.gitignore >> .gitignore   # puis dédupliquer manuellement
rm -rf nuxt-temp
yarn install
```

**Option B — Init direct avec `--force` (à vérifier dans la doc Nuxt 4) :**
Risque d'écraser le `CLAUDE.md` existant. **À éviter** sauf si tu peux confirmer que `nuxi init .` ne touche qu'aux fichiers Nuxt typiques.

**Option C — Init manuel** (créer `package.json` à la main + ajouter `nuxt` en dep) : possible mais s'écarte de la doc officielle. À éviter.

**Recommandation :** Option A. Toujours **vérifier que `CLAUDE.md` est intact** après l'init (même hash SHA-256 ou diff vide).

### Snippet `nuxt.config.ts` cible (Task 3)

```ts
// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2026-01-01',
  ssr: false,                    // SPA mode — décision PRD (mono-user, local-first, pas de SEO)
  devtools: { enabled: true },
  modules: ['@pinia/nuxt'],
  css: [],                       // CSS vanilla via SFC <style scoped> + tokens.css (Story 1.7)
  // typescript.strict est activé via tsconfig.json en Story 1.2
})
```

### Snippet `.env.example` cible (Task 4)

```env
# Anthropic API key — récupérable sur https://console.anthropic.com/
# Ne JAMAIS commit la vraie clé. Copier ce fichier en .env et y mettre la valeur réelle.
ANTHROPIC_API_KEY=

# Optionnel — surcharge du chemin de la base SQLite (défaut: _data/personnalfinance.db)
# DATABASE_URL=
```

### Snippet `.gitignore` complet attendu (Task 4)

Nuxt va créer un `.gitignore` initial. **Compléter** (ne pas écraser) avec ces entrées si elles manquent :

```
# Nuxt
.nuxt
.output
.data
dist

# Node
node_modules

# Environnement
.env
.env.local
.env.*.local

# Données runtime de l'app (PDFs sources + SQLite) — voir CLAUDE.md
_data/

# OS
.DS_Store
Thumbs.db

# IDE
.idea
.vscode/*
!.vscode/extensions.json
!.vscode/settings.json
```

### Snippet scripts `package.json` (Task 5)

```json
{
  "scripts": {
    "dev": "nuxt dev",
    "build": "nuxt build",
    "start": "node .output/server/index.mjs",
    "preview": "nuxt preview",
    "generate": "nuxt generate",
    "postinstall": "nuxt prepare",
    "db:push": "drizzle-kit push",
    "db:generate": "drizzle-kit generate",
    "apply-migration": "drizzle-kit migrate",
    "db:studio": "drizzle-kit studio",
    "test": "vitest",
    "test:run": "vitest run",
    "test:e2e": "playwright test",
    "lint": "eslint .",
    "lint:fix": "eslint . --fix",
    "typecheck": "nuxt typecheck"
  }
}
```

⚠️ Garde le bloc `scripts` existant que Nuxt aura créé (`dev`, `build`, `generate`, `preview`, `postinstall`) — fusionne les nouveaux scripts dedans, n'écrase pas.

### Anti-patterns à éviter pour cette story

- ❌ Utiliser **npm** ou **pnpm** : le projet est verrouillé sur **yarn classic** (cf. CLAUDE.md). Tous les exemples utilisent `yarn`.
- ❌ Initialiser Nuxt avec un nom de projet en sous-dossier (`nuxi init personnalFinance`) puis tenter d'ouvrir le sous-dossier comme racine : ça créerait un répertoire imbriqué et casserait l'auto-discovery de `CLAUDE.md`. Le projet doit être à la racine actuelle.
- ❌ Installer `tailwindcss` ou tout autre framework CSS — décision PRD : **CSS vanilla** uniquement.
- ❌ Installer `nuxt-ui` ou `@nuxtjs/tailwindcss` — couplage Tailwind, décliné lors du PRD.
- ❌ Modifier les fichiers de planning (`_bmad-output/`, `CLAUDE.md`) — ils sont la source de vérité et ne doivent pas bouger.
- ❌ Créer une vraie clé Anthropic dans `.env.example` — ne mettre que la variable vide.
- ❌ Activer `ssr: true` ou laisser le défaut SSR : la décision PRD est SPA (`ssr: false`).
- ❌ Commit `.env`, `_data/`, `.output/`, `.nuxt/` — vérifier le `.gitignore` avant tout commit.

### Pourquoi ces choix (en bref)

- **Nuxt 4 SPA + Nitro** : décision PRD/Architecture (mono-user local-first → pas de SEO ni TTFB critique, SSR = dette technique inutile).
- **Yarn Classic** : choix utilisateur (Story 1.x, déjà en place, on ne re-débat pas).
- **CSS vanilla** : choix utilisateur (l'utilisateur n'aime pas Tailwind, et le projet est mono-user → pas besoin de design system industrialisé).
- **Pinia, Drizzle, better-sqlite3, unpdf, Zod, Anthropic SDK** : verrouillé en Architecture §Core Architectural Decisions.
- **Vitest + Playwright** : standards Nuxt, pas de discussion.
- **Reka UI optionnel** : peut servir pour des composants headless (modale, dialog, popover) si on veut éviter de tout réinventer. Si tu n'en as pas besoin tout de suite, tu peux skipper son install — il n'est pas critique pour cette story.

### Versions à vérifier

Au moment de l'install, vérifier les versions installées et noter dans le commit message ou les Completion Notes :
- `nuxt` doit être en `^4.x` (pas en 3.x).
- `vue` doit être `^3.5+`.
- `@anthropic-ai/sdk` doit être en version récente supportant les **structured outputs** (vérifier la doc).
- `drizzle-orm` et `drizzle-kit` doivent être en versions compatibles entre elles.

### Project Structure Notes

À la fin de cette story, l'arbo doit ressembler à :
```
personnalFinance/
├── _bmad/                    # ← inchangé
├── _bmad-output/             # ← inchangé (planning artifacts)
├── .agents/                  # ← inchangé
├── .claude/                  # ← inchangé
├── docs/                     # ← inchangé (si présent)
├── app/                      # ← créé par Nuxt
│   └── app.vue
├── public/                   # ← créé par Nuxt
├── server/                   # ← créé par Nuxt (vide à ce stade)
├── node_modules/             # ← créé par yarn install (gitignored)
├── nuxt.config.ts            # ← créé par Nuxt puis modifié (Task 3)
├── tsconfig.json             # ← créé par Nuxt
├── package.json              # ← créé par Nuxt puis enrichi (Task 5)
├── yarn.lock
├── .gitignore                # ← créé par Nuxt puis complété (Task 4)
├── .env.example              # ← créé en Task 4
├── CLAUDE.md                 # ← inchangé
├── README.md                 # ← créé par Nuxt (à laisser pour l'instant)
└── ... (autres fichiers Nuxt)
```

Les fichiers `drizzle.config.ts`, `vitest.config.ts`, `playwright.config.ts`, `eslint.config.mjs` seront créés en Story 1.2 et 1.4 — **pas dans cette story**.

### Definition of Done pour cette story

- [ ] Les 5 ACs sont validés via tests manuels (commandes listées dans Tasks)
- [ ] Aucun fichier de planning n'a été touché
- [ ] `yarn dev` démarre Nuxt sur localhost:3000
- [ ] `git status` est propre, prêt à committer un seul commit "Bootstrap Nuxt 4 project with required dependencies"
- [ ] Les commandes futures (`yarn db:push`, `yarn test`, `yarn lint`) sont déclarées dans `package.json` même si non fonctionnelles à ce stade

### Testing Notes

Pas de tests unitaires ou E2E à écrire dans cette story (les outils sont installés, mais les configs Vitest/Playwright et les premiers tests viennent en Story 1.2 puis 1.3). Les ACs sont validés par tests manuels (commandes shell).

### References

- [Source: `CLAUDE.md`#Stack verrouillée] — stack imposée
- [Source: `CLAUDE.md`#Sécurité] — `.env` gitignored, jamais en clair
- [Source: `CLAUDE.md`#Workflow Git] — pas de `git add .` (utiliser des paths nommés)
- [Source: `_bmad-output/planning-artifacts/architecture.md`#Starter Template Evaluation] — commandes exactes d'init et d'install
- [Source: `_bmad-output/planning-artifacts/architecture.md`#Core Architectural Decisions §D10] — modes de lancement local
- [Source: `_bmad-output/planning-artifacts/architecture.md`#Project Structure] — arbo cible complète
- [Source: `_bmad-output/planning-artifacts/prd.md`#Web Application Specific Requirements] — SPA, browsers, perfo
- [Source: `_bmad-output/planning-artifacts/epics.md`#Story 1.1] — story originale et ACs

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (1M context) via Claude Code (`/bmad-dev-story` workflow), avril 2026.

### Debug Log References

- Nuxi `init` est interactif : prompts "Which template?" et "Browse modules?" bloquent même avec `</dev/null`. Solution retenue : passer `--template minimal` explicitement (skip prompt 1). Le prompt modules s'affiche encore mais n'empêche pas le téléchargement du template — il suffit de timeouter ou tuer après le `Downloaded`. Tous les fichiers sont écrits avant le 2e prompt.
- Premier essai avec `--template v4-compat` a installé Nuxt 3.21.2 — c'est un template de migration, pas le bon. Re-init avec `--template minimal` qui apporte Nuxt 4.4.2 (la version stable au moment de l'install).
- `pkill -f "nuxt dev"` puis vérification `pgrep -af "nuxt|nitro|vite"` retourne du faux positif (le shell wrapper qui contient ces mots dans la string `eval`). Vérifier plutôt avec `ss -tln | grep :3000` ou `lsof -i :3000`.
- `nuxt typecheck` auto-installe `vue-tsc` et `typescript` à la volée si absents. Pas critique en V1 ; à éventuellement ajouter en `devDependencies` explicites en Story 1.2.

### Completion Notes List

**Versions installées (depuis `package.json` final) :**

Runtime :
- nuxt ^4.4.2 (effectivement résolu en 4.4.4 au moment du dev)
- vue ^3.5.33
- vue-router ^5.0.6
- @pinia/nuxt ^0.11.3
- pinia ^3.0.4
- drizzle-orm ^0.45.2
- better-sqlite3 ^12.9.0
- unpdf ^1.6.2
- @anthropic-ai/sdk ^0.91.1
- zod ^4.4.1
- reka-ui ^2.9.6

Dev :
- drizzle-kit ^0.31.10
- @types/better-sqlite3 ^7.6.13
- vitest ^4.1.5
- @vitest/ui ^4.1.5
- happy-dom ^20.9.0
- @playwright/test ^1.59.1
- @nuxt/eslint ^1.15.2
- eslint ^10.2.1

**Pile vérifiée à l'exécution :** Nuxt 4.4.4, Nitro 2.13.4, Vite 7.3.2, Vue 3.5.33.

**Stratégie d'init retenue :** Option A. Init dans `nuxt-temp/` avec `--template minimal` + `--no-install --no-gitInit`, puis `mv nuxt-temp/{.gitignore,README.md,app,nuxt.config.ts,package.json,public,tsconfig.json} ./` puis `rmdir nuxt-temp`. `CLAUDE.md` et tous les artefacts de planning préservés (vérifié par hash md5 identique avant/après : `44eb5ba585f34a0687448b610a9675ef`).

**Écarts vs la story :**
- AC#5 mentionnait que `yarn db:push`, `yarn test`, `yarn lint`, `yarn typecheck` peuvent retourner des erreurs "outils non installés" à ce stade — en pratique, `yarn typecheck` passe (Nuxt l'auto-install via `nuxt typecheck`), `yarn lint` n'a pas été testé (pas de `eslint.config.mjs` encore — Story 1.2). `yarn db:push` n'a pas été testé (pas de `drizzle.config.ts` encore — Story 1.4). C'est conforme à l'attendu.
- Le `.gitignore` du template Nuxt couvrait déjà 80% des entrées. Mes ajouts : `_data/`, `.vscode/*` + exceptions, `test-results/`, `playwright-report/`, `playwright/.cache/`, `tests/fixtures/pdfs/*.pdf`.
- Renommé `package.json#name` de `nuxt-temp` → `personnalfinance` (yarn refuse les majuscules dans les noms de paquets).

**Avertissements observés (non bloquants) :**
- `@nuxt/devtools@3.2.4` a une peer dep `vite>=6.0` insatisfaite (vite 7.3.2 installé — devtools 3.2.4 n'est pas encore mis à jour pour vite 7, mais ça fonctionne au runtime).
- `glob@10.5.0` (transitif via archiver via nitropack) signalé comme déprécié — non critique, hors de notre contrôle.
- `bare@*` engines invalides (transitif) — non critique.

**Performance ingestion (Sanity) :**
- `yarn install` : 113s (full)
- `yarn typecheck` : 10s (avec auto-install de vue-tsc + typescript)
- `yarn dev` boot : ~5-6s avant "Local: http://localhost:3000/"

### File List

Fichiers créés :
- `package.json` (créé par nuxi puis modifié : name + scripts + deps)
- `yarn.lock`
- `nuxt.config.ts` (créé par nuxi puis remplacé par notre config SPA)
- `tsconfig.json` (créé par nuxi, conservé tel quel — sera durci en Story 1.2)
- `.gitignore` (créé par nuxi puis enrichi)
- `.env.example` (créé)
- `README.md` (créé par nuxi, conservé tel quel)
- `app/` (dossier créé par nuxi avec `app.vue` placeholder)
- `public/` (dossier créé par nuxi)

Fichiers et dossiers générés (gitignored) :
- `node_modules/`
- `.nuxt/` (généré par `nuxt prepare`)

Fichiers du planning **non modifiés** (vérification finale) :
- `CLAUDE.md`
- `_bmad-output/planning-artifacts/{prd,architecture,epics}.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/implementation-artifacts/1-1-...md` à `2-10-...md` (sauf cette story 1.1 marquée `review` + ce Dev Agent Record rempli)

### Change Log

- 2026-04-30 : Story 1.1 implémentée par Claude Code. Statut `ready-for-dev` → `review`. 6 tasks et 5 ACs validés. Aucun changement aux artefacts de planning.
- 2026-04-30 : Code review (3 agents adversariaux). 2 decisions résolues, 6 patches appliqués (compatibilityDate corrigée, README projet, engines+packageManager, .gitignore complété, .gitkeep, robots.txt), 6 items deferred (cf. `deferred-work.md`), ~15 dismissed. Statut `review` → `done`.

### Review Findings

_Review automatisée par 3 agents (Blind Hunter, Edge Case Hunter, Acceptance Auditor) le 2026-04-30._

- [x] [Review][Patch] `compatibilityDate` arbitraire — remplacé par `'2026-04-30'` *(résolu de Decision, fixé)* [`nuxt.config.ts:3`]
- [x] [Review][Dismiss] Incohérence apparente `ssr: false` + `start` — décision : garder. Nitro sert le SPA statique + les endpoints API (Stories 2.x+) ; cohérent. *(résolu de Decision)*
- [x] [Review][Patch] README générique remplacé par un README projet (yarn-only, stack résumée, prérequis Node 20+, conventions CLAUDE.md référencées) [`README.md`]
- [x] [Review][Patch] Ajouté `engines.node: ">=20.11"` et `packageManager: "yarn@1.22.22"` dans `package.json` (NFR15 reproductibilité)
- [x] [Review][Patch] `.gitignore` complété : `coverage/`, `*.tsbuildinfo`, `.vercel/`, `.netlify/`
- [x] [Review][Patch] Créé `tests/fixtures/pdfs/.gitkeep` (l'exception gitignore référence ce fichier)
- [x] [Review][Patch] `public/robots.txt` : `Disallow: /` (cohérent avec `ssr: false` et local-first)
- [x] [Review][Defer] `app/app.vue` rend encore `<NuxtWelcome />` — placeholder du template, sera remplacé en Story 1.7
- [x] [Review][Defer] `public/favicon.ico` est un fichier 0 byte — cosmétique, non bloquant V1
- [x] [Review][Defer] `vue-tsc` et `typescript` pas en `devDependencies` explicites (auto-installés par `nuxt typecheck`) — à formaliser en Story 1.2
- [x] [Review][Defer] `runtimeConfig` Nuxt pas configuré pour `ANTHROPIC_API_KEY` — Story 2.4 lit `process.env` directement, OK V1
- [x] [Review][Defer] `@types/better-sqlite3 ^7.6.13` vs `better-sqlite3 ^12.9.0` majors décalés — à vérifier en Story 1.4 (les types DT ne suivent pas toujours les majors lib)
- [x] [Review][Defer] Peer deps non satisfaites (`@nuxt/devtools 3.2.4` vs `vite 7.3.2`) — devtools fonctionne, à mettre à jour quand 3.3+ sortira
