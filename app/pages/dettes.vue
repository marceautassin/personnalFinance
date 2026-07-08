<script setup lang="ts">
import { useDebts } from '~/composables/useDebts'
import { useApiError } from '~/composables/useApiError'
import type { Debt, NewDebt } from '~~/shared/schemas/debt.schema'
import type { NewDebtAdvance } from '~~/shared/schemas/debt-advance.schema'

const { data, pending, error, addDebt, updateDebt, deleteDebt, addAdvance } = useDebts()
const { mapError } = useApiError()

const showForm = ref(false)
const editing = ref<Debt | null>(null)
const submitting = ref(false)
const savingAdvanceId = ref<number | null>(null)
const actionError = ref<string | null>(null)

const pendingDelete = ref<Debt | null>(null)
const confirmOpen = computed(() => pendingDelete.value !== null)

const fetchErrorMessage = computed(() => (error.value ? mapError(error.value) : null))

function openAdd() {
  editing.value = null
  actionError.value = null
  showForm.value = true
}
function openEdit(debt: Debt) {
  editing.value = debt
  actionError.value = null
  showForm.value = true
}
function closeForm() {
  showForm.value = false
  editing.value = null
}

async function onSubmit(payload: NewDebt) {
  actionError.value = null
  submitting.value = true
  const outcome = editing.value
    ? await updateDebt(editing.value.id, payload)
    : await addDebt(payload)
  submitting.value = false
  if (outcome.error) actionError.value = outcome.error
  else closeForm()
}

async function onAdvance(debtId: number, payload: NewDebtAdvance) {
  actionError.value = null
  savingAdvanceId.value = debtId
  const outcome = await addAdvance(debtId, payload)
  savingAdvanceId.value = null
  if (outcome.error) actionError.value = outcome.error
}

async function onConfirmDelete() {
  const debt = pendingDelete.value
  pendingDelete.value = null
  if (!debt) return
  actionError.value = null
  const outcome = await deleteDebt(debt.id)
  if (outcome.error) actionError.value = outcome.error
}
</script>

<template>
  <section class="debts-page">
    <header class="debts-page__header">
      <h2 class="debts-page__title">
        Dettes
      </h2>
      <button
        type="button"
        class="debts-page__add"
        @click="openAdd"
      >
        Ajouter une dette
      </button>
    </header>

    <p
      v-if="actionError"
      class="debts-page__error"
      role="alert"
    >
      {{ actionError }}
    </p>
    <p
      v-if="fetchErrorMessage"
      class="debts-page__error"
      role="alert"
    >
      {{ fetchErrorMessage }}
    </p>

    <DebtForm
      v-if="showForm"
      :debt="editing"
      :saving="submitting"
      @submit="onSubmit"
      @cancel="closeForm"
    />

    <p
      v-if="pending && !data.length"
      class="debts-page__pending"
    >
      Chargement…
    </p>
    <p
      v-else-if="!data.length"
      class="debts-page__empty"
    >
      Aucune dette.
    </p>
    <div
      v-else
      class="debts-page__list"
    >
      <DebtCard
        v-for="debt in data"
        :key="debt.id"
        :debt="debt"
        :saving-advance="savingAdvanceId === debt.id"
        @edit="openEdit"
        @remove="d => pendingDelete = d"
        @advance="onAdvance"
      />
    </div>

    <ConfirmDialog
      :open="confirmOpen"
      title="Supprimer la dette"
      :message="`Supprimer la dette « ${pendingDelete?.creditor} » ? Cette action est définitive.`"
      confirm-label="Supprimer"
      @confirm="onConfirmDelete"
      @cancel="pendingDelete = null"
    />
  </section>
</template>

<style scoped>
.debts-page {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
.debts-page__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-3);
}
.debts-page__title { margin: 0; font-size: var(--font-size-xl, 1.5rem); }
.debts-page__add {
  padding: var(--space-2) var(--space-4);
  border: 1px solid var(--color-accent);
  border-radius: var(--radius-md);
  background: var(--color-accent);
  color: white;
  font: inherit;
  cursor: pointer;
}
.debts-page__list {
  display: grid;
  gap: var(--space-4);
  grid-template-columns: repeat(auto-fill, minmax(18rem, 1fr));
}
.debts-page__error {
  padding: var(--space-3);
  border-left: 3px solid var(--color-danger);
  background: var(--color-bg-elevated);
  border-radius: var(--radius-md);
  margin: 0;
  color: var(--color-danger);
}
.debts-page__pending, .debts-page__empty { color: var(--color-text-muted); }
</style>
