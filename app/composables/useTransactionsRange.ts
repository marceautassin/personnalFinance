import type { StatementReliability } from '~~/shared/types/statement-reliability'

export interface RangeTransaction {
  id: number
  statementHash: string
  transactionDate: string
  label: string
  amountCents: number
  categoryItemCode: string
  isManual: boolean
}

/**
 * Transactions d'une plage de dates, éventuellement bornées à un poste — la DESCENTE depuis
 * un agrégat (FR35, AR8).
 *
 * ⚠️ `watch: false` et rafraîchissement EXPLICITE. Nuxt pose un watcher sur les options
 * réactives même avec `immediate: false` : la requête repartait à chaque changement de période
 * alors qu'aucun poste n'était sélectionné, avec `item=''` que le schéma rejette — un 422 à
 * chaque navigation, invisible à l'écran mais bien réel (revue du 2026-09-05).
 *
 * Vit dans un composable et non dans la page : `CLAUDE.md` interdit `useFetch` dans un
 * composant.
 */
export function useTransactionsRange() {
  const from = ref('')
  const to = ref('')
  const itemCode = ref<string | null>(null)

  const state = useFetch<{ transactions: RangeTransaction[], reliability: StatementReliability | null }>(
    '/api/transactions',
    {
      key: 'transactions-range',
      server: false,
      immediate: false,
      watch: false,
      default: () => ({ transactions: [], reliability: null }),
      query: computed(() => ({
        from: from.value,
        to: to.value,
        ...(itemCode.value ? { item: itemCode.value } : {}),
      })),
    },
  )

  /** Charge les lignes d'un poste sur une plage. Aucune requête ne part sans cet appel. */
  async function load(range: { from: string, to: string }, item: string | null) {
    from.value = range.from
    to.value = range.to
    itemCode.value = item
    await state.refresh()
  }

  function reset() {
    itemCode.value = null
    state.data.value = { transactions: [], reliability: null }
  }

  return { ...state, load, reset }
}
