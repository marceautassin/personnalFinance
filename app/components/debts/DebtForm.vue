<script setup lang="ts">
import { centsToEuros, type Cents } from '~~/shared/types/money'
import { parseEurosToCents } from '~/utils/euros'
import type { RepaymentMode } from '~~/shared/types/repayment-mode'
import type { Debt, NewDebt } from '~~/shared/schemas/debt.schema'
import DebtRepaymentMode from './DebtRepaymentMode.vue'

const props = defineProps<{
  /** Dette à éditer, ou null pour une création. */
  debt?: Debt | null
  saving?: boolean
}>()
const emit = defineEmits<{
  submit: [payload: NewDebt]
  cancel: []
}>()

const creditor = ref('')
const balanceEuros = ref('')
const mode = ref<RepaymentMode>('free')
const monthlyEuros = ref('')
const lumpSumDate = ref('')
const error = ref<string | null>(null)

const isEdit = computed(() => props.debt != null)

// Préremplissage (édition) / réinitialisation (création), immédiat + sur changement de cible.
watch(() => props.debt, (d) => {
  creditor.value = d?.creditor ?? ''
  balanceEuros.value = d ? String(centsToEuros(d.initialBalanceCents as Cents)) : ''
  mode.value = d?.repaymentMode ?? 'free'
  monthlyEuros.value = d?.monthlyAmountCents != null ? String(centsToEuros(d.monthlyAmountCents as Cents)) : ''
  lumpSumDate.value = d?.lumpSumDate ?? ''
  error.value = null
}, { immediate: true })

function onSubmit() {
  error.value = null
  const label = creditor.value.trim()
  if (label.length === 0) {
    error.value = 'Le créancier est requis.'
    return
  }
  const initial = parseEurosToCents(balanceEuros.value || '0')
  if (initial === null) {
    error.value = 'Solde initial invalide (nombre positif, max 2 décimales).'
    return
  }

  let monthlyAmountCents: number | null = null
  let lump: string | null = null
  if (mode.value === 'monthly') {
    const m = parseEurosToCents(monthlyEuros.value || '')
    if (m === null || m <= 0) {
      error.value = 'Mensualité invalide (montant strictement positif).'
      return
    }
    monthlyAmountCents = m
  }
  else if (mode.value === 'lump_sum') {
    if (!lumpSumDate.value) {
      error.value = 'Date d\'échéance requise pour ce mode.'
      return
    }
    lump = lumpSumDate.value
  }

  emit('submit', {
    creditor: label,
    initialBalanceCents: initial,
    repaymentMode: mode.value,
    monthlyAmountCents,
    lumpSumDate: lump,
  })
}
</script>

<template>
  <form
    class="rev-panel"
    @submit.prevent="onSubmit"
  >
    <h3 class="rev-panel__title">
      {{ isEdit ? 'Modifier la dette' : 'Ajouter une dette' }}
    </h3>

    <div class="rev-panel__row">
      <label class="rev-panel__field rev-panel__field--grow">
        <span>Créancier</span>
        <input
          v-model="creditor"
          type="text"
          maxlength="80"
          placeholder="Ex : Banque, Papa…"
        >
      </label>
      <label class="rev-panel__field">
        <span>Solde initial (€)</span>
        <input
          v-model="balanceEuros"
          type="text"
          inputmode="decimal"
          placeholder="0,00"
        >
      </label>
    </div>

    <DebtRepaymentMode
      v-model:mode="mode"
      v-model:monthly-euros="monthlyEuros"
      v-model:lump-sum-date="lumpSumDate"
    />

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
        {{ saving ? 'Envoi…' : (isEdit ? 'Enregistrer' : 'Ajouter') }}
      </button>
    </div>
  </form>
</template>

<style scoped>
.rev-panel__btn--ghost {
  background: var(--color-bg-elevated);
  color: var(--color-text);
}
</style>
