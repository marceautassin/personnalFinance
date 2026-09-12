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
  - step-04-decisions-amendment (2026-09-04)
  - step-05-patterns-amendment (2026-09-04)
  - step-07-validation-amendment (2026-09-04)
  - step-08-complete-amendment (2026-09-04)
inputDocuments:
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/planning-artifacts/prd-v1-forecast.md (archivé — document d'entrée d'origine)
  - ~/Downloads/Dépenses 2022(1).xlsx (tableur manuel — origine du modèle à 2 niveaux)
workflowType: 'architecture'
project_name: 'personnalFinance'
user_name: 'Marceau'
date: '2026-04-30'
status: 'amended — NOT READY (structure et contexte à décrire après suppression)'
completedAt: '2026-04-30'
amendedAt: '2026-09-04'
amendmentNote: >-
  Amendement lourd suite à la réécriture du PRD. D11-D16 retirées, D4 remplacée,
  D5/D8/D9 amendées, D17 à D27 ajoutées. Statut de préparation NOT READY : les
  sections Contexte et Structure décrivent encore l'ancien produit et seront
  reprises après la suppression du périmètre mort.
---

# Architecture Decision Document — personnalFinance

**Author:** Marceau
**Date:** 2026-04-30

_Ce document est construit collaborativement étape par étape. Les sections sont ajoutées au fil des décisions._

## Project Context Analysis

> **Réécrite le 2026-09-04**, après la réécriture du PRD et l'exécution de la suppression du périmètre mort. La version d'avril 2026 décrivait le forecast inverse et le dividende SAS ; elle est remplacée, non amendée. L'historique reste dans git.

### Requirements Overview

**39 FRs en 7 domaines de capability** (contre 54 en 11 domaines dans le PRD v1) :

| Domaine | FRs | Implications architecturales |
|---|---|---|
| Ingestion des relevés | FR1-FR9 | Boucle client, un appel par fichier, serveur sans état (D22) · dédup par hash · échec isolé |
| Fiabilité et réconciliation | FR10-FR14 | Vérification obligatoire post-extraction, état « non fiable » propagé au niveau période (D23) |
| Référentiel de catégories | FR15-FR19 | Deux tables, nature portée par le poste (D17) · FK `RESTRICT` |
| Catégorisation et correction | FR20-FR24 | Service LLM isolé (D20) · `is_manual` comme mesure du taux de correction |
| Analyse — répartition | FR25-FR30 | Moteur pur, arbre nature → rubrique → poste (D19) · exclusion des mouvements internes |
| Analyse — évolution et indicateurs | FR31-FR34 | Série par granularité · `previousTotalCents` calculé dans le moteur (D24) · type `Ratio` |
| Traçabilité | FR35-FR36 | Deux endpoints, jamais de précalcul des lignes (D19) |

Trois FRs (FR37-FR39 — synthèse narrative, dépenses récurrentes, comparaison de deux périodes) sont en phase Croissance et n'appellent aucune décision au MVP.

**23 NFRs — les cinq drivers architecturaux réels :**

- **Justesse financière (NFR1-NFR4)** ⇒ `Cents` entiers de la base à l'écran, type `Ratio` distinct pour les taux, traçabilité de tout montant jusqu'à ses lignes, séparation stricte du résultat (hors mouvements internes) et du solde bancaire (tout compris). C'est le driver dominant : ce produit additionne, mais l'utilisateur décide sur le résultat.
- **Fiabilité des données (NFR10-NFR13)** ⇒ réconciliation non contournable, état « non fiable » propagé, base reconstructible depuis les PDF, échec d'un relevé sans effet sur les autres.
- **Confidentialité (NFR5-NFR9)** ⇒ stockage exclusivement local, payload LLM borné à date/libellé/montant, inférence en Europe, clé en variable d'environnement, pas d'auth.
- **Intégration LLM (NFR14-NFR17)** ⇒ boundary à un seul fichier, validation de conformité côté application avec relance bornée, le LLM ne calcule rien, mode dégradé qui laisse l'analyse consultable.
- **Maintenabilité (NFR21-NFR22)** ⇒ extraction PDF confinée, aucune constante métier structurante dans une fonction de calcul.

**NFR23 — aucune cible de performance en V1.** Un point de vigilance seulement : le temps d'agrégation de l'historique complet à chaque changement de période, à mesurer lors de la première ingestion réelle.

### Scale & Complexity

- **Échelle** : 1 utilisateur, 1 compte bancaire, ~24 relevés sur 2 ans, ~2 400 transactions au total. Volume trivialement absorbable par SQLite local. Le second compte (Crédit Mutuel) est en Vision, pas au MVP.
- **Complexité fonctionnelle** : faible à moyenne. Elle a **baissé** avec le pivot — la richesse résidait dans le modèle fiscal français (SAS, IS, PFU, ARE, exercice fiscal), qui a entièrement disparu. Ce qui reste est une agrégation sur une hiérarchie à deux niveaux.
- **Complexité technique** : moyenne, et concentrée en deux endroits. La **rigueur numérique** (centimes entiers, ratios indéfinis, réconciliation) et la **qualité de la catégorisation LLM**, qui est désormais le produit lui-même et non plus un intrant du forecast.
- **Domaine technique** : full-stack web — SPA Nuxt 4 + backend Nitro intégré, un seul processus.
- **Composants logiques** : 6 modules (Ingestion · Extraction PDF · Catégorisation LLM · Réconciliation · Analyse · Référentiel), contre 9 dans le cadrage d'avril.

### Technical Constraints & Dependencies

**Verrouillé par le PRD :**

- Stack : Nuxt 4 SPA (`ssr: false`) + Nitro + SQLite + Drizzle + `better-sqlite3` + `unpdf` + Zod + CSS vanilla (SFC `<style scoped>`) + Vitest + Playwright + Yarn Classic
- Fournisseur LLM : **Mistral**, modèle `zai-glm-5-2`, inférence Europe (D20)
- Plateforme : Chromium et Firefox desktop. **Usage desktop exclusivement** — aucun écran n'est conçu pour le mobile
- Persistance : SQLite locale, pas de cloud, pas d'auth
- Graphiques : **SVG inline, sans bibliothèque tierce**

**Dépendances externes réelles** — une seule intégration réseau, le fournisseur LLM :

`@mistralai/mistralai` (à substituer à `@anthropic-ai/sdk` en story 13-5) · `unpdf` · `drizzle-orm` + `better-sqlite3` · `zod` · `pinia`.

*Reka UI, envisagé en avril, n'a jamais été introduit : tous les composants sont écrits à la main. Le retirer de la liste des dépendances est un constat, pas une décision.*

**Limite d'outillage connue** : Playwright ne fournit pas de binaire Firefox pour `ubuntu26.04-x64`. Firefox reste un engagement produit ; sa vérification est manuelle sur le poste actuel.

### Cross-Cutting Concerns

1. **Représentation monétaire** — `Cents` de la colonne SQLite jusqu'au composant. Les montants sont **signés** : négatif pour les sorties, positif pour les entrées (`schema.ts`). Les taux relèvent du type `Ratio`, jamais de `Cents`.
2. **Réconciliation comme invariant** — toute ingestion la déclenche, aucun chemin ne la contourne, et l'état « non fiable » remonte jusqu'à la réponse d'analyse au niveau période (D23).
3. **Traçabilité (NFR2)** — contrainte transverse la plus structurante après la représentation monétaire. Tout montant affiché doit avoir un chemin vers ses lignes. Elle interdit tout agrégat précalculé et toute valeur produite par le LLM.
4. **Recalcul à la demande** — aucun cache serveur, aucun agrégat persisté. Toute mutation invalide les `useFetch` concernés via l'instance capturée (D8 amendée).
5. **Coût et surface d'erreur LLM** — un appel par relevé, idempotent par hash. La conformité de la réponse est vérifiée chez nous, la justesse des montants par la réconciliation.
6. **Discipline de test** — les fonctions de calcul sont pures et testées sans base (NFR3). Les cas limites sont nommés par le PRD : période vide, recettes nulles, signe inattendu pour la nature (tranché en D28).
7. **Accessibilité** — trois règles, chacune adossée à un bug réellement constaté : jamais de `disabled` porteur d'information, jamais de désactivation d'un élément focalisé, raison d'indisponibilité dans le nom accessible.

