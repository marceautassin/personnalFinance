import { defineEventHandler, setResponseStatus } from 'h3'
import { eq, sql } from 'drizzle-orm'
import { db } from '~~/server/db/client'
import { likeContains, LIKE_ESCAPE_CHAR } from '~~/server/utils/sql-like'
import { classificationRules, categoryItems, categoryGroups, transactions } from '~~/server/db/schema'
import { validateBody } from '~~/server/utils/validation'
import { assertCategoryItemExists } from '~~/server/utils/category-fk'
import { domainError } from '~~/server/utils/errors'
import { ApiErrorCode } from '~~/shared/schemas/api-errors'
import { normalizeForMatch } from '~~/server/services/rule-matcher'
import {
  NewClassificationRuleInputSchema,
  type ClassificationRuleWithLabels,
} from '~~/shared/schemas/classification-rule.schema'

/**
 * Crée une règle de classement.
 *
 * Le motif est stocké SOUS SA FORME NORMALISÉE — minuscules, sans accents — celle-là même que
 * le moteur compare. Stocker la saisie brute laisserait croire que la casse compte, et
 * autoriserait deux règles « Carrefour » et « CARREFOUR » qui feraient exactement la même
 * chose tout en passant la contrainte d'unicité.
 */
export default defineEventHandler(async (event): Promise<ClassificationRuleWithLabels> => {
  const body = await validateBody(event, NewClassificationRuleInputSchema)
  await assertCategoryItemExists(body.categoryItemCode)

  const pattern = normalizeForMatch(body.pattern)
  if (pattern.length < 2) {
    throw domainError(
      ApiErrorCode.ValidationFailed,
      { reason: 'pattern too short once normalized', value: body.pattern },
      422,
    )
  }

  const existing = db
    .select({ id: classificationRules.id })
    .from(classificationRules)
    .where(eq(classificationRules.pattern, pattern))
    .get()
  if (existing) {
    throw domainError(ApiErrorCode.RuleAlreadyExists, { pattern, existingId: existing.id }, 409)
  }

  const inserted = db
    .insert(classificationRules)
    .values({ pattern, categoryItemCode: body.categoryItemCode })
    .returning()
    .get()

  const item = db
    .select({ itemLabel: categoryItems.label, groupLabel: categoryGroups.label })
    .from(categoryItems)
    .innerJoin(categoryGroups, eq(categoryGroups.code, categoryItems.groupCode))
    .where(eq(categoryItems.code, body.categoryItemCode))
    .get()

  // Le VRAI nombre de lignes couvertes, jamais zéro en dur : c'est le seul garde-fou contre
  // une règle trop large, et une valeur fausse serait pire que pas de valeur. Une règle
  // « DUPONT Jean » — évidente en apparence — couvrait 106 lignes dont 7 604 € de
  // remboursement d'emprunt qu'elle aurait sortis des dépenses (constaté le 2026-09-05).
  setResponseStatus(event, 201)
  return {
    ...inserted,
    itemLabel: item?.itemLabel ?? body.categoryItemCode,
    groupLabel: item?.groupLabel ?? '',
    matchCount: countMatching(pattern),
  }
})

/** Transactions déjà en base dont le libellé contient le motif, à la casse près. */
function countMatching(pattern: string): number {
  const row = db
    .select({ cnt: sql<number>`count(*)` })
    .from(transactions)
    .where(sql`LOWER(${transactions.label}) LIKE ${likeContains(pattern)} ESCAPE ${LIKE_ESCAPE_CHAR}`)
    .get()
  return Number(row?.cnt ?? 0)
}
