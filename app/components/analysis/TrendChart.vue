<script setup lang="ts">
import { formatEuros, type Cents } from '~~/shared/types/money'
import { formatAxisEuros, niceStep } from '~/utils/axis'

/**
 * Une série unique dans le temps — trésorerie cumulée, ou trajectoire d'une rubrique.
 *
 * Deux usages, un seul composant : dans les deux cas il s'agit de suivre UNE grandeur signée
 * sur les mêmes tranches, avec un zéro de référence. Les distinguer aurait dupliqué le repère,
 * les axes et le tableau pour une différence de libellé.
 *
 * SVG inline, sans bibliothèque (AR21).
 */
const props = withDefaults(defineProps<{
  points: Array<{ bucket: string, label: string, value: number }>
  /** Aire remplie sous la courbe — pertinente pour un cumul, bruyante pour une trajectoire. */
  filled?: boolean
  height?: number
  /** Nom de la grandeur suivie, affiché dans l'infobulle. */
  valueLabel?: string
}>(), { filled: false, height: 180, valueLabel: 'Montant' })

/*
 * Largeur du repère, calée sur la largeur RÉELLE de rendu (conteneur 1 600 px moins ses
 * marges). Un `viewBox` plus étroit que le rendu étire tout ce qu'il contient : à 960, les
 * libellés d'axes en 11 px sortaient à 17 px et le graphique paraissait grossier.
 */
const W = 1552
const PAD = { top: 14, right: 16, bottom: 34, left: 68 }

const plot = computed(() => ({
  w: W - PAD.left - PAD.right,
  h: props.height - PAD.top - PAD.bottom,
}))

/**
 * L'échelle englobe TOUJOURS le zéro, même si la série n'y touche jamais.
 *
 * Sans ça, une trésorerie qui reste négative se dessinerait comme une courbe quelconque : on
 * verrait sa forme sans voir qu'elle est entièrement sous la ligne d'eau, qui est justement
 * l'information.
 */
const bounds = computed(() => {
  const values = props.points.map(p => p.value)
  const max = Math.max(0, ...values)
  const min = Math.min(0, ...values)
  const span = Math.max(1, max - min) * 1.1
  const mid = (max + min) / 2
  return { max: mid + span / 2, min: mid - span / 2, span }
})

const x = (index: number) => {
  const n = Math.max(1, props.points.length - 1)
  return PAD.left + (index / n) * plot.value.w
}
const y = (value: number) =>
  PAD.top + plot.value.h - ((value - bounds.value.min) / bounds.value.span) * plot.value.h

const zeroY = computed(() => y(0))

