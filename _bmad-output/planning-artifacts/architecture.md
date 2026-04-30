---
stepsCompleted:
  - step-01-init
  - step-02-context
  - step-03-starter
  - step-04-decisions
  - step-05-patterns
  - step-06-structure
  - step-07-validation
  - step-08-complete
inputDocuments:
  - _bmad-output/planning-artifacts/prd.md
workflowType: 'architecture'
project_name: 'personnalFinance'
user_name: 'Marceau'
date: '2026-04-30'
status: 'complete'
completedAt: '2026-04-30'
---

# Architecture Decision Document — personnalFinance

**Author:** Marceau
**Date:** 2026-04-30

_Ce document est construit collaborativement étape par étape. Les sections sont ajoutées au fil des décisions._

## Project Context Analysis

### Requirements Overview

**Functional Requirements (54 FRs en 11 domaines de capability) :**

| Domaine | FRs | Implications archi |
|---|---|---|
| Ingestion & dédup PDF | FR1-5 | Pipeline async d'ingestion, hash store, file storage local |
| Catégorisation LLM | FR6-10 | Service LLM isolé, schéma de sortie strict, recalcul réactif |
| Réconciliation numérique | FR11-15 | Couche de vérification post-ingestion, état "fiabilité mois" |
| Modèles persistants (charges, revenus, SAS, dettes) | FR16-34 | 4 entités + relations, CRUD simple, intégration au moteur de forecast |
| Paramètres fiscalité | FR35-36 | Configuration paramétrable (clé-valeur ou table dédiée) |
| Dashboard narratif | FR37-40 | Aggregation + algorithme de "top écarts" + génération de phrases |
| Projection variables | FR41-45 | Fonction d'extrapolation par catégorie, store des overrides mois×catégorie |
| Forecast inverse | FR46-53 | Cœur du calcul : pipeline déterministe, recalcul réactif sur tout changement |
| Disclaimer | FR54 | Layer UI, état "première utilisation" |

**Non-Functional Requirements — drivers architecturaux principaux :**

- **Reliability/Data Integrity (NFR8-11)** ⇒ représentation monétaire en `integer cents` à travers toute la pile (DB → API → UI), pipeline de réconciliation obligatoire, base reconstructible depuis PDFs sources.
- **Performance (NFR1-3)** ⇒ ingestion < 30s pour un PDF (synchrone OK pour mono-user), recalcul forecast < 1s (in-process, fonctions pures).
- **Security (NFR4-7)** ⇒ `.env` pour secrets, gitignore strict, payload LLM contraint à date/libellé/montant, pas d'auth V1.
- **Maintainability (NFR15-18)** ⇒ parser PDF isolé via interface, taux fiscaux paramétrables, KISS/SOLID/DRY, tests sur calculs financiers à 100%.
- **Integration (NFR12-14)** ⇒ une seule dépendance externe (Claude API), structured outputs avec validation, dégradation gracieuse si API down.

### Scale & Complexity

- **Échelle** : 1 utilisateur, 1 banque, ~12 PDFs/an, ~50-200 transactions/PDF. Volume trivialement absorbable par SQLite local.
- **Complexité fonctionnelle** : moyenne — richesse dans le modèle métier français (SAS/IS/PFU/ARE), pas dans le volume ni la concurrence.
- **Complexité technique** : moyenne — richesse dans la rigueur numérique (integer cents, réconciliation, tests calculs).
- **Domaine technique principal** : full-stack web — frontend Nuxt SPA + backend Nitro embarqué.
- **Composants architecturaux estimés** : ~7-9 modules logiques (Ingestion Pipeline · LLM Service · Reconciliation · Domain Models · Categorization · Variable Projection · Forecast Engine · API Layer · UI).

### Technical Constraints & Dependencies

**Verrouillé par le PRD :**
- Stack : Nuxt 3 SPA (`ssr: false`) + Nitro + SQLite + Drizzle + `unpdf` + Claude API + CSS vanilla (SFC scoped) + Reka UI ou hand-rolled + Vitest + Playwright
- Plateforme : Chrome / Firefox desktop ≥ 1280 px
- Persistance : SQLite locale, pas de cloud V1
- Une seule intégration externe : Claude API
- Validation runtime payloads : Zod ou Valibot

**Dépendances explicites :**
- `@anthropic-ai/sdk` (LLM)
- `unpdf` (extraction PDF)
- `drizzle-orm` + `better-sqlite3` (DB)
- `pinia` (state UI)
- `zod` ou `valibot` (validation)
- `reka-ui` (optionnel, headless components)

### Cross-Cutting Concerns

1. **Représentation monétaire** — `integer cents` impose un choix de type partagé, helpers de conversion uniques, format de sérialisation API stable.
2. **Réconciliation comme invariant** — toute mutation transactionnelle déclenche une vérification ; l'état "fiabilité du mois" se propage jusqu'au forecast.
3. **Recalcul réactif du forecast** — chaque mutation de modèle déclenche un recalcul. Stratégie à choisir : invalidation/cache vs recalcul direct.
4. **Coût LLM** — un seul appel par hash de PDF (idempotence par contenu). Cache implicite via dédup hash + persistance des résultats.
5. **Domaine français** — IS, PFU/flat tax, ARE, exercice fiscal. Tous paramétrables, isolés dans un module "fiscal".
6. **Surface d'erreur LLM** — sortie structurée avec validation stricte, fallback explicite, exposition utilisateur des transactions douteuses.
7. **Détermination des "top écarts"** — algorithme déterministe et explicable, pas un LLM en boucle.
8. **Tests numériques** — discipline transversale, infrastructure partagée (fixtures de PDFs, snapshots de calculs).

## Starter Template Evaluation

### Primary Technology Domain

Web application full-stack — Nuxt 4 (frontend Vue 3 SPA + backend Nitro intégré).

### Starter Options Considered

Stack verrouillée par le PRD (Nuxt + Nitro). En avril 2026, la version stable courante est **Nuxt 4**, qui supersede Nuxt 3 sans rupture significative pour notre périmètre (mode SPA, Nitro inchangé). Le PRD mentionnait "Nuxt 3" comme raccourci ; on aligne sur Nuxt 4.

