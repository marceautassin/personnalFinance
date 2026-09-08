/**
 * Ce qu'une ligne est devenue après réconciliation (epic 19).
 *
 * - `neutralized` : elle ne pèse plus rien dans les agrégats.
 * - `partial` : elle y pèse moins que son montant — un reliquat reste à charge.
 * - `outstanding` : elle y pèse pour son montant entier, le groupe ne la couvre pas encore.
 *
 * Le type vivait en trois exemplaires — serveur, badge, liste mensuelle — dont un littéral
 * inline. Trois copies d'une énumération finissent par diverger d'un membre (revue du
 * 2026-09-08).
 */
export type SettlementStatus = 'neutralized' | 'partial' | 'outstanding'
