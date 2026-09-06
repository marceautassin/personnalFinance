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

/**
 * Trois états, trois variantes du badge partagé. « Non examiné » est le seul vraiment alarmant
 * — personne n'a encore regardé ; « accepté » est signalé sans crier, l'utilisateur a tranché.
 */
const BADGE_CLASS: Record<StatementReliability, string> = {
  reliable: 'badge--ok',
  gap_unreviewed: 'badge--alert',
  gap_accepted: 'badge--warn',
}
</script>

<template>
  <span
    v-if="label && reliability"
    class="badge"
    :class="BADGE_CLASS[reliability]"
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
/* Le badge vient de `components.css` — les trois variantes aussi. Ne reste ici que la taille
   de l'icône, qui doit rester lisible quand le libellé est masqué. */
.rel-badge__icon { font-size: var(--font-size-sm); line-height: 1; }
</style>
