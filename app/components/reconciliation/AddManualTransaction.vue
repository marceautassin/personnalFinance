<script setup lang="ts">
import { eurosToCents } from '~~/shared/types/money'
import type { AddManualTransactionInput } from '~~/shared/schemas/reconciliation.schema'
import { buildAmountCents } from './amount'

const props = defineProps<{ submitting?: boolean }>()
const emit = defineEmits<{ submit: [tx: AddManualTransactionInput], cancel: [] }>()

const { data: categories, pending: categoriesPending } = useCategories()

const transactionDate = ref('')
const label = ref('')
const amountInput = ref('')
const direction = ref<'expense' | 'income'>('expense')
const categoryCode = ref('')
const error = ref<string | null>(null)
// Garde locale synchrone : la prop `submitting` venant du parent ne se propage qu'au tick suivant,
// double-Enter peut sinon déclencher 2 emits avant que `:disabled` ne s'applique.
const localSubmitting = ref(false)

function parseEuros(input: string): number | null {
  // Strip tout whitespace Unicode (la classe \s couvre U+00A0 NBSP et U+202F espace fine
  // que les claviers FR ou un copier-coller depuis un PDF peuvent insérer).
  const normalized = input.replace(/\s+/gu, '').replace(',', '.')
  if (!/^-?\d+(\.\d{1,2})?$/.test(normalized)) return null
  const n = Number(normalized)
  if (!Number.isFinite(n)) return null
  return n
}

function onSubmit() {
  if (localSubmitting.value) return
  error.value = null

  if (!/^\d{4}-\d{2}-\d{2}$/.test(transactionDate.value)) {
    error.value = 'Date invalide (format YYYY-MM-DD).'
    return
  }
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

  const amountCents = buildAmountCents(eurosToCents(eurosAbs), direction.value)

  localSubmitting.value = true
  emit('submit', {
    transactionDate: transactionDate.value,
    label: label.value.trim(),
    amountCents,
    categoryCode: categoryCode.value,
  })
  // Le parent réinitialise `submitting` à false ; on suit son cycle via watch sur la prop.
}

// Resynchronise localSubmitting avec la prop : quand le parent finit (submitting → false),
// on libère le verrou local pour permettre une nouvelle soumission après une erreur affichée.
watch(() => props.submitting, (val) => {
  if (val === false) localSubmitting.value = false
})
</script>

<template>
  <form
    class="add-tx"
    @submit.prevent="onSubmit"
  >
    <h3 class="add-tx__title">
      Ajouter une transaction manquante
    </h3>

    <div class="add-tx__row">
      <label class="add-tx__field">
        <span>Date</span>
        <input
          v-model="transactionDate"
          type="date"
          required
        >
      </label>
      <label class="add-tx__field add-tx__field--grow">
        <span>Libellé</span>
        <input
          v-model="label"
          type="text"
          required
          maxlength="120"
        >
      </label>
    </div>

    <div class="add-tx__row">
      <label class="add-tx__field">
        <span>Sens</span>
        <select v-model="direction">
          <option value="expense">
            Sortie (-)
          </option>
          <option value="income">
            Entrée (+)
          </option>
        </select>
      </label>
      <label class="add-tx__field">
        <span>Montant (€)</span>
        <input
          v-model="amountInput"
          type="text"
          inputmode="decimal"
          placeholder="0,00"
          required
        >
      </label>
      <label class="add-tx__field add-tx__field--grow">
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
    </div>

    <p
      v-if="error"
      class="add-tx__error"
      role="alert"
    >
      {{ error }}
    </p>

    <div class="add-tx__actions">
      <button
        type="button"
        class="add-tx__btn"
        :disabled="submitting || localSubmitting"
        @click="$emit('cancel')"
      >
        Annuler
      </button>
      <button
        type="submit"
        class="add-tx__btn add-tx__btn--primary"
        :disabled="submitting || localSubmitting"
      >
        {{ (submitting || localSubmitting) ? 'Envoi…' : 'Ajouter' }}
      </button>
    </div>
  </form>
</template>

<style scoped>
.add-tx {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-elevated);
}
.add-tx__title { margin: 0; font-size: var(--font-size-lg); }
.add-tx__row {
  display: flex;
  gap: var(--space-3);
  flex-wrap: wrap;
}
.add-tx__field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  font-size: var(--font-size-sm);
  min-width: 8rem;
}
.add-tx__field--grow { flex: 1 1 12rem; }
.add-tx__field input,
.add-tx__field select {
  padding: var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  font: inherit;
  background: var(--color-bg);
}
.add-tx__error {
  margin: 0;
  padding: var(--space-2) var(--space-3);
  border-left: 3px solid var(--color-danger);
  background: var(--color-bg-elevated);
  border-radius: var(--radius-md);
  color: var(--color-danger);
}
.add-tx__actions {
  display: flex;
  gap: var(--space-2);
  justify-content: flex-end;
}
.add-tx__btn {
  padding: var(--space-2) var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-elevated);
  font: inherit;
  cursor: pointer;
}
.add-tx__btn:disabled { opacity: 0.6; cursor: not-allowed; }
.add-tx__btn--primary {
  background: var(--color-accent);
  color: white;
  border-color: var(--color-accent);
}
.add-tx__btn--primary:hover:not(:disabled) { filter: brightness(1.05); }
</style>
