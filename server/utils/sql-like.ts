/**
 * Échappement des jokers `LIKE` (story 17.8).
 *
 * Les motifs de règles sont saisis par l'utilisateur et interpolés dans un `LIKE`. Sans
 * échappement, `%` et `_` y gardent leur sens de joker : un motif `a_b` compte `aXb` comme une
 * correspondance. Aucun risque d'injection — les valeurs sont paramétrées — mais le compteur de
 * portée d'une règle ment, et c'est sur lui que l'utilisateur décide de créer la règle.
 *
 * Le caractère d'échappement est déclaré côté requête par `ESCAPE '\'`.
 */
export const LIKE_ESCAPE_CHAR = '\\'

export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, m => `${LIKE_ESCAPE_CHAR}${m}`)
}

/** Motif « contient », jokers de l'utilisateur neutralisés. */
export function likeContains(value: string): string {
  return `%${escapeLike(value)}%`
}
