import type { DebtImpact } from '~~/server/api/debts/[id]/impact.get'

/**
 * Impact d'une dette — dépense projetée cumulée 6/12/24 mois (story 6.4).
 * Chargé à la demande (le composant n'est monté que lorsque l'utilisateur ouvre l'impact).
 */
export function useDebtImpact(debtId: number) {
  return useFetch<DebtImpact>(`/api/debts/${debtId}/impact`, {
    key: `debt-impact-${debtId}`,
    server: false,
  })
}
