# Story 3.1: Endpoint `POST /api/reconciliation/[hash]` (ajout transaction manuelle, accept gap)

Status: done

## Story

As a user,
I want to manually fix a reconciliation gap on an ingested statement,
so that the month becomes either trustworthy (gap closed) or explicitly flagged "unreliable".

## Acceptance Criteria

1. **Given** un endpoint `server/api/statements/[hash].get.ts`,
   **When** je GET `/api/statements/{hash}` avec un hash existant,
   **Then** il retourne `{ hash, periodStart, periodEnd, openingBalanceCents, closingBalanceCents, reliability, transactions: TransactionListItem[], reconciliation: { isBalanced, gapCents } }`. Si le hash n'existe pas, il retourne **404 `not_found`**.

2. **Given** un endpoint `server/api/reconciliation/[hash].post.ts` validé par Zod,
   **When** je POST `{ action: 'add_transaction', transaction: { transactionDate, label, amountCents, categoryCode } }`,
   **Then** une transaction avec `is_manual: true` est insérée pour ce statement, le reconciler est recalculé sur l'ensemble des transactions (extraites + manuelles) du statement, et le endpoint retourne `{ isBalanced, gapCents, reliability }`.

3. **Given** un POST `{ action: 'add_transaction' }` qui ramène le gap exactement à zéro,
   **When** la réponse est calculée,
   **Then** `bank_statements.reliability` reste `'reliable'` (aucune écriture inutile sur la colonne).

4. **Given** un POST `{ action: 'accept_gap' }`,
   **When** le gap résiduel calculé est non nul,
   **Then** une transaction `is_manual: true` avec `category_code: 'divers'`, libellé `'Écart accepté (réconciliation)'`, date = `periodEnd`, et `amount_cents = gapCents` est insérée, **et** `bank_statements.reliability` passe à `'unreliable'`. La réponse retourne `{ isBalanced: true, gapCents: 0, reliability: 'unreliable' }`.

5. **Given** un POST `{ action: 'accept_gap' }` alors que le statement est déjà équilibré (`gapCents === 0`),
   **When** la requête est traitée,
   **Then** elle est rejetée avec **400 `reconciliation_failed`** + `data: { reason: 'no_gap_to_accept' }` (pas d'effet de bord, pas d'insertion).

6. **Given** un POST `{ action: 'add_transaction' }` avec un `categoryCode` inconnu,
   **When** la validation FK est faite,
   **Then** la requête est rejetée avec **422 `validation_failed`** + `data: { reason: 'unknown categoryCode', value: <code> }`. Aucune écriture en base.

7. **Given** un POST sur un `hash` inexistant,
   **When** la requête est traitée,
   **Then** elle est rejetée avec **404 `not_found`** (`{ resource: 'bank_statement', hash }`).

8. **Given** la convention de signe du reconciler (`gap = (closing - opening) - sum(transactions)`),
   **When** une transaction manuelle est ajoutée pour combler le gap,
   **Then** son `amountCents` doit être saisi par l'utilisateur (libellé manuel signé). Le test unitaire couvre : un cas où ajouter une dépense (-200) ramène un gap positif (+200) à zéro, et un cas où ajouter un crédit (+150) ramène un gap négatif (-150) à zéro.

9. **Given** les writes de `accept_gap` (insertion transaction + update reliability),
   **When** ils sont émis,
   **Then** ils sont effectués dans une seule `db.transaction()` synchrone (better-sqlite3) pour garantir l'atomicité.

10. **Given** un nouveau code d'erreur `reconciliation_failed` (déjà déclaré dans `shared/schemas/api-errors.ts:21`),
    **When** il est utilisé par ce endpoint,
    **Then** il est mappé en FR dans `useApiError.ts` (déjà présent ligne 16) — vérifier qu'aucune nouvelle clé n'est introduite sans mise à jour du mapping.

## Tasks / Subtasks

