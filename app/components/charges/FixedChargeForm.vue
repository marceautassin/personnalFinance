<script setup lang="ts">
import { eurosToCents, buildAmountCents, centsToEuros, type Cents } from '~~/shared/types/money'
import type { NewFixedCharge } from '~~/shared/schemas/fixed-charge.schema'
import { FREQUENCY_LABELS, type ChargeFormPrefill } from '~/composables/useFixedCharges'

const props = defineProps<{
  submitting?: boolean
  /** Valeurs de préremplissage (charge existante en édition OU suggestion en création). */
  initial?: ChargeFormPrefill | null
  /** true = édition d'une charge existante (titre/bouton « Modifier »). false = création. */
  editing?: boolean
}>()
const emit = defineEmits<{ submit: [charge: NewFixedCharge], cancel: [] }>()

const { data: categories, pending: categoriesPending } = useCategories()

const isEdit = computed(() => props.editing === true)

const label = ref('')
const amountInput = ref('')
const direction = ref<'expense' | 'income'>('expense')
const categoryCode = ref('')
const frequency = ref<NewFixedCharge['frequency']>('monthly')
const startDate = ref('')
const endDate = ref('')
const error = ref<string | null>(null)

/** Préremplit depuis `initial` (édition OU suggestion) ou remet à zéro (ajout vierge). */
function syncFromInitial(c: ChargeFormPrefill | null | undefined) {
  if (!c) {
    reset()
    return
  }
  label.value = c.label
  direction.value = c.amountCents < 0 ? 'expense' : 'income'
  amountInput.value = String(centsToEuros(Math.abs(c.amountCents) as Cents))
  categoryCode.value = c.categoryCode
  frequency.value = c.frequency
  startDate.value = c.startDate
  endDate.value = c.endDate ?? ''
  error.value = null
}

watch(() => props.initial, syncFromInitial, { immediate: true })
// Garde synchrone (cf. AddManualTransaction) : évite le double-emit sur double-Enter.
const localSubmitting = ref(false)

function parseEuros(input: string): number | null {
  const normalized = input.replace(/\s+/gu, '').replace(',', '.')
  if (!/^-?\d+(\.\d{1,2})?$/.test(normalized)) return null
  const n = Number(normalized)
  return Number.isFinite(n) ? n : null
}

function onSubmit() {
  if (localSubmitting.value) return
  error.value = null

  if (label.value.trim().length === 0) {
    error.value = 'Libellé requis.'
    return
  }
  const eurosAbs = parseEuros(amountInput.value)
  if (eurosAbs === null || eurosAbs <= 0) {
    error.value = 'Montant invalide (nombre positif, max 2 décimales).'
    return
  }
  if (categoryCode.value.length === 0) {
    error.value = 'Catégorie requise.'
    return
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate.value)) {
    error.value = 'Date de début invalide (format YYYY-MM-DD).'
    return
  }
  if (endDate.value && endDate.value < startDate.value) {
    error.value = 'La date de fin doit être postérieure ou égale à la date de début.'
    return
  }

  const amountCents = buildAmountCents(eurosToCents(eurosAbs), direction.value)

  localSubmitting.value = true
  emit('submit', {
    label: label.value.trim(),
    amountCents,
    categoryCode: categoryCode.value,
    frequency: frequency.value,
    startDate: startDate.value,
    endDate: endDate.value || null,
  })
}

function reset() {
  label.value = ''
  amountInput.value = ''
  direction.value = 'expense'
  categoryCode.value = ''
  frequency.value = 'monthly'
  startDate.value = ''
  endDate.value = ''
  error.value = null
}

defineExpose({ reset })

// Resync localSubmitting avec la prop parent (cf. AddManualTransaction).
watch(() => props.submitting, (val) => {
  if (val === false) localSubmitting.value = false
})
</script>