Alternatives écartées (déjà débattues lors du PRD) : Vue + Vite + Hono pur, Next.js, SvelteKit, Tauri.

### Selected Starter: Nuxt 4 (vanilla, via `nuxi`)

**Rationale :**
- Stack PRD imposée (Nuxt + Nitro), Nuxt 4 = version stable courante.
- Le starter officiel `nuxi init` est minimaliste (zero opinion sur CSS, state, ORM) — exactement ce qu'on veut puisque nos choix sont faits.
- Pas de starter tiers nécessaire : tout ce dont on a besoin s'ajoute proprement au-dessus du vanilla.

**Initialization Command (Yarn Classic) :**

```bash
npx nuxi@latest init personnalFinance
cd personnalFinance
yarn install
```

**Post-init configuration manuelle (`nuxt.config.ts`) :**

```ts
export default defineNuxtConfig({
  ssr: false,         // SPA mode (NFR/PRD)
  devtools: { enabled: true },
  css: [],            // pas de Tailwind, on utilise du CSS vanilla
  modules: ['@pinia/nuxt'],
})
```

**Architectural Decisions Provided by Starter :**

| Couche | Apporté par Nuxt 4 starter |
|---|---|
| Langage | TypeScript par défaut, `tsconfig.json` strict |
| Build/Dev | Vite côté client, Nitro côté serveur, hot reload natif |
| Routing | File-based via `app/pages/` |
| Auto-imports | Composables, components, utils |
| API layer | Endpoints Nitro dans `server/api/` |
| Devtools | Nuxt Devtools intégrés |
| Linting | ESLint optionnel — à activer (`@nuxt/eslint`) |
| Tests | Pas inclus par défaut — Vitest et Playwright ajoutés manuellement |

**Add-ons à installer en post-init :**

```bash
yarn add @pinia/nuxt pinia
yarn add drizzle-orm better-sqlite3
yarn add -D drizzle-kit @types/better-sqlite3
yarn add unpdf
yarn add @anthropic-ai/sdk
yarn add zod
yarn add reka-ui          # optionnel, headless components
yarn add -D vitest @vitest/ui happy-dom
yarn add -D @playwright/test
yarn add -D @nuxt/eslint eslint
```

**Note :** L'initialisation du projet via `nuxi init` + l'installation des add-ons + les configs de base (`nuxt.config.ts`, `drizzle.config.ts`, `vitest.config.ts`, `playwright.config.ts`, `.env.example`, `.gitignore`, `CLAUDE.md`) doivent constituer **la première story d'implémentation** (epic d'amorçage), avant toute feature métier.

## Core Architectural Decisions

### Décisions déjà actées (rappel)

| Catégorie | Décision |
|---|---|
| Langage | TypeScript strict |
| Framework | Nuxt 4 SPA (`ssr: false`) + Nitro |
| DB | SQLite + Drizzle ORM + `better-sqlite3` |
| LLM | Claude API + structured outputs |
| PDF | `unpdf` |
| Style | CSS vanilla (SFC scoped + custom properties) |
| State UI | Pinia |
| Validation runtime | Zod |
| Tests | Vitest + Playwright |
| Auth V1 | Aucune |
| Multi-tenant | Non |
| Cloud V1 | Non — local-first |
| Package manager | Yarn Classic |

### Data Architecture

**D1 — Représentation monétaire (NFR8)**

Branded type TypeScript + colonne SQLite `integer` (centimes).

```ts
// shared/types/money.ts
export type Cents = number & { readonly __brand: 'Cents' }
export const cents = (n: number): Cents => Math.round(n) as Cents
export const eurosToCents = (euros: number): Cents => Math.round(euros * 100) as Cents
export const centsToEuros = (c: Cents): number => c / 100
export const formatEuros = (c: Cents): string =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(centsToEuros(c))
```

Toute opération arithmétique se fait sur `Cents` (entier). Conversion uniquement à l'affichage via `formatEuros`. Le branded type empêche au compile time de mélanger `number` brut et `Cents`.

**D2 — Stockage des dates**

- Dates métier (date de transaction, date de fin ARE, date de clôture exercice…) → colonne `text` au format `YYYY-MM-DD` (ISO 8601 simple).
- Timestamps techniques (`created_at`, `updated_at`) → colonne `integer` en epoch secondes.

**D3 — Stockage des PDFs**

`_data/raw/{sha256}.pdf` (gitignored). Pas de colonne `file_path` en base — le hash *est* le chemin (idempotence par construction).

Une table `bank_statements` référence le hash (PK) et conserve les méta : période détectée, date d'ingestion, statut réconciliation, fiabilité du mois.

**D4 — Migrations Drizzle**

V1 (données jetables, NFR11) : `drizzle-kit push` (pas de migrations versionnées). Bascule vers `drizzle-kit generate` + migrations versionnées dès la Phase 2 Growth (quand la base ne sera plus jetable, avec arrivée du backup/restauration).

### API & Communication

**D5 — Endpoints Nitro (REST classique)**

- `POST /api/statements` (drop PDF, multipart)
- `GET /api/statements`, `GET /api/statements/:hash`
- `GET /api/transactions?month=YYYY-MM`
- `PATCH /api/transactions/:id` (recatégorisation, rattachement dette)
- `GET|POST|PUT|DELETE /api/charges`, `/api/revenues`, `/api/sas`, `/api/debts`
- `GET /api/forecast?horizon=12` (calculé à la demande, pas stocké)
- `GET /api/dashboard?month=YYYY-MM` (agrégats narratifs du mois)

**D6 — Forme des erreurs API**

`createError()` de Nitro avec `statusMessage` comme code stable et `data` pour le détail :

```ts
throw createError({
  statusCode: 400,
  statusMessage: 'reconciliation_failed',
  data: { gap_cents: 4700, expected_cents: 123450, found_cents: 118750 }
})
```

Côté client, error handler centralisé qui mappe `statusMessage` → message FR pour l'UI.

**D7 — Validation des payloads**

Zod aux frontières. Schémas partagés client/serveur dans `shared/schemas/`.
- Serveur : `await readValidatedBody(event, schema.parse)`
- Client : validation des forms avant submit.
- Source unique de vérité : un schéma Zod par entité métier, types TS dérivés via `z.infer<>`.