*Les préoccupations « domaine français » et « détermination des top écarts » de la version d'avril disparaissent : la première avec la fiscalité SAS, la seconde avec le dashboard narratif que FR34 remplace par un classement déterministe des écarts entre périodes.*
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

### Phase 1.x — Décisions multi-profils / multi-comptes (D11-D15, actées le 2026-09-04)

Amendent le Sprint Change Proposal du 2026-07-12 (§4.2). D11 et D14 sont reprises telles
quelles ; **D12 est amendée**, D15 est nouvelle.

**D11 — Modèle multi-profils/comptes.** Tables `profiles (id, name, kind: owner|managed,
created_at)` et `accounts (id, profile_id FK, name, bank, created_at)`.

**D12 — Scoping : observé par compte, déclaré par profil.** *(amendée — la rédaction initiale
scopait `fixed_charges`, `revenue_models` et `monthly_overrides` par compte)*

La découpe n'est pas technique, elle est sémantique. Deux natures de données :

| Nature | Portée | Tables |
|---|---|---|
| **Observé** — ce que la banque dit | **Compte** | `bank_statements` porte `account_id` ; `transactions` héritent via `statement_hash` (aucune dénormalisation, invariant « aucun état dérivé ») |
| **Déclaré** — le modèle financier de la personne | **Profil** | `fixed_charges`, `revenue_models`, `monthly_overrides`, `sas_config`, `tax_settings`, `debts` portent `profile_id` |

Motif : le forecast répond à « quel dividende voter pour couvrir **mes** dépenses ». C'est une
question qui porte sur une personne, pas sur un compte. Le forecast d'un compte isolé est une
réponse partielle à une question qui ne se pose pas. Scoper les charges par compte obligerait à
répartir loyer et ARE entre comptes à la saisie — du travail pour produire une donnée moins vraie.

