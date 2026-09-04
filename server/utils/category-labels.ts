import { eq } from 'drizzle-orm'
import { db } from '~~/server/db/client'
import { categoryGroups, categoryItems } from '~~/server/db/schema'
import { domainError } from '~~/server/utils/errors'
import { ApiErrorCode } from '~~/shared/schemas/api-errors'
import { normalizeCategoryLabel } from '~~/shared/schemas/category.schema'

/**
 * Règle d'unicité des libellés, partagée par les handlers POST et PATCH.
 *
 * Vivait dans `categories/index.post.ts`, que `[code].patch.ts` importait — une route Nitro
 * important une autre route (revue 2026-09-04). Une règle consommée par plusieurs handlers
 * n'appartient à aucun d'eux.
 *
 * ⚠️ Invariant applicatif uniquement : il n'existe pas d'index UNIQUE sur une forme
 * normalisée du libellé. Seules les écritures postérieures à cette règle sont garanties.
 *
 * `excludeCode` permet au rename de s'ignorer lui-même (renommer vers son propre libellé,
 * ou n'en changer que la casse, reste idempotent).
 */

/** Unicité d'un libellé de rubrique, sur tout le référentiel. */
export function assertGroupLabelAvailable(label: string, excludeCode?: string): void {
  const normalized = normalizeCategoryLabel(label)
  const clash = db
    .select({ code: categoryGroups.code, label: categoryGroups.label })
    .from(categoryGroups)
    .all()
    .find(r => r.code !== excludeCode && normalizeCategoryLabel(r.label) === normalized)
  if (clash) {
    throw domainError(ApiErrorCode.CategoryLabelTaken, { label, existingCode: clash.code }, 409)
  }
}

/**
 * Unicité d'un libellé de poste, **à l'intérieur de sa rubrique seulement**.
 *
 * C'est la contrepartie directe de FR19 : « Restaurant » doit pouvoir exister sous
 * Alimentation ET sous Voyages. Une unicité globale, comme celle du référentiel plat,
 * interdirait précisément le cas qui justifie la hiérarchie.
 */
export function assertItemLabelAvailable(groupCode: string, label: string, excludeCode?: string): void {
  const normalized = normalizeCategoryLabel(label)
  const clash = db
    .select({ code: categoryItems.code, label: categoryItems.label })
    .from(categoryItems)
    .where(eq(categoryItems.groupCode, groupCode))
    .all()
    .find(r => r.code !== excludeCode && normalizeCategoryLabel(r.label) === normalized)
  if (clash) {
    throw domainError(ApiErrorCode.CategoryLabelTaken, { label, groupCode, existingCode: clash.code }, 409)
  }
}
