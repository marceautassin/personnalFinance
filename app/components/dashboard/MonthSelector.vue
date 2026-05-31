<script setup lang="ts">
import { computed } from 'vue'
import { useStatementsList } from '~/composables/useStatements'

const props = defineProps<{
  modelValue: string
}>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const { data } = useStatementsList()

// timeZone UTC : le `value` est dérivé de `periodEnd.slice(0,7)` (UTC), le label doit suivre
// le même fuseau sinon value et libellé peuvent diverger d'un mois selon le fuseau local.
const monthFormatter = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' })

/**
 * Mois uniques (YYYY-MM) déduits des relevés ingérés, triés DESC (déjà le cas dans
 * `useStatementsList`). Libellé FR capitalisé via Intl ('avril 2026' → 'Avril 2026').
 */
const monthOptions = computed(() => {
  const seen = new Set<string>()
  const options: Array<{ value: string, label: string }> = []
  for (const s of data.value.statements) {
    const month = s.periodEnd.slice(0, 7)
    if (seen.has(month)) continue
    seen.add(month)
    const label = monthFormatter.format(new Date(`${s.periodEnd}T00:00:00Z`))
    options.push({ value: month, label: label.charAt(0).toUpperCase() + label.slice(1) })
  }
  return options
})

const selected = computed({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value),
})
</script>

<template>
  <label class="month-selector">
    <span class="month-selector__label">Mois</span>
    <select
      v-model="selected"
      class="month-selector__select"
    >
      <option
        v-for="opt in monthOptions"
        :key="opt.value"
        :value="opt.value"
      >
        {{ opt.label }}
      </option>
    </select>
  </label>
</template>

<style scoped>
.month-selector {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
}
.month-selector__label {
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
}
.month-selector__select {
  font: inherit;
  padding: var(--space-1) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-elevated);
  cursor: pointer;
}
.month-selector__select:hover { border-color: var(--color-accent); }
</style>
