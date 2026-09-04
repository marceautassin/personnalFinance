<script setup lang="ts">
import { parseEurosToCents } from '~/utils/euros'
import type { NewDebtEvent, DebtEventKind } from '~~/shared/schemas/debt-event.schema'

defineProps<{ saving?: boolean }>()
const emit = defineEmits<{
  submit: [payload: NewDebtEvent]
  cancel: []
}>()

/**
 * Le sens est saisi explicitement plutôt que par un montant signé : demander à l'utilisateur
 * de taper « -250 » pour un règlement serait une fuite du modèle dans l'UI. Le composant
 * compose le montant signé attendu par l'API (story 6.5, D16).
 */
const KIND_OPTIONS: { value: DebtEventKind, label: string, sign: 1 | -1 }[] = [
  { value: 'advance', label: 'Avance reçue (augmente le solde dû)', sign: 1 },
  { value: 'settlement', label: 'Règlement (diminue le solde dû)', sign: -1 },
  // `adjustment` était figé à la baisse, alors que le ledger accepte les deux sens et que
  // `kind` est purement descriptif : une correction à la hausse était inexprimable en UI
  // (revue du 2026-09-04).
  { value: 'adjustment', label: 'Correction à la hausse', sign: 1 },
  { value: 'adjustment', label: 'Correction à la baisse', sign: -1 },
]

const amountEuros = ref('')
const eventDate = ref('')
const selectedLabel = ref<string>(KIND_OPTIONS[0]!.label)
const note = ref('')
const error = ref<string | null>(null)

function onSubmit() {
  error.value = null
  const amount = parseEurosToCents(amountEuros.value || '')
  if (amount === null || amount <= 0) {
    error.value = 'Montant invalide (strictement positif).'
    return
  }
  if (!eventDate.value) {
    error.value = 'Date requise.'
    return
  }
  const option = KIND_OPTIONS.find(o => o.label === selectedLabel.value) ?? KIND_OPTIONS[0]!
  emit('submit', {
    amountCents: amount * option.sign,
    eventDate: eventDate.value,
    kind: option.value,
    note: note.value.trim() || null,
  })
}
</script>

<template>
  <form
    class="rev-panel adv-form"
    @submit.prevent="onSubmit"
  >
    <div class="rev-panel__row">
      <label class="rev-panel__field">
        <span>Montant (€)</span>
        <input
          v-model="amountEuros"
          type="text"
          inputmode="decimal"
          placeholder="0,00"
        >
      </label>
      <label class="rev-panel__field">
        <span>Date</span>
        <input
          v-model="eventDate"
          type="date"
        >
      </label>
      <label class="rev-panel__field rev-panel__field--grow">
        <span>Nature</span>
        <select v-model="selectedLabel">
          <option
            v-for="opt in KIND_OPTIONS"
            :key="opt.label"
            :value="opt.label"
          >
            {{ opt.label }}
          </option>
        </select>
      </label>
    </div>

    <div class="rev-panel__row">
      <label class="rev-panel__field rev-panel__field--grow">
        <span>Note (optionnel)</span>
        <input
          v-model="note"
          type="text"
          maxlength="200"
        >
      </label>
    </div>

    <p
      v-if="error"
      class="rev-panel__error"
      role="alert"
    >
      {{ error }}
    </p>

    <div class="rev-panel__actions">
      <button
        type="button"
        class="rev-panel__btn rev-panel__btn--ghost"
        @click="emit('cancel')"
      >
        Annuler
      </button>
      <button
        type="submit"
        class="rev-panel__btn"
        :disabled="saving"
      >
        {{ saving ? 'Envoi…' : 'Enregistrer' }}
      </button>
    </div>
  </form>
</template>

<style scoped>
.adv-form { margin-top: var(--space-3); background: var(--color-bg); }
.rev-panel__btn--ghost { background: var(--color-bg-elevated); color: var(--color-text); }
</style>
