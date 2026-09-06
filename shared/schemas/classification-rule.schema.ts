import { z } from 'zod'
import { CategoryCodeSchema } from './category.schema'

/**
 * Motif de règle : une sous-chaîne cherchée dans le libellé bancaire.
 *
 * Volontairement PAS une expression régulière. Dans un outil personnel, une regex est un
 * piège : elle échoue silencieusement, se déboguer mal, et le gain est nul sur des libellés
 * bancaires qui sont des chaînes fixes (`VIR INST SOCIETEX`, `HELLO ASSO`, `CARREFOUR MARKET`).
 *
 * Deux caractères minimum : un motif d'un seul caractère attraperait la moitié du relevé.
 */
export const RulePatternSchema = z.string().trim().min(2).max(120)

export const ClassificationRuleSchema = z.object({
  id: z.number().int().positive(),
  pattern: RulePatternSchema,
  categoryItemCode: CategoryCodeSchema,
  createdAt: z.number().int(),
})

/** Règle enrichie de quoi l'afficher sans second appel. */
export const ClassificationRuleWithLabelsSchema = ClassificationRuleSchema.extend({
  itemLabel: z.string(),
  groupLabel: z.string(),
  /** Transactions déjà en base que cette règle couvre — pour juger de sa portée. */
  matchCount: z.number().int().min(0),
  /**
   * Parmi les lignes couvertes, celles qu'une application déplacerait encore (story 18.9).
   *
   * `0` avec `matchCount > 0` signifie « historique à jour ». Calculé à chaque lecture : un
   * drapeau stocké divergerait de la réalité dès l'ingestion suivante. Optionnel dans le
   * schéma parce que la réponse de création (`POST`) ne le porte pas — une règle qui vient de
   * naître n'a par définition rien appliqué.
   */
  pendingCount: z.number().int().min(0).optional(),
})

export const NewClassificationRuleInputSchema = z
  .object({
    pattern: RulePatternSchema,
    categoryItemCode: CategoryCodeSchema,
  })
  .strict()

export const ClassificationRulePatchSchema = z
  .object({ categoryItemCode: CategoryCodeSchema })
  .strict()

export type ClassificationRule = z.infer<typeof ClassificationRuleSchema>
export type ClassificationRuleWithLabels = z.infer<typeof ClassificationRuleWithLabelsSchema>
export type NewClassificationRuleInput = z.infer<typeof NewClassificationRuleInputSchema>
export type ClassificationRulePatch = z.infer<typeof ClassificationRulePatchSchema>
