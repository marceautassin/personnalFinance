/**
 * Postes système non supprimables.
 *
 * `divers-non-categorise` est le repli de `accept_gap` (réconciliation) et du
 * `llm-categorizer` quand le modèle renvoie un code hors référentiel. Le supprimer casserait
 * ces deux chemins. Le rename reste autorisé — c'est le `code` qui est protégé, pas le libellé.
 *
 * Sa nécessité n'est pas théorique : sondé le 2026-09-04, GLM-5.2 a inventé un code absent de
 * la taxonomie face à des libellés sans poste correspondant. Sans repli nommé, le modèle en
 * fabrique un.
 */
import { FALLBACK_ITEM_CODE } from './default-referential'

export const PROTECTED_ITEM_CODES: ReadonlySet<string> = new Set([FALLBACK_ITEM_CODE])

export function isProtectedItem(code: string): boolean {
  return PROTECTED_ITEM_CODES.has(code)
}

/**
 * Rubriques système non supprimables. `divers` héberge le poste de repli ; `internes` est la
 * seule destination de la nature `internal_transfer` et sa disparition rendrait FR22
 * inapplicable.
 */
export const PROTECTED_GROUP_CODES: ReadonlySet<string> = new Set(['divers', 'internes'])

export function isProtectedGroup(code: string): boolean {
  return PROTECTED_GROUP_CODES.has(code)
}
