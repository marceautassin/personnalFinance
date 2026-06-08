<script setup lang="ts">
import { formatEuros, type Cents } from '~~/shared/types/money'
import type { Suggestion } from '~~/server/services/charge-suggester'
import { FREQUENCY_LABELS } from '~/composables/useFixedCharges'

defineProps<{ suggestions: Suggestion[], busy?: boolean }>()
const emit = defineEmits<{
  accept: [suggestion: Suggestion]
  edit: [suggestion: Suggestion]
  dismiss: [normalizedLabel: string]
}>()
</script>

<template>
  <section
    v-if="suggestions.length > 0"
    class="suggest"
  >
    <h3 class="suggest__title">
      Suggestions de charges récurrentes
    </h3>
    <p class="suggest__hint">
      Détectées dans ton historique. Accepte, ajuste ou rejette.
    </p>

    <ul class="suggest__list">
      <li
        v-for="s in suggestions"
        :key="s.normalizedLabel"
        class="suggest__item"
      >
        <div class="suggest__info">
          <span class="suggest__label">{{ s.sampleLabel }}</span>
          <span
            class="suggest__amount"
            :class="{ 'suggest__amount--neg': s.averageAmountCents < 0 }"
          >
            {{ formatEuros(s.averageAmountCents as Cents) }}
          </span>
          <span class="suggest__meta">
            {{ FREQUENCY_LABELS[s.suggestedFrequency] }} · vu sur {{ s.occurrences }} mois
          </span>
        </div>
        <div class="suggest__actions">
          <button
            type="button"
            class="suggest__btn suggest__btn--primary"
            :disabled="busy"
            @click="emit('accept', s)"
          >
            Accepter
          </button>
          <button
            type="button"
            class="suggest__btn"
            :disabled="busy"
            @click="emit('edit', s)"
          >
            Modifier
          </button>
          <button
            type="button"
            class="suggest__btn suggest__btn--ghost"
            :disabled="busy"
            @click="emit('dismiss', s.normalizedLabel)"
          >
            Rejeter
          </button>
        </div>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.suggest {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-4);
  border: 1px solid var(--color-border);
  border-left: 3px solid var(--color-accent);
  border-radius: var(--radius-md);
  background: var(--color-bg-elevated);
}
.suggest__title { margin: 0; font-size: var(--font-size-lg); }
.suggest__hint { margin: 0; color: var(--color-text-muted); font-size: var(--font-size-sm); }
.suggest__list { list-style: none; margin: var(--space-2) 0 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-2); }
.suggest__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  flex-wrap: wrap;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-bg);
}
.suggest__info { display: flex; flex-direction: column; gap: 2px; }
.suggest__label { font-weight: 500; }
.suggest__amount { font-variant-numeric: tabular-nums; color: var(--color-success); }
.suggest__amount--neg { color: var(--color-danger); }
.suggest__meta { color: var(--color-text-muted); font-size: var(--font-size-sm); }
.suggest__actions { display: flex; gap: var(--space-2); }
.suggest__btn {
  padding: var(--space-1) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-elevated);
  font: inherit;
  font-size: var(--font-size-sm);
  cursor: pointer;
}
.suggest__btn:disabled { opacity: 0.6; cursor: not-allowed; }
.suggest__btn--primary {
  background: var(--color-accent);
  color: white;
  border-color: var(--color-accent);
}
.suggest__btn--primary:hover:not(:disabled) { filter: brightness(1.05); }
.suggest__btn--ghost:hover:not(:disabled) { border-color: var(--color-danger); color: var(--color-danger); }
</style>
