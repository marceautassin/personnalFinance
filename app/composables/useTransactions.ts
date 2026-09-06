import { computed, type Ref } from 'vue'
import type { Cents } from '~~/shared/types/money'
import type { MutationOutcome } from './useApiError'
import { useInvalidate } from './useInvalidate'
import type { StatementReliability } from '~~/shared/types/statement-reliability'
import { bucketBounds, type Granularity } from '~~/shared/types/granularity'

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
 * Liste des transactions d'une TRANCHE + fiabilité agrégée des relevés qui la couvrent.
 *
 * La tranche est une clé de `granularity` — `2026`, `2026-T3` ou `2026-08` — et non plus un
 * mois seul (demande du 2026-09-06 : « toutes les transactions de l'année, pas seulement du
 * mois »). Les bornes en sont dérivées, comme sur l'écran d'analyse : c'est la tranche que
 * l'utilisateur manipule, les bornes sont ce qu'on envoie à l'API.
 *
 * `bucket` et `granularity` sont réactifs : les changer déclenche un refetch via la `key`.
 * Pas de cache Pinia — la source de vérité est l'API (cf. CLAUDE.md anti-patterns).
 */
export function useTransactions(bucket: Ref<string>, granularity: Ref<Granularity>) {
  const bounds = computed(() => bucketBounds(bucket.value, granularity.value))
  const key = computed(() => `transactions-${bucket.value}`)
  const fetchState = useFetch<TransactionsResponse>('/api/transactions', {
    query: computed(() => ({ from: bounds.value.from, to: bounds.value.to })),
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
