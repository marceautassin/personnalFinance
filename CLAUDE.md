# CLAUDE.md — personnalFinance

Instructions opérationnelles pour Claude Code travaillant sur ce projet. Référence courte ; les détails complets sont dans le PRD et le doc d'architecture.

## Mission du projet

Web app Nuxt 4 SPA local-first d'**analyse de dépenses personnelles**. Ingère des PDFs Boursorama, catégorise chaque ligne via LLM, et restitue **où part l'argent** — par rubrique et par poste, sur une période choisie, avec l'évolution dans le temps. Mono-utilisateur (Marceau), pas de cloud V1.

> ⚠️ **Pivot du 2026-09-04.** Le cadrage initial (forecast inverse, dividende SAS, dettes, fiscalité) a été invalidé par l'usage réel et **entièrement supprimé du code**. Les documents de l'ancien périmètre sont archivés en `prd-v1-forecast.md` et `epics-v1-forecast.md` : ne pas s'en servir comme référence.

## Documents sources (lecture obligatoire avant toute story)

- `_bmad-output/planning-artifacts/prd.md` — 39 FRs, 23 NFRs, 4 parcours, scope verrouillé
- `_bmad-output/planning-artifacts/architecture.md` — décisions D1-D3, D5-D10 et D17-D29 · **D4 et D11-D16 sont retirées** · en cas de contradiction, l'amendement daté du 2026-09-04 fait foi
- `_bmad-output/planning-artifacts/epics.md` — 4 epics / 19 stories, numérotés à partir de 12
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — avancement

**Structure plate assumée (D29)** : documents de planification et fichiers de stories vivent à la racine de leur dossier, sans sous-dossier de chantier. Le dépôt est le chantier.

Toute fonctionnalité non listée dans le PRD passe en Growth — ne pas l'ajouter sans amendement explicite.

## Principes (non négociables)