### Frontend Architecture

**D8 — Split server-state / UI-state**

- **Server state** : `useFetch` / `$fetch` direct, pas de cache global manuel. Refetch sur invalidation.
- **UI state** (mois sélectionné, modale ouverte, filtres) : Pinia, 1 store par préoccupation transverse.
- **Data state dérivé** : composables qui combinent fetched data + UI state (ex: `useCurrentMonthDashboard()`).

Pinia ne stocke jamais ce qui est représentable en URL ou côté serveur.

**D9 — Pattern de recalcul forecast**

Forecast = endpoint pur, pas d'état persisté.
- `GET /api/forecast?horizon=12` est une fonction pure des modèles persistés.
- Toute mutation qui invalide le forecast → le client refetch `useFetch('/api/forecast')` (Nuxt gère le cache key).
- Pas de cache serveur en V1 (recalcul < 1s sur volume mono-user, NFR2).
- Zéro état dérivé en base = zéro risque de désynchronisation.

### Infrastructure & Deployment

**D10 — Lancement local (3 modes)**

- Dev : `yarn dev` (Nuxt + Nitro hot reload)
- Build prod local : `yarn build` puis `node .output/server/index.mjs`
- Tests : `yarn test` (Vitest), `yarn test:e2e` (Playwright)

Pas de CI, pas de Docker, pas de déploiement en V1.

### Décisions différées (post-MVP)

- Backups SQLite → Growth
- CI (tests automatiques au push) → Growth
- Déploiement cloud + auth → Vision
- Cache forecast → si la perf devient un problème (improbable en V1)

### Decision Impact Analysis

**Implementation Sequence (épine dorsale) :**

1. Bootstrap projet (D10) + branded `Cents` (D1) + types partagés (D2)
2. Schéma Drizzle + migrations push (D4) + tables charges/revenus/SAS/dettes/statements/transactions
3. Endpoints CRUD modèles (D5) + validation Zod (D7) + erreurs normalisées (D6)
4. Pipeline d'ingestion PDF (D3) + service LLM
5. Moteur de réconciliation (invariant transversal)
6. Moteur de forecast (D9, fonction pure côté serveur)
7. Frontend : composables + pages + state Pinia (D8)

**Cross-Component Dependencies :**

- D1 (`Cents`) traverse toute la pile : DB, API, UI. Doit être posé en premier.
- D7 (schémas Zod partagés) couple API et UI ; tout endpoint nouveau → schéma partagé en parallèle.
- D9 (forecast pur) couple les modèles persistés au moteur de calcul ; toute nouvelle entité métier doit être prise en compte par la fonction de forecast.
- D6 (erreurs) couple Nitro et l'error handler client ; tout nouveau code d'erreur doit être ajouté côté UI mapping.

## Implementation Patterns & Consistency Rules

### Naming Patterns

**Database (SQLite + Drizzle) :**
- Tables : `snake_case` pluriel (`bank_statements`, `transactions`, `fixed_charges`, `debts`, `debt_advances`, `debt_repayments`, `monthly_overrides`, `revenue_models`, `sas_config`, `tax_settings`, `category_definitions`).
- Colonnes : `snake_case` (`hash_sha256`, `period_start`, `amount_cents`, `created_at`).
- Foreign keys : `{singular_target}_id`.
- Index : `{table}_{cols}_idx`.
- Toujours préférer suffixes explicites : `*_cents`, `*_date`.

**API REST :**
- Ressources au pluriel kebab-case : `/api/bank-statements`, `/api/transactions`, `/api/fixed-charges`, `/api/debts`.
- Paramètres path : `:id` ou `:hash`.
- Query params : `camelCase` (`?month=2026-04&horizon=12`).
- Singletons (config unique mono-user) : `/api/sas-config`, `/api/tax-settings`.

**Code TypeScript :**
- Variables/fonctions : `camelCase`. Acronymes domaine acceptés : `IS`, `ARE`, `PFU`, `SAS`, `TVA`.
- Types/interfaces/classes : `PascalCase`.
- Constantes globales : `SCREAMING_SNAKE_CASE` réservé aux vraies constantes.
- Fichiers : `kebab-case.ts`.
- Composants Vue : `PascalCase.vue`.
- Composables : `useCamelCase.ts`.
- Pages (file-based routing) : `kebab-case.vue`.

**Modèles de domaine :** code en anglais (`Transaction`, `Debt`, `FixedCharge`, `RevenueModel`, `SasConfig`, `TaxSettings`, `BankStatement`, `MonthlyOverride`). Vocabulaire technique en anglais (`dividendNetCents`, `dividendGrossCents`, `flatTaxRate`, `unemploymentBenefitMonthlyCents`, `sasMonthlyRentCents`, `expenseReimbursementsMonthlyCents`, `fiscalYearEndDate`). Libellés UI en français.

### Structure Patterns

```
.
├── app/                           # Frontend Nuxt
│   ├── pages/                     # Routes file-based
│   ├── components/
│   │   ├── dashboard/
│   │   ├── debts/
│   │   ├── forecast/
│   │   └── shared/
│   ├── composables/               # useXxx (server-state + UI-state composés)
│   ├── stores/                    # Pinia (UI-state uniquement)
│   ├── assets/styles/             # tokens.css, reset.css
│   └── app.vue
├── server/                        # Backend Nitro
│   ├── api/                       # Endpoints REST
│   ├── services/                  # forecast-engine, pdf-extractor, llm-categorizer, reconciler, narrative-generator
│   ├── db/
│   │   ├── schema.ts              # Drizzle schema
│   │   ├── client.ts              # better-sqlite3 + Drizzle init
│   │   └── seeds/
│   ├── utils/                     # errors, validation
│   └── middleware/
├── shared/                        # Auto-imports Nuxt 4
│   ├── schemas/                   # Zod par entité
│   ├── types/                     # Cents, dates, branded types
│   └── constants/                 # Tax rates defaults
├── tests/
│   ├── fixtures/                  # PDFs de test, snapshots
│   └── e2e/                       # Playwright
├── _data/                         # Runtime, gitignored
│   ├── raw/                       # PDFs sources {hash}.pdf
│   └── personnalfinance.db
├── drizzle.config.ts
├── nuxt.config.ts
├── vitest.config.ts
├── playwright.config.ts
├── .env.example
├── .gitignore
└── CLAUDE.md
```

