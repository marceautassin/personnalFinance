<script setup lang="ts">
import { DIVIDEND_TAX_MODES, type DividendTaxMode } from '~~/shared/constants/fiscal-defaults'
import { parseRatePct, ratePctToInput } from '~/utils/rate-pct'
import type { TaxSettingsPatch } from '~~/shared/schemas/tax-settings.schema'

const props = defineProps<{
  dividendTaxRatePct: number
  dividendTaxMode: DividendTaxMode
  saving?: boolean
}>()
const emit = defineEmits<{
  save: [patch: TaxSettingsPatch]
}>()

/** Saisie utilisateur en % (0-100, 2 décimales max) ; conversion en pct×100 à la soumission. */
const rateInput = ref('')
const modeInput = ref<DividendTaxMode>('flat_tax')
const error = ref<string | null>(null)

// Pas de taux dans le libellé : il est éditable indépendamment du mode, et un « (30 %) » figé
// contredisait l'affichage dès que l'utilisateur saisissait autre chose (revue 2026-08-04).
const MODE_LABELS: Record<DividendTaxMode, string> = {
  flat_tax: 'Flat tax PFU',
  progressive: 'Barème progressif IR',
}

// `parseRatePct` / `ratePctToInput` viennent de `app/utils/rate-pct.ts` (extrait au lot 1) :
// la copie locale dupliquait la convention pct × 100 et avalait les espaces internes.
const { markDirty, markPristine, syncIfPristine } = useDirtyForm()

// Ne réécrit le champ taux que si sa saisie ne représente PAS déjà la valeur persistée :
// préserve le format utilisateur après un save équivalent au lieu de le normaliser.
function syncFromProps() {
  rateInput.value = parseRatePct(rateInput.value) === props.dividendTaxRatePct
    ? rateInput.value
    : ratePctToInput(props.dividendTaxRatePct)
  modeInput.value = props.dividendTaxMode
  error.value = null
}
watch(
  () => [props.dividendTaxRatePct, props.dividendTaxMode],
  () => syncIfPristine(syncFromProps),
  { immediate: true },
)

function onSubmit() {
  error.value = null
  const rate = parseRatePct(rateInput.value || '')
  if (rate === null) {
    error.value = 'Taux invalide (0 à 100 %, max 2 décimales).'
    return
  }
  markPristine()
  emit('save', {
    dividendTaxRatePct: rate,
    dividendTaxMode: modeInput.value,
  })
}
</script>

<template>
  <form
    class="rev-panel"
    data-testid="tax-settings-form"
    @input="markDirty"
    @submit.prevent="onSubmit"
  >
    <h3 class="rev-panel__title">
      Imposition des dividendes
    </h3>
    <p class="rev-panel__hint">
      Taux et mode appliqués par le forecast pour convertir le dividende brut en net.
    </p>

    <div class="rev-panel__row">
      <label class="rev-panel__field">
        <span>Taux d'imposition (%)</span>
        <input
          v-model="rateInput"
          type="text"
          inputmode="decimal"
          placeholder="30"
        >
      </label>
      <label class="rev-panel__field rev-panel__field--grow">
        <span>Mode d'imposition</span>
        <select v-model="modeInput">
          <option
            v-for="mode in DIVIDEND_TAX_MODES"
            :key="mode"
            :value="mode"
          >
            {{ MODE_LABELS[mode] }}
          </option>
        </select>
      </label>
    </div>

    <p class="tax-form__note">
      Le mode « barème progressif » est déclaratif en V1 : aucune simulation détaillée n'est
      appliquée.
    </p>

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

<style scoped>
.tax-form__note {
  margin: 0;
  padding: var(--space-2) var(--space-3);
  border-left: 3px solid var(--color-border);
  background: var(--color-bg-elevated);
  border-radius: var(--radius-md);
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}
</style>
