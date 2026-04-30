# Story 2.8: Endpoint `PATCH /api/transactions/[id]` + recalcul réactif

Status: ready-for-dev

## Story

As a user,
I want to fix a wrongly categorised transaction in one click,
so that subsequent computations (forecast, dashboard) use the correct data.

## Acceptance Criteria

1. **Given** un endpoint `server/api/transactions/[id].patch.ts` validé par Zod,
   **When** je PATCH `{ categoryCode: 'restaurants' }` sur une transaction existante,
   **Then** la transaction est mise à jour, `is_manual` passe à `true`, et la réponse retourne la transaction mise à jour.

2. **Given** un PATCH `{ isDebtRepayment: true, debtId: null }` (ou avec `debtId` numérique non-null),
   **When** envoyé,
   **Then** `is_debt_repayment` est positionné. La création du `debt_repayments` correspondant ne se fait pas dans cette story (Story 6.3) — pour V1 cette story persiste juste les flags. Documenter dans Completion Notes.

3. **Given** une `category_code` inconnue (pas dans `category_definitions`),
   **When** je PATCH,
   **Then** l'endpoint retourne `validation_failed` (avec détail) **avant** d'écrire en base — vérification effectuée par contrainte FK ou pré-check explicite.

4. **Given** un `id` inexistant,
   **When** je PATCH,
   **Then** l'endpoint retourne `not_found` (404).

5. **Given** un PATCH réussi,
   **When** le composable client `useTransactions` reçoit la mutation,
   **Then** il invalide ses propres `useFetch` (refresh) et le composable global d'invalidation `useInvalidate` (Story 7.8 ; à stub ici) est notifié pour invalider le forecast et le dashboard quand ils existeront (Epics 4 et 7).

## Tasks / Subtasks

