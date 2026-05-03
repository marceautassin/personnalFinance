# Story 2.8: Endpoint `PATCH /api/transactions/[id]` + recalcul réactif

Status: done

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

- [x] **Task 1 — Schéma Zod du PATCH** (AC: #1, #2, #3)
  - [x] Ajouter dans `shared/schemas/transaction.schema.ts` un `TransactionPatchSchema` (tous les champs optionnels : `categoryCode?`, `isDebtRepayment?`, `debtId?`)
  - [x] Au moins un champ doit être fourni (refine)

- [x] **Task 2 — Implémenter l'endpoint** (AC: #1, #2, #3, #4)
  - [x] Créer `server/api/transactions/[id].patch.ts` selon le snippet Dev Notes
  - [x] Vérifier que la transaction existe (sinon `notFound`)
  - [x] Si `categoryCode` fourni : vérifier qu'il existe dans `category_definitions` (sinon `validationError` ou laisser FK SQLite throw — préférer le pré-check pour message clair)
  - [x] `is_manual = true` automatiquement après tout PATCH (le user a touché la transaction)
  - [x] Retourner la transaction mise à jour

- [x] **Task 3 — Stub du composable d'invalidation** (AC: #5)
  - [x] Créer `app/composables/useInvalidate.ts` minimaliste qui expose `invalidateForecast()` et `invalidateDashboard()` no-op pour l'instant (juste `console.warn` en dev). Story 7.8 le finalisera.
  - [x] Modifier `app/composables/useTransactions.ts` (Story 2.7) pour exposer une `mutateCategory(id, categoryCode)` qui PATCH puis appelle `useInvalidate().invalidateForecast()` et `invalidateDashboard()`

- [x] **Task 4 — Test d'intégration endpoint** (AC: #1-4)
  - [x] Créer `server/api/transactions/[id].patch.test.ts`
  - [x] Cas heureux, cas not_found, cas validation invalide (categoryCode inexistant), cas isDebtRepayment + debtId

- [x] **Task 5 — Sanity check final**
  - [x] `yarn typecheck`, `yarn lint`, `yarn test:run` propres
  - [ ] Commit unique (à la main par l'utilisateur)

### Review Findings

- [x] [Review][Patch] `useInvalidate()` instancié après `await fetchState.refresh()` dans `mutateCategory` / `markAsDebtRepayment` — perd le contexte Nuxt (`useNuxtApp`), bug latent qui se déclenchera quand Story 7.8 plug les vraies invalidations. Fix appliqué : `const invalidate = useInvalidate()` capturé en setup avant tout `await`. [`app/composables/useTransactions.ts:23`]
- [x] [Review][Patch] `categoryCode` non-trimé dans `TransactionPatchSchema` — `"courses\n"` ou `"  restaurants  "` routait vers le pré-check FK qui retournait `unknown categoryCode` au lieu d'un message de format clair. Fix appliqué : `.trim()` ajouté dans le schéma. [`shared/schemas/transaction.schema.ts:88`]
- [x] [Review][Defer] Cross-field invariant `isDebtRepayment ↔ debtId` non vérifié sur PATCH partiel [`server/api/transactions/[id].patch.ts:43-46`] — deferred, scope explicite Story 6.3 (la story dit "persiste juste les flags").
- [x] [Review][Defer] Pas de pré-check FK sur `debtId` (parité avec `categoryCode`) [`server/api/transactions/[id].patch.ts:46`] — deferred, table `debts` créée Story 6.1.
- [x] [Review][Defer] Parsing `id` permissif : `Number("1e2")` → 100, floats truncatés, valeurs > `MAX_SAFE_INTEGER` [`server/api/transactions/[id].patch.ts:12-15`] — deferred, mono-user V1, low impact.
- [x] [Review][Defer] Erreurs `$fetch` PATCH non normalisées via `useApiError` dans `useTransactions.mutateCategory` / `markAsDebtRepayment` [`app/composables/useTransactions.ts:30-49`] — deferred, normalisation à plugger côté composant consommateur (Story 2.10).

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

claude-opus-4-7 (1M context) — bmad-dev-story workflow.

### Debug Log References

- Le mock d'`H3Event` initial passait le body via une `Readable` Node ; `h3@1.15.11` ignorait le stream et retournait un body vide → 422 sur les tests OK/404. Fix : utiliser `event._requestBody` (chemin natif d'h3 pour body pré-stash, vérifié dans `node_modules/h3/dist/index.mjs:368`).

### Completion Notes List

- AC #1, #3, #4 entièrement couverts (categoryCode update + is_manual=true, FK pre-check 422, not_found 404).
- AC #2 : flags `is_debt_repayment` / `debt_id` persistés tels quels. **La création du `debt_repayments` correspondant n'est pas faite ici** — c'est le scope de la Story 6.3, comme prévu dans l'AC.
- AC #5 : `useInvalidate` créé en stub no-op (`console.warn` en `import.meta.dev` uniquement, aucune pollution sur les tests serveur où `import.meta.dev` est faux). `useTransactions.mutateCategory` et `markAsDebtRepayment` exposés et reliés à `refresh()` + invalidate stub.
- Validation supplémentaire dans l'endpoint : `id` non-numérique / non-entier / ≤ 0 → 422 `validation_failed` (au-delà de l'AC mais aligné sur la robustesse attendue).
- Lint : 4 erreurs préexistantes dans `PeriodOverlapDialog.vue` et `useStatements.ts` (autres stories) ; aucun fichier touché par la 2.8 n'en porte. Commit unique à effectuer par l'utilisateur (workflow projet).

### File List

- `shared/schemas/transaction.schema.ts` (modifié — `TransactionPatchSchema` + type `TransactionPatch`)
- `server/api/transactions/[id].patch.ts` (créé — endpoint PATCH)
- `server/api/transactions/[id].patch.test.ts` (créé — 6 tests d'intégration)
- `app/composables/useInvalidate.ts` (créé — stub no-op)
- `app/composables/useTransactions.ts` (modifié — `mutateCategory` + `markAsDebtRepayment`)

## Change Log

| Date       | Auteur  | Description                                                                 |
|------------|---------|------------------------------------------------------------------------------|
| 2026-05-01 | Marceau | Implémentation Story 2.8 — endpoint PATCH transactions + stub useInvalidate |
