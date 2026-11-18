/**
 * ProfileId — identifiant du profil PROPRIÉTAIRE de chaque donnée (D37, D38, story 27.2).
 *
 * Branded type sur `number`, même logique que `Cents` (`shared/types/money.ts`) : empêcher
 * au compile-time qu'un entier quelconque (un id de transaction, une position…) se glisse là
 * où un identifiant de profil est attendu. `requireProfile()` est la SEULE frontière qui en
 * produit un — c'est le point unique par lequel le cloisonnement entre profils passe (AR35).
 */
export type ProfileId = number & { readonly __brand: 'ProfileId' }

/** Construit un ProfileId à partir d'un entier positif déjà vérifié en base. */
export function profileId(id: number): ProfileId {
  return id as ProfileId
}
