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

function startEdit(cat: CategoryListItem) {
  editingCode.value = cat.code
  editLabel.value = cat.label
}

function cancelEdit() {
  editingCode.value = null
  editLabel.value = ''
}

function commitEdit(cat: CategoryListItem) {
  const next = editLabel.value.trim()
  if (next.length > 0 && next !== cat.label) emit('rename', cat.code, next)
  cancelEdit()
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
              v-model="editLabel"
              type="text"
              class="cat-list__edit"
              maxlength="50"
              :aria-label="`Renommer ${cat.label}`"
              @keyup.enter="commitEdit(cat)"
              @keyup.escape="cancelEdit"
              @blur="commitEdit(cat)"
            >
            <button
              v-else
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
              `mousedown` se déclenche AVANT le `blur` de l'input d'édition : on annule d'abord
              l'édition en cours pour qu'un rename entamé mais non validé ne soit pas persisté
              silencieusement quand l'utilisateur clique « Supprimer » (puis annule la confirmation).
            -->
            <button
              type="button"
              class="cat-list__del"
              :disabled="blockReason(cat) !== null || savingCode === cat.code"
              :title="blockReason(cat) ?? 'Supprimer'"
              :aria-label="`Supprimer ${cat.label}`"
              @mousedown="cancelEdit"
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
