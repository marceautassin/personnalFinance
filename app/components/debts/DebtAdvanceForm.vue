<script setup lang="ts">
import { parseEurosToCents } from '~/utils/euros'
import type { NewDebtAdvance } from '~~/shared/schemas/debt-advance.schema'

defineProps<{ saving?: boolean }>()
const emit = defineEmits<{
  submit: [payload: NewDebtAdvance]
  cancel: []
}>()

const amountEuros = ref('')
const advanceDate = ref('')
const note = ref('')
const error = ref<string | null>(null)

function onSubmit() {
  error.value = null
  const amount = parseEurosToCents(amountEuros.value || '')
  if (amount === null || amount <= 0) {
    error.value = 'Montant invalide (strictement positif).'
    return
  }
  if (!advanceDate.value) {
    error.value = 'Date requise.'
    return
  }
  emit('submit', {
    amountCents: amount,
    advanceDate: advanceDate.value,
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
        <span>Avance reçue (€)</span>
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
          v-model="advanceDate"
          type="date"
        >
      </label>
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
        {{ saving ? 'Envoi…' : 'Enregistrer l\'avance' }}
      </button>
    </div>
  </form>
</template>

<style scoped>
.adv-form { margin-top: var(--space-3); background: var(--color-bg); }
.rev-panel__btn--ghost { background: var(--color-bg-elevated); color: var(--color-text); }
</style>
