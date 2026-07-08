<script setup lang="ts">
import { useDebtsList } from '~/composables/useDebts'
import type { TransactionListItem } from '~/composables/useTransactions'

const props = defineProps<{
  transaction: TransactionListItem
}>()
const emit = defineEmits<{
  mark: [debtId: number]
  unmark: []
}>()

// Liste des dettes en lecture seule (dédup par `key: 'debts'` avec la page Dettes).
const { data: debts } = useDebtsList()

const selectedDebtId = ref<number | null>(null)
const open = ref(false)

// Créancier de la dette liée (affichage quand la transaction est déjà marquée).
const linkedCreditor = computed(() => {
  const d = debts.value.find(x => x.id === props.transaction.debtId)
  return d?.creditor ?? `dette #${props.transaction.debtId}`
})

function confirmMark() {
  if (selectedDebtId.value == null) return
  emit('mark', selectedDebtId.value)
  open.value = false
  selectedDebtId.value = null
}
</script>

<template>
  <div class="debt-marker">
    <!-- Déjà marquée : créancier lié + démarquer -->
    <template v-if="transaction.isDebtRepayment">
      <span class="debt-marker__linked">↳ {{ linkedCreditor }}</span>
      <button
        type="button"
        class="debt-marker__btn"
        @click="emit('unmark')"
      >
        Démarquer
      </button>
    </template>

    <!-- Non marquée : ouvrir un sélecteur de dette -->
    <template v-else-if="open">
      <select
        v-model="selectedDebtId"
        class="debt-marker__select"
        :aria-label="`Rattacher à une dette`"
      >
        <option
          :value="null"
          disabled
        >
          Choisir une dette…
        </option>
        <option
          v-for="d in debts"
          :key="d.id"
          :value="d.id"
        >
          {{ d.creditor }}
        </option>
      </select>
      <button
        type="button"
        class="debt-marker__btn"
        :disabled="selectedDebtId == null"
        @click="confirmMark"
      >
        OK
      </button>
      <button
        type="button"
        class="debt-marker__btn debt-marker__btn--ghost"
        @click="open = false"
      >
        Annuler
      </button>
    </template>

    <template v-else>
      <button
        type="button"
        class="debt-marker__btn"
        :disabled="debts.length === 0"
        :title="debts.length === 0 ? 'Aucune dette : créez-en une dans Dettes' : 'Marquer comme remboursement de dette'"
        @click="open = true"
      >
        Marquer remb.
      </button>
    </template>
  </div>
</template>

<style scoped>
.debt-marker {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  flex-wrap: wrap;
}
.debt-marker__linked { color: var(--color-text-muted); font-size: var(--font-size-xs); }
.debt-marker__select {
  font: inherit;
  font-size: var(--font-size-xs);
  padding: 0 var(--space-1);
}
.debt-marker__btn {
  padding: 1px var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-bg-elevated);
  font: inherit;
  font-size: var(--font-size-xs);
  cursor: pointer;
}
.debt-marker__btn:hover:not(:disabled) { border-color: var(--color-accent); }
.debt-marker__btn:disabled { opacity: 0.5; cursor: not-allowed; }
.debt-marker__btn--ghost { color: var(--color-text-muted); }
</style>
