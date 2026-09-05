/**
 * Référentiel initial — 13 rubriques / 48 postes (D17, AR3).
 *
 * Dérivé du tableur `Dépenses 2022.xlsx` que l'utilisateur tenait à la main, lu le
 * 2026-09-04 : c'est sa propre taxonomie, dépersonnalisée (marques et prénoms retirés,
 * ils vieillissent mal) et regroupée de 15 à 13 rubriques.
 *
 * Deux propriétés de ce référentiel ne sont pas décoratives :
 *
 *  1. `Restaurant` existe sous `alimentation` ET sous `voyages`, avec des codes distincts.
 *     C'est le cas qu'une liste plate ne sait pas représenter, et la raison d'être de la
 *     hiérarchie à deux niveaux.
 *  2. La rubrique `internes` porte la nature `internal_transfer`. Sans elle, la troisième
 *     nature n'aurait aucune destination. Dans le tableur d'origine, « Virement intercompte »
 *     était rangé en Produits — il gonflait les recettes et masquait les mois déficitaires.
 *
 * NFR22 : ces constantes sont consommées au seed, jamais depuis une fonction de calcul.
 */
import type { MovementNature } from '../types/movement-nature'

export interface DefaultCategoryItem {
  /** Code complet `<rubrique>-<poste>` (cf. AR4). */
  readonly code: string
  readonly label: string
  readonly nature: MovementNature
}

export interface DefaultCategoryGroup {
  readonly code: string
  readonly label: string
  readonly items: ReadonlyArray<DefaultCategoryItem>
}

/**
 * Poste de repli, protégé et non supprimable.
 *
 * Il n'est pas un confort : sondé le 2026-09-04, GLM-5.2 a INVENTÉ un code absent de la
 * taxonomie (`AUTRES_DEPENSES`) face à trois libellés sans poste correspondant, dans un JSON
 * pourtant conforme au schéma. Sans repli explicite nommé dans le prompt, le modèle en
 * fabrique un. Sert aussi de destination à `accept_gap` en réconciliation.
 */
export const FALLBACK_ITEM_CODE = 'divers-non-categorise'

