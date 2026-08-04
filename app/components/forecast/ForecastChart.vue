<script setup lang="ts">
import { formatEuros, type Cents } from '~~/shared/types/money'
import type { ForecastMonth } from '~~/server/services/forecast-engine'

const props = defineProps<{
  months: ForecastMonth[]
  firstNegativeMonth: string | null
}>()

// Géométrie du SVG (unités viewBox ; le rendu est responsive via width:100%).
const W = 800
const H = 260
const PAD_X = 8
const PAD_TOP = 16
const PAD_BOTTOM = 28

const geom = computed(() => {
  const ms = props.months
  const n = ms.length
  if (n === 0) return null
  const balances = ms.map(m => m.endingBalanceCents as number)
  const maxV = Math.max(0, ...balances)
  const minV = Math.min(0, ...balances)
  const span = maxV - minV || 1
  const plotH = H - PAD_TOP - PAD_BOTTOM
  const yOf = (v: number) => PAD_TOP + ((maxV - v) / span) * plotH
  const zeroY = yOf(0)
  const bandW = (W - 2 * PAD_X) / n
  const barW = Math.max(2, bandW * 0.62)

  const bars = ms.map((m, i) => {
    const x = PAD_X + i * bandW + (bandW - barW) / 2
    const y = yOf(Math.max(0, m.endingBalanceCents))
    const yBottom = yOf(Math.min(0, m.endingBalanceCents))
    return {
      month: m.month,
      x,
      y,
      w: barW,
      h: Math.max(1, yBottom - y),
      negative: (m.endingBalanceCents as number) < 0,
      highlight: m.month === props.firstNegativeMonth,
      label: m.month.slice(5), // MM
      value: m.endingBalanceCents as Cents,
    }
  })
  return { bars, zeroY, bandW }
})

const labelStep = computed(() => (props.months.length > 14 ? 3 : props.months.length > 7 ? 2 : 1))
</script>

<template>
  <figure
    class="fc-chart"
    role="img"
    :aria-label="`Projection de trésorerie sur ${months.length} mois`"
  >
    <svg
      v-if="geom"
      :viewBox="`0 0 ${W} ${H}`"
      class="fc-chart__svg"
      preserveAspectRatio="none"
    >
      <!-- ligne de zéro -->
      <line
        :x1="0"
        :x2="W"
        :y1="geom.zeroY"
        :y2="geom.zeroY"
        class="fc-chart__zero"
      />
      <g
        v-for="b in geom.bars"
        :key="b.month"
      >
        <rect
          :x="b.x"
          :y="b.y"
          :width="b.w"
          :height="b.h"
          class="fc-chart__bar"
          :class="{ 'fc-chart__bar--neg': b.negative, 'fc-chart__bar--hl': b.highlight }"
        >
          <title>{{ b.month }} · {{ formatEuros(b.value) }}</title>
        </rect>
      </g>
    </svg>
    <p
      v-else
      class="fc-chart__empty"
    >
      Aucune donnée à projeter.
    </p>

    <figcaption
      v-if="geom"
      class="fc-chart__axis"
      aria-hidden="true"
    >
      <span
        v-for="(b, i) in geom.bars"
        :key="b.month"
        class="fc-chart__tick"
        :style="{ visibility: i % labelStep === 0 ? 'visible' : 'hidden' }"
      >{{ b.label }}</span>
    </figcaption>
  </figure>
</template>

<style scoped>
.fc-chart { margin: 0; display: flex; flex-direction: column; gap: var(--space-1); }
.fc-chart__svg { width: 100%; height: auto; max-width: 100%; display: block; }
.fc-chart__zero { stroke: var(--color-text-muted); stroke-width: 1; stroke-dasharray: 4 4; vector-effect: non-scaling-stroke; }
.fc-chart__bar { fill: var(--color-success, #2e7d32); }
.fc-chart__bar--neg { fill: var(--color-danger); }
.fc-chart__bar--hl { stroke: var(--color-warning, #8a6500); stroke-width: 2; vector-effect: non-scaling-stroke; }
.fc-chart__axis { display: flex; justify-content: space-between; padding: 0 8px; }
.fc-chart__tick { font-size: var(--font-size-xs, 0.7rem); color: var(--color-text-muted); flex: 1; text-align: center; }
.fc-chart__empty { color: var(--color-text-muted); }
</style>
