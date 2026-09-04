import { z } from 'zod'
import { MOVEMENT_NATURES } from '../types/movement-nature'

/** Code : identifiant stable kebab-case ASCII (immuable après création). */
export const CategoryCodeSchema = z
  .string()
  .regex(/^[a-z0-9-]+$/, 'kebab-case lowercase ASCII')
  .min(1)
  .max(32)

/** Libellé d'affichage (modifiable via rename). */
export const CategoryLabelSchema = z.string().trim().min(1).max(50)

/** Nature d'un poste — portée par le poste et par lui seul (D17). */
export const MovementNatureSchema = z.enum(MOVEMENT_NATURES)

/** Rubrique — niveau 1 du référentiel. */
export const CategoryGroupSchema = z.object({
  code: CategoryCodeSchema,
  label: CategoryLabelSchema,
  position: z.number().int().min(0),
})

/** Poste — niveau 2. `groupCode` est immuable : il compose le `code` (AR4). */
export const CategoryItemSchema = z.object({
  code: CategoryCodeSchema,
  groupCode: CategoryCodeSchema,
  label: CategoryLabelSchema,
  nature: MovementNatureSchema,
  position: z.number().int().min(0),
})

/**
 * Poste enrichi du nombre de transactions qui le référencent. > 0 bloque la suppression
 * (FR18) — la FK `ON DELETE RESTRICT` le garantit côté base, ce compteur le rend lisible.
 */
export const CategoryItemWithCountSchema = CategoryItemSchema.extend({
  transactionCount: z.number().int().min(0),
})

/** Rubrique avec ses postes — forme du référentiel renvoyée par `GET /api/categories`. */
export const CategoryGroupWithItemsSchema = CategoryGroupSchema.extend({
  items: z.array(CategoryItemWithCountSchema),
})

/**
 * Création d'une rubrique. Le `code` est généré côté serveur par slugification.
 * `.strict()` rejette `code`.
 */
export const NewCategoryGroupInputSchema = z
  .object({ label: CategoryLabelSchema })
  .strict()
  .refine(data => slugifyCategoryLabel(data.label).length > 0, {
    message: 'Le libellé ne produit aucun code valide (caractères alphanumériques requis).',
    path: ['label'],
  })

/** Renommage d'une rubrique. Le `code` est immuable (il compose celui des postes). */
export const CategoryGroupPatchSchema = z
  .object({ label: CategoryLabelSchema })
  .strict()

/**
 * Création d'un poste sous une rubrique existante. La `nature` est OBLIGATOIRE : un poste
 * sans nature n'a pas de place dans l'arbre d'analyse (FR17).
 */
export const NewCategoryItemInputSchema = z
  .object({
    groupCode: CategoryCodeSchema,
    label: CategoryLabelSchema,
    nature: MovementNatureSchema,
  })
  .strict()
  .refine(data => slugifyCategoryLabel(data.label).length > 0, {
    message: 'Le libellé ne produit aucun code valide (caractères alphanumériques requis).',
    path: ['label'],
  })

/**
 * Patch d'un poste : libellé et/ou nature. La nature est MUTABLE — c'est ainsi que
 * l'utilisateur corrige un poste mal classé sans déplacer ses transactions une à une.
 * `groupCode` et `code` restent immuables. `.strict()` rejette le reste.
 */
export const CategoryItemPatchSchema = z
  .object({
    label: CategoryLabelSchema.optional(),
    nature: MovementNatureSchema.optional(),
  })
  .strict()
  .refine(d => d.label !== undefined || d.nature !== undefined, {
    message: 'Au moins un champ à modifier.',
  })

export type CategoryGroup = z.infer<typeof CategoryGroupSchema>
export type CategoryItem = z.infer<typeof CategoryItemSchema>
export type CategoryItemWithCount = z.infer<typeof CategoryItemWithCountSchema>
export type CategoryGroupWithItems = z.infer<typeof CategoryGroupWithItemsSchema>
export type NewCategoryGroupInput = z.infer<typeof NewCategoryGroupInputSchema>
export type CategoryGroupPatch = z.infer<typeof CategoryGroupPatchSchema>
export type NewCategoryItemInput = z.infer<typeof NewCategoryItemInputSchema>
export type CategoryItemPatch = z.infer<typeof CategoryItemPatchSchema>

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
 * Longueur maximale d'un code de RUBRIQUE.
 *
 * Une rubrique n'est pas libre d'occuper les 32 caractères : son code préfixe celui de chacun
 * de ses postes (`<rubrique>-<poste>`, AR4). Une rubrique au code de 32 caractères laissait un
 * budget de zéro et rendait toute création de poste impossible, en 422 « données invalides »
 * sans jamais dire pourquoi — et le code étant immuable, la rubrique restait stérile à vie
 * (revue du 2026-09-05).
 *
 * 16 laisse au moins 15 caractères au poste, de quoi porter un libellé lisible.
 */
export const GROUP_CODE_MAX_LENGTH = 16

/**
 * Budget de slug disponible pour un poste sous une rubrique donnée : le code complet est
 * `<rubrique>-<poste>` et reste borné à 32 caractères (AR4). Sans ce calcul, un poste créé
 * sous une rubrique au code long produisait un code tronqué par `CategoryCodeSchema` — donc
 * un 422 incompréhensible pour l'utilisateur.
 */
export function itemSlugBudget(groupCode: string): number {
  return Math.max(0, CATEGORY_CODE_MAX_LENGTH - groupCode.length - 1)
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
