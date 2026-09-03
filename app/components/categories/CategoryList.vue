<script setup lang="ts">
import type { CategoryListItem } from '~/composables/useCategories'
import { isProtectedCategory } from '~~/shared/constants/protected-categories'

defineProps<{
  categories: CategoryListItem[]
  savingCode?: string | null
}>()
const emit = defineEmits<{
  rename: [code: string, label: string]
  remove: [category: CategoryListItem]
}>()

// Code en cours d'édition inline (null = aucun).
const editingCode = ref<string | null>(null)
const editLabel = ref('')

/**
 * Un seul input d'édition existe à la fois (`v-if` sur la ligne éditée), mais il vit DANS un
 * `v-for` : un `ref` statique y serait collecté par Vue dans un tableau, et `.focus()` sur un
 * tableau ne fait rien silencieusement. D'où le ref de fonction (revue 2026-09-04).
 */
const editInput = ref<HTMLInputElement | null>(null)
function setEditInput(el: Element | null) {
  editInput.value = el as HTMLInputElement | null
}

/**
 * Boutons-libellés par `code`, pour rendre le focus à la fin de l'édition. Le `v-if`/`v-else`
 * détruit le bouton qui portait le focus au moment d'ouvrir l'édition : sans restitution
 * explicite, le focus retomberait sur `document.body` et la navigation Tab repartirait du
 * début du document (revue 2026-09-04).
 */
const labelButtons = new Map<string, HTMLButtonElement>()
function setLabelButton(code: string, el: Element | null) {
  if (el) labelButtons.set(code, el as HTMLButtonElement)
  else labelButtons.delete(code)
}

async function focusLabelButton(code: string) {
  await nextTick()
  labelButtons.get(code)?.focus()
}

/**
 * Ouvre l'édition inline ET donne le focus au champ. Sans ce `focus()`, l'input apparaissait
 * non focalisé : au clavier le renommage était purement impossible (la frappe partait dans le
 * vide), à la souris il fallait un second clic. Le trou était masqué par l'E2E, dont le
 * `fill()` focalise lui-même l'élément (revue 2026-09-04).
 */
async function startEdit(cat: CategoryListItem) {
  editingCode.value = cat.code
  editLabel.value = cat.label
  await nextTick()
  editInput.value?.focus()
  editInput.value?.select()
}

/**
 * Ferme l'édition. `refocus` rend le focus au bouton-libellé : vrai quand l'utilisateur reste
 * sur la ligne (Escape, validation par Entrée), faux quand le focus part ailleurs de lui-même
 * (blur, clic sur « Supprimer ») — le lui reprendre casserait le déplacement en cours.
 */
function cancelEdit(refocus = false) {
  const code = editingCode.value
  editingCode.value = null
  editLabel.value = ''
  if (refocus && code) focusLabelButton(code)
}

function commitEdit(cat: CategoryListItem, refocus = false) {
  // Garde de ré-entrance : `Entrée` validait, puis le démontage de l'input déclenchait un
  // `blur` qui rappelait `commitEdit` — deux `PATCH` pour une seule validation (revue
  // 2026-08-04). L'état est remis à zéro AVANT l'emit pour que la garde soit effective.
  if (editingCode.value !== cat.code) return
  const next = editLabel.value.trim()
  cancelEdit(refocus)
  if (next.length > 0 && next !== cat.label) emit('rename', cat.code, next)
}

/**
 * Sortie du champ d'édition. Quitter vers « Supprimer » abandonne le renommage au lieu de le
 * persister : `@mousedown` couvrait le clic, mais pas l'activation clavier (Tab+Entrée), car
 * `blur` se déclenche avant que le bouton reçoive le focus. On lit donc la destination dans
 * `relatedTarget` (revue 2026-08-04).
 */
function onEditBlur(cat: CategoryListItem, event: FocusEvent) {
  const target = event.relatedTarget as HTMLElement | null
  if (target?.dataset.cancelsEdit !== undefined) {
    cancelEdit()
    return
  }
  commitEdit(cat)
}

