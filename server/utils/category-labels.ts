import { db } from '~~/server/db/client'
import { categoryDefinitions } from '~~/server/db/schema'
import { domainError } from '~~/server/utils/errors'
import { ApiErrorCode } from '~~/shared/schemas/api-errors'
import { normalizeCategoryLabel } from '~~/shared/schemas/category.schema'

/**
 * Règle d'unicité du libellé de catégorie, partagée par POST et PATCH.
 *
 * Vivait dans `categories/index.post.ts`, que `[code].patch.ts` importait — une route Nitro
 * important une autre route (revue 2026-09-04). Même motif que `category-references.ts` :
 * une règle consommée par plusieurs handlers n'appartient à aucun d'eux.
 *
 * Deux catégories homonymes rendaient la taxonomie envoyée au LLM ambiguë — deux libellés
 * identiques pour deux codes — et l'UI illisible (décision de revue 2026-09-03).
 *
 * ⚠️ Invariant applicatif uniquement : il n'existe pas d'index UNIQUE sur une forme
 * normalisée du libellé. Les doublons créés AVANT cette règle restent en base et ne sont
 * pas détectés ; seules les écritures postérieures sont garanties.
 *
 * `excludeCode` permet au rename de s'ignorer lui-même (renommer vers son propre libellé,
 * ou n'en changer que la casse, doit rester idempotent).
 */
export function assertLabelAvailable(label: string, excludeCode?: string): void {
  const normalized = normalizeCategoryLabel(label)
  const clash = db
    .select({ code: categoryDefinitions.code, label: categoryDefinitions.label })
    .from(categoryDefinitions)
    .all()
    .find(r => r.code !== excludeCode && normalizeCategoryLabel(r.label) === normalized)
  if (clash) {
    throw domainError(ApiErrorCode.CategoryLabelTaken, { label, existingCode: clash.code }, 409)
  }
}
