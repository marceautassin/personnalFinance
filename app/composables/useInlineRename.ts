/**
 * Mécanique de renommage inline — extraite de `CategoryList.vue` le 2026-09-05, quand le
 * référentiel est passé à deux niveaux et que rubriques et postes ont eu besoin du même
 * comportement.
 *
 * Ce n'est pas une factorisation de confort. Chacune des règles ci-dessous vient d'un défaut
 * réellement constaté ; les dupliquer, c'était accepter qu'une des deux copies régresse sans
 * que rien ne le signale.
 *
 * @param items    Source réactive de la liste rendue — surveillée pour rejouer le focus après
 *                 le refetch qui suit une validation.
 * @param isSaving Vrai pendant la sauvegarde d'une entrée : l'édition y est refusée.
 * @param onRename Appelé uniquement si le libellé a réellement changé.
 */
export function useInlineRename<T extends { code: string, label: string }>(
  items: Ref<readonly T[]>,
  isSaving: (code: string) => boolean,
  onRename: (code: string, label: string) => void,
) {
  const editingCode = ref<string | null>(null)
  const editLabel = ref('')

  /**
   * Un seul champ d'édition existe à la fois (`v-if` sur la ligne éditée), mais il vit DANS
   * un `v-for` : un `ref` statique y serait collecté par Vue dans un TABLEAU, et `.focus()`
   * sur un tableau ne fait rien — silencieusement. D'où le ref de fonction (revue 2026-09-04).
   */
  const editInput = ref<HTMLInputElement | null>(null)
  function setEditInput(el: Element | null) {
    editInput.value = el as HTMLInputElement | null
  }

  /**
   * Boutons-libellés par `code`, pour rendre le focus à la fin de l'édition. Le `v-if`/`v-else`
   * détruit le bouton qui portait le focus au moment d'ouvrir l'édition : sans restitution
   * explicite, le focus retombe sur `document.body` et la navigation Tab repart du début du
   * document (revue 2026-09-04).
   */
  const labelButtons = new Map<string, HTMLButtonElement>()
  function setLabelButton(code: string, el: Element | null) {
    if (el) labelButtons.set(code, el as HTMLButtonElement)
    else labelButtons.delete(code)
  }

  /**
   * Code dont le bouton-libellé doit reprendre le focus dès qu'il est de nouveau rendu.
   *
   * Un simple `nextTick` ne suffit pas après une VALIDATION : le renommage déclenche un
   * refetch, et le re-rendu qui suit fait retomber le focus sur `<body>` — l'utilisateur au
   * clavier était éjecté en haut de page à chaque renommage (recette du 2026-09-04). On
   * retient donc l'intention et on la rejoue quand la liste change, plutôt que de deviner
   * un délai.
   */
  const pendingFocusCode = ref<string | null>(null)

  /**
   * Pose le focus SANS consommer l'intention : elle doit survivre au re-rendu provoqué par le
   * refetch, qui arrive après ce premier placement. La consommer ici — ce que faisait la
   * première version du correctif — rendait le rattrapage impossible.
   */
  function applyPendingFocus() {
    const code = pendingFocusCode.value
    if (!code) return
    const btn = labelButtons.get(code)
    if (btn?.isConnected) btn.focus()
  }

  async function focusLabelButton(code: string) {
    pendingFocusCode.value = code
    await nextTick()
    applyPendingFocus()
  }

  // Le refetch remplace les lignes : on rejoue le focus, puis seulement là on l'oublie.
  watch(items, async () => {
    if (!pendingFocusCode.value) return
    await nextTick()
    applyPendingFocus()
    pendingFocusCode.value = null
  })

  /**
   * Ouvre l'édition inline ET donne le focus au champ. Sans ce `focus()`, le champ apparaît
   * non focalisé : au clavier le renommage est impossible (la frappe part dans le vide), à la
   * souris il faut un second clic. Le trou était masqué par l'E2E, dont le `fill()` focalise
   * lui-même l'élément (revue 2026-09-04).
   *
   * Le refus pendant la sauvegarde est ici, et non via `disabled` : passer un élément FOCALISÉ
   * en `disabled` lui fait perdre le focus (NFR19).
   */
  async function startEdit(entry: T) {
    if (isSaving(entry.code)) return
    pendingFocusCode.value = null
    editingCode.value = entry.code
    editLabel.value = entry.label
    await nextTick()
    editInput.value?.focus()
    editInput.value?.select()
  }

  /**
   * Ferme l'édition. `refocus` rend le focus au bouton-libellé : vrai quand l'utilisateur
   * reste sur la ligne (Escape, validation par Entrée), faux quand le focus part ailleurs de
   * lui-même (blur, clic sur « Supprimer ») — le lui reprendre casserait le déplacement.
   */
  function cancelEdit(refocus = false) {
    const code = editingCode.value
    editingCode.value = null
    editLabel.value = ''
    if (!refocus) pendingFocusCode.value = null
    if (refocus && code) focusLabelButton(code)
  }

  function commitEdit(entry: T, refocus = false) {
    // Garde de ré-entrance : `Entrée` valide, puis le démontage du champ déclenche un `blur`
    // qui rappelle `commitEdit` — deux `PATCH` pour une seule validation (revue 2026-08-04).
    // L'état est remis à zéro AVANT l'appel pour que la garde soit effective.
    if (editingCode.value !== entry.code) return
    const next = editLabel.value.trim()
    cancelEdit(refocus)
    if (next.length > 0 && next !== entry.label) onRename(entry.code, next)
  }

  /**
   * Sortie du champ. Quitter vers « Supprimer » abandonne le renommage au lieu de le
   * persister : `@mousedown` couvrait le clic mais pas l'activation clavier (Tab+Entrée), car
   * `blur` se déclenche avant que le bouton reçoive le focus. On lit donc la destination dans
   * `relatedTarget` (revue 2026-08-04).
   */
  function onEditBlur(entry: T, event: FocusEvent) {
    const target = event.relatedTarget as HTMLElement | null
    if (target?.dataset.cancelsEdit !== undefined) {
      cancelEdit()
      return
    }
    commitEdit(entry)
  }

  return {
    editingCode,
    editLabel,
    setEditInput,
    setLabelButton,
    startEdit,
    cancelEdit,
    commitEdit,
    onEditBlur,
  }
}
