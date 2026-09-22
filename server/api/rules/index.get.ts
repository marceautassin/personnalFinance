import { defineEventHandler } from 'h3'
import { asc, eq } from 'drizzle-orm'
import { db } from '~~/server/db/client'
import { classificationRules, categoryItems, categoryGroups } from '~~/server/db/schema'
import { normalizeForMatch } from '~~/server/services/rule-matcher'
import { coverageByRule } from '~~/server/utils/rule-coverage'
import type { ClassificationRuleWithLabels } from '~~/shared/schemas/classification-rule.schema'

/**
 * GET /api/rules — règles de classement, avec la portée de chacune.
 *
 * `matchCount` compte les transactions DÉJÀ en base que la règle couvre. C'est ce qui rend une
 * règle jugeable avant de l'écrire : un motif trop large se voit à son compteur.
 *
 * Le comptage utilise EXACTEMENT la comparaison du moteur (`normalizeForMatch`) : ce n'est
 * plus une approximation depuis le 2026-09-06, où un `LIKE` SQL manquait les libellés
 * accentués et annonçait zéro ligne couverte sur des règles qui en couvraient.
 *
 * `pendingCount` dit, parmi ces lignes, combien une application déplacerait encore (story 18.9).
 */
export default defineEventHandler(async (): Promise<ClassificationRuleWithLabels[]> => {
  const rows = await db
    .select({
      id: classificationRules.id,
      pattern: classificationRules.pattern,
      categoryItemCode: categoryItems.code,
      createdAt: classificationRules.createdAt,
      itemLabel: categoryItems.label,
      groupLabel: categoryGroups.label,
    })
    .from(classificationRules)
    .innerJoin(categoryItems, eq(categoryItems.id, classificationRules.categoryItemId))
    .innerJoin(categoryGroups, eq(categoryGroups.id, categoryItems.groupId))
    .orderBy(asc(classificationRules.id))

  // Couverture et retard sont CALCULÉS, jamais stockés (story 18.9) : un drapeau en base
  // divergerait de la réalité dès l'ingestion suivante.
  const coverage = coverageByRule(rows)

  return rows.map((r, i) => ({
    ...r,
    matchCount: coverage[i]!.coveredCount,
    pendingCount: coverage[i]!.pendingCount,
  }))
})

/** Réexporté pour que les handlers d'écriture partagent la normalisation du moteur. */
export { normalizeForMatch }
