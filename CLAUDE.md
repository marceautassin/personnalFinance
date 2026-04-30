# CLAUDE.md — personnalFinance

Instructions opérationnelles pour Claude Code travaillant sur ce projet. Référence courte ; les détails complets sont dans le PRD et le doc d'architecture.

## Mission du projet

Web app Nuxt 4 SPA local-first de pilotage financier personnel. Ingère des PDFs Boursorama, catégorise via Claude API, produit un **forecast inverse 6/12/24 mois** qui calcule le dividende SAS à voter en AG annuelle pour couvrir les dépenses futures. Mono-utilisateur (Marceau), pas de cloud V1.

## Documents sources (lecture obligatoire avant toute story)

- `_bmad-output/planning-artifacts/prd.md` — 54 FRs, 18 NFRs, 5 user journeys, scope verrouillé
- `_bmad-output/planning-artifacts/architecture.md` — décisions D1-D10, structure, patterns, validations

Toute fonctionnalité non listée dans le PRD passe en Growth — ne pas l'ajouter sans amendement explicite.

## Principes (non négociables)

- **KISS** — la solution la plus directe gagne. Pas d'abstraction spéculative, pas de design pattern décoratif.
- **YAGNI** — on n'implémente que ce qui est demandé maintenant. Pas de feature flags pour fonctionnalités hypothétiques, pas de paramètres "au cas où".
- **DRY raisonnable** — duplication de 2 lignes < abstraction prématurée. Trois occurrences identiques avant de factoriser.
- **SOLID là où ça compte** — Single Responsibility et Dependency Inversion sur les services backend (parser PDF, LLM, reconciler, forecast). Les composants Vue n'ont pas besoin d'être SOLID-héroïques.
- **Tests sur ce qui est fragile** — les calculs financiers sont couverts à 100%, le reste au best-effort.

## Stack verrouillée (ne pas dévier)

| Couche | Choix |
|---|---|
| Framework | Nuxt 4, `ssr: false` (SPA) |
| Backend | Nitro intégré |
| DB | SQLite + Drizzle ORM + better-sqlite3 |
| LLM | `@anthropic-ai/sdk` + structured outputs |
| PDF | `unpdf` |
| Style | CSS vanilla (SFC `<style scoped>` + custom properties), pas de Tailwind |
| State UI | Pinia |
| Validation | Zod |
| Tests | Vitest (unit) + Playwright (E2E) |
| Package manager | Yarn Classic |

## Sécurité (garde-fous absolus)

- ❌ **Jamais** de clé API Anthropic en dur, en logs, en réponse HTTP, en commit. Toujours `process.env.ANTHROPIC_API_KEY`, `.env` gitignored.
- ❌ **Jamais** d'upload de PDF brut vers un service tiers. Les PDFs vivent dans `_data/raw/` (gitignored), uniquement.
- ❌ **Jamais** d'envoi à Claude API d'autre chose que `{date, libellé, montant}` extraits. Pas d'IBAN, RIB, nom complet, adresse.
- ❌ **Jamais** d'écriture en base hors Drizzle (pas de SQL brut sauf migrations / benchs explicites).
- ❌ **Jamais** d'auth en V1 — l'app suppose un environnement local de confiance. Si déploiement cloud futur, l'auth est un blocker.
- ✅ `.gitignore` doit contenir : `_data/`, `.env`, `.output/`, `.nuxt/`, `node_modules/`.

## Invariants critiques

### Représentation monétaire — `Cents` partout

Branded type dans `shared/types/money.ts` :
```ts
export type Cents = number & { readonly __brand: 'Cents' }
```

- ❌ `amount: number` dans un type métier
- ❌ `* 100` ou `/ 100` à la main
- ❌ `parseFloat` sur de l'argent
- ✅ Toujours `eurosToCents`, `centsToEuros`, `formatEuros` depuis `shared/types/money.ts`
- ✅ Colonnes DB monétaires en `integer` avec suffixe `_cents` (ex: `amount_cents`)
- ✅ Champs API monétaires en `camelCase` avec suffixe `Cents` (ex: `dividendNetCents`)

### Réconciliation comme invariant

Toute ingestion PDF passe par `server/services/reconciler.ts`. Une divergence ≥ 1 centime entre somme(transactions) et solde du PDF **ne peut pas être ignorée silencieusement** — elle déclenche l'état "non fiable" du mois et l'alerte UI.

### Forecast = fonction pure

`server/services/forecast-engine.ts` lit l'état persisté et calcule à la demande. **Aucun cache serveur en V1.** Aucun état dérivé en base. Toute mutation invalide les `useFetch` côté client (refetch, pas de cache global).

### Taux fiscaux paramétrables

IS, flat tax, taux IR : table `tax_settings` + `shared/constants/fiscal-defaults.ts`. **Jamais** en dur dans une fonction de calcul.

### Boundaries imperméables

- `unpdf` consommé exclusivement depuis `server/services/pdf-extractor.ts`
- `@anthropic-ai/sdk` consommé exclusivement depuis `server/services/llm-categorizer.ts`
- DB Drizzle accédée via instance unique (`server/db/client.ts`)
- Composants Vue ne font **jamais** `$fetch`/`useFetch` direct — toujours via un composable de `app/composables/`

## Conventions de nommage (rappel)

| Quoi | Convention | Exemple |
|---|---|---|
| Tables DB | `snake_case` pluriel | `bank_statements`, `fixed_charges` |
| Colonnes DB | `snake_case`, suffixes `_cents`, `_date` | `amount_cents`, `period_start` |
| API endpoints | kebab-case pluriel | `/api/bank-statements`, `/api/fixed-charges` |
| API JSON keys | `camelCase` | `dividendNetCents`, `createdAt` |
| Fichiers TS | `kebab-case.ts` | `forecast-engine.ts` |
| Composants Vue | `PascalCase.vue` | `DebtCard.vue` |
| Composables | `useCamelCase.ts` | `useForecast.ts` |
| Types/classes | `PascalCase` | `Transaction`, `SasConfig` |
| Variables/fonctions | `camelCase` | `computeDividend` |

