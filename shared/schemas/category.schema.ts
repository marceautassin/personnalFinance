import { z } from 'zod'

/** Code catégorie : identifiant stable kebab-case ASCII (immuable après création). */
export const CategoryCodeSchema = z
  .string()
  .regex(/^[a-z0-9-]+$/, 'kebab-case lowercase ASCII')
  .min(1)
  .max(32)

/** Libellé d'affichage catégorie (modifiable via rename). */
export const CategoryLabelSchema = z.string().trim().min(1).max(50)

/** Catégorie en lecture (référentiel). */
export const CategorySchema = z.object({
  code: CategoryCodeSchema,
  label: CategoryLabelSchema,
  isVariable: z.boolean(),
})

/** Catégorie en lecture étendue avec compteur de références (transactions/charges/overrides). */
export const CategoryWithCountSchema = CategorySchema.extend({
  referenceCount: z.number().int().min(0),
})

/**
 * Entrée de création : `label` + `isVariable`. Le `code` est généré côté serveur par
 * slugification (identifiant stable, non fourni par le client). `.strict()` rejette `code`.
 * Le `.refine` rejette un libellé qui slugifie en code vide (ex: `'!!!'`) → 422 canonique
 * (forme `flatten()`) via `validateBody`, plutôt qu'une erreur construite à la main côté endpoint.
 */
export const NewCategoryInputSchema = z
  .object({
    label: CategoryLabelSchema,
    isVariable: z.boolean(),
  })
  .strict()
  .refine(data => slugifyCategoryLabel(data.label).length > 0, {
    message: 'Le libellé ne produit aucun code valide (caractères alphanumériques requis).',
    path: ['label'],
  })

/**
 * Patch : `label` uniquement. `code` et `isVariable` sont immuables (FK + sémantique de
 * projection). `.strict()` rejette toute autre clé → 422.
 */
export const CategoryPatchSchema = z
  .object({ label: CategoryLabelSchema })
  .strict()

export type Category = z.infer<typeof CategorySchema>
export type CategoryWithCount = z.infer<typeof CategoryWithCountSchema>
export type NewCategoryInput = z.infer<typeof NewCategoryInputSchema>
export type CategoryPatch = z.infer<typeof CategoryPatchSchema>

/**
 * Slugifie un libellé en `code` kebab-case ASCII (sans suffixe de collision) :
 *  1. NFD normalize + strip diacritiques  2. lowercase  3. `[^a-z0-9]+` → `-`
 *  4. trim des `-` en tête/queue  5. tronque à 32 chars.
 * Retourne `''` si rien d'exploitable ne subsiste (ex: `'!!!'`) → l'appelant rejette en 422.
 */
export function slugifyCategoryLabel(label: string): string {
  return label
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
    .replace(/-+$/g, '')
}
