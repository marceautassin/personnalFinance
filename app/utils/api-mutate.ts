/**
 * Mutation `$fetch` neutre sur la route mais typée en réponse (`TRes`).
 *
 * Depuis l'ajout de routes dynamiques (`/api/categories/:code`, `/api/fixed-charges/:id`),
 * le `$fetch` typé de Nuxt fait exploser la profondeur d'inférence TS (scoring de route) sur
 * les appels de mutation. On érode uniquement le littéral de route (typé `string`) tout en
 * conservant un type de retour explicite. Point de contournement unique — ne pas dupliquer
 * le `as unknown` dans les composables.
 */
export function apiMutate<TRes = unknown>(
  url: string,
  opts?: { method: string, body?: unknown },
): Promise<TRes> {
  return ($fetch as unknown as (u: string, o?: Record<string, unknown>) => Promise<TRes>)(url, opts)
}
