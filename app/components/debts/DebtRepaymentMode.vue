<script setup lang="ts">
import { REPAYMENT_MODES, type RepaymentMode } from '~~/shared/types/repayment-mode'
import { REPAYMENT_MODE_LABELS } from '~/composables/useDebts'

/**
 * Sélecteur de mode de remboursement + champ conditionnel (mensualité € / date).
 * `v-model` sur les 3 valeurs pilotées par le parent (`DebtForm`). Les champs hors du mode
 * courant sont vidés à la volée pour rester cohérent avec la validation croisée serveur.
 */
const mode = defineModel<RepaymentMode>('mode', { required: true })
const monthlyEuros = defineModel<string>('monthlyEuros', { required: true })
const lumpSumDate = defineModel<string>('lumpSumDate', { required: true })

function onModeChange() {
  // Vide les champs non applicables au nouveau mode.
  if (mode.value !== 'monthly') monthlyEuros.value = ''
  if (mode.value !== 'lump_sum') lumpSumDate.value = ''
}
</script>

<template>
  <div class="rev-panel__row">
    <label class="rev-panel__field rev-panel__field--grow">
      <span>Mode de remboursement</span>
      <select
        v-model="mode"
        @change="onModeChange"
      >
        <option
          v-for="m in REPAYMENT_MODES"
          :key="m"
          :value="m"
        >
          {{ REPAYMENT_MODE_LABELS[m] }}
        </option>
      </select>
    </label>

    <label
      v-if="mode === 'monthly'"
      class="rev-panel__field"
    >
      <span>Mensualité (€)</span>
      <input
        v-model="monthlyEuros"
        type="text"
        inputmode="decimal"
        placeholder="0,00"
      >
    </label>

    <label
      v-if="mode === 'lump_sum'"
      class="rev-panel__field"
    >
      <span>Date d'échéance</span>
      <input
        v-model="lumpSumDate"
        type="date"
      >
    </label>
  </div>
</template>
