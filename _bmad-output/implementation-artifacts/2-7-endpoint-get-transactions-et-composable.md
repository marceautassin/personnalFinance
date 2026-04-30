# Story 2.7: Endpoint `GET /api/transactions` + composable `useTransactions`

Status: ready-for-dev

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

- [ ] **Task 1 — Schéma Zod de la query** (AC: #1, #2)
  - [ ] Ajouter dans `shared/schemas/transaction.schema.ts` un `TransactionListQuerySchema = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) })`
  - [ ] Type `TransactionListQuery = z.infer<...>`

- [ ] **Task 2 — Implémenter l'endpoint** (AC: #1, #2, #3)
  - [ ] Créer `server/api/transactions/index.get.ts` selon le snippet Dev Notes
  - [ ] Utiliser `validateQuery` (Story 1.6)
  - [ ] Filtrer via Drizzle : `transactionDate LIKE '${month}-%'` (efficace avec l'index `transactions_period_idx`)

- [ ] **Task 3 — Implémenter le composable** (AC: #4)
  - [ ] Créer `app/composables/useTransactions.ts` selon le snippet Dev Notes
  - [ ] Réactivité : `month` est un `Ref<string>`, key utilise `computed`

- [ ] **Task 4 — Test d'intégration endpoint** (AC: #1, #2, #3)
  - [ ] Créer `server/api/transactions/index.get.test.ts`
  - [ ] Cas heureux, cas mois inexistant (array vide), cas query invalide

- [ ] **Task 5 — Sanity check final**
  - [ ] `yarn typecheck`, `yarn lint`, `yarn test:run` propres
  - [ ] Commit unique

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

_(à remplir)_

### Debug Log References

_(à remplir — comportement de useFetch avec query reactive)_

### Completion Notes List

_(à remplir)_

### File List

_(à remplir)_
