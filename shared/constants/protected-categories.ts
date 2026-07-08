/**
 * Catégories système non supprimables (Story 5.6).
 *
 * `divers` est le fallback de `accept_gap` (Story 3.1) et du `llm-categorizer` (Story 2.4)
 * quand le LLM renvoie une catégorie hors-liste. La supprimer casserait ces flows. Le rename
 * (PATCH label) reste autorisé — c'est le `code` qui est protégé, pas le libellé.
 */
export const PROTECTED_CATEGORY_CODES: ReadonlySet<string> = new Set(['divers'])

export function isProtectedCategory(code: string): boolean {
  return PROTECTED_CATEGORY_CODES.has(code)
}
