<script setup lang="ts">
defineProps<{ active: boolean }>()
const emit = defineEmits<{ cancel: [] }>()
</script>

<template>
  <div
    v-if="active"
    class="progress"
    role="status"
    aria-live="polite"
  >
    <div
      class="progress__spinner"
      aria-hidden="true"
    />
    <p class="progress__text">
      Traitement en cours… cela peut prendre jusqu'à <strong>30 secondes</strong>
      (extraction du PDF, catégorisation, réconciliation).
    </p>
    <button
      type="button"
      class="btn btn--sm progress__cancel"
      @click="emit('cancel')"
    >
      Annuler
    </button>
  </div>
</template>

<style scoped>
.progress {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3);
  background: var(--color-accent-subtle);
  border-radius: var(--radius-md);
  border-left: 3px solid var(--color-accent);
}
.progress__spinner {
  width: 18px;
  height: 18px;
  border: 2px solid var(--color-border);
  border-top-color: var(--color-accent);
  border-radius: var(--radius-full);
  animation: spin 1s linear infinite;
  flex-shrink: 0;
}
@keyframes spin { to { transform: rotate(360deg); } }
.progress__text {
  font-size: var(--font-size-sm);
  flex: 1;
}
.progress__cancel { flex-shrink: 0; }

@media (prefers-reduced-motion: reduce) {
  .progress__spinner { animation: none; }
}
</style>
