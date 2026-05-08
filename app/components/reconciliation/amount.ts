import type { Cents } from '~~/shared/types/money'

/**
 * Applique le signe sur un montant absolu en cents selon le sens de la transaction.
 * Extrait pour testabilité (cf. AddManualTransaction.vue).
 */
export function buildAmountCents(absCents: Cents, direction: 'expense' | 'income'): Cents {
  return (direction === 'expense' ? -absCents : absCents) as Cents
}