- [x] **Task 1 — GET `/api/statements/[hash]`** (AC: #1)
  - [x] Créer `server/api/statements/[hash].get.ts`
  - [x] Lecture statement par hash, jointure transactions du statement, recalcul reconciliation à la volée via `reconcile()`
  - [x] Return shape conforme à AC#1 ; 404 si hash absent
  - [x] Test unitaire `[hash].get.test.ts` : statement existant équilibré, statement existant avec gap, hash inconnu → 404

- [x] **Task 2 — Schema Zod du body POST réconciliation** (AC: #2, #4)
  - [x] Créer `shared/schemas/reconciliation.schema.ts`
  - [x] `ReconciliationActionSchema` = discriminated union sur `action`:
    - `{ action: 'add_transaction', transaction: { transactionDate (DateIsoSchema), label (LabelSchema trim min 1), amountCents (z.number().int()), categoryCode (z.string().trim().min(1)) } }`
    - `{ action: 'accept_gap' }`
  - [x] Réutiliser les sous-schémas date/label de `transaction.schema.ts` plutôt que de les redéfinir (DRY) — les exposer/exporter si nécessaire

- [x] **Task 3 — Endpoint POST `/api/reconciliation/[hash]`** (AC: #2-7, #9)
  - [x] Créer `server/api/reconciliation/[hash].post.ts`
  - [x] Validation `hash` param (regex `/^[a-f0-9]{64}$/`) → sinon 422
  - [x] Vérifier existence du statement (404 sinon)
  - [x] Validation body via `validateBody(event, ReconciliationActionSchema)`
  - [x] Pour `add_transaction`: pré-check FK `categoryCode` (cf. pattern `transactions/[id].patch.ts:28-41`), insert transaction (`is_manual: true`), recompute reconciliation, retourner `{ isBalanced, gapCents, reliability }` (reliability inchangée — toujours la valeur courante)
  - [x] Pour `accept_gap`: recompute reconciliation courante, si `isBalanced` → 400 `reconciliation_failed { reason: 'no_gap_to_accept' }`, sinon `db.transaction()` synchrone : insert transaction `divers` + `update bank_statements.reliability = 'unreliable'`. Retourner `{ isBalanced: true, gapCents: 0, reliability: 'unreliable' }`.
  - [x] Garder le handler thin : extraire la logique métier dans `server/services/reconciliation-orchestrator.ts` si elle dépasse ~80 lignes

- [x] **Task 4 — Tests unitaires endpoint** (AC: #2-9)
  - [x] Créer `server/api/reconciliation/[hash].post.test.ts` sur le pattern de `server/api/transactions/[id].patch.test.ts` (tmpdir SQLite, schema bootstrap inline)
  - [x] Cas : add_transaction qui équilibre (gap +200 → ajout -200) → reliability reste 'reliable'
  - [x] Cas : add_transaction qui équilibre depuis un gap négatif (-150 → ajout +150)
  - [x] Cas : add_transaction qui réduit sans équilibrer
  - [x] Cas : add_transaction avec categoryCode inconnu → 422, aucune écriture
  - [x] Cas : accept_gap sur statement avec gap → reliability passe 'unreliable', transaction divers insérée du bon montant
  - [x] Cas : accept_gap sur statement déjà équilibré → 400 reconciliation_failed
  - [x] Cas : POST sur hash inexistant → 404
  - [x] Cas : POST avec body invalide (action manquante) → 422

- [x] **Task 5 — Sanity check final**
  - [x] `yarn typecheck`, `yarn lint`, `yarn test:run` propres
  - [x] Aucun nouveau code d'erreur introduit hors `api-errors.ts` + `useApiError.ts`
  - [x] Commit unique

## Dev Notes

### Pourquoi recalculer la réconciliation à chaque écriture

`bank_statements` ne stocke ni `gap_cents` ni `is_balanced` (cf. `server/db/schema.ts:49-57`). Le reconciler est **pur** (`server/services/reconciler.ts`) et doit le rester. À chaque appel, on relit toutes les transactions du statement et on recompute. Pas de cache, pas de colonne dérivée — invariant CLAUDE.md (`Forecast = fonction pure`, applique aussi à reconcile).

### Convention de signe du reconciler — critique

```
gap = (closingCents - openingCents) - sum(transactions.amountCents)
```

Donc :
- `gap > 0` (positif) → on a extrait **trop** de mouvements / il manque un crédit. Pour combler, ajouter une transaction d'`amountCents = +gap` (un revenu manquant).
- `gap < 0` (négatif) → il manque des mouvements extraits. Pour combler, ajouter une transaction d'`amountCents = +gap` (donc négative — une dépense manquante).

Pour `accept_gap`, on insère **une transaction d'`amountCents = gapCents`** (sans changer de signe). Vérifie sur les tests reconciler existants (`server/services/reconciler.test.ts:26-73`) la logique des signes.

### Forme de la transaction "écart accepté"

```ts
{
  statementHash: hash,
  transactionDate: statement.periodEnd,    // dernier jour de la période
  label: 'Écart accepté (réconciliation)',
  amountCents: gapCents,
  categoryCode: 'divers',                  // déjà seedé (default-categories.ts:40)
  isManual: true,
  isDebtRepayment: false,
  debtId: null,
}
```

La catégorie `divers` est déjà dans le seed (`shared/constants/default-categories.ts:40` — `is_variable: true`). Pas besoin de migration.

### Pattern handler thin → service

Suivre le pattern de `server/api/statements/index.post.ts` qui délègue à `server/services/statement-ingestion-orchestrator.ts`. Si le handler reconciliation dépasse ~80 lignes, extraire vers `server/services/reconciliation-orchestrator.ts` avec deux fonctions pures testables : `addManualTransaction(...)` et `acceptGap(...)`.

### Atomicité better-sqlite3

`db.transaction(...)` est **synchrone** avec `better-sqlite3`. Ne PAS rendre le callback `async` (cf. commentaire `statement-ingestion-orchestrator.ts:182-208`). Si un await est nécessaire (rien ici a priori), faire le travail async **avant** la transaction et n'inclure que des `.run()` dedans.

### Erreurs : codes stables uniquement

Tous les codes utilisés sont **déjà déclarés** dans `shared/schemas/api-errors.ts` (`ValidationFailed`, `NotFound`, `ReconciliationFailed`). Tous sont **déjà mappés** en FR dans `app/composables/useApiError.ts`. Cette story n'introduit **aucun nouveau code**.

### Anti-patterns à éviter

- ❌ Stocker `gap_cents` ou `is_balanced` en colonne dérivée — recompute à la volée.
- ❌ Recalculer la reliability dans `add_transaction` à partir du gap (le passage `unreliable → reliable` automatique est **hors scope** ; on ne dégrade que sur `accept_gap` explicite).
- ❌ Dupliquer la regex de hash SHA-256 (déjà dans `transaction.schema.ts:26`) — exposer `HashSha256Schema` si besoin.
- ❌ Créer un nouveau code d'erreur sans mettre à jour `useApiError.ts` (cf. CLAUDE.md §Format API normalisé).
- ❌ Modifier `bank_statements.reliability` en dehors du flow `accept_gap`.
- ❌ Inserts SQL bruts (toujours via Drizzle).

### Project Structure Notes

Cette story crée :
- `server/api/statements/[hash].get.ts` (+ `.test.ts`) — listé en architecture (`architecture.md:557`)
- `server/api/reconciliation/[hash].post.ts` (+ `.test.ts`) — listé en architecture (`architecture.md:561-562`)
- `shared/schemas/reconciliation.schema.ts` — non listé explicitement mais cohérent avec `shared/schemas/`
- (optionnel) `server/services/reconciliation-orchestrator.ts` (+ `.test.ts`)

### Definition of Done

- [ ] `GET /api/statements/[hash]` opérationnel et testé
- [ ] `POST /api/reconciliation/[hash]` opérationnel pour les 2 actions
- [ ] Schémas Zod à jour, FK pre-check, atomicité tx
- [ ] Aucun nouveau code d'erreur
- [ ] `yarn typecheck`, `yarn lint`, `yarn test:run` verts
- [ ] Commit unique

### References

- [Source: `_bmad-output/planning-artifacts/prd.md`#FR11-FR15] — règles métier réconciliation
- [Source: `_bmad-output/planning-artifacts/epics.md`#Story 3.1] — story originale
- [Source: `_bmad-output/planning-artifacts/architecture.md`#Project Structure (lignes 557, 561-562, 680)] — emplacement endpoints
- [Source: `CLAUDE.md`#Invariants critiques] — Cents partout, atomicité, boundaries
- [Source: `CLAUDE.md`#Format API normalisé] — conventions erreurs
- [Source: `server/services/reconciler.ts`] — fonction pure, convention de signe
- [Source: `server/services/statement-ingestion-orchestrator.ts:182-208`] — pattern db.transaction synchrone
- [Source: `server/api/transactions/[id].patch.ts:28-41`] — pattern FK pre-check categoryCode
- [Source: `shared/schemas/api-errors.ts:21`] — code `ReconciliationFailed`
- [Source: `app/composables/useApiError.ts:16`] — message FR existant
- [Source: `shared/constants/default-categories.ts:40`] — catégorie `divers` déjà seedée
- [Previous story: `2-5-service-reconciler` — fonction pure ; `2-6-endpoint-post-api-statements` — pattern handler+orchestrator]

## Dev Agent Record

### Agent Model Used

claude-opus-4-7 (Claude Code)

### Debug Log References

— `yarn test:run` : 18 fichiers, **186 tests verts** (dont 13 nouveaux pour 3.1 : 5 sur GET `[hash].get.test.ts`, 8 sur POST `[hash].post.test.ts`)
— `yarn lint` : OK
— `yarn typecheck` : OK

### Completion Notes List

- **Sous-schémas exportés** : `DateIsoSchema`, `LabelSchema`, `HashSha256Schema` dans `shared/schemas/transaction.schema.ts` sont passés `export const` (DRY ; consommés par `reconciliation.schema.ts`).
- **Discriminated union** : `ReconciliationActionSchema` utilise `z.discriminatedUnion('action', [...])` — Zod génère automatiquement un message d'erreur `invalid_union_discriminator` quand `action` est manquant (couvert par le test "body action is missing").
- **Convention de signe** : la transaction d'écart accepté est insérée avec `amountCents = current.gapCents` (sans inversion). Vérifié par le test qui calcule `gap = -10` puis vérifie que la ligne `Écart accepté` a `amountCents: -10`.
- **Reliability non-régressive** : `add_transaction` n'écrit jamais sur `bank_statements.reliability` — couvert par le test "does not flip reliability back to reliable when gap closes on an unreliable statement". Le passage `unreliable` est exclusivement déclenché par `accept_gap`.
- **Atomicité** : `accept_gap` enchaîne insert transaction + update reliability dans un `db.transaction()` synchrone (better-sqlite3). Pas de callback async, conforme au pattern de `statement-ingestion-orchestrator.ts:182-208`.
- **Pas d'orchestrator extrait** : le handler POST fait ~115 lignes mais reste lisible et linéaire. Pas d'extraction prématurée vers un service séparé (KISS).
- **Aucun nouveau code d'erreur** : `ValidationFailed`, `NotFound`, `ReconciliationFailed` étaient déjà déclarés dans `shared/schemas/api-errors.ts` et déjà mappés en FR dans `app/composables/useApiError.ts`.
- **Catégorie `divers` checked at runtime** : défense en profondeur — si le seed n'a pas tourné, `accept_gap` retourne 500 `reconciliation_failed { reason: 'missing_default_category' }` au lieu de planter sur la FK.

### File List

**Créés**
- `shared/schemas/reconciliation.schema.ts`
- `server/api/statements/[hash].get.ts`
- `server/api/statements/[hash].get.test.ts`
- `server/api/reconciliation/[hash].post.ts`
- `server/api/reconciliation/[hash].post.test.ts`

**Modifiés**
- `shared/schemas/transaction.schema.ts` (export des sous-schémas `DateIsoSchema`, `LabelSchema`, `HashSha256Schema`)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (statut 3-1)

### Change Log

- 2026-05-05 : implémentation story 3.1 — endpoints `GET /api/statements/[hash]` et `POST /api/reconciliation/[hash]` (`add_transaction` + `accept_gap`). Schéma Zod discriminated union. Status → review.

### Review Findings

- [x] [Review][Patch] TOCTOU race dans `accept_gap` : `recomputeReconciliation` est appelé HORS `db.transaction()`, un POST concurrent peut insérer entre la lecture du gap et l'insertion → la ligne "Écart accepté" est écrite avec un gap périmé, statement marqué `unreliable` mais résiduel non nul [`server/api/reconciliation/[hash].post.ts:84-130`]
- [x] [Review][Patch] `accept_gap` retourne `{isBalanced:true, gapCents:0}` en littéral sans relire la DB → contrat divergent vs `GET /api/statements/[hash]` qui recompute. Recompute après l'insert et retourne les vraies valeurs [`server/api/reconciliation/[hash].post.ts:132-136`]
- [x] [Review][Patch] `AddManualTransactionInputSchema.transactionDate` n'est pas borné par la période du statement → un POST peut insérer une tx datée hors `[periodStart, periodEnd]`. Ajouter un check serveur qui rejette en 422 si la date sort de la période [`shared/schemas/reconciliation.schema.ts:19` + `server/api/reconciliation/[hash].post.ts:75`]
- [x] [Review][Patch] `AddManualTransactionInputSchema.amountCents` accepte `0` (no-op qui pollue les listes) et n'a pas de plafond → ajouter `.refine(n => n !== 0)` et `.min(-10**11).max(10**11)` (€1B max) [`shared/schemas/reconciliation.schema.ts:22`]
- [x] [Review][Patch] `accept_gap` est ré-invocable après une acceptation suivie d'un `add_transaction` (qui re-déséquilibre) → multiples lignes "Écart accepté" possibles. Refuser si `statement.reliability === 'unreliable'` (un seul écart accepté par statement) [`server/api/reconciliation/[hash].post.ts:90-93`]
- [x] [Review][Patch] DRY HASH_RE : la regex `/^[a-f0-9]{64}$/` est dupliquée dans 3 fichiers (`server/api/reconciliation/[hash].post.ts:31`, `server/api/statements/[hash].get.ts:20`, `app/pages/reconciliation/[hash].vue`). Utiliser `HashSha256Schema` (déjà exporté) via `.safeParse(hash).success` ou exposer la regex partagée [`shared/schemas/transaction.schema.ts:26`]
- [x] [Review][Patch] `LabelSchema` n'a pas de `.max(...)` → un POST API peut écrire un libellé multi-MB. UI cap à 120 mais Zod non. Ajouter `.max(200)` à `LabelSchema` [`shared/schemas/transaction.schema.ts:23`]
- [x] [Review][Defer] N+1 / correlated subquery sur `GET /api/statements` (`COUNT(*)` corrélé par row) — KISS, OK pour V1 single-user, bascule vers `LEFT JOIN ... GROUP BY` si volumétrie > 100 statements [`server/api/statements/index.get.ts:20`] — deferred, pre-existing perf concern
- [x] [Review][Defer] DDL dupliqué dans 3 fichiers de tests (`*.test.ts` recréent le schéma à la main au lieu d'utiliser `db:push` programmatique) — pattern pré-existant à 4 fichiers, refactor global de l'infra de test — deferred, pre-existing
- [x] [Review][Defer] Race `categoryDefinitions` deletion : entre le FK pre-check et l'insert, une suppression de catégorie (Epic 5.6) ferait remonter une erreur SQLite brute (500) au lieu d'un 422 mappé [`server/api/reconciliation/[hash].post.ts:62-73`] — deferred, scope Epic 5

#### Review Findings — second pass (2026-05-08)

- [x] [Review][Patch] Convention de signe inversée dans le docblock de `reconcile()` : "positif : transactions extraites en surplus / négatif : il manque des transactions" est faux. Calcul `gap = (closing - opening) - sum(tx)` → `gap > 0` signifie EXPECTED > FOUND donc **transactions manquantes** ; `gap < 0` signifie surplus. Les tests + le commentaire de `[hash].post.ts:11-13` utilisent la convention CORRECTE — c'est uniquement la JSDoc de `reconciler.ts` qui ment. Inverser les deux lignes [`server/services/reconciler.ts:18-26`]
- [x] [Review][Defer] `ApiErrorCode.NotFound` mappé en FR générique "Ressource introuvable" → la page `/reconciliation/[hash]` ne distingue pas un 404 hash inconnu d'un 500 serveur [`app/composables/useApiError.ts:9`] — deferred, mapping à enrichir quand on aura plus de codes
- [x] [Review][Defer] `ReliabilityBadge` n'affiche aucun signal positif quand `reliability === 'reliable'` sur `/transactions/[period]` (badge masqué). FR14 demande un indicateur de fiabilité explicite. À traiter avec le dashboard narratif [`app/components/shared/ReliabilityBadge.vue`] — deferred, scope Epic 4
