import { computed, type Ref } from 'vue'
import type { Cents } from '~~/shared/types/money'
import type { MutationOutcome } from './useApiError'
import { useInvalidate } from './useInvalidate'
import type { StatementReliability } from '~~/shared/types/statement-reliability'

/** Règle que le serveur propose après une correction manuelle (FR43). */
export interface RuleSuggestion {
  pattern: string
  categoryItemCode: string
}

export interface TransactionListItem {
  id: number
  statementHash: string
  transactionDate: string
  label: string
  amountCents: Cents
  categoryItemCode: string
  isManual: boolean
}

export interface TransactionsResponse {
  transactions: TransactionListItem[]
  reliability: StatementReliability | null
}

const EMPTY_RESPONSE: TransactionsResponse = { transactions: [], reliability: null }

/**
 * Liste des transactions d'un mois (`YYYY-MM`) + reliability agrégée du/des statement(s).
 * `month` est un `Ref` réactif : changer sa valeur déclenche un refetch via la `key` calculée.
 * Pas de cache Pinia — la source de vérité est l'API (cf. CLAUDE.md anti-patterns).
 */

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

  /**
   * Motif de règle proposé par le serveur après la dernière correction, ou `null`.
   *
   * Vit ici et non dans le composant : la proposition survit au refetch de la liste, sinon
   * elle disparaîtrait avant que l'utilisateur ait eu le temps de la lire.
   */
  const ruleSuggestion = ref<RuleSuggestion | null>(null)

  async function patchTransaction(
    id: number,
    body: Record<string, unknown>,
    afterRefresh?: () => Promise<unknown> | unknown,
  ): Promise<MutationOutcome> {
    let response: { ruleSuggestion?: RuleSuggestion | null } | undefined
    try {
      response = await apiMutate<{ ruleSuggestion?: RuleSuggestion | null }>(
        `/api/transactions/${id}`,
        { method: 'PATCH', body },
      )
    }
    catch (err) {
      const e = err as { statusMessage?: string, data?: { statusMessage?: string } }
      return { error: mapError(err), errorCode: e.data?.statusMessage ?? e.statusMessage }
    }
    ruleSuggestion.value = response?.ruleSuggestion ?? null
    await fetchState.refresh()
    if (afterRefresh) await afterRefresh()
    await invalidate.invalidateAnalysis()
    return { ok: true }
  }

  function mutateCategory(id: number, categoryItemCode: string): Promise<MutationOutcome> {
    return patchTransaction(id, { categoryItemCode })
  }

  function dismissSuggestion() {
    ruleSuggestion.value = null
  }

  return {
    ...fetchState,
    mutateCategory,
    ruleSuggestion,
    dismissSuggestion,
  }
}
