import { neutralizeSettlements, type AnalysisTransaction } from '~~/server/services/analysis-engine'

/** Ce qu'une ligne est devenue après réconciliation (epic 19, story 19.3). */
export type SettlementStatus = 'neutralized' | 'partial' | 'outstanding'

/** Une ligne, telle qu'il faut la connaître pour dire son état. */
interface Line {
  id: number
  transactionDate: string
  amountCents: number
  categoryItemCode: string
  settlementGroupId: number | null
}

/**
 * État de chaque ligne d'un groupe, DÉRIVÉ de la neutralisation elle-même.
 *
 * On rejoue `neutralizeSettlements` plutôt que de refaire le calcul : deux implémentations de
 * la même règle finiraient par diverger, et l'écran annoncerait « neutralisé » sur une ligne
 * que le moteur compte encore. C'est le même risque que le drapeau `enabled` écarté en 18.9 —
 * un état dérivé ne peut pas mentir.
 *
 * - `neutralized` : la ligne ne pèse plus rien dans les agrégats.
 * - `partial` : elle y pèse moins que son montant — un reliquat reste à charge.
 * - `outstanding` : elle y pèse pour son montant entier, le groupe ne la couvre pas encore.
 */
export function settlementStatusByTransaction(lines: readonly Line[]): Map<number, SettlementStatus> {
  const grouped = lines.filter(l => l.settlementGroupId !== null)
  if (grouped.length === 0) return new Map()

  // `neutralizeSettlements` ne connaît pas les `id` : on rattache le résultat par identité de
  // ligne (date, poste, montant d'origine) via un index positionnel préservé par le transport.
  const withKey: Array<AnalysisTransaction & { id: number }> = grouped.map(l => ({
    id: l.id,
    transactionDate: l.transactionDate,
    amountCents: l.amountCents,
    categoryItemCode: l.categoryItemCode,
    settlementGroupId: l.settlementGroupId,
  }))

  const effective = new Map<number, number>()
  for (const row of neutralizeSettlements(withKey) as Array<AnalysisTransaction & { id?: number }>) {
    if (row.id !== undefined) effective.set(row.id, row.amountCents)
  }

  const out = new Map<number, SettlementStatus>()
  for (const line of grouped) {
    const left = effective.get(line.id) ?? 0
    if (left === 0) out.set(line.id, 'neutralized')
    else if (left === line.amountCents) out.set(line.id, 'outstanding')
    else out.set(line.id, 'partial')
  }
  return out
}