Tests unitaires co-localisés (`*.test.ts`). E2E dans `tests/e2e/`. Fixtures partagées dans `tests/fixtures/`.

### Format Patterns

**Réponses API succès** : objet/array JSON direct, pas de wrapper.

**Réponses API erreur** : forme normalisée via `createError()`.
```json
{
  "statusCode": 400,
  "statusMessage": "reconciliation_failed",
  "data": { "gapCents": 4700, "expectedCents": 123450, "foundCents": 118750 }
}
```
`statusMessage` = code stable snake_case anglais, mappé en FR côté UI.

**Conventions JSON :**
- `camelCase` pour les clés (au-delà de la frontière DB → API).
- Montants : suffixe `Cents` obligatoire.
- Dates métier : `YYYY-MM-DD` (string ISO).
- Timestamps techniques : `createdAt` epoch secondes (number).
- Booléens : `true`/`false`. Listes vides : `[]` jamais `null`.

### Communication Patterns

Pas de système d'événements applicatif en V1. Les mutations = appels API directs ; le client refetch ce qui est invalidé.

**State updates Pinia** : actions explicites, pas de mutation directe du state depuis les composants.

**Cache `useFetch`** : `key` explicite pour invalider proprement.
```ts
const { data, refresh } = useFetch('/api/forecast', { query: { horizon: 12 }, key: 'forecast-12' })
// Après mutation : refresh()
```

### Process Patterns

**Error handling — règle d'or :** les erreurs métier ne sont pas des exceptions.
- Validation Zod → `createError({ statusCode: 422, statusMessage: 'validation_failed', data: zodErr.flatten() })`
- Erreurs domaine → `createError({ statusCode: 400, statusMessage: '<code_metier>', data: {...} })`
- Bugs imprévus → laissés remonter.
- Pas de `try/catch` silencieux qui retourne `null`.

**Loading states UI :**
- Pas de spinner global — chaque section a son `pending` de `useFetch`.
- Skeleton screens pour les vues clés.
- Bouton submit désactivé pendant les mutations.

**Logging :**
- `console.log` interdit en code merged. `console.warn`/`console.error` autorisés.
- Côté serveur, logger Nitro.

### Enforcement Guidelines

**Tous les agents AI MUST :**

1. Toute manipulation monétaire passe par `Cents` (branded type) et helpers. Jamais `* 100` / `/ 100` à la main, jamais `parseFloat` sur de l'argent.
2. Toute frontière API a un schéma Zod dans `shared/schemas/` ; client et serveur valident.
3. Tout endpoint qui mute transactions/modèles invalide le forecast côté UI (refresh des `useFetch` concernés).
4. Toute fonction de calcul financier a un test unitaire avec ≥ 1 cas nominal + 2 cas limites (NFR9). Non négociable.
5. Aucun secret en clair, aucune trace de la clé API dans logs / réponses / bundle (NFR4).
6. Aucune écriture en base sans passer par Drizzle (pas de SQL brut hors migrations / bench).
7. Les taux fiscaux et plafonds sont lus depuis `tax_settings` ou `shared/constants/fiscal-defaults.ts`, jamais en dur dans une fonction de calcul.
8. Le parser PDF est consommé via interface stable (`extractStatement(pdfBuffer): Promise<RawStatement>`), jamais appelé directement depuis `unpdf` hors de `server/services/pdf-extractor.ts`.

**Anti-patterns interdits :**

- ❌ `amount: number` dans un type métier (utiliser `amountCents: Cents`)
- ❌ `new Date(dbDateString)` côté serveur sur des dates métier — manipuler les strings ISO directement
- ❌ Cache Pinia de données serveur (qui doublonne les endpoints)
- ❌ `try { ... } catch { return null }` sans logging ni propagation
- ❌ Appel direct à `anthropic.messages.create()` hors de `server/services/llm-categorizer.ts`
- ❌ Endpoint qui retourne un payload non typé (toujours dériver du schéma Zod)
- ❌ Composant Vue qui fait son propre `fetch`/`$fetch` — passer par un composable

## Project Structure & Boundaries

### Complete Project Directory Structure