export const DEFAULT_REFERENTIAL: ReadonlyArray<DefaultCategoryGroup> = [
  {
    code: 'revenus',
    label: 'Revenus',
    items: [
      { code: 'revenus-salaire', label: 'Salaire', nature: 'income' },
      { code: 'revenus-primes', label: 'Primes', nature: 'income' },
      { code: 'revenus-remboursement-frais', label: 'Remboursement de frais', nature: 'income' },
      { code: 'revenus-dividendes', label: 'Dividendes', nature: 'income' },
    ],
  },
  {
    code: 'remboursements',
    label: 'Remboursements',
    items: [
      { code: 'remboursements-securite-sociale', label: 'Sécurité sociale', nature: 'income' },
      { code: 'remboursements-mutuelle', label: 'Mutuelle', nature: 'income' },
      { code: 'remboursements-divers', label: 'Remboursements divers', nature: 'income' },
    ],
  },
  {
    code: 'internes',
    label: 'Mouvements internes',
    items: [
      { code: 'internes-virement-epargne', label: 'Virement épargne', nature: 'internal_transfer' },
      { code: 'internes-virement-comptes', label: 'Virement entre comptes', nature: 'internal_transfer' },
      { code: 'internes-retrait-especes', label: 'Retrait d\'espèces', nature: 'internal_transfer' },
      // Remboursement de compte courant d'associé : de l'argent prêté à sa propre société qui
      // revient. Ce n'est pas un gain — le compter en recette gonflerait le taux d'épargne
      // d'un mois où rien n'a été gagné. Juridiquement la SASU est un tiers ; économiquement
      // c'est du capital qui rentre, d'où le classement en mouvement interne.
      { code: 'internes-remboursement-cca', label: 'Remboursement CCA', nature: 'internal_transfer' },
    ],
  },
  {
    code: 'logement',
    label: 'Logement',
    items: [
      { code: 'logement-loyer', label: 'Loyer ou emprunt', nature: 'expense' },
      { code: 'logement-charges', label: 'Charges et copropriété', nature: 'expense' },
      { code: 'logement-electricite', label: 'Électricité', nature: 'expense' },
      { code: 'logement-menage', label: 'Ménage', nature: 'expense' },
      { code: 'logement-travaux', label: 'Travaux et équipement', nature: 'expense' },
    ],
  },
  {
    code: 'alimentation',
    label: 'Alimentation',
    items: [
      { code: 'alimentation-courses', label: 'Courses', nature: 'expense' },
      { code: 'alimentation-restaurant', label: 'Restaurant', nature: 'expense' },
      { code: 'alimentation-fast-food', label: 'Fast food', nature: 'expense' },
    ],
  },
  {
    code: 'divers',
    label: 'Divers',
    items: [
      { code: 'divers-cadeaux', label: 'Cadeaux', nature: 'expense' },
      { code: 'divers-soirees', label: 'Soirées', nature: 'expense' },
      { code: FALLBACK_ITEM_CODE, label: 'Non catégorisé', nature: 'expense' },
    ],
  },
  {
    code: 'enfants',
    label: 'Enfants',
    items: [
      { code: 'enfants-creche-garde', label: 'Crèche et garde', nature: 'expense' },
      { code: 'enfants-ecole-cantine', label: 'École et cantine', nature: 'expense' },
      { code: 'enfants-activites', label: 'Activités et vacances', nature: 'expense' },
      { code: 'enfants-equipement', label: 'Équipement enfant', nature: 'expense' },
    ],
  },
  {
    code: 'transport',
    label: 'Transport',
    items: [
      { code: 'transport-carburant', label: 'Carburant', nature: 'expense' },
      { code: 'transport-entretien-assurance', label: 'Entretien et assurance', nature: 'expense' },
      { code: 'transport-peage-parking', label: 'Péage et parking', nature: 'expense' },
      { code: 'transport-transports-commun', label: 'Transports en commun', nature: 'expense' },
    ],
  },
  {
    code: 'sante',
    label: 'Santé',
    items: [
      { code: 'sante-medecin', label: 'Médecin', nature: 'expense' },
      { code: 'sante-pharmacie', label: 'Pharmacie', nature: 'expense' },
      { code: 'sante-specialistes', label: 'Spécialistes', nature: 'expense' },
      { code: 'sante-assurance', label: 'Assurance santé', nature: 'expense' },
    ],
  },
  {
    code: 'abonnements',
    label: 'Abonnements et prélèvements',
    items: [
      { code: 'abonnements-telephonie-internet', label: 'Téléphonie et internet', nature: 'expense' },
      { code: 'abonnements-streaming', label: 'Streaming', nature: 'expense' },
      { code: 'abonnements-presse', label: 'Presse', nature: 'expense' },
      { code: 'abonnements-frais-bancaires', label: 'Frais bancaires', nature: 'expense' },
      { code: 'abonnements-dons', label: 'Dons', nature: 'expense' },
    ],
  },
  {
    code: 'style',
    label: 'Style',
    items: [
      { code: 'style-habillement', label: 'Habillement', nature: 'expense' },
      { code: 'style-coiffeur', label: 'Coiffeur et barbier', nature: 'expense' },
      { code: 'style-pressing', label: 'Pressing', nature: 'expense' },
    ],
  },
  {
    code: 'loisirs',
    label: 'Culture et loisirs',
    items: [
      { code: 'loisirs-livres', label: 'Livres', nature: 'expense' },
      { code: 'loisirs-cinema-spectacles', label: 'Cinéma et spectacles', nature: 'expense' },
      { code: 'loisirs-sport', label: 'Sport', nature: 'expense' },
    ],
  },
  {
    code: 'voyages',
    label: 'Voyages',
    items: [
      { code: 'voyages-transport', label: 'Transport longue distance', nature: 'expense' },
      { code: 'voyages-hebergement', label: 'Hébergement', nature: 'expense' },
      { code: 'voyages-restaurant', label: 'Restaurant', nature: 'expense' },
      { code: 'voyages-depenses-sur-place', label: 'Dépenses sur place', nature: 'expense' },
    ],
  },
] as const
