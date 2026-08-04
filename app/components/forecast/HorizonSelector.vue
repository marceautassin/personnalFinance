<script setup lang="ts">
defineProps<{ horizon: number }>()
const emit = defineEmits<{ 'update:horizon': [value: number] }>()

const HORIZONS = [6, 12, 24] as const
</script>

<template>
  <div
    class="horizon"
    role="group"
    aria-label="Horizon de projection"
  >
    <button
      v-for="h in HORIZONS"
      :key="h"
      type="button"
      class="horizon__btn"
      :class="{ 'horizon__btn--active': h === horizon }"
      :aria-pressed="h === horizon"
      @click="emit('update:horizon', h)"
    >
      {{ h }} mois
    </button>
  </div>
</template>

<style scoped>
.horizon { display: inline-flex; gap: var(--space-1); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 2px; }
.horizon__btn {
  padding: var(--space-1) var(--space-3);
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  font: inherit;
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
  cursor: pointer;
}
.horizon__btn--active { background: var(--color-accent); color: white; }
</style>
