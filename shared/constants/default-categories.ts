/**
 * Catégories par défaut seedées au premier démarrage (FR16, Story 1.5).
 * is_variable = true → catégorie projetée par moyenne mobile (variable_projection).
 * is_variable = false → catégorie déclarée explicitement comme fixed_charge si récurrente.
 *
 * Cette liste est volontairement courte et figée V1. L'utilisateur ajoute des catégories
 * personnalisées via l'UI (Story 5.x). Si tu hésites entre variable et fixe : variable
 * par défaut (l'utilisateur peut toujours déclarer une charge fixe explicite par-dessus).
 */
export interface DefaultCategory {
  readonly code: string
  readonly label: string
  readonly isVariable: boolean
}

export const DEFAULT_CATEGORIES: ReadonlyArray<DefaultCategory> = [
  // Variables — projetées par moyenne mobile
  { code: 'courses', label: 'Courses', isVariable: true },
  { code: 'restaurants', label: 'Restaurants', isVariable: true },
  { code: 'transports', label: 'Transports', isVariable: true },
  { code: 'sante', label: 'Santé', isVariable: true },
  { code: 'loisirs', label: 'Loisirs', isVariable: true },
  { code: 'shopping', label: 'Shopping', isVariable: true },
  { code: 'voyages', label: 'Voyages', isVariable: true },
  { code: 'enfants', label: 'Enfants', isVariable: true },

  // Fixes — typiquement déclarées comme fixed_charges
  { code: 'logement', label: 'Logement', isVariable: false },
  { code: 'abonnements', label: 'Abonnements', isVariable: false },
  { code: 'assurances', label: 'Assurances', isVariable: false },
  { code: 'energies', label: 'Énergie & fluides', isVariable: false },
  { code: 'telecoms', label: 'Téléphone & Internet', isVariable: false },
  { code: 'impots', label: 'Impôts & taxes', isVariable: false },

  // Spéciales (revenus & techniques)
  { code: 'are', label: 'ARE (chômage)', isVariable: false },
  { code: 'loyer_sas', label: 'Loyer SAS', isVariable: false },
  { code: 'defraiements', label: 'Défraiements', isVariable: false },
  { code: 'remboursement_dette', label: 'Remboursement de dette', isVariable: false },
  { code: 'divers', label: 'Divers / Inconnu', isVariable: true },
] as const
