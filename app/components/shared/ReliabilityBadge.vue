<script setup lang="ts">
import type { ReliabilityValue } from '~~/server/db/schema'

const props = withDefaults(defineProps<{
  reliability: ReliabilityValue | null
  compact?: boolean
}>(), {
  compact: false,
})

const label = computed(() => {
  if (props.reliability === 'unreliable') return 'Mois non fiable'
  if (props.reliability === 'reliable') return 'Mois fiable'
  return null
})
</script>

<template>
  <span
    v-if="label"
    class="rel-badge"
    :class="{
      'rel-badge--unreliable': reliability === 'unreliable',
      'rel-badge--reliable': reliability === 'reliable',
      'rel-badge--compact': compact,
    }"
    role="status"
    :aria-label="label"
    :title="compact ? label : undefined"
  >
    <span
      class="rel-badge__icon"
      aria-hidden="true"
    >
      {{ reliability === 'unreliable' ? '⚠️' : '✓' }}
    </span>
    <span
      v-if="!compact"
      class="rel-badge__text"
    >{{ label }}</span>
  </span>
</template>

<style scoped>
.rel-badge {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-full);
  font-size: var(--font-size-sm);
  font-weight: 500;
  line-height: 1;
}
.rel-badge--unreliable {
  background: var(--color-danger);
  color: white;
}
.rel-badge--reliable {
  background: color-mix(in srgb, var(--color-success) 15%, var(--color-bg-elevated));
  color: var(--color-success);
}
.rel-badge--compact {
  padding: var(--space-1);
}
.rel-badge__icon { font-size: var(--font-size-sm); }
</style>
