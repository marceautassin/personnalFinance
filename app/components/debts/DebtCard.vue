<script setup lang="ts">
import { formatEuros, type Cents } from '~~/shared/types/money'
import { REPAYMENT_MODE_LABELS } from '~/composables/useDebts'
import type { Debt } from '~~/shared/schemas/debt.schema'
import type { NewDebtEvent } from '~~/shared/schemas/debt-event.schema'
import DebtEventForm from './DebtEventForm.vue'
import DebtProjectedExpense from './DebtProjectedExpense.vue'

const props = defineProps<{
  debt: Debt
  savingEvent?: boolean
}>()
const emit = defineEmits<{
  edit: [debt: Debt]
  remove: [debt: Debt]
  event: [debtId: number, payload: NewDebtEvent]
}>()

const showEventForm = ref(false)
const showImpact = ref(false)

/**
 * Un solde négatif est une CRÉANCE (on me doit), pas une anomalie d'affichage. Il devient
 * possible depuis le ledger signé (story 6.5, D16) ; auparavant il ne pouvait provenir que
 * d'un sur-remboursement et s'affichait tel quel, sans rien indiquer (revue du 2026-09-04).
 */
const isCredit = computed(() => props.debt.currentBalanceCents < 0)
const balanceLabel = computed(() => (isCredit.value ? 'Créance' : 'Dette'))
const balanceAbs = computed(() => Math.abs(props.debt.currentBalanceCents) as Cents)

/** Détail du mode : mensualité formatée, date d'échéance, ou rien (libre). */
const modeDetail = computed(() => {
  const d = props.debt
  if (d.repaymentMode === 'monthly' && d.monthlyAmountCents != null)
    return `${formatEuros(d.monthlyAmountCents as Cents)} / mois`
  if (d.repaymentMode === 'lump_sum' && d.lumpSumDate) return `échéance ${d.lumpSumDate}`
  return null
})

function onEvent(payload: NewDebtEvent) {
  emit('event', props.debt.id, payload)
  showEventForm.value = false
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
      <span
        class="debt-card__balance"
        :class="{ 'debt-card__balance--credit': isCredit }"
        :data-testid="`debt-balance-${debt.id}`"
      >
        <span class="debt-card__balance-kind">{{ balanceLabel }}</span>
        {{ formatEuros(balanceAbs) }}
      </span>
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
        @click="showEventForm = !showEventForm"
      >
        + Mouvement
      </button>
      <button
        type="button"
        class="debt-card__btn"
        @click="showImpact = !showImpact"
      >
        Impact
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

    <DebtEventForm
      v-if="showEventForm"
      :saving="savingEvent"
      @submit="onEvent"
      @cancel="showEventForm = false"
    />

    <DebtProjectedExpense
      v-if="showImpact"
      :debt-id="debt.id"
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
.debt-card__balance--credit { color: var(--color-success, #1a7f37); }
.debt-card__balance-kind {
  font-size: var(--font-size-xs, 0.75rem);
  font-weight: normal;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
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
/*
 * `flex-wrap` obligatoire : les 4 boutons ne tiennent pas dans la largeur d'une carte de la
 * grille (296px au format desktop). Sans lui, le dernier — « Supprimer » — débordait de ~79px
 * SOUS la carte voisine, qui interceptait le clic en son centre : le bouton était visuellement
 * de travers et partiellement inutilisable. Découvert à la recette visuelle du 2026-09-04 ;
 * aucun test ne pouvait le voir, l'E2E ciblant les boutons par leur nom accessible.
 */
.debt-card__actions { display: flex; flex-wrap: wrap; gap: var(--space-2); }
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
