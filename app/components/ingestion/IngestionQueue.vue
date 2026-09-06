<script setup lang="ts">
import type { QueueItem } from '~/composables/useIngestionQueue'
import { formatEuros, type Cents } from '~~/shared/types/money'
import { isRetryableErrorCode } from '~/composables/useStatements'

/**
 * File d'ingestion, fichier par fichier (FR2, FR4).
 *
 * Chaque ligne porte son propre état et sa propre cause d'échec : un récapitulatif global
 * (« 3 échecs ») obligerait à rouvrir les 24 fichiers pour savoir lesquels reprendre.
 */
defineProps<{
  items: QueueItem[]
  running: boolean
  counts: { total: number, done: number, success: number, failed: number, skipped: number }
  finished: boolean
}>()

const emit = defineEmits<{
  retry: [id: number]
  cancel: []
  clear: []
}>()

const STATUS_LABELS: Record<QueueItem['status'], string> = {
  'pending': 'En attente',
  'running': 'Traitement…',
  'awaiting-decision': 'Décision requise',
  'success': 'Ingéré',
  'failed': 'Échec',
  'skipped': 'Ignoré',
}
</script>

<template>
  <section
    v-if="items.length > 0"
    class="queue"
    aria-labelledby="queue-heading"
  >
    <header class="queue__header">
      <h3
        id="queue-heading"
        class="queue__title"
      >
        Ingestion
      </h3>
      <p
        class="queue__counter"
        role="status"
        aria-live="polite"
      >
        {{ counts.done }} / {{ counts.total }} traité(s)
        <template v-if="counts.failed > 0">
          · {{ counts.failed }} en échec
        </template>
        <template v-if="counts.skipped > 0">
          · {{ counts.skipped }} ignoré(s)
        </template>
      </p>
      <button
        v-if="running"
        type="button"
        class="btn btn--sm queue__action"
        @click="emit('cancel')"
      >
        Annuler le fichier en cours
      </button>
      <button
        v-else-if="finished"
        type="button"
        class="btn btn--sm queue__action"
        @click="emit('clear')"
      >
        Vider la liste
      </button>
    </header>

    <ol class="queue__list">
      <li
        v-for="item in items"
        :key="item.id"
        class="queue__row"
        :class="`queue__row--${item.status}`"
        :data-testid="`queue-item-${item.name}`"
      >
        <span class="queue__name">{{ item.name }}</span>
        <span class="queue__status">{{ STATUS_LABELS[item.status] }}</span>

        <span
          v-if="item.result"
          class="queue__detail"
        >
          {{ item.result.periodStart }} → {{ item.result.periodEnd }} ·
          {{ item.result.transactionCount }} tx
          <template v-if="!item.result.isBalanced">
            · <NuxtLink :to="`/reconciliation/${item.result.hash}`">
              écart {{ formatEuros(item.result.gapCents as Cents) }}
            </NuxtLink>
          </template>
        </span>

        <!-- La cause vit sur SA ligne : c'est elle qui dit quoi reprendre. -->
        <span
          v-else-if="item.error"
          class="queue__detail queue__detail--error"
        >
          {{ item.error }}
        </span>

        <button
          v-if="item.status === 'failed' && isRetryableErrorCode(item.errorCode)"
          type="button"
          class="btn btn--quiet btn--sm queue__retry"
          :aria-label="running ? `Réessayer ${item.name} — impossible, une ingestion est en cours` : `Réessayer ${item.name}`"
          :aria-disabled="running"
          @click="running ? undefined : emit('retry', item.id)"
        >
          Réessayer
        </button>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.queue { display: flex; flex-direction: column; gap: var(--space-2); }
.queue__header { display: flex; align-items: baseline; gap: var(--space-3); flex-wrap: wrap; }
.queue__title { margin: 0; font-size: var(--font-size-md); }
.queue__counter { margin: 0; color: var(--color-text-muted); font-variant-numeric: tabular-nums; }
.queue__action { margin-left: auto; }
.queue__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.queue__row {
  display: flex;
  align-items: baseline;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--color-border);
  font-size: var(--font-size-sm);
}
.queue__row--running { background: var(--color-neutral-100); }
.queue__row--failed { border-left: 3px solid var(--color-danger); }
.queue__row--success { border-left: 3px solid var(--color-success); }
.queue__row--awaiting-decision { border-left: 3px solid var(--color-accent); }
.queue__name { font-family: var(--font-mono); }
.queue__status { color: var(--color-text-muted); min-width: 8rem; }
.queue__detail { color: var(--color-text-muted); }
.queue__detail--error { color: var(--color-danger); }
.queue__retry { margin-left: auto; }
</style>