- [ ] **Task 1 — Schéma Zod du PATCH** (AC: #1, #2, #3)
  - [ ] Ajouter dans `shared/schemas/transaction.schema.ts` un `TransactionPatchSchema` (tous les champs optionnels : `categoryCode?`, `isDebtRepayment?`, `debtId?`)
  - [ ] Au moins un champ doit être fourni (refine)

- [ ] **Task 2 — Implémenter l'endpoint** (AC: #1, #2, #3, #4)
  - [ ] Créer `server/api/transactions/[id].patch.ts` selon le snippet Dev Notes
  - [ ] Vérifier que la transaction existe (sinon `notFound`)
  - [ ] Si `categoryCode` fourni : vérifier qu'il existe dans `category_definitions` (sinon `validationError` ou laisser FK SQLite throw — préférer le pré-check pour message clair)
  - [ ] `is_manual = true` automatiquement après tout PATCH (le user a touché la transaction)
  - [ ] Retourner la transaction mise à jour

- [ ] **Task 3 — Stub du composable d'invalidation** (AC: #5)
  - [ ] Créer `app/composables/useInvalidate.ts` minimaliste qui expose `invalidateForecast()` et `invalidateDashboard()` no-op pour l'instant (juste `console.warn` en dev). Story 7.8 le finalisera.
  - [ ] Modifier `app/composables/useTransactions.ts` (Story 2.7) pour exposer une `mutateCategory(id, categoryCode)` qui PATCH puis appelle `useInvalidate().invalidateForecast()` et `invalidateDashboard()`

- [ ] **Task 4 — Test d'intégration endpoint** (AC: #1-4)
  - [ ] Créer `server/api/transactions/[id].patch.test.ts`
  - [ ] Cas heureux, cas not_found, cas validation invalide (categoryCode inexistant), cas isDebtRepayment + debtId

- [ ] **Task 5 — Sanity check final**
  - [ ] `yarn typecheck`, `yarn lint`, `yarn test:run` propres
  - [ ] Commit unique

## Dev Notes

### Snippet à ajouter dans `shared/schemas/transaction.schema.ts` (Task 1)

```ts
export const TransactionPatchSchema = z.object({
  categoryCode: z.string().min(1).optional(),
  isDebtRepayment: z.boolean().optional(),
  debtId: z.number().int().positive().nullable().optional(),
}).refine(
  (data) => data.categoryCode !== undefined || data.isDebtRepayment !== undefined || data.debtId !== undefined,
  { message: 'Au moins un champ doit être fourni' },
)

export type TransactionPatch = z.infer<typeof TransactionPatchSchema>
```

### Snippet `server/api/transactions/[id].patch.ts` (Task 2)

```ts
import { defineEventHandler, getRouterParam } from 'h3'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '~/server/db/client'
import { transactions, categoryDefinitions } from '~/server/db/schema'
import { validateBody } from '~/server/utils/validation'
import { domainError, notFound } from '~/server/utils/errors'
import { ApiErrorCode } from '~/shared/schemas/api-errors'
import { TransactionPatchSchema } from '~/shared/schemas/transaction.schema'

export default defineEventHandler(async (event) => {
  const idParam = getRouterParam(event, 'id')
  const id = Number(idParam)
  if (!Number.isFinite(id) || id <= 0) {
    throw domainError(ApiErrorCode.ValidationFailed, { reason: 'invalid id' }, 400)
  }

  const patch = await validateBody(event, TransactionPatchSchema)

  // Vérifier l'existence
  const existing = await db.select().from(transactions).where(eq(transactions.id, id)).limit(1)
  if (existing.length === 0) {
    throw notFound(ApiErrorCode.NotFound, { resource: 'transaction', id })
  }

  // Vérification FK explicite pour categoryCode (meilleurs messages d'erreur que la FK SQLite)
  if (patch.categoryCode !== undefined) {
    const cat = await db
      .select({ code: categoryDefinitions.code })
      .from(categoryDefinitions)
      .where(eq(categoryDefinitions.code, patch.categoryCode))
      .limit(1)
    if (cat.length === 0) {
      throw domainError(
        ApiErrorCode.ValidationFailed,
        { reason: 'unknown categoryCode', value: patch.categoryCode },
        422,
      )
    }
  }

  // Construire le payload UPDATE en n'incluant que les champs fournis
  const update: Partial<typeof transactions.$inferInsert> = {
    isManual: true, // toute mutation utilisateur passe la transaction en "manual"
  }
  if (patch.categoryCode !== undefined) update.categoryCode = patch.categoryCode
  if (patch.isDebtRepayment !== undefined) update.isDebtRepayment = patch.isDebtRepayment
  if (patch.debtId !== undefined) update.debtId = patch.debtId

  await db.update(transactions).set(update).where(eq(transactions.id, id))

  // Re-select pour retourner l'état à jour
  const [updated] = await db.select().from(transactions).where(eq(transactions.id, id))
  return updated
})
```

### Snippet `app/composables/useInvalidate.ts` (Task 3 — stub V1)

```ts
/**
 * useInvalidate — composable d'invalidation transversale (V1 stub).
 *
 * En V1 (Stories 2-6), c'est un no-op + console.warn. Story 7.8 (Forecast) finalise
 * en plugant les vraies invalidations sur useFetch (forecast-*, dashboard-*).
 *
 * À ce stade, sa simple existence permet aux autres composables de l'appeler
 * sans casser, et de le finaliser plus tard sans toucher aux call sites.
 */
export function useInvalidate() {
  function invalidateForecast() {
    if (import.meta.dev) console.warn('[useInvalidate] forecast invalidation requested (no-op until Story 7.8)')
  }
  function invalidateDashboard() {
    if (import.meta.dev) console.warn('[useInvalidate] dashboard invalidation requested (no-op until Story 7.8)')
  }
  return { invalidateForecast, invalidateDashboard }
}
```

### Modification de `useTransactions.ts` (Task 3)

```ts
// Ajouter la méthode mutateCategory dans le composable existant (Story 2.7)
import { useInvalidate } from './useInvalidate'

// ... reste inchangé

export function useTransactions(month: Ref<string>) {
  // ... useFetch comme avant

  async function mutateCategory(id: number, categoryCode: string) {
    await $fetch(`/api/transactions/${id}`, {
      method: 'PATCH',
      body: { categoryCode },
    })
    // Refresh la liste du mois courant
    await refresh()
    // Invalider les vues dérivées (forecast/dashboard) — no-op pour l'instant
    const invalidate = useInvalidate()
    invalidate.invalidateForecast()
    invalidate.invalidateDashboard()
  }

  async function markAsDebtRepayment(id: number, debtId: number | null) {
    await $fetch(`/api/transactions/${id}`, {
      method: 'PATCH',
      body: { isDebtRepayment: true, debtId },
    })
    await refresh()
    const invalidate = useInvalidate()
    invalidate.invalidateForecast()
    invalidate.invalidateDashboard()
  }

  return { ..., mutateCategory, markAsDebtRepayment }
}
```

### Anti-patterns à éviter

- ❌ Update sans `is_manual = true` — la convention est qu'une mutation utilisateur marque la transaction comme manual.
- ❌ Laisser SQLite FK constraint throw une erreur brute pour categoryCode invalide — pré-check pour message FR clair.
- ❌ Faire muter le composant directement (`$fetch` sans passer par le composable) — toujours via `useTransactions().mutateCategory(...)`.
- ❌ Implémenter la création du `debt_repayments` ici — c'est la Story 6.3.

### Project Structure Notes

Cette story crée/modifie :
- `server/api/transactions/[id].patch.ts` (création)
- `server/api/transactions/[id].patch.test.ts` (création)
- `app/composables/useInvalidate.ts` (création stub)
- `app/composables/useTransactions.ts` (modification — ajout `mutateCategory` et `markAsDebtRepayment`)
- `shared/schemas/transaction.schema.ts` (modification — ajout `TransactionPatchSchema`)

### Definition of Done

- [ ] Endpoint PATCH opérationnel sur les 4 cas
- [ ] Stub `useInvalidate` créé
- [ ] `useTransactions.mutateCategory` et `markAsDebtRepayment` exposés
- [ ] Tests d'intégration passent
- [ ] `yarn typecheck`, `yarn lint`, `yarn test:run` propres
- [ ] Commit unique

### References

- [Source: `CLAUDE.md`#Communication Patterns] — pattern useFetch avec key + refresh
- [Source: `CLAUDE.md`#Process Patterns] — gestion d'erreurs métier
- [Source: `_bmad-output/planning-artifacts/architecture.md`#Core Architectural Decisions §D9] — recalcul forecast = endpoint pur (futur)
- [Source: `_bmad-output/planning-artifacts/prd.md`#FR8, §FR10] — édition manuelle + recalcul réactif
- [Source: `_bmad-output/planning-artifacts/epics.md`#Story 2.8] — story originale
- [Previous stories: `1-6` errors/validation, `2-1` schemas, `2-7` GET endpoint + composable]

## Dev Agent Record

### Agent Model Used

_(à remplir)_

### Debug Log References

_(à remplir)_

### Completion Notes List

_(à remplir — confirmer que les CONSOLE.WARN du stub useInvalidate ne polluent pas les tests)_

### File List

_(à remplir)_
