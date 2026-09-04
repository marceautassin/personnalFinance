<script setup lang="ts">
import type { CategoryItemWithCount } from '~/composables/useCategories'
import type { MovementNature } from '~~/shared/types/movement-nature'
import { isProtectedItem } from '~~/shared/constants/protected-categories'
import { useInlineRename } from '~/composables/useInlineRename'

const props = defineProps<{
  items: CategoryItemWithCount[]
  savingCode?: string | null
}>()
const emit = defineEmits<{
  rename: [code: string, label: string]
  changeNature: [code: string, nature: MovementNature]
  remove: [item: CategoryItemWithCount]
}>()

const itemsRef = computed(() => props.items)
const {
  editingCode,
  editLabel,
  setEditInput,
  setLabelButton,
  startEdit,
  cancelEdit,
  commitEdit,
  onEditBlur,
} = useInlineRename(
  itemsRef,
  code => props.savingCode === code,
  (code, label) => emit('rename', code, label),
)

const NATURE_LABELS: Record<MovementNature, string> = {
  income: 'Recette',
  expense: 'Dépense',
  internal_transfer: 'Mouvement interne',
}
const NATURE_OPTIONS = Object.entries(NATURE_LABELS) as [MovementNature, string][]

/**
 * `aria-disabled` plutôt que `disabled` (recette du 2026-09-04) — deux raisons :
 *
 * 1. Un bouton `disabled` sort du tab order. Or c'est LUI qui porte `data-cancels-edit`, le
 *    garde-fou qui abandonne un renommage quand on part sur « Supprimer ». Dès qu'un poste
 *    était référencé — le cas normal — le bouton devenait inatteignable au clavier et le
 *    garde-fou ne se déclenchait jamais.
 * 2. Le `title` qui EXPLIQUE le blocage était lui aussi hors de portée du clavier. La raison
 *    vit désormais dans l'`aria-label`, donc elle est annoncée (NFR20).
 *
 * Le clic reste inopérant : `onRemoveClick` refuse, et le style `--blocked` conserve
 * l'apparence grisée.
 */
function blockReason(item: CategoryItemWithCount): string | null {
  if (isProtectedItem(item.code)) return 'Poste système, ne peut pas être supprimé'
  if (item.transactionCount > 0) {
    return `Utilisé par ${item.transactionCount} transaction(s) — reclasse-les d'abord`
  }
  return null
}

function isBlocked(item: CategoryItemWithCount): boolean {
  return blockReason(item) !== null
}

function onRemoveClick(item: CategoryItemWithCount) {
  if (isBlocked(item) || props.savingCode === item.code) return
  emit('remove', item)
}

/**
 * Le `<select>` est en `:value` + `@change` et non en `v-model` : sur échec du PATCH, le
 * navigateur garderait l'option choisie alors que la base porte encore l'ancienne nature —
 * une divergence silencieuse entre l'écran et la donnée. On repositionne donc explicitement
 * l'élément sur `item.nature` ; le refetch d'un succès écrasera de toute façon cette valeur.
 */
function onNatureChange(item: CategoryItemWithCount, event: Event) {
  const select = event.target as HTMLSelectElement
  const value = select.value
  select.value = item.nature
  if (value === item.nature) return
  emit('changeNature', item.code, value as MovementNature)
}
</script>

<template>
  <div class="cat-list">
    <p
      v-if="items.length === 0"
      class="cat-list__empty"
    >
      Aucun poste dans cette rubrique.
    </p>
    <table
      v-else
      class="cat-list__table"
    >
      <thead>
        <tr>
          <th>Poste</th>
          <th>Nature</th>
          <th class="cat-list__num">
            Transactions
          </th>
          <th />
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="item in items"
          :key="item.code"
          :data-testid="`cat-row-${item.code}`"
        >
          <td>
            <input
              v-if="editingCode === item.code"
              :ref="el => setEditInput(el as Element | null)"
              v-model="editLabel"
              type="text"
              class="cat-list__edit"
              maxlength="50"
              :aria-label="`Renommer ${item.label}`"
              @keyup.enter="commitEdit(item, true)"
              @keyup.escape="cancelEdit(true)"
              @blur="onEditBlur(item, $event)"
            >
            <button
              v-else
              :ref="el => setLabelButton(item.code, el as Element | null)"
              type="button"
              class="cat-list__label"
              :aria-disabled="savingCode === item.code"
              @click="startEdit(item)"
            >
              {{ item.label }}
            </button>
          </td>
          <td>
            <!--
              La nature est modifiable ici : c'est ce qui permet de corriger un poste entier
              mal orienté sans reclasser ses transactions une à une. Elle est portée par le
              poste (D17), donc toutes ses transactions suivent.
            -->
            <select
              class="cat-list__nature"
              :aria-label="`Nature de ${item.label}`"
              :value="item.nature"
              @change="onNatureChange(item, $event)"
            >
              <option
                v-for="[value, label] in NATURE_OPTIONS"
                :key="value"
                :value="value"
              >
                {{ label }}
              </option>
            </select>
          </td>
          <td class="cat-list__num">
            {{ item.transactionCount }}
          </td>
          <td class="cat-list__actions">
            <!--
              Un renommage entamé mais non validé ne doit pas être persisté silencieusement
              quand l'utilisateur part sur « Supprimer » (puis annule la confirmation).
              Deux chemins, parce qu'aucun ne couvre l'autre :
                - souris : `mousedown` se déclenche AVANT le `blur` du champ ;
                - clavier : `blur` part en premier, donc `onEditBlur` reconnaît la destination
                  via `data-cancels-edit`.
            -->
            <button
              type="button"
              class="cat-list__del"
              data-cancels-edit
              :class="{ 'cat-list__del--blocked': isBlocked(item) }"
              :aria-disabled="isBlocked(item) || savingCode === item.code"
              :title="blockReason(item) ?? 'Supprimer'"
              :aria-label="blockReason(item) ? `Supprimer ${item.label} — ${blockReason(item)}` : `Supprimer ${item.label}`"
              @mousedown="cancelEdit()"
              @click="onRemoveClick(item)"
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
.cat-list__empty { color: var(--color-text-muted); margin: 0; padding: var(--space-2) 0; }
.cat-list__nature {
  padding: var(--space-1) var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-bg-elevated);
  color: inherit;
  font: inherit;
  font-size: var(--font-size-sm);
}
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
.cat-list__del--blocked {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
