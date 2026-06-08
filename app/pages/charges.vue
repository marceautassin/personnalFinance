<script setup lang="ts">
import { useFixedCharges, type FixedChargeItem, type ChargeFormPrefill } from '~/composables/useFixedCharges'
import { useChargeSuggestions } from '~/composables/useChargeSuggestions'
import type { Suggestion } from '~~/server/services/charge-suggester'
import type { NewFixedCharge } from '~~/shared/schemas/fixed-charge.schema'
import { useApiError } from '~/composables/useApiError'

const { data, pending, error, addCharge, updateCharge, deleteCharge } = useFixedCharges()
const { data: suggestionsData, accept, dismiss, refresh: refreshSuggestions } = useChargeSuggestions()
const { mapError } = useApiError()

const showForm = ref(false)
const formPrefill = ref<ChargeFormPrefill | null>(null)
const editingId = ref<number | null>(null)
// Libellé normalisé de la suggestion à l'origine du formulaire (création depuis suggestion).
// Sert à la rejeter après création pour qu'elle ne réapparaisse pas si l'utilisateur a
// modifié le libellé (le libellé enregistré ne se normalise alors plus vers cette clé).
const pendingSuggestionLabel = ref<string | null>(null)
const submitting = ref(false)
const busy = ref(false)
const actionError = ref<string | null>(null)

const fetchErrorMessage = computed(() => (error.value ? mapError(error.value) : null))

function openAdd() {
  formPrefill.value = null
  editingId.value = null
  pendingSuggestionLabel.value = null
  actionError.value = null
  showForm.value = true
}

function openEdit(charge: FixedChargeItem) {
  formPrefill.value = charge
  editingId.value = charge.id
  pendingSuggestionLabel.value = null
  actionError.value = null
  showForm.value = true
}

function openFromSuggestion(suggestion: Suggestion) {
  formPrefill.value = {
    label: suggestion.sampleLabel,
    amountCents: suggestion.averageAmountCents,
    categoryCode: suggestion.categoryCode,
    frequency: suggestion.suggestedFrequency,
    startDate: suggestion.startDate,
    endDate: null,
  }
  editingId.value = null
  pendingSuggestionLabel.value = suggestion.normalizedLabel
  actionError.value = null
  showForm.value = true
}

function closeForm() {
  showForm.value = false
  formPrefill.value = null
  editingId.value = null
  pendingSuggestionLabel.value = null
}

async function onSubmit(payload: NewFixedCharge) {
  actionError.value = null
  submitting.value = true
  const outcome = editingId.value !== null
    ? await updateCharge(editingId.value, payload)
    : await addCharge(payload)
  submitting.value = false
  if (outcome.error) {
    actionError.value = outcome.error
    return
  }
  const sourceSuggestion = pendingSuggestionLabel.value
  closeForm()
  // Charge créée depuis une suggestion : rejeter le libellé d'origine pour qu'il ne
  // réapparaisse pas (libellé enregistré possiblement modifié ≠ clé de la suggestion).
  // Sinon, une création manuelle peut résorber une suggestion → simple recompute.
  if (sourceSuggestion !== null) await dismiss(sourceSuggestion)
  else await refreshSuggestions()
}

async function onDelete(id: number) {
  actionError.value = null
  const outcome = await deleteCharge(id)
  if (outcome.error) actionError.value = outcome.error
}

async function onAcceptSuggestion(suggestion: Suggestion) {
  actionError.value = null
  busy.value = true
  const outcome = await accept(suggestion)
  busy.value = false
  if (outcome.error) actionError.value = outcome.error
}

async function onDismissSuggestion(normalizedLabel: string) {
  actionError.value = null
  busy.value = true
  const outcome = await dismiss(normalizedLabel)
  busy.value = false
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
      :initial="formPrefill"
      :editing="editingId !== null"
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

    <SuggestedChargesPanel
      :suggestions="suggestionsData.suggestions"
      :busy="busy"
      @accept="onAcceptSuggestion"
      @edit="openFromSuggestion"
      @dismiss="onDismissSuggestion"
    />

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