Vocabulaire : code en **anglais** (`dividendNetCents`, `unemploymentBenefit`, `fiscalYearEndDate`). Libellés UI en **français**.

## Format API normalisé

**Succès** : objet/array JSON direct, pas de wrapper.

**Erreurs** : via `createError()` Nitro, code stable dans `statusMessage`, détails dans `data` :
```ts
throw createError({
  statusCode: 400,
  statusMessage: 'reconciliation_failed',
  data: { gapCents: 4700, expectedCents: 123450, foundCents: 118750 }
})
```

Mapping `statusMessage` → message FR centralisé dans `app/composables/useApiError.ts`.

## Règle d'or sur les erreurs

Les erreurs métier ne sont **pas** des exceptions :

- Validation Zod → `createError({ 422, 'validation_failed', data: zodErr.flatten() })`
- Erreurs domaine (réconciliation échouée, dette inexistante…) → `createError({ 400, '<code_metier>', data: {...} })`
- Bugs imprévus → laissés remonter (Nitro fait du 500)
- ❌ Pas de `try/catch` qui mange une erreur et retourne `null` silencieusement

## Tests — discipline

- Tests unitaires : co-localisés `*.test.ts` à côté du fichier testé
- Tests E2E : `tests/e2e/`, fixtures partagées dans `tests/fixtures/`
- **NFR18** : 100% des fonctions de calcul financier (forecast, dividend, debt projection, variable projection, reconciler) ont au moins **1 cas nominal + 2 cas limites** (mois 28/29/30/31 jours, charges annuelles à cheval, dette à zéro, ARE qui se termine en milieu de mois, override, historique vide).
- Snapshots reproductibles dans `tests/fixtures/snapshots/` pour les calculs forecast.
- `yarn test` (watch), `yarn test:run` (one-shot), `yarn test:e2e` (Playwright).

## Workflow Git

- Commits courts et atomiques. Une story = un commit ou peu de commits.
- Format de message : impératif présent, première lettre majuscule, ≤ 72 chars sur la première ligne.
  - ✅ `Add reconciliation service with cent-level gap detection`
  - ❌ `fixed stuff`
- Ne **jamais** `git add -A` ni `git add .` ; toujours nommer les fichiers à stage (évite `.env` accidentel).
- Ne **jamais** committer `_data/`, `.env`, `.output/`, `.nuxt/`.
- Pas de force-push, pas de hooks bypassés (`--no-verify` interdit sauf demande explicite).

## Workflow avec Claude Code

- Avant toute story : lire le PRD + l'architecture pertinents (sections concernées, FRs, NFRs).
- Une story = un slice vertical livrable. Ne pas démarrer une story qui ne serait pas testable.
- Si une décision ne figure ni dans PRD ni dans Architecture : poser la question, ne pas inventer.
- Si une feature non listée semble "évidente à ajouter" : la flagger explicitement, attendre validation. Le scope est verrouillé.
- À la fin d'une story : tests verts, lint OK, typecheck OK, doc à jour si pertinent.

## Anti-patterns interdits

- ❌ `amount: number` dans un type métier (utiliser `amountCents: Cents`)
- ❌ Cache Pinia de données serveur (qui doublonne les endpoints)
- ❌ `try { ... } catch { return null }` silencieux
- ❌ Appel direct à `anthropic.messages.create()` hors `server/services/llm-categorizer.ts`
- ❌ Appel direct à `unpdf` hors `server/services/pdf-extractor.ts`
- ❌ Endpoint qui retourne un payload non typé
- ❌ Composant Vue qui fait `$fetch`/`useFetch` directement
- ❌ Mutation directe d'un store Pinia depuis un composant (passer par une action)
- ❌ `console.log` en code merged (utiliser `console.warn`/`console.error` quand justifié)
- ❌ Constantes fiscales en dur dans une fonction de calcul

## Gaps à résoudre dans les stories (cf. architecture §Validation)

- **G1 — Disclaimer state** : persister le flag "disclaimer vu" via `localStorage` côté client (state UI pur).
- **G2 — Bootstrap base** : middleware Nitro `server/middleware/0.bootstrap.ts` qui crée `_data/`, ouvre la DB, programmatic push, seed des catégories par défaut au premier lancement.
- **G3 — Extraction de période PDF** : tenter extraction depuis le texte du relevé en premier dans `pdf-extractor.ts`, fallback via dates min/max des transactions extraites.
- **G4 — Tests coverage enforcement** : manuel en V1, à formaliser plus tard.
- **G5 — Snapshots forecast** : à inclure dès la première story qui touche `forecast-engine.ts`.

## Commandes utiles

```bash
yarn dev                  # Dev avec hot reload
yarn db:push              # Sync rapide du schéma (itération)
yarn db:generate          # Génère un fichier de migration
yarn apply-migration      # Applique les migrations pending
yarn db:studio            # Drizzle Studio
yarn test                 # Vitest watch
yarn test:run             # Vitest one-shot
yarn test:e2e             # Playwright
yarn build && yarn start  # Build + run prod local
yarn lint:fix             # ESLint + autofix
yarn typecheck            # nuxt typecheck
```

## Git workflow
                                                                                                                            
- Ne jamais committer sans instruction explicite de l'utilisateur.
- Messages de commit concis (1–2 lignes max), focalisés sur le pourquoi. 
