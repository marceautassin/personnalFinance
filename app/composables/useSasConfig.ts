import type { Cents } from '~~/shared/types/money'
import type { SasConfigPatch } from '~~/shared/schemas/sas-config.schema'
import { useInvalidate } from './useInvalidate'

export interface SasConfigData {
  id: number
  fiscalYearEndDate: string
  revenueForecastCents: Cents
  expensesForecastCents: Cents
  currentTreasuryCents: Cents
  isRatePct: number
  updatedAt: number
}

export interface SasMutationOutcome {
  ok?: true
  error?: string
  errorCode?: string
}

/**
 * Config SAS (singleton) — lecture + mutation partielle + invalidations.
 * Mêmes conventions que `useRevenueModel` (story 5.3) : pas de `$fetch` dans les composants,
 * mutation réussie → refetch puis invalidation forecast + dashboard.
 */
export function useSasConfig() {
  const fetchState = useFetch<SasConfigData>('/api/sas-config', {
    key: 'sas-config',
    server: false,
  })

  const invalidate = useInvalidate()
  const { mapMutationError } = useApiError()

  async function update(patch: SasConfigPatch): Promise<SasMutationOutcome> {
    try {
      await $fetch('/api/sas-config', { method: 'PUT', body: patch })
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
