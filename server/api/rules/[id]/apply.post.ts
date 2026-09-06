import { defineEventHandler, getRouterParam } from 'h3'
import { asc, eq } from 'drizzle-orm'
import { db } from '~~/server/db/client'
import { classificationRules, transactions } from '~~/server/db/schema'
import { applyRules, patternCovers } from '~~/server/services/rule-matcher'
import { domainError, notFound } from '~~/server/utils/errors'
import { ApiErrorCode } from '~~/shared/schemas/api-errors'

export interface RuleApplyResult {
  /** Lignes effectivement reclassées. */
  updatedCount: number
  /** Lignes couvertes par le motif et relues, mais déjà au bon poste. */
  unchangedCount: number
  /** Lignes qu'une règle aurait déplacées, mais protégées par leur drapeau `is_manual`. */
  skippedManualCount: number
}

/**
 * POST /api/rules/:id/apply — applique une règle aux transactions DÉJÀ en base (story 18.2).
 *
 * Une règle ne valait jusqu'ici que pour les relevés futurs : l'utilisateur devait reprendre à
 * la main les lignes que sa propre connaissance couvrait déjà. Sur vingt mois d'historique,
 * c'est exactement la corvée que le produit existe pour supprimer.
 *
 * **Trois décisions portent ce handler.**
 *
 * 1. **Le jeu COMPLET des règles est rejoué**, restreint aux lignes que ce motif couvre.
 *    Appliquer la règle seule contredirait le départage de l'ingestion — où le motif le plus
 *    long gagne — et rendrait le classement dépendant de l'ordre des clics. Une ligne peut donc
 *    atterrir sur le poste d'une AUTRE règle, plus spécifique : c'est voulu.
 *
 * 2. **Une ligne corrigée à la main n'est jamais touchée.** À l'ingestion, une règle écrase le
 *    modèle : c'est une connaissance contre une supposition. Ici elle écraserait un choix
 *    explicite de l'utilisateur, ce qui n'est pas la même chose.
 *
 * 3. **Les lignes reclassées ne deviennent PAS `is_manual`** (arbitrage du 2026-09-06). Le taux
 *    de correction manuelle mesure la corvée résiduelle, celle des lignes reprises une à une ;
 *    une règle en est l'échappatoire. Les compter ferait exploser l'indicateur du jalon 14.4
 *    sans qu'aucune corvée n'ait eu lieu.
 *
 * La sélection des lignes se fait EN MÉMOIRE, avec la comparaison du moteur (`patternCovers`)
 * et non un `LIKE` SQL : voir le commentaire de `patternCovers`, un `LIKE` manquait les
 * libellés accentués. Le coût est celui d'une lecture de la table — quelques milliers de lignes
 * sur ce produit mono-utilisateur.
 */
export default defineEventHandler(async (event): Promise<RuleApplyResult> => {
  const raw = getRouterParam(event, 'id') ?? ''
  const id = Number(raw)
  if (!Number.isInteger(id) || id <= 0) {
    throw domainError(ApiErrorCode.ValidationFailed, { reason: 'invalid id', value: raw }, 422)
  }

  const rule = db
    .select({ id: classificationRules.id, pattern: classificationRules.pattern })
    .from(classificationRules)
    .where(eq(classificationRules.id, id))
    .get()
  if (!rule) throw notFound(ApiErrorCode.NotFound, { resource: 'classification_rule', id })

  const allRules = await db
    .select({
      pattern: classificationRules.pattern,
      categoryItemCode: classificationRules.categoryItemCode,
    })
    .from(classificationRules)
    .orderBy(asc(classificationRules.id))

  const rows = await db
    .select({
      id: transactions.id,
      label: transactions.label,
      categoryItemCode: transactions.categoryItemCode,
      isManual: transactions.isManual,
    })
    .from(transactions)

  const covered = rows.filter(t => patternCovers(t.label, rule.pattern))
  const codeBefore = new Map(covered.map(t => [t.id, t.categoryItemCode]))

  /** Lignes que le jeu de règles déplacerait réellement, poste d'origine à l'appui. */
  const movedBy = (lines: typeof covered) =>
    applyRules(lines, allRules).transactions
      .filter(tx => codeBefore.get(tx.id) !== tx.categoryItemCode)

  const candidates = covered.filter(t => !t.isManual)
  const changed = movedBy(candidates)

  if (changed.length > 0) {
    db.transaction((tx) => {
      for (const row of changed) {
        tx.update(transactions)
          .set({ categoryItemCode: row.categoryItemCode })
          .where(eq(transactions.id, row.id))
          .run()
      }
    })
  }

  return {
    updatedCount: changed.length,
    unchangedCount: candidates.length - changed.length,
    // Seulement les lignes manuelles qu'une règle AURAIT déplacées : compter toutes les lignes
    // manuelles couvertes annoncerait un travail manqué inexistant (revue du 2026-09-06).
    skippedManualCount: movedBy(covered.filter(t => t.isManual)).length,
  }
})