/** Raison textuelle du blocage de suppression, ou null si supprimable. */
function blockReason(cat: CategoryListItem): string | null {
  if (isProtectedCategory(cat.code)) return 'Catégorie système, ne peut pas être supprimée'
  if (cat.referenceCount > 0) return `Utilisée par ${cat.referenceCount} référence(s) — supprime-les d'abord`
  return null
}
</script>

<template>
  <div class="cat-list">
    <table class="cat-list__table">
      <thead>
        <tr>
          <th>Libellé</th>
          <th>Type</th>
          <th class="cat-list__num">
            Références
          </th>
          <th />
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="cat in categories"
          :key="cat.code"
          :data-testid="`cat-row-${cat.code}`"
        >
          <td>
            <input
              v-if="editingCode === cat.code"
              :ref="el => setEditInput(el as Element | null)"
              v-model="editLabel"
              type="text"
              class="cat-list__edit"
              maxlength="50"
              :aria-label="`Renommer ${cat.label}`"
              @keyup.enter="commitEdit(cat, true)"
              @keyup.escape="cancelEdit(true)"
              @blur="onEditBlur(cat, $event)"
            >
            <button
              v-else
              :ref="el => setLabelButton(cat.code, el as Element | null)"
              type="button"
              class="cat-list__label"
              :disabled="savingCode === cat.code"
              @click="startEdit(cat)"
            >
              {{ cat.label }}
            </button>
          </td>
          <td>
            <span
              class="cat-list__badge"
              :class="cat.isVariable ? 'cat-list__badge--variable' : 'cat-list__badge--fixed'"
            >
              {{ cat.isVariable ? 'Variable' : 'Fixe' }}
            </span>
          </td>
          <td class="cat-list__num">
            {{ cat.referenceCount }}
          </td>
          <td class="cat-list__actions">
            <!--
              Un renommage entamé mais non validé ne doit pas être persisté silencieusement
              quand l'utilisateur part sur « Supprimer » (puis annule la confirmation).
              Deux chemins, parce qu'aucun ne couvre l'autre :
                - souris : `mousedown` se déclenche AVANT le `blur` de l'input ;
                - clavier : `blur` part en premier, donc `onEditBlur` reconnaît la destination
                  via `data-cancels-edit`.
            -->
            <button
              type="button"
              class="cat-list__del"
              data-cancels-edit
              :disabled="blockReason(cat) !== null || savingCode === cat.code"
              :title="blockReason(cat) ?? 'Supprimer'"
              :aria-label="`Supprimer ${cat.label}`"
              @mousedown="cancelEdit()"
              @click="emit('remove', cat)"
            >
              Supprimer
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.cat-list__table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--font-size-sm);
}
.cat-list__table th,
.cat-list__table td {
  padding: var(--space-2) var(--space-3);
  text-align: left;
  border-bottom: 1px solid var(--color-border);
}
.cat-list__table th {
  color: var(--color-text-muted);
  font-weight: var(--font-weight-medium, 500);
}
.cat-list__num { text-align: right; font-variant-numeric: tabular-nums; }
.cat-list__actions { text-align: right; }
.cat-list__label {
  background: none;
  border: none;
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-sm);
  font: inherit;
  color: var(--color-text);
  cursor: text;
  text-align: left;
}
.cat-list__label:hover { background: var(--color-neutral-100); }
.cat-list__edit {
  padding: var(--space-1) var(--space-2);
  border: 1px solid var(--color-accent);
  border-radius: var(--radius-sm);
  font: inherit;
  width: 100%;
}
.cat-list__badge {
  display: inline-block;
  padding: 0 var(--space-2);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-xs, 0.75rem);
  line-height: 1.6;
}
.cat-list__badge--variable { background: var(--color-accent-soft, var(--color-neutral-100)); }
.cat-list__badge--fixed { background: var(--color-neutral-100); color: var(--color-text-muted); }
.cat-list__del {
  padding: var(--space-1) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-elevated);
  font: inherit;
  font-size: var(--font-size-sm);
  cursor: pointer;
}
.cat-list__del:hover:not(:disabled) { border-color: var(--color-danger); color: var(--color-danger); }
.cat-list__del:disabled { opacity: 0.45; cursor: not-allowed; }
</style>
