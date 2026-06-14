<script setup lang="ts">
import { centsToEuros, type Cents } from '~~/shared/types/money'
import { parseEurosToCents } from '~/utils/euros'

const props = defineProps<{
  monthlyCents: Cents
  endDate: string | null
  saving?: boolean
}>()
const emit = defineEmits<{
  save: [patch: { unemploymentBenefitMonthlyCents: Cents, unemploymentBenefitEndDate: string | null }]
}>()

const amountInput = ref('')
const endDateInput = ref('')
const error = ref<string | null>(null)

function syncFromProps() {
  amountInput.value = props.monthlyCents > 0 ? String(centsToEuros(props.monthlyCents)) : ''
  endDateInput.value = props.endDate ?? ''
  error.value = null
}
watch(() => [props.monthlyCents, props.endDate], syncFromProps, { immediate: true })

function onSubmit() {
  error.value = null
  const cents = parseEurosToCents(amountInput.value || '0')
  if (cents === null) {
    error.value = 'Montant invalide (nombre positif, max 2 décimales).'
    return
  }
  if (endDateInput.value && !/^\d{4}-\d{2}-\d{2}$/.test(endDateInput.value)) {
    error.value = 'Date de fin invalide (format AAAA-MM-JJ).'
    return
  }
  emit('save', {
    unemploymentBenefitMonthlyCents: cents,
    unemploymentBenefitEndDate: endDateInput.value || null,
  })
}
</script>

<template>
  <form
    class="rev-panel"
    @submit.prevent="onSubmit"
  >
    <h3 class="rev-panel__title">
      Allocation chômage (ARE)
    </h3>
    <p class="rev-panel__hint">
      Montant net mensuel et date de fin estimée des droits.
    </p>

    <div class="rev-panel__row">
      <label class="rev-panel__field rev-panel__field--grow">
        <span>Montant mensuel (€)</span>
        <input
          v-model="amountInput"
          type="text"
          inputmode="decimal"
          placeholder="0,00"
        >
      </label>
      <label class="rev-panel__field">
        <span>Fin des droits (optionnelle)</span>
        <input
          v-model="endDateInput"
          type="date"
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
        type="submit"
        class="rev-panel__btn"
        :disabled="saving"
      >
        {{ saving ? 'Envoi…' : 'Enregistrer' }}
      </button>
    </div>
  </form>
</template>
