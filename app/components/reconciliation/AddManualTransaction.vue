<script setup lang="ts">
import { eurosToCents, buildAmountCents } from '~~/shared/types/money'
import type { AddManualTransactionInput } from '~~/shared/schemas/reconciliation.schema'

const props = defineProps<{ submitting?: boolean }>()
const emit = defineEmits<{ submit: [tx: AddManualTransactionInput], cancel: [] }>()

/**
 * Le sélecteur propose des POSTES groupés par rubrique, jamais des rubriques.
 *
 * `useCategories()` renvoie l'arbre depuis D17 ; itérer dessus directement posait un code de
 * RUBRIQUE dans `categoryItemCode`, que le pré-check de FK rejetait en 422 « données
 * invalides » — le formulaire était inutilisable, et ça typecheckait parce que rubrique et
 * poste partagent `code` et `label` (revue du 2026-09-05).
 */
const { data: groups, pending: categoriesPending } = useCategories()
const groupsWithItems = computed(() => groups.value.filter(g => g.items.length > 0))

const transactionDate = ref('')
const label = ref('')
const amountInput = ref('')
const direction = ref<'expense' | 'income'>('expense')
const categoryItemCode = ref('')
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
  if (categoryItemCode.value.length === 0) {
    error.value = 'Catégorie requise.'
    return
  }

  const amountCents = buildAmountCents(eurosToCents(eurosAbs), direction.value)

  localSubmitting.value = true
  emit('submit', {
    transactionDate: transactionDate.value,
    label: label.value.trim(),
    amountCents,
    categoryItemCode: categoryItemCode.value,
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
          class="input"
          required
        >
      </label>
      <label class="add-tx__field add-tx__field--grow">
        <span>Libellé</span>
        <input
          v-model="label"
          type="text"
          class="input"
          required
          maxlength="120"
        >
      </label>
    </div>

    <div class="add-tx__row">
      <label class="add-tx__field">
        <span>Sens</span>
        <select
          v-model="direction"
          class="select"
        >
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
          class="input"
          inputmode="decimal"
          placeholder="0,00"
          required
        >
      </label>
      <label class="add-tx__field add-tx__field--grow">
        <span>Catégorie</span>
        <select
          v-model="categoryItemCode"
          class="select"
          required
        >
          <option
            value=""
            disabled
          >
            {{ categoriesPending ? 'Chargement…' : 'Choisir…' }}
          </option>
          <!--
            `<optgroup>` plutôt qu'un libellé aplati : « Restaurant » existe sous Alimentation
            ET sous Voyages (FR19), et le libellé seul ne les distingue pas.
          -->
          <optgroup
            v-for="group in groupsWithItems"
            :key="group.code"
            :label="group.label"
          >
            <option
              v-for="item in group.items"
              :key="item.code"
              :value="item.code"
            >
              {{ item.label }}
            </option>
          </optgroup>
        </select>
      </label>
    </div>

    <p
      v-if="error"
      class="notice"
      role="alert"
    >
      {{ error }}
    </p>

    <div class="add-tx__actions">
      <!--
        `aria-disabled` et non `disabled` : s'il porte le focus au moment de l'envoi, un
        `disabled` natif le fait disparaître et renvoie le clavier au début du document
        (NFR19). La garde du clic vit donc dans le gestionnaire.
      -->
      <button
        type="button"
        class="btn"
        :aria-disabled="submitting || localSubmitting"
        :aria-label="submitting || localSubmitting ? 'Annuler — impossible, enregistrement en cours' : undefined"
        @click="!(submitting || localSubmitting) && $emit('cancel')"
      >
        Annuler
      </button>
      <button
        type="submit"
        class="btn btn--primary"
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
.add-tx__title { margin: 0; font-size: var(--font-size-md); }
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

.add-tx__actions {
  display: flex;
  gap: var(--space-2);
  justify-content: flex-end;
}
</style>