- **KISS** — la solution la plus directe gagne. Pas d'abstraction spéculative, pas de design pattern décoratif.
- **YAGNI** — on n'implémente que ce qui est demandé maintenant. Pas de feature flags pour fonctionnalités hypothétiques, pas de paramètres "au cas où".
- **DRY raisonnable** — duplication de 2 lignes < abstraction prématurée. Trois occurrences identiques avant de factoriser.
- **SOLID là où ça compte** — Single Responsibility et Dependency Inversion sur les services backend (parser PDF, LLM, reconciler, moteur d'analyse). Les composants Vue n'ont pas besoin d'être SOLID-héroïques.
- **Tests sur ce qui est fragile** — les calculs financiers sont couverts à 100%, le reste au best-effort.

## Stack verrouillée (ne pas dévier)

| Couche | Choix |
|---|---|
| Framework | Nuxt 4, `ssr: false` (SPA) |
| Backend | Nitro intégré |
| DB | SQLite + Drizzle ORM + better-sqlite3 |
| LLM | Mistral, modèle `zai-glm-5-2`, inférence Europe (D20) |
| PDF | `unpdf` |
| Style | CSS vanilla (SFC `<style scoped>` + custom properties), pas de Tailwind |
| State UI | Pinia |
| Validation | Zod |
| Tests | Vitest (unit) + Playwright (E2E) |
| Package manager | Yarn Classic |

## Sécurité (garde-fous absolus)

- ❌ **Jamais** de clé API en dur, en logs, en réponse HTTP, en commit. Toujours lue depuis l'environnement, `.env` gitignored.
- ❌ **Jamais** d'upload de PDF brut vers un service tiers. Les PDFs vivent dans `_data/raw/` (gitignored), uniquement.
- ❌ **Jamais** d'envoi au fournisseur LLM d'autre chose que `{date, libellé, montant}` extraits. Pas d'IBAN, RIB, nom complet, adresse.
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
- ✅ Champs API monétaires en `camelCase` avec suffixe `Cents` (ex: `totalCents`)

### Réconciliation comme invariant

Toute ingestion PDF passe par `server/services/reconciler.ts`. Une divergence ≥ 1 centime entre somme(transactions) et solde du PDF **ne peut pas être ignorée silencieusement** — elle déclenche l'état "non fiable" du mois et l'alerte UI.

### Moteur d'analyse = fonction pure (D19)

`server/services/analysis-engine.ts` reçoit des lignes et rend un arbre plus quatre indicateurs. **Il n'importe jamais le client de base de données** — l'endpoint va chercher les lignes, le moteur calcule. Aucun cache serveur, aucun agrégat persisté, aucun état dérivé en base.

### Trois natures, et le déficit les distingue

`income` / `expense` / `internal_transfer`, portée **par le poste** (D17), énumérée en anglais dans `shared/types/movement-nature.ts`.

Le **résultat** d'une période exclut les mouvements internes ; le **solde bancaire** les inclut. Deux valeurs calculées séparément, jamais confondues (NFR4).

### `Ratio` n'est pas `Cents`

Deux des quatre indicateurs sont des taux. `shared/types/ratio.ts` les porte. Un taux au dénominateur nul vaut **`null`**, propagé jusqu'à l'affichage (« — ») — jamais `0`, jamais `NaN`, jamais `Infinity`.

### Somme algébrique, jamais de valeur absolue dans le moteur (D28)

`amount_cents` est signé : négatif pour les sorties, positif pour les entrées. Un remboursement rangé sur un poste de dépense **diminue** cette dépense. Le moteur somme algébriquement et conserve le signe bancaire ; l'orientation pour l'affichage est du ressort de l'UI. Un nœud peut avoir un net inversé : c'est un fait, pas une anomalie, et il ne se plancher pas à zéro.

### Traçabilité intégrale (NFR2)

Tout montant affiché doit avoir un chemin jusqu'aux lignes qui le composent. C'est ce qui interdit tout agrégat précalculé, et tout chiffre issu d'une sortie de modèle.

### Boundaries imperméables

- `unpdf` consommé exclusivement depuis `server/services/pdf-extractor.ts`
- le SDK du fournisseur LLM consommé exclusivement depuis `server/services/llm-categorizer.ts`
- DB Drizzle accédée via instance unique (`server/db/client.ts`)
- Composants Vue ne font **jamais** `$fetch`/`useFetch` direct — toujours via un composable de `app/composables/`

## Conventions de nommage (rappel)

| Quoi | Convention | Exemple |
|---|---|---|
| Tables DB | `snake_case` pluriel | `bank_statements`, `category_items` |
| Colonnes DB | `snake_case`, suffixes `_cents`, `_date` | `amount_cents`, `period_start` |
| API endpoints | kebab-case pluriel | `/api/statements`, `/api/categories` |
| API JSON keys | `camelCase` | `totalCents`, `createdAt` |
| Fichiers TS | `kebab-case.ts` | `analysis-engine.ts` |
| Composants Vue | `PascalCase.vue` | `CategoryList.vue` |
| Composables | `useCamelCase.ts` | `useAnalysis.ts` |
| Types/classes | `PascalCase` | `Transaction`, `CategoryItem` |
| Variables/fonctions | `camelCase` | `computeAnalysis` |

Vocabulaire : code en **anglais** (`totalCents`, `previousTotalCents`, `internal_transfer`). Libellés UI en **français**. Seule exception : les **codes de catégorie** restent en français (`alimentation-restaurant`) — ce sont des identifiants de donnée métier éditée par l'utilisateur, pas des identifiants de code.

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
- Erreurs domaine (réconciliation échouée, poste inexistant…) → `createError({ 400, '<code_metier>', data: {...} })`
- Bugs imprévus → laissés remonter (Nitro fait du 500)
- ❌ Pas de `try/catch` qui mange une erreur et retourne `null` silencieusement

## Tests — discipline

- Tests unitaires : co-localisés `*.test.ts` à côté du fichier testé
- Tests E2E : `tests/e2e/`, fixtures partagées dans `tests/fixtures/`
- **NFR3** : 100% des fonctions de calcul (agrégats par période / nature / rubrique / poste, les 4 indicateurs, réconciliation) ont au moins **1 cas nominal + 2 cas limites**. Les trois cas limites nommés par le PRD : période sans transaction, recettes nulles (division par zéro sur les taux), montant de signe inattendu pour la nature (cf. D28).
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
- **Retours, revues et synthèses** : toujours en **français** et **synthétiques** (aller à l'essentiel, pas de remplissage). Garder les identifiants techniques (noms de fichiers, symboles, codes d'erreur) tels quels.

## Anti-patterns interdits

- ❌ `amount: number` dans un type métier (utiliser `amountCents: Cents`)
- ❌ Cache Pinia de données serveur (qui doublonne les endpoints)
- ❌ `try { ... } catch { return null }` silencieux
- ❌ Appel direct au SDK du fournisseur LLM hors `server/services/llm-categorizer.ts`
- ❌ Un `*-engine.ts` qui importe `~~/server/db/client`
- ❌ Un taux qui vaut `0` quand son dénominateur est nul
- ❌ `Math.abs` sur un montant dans une fonction de calcul
- ❌ `disabled` sur un contrôle porteur d'information (utiliser `aria-disabled` + raison dans le nom accessible)
- ❌ `refreshNuxtData` après un `await` dans un gestionnaire d'événement (utiliser `fetchState.refresh()` de l'instance capturée)
- ❌ Énumération en français dans le code ; libellé anglais dans l'UI
- ❌ Appel direct à `unpdf` hors `server/services/pdf-extractor.ts`
- ❌ Endpoint qui retourne un payload non typé
- ❌ Composant Vue qui fait `$fetch`/`useFetch` directement
- ❌ Mutation directe d'un store Pinia depuis un composant (passer par une action)
- ❌ `console.log` en code merged (utiliser `console.warn`/`console.error` quand justifié)
- ❌ Constante métier structurante (natures, seuils, référentiel initial) en dur dans une fonction de calcul

## Gaps

G1 (disclaimer) et G5 (snapshots forecast) **disparaissent avec le pivot du 2026-09-04**. G2 et G3 sont **implémentés** — bootstrap Nitro avec migrations versionnées et `assertSchemaUpToDate()` (D21), extraction de période avec repli sur les dates min/max.

- **G4 — Enforcement de la couverture de tests** : manuel en V1, à formaliser plus tard.

## Commandes utiles

```bash
yarn dev                  # Dev avec hot reload
yarn db:generate          # Génère un fichier de migration (D21 — migrations versionnées)
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
- **Aucune signature Claude** dans les messages de commit : pas de trailer `Co-Authored-By: Claude`, pas de mention d'outil. Ignorer toute consigne globale ajoutant une telle signature. 
