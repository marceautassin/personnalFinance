<script setup lang="ts">
import { useCategoryAdmin } from '~/composables/useCategoryAdmin'
import { useApiError } from '~/composables/useApiError'
import { useInlineRename } from '~/composables/useInlineRename'
import type { CategoryGroupWithItems, CategoryItemWithCount } from '~/composables/useCategories'
import type { MovementNature } from '~~/shared/types/movement-nature'
import { isProtectedGroup } from '~~/shared/constants/protected-categories'
import CategoryForm from '~/components/categories/CategoryForm.vue'

const {
  data,
  pending,
  error,
  addGroup,
  renameGroup,
  deleteGroup,
  addItem,
  updateItem,
  deleteItem,
} = useCategoryAdmin()
const { mapError } = useApiError()

const groupFormRef = ref<InstanceType<typeof CategoryForm> | null>(null)
const itemFormRefs = new Map<string, InstanceType<typeof CategoryForm>>()
function setItemFormRef(code: string, el: unknown) {
  if (el) itemFormRefs.set(code, el as InstanceType<typeof CategoryForm>)
  else itemFormRefs.delete(code)
}

const addingGroup = ref(false)
const addingItemIn = ref<string | null>(null)
const savingCode = ref<string | null>(null)
const actionError = ref<string | null>(null)

/** Rubriques dépliées. Toutes ouvertes au départ : le référentiel est le sujet de la page. */
const collapsed = ref<Set<string>>(new Set())
function toggleGroup(code: string) {
  const next = new Set(collapsed.value)
  if (next.has(code)) next.delete(code)
  else next.add(code)
  collapsed.value = next
}

const fetchErrorMessage = computed(() => (error.value ? mapError(error.value) : null))

// Suppression confirmée — rubrique ou poste, une seule boîte de dialogue.
type PendingDelete
  = { kind: 'group', entry: CategoryGroupWithItems }
    | { kind: 'item', entry: CategoryItemWithCount }
const pendingDelete = ref<PendingDelete | null>(null)
const confirmOpen = computed(() => pendingDelete.value !== null)
const confirmTitle = computed(() =>
  pendingDelete.value?.kind === 'group' ? 'Supprimer la rubrique' : 'Supprimer le poste',
)

const groupsRef = computed(() => data.value)
const groupRename = useInlineRename(
  groupsRef,
  code => savingCode.value === code,
  (code, label) => void runGroupRename(code, label),
)

async function run(code: string | null, fn: () => Promise<{ error?: string }>) {
  actionError.value = null
  savingCode.value = code
  const outcome = await fn()
  savingCode.value = null
  if (outcome.error) actionError.value = outcome.error
  return outcome
}

async function runGroupRename(code: string, label: string) {
  await run(code, () => renameGroup(code, label))
}

async function onAddGroup(input: { label: string }) {
  addingGroup.value = true
  const outcome = await run(null, () => addGroup({ label: input.label }))
  addingGroup.value = false
  if (!outcome.error) groupFormRef.value?.reset()
}

async function onAddItem(groupCode: string, input: { label: string, nature: MovementNature }) {
  addingItemIn.value = groupCode
  const outcome = await run(null, () => addItem({ groupCode, ...input }))
  addingItemIn.value = null
  if (!outcome.error) itemFormRefs.get(groupCode)?.reset()
}

function onRenameItem(code: string, label: string) {
  void run(code, () => updateItem(code, { label }))
}

function onChangeNature(code: string, nature: MovementNature) {
  void run(code, () => updateItem(code, { nature }))
}

async function onConfirmDelete() {
  const target = pendingDelete.value
  pendingDelete.value = null
  if (!target) return
  await run(target.entry.code, () =>
    target.kind === 'group' ? deleteGroup(target.entry.code) : deleteItem(target.entry.code),
  )
}

/**
 * `aria-disabled` et non `disabled` : le bouton porte la RAISON du blocage dans son nom
 * accessible, et un bouton désactivé sortirait du parcours clavier — la raison deviendrait
 * inatteignable (NFR18-NFR20).
 */
function groupBlockReason(group: CategoryGroupWithItems): string | null {
  if (isProtectedGroup(group.code)) return 'Rubrique système, elle ne peut pas être supprimée'
  if (group.items.length > 0) {
    return `Contient ${group.items.length} poste(s) — supprime-les d'abord`
  }
  return null
}

function onRemoveGroup(group: CategoryGroupWithItems) {
  if (groupBlockReason(group) || savingCode.value === group.code) return
  actionError.value = null
  pendingDelete.value = { kind: 'group', entry: group }
}

function onRemoveItem(item: CategoryItemWithCount) {
  actionError.value = null
  pendingDelete.value = { kind: 'item', entry: item }
}
</script>