<template>
  <form
    class="charge-form"
    @submit.prevent="onSubmit"
  >
    <h3 class="charge-form__title">
      {{ isEdit ? 'Modifier la charge' : 'Ajouter une charge fixe' }}
    </h3>

    <div class="charge-form__row">
      <label class="charge-form__field charge-form__field--grow">
        <span>Libellé</span>
        <input
          v-model="label"
          type="text"
          required
          maxlength="200"
          placeholder="Loyer, abonnement…"
        >
      </label>
      <label class="charge-form__field">
        <span>Sens</span>
        <select v-model="direction">
          <option value="expense">
            Dépense (-)
          </option>
          <option value="income">
            Revenu (+)
          </option>
        </select>
      </label>
      <label class="charge-form__field">
        <span>Montant (€)</span>
        <input
          v-model="amountInput"
          type="text"
          inputmode="decimal"
          placeholder="0,00"
          required
        >
      </label>
    </div>

    <div class="charge-form__row">
      <label class="charge-form__field charge-form__field--grow">
        <span>Catégorie</span>
        <select
          v-model="categoryCode"
          required
        >
          <option
            value=""
            disabled
          >
            {{ categoriesPending ? 'Chargement…' : 'Choisir…' }}
          </option>
          <option
            v-for="cat in categories"
            :key="cat.code"
            :value="cat.code"
          >
            {{ cat.label }}
          </option>
        </select>
      </label>
      <label class="charge-form__field">
        <span>Fréquence</span>
        <select v-model="frequency">
          <option
            v-for="(frLabel, code) in FREQUENCY_LABELS"
            :key="code"
            :value="code"
          >
            {{ frLabel }}
          </option>
        </select>
      </label>
    </div>

    <div class="charge-form__row">
      <label class="charge-form__field">
        <span>Date de début</span>
        <input
          v-model="startDate"
          type="date"
          required
        >
      </label>
      <label class="charge-form__field">
        <span>Date de fin (optionnelle)</span>
        <input
          v-model="endDate"
          type="date"
        >
      </label>
    </div>

    <p
      v-if="error"
      class="charge-form__error"
      role="alert"
    >
      {{ error }}
    </p>

    <div class="charge-form__actions">
      <button
        type="button"
        class="charge-form__btn"
        :disabled="submitting || localSubmitting"
        @click="$emit('cancel')"
      >
        Annuler
      </button>
      <button
        type="submit"
        class="charge-form__btn charge-form__btn--primary"
        :disabled="submitting || localSubmitting"
      >
        {{ (submitting || localSubmitting) ? 'Envoi…' : (isEdit ? 'Enregistrer' : 'Ajouter') }}
      </button>
    </div>
  </form>
</template>

<style scoped>
.charge-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-elevated);
}
.charge-form__title { margin: 0; font-size: var(--font-size-lg); }
.charge-form__row { display: flex; gap: var(--space-3); flex-wrap: wrap; }
.charge-form__field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  font-size: var(--font-size-sm);
  min-width: 8rem;
}
.charge-form__field--grow { flex: 1 1 12rem; }
.charge-form__field input,
.charge-form__field select {
  padding: var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  font: inherit;
  background: var(--color-bg);
}
.charge-form__error {
  margin: 0;
  padding: var(--space-2) var(--space-3);
  border-left: 3px solid var(--color-danger);
  background: var(--color-bg-elevated);
  border-radius: var(--radius-md);
  color: var(--color-danger);
}
.charge-form__actions {
  display: flex;
  gap: var(--space-2);
  justify-content: flex-end;
}
.charge-form__btn {
  padding: var(--space-2) var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-elevated);
  font: inherit;
  cursor: pointer;
}
.charge-form__btn:disabled { opacity: 0.6; cursor: not-allowed; }
.charge-form__btn--primary {
  background: var(--color-accent);
  color: white;
  border-color: var(--color-accent);
}
.charge-form__btn--primary:hover:not(:disabled) { filter: brightness(1.05); }
</style>