```
personnalFinance/
├── README.md
├── CLAUDE.md                          # Principes KISS/SOLID/DRY + sécu + workflow IA
├── package.json
├── yarn.lock
├── tsconfig.json
├── nuxt.config.ts
├── drizzle.config.ts
├── vitest.config.ts
├── playwright.config.ts
├── eslint.config.mjs
├── .env.example                       # Template (commité)
├── .env                               # Gitignored — clé Anthropic réelle
├── .gitignore                         # _data/, .env, .output/, node_modules/, .nuxt/
│
├── app/                               # FRONTEND Nuxt
│   ├── app.vue
│   ├── error.vue
│   ├── pages/
│   │   ├── index.vue                  # Dashboard mois courant
│   │   ├── import.vue                 # Drop PDF + statut
│   │   ├── transactions/[period].vue
│   │   ├── charges.vue
│   │   ├── revenus.vue
│   │   ├── sas.vue
│   │   ├── dettes.vue
│   │   ├── forecast.vue
│   │   └── parametres.vue
│   ├── components/
│   │   ├── shared/
│   │   │   ├── AppHeader.vue
│   │   │   ├── AppNav.vue
│   │   │   ├── AppDisclaimer.vue
│   │   │   ├── MoneyInput.vue
│   │   │   ├── MoneyDisplay.vue
│   │   │   ├── DateInput.vue
│   │   │   ├── ConfirmDialog.vue
│   │   │   └── ReliabilityBadge.vue
│   │   ├── dashboard/
│   │   │   ├── MonthlyNarrative.vue
│   │   │   ├── BalanceSummary.vue
│   │   │   └── MonthSelector.vue
│   │   ├── ingestion/
│   │   │   ├── PdfDropZone.vue
│   │   │   ├── IngestionProgress.vue
│   │   │   └── PeriodOverlapDialog.vue
│   │   ├── transactions/
│   │   │   ├── TransactionList.vue
│   │   │   ├── TransactionRow.vue
│   │   │   ├── CategoryEditor.vue
│   │   │   └── DebtRepaymentMarker.vue
│   │   ├── reconciliation/
│   │   │   ├── ReconciliationGap.vue
│   │   │   └── AddManualTransaction.vue
│   │   ├── debts/
│   │   │   ├── DebtCard.vue
│   │   │   ├── DebtForm.vue
│   │   │   ├── DebtRepaymentMode.vue
│   │   │   ├── DebtAdvanceForm.vue
│   │   │   └── DebtImpactOnDividend.vue
│   │   ├── charges/
│   │   │   ├── FixedChargeList.vue
│   │   │   ├── FixedChargeForm.vue
│   │   │   └── SuggestedChargesPanel.vue
│   │   ├── revenues/
│   │   │   ├── ArePanel.vue
│   │   │   ├── SasRentPanel.vue
│   │   │   └── ReimbursementsPanel.vue
│   │   ├── sas/
│   │   │   ├── SasConfigForm.vue
│   │   │   ├── DividendCapacityCard.vue
│   │   │   └── FiscalYearForm.vue
│   │   ├── forecast/
│   │   │   ├── ForecastChart.vue
│   │   │   ├── ForecastSourceLegend.vue
│   │   │   ├── DividendTargetCard.vue
│   │   │   ├── HorizonSelector.vue
│   │   │   ├── AreCompatibilityWarning.vue
│   │   │   ├── LeversPanel.vue
│   │   │   └── VariableOverrideDialog.vue
│   │   └── settings/
│   │       └── TaxSettingsForm.vue
│   ├── composables/
│   │   ├── useCurrentMonthDashboard.ts
│   │   ├── useTransactions.ts
│   │   ├── useStatements.ts
│   │   ├── useDebts.ts
│   │   ├── useFixedCharges.ts
│   │   ├── useRevenueModel.ts
│   │   ├── useSasConfig.ts
│   │   ├── useForecast.ts
│   │   ├── useTaxSettings.ts
│   │   └── useApiError.ts
│   ├── stores/
│   │   ├── ui.ts
│   │   └── disclaimer.ts
│   ├── assets/styles/
│   │   ├── tokens.css
│   │   ├── reset.css
│   │   └── global.css
│   └── plugins/
│       └── disclaimer.client.ts
│
├── server/                            # BACKEND Nitro
│   ├── api/
│   │   ├── statements/
│   │   │   ├── index.post.ts
│   │   │   ├── index.get.ts
│   │   │   └── [hash].get.ts
│   │   ├── transactions/
│   │   │   ├── index.get.ts
│   │   │   └── [id].patch.ts
│   │   ├── reconciliation/
│   │   │   └── [hash].post.ts
│   │   ├── fixed-charges/
│   │   │   ├── index.get.ts
│   │   │   ├── index.post.ts
│   │   │   ├── [id].put.ts
│   │   │   ├── [id].delete.ts
│   │   │   └── suggestions.get.ts
│   │   ├── revenues.get.ts
│   │   ├── revenues.put.ts
│   │   ├── sas-config.get.ts
│   │   ├── sas-config.put.ts
│   │   ├── tax-settings.get.ts
│   │   ├── tax-settings.put.ts
│   │   ├── debts/
│   │   │   ├── index.get.ts
│   │   │   ├── index.post.ts
│   │   │   ├── [id].put.ts
│   │   │   ├── [id].delete.ts
│   │   │   ├── [id]/advances.post.ts
│   │   │   └── [id]/impact.get.ts
│   │   ├── overrides/
│   │   │   ├── index.get.ts
│   │   │   ├── index.post.ts
│   │   │   └── [id].delete.ts
│   │   ├── dashboard.get.ts
│   │   └── forecast.get.ts
│   ├── services/
│   │   ├── pdf-extractor.ts           # + .test.ts
│   │   ├── llm-categorizer.ts         # + .test.ts
│   │   ├── reconciler.ts              # + .test.ts
│   │   ├── narrative-generator.ts     # + .test.ts
│   │   ├── variable-projection.ts     # + .test.ts
│   │   ├── forecast-engine.ts         # + .test.ts
│   │   ├── dividend-calculator.ts     # + .test.ts
│   │   ├── debt-projection.ts         # + .test.ts
│   │   └── charge-suggester.ts        # + .test.ts
│   ├── db/
│   │   ├── client.ts
│   │   ├── schema.ts
│   │   ├── migrations/                # Généré par drizzle-kit generate
│   │   └── seeds/
│   │       └── default-categories.ts
│   ├── utils/
│   │   ├── errors.ts
│   │   ├── validation.ts
│   │   ├── hash.ts
│   │   ├── period.ts
│   │   └── file-storage.ts
│   └── middleware/
│       └── disclaimer-context.ts
│
├── shared/                            # Auto-imports Nuxt 4
│   ├── schemas/
│   │   ├── transaction.schema.ts
│   │   ├── statement.schema.ts
│   │   ├── fixed-charge.schema.ts
│   │   ├── revenue-model.schema.ts
│   │   ├── sas-config.schema.ts
│   │   ├── tax-settings.schema.ts
│   │   ├── debt.schema.ts
│   │   ├── debt-advance.schema.ts
│   │   ├── monthly-override.schema.ts
│   │   └── api-errors.ts
│   ├── types/
│   │   ├── money.ts
│   │   ├── period.ts
│   │   ├── reliability.ts
│   │   └── repayment-mode.ts
│   └── constants/
│       ├── fiscal-defaults.ts
│       ├── default-categories.ts
│       └── bank-statement-llm-prompt.ts
│
├── tests/
│   ├── fixtures/
│   │   ├── pdfs/
│   │   ├── snapshots/
│   │   └── llm-responses/
│   └── e2e/
│       ├── ingestion.spec.ts
│       ├── reconciliation.spec.ts
│       ├── forecast-flow.spec.ts
│       └── debt-lump-sum.spec.ts
│
└── _data/                             # RUNTIME — gitignored
    ├── raw/                           # PDFs sources {sha256}.pdf
    └── personnalfinance.db
```

### Architectural Boundaries

