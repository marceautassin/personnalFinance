import { neutralizeSettlements, type AnalysisTransaction } from '~~/server/services/analysis-engine'
import type { SettlementStatus } from '~~/shared/types/settlement-status'

/**
 * Ce que la réconciliation a fait d'une ligne : son état, et ce qu'elle pèse vraiment.
 *
 * Les deux sortent du MÊME rejeu. Les calculer séparément reviendrait à tenir deux
 * implémentations d'une seule règle — un badge « remboursé » au-dessus d'un montant qui compte
 * encore est précisément le mensonge que NFR2 interdit.
 */
export interface SettlementEffect {
  status: SettlementStatus
  /** Ce que la ligne pèse dans les agrégats — `0` quand elle est entièrement neutralisée. */
  effectiveAmountCents: number
}

/** Une ligne, telle qu'il faut la connaître pour dire son état. */
interface Line {
  id: number
  transactionDate: string
  amountCents: number
  categoryItemCode: string
  settlementGroupId: number | null
}

/**
 * Effet de la neutralisation sur chaque ligne d'un groupe, DÉRIVÉ de la neutralisation elle-même.
 *
 * On rejoue `neutralizeSettlements` plutôt que de refaire le calcul : deux implémentations de
 * la même règle finiraient par diverger, et l'écran annoncerait « neutralisé » sur une ligne
 * que le moteur compte encore. C'est le même risque que le drapeau `enabled` écarté en 18.9 —
 * un état dérivé ne peut pas mentir.
 *
 * - `neutralized` : la ligne ne pèse plus rien dans les agrégats.
 * - `partial` : elle y pèse moins que son montant — un reliquat reste à charge.
 * - `outstanding` : elle y pèse pour son montant entier, le groupe ne la couvre pas encore.
 *
 * ⚠️ **La portée compte.** Le résultat dépend entièrement des lignes qu'on passe : il faut lui
 * donner celles de la PÉRIODE agrégée, sans autre filtre. Amputer un groupe de ses
 * remboursements — parce qu'ils sont rangés sur un autre poste, par exemple — ferait dire
 * « à rembourser » d'une avance que le moteur a bel et bien neutralisée.
 */
export function settlementEffectByTransaction(lines: readonly Line[]): Map<number, SettlementEffect> {
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

  const out = new Map<number, SettlementEffect>()
  for (const line of grouped) {
    // Une ligne absente de la sortie du moteur ne pèse plus rien : il ne rend pas les montants
    // nuls, précisément pour ne pas les faire compter.
    const left = effective.get(line.id) ?? 0
    // `outstanding` d'abord : une ligne à 0,00 € rattachée à un groupe n'est ni une avance ni
    // un remboursement pour le moteur, qui l'ignore. La dire « remboursée » affirmerait un
    // remboursement qui n'a pas eu lieu (revue du 2026-09-08).
    const status: SettlementStatus = left === line.amountCents
      ? 'outstanding'
      : left === 0 ? 'neutralized' : 'partial'
    out.set(line.id, { status, effectiveAmountCents: left })
  }
  return out
}
