import type { Cents } from '~~/shared/types/money'
import type { RevenueModelPatch } from '~~/shared/schemas/revenue-model.schema'
import { useInvalidate } from './useInvalidate'

export interface RevenueModelData {
  id: number
  unemploymentBenefitMonthlyCents: Cents
  unemploymentBenefitEndDate: string | null
  sasMonthlyRentCents: Cents
  expenseReimbursementsMonthlyCents: Cents
  updatedAt: number
}

export interface RevenueMutationOutcome {
  ok?: true
  error?: string
  errorCode?: string
}

/**
 * Modèle de revenus (singleton) — lecture + mutation partielle + invalidations.
 * Chaque panneau UI soumet uniquement ses champs via `update(patch)` ; le serveur applique
 * le patch. Toute la logique de mutation vit ici (CLAUDE.md : pas de `$fetch` dans les
 * composants). Une mutation réussie refetch puis invalide forecast + dashboard.
 */
export function useRevenueModel() {
  const fetchState = useFetch<RevenueModelData>('/api/revenues', {
    key: 'revenue-model',
    server: false,
  })

  // Capturés en setup (avant tout `await`) pour préserver le contexte Nuxt.
  const invalidate = useInvalidate()
  const { mapMutationError } = useApiError()

  async function update(patch: RevenueModelPatch): Promise<RevenueMutationOutcome> {
    try {
      await $fetch('/api/revenues', { method: 'PUT', body: patch })
    }
    catch (err) {
      return mapMutationError(err)
    }
    await fetchState.refresh()
    invalidate.invalidateForecast()
    invalidate.invalidateDashboard()
    return { ok: true }
  }

  return {
    data: fetchState.data,
    pending: fetchState.pending,
    error: fetchState.error,
    refresh: fetchState.refresh,
    update,
  }
}
