<script setup lang="ts">
import type { Cents } from '~~/shared/types/money'
import { parseEurosToCents, syncEurosInput } from '~/utils/euros'
import { parseRatePct, ratePctToInput, MAX_SAS_CENTS } from '~/utils/rate-pct'
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
  /**
   * Émis à chaque saisie : valeurs cents courantes pour le recalcul live de la card, ou
   * `null` si une saisie est invalide ou hors bornes (la card affiche alors « indisponible »
   * au lieu d'une estimation calculée sur des zéros implicites).
   */
  change: [live: SasConfigInput | null]
  save: [patch: SasConfigPatch]
}>()

const revenueInput = ref('')
const expensesInput = ref('')
const treasuryInput = ref('')
const rateInput = ref('')
const error = ref<string | null>(null)

const { markDirty, markPristine, syncIfPristine } = useDirtyForm()

function syncFromProps() {
  revenueInput.value = syncEurosInput(revenueInput.value, props.revenueForecastCents)
  expensesInput.value = syncEurosInput(expensesInput.value, props.expensesForecastCents)
  treasuryInput.value = syncEurosInput(treasuryInput.value, props.currentTreasuryCents)
  // 0 % est une valeur significative : on l'affiche, on ne le confond pas avec « non saisi ».
  rateInput.value = parseRatePct(rateInput.value) === props.isRatePct
    ? rateInput.value
    : ratePctToInput(props.isRatePct)
  error.value = null
}
watch(
  () => [props.revenueForecastCents, props.expensesForecastCents, props.currentTreasuryCents, props.isRatePct],
  () => syncIfPristine(syncFromProps),
  { immediate: true },
)

/**
 * Valeurs cents courantes pour le recalcul live de la card, ou `null` si une saisie est
 * invalide ou hors bornes. On ne substitue PAS 0 à une saisie invalide : la card afficherait
 * un montant financier faux comme une estimation valide (revue 2026-08-04). Hors du domaine
 * garanti du schéma, `computeDividendCapacity` perdrait aussi son exactitude au centime.
 */
const liveInput = computed<SasConfigInput | null>(() => {
  const revenue = parseEurosToCents(revenueInput.value || '0')
  const expenses = parseEurosToCents(expensesInput.value || '0')
  const treasury = parseEurosToCents(treasuryInput.value || '0')
  const rate = parseRatePct(rateInput.value || '0')
  if (revenue === null || expenses === null || treasury === null || rate === null) return null
  if (revenue > MAX_SAS_CENTS || expenses > MAX_SAS_CENTS || treasury > MAX_SAS_CENTS) return null
  return {
    revenueForecastCents: revenue,
    expensesForecastCents: expenses,
    currentTreasuryCents: treasury,
    isRatePct: rate,
  }
})
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
  if (revenue > MAX_SAS_CENTS || expenses > MAX_SAS_CENTS || treasury > MAX_SAS_CENTS) {
    error.value = 'Montant trop élevé (max 10 000 000 000 €).'
    return
  }
  if (rate === null) {
    error.value = 'Taux IS invalide (0 à 100 %, max 2 décimales).'
    return
  }
  markPristine()
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
    data-testid="sas-config-form"
    @input="markDirty"
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
        <!-- Cette trésorerie est ajoutée au résultat APRÈS IS : y inclure le résultat de
             l'exercice en cours le compterait deux fois (cf. dividend-capacity.ts). -->
        <span>Report à nouveau (€)</span>
        <input
          v-model="treasuryInput"
          type="text"
          inputmode="decimal"
          placeholder="0,00"
        >
        <small class="rev-panel__hint">
          Trésorerie hors résultat de l'exercice en cours (bénéfices non distribués des
          exercices antérieurs).
        </small>
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
