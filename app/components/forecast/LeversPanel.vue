<script setup lang="ts">
defineProps<{ levers: string[] }>()

/** Codes leviers serveur (FR51) → libellés FR (mapping centralisé côté UI). */
const LEVER_LABELS: Record<string, string> = {
  reduce_expenses: 'Réduire les dépenses',
  increase_revenue: 'Augmenter le CA / facturer plus',
  defer_objectives: 'Décaler les objectifs',
}
</script>

<template>
  <section class="levers">
    <h3 class="levers__title">
      Le dividende requis dépasse la capacité — leviers d'ajustement
    </h3>
    <ul class="levers__list">
      <li
        v-for="code in levers"
        :key="code"
      >
        {{ LEVER_LABELS[code] ?? code }}
      </li>
    </ul>
  </section>
</template>

<style scoped>
.levers { padding: var(--space-3); border: 1px solid var(--color-warning, #8a6500); border-radius: var(--radius-md); background: var(--color-warning-bg, #fff4cc); }
.levers__title { margin: 0 0 var(--space-2); font-size: var(--font-size-sm); color: var(--color-warning, #8a6500); }
.levers__list { margin: 0; padding-left: var(--space-4); font-size: var(--font-size-sm); }
</style>
