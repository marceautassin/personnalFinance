import { defineEventHandler } from 'h3'
import { asc, eq, sql } from 'drizzle-orm'
import { db } from '~~/server/db/client'
import { classificationRules, categoryItems, categoryGroups, transactions } from '~~/server/db/schema'
import { normalizeForMatch } from '~~/server/services/rule-matcher'
import type { ClassificationRuleWithLabels } from '~~/shared/schemas/classification-rule.schema'

/**
 * GET /api/rules — règles de classement, avec la portée de chacune.
 *
 * `matchCount` compte les transactions DÉJÀ en base que la règle couvre. C'est ce qui rend une
 * règle jugeable avant de l'écrire : un motif trop large se voit à son compteur.
 *
 * Le comptage se fait en SQL sur le libellé brut, insensible à la casse. Il reste une
 * APPROXIMATION du moteur, qui lui compare des formes normalisées sans accents ; un motif
 * accentué peut donc afficher un compte plus bas que la réalité. L'écart est assumé : ce
 * chiffre sert à évaluer une portée, pas à décider d'un classement.
 */
export default defineEventHandler(async (): Promise<ClassificationRuleWithLabels[]> => {
  const rows = await db
    .select({
      id: classificationRules.id,
      pattern: classificationRules.pattern,
      categoryItemCode: classificationRules.categoryItemCode,
      createdAt: classificationRules.createdAt,
      itemLabel: categoryItems.label,
      groupLabel: categoryGroups.label,
      matchCount: sql<number>`(
        SELECT COUNT(*) FROM ${transactions}
        WHERE LOWER(${transactions.label}) LIKE '%' || LOWER(${classificationRules.pattern}) || '%'
      )`,
    })
    .from(classificationRules)
    .innerJoin(categoryItems, eq(categoryItems.code, classificationRules.categoryItemCode))
    .innerJoin(categoryGroups, eq(categoryGroups.code, categoryItems.groupCode))
    .orderBy(asc(classificationRules.id))

  return rows.map(r => ({ ...r, matchCount: Number(r.matchCount) }))
})

/** Réexporté pour que les handlers d'écriture partagent la normalisation du moteur. */
export { normalizeForMatch }
