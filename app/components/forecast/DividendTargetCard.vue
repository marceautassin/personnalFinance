<script setup lang="ts">
import { formatEuros, type Cents } from '~~/shared/types/money'
import type { RequiredDividend } from '~~/server/services/dividend-calculator'

const props = defineProps<{
  dividend: RequiredDividend
  /** Mois de la prochaine AG (YYYY-MM). */
  agMonth: string
}>()

const grossLabel = computed(() =>
  props.dividend.requiredGrossCents === null ? '—' : formatEuros(props.dividend.requiredGrossCents as Cents),
)
const marginLabel = computed(() =>
  props.dividend.marginCents === null ? '—' : formatEuros(props.dividend.marginCents as Cents),
)
</script>

<template>
  <section class="div-card">
    <header class="div-card__head">
      <h3 class="div-card__title">
        Dividende à voter
      </h3>
      <span class="div-card__ag">AG {{ agMonth }}</span>
    </header>

    <dl class="div-card__grid">
      <div class="div-card__row">
        <dt>Net requis</dt>
        <dd data-testid="dividend-net">
          {{ formatEuros(dividend.requiredNetCents) }}
        </dd>
      </div>
      <div class="div-card__row">
        <dt>Brut correspondant</dt>
        <dd>{{ grossLabel }}</dd>
      </div>
      <div class="div-card__row">
        <dt>Capacité dividendable</dt>
        <dd>{{ formatEuros(dividend.capacityGrossCents) }}</dd>
      </div>
      <div class="div-card__row">
        <dt>Marge</dt>
        <dd
          :class="{
            'div-card__neg': dividend.marginCents !== null && dividend.marginCents < 0,
            'div-card__pos': dividend.marginCents !== null && dividend.marginCents >= 0,
          }"
        >
          {{ marginLabel }}
        </dd>
      </div>
    </dl>

    <p
      class="div-card__status"
      :class="dividend.fitsCapacity ? 'div-card__status--ok' : 'div-card__status--warn'"
    >
      {{ dividend.requiredNetCents === 0
        ? 'Trésorerie positive sur l\'horizon : aucun dividende requis.'
        : dividend.fitsCapacity
          ? 'Le dividende requis tient dans la capacité dividendable.'
          : 'Le dividende requis dépasse la capacité dividendable.' }}
    </p>
  </section>
</template>

<style scoped>
.div-card { border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: var(--space-4); background: var(--color-bg-elevated); display: flex; flex-direction: column; gap: var(--space-3); }
.div-card__head { display: flex; justify-content: space-between; align-items: baseline; }
.div-card__title { margin: 0; font-size: var(--font-size-lg); }
.div-card__ag { font-size: var(--font-size-sm); color: var(--color-text-muted); }
.div-card__grid { margin: 0; display: grid; gap: var(--space-2); }
.div-card__row { display: flex; justify-content: space-between; gap: var(--space-3); }
.div-card__row dt { color: var(--color-text-muted); }
.div-card__row dd { margin: 0; font-variant-numeric: tabular-nums; font-weight: var(--font-weight-medium, 500); }
.div-card__neg { color: var(--color-danger); }
.div-card__pos { color: var(--color-success, #2e7d32); }
.div-card__status { margin: 0; padding: var(--space-2) var(--space-3); border-radius: var(--radius-md); font-size: var(--font-size-sm); }
.div-card__status--ok { background: var(--color-success-bg, #e6f4ea); color: var(--color-success, #2e7d32); }
.div-card__status--warn { background: var(--color-warning-bg, #fff4cc); color: var(--color-warning, #8a6500); }
</style>