**API Boundaries :**
- Toute frontière HTTP passe par un endpoint Nitro dans `server/api/`. Aucun appel direct backend côté client.
- Schéma Zod côté `shared/schemas/` validé en entrée serveur (`readValidatedBody`).
- Codes d'erreur stables centralisés dans `shared/schemas/api-errors.ts`.

**Component Boundaries :**
- Les composants Vue ne font jamais de fetch direct — toujours via un composable de `app/composables/`.
- Les composables exposent état réactif + actions (`refresh`, `mutate`).
- Les stores Pinia ne contiennent que de l'état UI. Pas de données serveur.

**Service Boundaries (backend) :**
- Tout service de `server/services/` est une fonction pure ou classe stateless, testable sans Nitro.
- Les services métier reçoivent les données en argument et retournent un résultat. La DB est consommée dans `server/api/`.
  - Exception : services qui ont intrinsèquement besoin de la DB (ex: `charge-suggester`) — client Drizzle injecté en paramètre.
- `pdf-extractor.ts` est la seule porte d'entrée vers `unpdf`. `llm-categorizer.ts` est la seule porte d'entrée vers `@anthropic-ai/sdk`.

**Data Boundaries :**
- Tout accès SQLite passe par Drizzle (instance unique exportée par `server/db/client.ts`).
- Pas de SQL brut hors migrations et benchs.
- Les PDFs vivent uniquement dans `_data/raw/`, accédés via `server/utils/file-storage.ts`.

### Requirements to Structure Mapping

| FR domaine | Endpoints | Services | Composants UI |
|---|---|---|---|
| Ingestion & dédup (FR1-5) | `statements/index.post.ts` | `pdf-extractor`, `utils/hash`, `utils/file-storage`, `utils/period` | `PdfDropZone`, `IngestionProgress`, `PeriodOverlapDialog` |
| Catégorisation (FR6-10) | `statements/index.post.ts`, `transactions/[id].patch.ts` | `llm-categorizer` | `TransactionList`, `CategoryEditor`, `DebtRepaymentMarker` |
| Réconciliation (FR11-15) | `reconciliation/[hash].post.ts` | `reconciler` | `ReconciliationGap`, `AddManualTransaction`, `ReliabilityBadge` |
| Charges (FR16-18) | `fixed-charges/*` | `charge-suggester` | `FixedChargeList`, `FixedChargeForm`, `SuggestedChargesPanel` |
| Revenus (FR19-22) | `revenues.{get,put}.ts` | — | `ArePanel`, `SasRentPanel`, `ReimbursementsPanel` |
| SAS (FR23-28) | `sas-config.{get,put}.ts` | `dividend-calculator` (capacité) | `SasConfigForm`, `DividendCapacityCard`, `FiscalYearForm` |
| Dettes (FR29-34) | `debts/*` | `debt-projection` | `DebtCard`, `DebtForm`, `DebtRepaymentMode`, `DebtAdvanceForm`, `DebtImpactOnDividend` |
| Fiscalité (FR35-36) | `tax-settings.{get,put}.ts` | — | `TaxSettingsForm` |
| Dashboard narratif (FR37-40) | `dashboard.get.ts` | `narrative-generator` | `MonthlyNarrative`, `BalanceSummary`, `MonthSelector` |
| Projection variables (FR41-45) | `forecast.get.ts`, `overrides/*` | `variable-projection` | `ForecastSourceLegend`, `VariableOverrideDialog` |
| Forecast inverse (FR46-53) | `forecast.get.ts` | `forecast-engine`, `dividend-calculator`, `debt-projection` | `ForecastChart`, `DividendTargetCard`, `HorizonSelector`, `AreCompatibilityWarning`, `LeversPanel` |
| Disclaimer (FR54) | — | — | `AppDisclaimer` + plugin `disclaimer.client.ts` |

### Cross-Cutting Concerns Mapping

| Concern | Localisation |
|---|---|
| Représentation `Cents` (D1) | `shared/types/money.ts` |
| Schémas Zod partagés (D7) | `shared/schemas/` |
| Codes d'erreur API (D6) | `shared/schemas/api-errors.ts` + `server/utils/errors.ts` |
| Logger / dev tools | Nitro intégré + Nuxt Devtools |
| Constantes fiscales paramétrables (NFR17) | `shared/constants/fiscal-defaults.ts` + table `tax_settings` |
| Tests numériques (NFR9, NFR18) | `*.test.ts` co-localisés + `tests/fixtures/snapshots/` |

### Integration Points

**Internal :**
- Client → Backend : HTTPS via `useFetch`/`$fetch`, JSON, Zod-validé.
- Backend → DB : Drizzle ORM via instance unique.
- Backend → Filesystem : `server/utils/file-storage.ts` pour les PDFs.

**External :**
- Anthropic Claude API : appelé exclusivement depuis `server/services/llm-categorizer.ts`. Clé API en `.env`. Sortie validée par schéma Zod.

**Data Flow d'une ingestion PDF :**
```
PdfDropZone (UI)
  → POST /api/statements (multipart)
  → server/utils/hash.ts (SHA-256)
  → check dédup (table bank_statements)
  → server/utils/file-storage.ts (sauvegarde _data/raw/{hash}.pdf)
  → server/services/pdf-extractor.ts (unpdf → texte structuré)
  → server/services/llm-categorizer.ts (Claude API → transactions)
  → server/services/reconciler.ts (somme vs solde PDF)
  → INSERT transactions + bank_statements (Drizzle)
  → response { hash, transactions[], reconciliationStatus }
  → client refetch /api/dashboard?month=... + /api/forecast
```

### File Organization Patterns

- **Configs** : à la racine, un fichier par tool.
- **Sources** : `app/` frontend, `server/` backend, `shared/` partagé. Pas de `src/`.
- **Tests** : co-localisés (`*.test.ts`) pour les unitaires ; `tests/e2e/` pour Playwright ; `tests/fixtures/` pour les données.
- **Assets** : CSS dans `app/assets/styles/`, pas d'images en V1.
- **Runtime data** : `_data/` (gitignored), créé au démarrage si absent.

### Development Workflow

