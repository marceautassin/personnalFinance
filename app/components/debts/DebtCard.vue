<script setup lang="ts">
import { formatEuros, type Cents } from '~~/shared/types/money'
import { REPAYMENT_MODE_LABELS } from '~/composables/useDebts'
import type { Debt } from '~~/shared/schemas/debt.schema'
import type { NewDebtAdvance } from '~~/shared/schemas/debt-advance.schema'
import DebtAdvanceForm from './DebtAdvanceForm.vue'

const props = defineProps<{
  debt: Debt
  savingAdvance?: boolean
}>()
const emit = defineEmits<{
  edit: [debt: Debt]
  remove: [debt: Debt]
  advance: [debtId: number, payload: NewDebtAdvance]
}>()

const showAdvance = ref(false)

/** Détail du mode : mensualité formatée, date d'échéance, ou rien (libre). */
const modeDetail = computed(() => {
  const d = props.debt
  if (d.repaymentMode === 'monthly' && d.monthlyAmountCents != null)
    return `${formatEuros(d.monthlyAmountCents as Cents)} / mois`
  if (d.repaymentMode === 'lump_sum' && d.lumpSumDate) return `échéance ${d.lumpSumDate}`
  return null
})

function onAdvance(payload: NewDebtAdvance) {
  emit('advance', props.debt.id, payload)
  showAdvance.value = false
}
</script>

<template>
  <article
    class="debt-card"
    :data-testid="`debt-card-${debt.id}`"
  >
    <header class="debt-card__head">
      <h3 class="debt-card__creditor">
        {{ debt.creditor }}
      </h3>
      <span class="debt-card__balance">{{ formatEuros(debt.currentBalanceCents as Cents) }}</span>
    </header>

    <p class="debt-card__mode">
      <span class="debt-card__badge">{{ REPAYMENT_MODE_LABELS[debt.repaymentMode] }}</span>
      <span
        v-if="modeDetail"
        class="debt-card__detail"
      >{{ modeDetail }}</span>
    </p>

    <div class="debt-card__actions">
      <button
        type="button"
        class="debt-card__btn"
        @click="showAdvance = !showAdvance"
      >
        + Avance
      </button>
      <button
        type="button"
        class="debt-card__btn"
        @click="emit('edit', debt)"
      >
        Modifier
      </button>
      <button
        type="button"
        class="debt-card__btn debt-card__btn--danger"
        :aria-label="`Supprimer la dette ${debt.creditor}`"
        @click="emit('remove', debt)"
      >
        Supprimer
      </button>
    </div>

    <DebtAdvanceForm
      v-if="showAdvance"
      :saving="savingAdvance"
      @submit="onAdvance"
      @cancel="showAdvance = false"
    />
  </article>
</template>

<style scoped>
.debt-card {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-4);
  background: var(--color-bg-elevated);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.debt-card__head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: var(--space-2);
}
.debt-card__creditor { margin: 0; font-size: var(--font-size-lg); }
.debt-card__balance {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-bold, 700);
  font-variant-numeric: tabular-nums;
}
.debt-card__mode { margin: 0; display: flex; align-items: center; gap: var(--space-2); }
.debt-card__badge {
  display: inline-block;
  padding: 0 var(--space-2);
  border-radius: var(--radius-sm);
  background: var(--color-neutral-100);
  font-size: var(--font-size-xs, 0.75rem);
  line-height: 1.6;
}
.debt-card__detail { color: var(--color-text-muted); font-size: var(--font-size-sm); }
.debt-card__actions { display: flex; gap: var(--space-2); }
.debt-card__btn {
  padding: var(--space-1) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-elevated);
  font: inherit;
  font-size: var(--font-size-sm);
  cursor: pointer;
}
.debt-card__btn:hover { border-color: var(--color-accent); }
.debt-card__btn--danger:hover { border-color: var(--color-danger); color: var(--color-danger); }
</style>
