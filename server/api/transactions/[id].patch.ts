import { defineEventHandler, getRouterParam } from 'h3'
import { eq } from 'drizzle-orm'
import { db } from '~~/server/db/client'
import { transactions, classificationRules, categoryItems } from '~~/server/db/schema'
import { validateBody } from '~~/server/utils/validation'
import { resolveItemId } from '~~/server/utils/category-fk'
import { requireProfile } from '~~/server/utils/current-profile'
import { domainError, notFound } from '~~/server/utils/errors'
import { ApiErrorCode } from '~~/shared/schemas/api-errors'
import { TransactionPatchSchema } from '~~/shared/schemas/transaction.schema'
import { extractMerchant, resolveRule } from '~~/server/services/rule-matcher'

export default defineEventHandler(async (event) => {
  const idParam = getRouterParam(event, 'id')
  const id = Number(idParam)
  if (!Number.isFinite(id) || id <= 0 || !Number.isInteger(id)) {
    throw domainError(ApiErrorCode.ValidationFailed, { reason: 'invalid id', value: idParam }, 422)
  }

  const patch = await validateBody(event, TransactionPatchSchema)
  const profileId = requireProfile(event)

  const existing = await db
    .select()
    .from(transactions)
    .where(eq(transactions.id, id))
    .limit(1)
  if (existing.length === 0) {
    throw notFound(ApiErrorCode.NotFound, { resource: 'transaction', id })
  }

  const update: Partial<typeof transactions.$inferInsert> = {}
  // `isManual` signifie « catégorie saisie ou CORRIGÉE à la main ». Rattacher une transaction à
  // une dette n'est pas une correction de catégorisation : le flag n'est plus posé que lorsque
  // le patch touche effectivement la catégorie (story 6.8, revue du 2026-09-04).
  if (patch.categoryItemCode !== undefined) {
    update.categoryItemId = await resolveItemId(profileId, patch.categoryItemCode)
    update.isManual = true
  }

  await db.update(transactions).set(update).where(eq(transactions.id, id))

  const [updated] = await db
    .select({
      id: transactions.id,
      statementHash: transactions.statementHash,
      transactionDate: transactions.transactionDate,
      label: transactions.label,
      amountCents: transactions.amountCents,
      categoryItemCode: categoryItems.code,
      isManual: transactions.isManual,
    })
    .from(transactions)
    .innerJoin(categoryItems, eq(categoryItems.id, transactions.categoryItemId))
    .where(eq(transactions.id, id))

  return { ...updated, ruleSuggestion: suggestRule(updated, patch.categoryItemCode !== undefined) }
})

/**
 * Motif de règle proposé après une correction manuelle.
 *
 * Une correction porte une connaissance que le modèle n'a pas — que `CDISCOUNT` est un achat
 * divers, que `HELLOASSO*` est du périscolaire. Sans mémoire, l'utilisateur la ressaisit à
 * chaque relevé : sur 20 mois, `CDISCOUNT` revient 18 fois.
 *
 * On PROPOSE, on ne crée pas. Toutes les corrections ne se généralisent pas : déplacer un
 * restaurant vers la rubrique Voyages vaut pour ce séjour-là, pas pour le bistrot du coin.
 * Décider à la place de l'utilisateur produirait des règles qu'il n'a pas voulues et qu'il
 * découvrirait des mois plus tard, en cherchant pourquoi ses chiffres ont bougé.
 *
 * Rien n'est proposé si une règle couvre déjà ce libellé : elle vient d'être contredite par
 * une correction, et la remplacer silencieusement serait pire que de ne rien faire.
 */
function suggestRule(
  updated: { label: string, categoryItemCode: string } | undefined,
  categoryChanged: boolean,
): { pattern: string, categoryItemCode: string } | null {
  if (!updated || !categoryChanged) return null

  const pattern = extractMerchant(updated.label)
  if (!pattern) return null

  // Une règle couvre déjà ce libellé : elle vient d'être contredite par la correction.
  // Proposer d'en ajouter une seconde créerait deux règles concurrentes sur la même ligne,
  // et la plus longue gagnerait sans que personne comprenne pourquoi.
  const rules = db
    .select({ pattern: classificationRules.pattern, categoryItemCode: categoryItems.code })
    .from(classificationRules)
    .innerJoin(categoryItems, eq(categoryItems.id, classificationRules.categoryItemId))
    .all()
  if (resolveRule(updated.label, rules)) return null

  return { pattern, categoryItemCode: updated.categoryItemCode }
}
