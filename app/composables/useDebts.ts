import type { Debt, NewDebt, DebtPut } from '~~/shared/schemas/debt.schema'
import type { NewDebtAdvance } from '~~/shared/schemas/debt-advance.schema'
import type { RepaymentMode } from '~~/shared/types/repayment-mode'
import type { MutationOutcome } from './useApiError'
import { useMutations } from './useMutations'

/** Libellés FR des modes de remboursement — partagés form + card. */
export const REPAYMENT_MODE_LABELS: Record<RepaymentMode, string> = {
  free: 'Libre',
  monthly: 'Mensualité fixe',
  lump_sum: 'Montant unique à date',
}

/**
 * Liste des dettes en LECTURE SEULE (clé partagée `debts`, `server:false`).
 * Sans surface de mutation : utilisé par le marqueur de remboursement (une instance par
 * ligne de transaction) pour ne pas allouer les closures de mutation inutilement.
 */
export function useDebtsList() {
  return useFetch<Debt[]>('/api/debts', {
    key: 'debts',
    default: () => [],
    server: false,
  })
}

/**
 * Dettes — lecture + mutations (CRUD + avances) + invalidations transversales.
 * Le composable possède toute la logique de mutation (CLAUDE.md : pas de `$fetch` direct
 * dans les composants). Chaque mutation réussie refetch la liste `debts` ; les mutations
 * qui changent le solde d'une dette précise invalident aussi son `debt-impact-<id>`.
 */
export function useDebts() {
  const fetchState = useDebtsList()
  const runMutation = useMutations(() => fetchState.refresh())

  function addDebt(input: NewDebt): Promise<MutationOutcome> {
    return runMutation(() => apiMutate('/api/debts', { method: 'POST', body: input }))
  }

  function updateDebt(id: number, input: DebtPut): Promise<MutationOutcome> {
    return runMutation(
      () => apiMutate(`/api/debts/${id}`, { method: 'PUT', body: input }),
      () => refreshNuxtData(`debt-impact-${id}`),
    )
  }

  function deleteDebt(id: number): Promise<MutationOutcome> {
    return runMutation(() => apiMutate(`/api/debts/${id}`, { method: 'DELETE' }))
  }

  function addAdvance(debtId: number, input: NewDebtAdvance): Promise<MutationOutcome> {
    return runMutation(
      () => apiMutate(`/api/debts/${debtId}/advances`, { method: 'POST', body: input }),
      () => refreshNuxtData(`debt-impact-${debtId}`),
    )
  }

  return {
    ...fetchState,
    addDebt,
    updateDebt,
    deleteDebt,
    addAdvance,
  }
}
