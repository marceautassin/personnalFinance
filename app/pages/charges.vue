<script setup lang="ts">
import { useFixedCharges, type FixedChargeItem } from '~/composables/useFixedCharges'
import type { NewFixedCharge } from '~~/shared/schemas/fixed-charge.schema'
import { useApiError } from '~/composables/useApiError'

const { data, pending, error, addCharge, updateCharge, deleteCharge } = useFixedCharges()
const { mapError } = useApiError()

const showForm = ref(false)
const editing = ref<FixedChargeItem | null>(null)
const submitting = ref(false)
const actionError = ref<string | null>(null)

const fetchErrorMessage = computed(() => (error.value ? mapError(error.value) : null))

function openAdd() {
  editing.value = null
  actionError.value = null
  showForm.value = true
}

function openEdit(charge: FixedChargeItem) {
  editing.value = charge
  actionError.value = null
  showForm.value = true
}

function closeForm() {
  showForm.value = false
  editing.value = null
}

async function onSubmit(payload: NewFixedCharge) {
  actionError.value = null
  submitting.value = true
  const outcome = editing.value
    ? await updateCharge(editing.value.id, payload)
    : await addCharge(payload)
  submitting.value = false
  if (outcome.error) {
    actionError.value = outcome.error
    return
  }
  closeForm()
}

async function onDelete(id: number) {
  actionError.value = null
  const outcome = await deleteCharge(id)
  if (outcome.error) actionError.value = outcome.error
}
</script>

<template>
  <section class="charges-page">
    <header class="charges-page__header">
      <h2 class="charges-page__title">
        Charges fixes
      </h2>
      <button
        v-if="!showForm"
        type="button"
        class="charges-page__add"
        @click="openAdd"
      >
        + Ajouter une charge
      </button>
    </header>

    <FixedChargeForm
      v-if="showForm"
      :initial="editing"
      :submitting="submitting"
      @submit="onSubmit"
      @cancel="closeForm"
    />

    <p
      v-if="actionError"
      class="charges-page__error"
      role="alert"
    >
      {{ actionError }}
    </p>

    <p
      v-if="fetchErrorMessage"
      class="charges-page__error"
      role="alert"
    >
      {{ fetchErrorMessage }}
    </p>

    <p
      v-if="pending && data.charges.length === 0"
      class="charges-page__pending"
    >
      Chargement…
    </p>

    <div
      v-else-if="data.charges.length === 0"
      class="charges-page__empty"
    >
      <p>Aucune charge fixe déclarée.</p>
      <button
        v-if="!showForm"
        type="button"
        class="charges-page__add"
        @click="openAdd"
      >
        + Déclarer ma première charge
      </button>
    </div>

    <FixedChargeList
      v-else
      :charges="data.charges"
      @edit="openEdit"
      @delete="onDelete"
    />
  </section>
</template>

<style scoped>
.charges-page {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
.charges-page__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}
.charges-page__title { margin: 0; font-size: var(--font-size-xl, 1.5rem); }
.charges-page__add {
  padding: var(--space-2) var(--space-4);
  border: 1px solid var(--color-accent);
  border-radius: var(--radius-md);
  background: var(--color-accent);
  color: white;
  font: inherit;
  cursor: pointer;
}
.charges-page__add:hover { filter: brightness(1.05); }
.charges-page__error {
  padding: var(--space-3);
  border-left: 3px solid var(--color-danger);
  background: var(--color-bg-elevated);
  border-radius: var(--radius-md);
  margin: 0;
  color: var(--color-danger);
}
.charges-page__pending { color: var(--color-text-muted); }
.charges-page__empty {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  align-items: flex-start;
  padding: var(--space-4);
  background: var(--color-bg-elevated);
  border-radius: var(--radius-md);
}
</style>
