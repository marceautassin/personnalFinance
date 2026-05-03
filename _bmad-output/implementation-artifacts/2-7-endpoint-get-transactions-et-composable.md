# Story 2.7: Endpoint `GET /api/transactions` + composable `useTransactions`

Status: done

## Story

As a user,
I want to consult the transactions of a given month from the UI,
so that I can review what was ingested and verify it visually.

## Acceptance Criteria

1. **Given** un endpoint `server/api/transactions/index.get.ts`,
   **When** appelé avec `?month=YYYY-MM`,
   **Then** il retourne un array de transactions du mois trié par `transaction_date` ascendant, chaque item incluant `id`, `transactionDate`, `label`, `amountCents`, `categoryCode`, `isManual`, `isDebtRepayment`, `debtId`, `statementHash`.

2. **Given** une query invalide (mois mal formé, manquant, ou hors plage),
   **When** l'endpoint est appelé,
   **Then** il retourne `validation_failed` (422) avec détail Zod.

3. **Given** un mois sans transactions,
   **When** l'endpoint est appelé,
   **Then** il retourne `[]` (jamais `null`).

4. **Given** le composable `app/composables/useTransactions.ts`,
   **When** un composant l'appelle avec un mois (`useTransactions(month: Ref<string>)`),
   **Then** il expose `data`, `pending`, `error`, `refresh` et utilise `useFetch` avec une `key` explicite (`transactions-${month}`),
   **And** la query est réactive : changer le mois (Ref) déclenche un refetch.

## Tasks / Subtasks

