import type { Suggestion } from '~~/server/services/charge-suggester'
import type { NewFixedCharge } from '~~/shared/schemas/fixed-charge.schema'
import { useFixedCharges, type ChargeMutationOutcome } from './useFixedCharges'

export interface SuggestionsResponse {
  suggestions: Suggestion[]
}

const EMPTY_RESPONSE: SuggestionsResponse = { suggestions: [] }

/**
 * Suggestions de charges récurrentes — lecture + accept/dismiss.
 * `accept` délègue la création (POST + refresh liste charges + invalidations) à
 * `useFixedCharges.addCharge`, puis rafraîchit la liste des suggestions : la
 * suggestion disparaît (exclue car désormais en `fixed_charges`) et la charge apparaît.
 * `dismiss` rejette (DELETE) puis rafraîchit les suggestions.
 */
export function useChargeSuggestions() {
  const fetchState = useFetch<SuggestionsResponse>('/api/fixed-charges/suggestions', {
    key: 'charge-suggestions',
    default: () => EMPTY_RESPONSE,
    server: false,
  })

  const { addCharge } = useFixedCharges()
  const { mapMutationError } = useApiError()

  async function dismiss(normalizedLabel: string): Promise<ChargeMutationOutcome> {
    try {
      await $fetch(`/api/fixed-charges/suggestions/${encodeURIComponent(normalizedLabel)}`, {
        method: 'DELETE',
      })
    }
    catch (err) {
      return mapMutationError(err)
    }
    await fetchState.refresh()
    return { ok: true }
  }

  async function accept(suggestion: Suggestion): Promise<ChargeMutationOutcome> {
    const body: NewFixedCharge = {
      label: suggestion.sampleLabel,
      amountCents: suggestion.averageAmountCents,
      categoryCode: suggestion.categoryCode,
      frequency: suggestion.suggestedFrequency,
      startDate: suggestion.startDate,
      endDate: null,
    }
    // addCharge possède POST + refresh des charges + invalidations forecast/dashboard.
    const outcome = await addCharge(body)
    if (outcome.error) return outcome
    await fetchState.refresh()
    return { ok: true }
  }

  return {
    ...fetchState,
    dismiss,
    accept,
  }
}