const linePath = computed(() =>
  props.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(p.value)}`).join(' '),
)

const areaPath = computed(() => {
  if (props.points.length === 0) return ''
  return `${linePath.value} L ${x(props.points.length - 1)} ${zeroY.value} L ${x(0)} ${zeroY.value} Z`
})

const gridLines = computed(() => {
  const step = niceStep(bounds.value.span / 4)
  const first = Math.ceil(bounds.value.min / step) * step
  const lines: Array<{ value: number, y: number, label: string }> = []
  for (let v = first; v <= bounds.value.max; v += step) {
    // Le zéro négatif que produit `ceil(min / step) * step` est neutralisé par le formateur,
    // qui porte cette règle pour tous les axes.
    lines.push({ value: v, y: y(v), label: formatAxisEuros(v) })
  }
  return lines
})

/**
 * Un libellé sur deux quand les tranches sont serrées, décalé depuis la FIN : forcer en plus
 * l'affichage du dernier cassait le rythme et faisait se chevaucher deux libellés voisins.
 */
const tickEvery = computed(() => (props.points.length > 8 ? 2 : 1))
const showTick = (index: number) => (props.points.length - 1 - index) % tickEvery.value === 0

/** Le dernier point est nommé : c'est la valeur qu'on vient chercher. */
const last = computed(() => props.points.at(-1) ?? null)

/**
 * Survol : une bande invisible par tranche, sur toute la hauteur, plutôt que le point lui-même
 * — viser un disque de 3 px n'est pas une interaction. Le tableau reste le support accessible.
 */
const hovered = ref<number | null>(null)

const bands = computed(() =>
  props.points.map((p, i) => {
    const n = Math.max(1, props.points.length - 1)
    const half = plot.value.w / n / 2
    const left = Math.max(PAD.left, x(i) - half)
    const right = Math.min(W - PAD.right, x(i) + half)
    return { key: p.bucket, index: i, x: left, width: Math.max(1, right - left) }
  }),
)

const tip = computed(() => {
  const i = hovered.value
  if (i === null) return null
  const p = props.points[i]
  if (!p) return null
  return {
    left: `${(x(i) / W) * 100}%`,
    anchor: x(i) < W * 0.2 ? 'start' : x(i) > W * 0.8 ? 'end' : 'middle',
    label: p.label,
    value: formatEuros(p.value as Cents),
    negative: p.value < 0,
  }
})
</script>

<template>
  <div class="trend__frame">
    <div
      class="trend__plot"
      @mouseleave="hovered = null"
    >
      <!-- `aria-hidden` : les valeurs vivent dans le tableau, seul support lisible au clavier. -->
      <svg
        class="trend__svg"
        :viewBox="`0 0 ${W} ${height}`"
        :style="{ '--trend-height': `${height}px` }"
        aria-hidden="true"
      >
        <g class="trend__grid">
          <line
            v-for="line in gridLines"
            :key="line.value"
            :x1="PAD.left"
            :x2="W - PAD.right"
            :y1="line.y"
            :y2="line.y"
          />
          <text
            v-for="line in gridLines"
            :key="`t-${line.value}`"
            :x="PAD.left - 8"
            :y="line.y + 4"
            text-anchor="end"
            class="trend__axis-label"
          >{{ line.label }}</text>
        </g>

        <line
          :x1="PAD.left"
          :x2="W - PAD.right"
          :y1="zeroY"
          :y2="zeroY"
          class="trend__zero"
        />

        <path
          v-if="filled"
          :d="areaPath"
          class="trend__area"
        />
        <path
          :d="linePath"
          class="trend__line"
        />

        <circle
          v-for="(p, i) in points"
          :key="p.bucket"
          :cx="x(i)"
          :cy="y(p.value)"
          r="3"
          :class="p.value < 0 ? 'trend__dot trend__dot--negative' : 'trend__dot'"
        />

        <text
          v-for="(p, i) in points"
          v-show="showTick(i)"
          :key="`x-${p.bucket}`"
          :x="x(i)"
          :y="height - 10"
          :text-anchor="i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'"
          class="trend__axis-label"
        >{{ p.label }}</text>

        <text
          v-if="last"
          :x="x(points.length - 1)"
          :y="y(last.value) - 10"
          text-anchor="end"
          class="trend__last"
        >{{ formatEuros(last.value as Cents) }}</text>

        <line
          v-if="hovered !== null"
          :x1="x(hovered)"
          :x2="x(hovered)"
          :y1="PAD.top"
          :y2="PAD.top + plot.h"
          class="trend__guide"
        />
        <circle
          v-if="hovered !== null"
          :cx="x(hovered)"
          :cy="y(points[hovered]!.value)"
          r="5"
          :class="points[hovered]!.value < 0 ? 'trend__dot trend__dot--negative' : 'trend__dot'"
        />

        <rect
          v-for="band in bands"
          :key="`h-${band.key}`"
          :x="band.x"
          :y="PAD.top"
          :width="band.width"
          :height="plot.h"
          class="trend__hit"
          @mouseenter="hovered = band.index"
        />
      </svg>

      <div
        v-if="tip"
        class="trend__tip"
        :data-anchor="tip.anchor"
        :style="{ left: tip.left }"
      >
        <strong>{{ tip.label }}</strong>
        <span>{{ valueLabel }}<b :class="{ 'trend__tip-neg': tip.negative }">{{ tip.value }}</b></span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.trend__frame { overflow-x: auto; }
.trend__plot { position: relative; min-width: 40rem; }
.trend__svg { width: 100%; height: auto; display: block; }
.trend__hit { fill: transparent; }
.trend__guide { stroke: var(--color-text-muted); stroke-width: 1; stroke-dasharray: 3 3; }
.trend__tip {
  position: absolute;
  top: var(--space-2);
  z-index: 1;
  display: grid;
  gap: 2px;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-elevated);
  box-shadow: var(--shadow-overlay);
  font-size: var(--font-size-sm);
  white-space: nowrap;
  pointer-events: none;
}
.trend__tip[data-anchor='middle'] { transform: translateX(-50%); }
.trend__tip[data-anchor='end'] { transform: translateX(-100%); }
.trend__tip span { display: flex; align-items: center; gap: var(--space-3); }
.trend__tip b { margin-left: auto; font-variant-numeric: tabular-nums; }
.trend__tip-neg { color: var(--color-danger); }
.trend__grid line { stroke: var(--color-border); stroke-width: 1; }
.trend__zero { stroke: var(--color-text-muted); stroke-width: 1.5; }
.trend__axis-label { fill: var(--color-text-muted); font-size: 11px; }
.trend__last { fill: var(--color-text); font-size: 12px; font-weight: 600; }
.trend__line { fill: none; stroke: var(--color-accent); stroke-width: 2; }
.trend__area { fill: color-mix(in srgb, var(--color-accent) 18%, transparent); }
.trend__dot { fill: var(--color-accent); }
.trend__dot--negative { fill: var(--color-danger-vivid); }
</style>
