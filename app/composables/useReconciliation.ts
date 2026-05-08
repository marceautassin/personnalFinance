import { computed, type Ref } from 'vue'
import type { Cents } from '~~/shared/types/money'
import type { ReliabilityValue } from '~~/server/db/schema'
import type { TransactionListItem } from './useTransactions'
import type { AddManualTransactionInput } from '~~/shared/schemas/reconciliation.schema'

export interface StatementDetailResponse {
  hash: string
  periodStart: string
  periodEnd: string
  openingBalanceCents: Cents
  closingBalanceCents: Cents
  reliability: ReliabilityValue
  transactions: TransactionListItem[]
  reconciliation: { isBalanced: boolean, gapCents: Cents }
}

export interface ReconciliationActionOutcome {
  ok?: true
  error?: string
  errorCode?: string
}

/**
 * Factory pour le `default` de `useFetch` — chaque appel produit un objet frais.
 * Évite qu'une mutation accidentelle (`data.value.transactions.push(...)`)
 * pollue les invocations futures via un singleton partagé.
 */
function emptyStatementDetail(): StatementDetailResponse {
  return {
    hash: '',
    periodStart: '',
    periodEnd: '',
    openingBalanceCents: 0 as Cents,
    closingBalanceCents: 0 as Cents,
    reliability: 'reliable',
    transactions: [],
    reconciliation: { isBalanced: true, gapCents: 0 as Cents },
  }
}

/**
 * Détail d'un statement par hash + recompute reconciliation à la volée (cf. story 3.1).
 * `hashRef` est réactif : changer sa valeur déclenche un refetch via la `key` calculée.
 */
export function useStatementDetail(hashRef: Ref<string>) {
  const key = computed(() => `statement-${hashRef.value}`)
  return useFetch<StatementDetailResponse>(() => `/api/statements/${hashRef.value}`, {
    key,
    default: emptyStatementDetail,
    server: false,
  })
}

/**
 * Mutations de réconciliation manuelle (POST /api/reconciliation/[hash]).
 * Retourne `{ ok | error, errorCode }` pour permettre à l'UI de distinguer
 * les erreurs FR utilisateur (formulaire) des erreurs réseau.
 */
export function useReconciliation() {
  const { mapError } = useApiError()
  const invalidate = useInvalidate()

  async function addManualTransaction(
    hash: string,
    transaction: AddManualTransactionInput,
  ): Promise<ReconciliationActionOutcome> {
    return await postAction(hash, { action: 'add_transaction', transaction })
  }

  async function acceptGap(hash: string): Promise<ReconciliationActionOutcome> {
    return await postAction(hash, { action: 'accept_gap' })
  }

  type ActionBody
    = | { action: 'add_transaction', transaction: AddManualTransactionInput }
      | { action: 'accept_gap' }

  async function postAction(hash: string, body: ActionBody): Promise<ReconciliationActionOutcome> {
    try {
      await $fetch(`/api/reconciliation/${hash}`, { method: 'POST', body })
      // Story 3.3 — propager la nouvelle fiabilité sur /import (cache `statements-list`)
      await invalidate.invalidateStatementsList()
      invalidate.invalidateForecast()
      invalidate.invalidateDashboard()
      return { ok: true }
    }
    catch (err) {
      const e = err as { statusMessage?: string, data?: { statusMessage?: string } }
      return { error: mapError(err), errorCode: e.data?.statusMessage ?? e.statusMessage }
    }
  }

  return { addManualTransaction, acceptGap }
}
