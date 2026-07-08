/**
 * Modes de remboursement d'une dette (FR29-FR30).
 *
 *  - `free`     : remboursement libre — hors forecast (aucune échéance planifiée).
 *  - `monthly`  : mensualité fixe — projetée comme charge mensuelle récurrente (story 6.4 / Epic 7).
 *  - `lump_sum` : montant unique à date donnée — dépense ponctuelle planifiée.
 *
 * Codes en anglais (identifiants stables). Les libellés FR vivent côté UI (story 6.2),
 * PAS dans ce type.
 */
export const REPAYMENT_MODES = ['free', 'monthly', 'lump_sum'] as const
export type RepaymentMode = typeof REPAYMENT_MODES[number]
