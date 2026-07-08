import type { DividendTaxMode } from '~~/shared/constants/fiscal-defaults'
import type { TaxSettingsPatch } from '~~/shared/schemas/tax-settings.schema'
import type { MutationOutcome } from './useApiError'
import { useInvalidate } from './useInvalidate'

export interface TaxSettingsData {
  id: number
  dividendTaxRatePct: number
  dividendTaxMode: DividendTaxMode
  updatedAt: number
}

/**
 * Réglages d'imposition (singleton) — lecture + mutation partielle + invalidations.
 * Mêmes conventions que `useSasConfig` (story 5.4) : pas de `$fetch` dans les composants,
 * mutation réussie → refetch puis invalidation forecast + dashboard.
 */
export function useTaxSettings() {
  const fetchState = useFetch<TaxSettingsData>('/api/tax-settings', {
    key: 'tax-settings',
    server: false,
  })

  const invalidate = useInvalidate()
  const { mapMutationError } = useApiError()

  async function update(patch: TaxSettingsPatch): Promise<MutationOutcome> {
    try {
      await $fetch('/api/tax-settings', { method: 'PUT', body: patch })
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