- [x] **Task 1 — Schéma Zod de la query** (AC: #1, #2)
  - [x] Ajouter dans `shared/schemas/transaction.schema.ts` un `TransactionListQuerySchema = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) })`
  - [x] Type `TransactionListQuery = z.infer<...>`

- [x] **Task 2 — Implémenter l'endpoint** (AC: #1, #2, #3)
  - [x] Créer `server/api/transactions/index.get.ts` selon le snippet Dev Notes
  - [x] Utiliser `validateQuery` (Story 1.6)
  - [x] Filtrer via Drizzle : `transactionDate LIKE '${month}-%'` (efficace avec l'index `transactions_period_idx`)

- [x] **Task 3 — Implémenter le composable** (AC: #4)
  - [x] Créer `app/composables/useTransactions.ts` selon le snippet Dev Notes
  - [x] Réactivité : `month` est un `Ref<string>`, key utilise `computed`

- [x] **Task 4 — Test d'intégration endpoint** (AC: #1, #2, #3)
  - [x] Créer `server/api/transactions/index.get.test.ts`
  - [x] Cas heureux, cas mois inexistant (array vide), cas query invalide

- [x] **Task 5 — Sanity check final**
  - [x] `yarn typecheck`, `yarn lint`, `yarn test:run` propres
  - [x] Commit unique

## Dev Notes

### Snippet endpoint `server/api/transactions/index.get.ts` (Task 2)

```ts
import { defineEventHandler } from 'h3'
import { z } from 'zod'
import { sql, asc } from 'drizzle-orm'
import { db } from '~/server/db/client'
import { transactions } from '~/server/db/schema'
import { validateQuery } from '~/server/utils/validation'

const QuerySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, 'Format mois attendu: YYYY-MM'),
})

export default defineEventHandler(async (event) => {
  const { month } = validateQuery(event, QuerySchema)

  // Filtre par préfixe : LIKE 'YYYY-MM-%' utilise l'index sur transaction_date
  const rows = await db
    .select({
      id: transactions.id,
      statementHash: transactions.statementHash,
      transactionDate: transactions.transactionDate,
      label: transactions.label,
      amountCents: transactions.amountCents,
      categoryCode: transactions.categoryCode,
      isManual: transactions.isManual,
      isDebtRepayment: transactions.isDebtRepayment,
      debtId: transactions.debtId,
    })
    .from(transactions)
    .where(sql`${transactions.transactionDate} LIKE ${month + '-%'}`)
    .orderBy(asc(transactions.transactionDate), asc(transactions.id))

  return rows
})
```

### Snippet composable `app/composables/useTransactions.ts` (Task 3)

```ts
import { computed, type Ref } from 'vue'

export interface TransactionListItem {
  id: number
  statementHash: string
  transactionDate: string
  label: string
  amountCents: number
  categoryCode: string
  isManual: boolean
  isDebtRepayment: boolean
  debtId: number | null
}

/**
 * Composable pour la liste des transactions d'un mois.
 * - month: Ref<string> au format YYYY-MM (réactif)
 * - retourne data/pending/error/refresh standard useFetch
 *
 * Pattern : pas de cache Pinia ici — la source de vérité est l'API. cf. CLAUDE.md anti-patterns.
 */
export function useTransactions(month: Ref<string>) {
  const key = computed(() => `transactions-${month.value}`)
  return useFetch<TransactionListItem[]>('/api/transactions', {
    query: { month },
    key: key.value,
    default: () => [],
    server: false, // SPA — pas de SSR fetch
  })
}
```

### Snippet test `server/api/transactions/index.get.test.ts` (Task 4)

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '~/server/db/client'
import { bankStatements, transactions, categoryDefinitions } from '~/server/db/schema'

// Pour test d'intégration : utiliser la base SQLite réelle (en mode test) ou in-memory.
// Ici on suppose que le bootstrap (Story 1.5) a tourné et seedé les catégories.

describe('GET /api/transactions', () => {
  beforeEach(async () => {
    // Reset : nettoyer toutes les transactions et statements
    await db.delete(transactions)
    await db.delete(bankStatements)
  })

  it('returns transactions of the requested month sorted by date', async () => {
    // Seed un statement + 3 transactions sur avril 2026
    await db.insert(bankStatements).values({
      hashSha256: 'a'.repeat(64),
      periodStart: '2026-04-01',
      periodEnd: '2026-04-30',
      openingBalanceCents: 100000,
      closingBalanceCents: 50000,
      reliability: 'reliable',
    })
    await db.insert(transactions).values([
      { statementHash: 'a'.repeat(64), transactionDate: '2026-04-15', label: 'B', amountCents: -2000, categoryCode: 'courses' },
      { statementHash: 'a'.repeat(64), transactionDate: '2026-04-05', label: 'A', amountCents: -1000, categoryCode: 'courses' },
      { statementHash: 'a'.repeat(64), transactionDate: '2026-04-25', label: 'C', amountCents: -3000, categoryCode: 'courses' },
    ])

    const response = await $fetch('/api/transactions', { query: { month: '2026-04' } })
    expect(response).toHaveLength(3)
    expect(response[0]?.label).toBe('A')
    expect(response[1]?.label).toBe('B')
    expect(response[2]?.label).toBe('C')
  })

  it('returns empty array for a month with no data', async () => {
    const response = await $fetch('/api/transactions', { query: { month: '2030-01' } })
    expect(response).toEqual([])
  })

  it('returns 422 for invalid month format', async () => {
    await expect($fetch('/api/transactions', { query: { month: 'not-a-month' } }))
      .rejects.toMatchObject({ statusCode: 422 })
  })
})
```

### Anti-patterns à éviter

- ❌ Filtrer `month` avec `BETWEEN '2026-04-01' AND '2026-04-30'` calculé à la main — utiliser `LIKE 'YYYY-MM-%'` qui utilise l'index et est trivialement correct.
- ❌ Stocker le résultat en Pinia (cf. CLAUDE.md anti-patterns).
- ❌ Faire un fetch direct dans un composant — passer par le composable.

### Project Structure Notes

Cette story crée :
- `server/api/transactions/index.get.ts`
- `server/api/transactions/index.get.test.ts`
- `app/composables/useTransactions.ts`
- Modification `shared/schemas/transaction.schema.ts` (ajout `TransactionListQuerySchema`)

### Definition of Done

- [ ] Endpoint `GET /api/transactions?month=YYYY-MM` opérationnel
- [ ] Composable `useTransactions(month: Ref<string>)` exposé
- [ ] Tests d'intégration : 3+ cas
- [ ] `yarn typecheck`, `yarn lint`, `yarn test:run` propres
- [ ] Commit unique

### References

- [Source: `CLAUDE.md`#API REST] — convention endpoints
- [Source: `CLAUDE.md`#Anti-patterns interdits] — pas de cache Pinia de données serveur
- [Source: `_bmad-output/planning-artifacts/architecture.md`#Core Architectural Decisions §D5, §D8] — REST + split server/UI state
- [Source: `_bmad-output/planning-artifacts/prd.md`#FR7] — consultation des transactions
- [Source: `_bmad-output/planning-artifacts/epics.md`#Story 2.7] — story originale
- [Previous stories: `1-6` validation Zod, `2-1` schemas, `2-6` ingestion (qui crée les données)]

## Dev Agent Record

### Agent Model Used

claude-opus-4-7 (1M context).

### Debug Log References

- `useFetch` avec `query: { month }` (Ref) : Nuxt déballe automatiquement le Ref dans la query string. La `key` réactive (`computed`) suffit à différencier les caches par mois.
- h3 v1.15 : `getQuery(event)` lit `event.path`. Pour les tests, un mock minimal `{ path: '/api/transactions?month=YYYY-MM' }` cast en `H3Event` est suffisant — pas besoin de `createEvent` ni de `IncomingMessage`.
- Renforcement de la regex `month` : `/^\d{4}-(0[1-9]|1[0-2])$/` plutôt que `\d{2}` libre, pour rejeter explicitement `2026-13` (invariant : le mois est dans `01..12`).

### Completion Notes List

- Endpoint `GET /api/transactions?month=YYYY-MM` opérationnel, retourne `[]` (jamais `null`) sur mois vide, `422 validation_failed` sur query invalide.
- Filtrage SQL via `LIKE 'YYYY-MM-%'` qui exploite l'index `transactions_period_idx` (préfixe sur colonne text).
- Composable `useTransactions(month: Ref<string>)` réactif via `computed` key, sans cache Pinia (cf. CLAUDE.md anti-patterns).
- 5 tests d'intégration : tri ascendant (avec hors-mois exclu), mois vide, query mal formée, query manquante, mois hors plage `2026-13`.
- Test isolé via DB SQLite temporaire (DDL brut) + handler appelé directement (pas besoin de `@nuxt/test-utils`/`$fetch` — KISS).

### File List

- `shared/schemas/transaction.schema.ts` (modifié — ajout `TransactionListQuerySchema` + type)
- `server/api/transactions/index.get.ts` (nouveau)
- `server/api/transactions/index.get.test.ts` (nouveau)
- `app/composables/useTransactions.ts` (nouveau)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modifié — statut 2-7)
- `_bmad-output/implementation-artifacts/2-7-endpoint-get-transactions-et-composable.md` (modifié — statut + journal dev)

### Change Log

- 2026-05-01 — Implémentation story 2.7 : endpoint `GET /api/transactions` + composable `useTransactions`. 5 tests d'intégration verts. Suite complète : 122/122. Typecheck + lint OK.

### Review Findings

- [x] [Review][Patch] **`key: key.value` snapshote la valeur initiale — cache key non réactif** [`app/composables/useTransactions.ts:24`] — Sources : blind+edge+auditor (HIGH, convergence des 3 reviewers). `key` est typé `string` côté Nuxt ; on lit `key.value` une seule fois à l'appel du composable, gelant le cache au mois initial. Quand `month` change, le `query: { month }` (Ref) déclenche bien un refetch, mais l'entrée de cache reste liée au mois initial — risque de fuite/écrasement entre mois. Les Dev Notes elles-mêmes affirment "La key réactive (computed) suffit à différencier les caches par mois", ce qui contredit le code. **Fix recommandé** : supprimer l'option `key` (Nuxt auto-génère une key incluant `query.month`), ou la rendre réactive via getter `key: () => \`transactions-${month.value}\`` si la version Nuxt le supporte.
- [x] [Review][Patch] **`TransactionListItem.amountCents` typé `number` au lieu de `Cents`** [`app/composables/useTransactions.ts:6`] — Source : blind (MEDIUM). Viole l'invariant monétaire de CLAUDE.md ("`amount: number` dans un type métier" interdit). Le consommateur peut mélanger librement avec des nombres non-cents. **Fix** : importer `Cents` depuis `~~/shared/types/money` et retyper `amountCents: Cents`.
- [x] [Review][Defer] **Tests redéfinissent le schéma via DDL brut au lieu de réutiliser drizzle/migrations** [`server/api/transactions/index.get.test.ts:30-61`] — deferred, pre-existing — Sources : blind+auditor. Risque de faux positifs si le schéma drizzle évolue (nouvelle colonne NOT NULL sans default). À refactorer globalement pour tous les tests d'intégration via `migrate()` sur DB temp — pas dans le scope d'une story endpoint isolée.
- [x] [Review][Defer] **`process.env.DATABASE_URL` capturé au timing d'import — fragile sous Vitest parallèle** [`server/api/transactions/index.get.test.ts:11-12`] — deferred, pre-existing — Source : edge. Singleton `db/client.ts` capture le path à l'import. Si une autre test file dans le même worker importe `db/client` en premier, le test pointe vers la prod DB. À durcir globalement (`vi.resetModules()` ou config `--isolate` Vitest).
- [x] [Review][Defer] **Accès à `db.$client` (API privée Drizzle)** [`server/api/transactions/index.get.test.ts:28`] — deferred, pre-existing — Sources : blind+auditor. Bumps mineurs Drizzle peuvent casser ; lié au point précédent (refactor migrations partagées).
- [x] [Review][Defer] **`H3Event` mocké à la main bypasse la pipeline h3 réelle** [`server/api/transactions/index.get.test.ts:147`] — deferred, pre-existing — Sources : blind+auditor. Choix KISS explicitement documenté dans Dev Notes. À reconsidérer si un middleware Nitro est ajouté entre la validation et le handler.
- [x] [Review][Defer] **Flag `reliability` du `bank_statements` non remonté par l'endpoint** [`server/api/transactions/index.get.ts`] — deferred, hors scope 2.7 — Source : edge (MEDIUM). L'invariant CLAUDE.md "réconciliation = état non fiable" exige une UX dédiée — appartient à une story d'affichage du `unreliability badge` (probablement 2.10 ou ultérieure). AC #1 ne liste pas ce champ, donc respect strict du scope.
- [x] [Review][Defer] **`default: () => []` ne corrige pas le typage `T | null` de `data`** [`app/composables/useTransactions.ts:25`] — deferred, footgun TS connu — Sources : blind+edge. Pattern global de l'app, à traiter de manière transversale (wrapper composable ou `transform`).
