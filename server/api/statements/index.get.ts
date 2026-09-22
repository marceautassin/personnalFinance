/**
 * GET /api/statements — liste des relevés ingérés, avec leur fiabilité et leur taux de
 * correction manuelle (FR8, FR24).
 *
 * Triés par `period_start` DESC. Liste vide si aucun relevé (jamais 404).
 *
 * **Le taux de correction est le chiffre du jalon de décision du MVP** : au-delà de 10 % de
 * lignes reprises à la main, la corvée que le produit devait supprimer est de retour. Il se
 * calcule sans ajout de schéma — `transactions.is_manual` signifie déjà « catégorie corrigée
 * à la main », et le correctif du 2026-09-04 (poser le drapeau uniquement quand le patch
 * touche la catégorie) l'a rendu fiable pour cet usage.
 */
import { defineEventHandler } from 'h3'
import { sql, desc } from 'drizzle-orm'
import { db } from '~~/server/db/client'
import { ACCEPT_GAP_ITEM_CODE } from '~~/shared/constants/default-referential'
import { bankStatements, transactions } from '~~/server/db/schema'
import { ratio, type Ratio } from '~~/shared/types/ratio'
import type { StatementReliability } from '~~/shared/types/statement-reliability'
import { reliabilityByStatement } from '~~/server/utils/statement-reliability'

export interface StatementListItem {
  hash: string
  periodStart: string
  periodEnd: string
  reliability: StatementReliability
  /** Écart courant du relevé, recalculé — jamais stocké. */
  gapCents: number
  ingestedAt: number
  transactionCount: number
  manualCount: number
  /** `null` sur un relevé sans transaction : le taux n'est pas défini, il n'est pas nul. */
  correctionRate: Ratio | null
}

export default defineEventHandler(async (): Promise<{ statements: StatementListItem[] }> => {
  const countFor = (condition: ReturnType<typeof sql> | null) => sql<number>`(
    SELECT COUNT(*) FROM ${transactions}
    WHERE ${transactions.statementHash} = ${bankStatements.hashSha256}
    ${condition ?? sql``}
  )`

  // Les lignes d'écart accepté sont exclues des DEUX TERMES DU TAUX (story 17.3) : ce ne sont
  // ni des lignes de relevé, ni des corrections de classement. Les compter au numérateur
  // gonflait le taux de correction manuelle — l'indicateur même du jalon 14.4.
  //
  // L'exclusion ne touche PAS `transactionCount` : ce compteur dit ce que la base contient
  // pour ce relevé, et le faire diverger de `/transactions/<mois>` créerait une incohérence
  // visible d'un écran à l'autre (revue du 2026-09-06).
  //
  // `transactions.category_item_id` est une clé technique (D37) : la comparaison au code
  // protégé passe par une sous-requête plutôt qu'une jointure, pour rester dans la même
  // requête corrélée que `countFor`. `NOT IN` et non `<> (sous-requête scalaire)` (revue de la
  // story 27.1) : un code de poste n'est unique QUE dans son profil (`uniqueIndex(profile_id,
  // code)`) — dès qu'un second profil existe, la sous-requête peut rendre PLUSIEURS lignes, et
  // `<>` contre une sous-requête multi-lignes est une erreur SQL, pas un filtre silencieusement
  // restreint.
  const notAcceptGap = sql`AND ${transactions.categoryItemId} NOT IN (SELECT id FROM category_items WHERE code = ${ACCEPT_GAP_ITEM_CODE})`

  const rows = await db
    .select({
      hash: bankStatements.hashSha256,
      periodStart: bankStatements.periodStart,
      periodEnd: bankStatements.periodEnd,
      ingestedAt: bankStatements.ingestedAt,
      transactionCount: countFor(null),
      manualCount: countFor(sql`AND ${transactions.isManual} = 1 ${notAcceptGap}`),
      ratedCount: countFor(notAcceptGap),
    })
    .from(bankStatements)
    .orderBy(desc(bankStatements.periodStart))

  const reliabilities = await reliabilityByStatement()

  return {
    statements: rows.map(({ ratedCount, ...r }) => {
      const rel = reliabilities.get(r.hash)
      return {
        ...r,
        transactionCount: Number(r.transactionCount),
        manualCount: Number(r.manualCount),
        correctionRate: ratio(Number(r.manualCount), Number(ratedCount)),
        reliability: rel?.reliability ?? 'reliable',
        gapCents: rel?.gapCents ?? 0,
      }
    }),
  }
})