| Commande | Rôle |
|---|---|
| `yarn dev` | Nuxt + Nitro hot reload |
| `yarn db:push` | Sync rapide du schéma (itération dev, pas de migration tracée) |
| `yarn db:generate` | Génère un fichier SQL de migration depuis le diff de schéma |
| `yarn apply-migration` | Applique les migrations pending sur la base |
| `yarn db:studio` | Drizzle Studio (explorer la base) |
| `yarn test` | Vitest watch |
| `yarn test:run` | Vitest one-shot |
| `yarn test:e2e` | Playwright E2E |
| `yarn build` | Build prod |
| `yarn start` | Lance le serveur prod local (`node .output/server/index.mjs`) |
| `yarn lint` / `yarn lint:fix` | ESLint |
| `yarn typecheck` | `nuxt typecheck` |

`db:push` reste le défaut V1 pour l'itération rapide. `apply-migration` est dispo dès le départ pour figer un schéma versionné quand utile (avant un commit qui touche la base, ou en préparation de la bascule Growth).

**`package.json` correspondant :**

```json
{
  "scripts": {
    "dev": "nuxt dev",
    "build": "nuxt build",
    "start": "node .output/server/index.mjs",
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

## Architecture Validation Results

### Coherence Validation ✅

**Decision Compatibility :** toutes les décisions s'alignent. Nuxt 4 SPA + Nitro intègre nativement le pipeline frontend/backend ; SQLite + Drizzle + better-sqlite3 sont la combinaison standard ; `unpdf` est compatible Node/Nitro ; `@anthropic-ai/sdk` supporte les structured outputs requis ; Pinia + Nuxt 4 sont natifs ; Reka UI et CSS vanilla sont indépendants des autres choix. Versions vérifiées (Nuxt 4 stable en avril 2026).

**Pattern Consistency :** les conventions de nommage (snake_case DB / camelCase API / kebab-case files / PascalCase composants) sont cohérentes avec l'écosystème Nuxt/TypeScript. Le branded type `Cents` traverse uniformément DB → API → UI. Les schémas Zod dans `shared/` couvrent client et serveur depuis une source unique.

**Structure Alignment :** l'arbo Nuxt 4 (`app/`, `server/`, `shared/`) est respectée. Les boundaries sont posées : fetch → composables → endpoints → services → DB. Aucune fuite n'est tolérée — anti-patterns explicitement listés.

### Requirements Coverage Validation ✅

**Functional Requirements (54 FRs) — couverture complète :**

| Bloc FR | Endpoints | Services | Composants UI | Couvert |
|---|---|---|---|---|
| FR1-5 (Ingestion) | `statements/*` | `pdf-extractor`, `hash`, `file-storage`, `period` | `PdfDropZone`, `PeriodOverlapDialog`, `IngestionProgress` | ✅ |
| FR6-10 (Catégorisation) | `statements/*`, `transactions/[id].patch` | `llm-categorizer` | `TransactionList`, `CategoryEditor`, `DebtRepaymentMarker` | ✅ |
| FR11-15 (Réconciliation) | `reconciliation/[hash]` | `reconciler` | `ReconciliationGap`, `AddManualTransaction`, `ReliabilityBadge` | ✅ |
| FR16-18 (Charges) | `fixed-charges/*` | `charge-suggester` | `FixedChargeList`, `SuggestedChargesPanel` | ✅ |
| FR19-22 (Revenus) | `revenues.*` | — | `ArePanel`, `SasRentPanel`, `ReimbursementsPanel` | ✅ |
| FR23-28 (SAS) | `sas-config.*` | `dividend-calculator` | `SasConfigForm`, `DividendCapacityCard` | ✅ |
| FR29-34 (Dettes) | `debts/*` | `debt-projection` | `DebtCard`, `DebtForm`, `DebtAdvanceForm`, `DebtImpactOnDividend` | ✅ |
| FR35-36 (Fiscalité) | `tax-settings.*` | — | `TaxSettingsForm` | ✅ |
| FR37-40 (Dashboard narratif) | `dashboard.get` | `narrative-generator` | `MonthlyNarrative`, `MonthSelector` | ✅ |
| FR41-45 (Projection variables) | `forecast.get`, `overrides/*` | `variable-projection` | `ForecastSourceLegend`, `VariableOverrideDialog` | ✅ |
| FR46-53 (Forecast inverse) | `forecast.get` | `forecast-engine`, `dividend-calculator`, `debt-projection` | `ForecastChart`, `DividendTargetCard`, `AreCompatibilityWarning`, `LeversPanel` | ✅ |
| FR54 (Disclaimer) | — | — | `AppDisclaimer` + `disclaimer.client.ts` plugin | ✅ |

**Non-Functional Requirements (18 NFRs) — couverture :**

| NFR | Mécanisme architectural | Statut |
|---|---|---|
| NFR1 (<30s ingestion) | Pipeline synchrone, un seul appel LLM par PDF | ✅ |
| NFR2 (<1s recalc forecast) | Fonction pure in-process, pas d'aller-retour DB inutile | ✅ |
| NFR3 (UI snappy) | Best effort (pas de cible dure dans le PRD) | ✅ acceptée |
| NFR4 (clé API en `.env`) | `.env` gitignored, jamais en log/réponse/bundle | ✅ |
| NFR5 (PDFs locaux) | `_data/raw/` gitignored, accès via `file-storage.ts` | ✅ |
| NFR6 (payload LLM limité) | Service `llm-categorizer` envoie uniquement date/libellé/montant | ✅ |
| NFR7 (pas d'auth V1) | Aucune middleware d'auth, app locale | ✅ |
| NFR8 (integer cents) | Branded type `Cents` dans `shared/types/money.ts`, colonnes DB `integer` | ✅ |
| NFR9 (tests cas limites) | `*.test.ts` co-localisés + fixtures partagées | ✅ |
| NFR10 (réconciliation systématique) | `reconciler.ts` appelé dans pipeline d'ingestion | ✅ |
| NFR11 (base reconstructible) | Hash = nom de fichier, PDFs conservés en local | ✅ |
| NFR12 (single external dep) | Seule API Claude, vérifié dans audit dépendances | ✅ |
| NFR13 (graceful degradation) | Erreur Claude → 502/503 vers UI, app utilisable en lecture | ✅ |
| NFR14 (structured outputs) | Zod schema `transaction.schema.ts` valide la sortie LLM | ✅ |
| NFR15 (KISS/SOLID/DRY) | Formalisé dans `CLAUDE.md` au bootstrap | ✅ |
| NFR16 (parser isolé) | `pdf-extractor.ts` interface stable, seul consommateur d'`unpdf` | ✅ |
| NFR17 (taux paramétrables) | Table `tax_settings` + `shared/constants/fiscal-defaults.ts` | ✅ |
| NFR18 (100% tests calculs) | Tests co-localisés sur tous les services de calcul | ✅ enforce manuel |

### Implementation Readiness Validation ✅

- **Decision Completeness** : toutes les décisions critiques (D1-D10) sont documentées avec rationale. Versions verrouillées. Aucune décision pending sur le chemin critique.
- **Structure Completeness** : arborescence complète et explicite ; chaque fichier nommé a un rôle clair ; mapping FR → fichier intégral.
- **Pattern Completeness** : naming, structure, format API, error handling, loading states, anti-patterns — tout est codifié.

### Gap Analysis

**Critical Gaps :** aucun.

**Important Gaps (à clarifier dans `CLAUDE.md` ou la première story) :**

- **G1 — Persistance de l'état "disclaimer vu"** : le store `app/stores/disclaimer.ts` a besoin d'un endroit où persister le flag. Proposition : `localStorage` côté client (état UI pur). À acter dans la story Disclaimer.
- **G2 — Bootstrap base de données** : qui crée `_data/`, qui exécute le seed des catégories par défaut au premier lancement ? Proposition : un middleware Nitro `0.bootstrap.ts` exécuté une fois au démarrage si la base n'existe pas (`mkdir _data`, ouverture SQLite, programmatic push, seed des catégories). À détailler dans la story d'amorçage.
- **G3 — Robustesse de l'extraction de période depuis le PDF** : FR3 nécessite de connaître la période couverte par le PDF avant la dédup par chevauchement. Proposition : tenter l'extraction depuis le texte du relevé en premier dans `pdf-extractor.ts`, avec fallback via dates min/max des transactions extraites. À acter dans la story d'ingestion.

**Nice-to-Have Gaps :**

- **G4 — Tests coverage enforcement** : NFR18 cible 100% sur les calculs, sans mécanisme automatique d'enforcement en V1. Acceptable, à formaliser dans `CLAUDE.md`.
- **G5 — Snapshots de calcul** : tests forecast bénéficieraient de snapshots reproductibles. Mentionné dans l'arbo (`tests/fixtures/snapshots/`) mais pas formalisé. À inclure dans la première story qui touche `forecast-engine.ts`.

### Architecture Completeness Checklist

**Requirements Analysis**
- [x] Project context thoroughly analyzed
- [x] Scale and complexity assessed
- [x] Technical constraints identified
- [x] Cross-cutting concerns mapped

**Architectural Decisions**
- [x] Critical decisions documented with versions
- [x] Technology stack fully specified
- [x] Integration patterns defined
- [x] Performance considerations addressed

**Implementation Patterns**
- [x] Naming conventions established
- [x] Structure patterns defined
- [x] Communication patterns specified
- [x] Process patterns documented

**Project Structure**
- [x] Complete directory structure defined
- [x] Component boundaries established
- [x] Integration points mapped
- [x] Requirements to structure mapping complete

### Architecture Readiness Assessment

**Overall Status : READY WITH MINOR GAPS**

3 gaps mineurs (G1-G3) identifiés, aucun bloquant : tous résolubles dans le scope de la story d'amorçage ou de la première story de chaque domaine concerné. Aucun ne nécessite de remettre en cause l'architecture.

**Confidence Level : Élevé.** L'architecture est cohérente, complète, alignée sur les NFRs critiques (intégrité numérique, sécurité minimale, maintenabilité solo). Le risque résiduel principal est l'exécution disciplinée des conventions par Claude Code — c'est précisément le rôle de `CLAUDE.md`.

**Key Strengths :**
- Branded type `Cents` éliminant une classe entière d'erreurs monétaires.
- Boundaries claires (parser PDF, service LLM, accès DB) facilitant le test et l'évolution Growth.
- Forecast en fonction pure → reproductible, testable, snapshot-friendly.
- Schémas Zod partagés client/serveur → une seule source de vérité par entité.
- Séparation propre server-state / UI-state évitant la duplication d'état.

**Areas for Future Enhancement (Growth/Vision) :**
- Migration `db:push` → `db:generate + apply-migration` (déjà préparé via les scripts).
- Cache forecast côté serveur si la perf devient un sujet.
- Détection automatique des remboursements de dette par pattern de libellé.
- Apprentissage des corrections de catégorisation.
- CI + déploiement cloud.

### Implementation Handoff

**AI Agent Guidelines :**
- Suivre `CLAUDE.md` (à rédiger en story 1) qui codifiera les principes KISS/SOLID/DRY, sécu, et règles d'enforcement de ce document.
- Respecter intégralement les patterns d'implémentation et anti-patterns listés.
- Tout écart de structure ou pattern doit être discuté et documenté avant code.

**First Implementation Priority — Story 1 (bootstrap) :**

```bash
npx nuxi@latest init personnalFinance
cd personnalFinance
yarn install
# Configuration nuxt.config.ts (ssr: false, modules pinia)
# yarn add des dépendances (cf. Starter Template Evaluation)
# Création tsconfig strict, drizzle.config.ts, vitest.config.ts, playwright.config.ts
# Création .env.example, .gitignore (incluant _data/, .env, .output/, .nuxt/)
# Rédaction CLAUDE.md initial (KISS/SOLID/DRY, sécu, conventions, gaps G1-G5)
# Création shared/types/money.ts (branded Cents) — avant tout code métier
# Création server/db/schema.ts initial (tables vides à compléter au fil des stories)
# Création server/middleware/0.bootstrap.ts (init _data/, seed catégories par défaut)
# yarn db:push pour créer la base
# Premier yarn dev pour vérifier que tout démarre
```

**Story 2 et au-delà :** suivre l'ordre suggéré dans la section "Implementation Sequence" de Core Architectural Decisions.
