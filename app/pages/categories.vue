<script setup lang="ts">
import { useCategoryAdmin } from '~/composables/useCategoryAdmin'
import { useApiError } from '~/composables/useApiError'
import type { CategoryListItem } from '~/composables/useCategories'
import type { NewCategoryInput } from '~~/shared/schemas/category.schema'
import CategoryForm from '~/components/categories/CategoryForm.vue'

const { data, pending, error, addCategory, updateCategory, deleteCategory } = useCategoryAdmin()
const { mapError } = useApiError()

const formRef = ref<InstanceType<typeof CategoryForm> | null>(null)
const adding = ref(false)
const savingCode = ref<string | null>(null)
const actionError = ref<string | null>(null)

// Suppression confirmée via ConfirmDialog.
const pendingDelete = ref<CategoryListItem | null>(null)
const confirmOpen = computed(() => pendingDelete.value !== null)

const fetchErrorMessage = computed(() => (error.value ? mapError(error.value) : null))

async function onAdd(input: NewCategoryInput) {
  actionError.value = null
  adding.value = true
  const outcome = await addCategory(input)
  adding.value = false
  if (outcome.error) actionError.value = outcome.error
  else formRef.value?.reset()
}

async function onRename(code: string, label: string) {
  actionError.value = null
  savingCode.value = code
  const outcome = await updateCategory(code, label)
  savingCode.value = null
  if (outcome.error) actionError.value = outcome.error
}

function onRemove(cat: CategoryListItem) {
  actionError.value = null
  pendingDelete.value = cat
}

async function onConfirmDelete() {
  const cat = pendingDelete.value
  pendingDelete.value = null
  if (!cat) return
  savingCode.value = cat.code
  const outcome = await deleteCategory(cat.code)
  savingCode.value = null
  if (outcome.error) actionError.value = outcome.error
}
</script>

<template>
  <section class="cat-page">
    <header class="cat-page__header">
      <h2 class="cat-page__title">
        Catégories
      </h2>
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
      ref="formRef"
      :saving="adding"
      @add="onAdd"
    />

    <p
      v-if="pending && !data.length"
      class="cat-page__pending"
    >
      Chargement…
    </p>
    <CategoryList
      v-else
      :categories="data"
      :saving-code="savingCode"
      @rename="onRename"
      @remove="onRemove"
    />

    <ConfirmDialog
      :open="confirmOpen"
      title="Supprimer la catégorie"
      :message="`Supprimer « ${pendingDelete?.label} » ? Cette action est définitive.`"
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
.cat-page__error {
  padding: var(--space-3);
  border-left: 3px solid var(--color-danger);
  background: var(--color-bg-elevated);
  border-radius: var(--radius-md);
  margin: 0;
  color: var(--color-danger);
}
.cat-page__pending { color: var(--color-text-muted); }
</style>
