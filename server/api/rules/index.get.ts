import { defineEventHandler } from 'h3'
import { asc, eq } from 'drizzle-orm'
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
    })
    .from(classificationRules)
    .innerJoin(categoryItems, eq(categoryItems.code, classificationRules.categoryItemCode))
    .innerJoin(categoryGroups, eq(categoryGroups.code, categoryItems.groupCode))
    .orderBy(asc(classificationRules.id))

  // Le comptage se fait EN MÉMOIRE, avec la comparaison du moteur : un `LIKE` SQL manquait
  // les libellés accentués, le motif étant stocké sans accents (revue du 2026-09-06). Les
  // libellés ne sont normalisés qu'une fois, puis confrontés à chaque motif.
  const haystacks = db.select({ label: transactions.label }).from(transactions).all()
    .map(t => normalizeForMatch(t.label))

  return rows.map(r => ({
    ...r,
    matchCount: haystacks.reduce(
      (n, h) => n + (h.includes(normalizeForMatch(r.pattern)) ? 1 : 0),
      0,
    ),
  }))
})

/** Réexporté pour que les handlers d'écriture partagent la normalisation du moteur. */
export { normalizeForMatch }
