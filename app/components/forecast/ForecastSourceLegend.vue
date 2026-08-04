<script setup lang="ts">
// Légende des 4 sources du forecast (FR43). Codes → libellés FR + couleur.
const SOURCES = [
  { key: 'income', label: 'Revenu', color: 'var(--color-success, #2e7d32)' },
  { key: 'fixed', label: 'Charge fixe déclarée', color: 'var(--color-accent, #3a6ea5)' },
  { key: 'variable', label: 'Variable extrapolée', color: 'var(--color-text-muted)' },
  { key: 'punctual', label: 'Ponctuelle planifiée', color: 'var(--color-danger)' },
] as const
</script>

<template>
  <ul
    class="src-legend"
    aria-label="Sources du forecast"
  >
    <li
      v-for="s in SOURCES"
      :key="s.key"
      class="src-legend__item"
    >
      <span
        class="src-legend__swatch"
        :style="{ background: s.color }"
        aria-hidden="true"
      />
      {{ s.label }}
    </li>
  </ul>
</template>

<style scoped>
.src-legend { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: var(--space-3); font-size: var(--font-size-xs, 0.75rem); color: var(--color-text-muted); }
.src-legend__item { display: inline-flex; align-items: center; gap: var(--space-1); }
.src-legend__swatch { width: 0.75rem; height: 0.75rem; border-radius: 2px; display: inline-block; }
</style>
