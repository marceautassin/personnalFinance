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

/** Longueur maximale d'un `code`, alignée sur `CategoryCodeSchema.max(32)`. */
export const CATEGORY_CODE_MAX_LENGTH = 32

/**
 * Latins non décomposables par NFD : sans translittération explicite, `Œ` et consorts sont
 * traités comme des séparateurs et la lettre disparaît silencieusement (`'Œufs'` → `'ufs'`,
 * `'Ø'` → `''` avec un message d'erreur trompeur). Découvert à la revue 2026-08-04.
 */
const NON_DECOMPOSABLE_LATIN: Record<string, string> = {
  œ: 'oe', æ: 'ae', ø: 'o', ß: 'ss', ł: 'l', đ: 'd', ð: 'd', þ: 'th', ħ: 'h', ŋ: 'ng',
}

/** Translittère les latins non décomposables, caractère par caractère. */
function transliterateLatin(input: string): string {
  return Array.from(input, ch => NON_DECOMPOSABLE_LATIN[ch] ?? ch).join('')
}

/**
 * Slugifie un libellé en `code` kebab-case ASCII (sans suffixe de collision) :
 *  1. lowercase  2. translittération des latins non décomposables  3. NFD + strip diacritiques
 *  4. `[^a-z0-9]+` → `-`  5. trim des `-`  6. tronque à `maxLength`.
 *
 * `maxLength` est paramétrable pour laisser la place au suffixe de collision : tronquer à 32
 * PUIS concaténer `-2` produisait un code de 34 caractères, en violation de
 * `CategoryCodeSchema.max(32)` (revue 2026-08-04).
 *
 * Retourne `''` si rien d'exploitable ne subsiste (ex: `'!!!'`) → l'appelant rejette en 422.
 */
export function slugifyCategoryLabel(label: string, maxLength = CATEGORY_CODE_MAX_LENGTH): string {
  return transliterateLatin(label.toLowerCase())
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength)
    .replace(/-+$/g, '')
}

/**
 * Forme canonique d'un libellé pour la détection de doublon : insensible à la casse, aux
 * accents et aux espaces multiples (revue 2026-08-04 — deux catégories au libellé identique
 * rendaient la taxonomie envoyée au LLM ambiguë et l'UI illisible).
 */
export function normalizeCategoryLabel(label: string): string {
  return transliterateLatin(label.trim().toLowerCase())
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/gu, ' ')
}
