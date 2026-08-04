<script setup lang="ts">
import type { Cents } from '~~/shared/types/money'
import { parseEurosToCents, syncEurosInput, MAX_REVENUE_CENTS } from '~/utils/euros'

const props = defineProps<{
  monthlyCents: Cents
  saving?: boolean
}>()
const emit = defineEmits<{
  save: [patch: { sasMonthlyRentCents: Cents }]
}>()

const amountInput = ref('')
const error = ref<string | null>(null)

// `syncEurosInput` : ne réécrit pas une saisie en cours équivalente (cf. `app/utils/euros.ts`).
const { markDirty, markPristine, syncIfPristine } = useDirtyForm()

function syncFromProps() {
  amountInput.value = syncEurosInput(amountInput.value, props.monthlyCents)
  error.value = null
}
watch(() => props.monthlyCents, () => syncIfPristine(syncFromProps), { immediate: true })

function onSubmit() {
  error.value = null
  const cents = parseEurosToCents(amountInput.value || '0')
  if (cents === null) {
    error.value = 'Montant invalide (nombre positif, max 2 décimales).'
    return
  }
  // Borne alignée sur RevenueAmountCentsSchema.max(1e11) : message inline plutôt qu'un 422.
  if (cents > MAX_REVENUE_CENTS) {
    error.value = 'Montant trop élevé (max 1 000 000 000 €).'
    return
  }
  markPristine()
  emit('save', { sasMonthlyRentCents: cents })
}
</script>

<template>
  <form
    class="rev-panel"
    @input="markDirty"
    @submit.prevent="onSubmit"
  >
    <h3 class="rev-panel__title">
      Loyer SAS
    </h3>
    <p class="rev-panel__hint">
      Loyer mensuel perçu de la SAS (revenu foncier).
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
