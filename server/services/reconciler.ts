/**
 * reconciler — vérifie que la somme des transactions d'un relevé correspond
 * à l'écart entre solde d'ouverture et solde de clôture (FR11, FR12, NFR10).
 *
 * Fonction PURE : pas de DB, pas de log, pas de side-effect. Réutilisable côté serveur
 * (ingestion) et côté tests (snapshots forecast).
 */
import { type Cents, sumCents, subCents, cents } from '~~/shared/types/money'

export interface ReconcileInput {
  openingCents: Cents
  closingCents: Cents
  transactions: ReadonlyArray<{ amountCents: Cents }>
}

export interface ReconcileResult {
  isBalanced: boolean
  /**
   * Écart = (closingCents - openingCents) - sum(transactions.amountCents)
   * - 0       : équilibré
   * - positif : transactions extraites en surplus
   * - négatif : il manque des transactions extraites
   *
   * Note : la convention de signe correspond aux tests (positive gap = surplus).
   */
  gapCents: Cents
}

export function reconcile(input: ReconcileInput): ReconcileResult {
  const expectedDelta = subCents(input.closingCents, input.openingCents)
  const foundDelta = sumCents(input.transactions.map(t => t.amountCents))
  const gapCents = subCents(expectedDelta, foundDelta)
  return {
    isBalanced: gapCents === cents(0),
    gapCents,
  }
}
