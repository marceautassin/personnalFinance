import { computed, type Ref } from 'vue'
import type { Cents } from '~~/shared/types/money'
import { useInvalidate } from './useInvalidate'

export interface TransactionListItem {
  id: number
  statementHash: string
  transactionDate: string
  label: string
  amountCents: Cents
  categoryCode: string
  isManual: boolean
  isDebtRepayment: boolean
  debtId: number | null
}

export interface TransactionsResponse {
  transactions: TransactionListItem[]
  reliability: 'reliable' | 'unreliable' | null
}

const EMPTY_RESPONSE: TransactionsResponse = { transactions: [], reliability: null }

/**
 * Liste des transactions d'un mois (`YYYY-MM`) + reliability agrégée du/des statement(s).
 * `month` est un `Ref` réactif : changer sa valeur déclenche un refetch via la `key` calculée.
 * Pas de cache Pinia — la source de vérité est l'API (cf. CLAUDE.md anti-patterns).
 */
export interface MutateCategoryOutcome {
  /** Set when the PATCH succeeded and the list has been refreshed. */
  ok?: true
  /** Message FR utilisateur quand le PATCH a échoué. */
  error?: string
  /** Code stable côté API (utilisable pour décider d'un retry). */
  errorCode?: string
}

export function useTransactions(month: Ref<string>) {
  const key = computed(() => `transactions-${month.value}`)
  const fetchState = useFetch<TransactionsResponse>('/api/transactions', {
    query: { month },
    key,
    default: () => EMPTY_RESPONSE,
    server: false,
  })

  // Capturé en setup (avant tout `await`) pour préserver le contexte Nuxt.
  const invalidate = useInvalidate()
  const { mapError } = useApiError()

  async function mutateCategory(id: number, categoryCode: string): Promise<MutateCategoryOutcome> {
    try {
      await $fetch(`/api/transactions/${id}`, {
        method: 'PATCH',
        body: { categoryCode },
      })
    }
    catch (err) {
      const e = err as { statusMessage?: string, data?: { statusMessage?: string } }
      return { error: mapError(err), errorCode: e.data?.statusMessage ?? e.statusMessage }
    }
    await fetchState.refresh()
    invalidate.invalidateForecast()
    invalidate.invalidateDashboard()
    return { ok: true }
  }

  return {
    ...fetchState,
    mutateCategory,
  }
}
