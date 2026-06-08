import type { Cents } from '~~/shared/types/money'
import type { Frequency, NewFixedCharge, FixedChargePut } from '~~/shared/schemas/fixed-charge.schema'
import { useInvalidate } from './useInvalidate'

export interface FixedChargeItem {
  id: number
  label: string
  amountCents: Cents
  categoryCode: string
  frequency: Frequency
  startDate: string
  endDate: string | null
  createdAt: number
}

export interface FixedChargesResponse {
  charges: FixedChargeItem[]
}

/**
 * Valeurs de préremplissage du `FixedChargeForm` — satisfaites aussi bien par un
 * `FixedChargeItem` existant (édition) que par une suggestion (création pré-remplie).
 */
export interface ChargeFormPrefill {
  label: string
  amountCents: Cents
  categoryCode: string
  frequency: Frequency
  startDate: string
  endDate: string | null
}

/** Libellés FR des fréquences — partagés entre le formulaire et la liste. */
export const FREQUENCY_LABELS: Record<Frequency, string> = {
  monthly: 'Mensuelle',
  quarterly: 'Trimestrielle',
  annual: 'Annuelle',
  punctual: 'Ponctuelle',
}

export interface ChargeMutationOutcome {
  ok?: true
  error?: string
  errorCode?: string
}

const EMPTY_RESPONSE: FixedChargesResponse = { charges: [] }

/**
 * Charges fixes — lecture + mutations + invalidations transversales.
 * Le composable possède toute la logique de mutation (CLAUDE.md : pas de `$fetch` direct
 * dans les composants). Chaque mutation réussie refetch la liste puis invalide
 * forecast + dashboard (stubs jusqu'à Story 7.8).
 */
export function useFixedCharges() {
  const fetchState = useFetch<FixedChargesResponse>('/api/fixed-charges', {
    key: 'fixed-charges',
    default: () => EMPTY_RESPONSE,
    server: false,
  })

  // Capturés en setup (avant tout `await`) pour préserver le contexte Nuxt.
  const invalidate = useInvalidate()
  const { mapMutationError } = useApiError()

  async function runMutation(fn: () => Promise<unknown>): Promise<ChargeMutationOutcome> {
    try {
      await fn()
    }
    catch (err) {
      return mapMutationError(err)
    }
    await fetchState.refresh()
    invalidate.invalidateForecast()
    invalidate.invalidateDashboard()
    return { ok: true }
  }

  function addCharge(input: NewFixedCharge): Promise<ChargeMutationOutcome> {
    return runMutation(() => $fetch('/api/fixed-charges', { method: 'POST', body: input }))
  }

  function updateCharge(id: number, input: FixedChargePut): Promise<ChargeMutationOutcome> {
    return runMutation(() => $fetch(`/api/fixed-charges/${id}`, { method: 'PUT', body: input }))
  }

  function deleteCharge(id: number): Promise<ChargeMutationOutcome> {
    return runMutation(() => $fetch(`/api/fixed-charges/${id}`, { method: 'DELETE' }))
  }

  return {
    ...fetchState,
    addCharge,
    updateCharge,
    deleteCharge,
  }
}