Conséquences : **une seule table reçoit `account_id`**. Le forecast d'un profil `owner`
consolide les projections variables de tous ses comptes. Les stories 8.3 et 8.4 s'allègent
(l'essentiel du re-scoping devient « ajouter un `profileId` »), et le sélecteur de contexte est
d'abord un **sélecteur de profil**, le filtre compte n'existant que sur `/import`,
`/transactions/[period]` et le dashboard.

Renoncement assumé : pas de forecast par compte isolé (YAGNI).

**D13 — Forecast/reconciler scopés.** `computeForecast({ profileId, ... })` *(et non
`accountId`, conséquence de D12 amendée)*. `reconcile` inchangé, déjà par statement.
Forecast et dividende actifs **seulement si `profile.kind === 'owner'`**.

**D14 — Extraction dispatchée.** `extractStatement(buffer, bank)` route vers une stratégie
(`boursorama`, …). Chaque stratégie encapsule parsing texte / période / soldes (G3 par format).

**D15 — Migration de scoping : wipe & re-seed.** La story 8.1 recrée la base plutôt que de
migrer l'existant : seed d'un profil `owner` « Marceau » + un compte Boursorama, puis
ré-ingestion des PDFs conservés dans `_data/raw/`.

Sanctionné par NFR11 (« la perte totale de la base est acceptable ; la base doit pouvoir être
reconstruite intégralement à partir des PDFs sources »). Mesuré au 2026-09-04 : 2 relevés,
207 transactions, 1 modèle de revenu, 0 dette, 0 charge fixe, et les 2 PDFs sources présents.
Un back-fill additif imposerait un rebuild de ~7 tables SQLite (une FK `NOT NULL` exige la
procédure en 12 étapes) pour préserver 207 lignes ré-ingérables en 2 appels LLM.

⚠️ **Cette décision a une date de péremption.** Le coût du wipe croît avec chaque mois ingéré
et chaque correction manuelle de catégorie. Avec un an d'historique, l'arbitrage s'inverse et
le back-fill redevient le bon choix. **Exécuter 8.1 tôt est donc une décision d'architecture,
pas seulement de planning.**

**D16 — Compte-courant conjoint : `debts` rendu signé, pas de table dédiée.** *(question
ouverte du 2026-07-12, close le 2026-09-04 par la revue de l'epic 6)*

Le critère de résolution était : `debt-balance.ts` produit-il un solde signé ? **Non.** La revue
a établi trois verrous : `initial_balance_cents` contraint ≥ 0 (`NonNegativeCentsSchema`), donc
une créance est inexprimable ; `debt_advances.amount_cents` en `positive()`, donc aucun événement
ne peut diminuer le solde hors transaction marquée ; et `transactions/[id].patch.ts:51` refuse
tout `amountCents >= 0`, donc un règlement **entrant** du conjoint ne peut pas être rattaché.

Le modèle livré **ne supporte pas FR66-FR68** tel que le PRD l'annonce. FR66 (« s'appuie sur le
modèle Dettes ») repose sur une hypothèse fausse.

Décision : **pas de table `shared_ledger`** — la règle de trois tient (un seul cas d'usage), et
deux mécaniques de solde en parallèle coûteraient plus que le problème. Mais on ne réutilise pas
un modèle incapable de porter le cas : `debt_advances` est remplacée par un **ledger d'événements
signés** `debt_events(debt_id, event_date, amount_cents SIGNED, kind, source_transaction_id)`, et
`initial_balance_cents` devient signé (ou reçoit une `direction`).

⚠️ **À exécuter dans l'epic 6, pas dans l'epic 10.** Même logique que D15 : aujourd'hui
`debt_advances` contient **0 ligne** — c'est une migration de schéma sans données. Reporté à
l'epic 10, c'est la réécriture de `debt-balance.ts`, du PATCH transactions et de trois endpoints,
sur du code entre-temps consommé par le forecast. Le coût est asymétrique et croissant.

Conséquence sur le périmètre : l'epic 6 cesse d'être « 4 stories en attente de patches de revue »
et redevient un chantier de modélisation. À arbitrer côté produit.

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

> **Réécrite le 2026-09-04.** La version d'avril décrivait une arborescence projetée, incluant le forecast, la SAS et les dettes. Celle-ci décrit l'arborescence **réelle après suppression**, constatée par `git ls-files`, et distingue explicitement ce qui existe de ce que les epics 12 à 15 ajouteront.

### Arborescence réelle (2026-09-04, après suppression)

```
personnalFinance/
├── CLAUDE.md · README.md · package.json · yarn.lock · tsconfig.json
├── nuxt.config.ts · drizzle.config.ts · vitest.config.ts · playwright.config.ts
├── eslint.config.mjs · .env.example · .gitignore · .mcp.json
├── public/                            favicon.ico · robots.txt
│
├── app/                               FRONTEND — SPA Nuxt, aucun accès direct au réseau
│   ├── app.vue
│   ├── layouts/default.vue
│   ├── assets/styles/                 reset.css · tokens.css · global.css
│   ├── pages/
│   │   ├── index.vue                  Dashboard mensuel (remplacé par l'epic 15)
│   │   ├── import.vue                 Dépôt de relevés
│   │   ├── categories.vue             Référentiel (réécrit par l'epic 12)
│   │   ├── transactions/[period].vue  Liste par période + éditeur de catégorie
│   │   └── reconciliation/[hash].vue  Résolution d'un écart
│   ├── components/
│   │   ├── shared/                    AppHeader · AppNav · ConfirmDialog · ReliabilityBadge
│   │   ├── ingestion/                 PdfDropZone · IngestionProgress · PeriodOverlapDialog
│   │   ├── transactions/              TransactionList · TransactionRow · CategoryEditor
│   │   ├── categories/                CategoryList · CategoryForm
│   │   ├── reconciliation/            ReconciliationGap · AddManualTransaction
│   │   └── dashboard/                 BalanceSummary · MonthlyNarrative · MonthSelector
│   ├── composables/                   useApiError · useCategories · useCategoryAdmin
│   │                                  useDashboard · useDirtyForm · useInvalidate
│   │                                  useMutations · useReconciliation · useStatements
│   │                                  useTransactions
│   └── utils/                         api-mutate.ts · euros.ts
│
├── server/                            BACKEND Nitro
│   ├── api/
│   │   ├── statements/                index.post · index.get · [hash].get
│   │   ├── transactions/              index.get · [id].patch
│   │   ├── categories/                index.get · index.post · [code].patch · [code].delete
│   │   ├── reconciliation/[hash].post
│   │   └── dashboard.get.ts
│   ├── services/                      pdf-extractor · llm-categorizer · reconciler
│   │                                  statement-ingestion-orchestrator · charge-suggester
│   ├── db/
│   │   ├── client.ts · schema.ts      4 tables
│   │   └── migrations/                0000_charming_starbolt · 0001_smiling_bloodaxe + meta/
│   ├── middleware/0.bootstrap.ts      création de _data/, migrations, seed, assertSchemaUpToDate
│   └── utils/                         errors · validation · hash · period · file-storage
│                                      category-fk · category-labels · category-references
│
├── shared/                            PARTAGÉ client ⇄ serveur
│   ├── types/money.ts                 branded type `Cents` + helpers
│   ├── schemas/                       category · statement · transaction
│   │                                  reconciliation · ingestion-result · api-errors
│   └── constants/                     default-categories · protected-categories
│                                      bank-statement-llm-prompt
│
├── tests/
│   ├── e2e/                           global-setup + categories · categories-ingestion
│   │                                  dashboard · ingestion · reconciliation
│   └── fixtures/pdfs/                 (vide — .gitkeep)
│
└── _data/                             GITIGNORÉ — raw/*.pdf, personnalfinance.db, e2e.db
```

Les tests unitaires sont **co-localisés** (`*.test.ts` à côté du fichier testé), conformément à `CLAUDE.md`. Seuls les E2E vivent dans `tests/`.

**Volumétrie constatée** : 23 fichiers de tests unitaires / 252 tests, 5 specs E2E, lint et typecheck verts.

### Ce que les epics 12 à 15 ajoutent

Aucun nouveau répertoire de premier niveau. Les ajouts se logent dans la structure existante :

| Epic | Fichiers créés | Fichiers réécrits |
|---|---|---|
| 12 | `shared/types/movement-nature.ts` · `shared/constants/default-referential.ts` · migration `0002` · `server/api/categories/groups.*` | `schema.ts` · `categories.vue` · `CategoryList.vue` · `CategoryForm.vue` · `category.schema.ts` |
| 13 | — | `llm-categorizer.ts` · `bank-statement-llm-prompt.ts` · `CategoryEditor.vue` · `transactions/[id].patch.ts` |
| 14 | `app/components/ingestion/IngestionQueue.vue` · `server/api/statements/[hash].delete.ts` | `import.vue` · `useStatements.ts` · `IngestionProgress.vue` |
| 15 | `shared/types/ratio.ts` · `server/services/analysis-engine.ts` (+ test) · `server/api/analysis.get.ts` · `app/pages/analyse.vue` · composants de graphiques SVG · `useAnalysis.ts` | `index.vue` |

`default-categories.ts` et `dashboard.get.ts` disparaissent respectivement aux epics 12 et 15.

### Frontières — ce qui n'a pas le droit de traverser

| Frontière | Règle | Vérifiable par |
|---|---|---|
| Extraction PDF | `unpdf` n'est importé que par `server/services/pdf-extractor.ts` | `grep -r "from 'unpdf'" --exclude=pdf-extractor.ts` |
| Fournisseur LLM | Le SDK n'est importé que par `server/services/llm-categorizer.ts` | idem sur le nom du paquet |
| Base de données | Accès uniquement via `server/db/client.ts` ; **aucun `*-engine.ts` ne l'importe** | `grep -l "db/client" server/services/*-engine.ts` doit être vide |
| Réseau côté client | Aucun composant Vue ne fait `$fetch` / `useFetch` — toujours via un composable | `grep -rn "useFetch\|\$fetch" app/components/` |
| Écriture en base | Drizzle uniquement, pas de SQL brut hors migrations | revue |
| Langue | Code en anglais, libellés UI en français ; aucune énumération française en base | revue |

Ces frontières ne sont pas décoratives : c'est celle du LLM, posée en story 2-4, qui rend la bascule de fournisseur (story 13-5) confinable à un seul fichier.

### Points d'intégration

- **Un seul appel réseau sortant** : le fournisseur LLM, depuis `llm-categorizer.ts`, avec un payload borné à `{date, libellé, montant}`.
- **Système de fichiers** : `_data/raw/` en écriture à l'ingestion, en lecture à la ré-ingestion. Jamais supprimé, même quand un relevé l'est (D26).
- **SQLite** : un fichier, un processus, pas de concurrence. La base de test E2E (`_data/e2e.db`) est reconstruite depuis les migrations à chaque exécution.

### Correspondance exigences → structure

| Exigence | Où elle vit |
|---|---|
| NFR1 `Cents` | `shared/types/money.ts`, colonnes `*_cents` |
| NFR2 traçabilité | `analysis.get.ts` + `transactions/index.get.ts` (epic 15) |
| NFR3 tests des calculs | `analysis-engine.test.ts`, co-localisé (epic 15) |
| NFR4 mouvements internes | `analysis-engine.ts` (epic 15), nature portée par `category_items` |
| NFR10-NFR11 réconciliation | `reconciler.ts` + `statement-ingestion-orchestrator.ts` |
| NFR14, NFR16-NFR17 LLM | `llm-categorizer.ts` |
| NFR21 extraction PDF | `pdf-extractor.ts` |
| NFR22 constantes | `shared/constants/`, jamais dans un service de calcul |
| NFR18-NFR20 accessibilité | composants Vue, vérifié en E2E |
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
| FR23-28 (SAS) | `sas-config.*` | `shared/services/dividend-capacity` | `SasConfigForm`, `DividendCapacityCard` | ✅ |
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

---

## Décisions d'architecture — amendement du 2026-09-04

> Le PRD a été entièrement réécrit le 2026-09-04 après invalidation du cadrage initial par l'usage réel. Le document d'entrée de cette architecture était le PRD v1, aujourd'hui archivé en `prd-v1-forecast.md`. Cette section amende les décisions existantes et en ajoute cinq. Les sections antérieures restent lisibles pour la traçabilité, mais **cet amendement fait foi en cas de contradiction**.

### Décisions retirées

**D11 à D16 sont retirées** — modèle multi-profils, scoping observé/déclaré, forecast scopé, extraction dispatchée par banque, wipe & re-seed, ledger de dettes signé. Actées le matin du 2026-09-04, invalidées le soir même par la réécriture du PRD. Elles restent lisibles dans l'historique git ; les conserver ici entretiendrait la fiction d'un périmètre multi-profils.

Le multi-compte reste en **Vision** au PRD. Ces décisions seront à reprendre — pas à recycler.

### Sort des décisions D1 à D10

**Reconduites sans changement** : D1 (représentation monétaire `Cents`), D2 (stockage des dates), D3 (stockage des PDF par hash), D6 (forme des erreurs API), D7 (validation Zod aux frontières), D8 (split server-state / UI-state), D10 (lancement local).

**D4 — remplacée par D21.**

**D5 — amendée.** Disparaissent : `/api/charges`, `/api/revenues`, `/api/sas`, `/api/debts`, `/api/overrides`, `/api/forecast`, `/api/tax-settings`. Subsistent `/api/statements`, `/api/transactions`, `/api/categories`, augmentés de `/api/analysis`.

**D8 — précision née d'un défaut constaté le 2026-09-04.** `refreshNuxtData()` perd le contexte Nuxt lorsqu'il est appelé après un `await` depuis un gestionnaire d'événement du composant : le refetch ne part jamais, silencieusement, et l'écran diverge de la base. Utiliser la méthode `refresh()` de l'instance `useFetch` capturée, qui ne dépend pas du contexte ambiant.

**D9 — reconduite sous D19.** Le forecast disparaît ; son principe — fonction pure, aucun état dérivé en base, calcul à la demande — est la décision la plus solide du document d'origine.

### D17 — Référentiel hiérarchique à deux tables

> **Chiffre révisé le 2026-09-05.** D17 annonçait 41 postes, estimés avant lecture du tableur.
> Le référentiel réel, dérivé de `Dépenses 2022.xlsx` et validé par l'utilisateur, en compte
> **48**, toujours sur 13 rubriques. Le nombre n'était pas une décision : il décrivait une
> intention de granularité, que l'Excel a précisée.

Deux tables plutôt qu'un arbre auto-référencé :

```
category_groups(code PK, label, position)
category_items(code PK, group_code FK → category_groups, label, nature, position)
transactions.category_item_code FK → category_items  (ON DELETE RESTRICT)
```

`nature` ∈ `recette` | `depense` | `mouvement_interne`, **portée exclusivement par le poste**.

**Pourquoi pas l'arbre auto-référencé** : il achète une profondeur arbitraire que le PRD écarte explicitement. La généralité spéculative est ce qui a coulé la v1.
**Pourquoi pas une colonne texte** : renommer une rubrique deviendrait une mise à jour de masse, sans intégrité référentielle.

Un même libellé de poste existe sous plusieurs rubriques via des codes distincts — `resto-alimentation` et `resto-voyage` portent tous deux le libellé « Restaurant ». C'est ce qu'une liste plate ne sait pas représenter, et c'est directement issu du tableur d'origine de l'utilisateur.

**Conséquences à porter au PRD :**

- **FR22 à reformuler.** Sa rédaction actuelle — « modifier la nature d'une transaction **indépendamment de son poste** » — n'est pas satisfaisable si la nature est portée par le poste. La correction s'effectue en déplaçant la transaction vers un poste d'une autre nature.
- **Référentiel initial : 13 rubriques / 48 postes.** La treizième rubrique est **Mouvements internes** (Virement épargne · Virement entre comptes · Retrait d'espèces). Sans elle, la troisième nature n'a aucune destination et le Journey 4 — reclasser un virement mal rangé — est impossible.

### D18 — Migration par wipe et ré-ingestion

Les 207 transactions existantes ne sont pas migrées. La base est recréée et les PDF sources conservés dans `_data/raw/` sont ré-ingérés sur le nouveau référentiel.

Justifié par NFR12 (base reconstructible depuis les relevés). Mais surtout : **la ré-ingestion produit la première mesure du taux de correction sur le nouveau référentiel** et alimente le jalon de décision du MVP au lieu de le retarder. Une table de correspondance 19 → 48 postes aurait coûté du code jetable pour un résultat moins informatif.

⚠️ **Fenêtre de validité.** Le coût de cette décision croît avec chaque relevé ingéré. À exécuter **avant** l'ingestion de l'historique complet.

### D19 — Moteur d'analyse : fonction pure, deux endpoints

Reconduction du principe de D9. Aucun cache serveur, aucun agrégat persisté, aucun état dérivé en base.

**Séparation calcul / accès aux données**, sur le modèle éprouvé de `reconciler.ts` :

```
server/services/analysis-engine.ts   fonction PURE : lignes → arbre + 4 indicateurs
server/api/analysis.get.ts           fine couche d'accès aux données
```

Les cas limites imposés par NFR3 — période sans transaction, recettes nulles et division par zéro sur les taux, montant de signe inattendu — se testent alors sans base de données.

**Traçabilité (NFR2) par deux endpoints, non par précalcul :**

- `GET /api/analysis?from=&to=&granularity=` → l'arbre nature → rubrique → poste avec les montants, plus les quatre indicateurs
- `GET /api/transactions?from=&to=&item=` → les lignes derrière un nœud

Chaque nœud de l'arbre porte de quoi construire sa requête de descente. NFR2 exige que le chemin existe, pas qu'il soit transporté à chaque changement de période — renvoyer 2 400 lignes avec chaque agrégat serait un gaspillage sans bénéfice.

### D20 — Fournisseur LLM : Mistral / GLM-5.2

Modèle `zai-glm-5-2`, hébergé par Mistral, **inférence en Europe**, contexte 1 M tokens, sortie max 128 k.

**La conformité vit chez nous.** Vérification faite le 2026-09-04 sur la documentation Mistral : les « Custom Structured Outputs » injectent le schéma dans le prompt système — c'est une **instruction**, pas une contrainte au décodage. Mistral les qualifie de « plus fiables » (comparatif, jamais garantie) et recommande d'itérer sur le prompt.

En conséquence : validation systématique par Zod côté application, rejet de toute réponse non conforme plutôt qu'interprétation, plus une **relance bornée à un essai** avec l'erreur de validation renvoyée au modèle.

**Un schéma protège la FORME, jamais les VALEURS.** Un JSON parfaitement conforme peut porter un montant inventé. Ce qui l'attrape est la réconciliation contre le solde du relevé : **NFR10 est le filet, NFR14 la ceinture.** NFR14 doit être reformulé au PRD en ce sens.

**Un appel par relevé, malgré le million de tokens.** Grouper plusieurs relevés coupleraient leurs destins : une réponse malformée en empoisonnerait dix, alors que FR3 et NFR13 exigent l'isolation des échecs, et que la réconciliation est de toute façon par relevé. Le contexte long reste utile — il retire la crainte de tronquer un relevé — mais ne servira pas à grouper.

**Boundary conservée** (ex-NFR16) : `server/services/llm-categorizer.ts` reste le point d'entrée unique vers le SDK du fournisseur. C'est cette contrainte, posée en story 2.4, qui rend le changement de fournisseur confinable à un seul fichier.

### D21 — Migrations versionnées (remplace D4)

D4 prévoyait `drizzle-kit push` sans migrations versionnées jusqu'à la Phase 2. **Le réel a devancé la décision** : une baseline `server/db/migrations/0000_charming_starbolt.sql` existe depuis le 2026-09-04, et le middleware de bootstrap porte un `assertSchemaUpToDate()` qui refuse de démarrer sur un schéma périmé.

Motif : `drizzle-kit push` est interactif sur ce projet (drift permanent sur `transactions`), et une base antérieure au dernier schéma démarrait sans aucun signal avant d'échouer à l'usage. Les migrations sont désormais générées, commitées, et la base de test E2E (`_data/e2e.db`) est reconstruite à chaque exécution à partir d'elles — ce qui vérifie au passage qu'elles s'appliquent réellement.

### D28 — Signe contredisant la nature : somme algébrique, sans exception

Question remontée par John pendant l'écriture de la story 15-1. NFR3 impose de tester le cas
« montant de signe inattendu pour la nature », mais aucune décision ne disait ce qu'il fallait
en faire. Cas réels attendus : remboursement de courses par un ami sur un poste *Alimentation*,
remboursement Sécu, avoir commerçant, annulation de prélèvement.

**Rappel de la convention de stockage.** `transactions.amount_cents` est **signé** : négatif pour
les sorties, positif pour les entrées. Un poste de nature `expense` porte donc normalement des
montants négatifs. Un remboursement rangé sur ce poste est un montant positif.

**Décision : le moteur somme algébriquement, en conservant le signe bancaire. Rien n'est ignoré,
rien n'est rerouté, rien n'est refusé.** Un remboursement de 30 € sur *Alimentation* diminue la
dépense d'*Alimentation* de 30 €.

`totalCents` d'un nœud est donc **signé comme les lignes qui le composent** : négatif pour un
nœud de dépense, positif pour un nœud de recette. L'orientation pour l'affichage est du ressort
de l'UI, jamais du moteur.

**Alternatives écartées, et pourquoi :**

- **Ignorer la ligne** — elle disparaîtrait du total sans disparaître du relevé. La somme des
  lignes de la descente ne vaudrait plus le montant du nœud : **NFR2 tombe**. C'est le pire des
  quatre, parce qu'il produit un écart invisible.
- **Router la ligne vers une nature déduite du signe** — contredit D17, qui porte la nature
  exclusivement sur le poste. Un même poste apparaîtrait sous deux natures, ce que la forme de
  l'arbre (`natures[] → groups[] → items[]`) ne sait pas représenter. Et un remboursement Sécu
  gonflerait les recettes, donc le taux d'épargne : le chiffre deviendrait faux dans le sens
  flatteur, le pire sens.
- **Refuser l'incohérence à l'ingestion** — un remboursement est une donnée légitime. La refuser
  bloquerait un relevé valide et contredirait NFR13.

**Ce que la somme algébrique impose à l'UI**, et qui doit être spécifié plutôt qu'improvisé :

Un poste — voire une rubrique — peut avoir un **net positif sur un nœud de dépense** quand les
remboursements dépassent les dépenses de la période. Ce n'est pas une anomalie, c'est un fait.

- Le tableau affiche la valeur telle quelle, avec son signe, sans plancher à zéro.
- **La répartition proportionnelle exclut les nœuds à net inversé.** Une part d'un tout ne peut
  pas être négative ; la base du graphique est la somme des seuls nets orientés dans le sens de
  la nature. Les nœuds exclus restent visibles dans le tableau, avec une mention explicite.
- Aucun `Math.abs` dans le moteur. La valeur absolue est une décision de rendu.

*Corollaire pour NFR3 : le cas limite « signe inattendu » n'est plus un comportement à définir
mais un test à écrire — la somme algébrique le traite par construction. Le test qui compte est
celui du **nœud à net inversé** et de son exclusion de la base du graphique.*

### D29 — Structure plate des artefacts, actée

L'outil de suivi Vigie attend `planning-artifacts/<chantier>/` ↔ `implementation-artifacts/<chantier>/`.
Ce projet est **plat depuis son origine** : les documents de planification à la racine de
`planning-artifacts/`, les 39 fichiers de stories à la racine de `implementation-artifacts/`.

**Décision : on reste plat.** Le dépôt est le chantier.

Le motif de la convention Vigie est de distinguer plusieurs chantiers coexistant dans un même
dépôt, et d'éviter qu'un nom divergent entre planification et implémentation ne produise un
chantier fantôme d'un côté et un avancement sans titres de l'autre. **Ici les deux côtés sont
plats, donc cohérents, et il n'y a qu'un seul chantier.** La règle globale prévoit explicitement
ce cas : « chaque projet peut préciser dans son propre `CLAUDE.md` où vivent ces fichiers ».

Ce qu'introduire un sous-dossier maintenant coûterait, sans rien acheter : déplacer 39 fichiers
de stories livrées, casser les chemins cités dans les revues et les commits passés, et créer
précisément la scission que la convention cherche à éviter — un `planning-artifacts/<chantier>/`
neuf face à un `implementation-artifacts/` racine peuplé.

À reconsidérer le jour où un second chantier apparaîtrait dans ce dépôt. Pas avant.

### Decision Impact Analysis — séquence d'implémentation

Ordre imposé par le PRD (§ Séquencement du MVP), avec le jalon de décision :

1. Suppression du périmètre mort (~8 830 lignes / 87 fichiers)
2. **D17** — nouveau référentiel à deux tables, 13 rubriques / 48 postes
3. **D18** — wipe et ré-ingestion
4. **D20** — bascule du fournisseur LLM
5. Ingestion des relevés d'historique → **MESURE DU TAUX DE CORRECTION** (seuil ≤ 10 %)
6. **D19** — moteur d'analyse et vues, seulement si le jalon est franchi

**Dépendances croisées :**

- **D17 précède D18** : on ne ré-ingère que sur un référentiel cible existant.
- **D17 précède D20** : le prompt de catégorisation doit décrire la hiérarchie à deux niveaux et les trois natures.
- **D18 et D20 précèdent la mesure** : le taux de correction n'a de sens que sur le référentiel et le modèle définitifs.
- **D19 dépend de D17** : l'arbre d'agrégats épouse la structure rubrique → poste.
- **D1 (`Cents`) traverse tout** : agrégats, indicateurs, taux. Les quatre indicateurs produisent des **ratios**, qui ne sont pas des `Cents` — le typage doit les distinguer explicitement pour éviter qu'un taux soit formaté en euros.

---

## Implementation Patterns — amendement du 2026-09-04

> La section `## Implementation Patterns & Consistency Rules` d'avril 2026 **reste valable** pour le nommage des tables, le format des erreurs et les conventions de fichiers. Cet amendement ajoute les patterns nés des décisions D17 à D21, et corrige explicitement ce qui doit l'être.

### Correction de D17 — énumération en anglais

```ts
// shared/types/movement-nature.ts
export const MOVEMENT_NATURES = ['income', 'expense', 'internal_transfer'] as const
export type MovementNature = typeof MOVEMENT_NATURES[number]
```

D17 avait écrit `recette | depense | mouvement_interne`, en contradiction avec la règle du projet — **code en anglais, libellés UI en français**. Les libellés FR vivent dans l'UI, jamais en base.

### Le type `Ratio` — distinct de `Cents`

Deux des quatre indicateurs sont des taux, pas des montants. Sans type distinct, rien n'empêche un taux d'épargne de `-1,90` d'être typé `Cents` et rendu « −0,02 € » par `formatEuros`.

```ts
// shared/types/ratio.ts
export type Ratio = number & { readonly __brand: 'Ratio' }

/** Construit un Ratio. `null` si le dénominateur est nul — le taux n'est pas défini. */
export const ratio = (numerator: number, denominator: number): Ratio | null =>
  denominator === 0 ? null : (numerator / denominator) as Ratio

/** Formate un Ratio en pourcentage fr-FR. `null` → « — ». */
export const formatRatio = (r: Ratio | null): string =>
  r === null ? '—' : new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 1 }).format(r)
```

**Un taux indéfini se voit comme indéfini.** Renvoyer `0` mentirait : un mois sans recette et avec 800 € de dépenses n'a pas un taux d'épargne nul, il n'en a pas. Même logique que l'état « non fiable » d'un relevé — dire qu'on ne sait pas vaut mieux qu'inventer.

- ❌ `taux: 0` quand `recettes === 0`
- ❌ `Infinity` ou `NaN` qui remontent jusqu'à l'écran
- ✅ `null`, propagé jusqu'à l'affichage, rendu « — »

### Représentation d'une période — bornes explicites

```
GET /api/analysis?from=2026-01-01&to=2026-03-31&granularity=quarter
GET /api/transactions?from=2026-03-01&to=2026-03-31&item=alimentation-restaurant
```

Les bornes définissent le **périmètre**, la granularité définit le **découpage de la série**. Deux notions distinctes qu'un identifiant unique (`2026-Q1`) confondrait, et qui divergeraient dès qu'une plage libre serait demandée.

`granularity` ∈ `month` | `quarter` | `year`. Dates au format `YYYY-MM-DD` (D2).

- ❌ `?period=2026-Q1`
- ❌ `?month=2026-03` sur un endpoint acceptant aussi des trimestres

### Nommage du référentiel

**Tables** : `category_groups`, `category_items` — snake_case pluriel, conforme à l'existant.

**Codes de poste** : `<rubrique>-<poste>`.

```
alimentation-restaurant      Restaurant          (rubrique Alimentation)
voyages-restaurant           Restaurant          (rubrique Voyages)
transports-carburant         Carburant
internes-virement-epargne    Virement épargne
```

Le code reflète le chemin dans la hiérarchie ; un `ORDER BY code` produit un ordre naturellement groupé par rubrique.

Les codes restent **en français**, par continuité avec l'existant (`remboursement_dette`, `loyer_sas`) : ce sont des identifiants de donnée métier éditée par l'utilisateur, pas des identifiants de code.

- ❌ `restaurant-alimentation` — dissocie au tri les postes d'une même rubrique
- ❌ des codes numériques

### Forme de l'arbre d'analyse

`GET /api/analysis` renvoie un arbre imbriqué, chaque nœud portant de quoi construire sa descente :

```
natures[] → { nature, totalCents, groups[] }
  groups[] → { groupCode, label, totalCents, items[] }
    items[] → { itemCode, label, totalCents, transactionCount }
```

Plus les indicateurs de la période, et la série par granularité pour la vue évolution.

**L'arbre ne transporte jamais les transactions.** NFR2 exige que le chemin existe, pas qu'il soit précalculé : `itemCode` plus les bornes suffisent à appeler `/api/transactions`.

### Séparation calcul / accès aux données

```
server/services/*-engine.ts   fonction PURE — reçoit des lignes, ne touche jamais la base
server/api/*.get.ts           couche mince — va chercher les lignes, appelle le moteur
```

C'est ce qui a rendu `reconciler.ts` testable, et ce qui rend vérifiables sans base les cas limites de NFR3 : période vide, recettes nulles, signe inattendu.

- ❌ Un service de calcul qui importe `~~/server/db/client`

### Invalidation côté client

```ts
// ✅ l'instance capturée, insensible au contexte
const fetchState = useFetch('/api/analysis', { key: 'analysis' })
await fetchState.refresh()

// ❌ perd le contexte Nuxt après un await — le refetch ne part JAMAIS, silencieusement
await refreshNuxtData('analysis')
```

Défaut constaté le 2026-09-04 : un `PATCH` partait, aucun `GET` ne suivait, l'écran affichait l'ancienne valeur pendant que la base portait la nouvelle. **Divergence silencieuse entre l'écran et la donnée** — le pire mode de défaillance pour ce produit.

### Accessibilité — trois règles, trois bugs constatés

```vue
<!-- ✅ reste focalisable, la raison est annoncée -->
<button :aria-disabled="blocked" :aria-label="blocked ? `Supprimer ${label} — ${reason}` : `Supprimer ${label}`">

<!-- ❌ sort du tab order, la raison devient inatteignable au clavier -->
<button :disabled="blocked" :title="reason">
```

1. Aucun contrôle interactif ne sort du tab order pour signaler son indisponibilité.
2. **Ne jamais désactiver un élément qui détient le focus** — il retombe sur `<body>`.
3. Toute raison d'indisponibilité vit dans le nom accessible, pas seulement dans un `title` au survol.

### Enforcement — ce que tout agent DOIT respecter

- Aucun montant en flottant. `Cents` pour les montants, `Ratio` pour les taux, **jamais l'un pour l'autre**.
- Aucun `*-engine.ts` n'importe le client de base de données.
- Aucun taux ne vaut `0` par défaut quand son dénominateur est nul.
- Aucun `disabled` sur un contrôle porteur d'information.
- Aucun `refreshNuxtData` après un `await` dans un gestionnaire d'événement.
- Aucune énumération en français dans le code ; aucun libellé anglais dans l'UI.

---

## Architecture Validation Results — amendement du 2026-09-04

> La section `## Architecture Validation Results` d'avril validait l'architecture contre le PRD v1. Elle est **caduque**. Cette section la remplace.

### Décisions prises pour combler les trous détectés en validation

**D22 — Ingestion par boucle client.** Le client itère sur les fichiers déposés et appelle `POST /api/statements` une fois par fichier. Le serveur reste sans état. La progression est l'état de la boucle ; un échec est capturé par fichier et n'interrompt pas les suivants — **FR3 et NFR13 satisfaits par construction**, sans file ni machinerie de reprise.

Renoncement assumé : fermer l'onglet pendant l'ingestion perd la progression. La reprise consiste à redéposer les fichiers — le hash rend l'opération idempotente (D3). Pour une opération effectuée une fois dans la vie du produit, une file serveur avec état persisté et endpoint de suivi serait disproportionnée.

**D23 — Fiabilité portée au niveau période.** La réponse de `/api/analysis` porte :

```
reliability: 'reliable' | 'degraded'
unreliableStatements: [{ hash, periodStart, periodEnd, gapCents }]
```

Au niveau **période**, pas au niveau nœud : un relevé bancal contamine tout le mois, pas une rubrique en particulier. Sans ce champ, un total calculé sur un relevé non réconcilié s'afficherait avec l'apparence de la normalité — le mode de défaillance que ce produit ne peut pas se permettre (FR12, NFR11).

**D24 — Comparaison à la période précédente dans le moteur.** Chaque nœud rubrique et poste porte `previousTotalCents`. Le moteur reçoit les lignes des deux périodes et calcule les deux arbres.

Alternative écartée : un second appel et un diff côté client — elle déplacerait du calcul vers le client, en contradiction avec D19. FR34 est une question d'analyse, pas d'affichage.

**D25 — Solde bancaire exposé à côté du résultat.** La réponse d'analyse porte `bankBalance: { openingCents, closingCents } | null`, lu depuis `bank_statements`.

`null` si les relevés ne couvrent pas la période de façon contiguë — un trou dans l'historique rend le solde de période indéterminé, et l'afficher serait faux. Les deux chiffres coexistent : le **résultat** exclut les mouvements internes (NFR4), le **solde** les inclut. Ils répondent à deux questions différentes et ne doivent jamais être confondus.

**D26 — Suppression d'un relevé : les lignes partent, le PDF reste.** `DELETE /api/statements/:hash` supprime la ligne `bank_statements` ; les transactions suivent par la FK `ON DELETE CASCADE` existante. **Le fichier de `_data/raw/` est conservé.**

Motif : NFR12 impose que la base soit reconstructible depuis les PDF ; supprimer le fichier détruirait cette garantie. La déduplication portant sur la ligne en base et non sur le fichier, une ré-ingestion reste possible immédiatement après suppression.

**D27 — Mode dégradé sur indisponibilité du fournisseur LLM.** L'ingestion d'un relevé est **atomique** : rien n'est persisté tant que l'extraction et la réconciliation n'ont pas abouti. En cas d'indisponibilité, le fichier échoue avec un message explicite, les autres continuent (D22), et **toutes les données déjà ingérées restent consultables** — l'analyse ne dépend d'aucun appel LLM.

Conséquence directe de NFR15 : la lecture du produit ne dépend jamais du fournisseur.

### Cohérence

**Compatibilité des décisions.** D19 (fonction pure) et D24 (comparaison) se composent : le moteur reçoit deux jeux de lignes et rend deux arbres. D22 (boucle client) et D20 (un appel par relevé) sont alignés — un fichier, un appel, un destin. D18 (wipe) suit D17 (référentiel) dans la séquence, sans quoi la ré-ingestion n'aurait pas de cible.

**D28 et NFR2 se renforcent.** La somme algébrique est la seule des quatre options qui garantit que la somme des lignes de la descente vaut le montant du nœud, au centime. La traçabilité n'est pas un contrôle a posteriori : elle est ce qui a écarté trois options sur quatre.

**Une tension résolue.** D1 impose `Cents` sur toute valeur monétaire ; deux des quatre indicateurs sont des ratios. Le type `Ratio` lève l'ambiguïté — sans lui, un taux d'épargne de −1,90 s'afficherait « −0,02 € ».

**Une tension apparente sur NFR22.** Le référentiel initial (13 rubriques, 48 postes) est une constante. NFR22 interdit les constantes métier **dans une fonction de calcul** ; un fichier de constantes consommé au seed ne viole rien.

### Couverture des exigences

**39 FRs — tous couverts** après D22-D29. Les trois de phase 2 (FR37-39) n'appellent aucune décision au MVP.

**23 NFRs — tous couverts.** FR22 et NFR14 ont été reformulés au PRD le 2026-09-04 (cf. D17 et D20) ; le cas limite « signe inattendu » de NFR3 est tranché par D28.

**Bonne surprise sur FR24** (taux de correction manuelle) : la colonne `transactions.is_manual` existe déjà et signifie exactement « catégorie corrigée à la main ». Le taux se calcule par relevé sans ajout de schéma. Le correctif du 2026-09-04 — `isManual` posé uniquement si le patch touche la catégorie — l'a rendue fiable pour cet usage.

### Checklist de complétude

**Analyse des exigences**
- [x] Contexte projet analysé en profondeur — *section réécrite le 2026-09-04 sur le PRD réel*
- [x] Échelle et complexité évaluées
- [x] Contraintes techniques identifiées
- [x] Préoccupations transverses cartographiées

**Décisions architecturales**
- [x] Décisions critiques documentées avec versions
- [x] Pile technique spécifiée
- [x] Patterns d'intégration définis
- [x] Considérations de performance traitées *(absence de cible assumée, NFR23)*

**Patterns d'implémentation**
- [x] Conventions de nommage établies
- [x] Patterns de structure définis
- [x] Patterns de communication spécifiés
- [x] Patterns de processus documentés

**Structure du projet**
- [x] Arborescence complète définie — *constatée par `git ls-files` après suppression, avec le tableau des ajouts par epic*
- [x] Frontières des composants établies — *six frontières, chacune assortie de sa commande de vérification*
- [x] Points d'intégration cartographiés — *un seul appel réseau sortant, plus le système de fichiers et SQLite*
- [x] Correspondance exigences → structure — *table NFR → fichier*

### Statut de préparation

**Statut global : READY** *(levé le 2026-09-04)*

Toutes les cases de la checklist sont cochées. 29 décisions, patterns définis, chaque FR et NFR couvert, arborescence décrite d'après le dépôt réel.

**Ce qui a levé le statut :**

1. La suppression du périmètre mort a été **exécutée et validée** — 146 fichiers, −10 457 lignes, puis trois orphelins repérés en relisant l'arborescence (`monthly-override.schema.ts`, `rate-pct.ts` et son test) : du code sans aucun consommateur, survivant du périmètre SAS. Écrire la structure a servi à trouver ce que la suppression avait manqué.
2. Les sections **contexte** et **structure** ont été réécrites sur le produit réel, pas amendées.
3. **D28** tranche le dernier arbitrage ouvert — le signe contredisant la nature — qui rendait la story 15-1 non spécifiable.
4. **D29** acte la structure plate des artefacts, qui bloquait la création du fichier de story 12-1.

**Niveau de confiance : élevé.** Aucun arbitrage n'est en suspens pour le MVP.

**Ce qui reste ouvert, et n'est pas bloquant :** la vérification Firefox (limite d'outillage, mode à trancher), la cible de performance sur l'agrégation (à mesurer après la première ingestion réelle), l'extraction paramétrée par banque (Vision).

**Forces :** les boundaries posées en avril ont payé — le changement de fournisseur LLM tient dans un seul fichier. Le principe « fonction pure + couche d'accès » est reconduit après avoir fait ses preuves sur `reconciler.ts`. Chaque règle d'accessibilité est adossée à un bug réellement constaté, pas à une norme abstraite.

**Axes d'amélioration ultérieurs :** couverture E2E Firefox (limite d'outillage), cible de performance sur l'agrégation à mesurer après la première ingestion réelle, extraction paramétrée par banque en Vision.

### Passage à l'implémentation

**Directives pour les agents :**
- Suivre les décisions D1-D3, D5-D10 (reconduites) et D17-D29 (amendement du 2026-09-04). **D4, D11-D16 sont retirées.**
- En cas de contradiction entre une section antérieure et un amendement daté du 2026-09-04, **l'amendement fait foi**.
- Appliquer les patterns de la section `Implementation Patterns — amendement du 2026-09-04` sans exception.

**La suppression du périmètre mort est faite** (146 fichiers, −10 457 lignes, commitée le 2026-09-04).

**Première priorité d'implémentation : la story 12-1**, qui pose le référentiel à deux niveaux et vide les transactions. Elle ouvre la chaîne 12 → 13 → 14 → 15 décrite dans `epics.md`, dont le jalon de mesure du taux de correction (≤ 10 %, story 14-4) conditionne le démarrage de l'epic 15.

---

## Décisions d'architecture — amendement du 2026-09-12

Statue sur les dix contraintes AR24 à AR33 inscrites dans `epics.md` par le PM pendant le découpage
des epics 22 à 26. Elles étaient des contraintes posées, pas des décisions prises. Chacune est
ci-dessous **validée, amendée ou durcie**, et les décisions retenues portent les numéros **D30 à D36**.

Les constats ci-dessous viennent de la lecture du code, pas des documents.

### D30 — Propriété des données : le problème n'est pas la colonne, ce sont les clés

**Statue sur AR24 et AR26. AR24 est validée dans son intention et notablement durcie dans sa portée.**

AR24 dit « chaque table métier porte un propriétaire ». C'est **nécessaire et insuffisant**. Le schéma
actuel repose sur trois **clés primaires textuelles dans un espace de noms global** :

| Table | Clé primaire | Ce qui casse en multi-utilisateur |
|---|---|---|
| `category_groups` | `code` (texte) | Vocabulaire de l'utilisateur. **Collision certaine** : les deux membres auront `alimentation` |
| `category_items` | `code` (texte) | Idem, et `transactions.category_item_code` pointe dessus |
| `bank_statements` | `hash_sha256` | Collision improbable mais la déduplication (FR5) devient par membre, pas globale |

Les codes de poste sont du **vocabulaire métier édité par l'utilisateur** — c'est écrit dans
`CLAUDE.md`, et c'est précisément ce qui les rend non partageables. Deux référentiels propres à
chacun (décision produit du 2026-09-12) garantissent la collision dès le premier poste créé.

**Décision.** Le référentiel passe à une **clé primaire de substitution entière**, le couple
`(owner_id, code)` devenant une contrainte d'unicité. `transactions.category_item_code` devient une
clé étrangère vers cet identifiant. Même traitement pour `bank_statements` : le hash reste le critère
de déduplication, mais **par propriétaire**.

**Rejeté : préfixer le code par le propriétaire** (`u1:alimentation-restaurant`). C'est moins cher,
et ça fait entrer l'identité dans le vocabulaire métier. Le jour où un membre exporte ou renomme, le
préfixe fuit dans l'interface. La Rule of Three ne s'applique pas ici : on sait déjà qu'il y aura
deux propriétaires.

**Conséquence sur le coût, et c'est le vrai sujet.** SQLite ne sait pas porter d'action de clé
étrangère par `ALTER TABLE` — le code le documente déjà à propos de `settlement_group_id` et de la
migration 0007. Changer ces clés impose donc un **rebuild de table** : création, copie, bascule, pour
`category_groups`, `category_items`, `transactions`, `bank_statements` et `classification_rules`.

Sur une base dont la perte était acceptable, c'était sans enjeu. **NFR12 est inversée** : la perte
n'est plus acceptable, et `AR5` comme `D18` — migration par vidage et ré-ingestion — **ne
s'appliquent plus**. La migration doit préserver l'historique complet.

**Garde-fous exigés sur cette migration :**

- Sauvegarde vérifiée **restaurable** avant exécution. La story 23.1 en dépend, et l'ordre des epics
  la place après : **inverser cet ordre, ou dupliquer une sauvegarde ponctuelle dans la story 22.2.**
- Comptage avant / après sur chaque table, l'écart faisant échouer la migration.
- Migration versionnée et commitée (D21), jamais un `drizzle push`. La base de développement dérive
  déjà et `push` veut reconstruire `transactions` : sur cette migration-là, la différence n'est plus
  cosmétique.

**AR26 est validée telle quelle** et n'a pas besoin d'un numéro de décision : D11 à D16 décrivaient
des profils **gérés par un utilisateur unique**, sans authentification ni cloisonnement. C'est un
précédent à relire, pas un modèle à recopier. Le présent D30 les remplace définitivement.

### D31 — Le cloisonnement se pose dans quatre fichiers, et jamais dans le moteur

**Statue sur AR25. Validée sans réserve, et vérifiée dans le code.**

`server/services/analysis-engine.ts` n'importe **rien** du client de base : ses seuls imports sont
`money`, `ratio`, `movement-nature` et `granularity`. D19 tient. Le moteur ne doit pas apprendre ce
qu'est un membre.

Le filtrage se pose donc dans les points d'accès aux données, et ils sont **dénombrables** :
`server/api/analysis.get.ts`, `server/api/evolution.get.ts`, `server/api/transactions/index.get.ts`,
et `server/utils/settlement-status.ts`. Quatre endroits, pas une dispersion.

**C'est la décision la moins chère du lot, et elle porte le plus loin** : c'est elle qui rend
l'agent conversationnel (epic 26) conforme au foyer sans être retouché, puisqu'il ne consomme que ces
endpoints (NFR32). Construire l'agent avant le foyer ne coûte donc rien, **à cette condition seule**.

### D32 — « Settlement » est déjà pris, et pas seulement comme URL

**Statue sur AR27. Validée, et le problème est plus large que signalé.**

Le PM signalait une collision sur `/api/settlements`. Elle porte aussi sur la **table**
`settlement_groups` et sur la colonne `transactions.settlement_group_id`, livrées à l'epic 19 pour
les groupes de transactions qui se compensent.

**Décision.** Le règlement entre membres du foyer prend un vocabulaire **distinct et sans recouvrement**
— champ lexical de la dette et du remboursement entre personnes, pas de la compensation de lignes.
Le terme exact est laissé au développement, la contrainte est qu'aucun identifiant du foyer ne
contienne `settlement`.

**Nuance qui compte pour l'epic 25.** Les stories 25.5 et 25.6 **réutilisent délibérément** le
mécanisme de groupes de l'epic 19 : un groupe éteint la créance et neutralise l'avance en un seul
geste. Réutiliser le mécanisme est juste ; réutiliser le **nom** pour désigner deux notions
différentes ne l'est pas.

### D33 — Les trois transformations pures s'appliquent au même endroit, dans un ordre fixé

**Statue sur AR28. Validée, et complétée d'une contrainte que le découpage n'énonçait pas.**

Trois mécanismes coexistent sans fusionner : mouvement interne, dépense commune, et coupe à 50 % des
virements du compte joint (story 21.1). Le PM a raison de refuser la fusion.

**Ce qu'il manquait : leur ordre d'application.** Ce sont trois transformations pures appliquées avant
agrégation, aux mêmes points que `neutralizeSettlements`. Composées dans le désordre, elles ne donnent
pas le même résultat — une dépense commune déjà coupée par la règle du joint serait partagée deux fois.

**Décision.** L'ordre est fixé **en un seul endroit**, une fonction de composition unique que les
quatre points d'appel invoquent. Aucun appelant ne compose lui-même. C'est le défaut déjà corrigé
deux fois, en 19.4 puis en 21.1 ; une troisième transformation le rendrait certain.

### D34 — La saisie manuelle est une table à part, et `is_manual` ne doit pas la porter

**Statue sur AR29. Validée, avec un piège à nommer.**

`transactions.is_manual` existe déjà et porte **deux sens** : ligne ajoutée à la main pour résorber
un écart de réconciliation (FR13), et transaction dont l'utilisateur a corrigé le poste — c'est ce
second sens qui rend le taux de correction mesurable (FR24, jalon ≤ 10 %).

Une dépense en espèces est un **troisième** sens, et il contredit le premier : la ligne de FR13 entre
dans la réconciliation, celle de FR55 ne doit surtout pas y entrer. Réutiliser le drapeau casserait à
la fois l'invariant de réconciliation et la mesure du jalon.

**Décision.** Table distincte pour les dépenses saisies en espèces. Le moteur les reçoit comme des
lignes parmi d'autres, la réconciliation ne les voit jamais, et `is_manual` garde ses deux sens
actuels sans en acquérir un troisième.

### D35 — Concurrence : version lue portée par l'écriture

**Statue sur AR30. Validée, avec le mécanisme.**

**Décision.** Concurrence optimiste. Toute entité du décompte du foyer porte une version, entier
incrémenté à chaque écriture. Une écriture transmet la version sur laquelle elle se fonde ; si elle a
changé, l'écriture est **refusée** avec une erreur métier dédiée, jamais appliquée par-dessus.

C'est la solution ennuyeuse, et c'est pour ça qu'elle convient : pas de verrou, pas d'état serveur,
cohérente avec des endpoints sans état. À deux utilisateurs, le conflit sera rare ; il ne doit pas
être silencieux pour autant.

### D36 — L'agent remplit un formulaire, il n'appelle pas d'outil

**Statue sur AR32 et AR33. Validées, et AR32 durcie.**

Le SDK expose `responseFormat: { type: 'json_schema', strict: true }`, et le code l'utilise déjà.
**D20 a pourtant établi que cette contrainte est injectée dans le prompt, pas appliquée au décodage.**
Le drapeau `strict` décrit une intention du fournisseur, pas une garantie. L'appel d'outil emprunte
le même canal : il hérite de la même faiblesse.

**Décision, en trois points.**

L'agent produit une **requête structurée** — période, granularité, cible — validée par le code avant
exécution : bornes de dates réelles, granularité dans l'énumération connue, cible existant réellement
au référentiel du membre. Une requête invalide est rejetée par l'application.

La **grammaire est fermée**. La cible est un code du référentiel, jamais du texte libre ; la
granularité est une énumération. On ne demande pas au modèle de produire une requête, on lui demande
de **choisir parmi des valeurs qui existent**. C'est le même principe que la lecture des colonnes
Débit/Crédit : retirer une décision au modèle plutôt que mieux la lui suggérer.

Ce qui est validé côté code n'a **pas** besoin d'être fiable côté modèle. Le design tient avec un
modèle médiocre sur ce point et s'améliore si le modèle est bon. C'est ce qui permet à la story 26.1
d'être un jalon mesurable plutôt qu'un pari.

**AR33 est validée sans réserve** : un seul SDK, confiné (NFR16), inférence en Europe (NFR7), mais
deux configurations distinctes lues depuis l'environnement (NFR34). Le coût est nul, le bénéfice est
qu'un réglage de l'agent ne touche jamais le fichier de la catégorisation.

### AR31 — la porte d'exposition

**Validée, et volontairement sans numéro de décision.** C'est une règle de séquencement de projet,
pas une décision d'architecture. Elle appartient au PRD et au `sprint-status.yaml`, où elle figure
déjà. L'architecture n'a rien à y ajouter, sinon que la **story 23.1 doit précéder la migration de
D30**, ce qui est noté ci-dessus.

### Synthèse

| Contrainte | Statut | Décision |
|---|---|---|
| AR24 | **durcie** | D30 — clés de substitution, rebuild de tables, migration préservante |
| AR25 | validée | D31 — quatre points de filtrage, moteur intouché |
| AR26 | validée | intégrée à D30 |
| AR27 | **élargie** | D32 — la collision porte aussi sur la table et la colonne |
| AR28 | **complétée** | D33 — ordre d'application fixé en un seul endroit |
| AR29 | validée | D34 — table distincte, `is_manual` préservé |
| AR30 | validée | D35 — concurrence optimiste par version |
| AR31 | validée | hors architecture, sauf l'ordre 23.1 avant D30 |
| AR32 | **durcie** | D36 — requête validée par le code, grammaire fermée |
| AR33 | validée | D36 — un SDK, deux configurations |

**Aucune contrainte n'est contredite.** Deux sont durcies, une élargie, une complétée. Le découpage
du PM tenait ; ce qu'il sous-estimait est le coût de D30.

**Effet sur l'estimation.** Le foyer était présenté comme « ajouter un propriétaire aux tables ». Il
s'agit en réalité de reconstruire cinq tables en préservant deux ans de données, sur une base dont la
perte n'est plus acceptable. C'est la story la plus risquée des vingt-deux, et elle est numérotée
22.2.
