<script setup lang="ts">
import { centsToEuros, type Cents } from '~~/shared/types/money'
import { parseEurosToCents } from '~/utils/euros'
import type { SasConfigInput } from '~~/shared/services/dividend-capacity'
import type { SasConfigPatch } from '~~/shared/schemas/sas-config.schema'

const props = defineProps<{
  revenueForecastCents: Cents
  expensesForecastCents: Cents
  currentTreasuryCents: Cents
  isRatePct: number
  saving?: boolean
}>()
const emit = defineEmits<{
  /** Émis à chaque saisie : valeurs cents courantes pour le recalcul live de la card. */
  change: [live: SasConfigInput]
  save: [patch: SasConfigPatch]
}>()

const revenueInput = ref('')
const expensesInput = ref('')
const treasuryInput = ref('')
const rateInput = ref('')
const error = ref<string | null>(null)

const eurosOf = (c: Cents) => (c > 0 ? String(centsToEuros(c)) : '')

// Ne réécrit un champ que si sa saisie ne représente PAS déjà la valeur persistée : préserve
// le format utilisateur (ex. "1500,50") après un save équivalent, au lieu de le normaliser.
function syncEuros(current: string, cents: Cents) {
  return parseEurosToCents(current || '0') === cents ? current : eurosOf(cents)
}

function syncFromProps() {
  revenueInput.value = syncEuros(revenueInput.value, props.revenueForecastCents)
  expensesInput.value = syncEuros(expensesInput.value, props.expensesForecastCents)
  treasuryInput.value = syncEuros(treasuryInput.value, props.currentTreasuryCents)
  rateInput.value = parseRatePct(rateInput.value || '0') === props.isRatePct
    ? rateInput.value
    : (props.isRatePct > 0 ? String(props.isRatePct / 100) : '')
  error.value = null
}
watch(
  () => [props.revenueForecastCents, props.expensesForecastCents, props.currentTreasuryCents, props.isRatePct],
  syncFromProps,
  { immediate: true },
)

/** Parse un pourcentage saisi (ex: "15", "15.5") en pct×100 entier, ou null si invalide. */
function parseRatePct(input: string): number | null {
  const normalized = input.replace(/\s+/gu, '').replace(',', '.')
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null
  const pct = Number(normalized)
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) return null
  return Math.round(pct * 100)
}

// Valeurs cents courantes (null → 0) pour le recalcul live de la card.
const liveInput = computed<SasConfigInput>(() => ({
  revenueForecastCents: (parseEurosToCents(revenueInput.value || '0') ?? 0) as Cents,
  expensesForecastCents: (parseEurosToCents(expensesInput.value || '0') ?? 0) as Cents,
  currentTreasuryCents: (parseEurosToCents(treasuryInput.value || '0') ?? 0) as Cents,
  isRatePct: parseRatePct(rateInput.value || '0') ?? 0,
}))
watch(liveInput, val => emit('change', val), { immediate: true })

function onSubmit() {
  error.value = null
  const revenue = parseEurosToCents(revenueInput.value || '0')
  const expenses = parseEurosToCents(expensesInput.value || '0')
  const treasury = parseEurosToCents(treasuryInput.value || '0')
  const rate = parseRatePct(rateInput.value || '0')
  if (revenue === null || expenses === null || treasury === null) {
    error.value = 'Montant invalide (nombre positif, max 2 décimales).'
    return
  }
  // Borne haute alignée sur SasAmountCentsSchema.max(1e12) : message inline plutôt qu'un 422.
  if (revenue > 1e12 || expenses > 1e12 || treasury > 1e12) {
    error.value = 'Montant trop élevé (max 10 000 000 000 €).'
    return
  }
  if (rate === null) {
    error.value = 'Taux IS invalide (0 à 100 %, max 2 décimales).'
    return
  }
  emit('save', {
    revenueForecastCents: revenue,
    expensesForecastCents: expenses,
    currentTreasuryCents: treasury,
    isRatePct: rate,
  })
}
</script>

<template>
  <form
    class="rev-panel"
    @submit.prevent="onSubmit"
  >
    <h3 class="rev-panel__title">
      Données fiscales SAS
    </h3>
    <p class="rev-panel__hint">
      Prévisionnel de l'exercice en cours. La capacité dividendable se recalcule en direct.
    </p>

    <div class="rev-panel__row">
      <label class="rev-panel__field rev-panel__field--grow">
        <span>CA prévisionnel (€)</span>
        <input
          v-model="revenueInput"
          type="text"
          inputmode="decimal"
          placeholder="0,00"
        >
      </label>
      <label class="rev-panel__field rev-panel__field--grow">
        <span>Charges prévisionnelles (€)</span>
        <input
          v-model="expensesInput"
          type="text"
          inputmode="decimal"
          placeholder="0,00"
        >
      </label>
    </div>

    <div class="rev-panel__row">
      <label class="rev-panel__field rev-panel__field--grow">
        <span>Trésorerie actuelle (€)</span>
        <input
          v-model="treasuryInput"
          type="text"
          inputmode="decimal"
          placeholder="0,00"
        >
      </label>
      <label class="rev-panel__field">
        <span>Taux IS (%)</span>
        <input
          v-model="rateInput"
          type="text"
          inputmode="decimal"
          placeholder="15"
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
