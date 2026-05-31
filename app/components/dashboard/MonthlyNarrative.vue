<script setup lang="ts">
// Composant d'affichage pur : reçoit des phrases déjà formatées côté serveur (story 4.1 AC#1).
// N'importe rien de `server/` — consomme uniquement des `string[]`.
defineProps<{
  phrases: string[]
}>()
</script>

<template>
  <div class="narrative">
    <p
      v-if="phrases.length === 0"
      class="narrative__empty"
    >
      Aucun écart marquant ce mois-ci par rapport aux mois précédents.
    </p>
    <ul
      v-else
      class="narrative__list"
    >
      <li
        v-for="(phrase, i) in phrases"
        :key="i"
        class="narrative__item"
        :class="{ 'narrative__item--primary': i === 0 }"
      >
        {{ phrase }}
      </li>
    </ul>
  </div>
</template>

<style scoped>
.narrative {
  padding: var(--space-4);
  background: var(--color-bg-elevated);
  border-radius: var(--radius-md);
}
.narrative__empty {
  margin: 0;
  color: var(--color-text-muted);
}
.narrative__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.narrative__item {
  line-height: var(--line-height-relaxed);
}
.narrative__item--primary {
  font-weight: 600;
}
</style>