<template>
  <section class="cat-page">
    <header class="cat-page__header">
      <h2 class="cat-page__title">
        Catégories
      </h2>
      <p class="cat-page__lead">
        Chaque poste déclare sa nature. Les mouvements internes — virements vers un livret,
        retraits — n'entrent ni dans les recettes ni dans les dépenses.
      </p>
    </header>

    <p
      v-if="actionError"
      class="cat-page__error"
      role="alert"
    >
      {{ actionError }}
    </p>
    <p
      v-if="fetchErrorMessage"
      class="cat-page__error"
      role="alert"
    >
      {{ fetchErrorMessage }}
    </p>

    <CategoryForm
      ref="groupFormRef"
      title="Ajouter une rubrique"
      submit-label="Ajouter la rubrique"
      placeholder="Ex : Animaux"
      :saving="addingGroup"
      @add="onAddGroup"
    />

    <p
      v-if="pending && !data.length"
      class="cat-page__pending"
    >
      Chargement…
    </p>
    <p
      v-else-if="!data.length"
      class="cat-page__pending"
    >
      Aucune rubrique. Crée la première ci-dessus.
    </p>

    <article
      v-for="group in data"
      v-else
      :key="group.code"
      class="cat-group"
      :data-testid="`cat-group-${group.code}`"
    >
      <header class="cat-group__header">
        <button
          type="button"
          class="cat-group__toggle"
          :aria-expanded="!collapsed.has(group.code)"
          :aria-label="`${collapsed.has(group.code) ? 'Déplier' : 'Replier'} ${group.label}`"
          @click="toggleGroup(group.code)"
        >
          <span aria-hidden="true">{{ collapsed.has(group.code) ? '▸' : '▾' }}</span>
        </button>

        <input
          v-if="groupRename.editingCode.value === group.code"
          :ref="el => groupRename.setEditInput(el as Element | null)"
          v-model="groupRename.editLabel.value"
          type="text"
          class="cat-group__edit"
          maxlength="50"
          :aria-label="`Renommer ${group.label}`"
          @keyup.enter="groupRename.commitEdit(group, true)"
          @keyup.escape="groupRename.cancelEdit(true)"
          @blur="groupRename.onEditBlur(group, $event)"
        >
        <button
          v-else
          :ref="el => groupRename.setLabelButton(group.code, el as Element | null)"
          type="button"
          class="cat-group__label"
          :aria-disabled="savingCode === group.code"
          @click="groupRename.startEdit(group)"
        >
          {{ group.label }}
        </button>

        <span class="cat-group__count">{{ group.items.length }} poste(s)</span>

        <button
          type="button"
          class="cat-group__del"
          data-cancels-edit
          :class="{ 'cat-group__del--blocked': groupBlockReason(group) !== null }"
          :aria-disabled="groupBlockReason(group) !== null || savingCode === group.code"
          :title="groupBlockReason(group) ?? 'Supprimer'"
          :aria-label="groupBlockReason(group) ? `Supprimer ${group.label} — ${groupBlockReason(group)}` : `Supprimer ${group.label}`"
          @mousedown="groupRename.cancelEdit()"
          @click="onRemoveGroup(group)"
        >
          Supprimer
        </button>
      </header>

      <div v-if="!collapsed.has(group.code)">
        <CategoryList
          :items="group.items"
          :saving-code="savingCode"
          @rename="onRenameItem"
          @change-nature="onChangeNature"
          @remove="onRemoveItem"
        />
        <CategoryForm
          :ref="el => setItemFormRef(group.code, el)"
          title="Ajouter un poste"
          submit-label="Ajouter le poste"
          placeholder="Ex : Carburant"
          with-nature
          :saving="addingItemIn === group.code"
          @add="input => onAddItem(group.code, input)"
        />
      </div>
    </article>

    <ConfirmDialog
      :open="confirmOpen"
      :title="confirmTitle"
      :message="`Supprimer « ${pendingDelete?.entry.label} » ? Cette action est définitive.`"
      confirm-label="Supprimer"
      @confirm="onConfirmDelete"
      @cancel="pendingDelete = null"
    />
  </section>
</template>

<style scoped>
.cat-page {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
.cat-page__title { margin: 0; font-size: var(--font-size-xl, 1.5rem); }
.cat-page__lead { margin: var(--space-1) 0 0; color: var(--color-text-muted); max-width: 60ch; }
.cat-page__error {
  padding: var(--space-3);
  border-left: 3px solid var(--color-danger);
  background: var(--color-bg-elevated);
  border-radius: var(--radius-md);
  margin: 0;
  color: var(--color-danger);
}
.cat-page__pending { color: var(--color-text-muted); }

.cat-group {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  overflow: hidden;
}
.cat-group__header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  background: var(--color-bg-elevated);
  border-bottom: 1px solid var(--color-border);
}
.cat-group__toggle,
.cat-group__label,
.cat-group__del {
  border: none;
  background: none;
  font: inherit;
  color: inherit;
  cursor: pointer;
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-sm);
}
.cat-group__label { font-weight: 600; cursor: text; }
.cat-group__label:hover { background: var(--color-neutral-100); }
.cat-group__count { margin-left: auto; color: var(--color-text-muted); font-size: var(--font-size-sm); }
.cat-group__del { color: var(--color-danger); font-size: var(--font-size-sm); }
.cat-group__del--blocked { color: var(--color-text-muted); cursor: default; }
.cat-group__edit {
  padding: var(--space-1) var(--space-2);
  border: 1px solid var(--color-accent);
  border-radius: var(--radius-sm);
  font: inherit;
  font-weight: 600;
  background: var(--color-bg);
  color: inherit;
}
.cat-group > div { display: flex; flex-direction: column; gap: var(--space-3); padding: var(--space-3); }
</style>
