<script setup lang="ts">
import { formatEuros, type Cents } from '~~/shared/types/money'
import { FREQUENCY_LABELS, type FixedChargeItem } from '~/composables/useFixedCharges'

defineProps<{ charges: FixedChargeItem[] }>()
const emit = defineEmits<{ edit: [charge: FixedChargeItem], delete: [id: number] }>()

const { data: categories } = useCategories()
const categoryLabel = computed(() => {
  const map = new Map(categories.value.map(c => [c.code, c.label]))
  return (code: string) => map.get(code) ?? code
})

const pendingDelete = ref<FixedChargeItem | null>(null)

function periodLabel(c: FixedChargeItem): string {
  return c.endDate ? `${c.startDate} → ${c.endDate}` : `Depuis ${c.startDate}`
}

function onConfirmDelete() {
  if (pendingDelete.value) emit('delete', pendingDelete.value.id)
  pendingDelete.value = null
}
</script>

<template>
  <div class="charge-list">
    <table class="charge-list__table">
      <thead>
        <tr>
          <th>Libellé</th>
          <th>Montant</th>
          <th>Fréquence</th>
          <th>Période</th>
          <th>Catégorie</th>
          <th><span class="sr-only">Actions</span></th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="charge in charges"
          :key="charge.id"
        >
          <td>{{ charge.label }}</td>
          <td
            class="charge-list__amount"
            :class="{ 'charge-list__amount--neg': charge.amountCents < 0 }"
          >
            {{ formatEuros(charge.amountCents as Cents) }}
          </td>
          <td>{{ FREQUENCY_LABELS[charge.frequency] }}</td>
          <td class="charge-list__period">
            {{ periodLabel(charge) }}
          </td>
          <td>{{ categoryLabel(charge.categoryCode) }}</td>
          <td class="charge-list__actions">
            <button
              type="button"
              class="charge-list__btn"
              @click="emit('edit', charge)"
            >
              Modifier
            </button>
            <button
              type="button"
              class="charge-list__btn charge-list__btn--danger"
              @click="pendingDelete = charge"
            >
              Supprimer
            </button>
          </td>
        </tr>
      </tbody>
    </table>

    <ConfirmDialog
      :open="pendingDelete !== null"
      title="Supprimer la charge ?"
      :message="pendingDelete ? `La charge « ${pendingDelete.label} » sera définitivement supprimée. Continuer ?` : ''"
      confirm-label="Supprimer"
      @confirm="onConfirmDelete"
      @cancel="pendingDelete = null"
    />
  </div>
</template>

<style scoped>
.charge-list { overflow-x: auto; }
.charge-list__table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--font-size-sm);
}
.charge-list__table th,
.charge-list__table td {
  padding: var(--space-2) var(--space-3);
  text-align: left;
  border-bottom: 1px solid var(--color-border);
}
.charge-list__table th {
  color: var(--color-text-muted);
  font-weight: 500;
}
.charge-list__amount {
  font-variant-numeric: tabular-nums;
  font-weight: 500;
  color: var(--color-success);
}
.charge-list__amount--neg { color: var(--color-danger); }
.charge-list__period { color: var(--color-text-muted); font-variant-numeric: tabular-nums; }
.charge-list__actions {
  display: flex;
  gap: var(--space-2);
  justify-content: flex-end;
}
.charge-list__btn {
  padding: var(--space-1) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-elevated);
  font: inherit;
  font-size: var(--font-size-sm);
  cursor: pointer;
}
.charge-list__btn:hover { border-color: var(--color-accent); }
.charge-list__btn--danger:hover { border-color: var(--color-danger); color: var(--color-danger); }
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
