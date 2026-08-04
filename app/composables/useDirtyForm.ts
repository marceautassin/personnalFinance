/**
 * Suivi « formulaire modifié depuis la dernière synchro » pour les panneaux de modèles
 * financiers (revenus, SAS, fiscalité).
 *
 * Pourquoi (revue 2026-08-04) : ces panneaux resynchronisent leurs champs depuis les props
 * à chaque changement de la valeur persistée. Or toute mutation — y compris celle d'un
 * AUTRE panneau de la même page — déclenche un `refresh()` du singleton partagé. Sans
 * garde, la resynchro réécrit les champs et fait perdre la saisie en cours, sans le moindre
 * signal à l'utilisateur.
 *
 * Règle : une resynchro est ignorée tant que l'utilisateur a modifié le formulaire sans
 * l'avoir enregistré. Le drapeau retombe à l'enregistrement (`markPristine`), moment où les
 * props reflètent justement ce que l'utilisateur vient de saisir.
 */
export function useDirtyForm() {
  const dirty = ref(false)

  /** À brancher sur `@input` du formulaire : l'utilisateur a pris la main. */
  function markDirty() {
    dirty.value = true
  }

  /** À appeler après un enregistrement : les props redeviennent la source de vérité. */
  function markPristine() {
    dirty.value = false
  }

  /** Exécute `sync` seulement si l'utilisateur n'a pas de saisie en cours. */
  function syncIfPristine(sync: () => void) {
    if (!dirty.value) sync()
  }

  return { dirty, markDirty, markPristine, syncIfPristine }
}
