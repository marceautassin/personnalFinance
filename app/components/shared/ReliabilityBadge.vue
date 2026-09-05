<script setup lang="ts">
import type { StatementReliability } from '~~/shared/types/statement-reliability'
import { RELIABILITY_LABELS } from '~~/shared/types/statement-reliability'
import { formatEuros, type Cents } from '~~/shared/types/money'

/**
 * Trois états, trois messages — et la distinction entre les deux derniers est le sujet.
 *
 * « Écart non examiné » et « écart accepté » décrivent le même trou dans les chiffres, mais
 * pas la même situation : dans un cas personne ne l'a regardé, dans l'autre l'utilisateur l'a
 * assumé. Les rendre identiques revenait à effacer sa décision — et à lui faire rouvrir en
 * novembre trois mois dont il ne sait plus s'il les a déjà traités.
 */
const props = withDefaults(defineProps<{
  reliability: StatementReliability | null
  /** Écart en centimes, affiché quand il est connu. Un chiffre vaut mieux qu'un avertissement. */
  gapCents?: Cents | null
  compact?: boolean
}>(), {
  gapCents: null,
  compact: false,
})

const label = computed(() => {
  if (!props.reliability) return null
  const base = RELIABILITY_LABELS[props.reliability]
  if (props.reliability === 'reliable' || props.gapCents === null || props.gapCents === 0) return base
  return `${base} — ${formatEuros(props.gapCents)}`
})

const ICONS: Record<StatementReliability, string> = {
  reliable: '✓',
  gap_unreviewed: '⚠️',
  gap_accepted: '≈',
}
</script>

<template>
  <span
    v-if="label && reliability"
    class="rel-badge"
    :class="`rel-badge--${reliability}`"
    role="status"
    :aria-label="label"
    :title="compact ? label : undefined"
  >
    <span
      class="rel-badge__icon"
      aria-hidden="true"
    >{{ ICONS[reliability] }}</span>
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
  white-space: nowrap;
}
.rel-badge--reliable {
  background: color-mix(in srgb, var(--color-success) 15%, var(--color-bg-elevated));
  color: var(--color-success);
}
/* Non examiné : le seul état vraiment alarmant — personne n'a encore regardé. */
.rel-badge--gap_unreviewed {
  background: var(--color-danger);
  color: white;
}
/* Assumé : signalé mais pas alarmant. L'utilisateur a tranché, on le lui rappelle sans crier. */
.rel-badge--gap_accepted {
  background: color-mix(in srgb, var(--color-warning, #b45309) 15%, var(--color-bg-elevated));
  color: var(--color-warning, #b45309);
}
.rel-badge--compact { padding: var(--space-1); }
.rel-badge__icon { font-size: var(--font-size-sm); }
</style>
