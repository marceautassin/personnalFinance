<script setup lang="ts">
import { formatEuros, type Cents } from '~~/shared/types/money'
import type { AnalysisResponse } from '~/composables/useAnalysis'

const props = defineProps<{
  series: AnalysisResponse['series']
}>()

/**
 * Graphique en SVG inline, sans bibliothèque tierce (AR21).
 *
 * Le repère est en coordonnées relatives (`viewBox` de 100×100, `preserveAspectRatio="none"`),
 * ce qui laisse le CSS gérer la taille réelle : aucun calcul de largeur au montage, donc aucun
 * décalage au premier rendu ni au redimensionnement.
 */
const WIDTH = 100
const HEIGHT = 100

/**
 * Échelle SYMÉTRIQUE autour de zéro, avec une marge.
 *
 * Une échelle calée sur les extrêmes réels donnait, sur une série d'un seul point, une barre
 * occupant toute la hauteur du cadre — visuellement absurde et impossible à comparer d'une
 * période à l'autre. La symétrie garde aussi le zéro au milieu, ce qui rend un déficit
 * immédiatement lisible.
 */
const bounds = computed(() => {
  const peak = Math.max(1, ...props.series.map(p => Math.abs(p.resultCents)))
  const max = peak * 1.15
  return { max, min: -max, span: max * 2 }
})

/** Ordonnée du zéro : la barre part de là, vers le haut ou vers le bas. */
const zeroY = computed(() => ((bounds.value.max - 0) / bounds.value.span) * HEIGHT)

const barWidth = computed(() => (props.series.length === 0 ? 0 : WIDTH / props.series.length))

const bars = computed(() =>
  props.series.map((point, index) => {
    const y = ((bounds.value.max - point.resultCents) / bounds.value.span) * HEIGHT
    const top = Math.min(y, zeroY.value)
    const height = Math.max(0.6, Math.abs(y - zeroY.value))
    return {
      ...point,
      x: index * barWidth.value + barWidth.value * 0.15,
      width: barWidth.value * 0.7,
      y: top,
      height,
      deficit: point.resultCents < 0,
    }
  }),
)
</script>

<template>
  <section class="evo">
    <h3 class="evo__title">
      Évolution
    </h3>

    <p
      v-if="series.length === 0"
      class="evo__empty"
    >
      Aucune donnée sur la période.
    </p>

    <template v-else>
      <!-- `overflow-x: auto` sur le conteneur : une série longue défile dans son cadre,
           la page ne défile jamais horizontalement. -->
      <div class="evo__frame">
        <svg
          class="evo__svg"
          :viewBox="`0 0 ${WIDTH} ${HEIGHT}`"
          preserveAspectRatio="none"
          role="img"
          :aria-label="`Trésorerie par période, ${series.length} tranche(s)`"
        >
          <line
            x1="0"
            :y1="zeroY"
            :x2="WIDTH"
            :y2="zeroY"
            class="evo__axis"
            vector-effect="non-scaling-stroke"
          />
          <rect
            v-for="bar in bars"
            :key="bar.bucket"
            :x="bar.x"
            :y="bar.y"
            :width="bar.width"
            :height="bar.height"
            :class="bar.deficit ? 'evo__bar evo__bar--deficit' : 'evo__bar'"
          />
        </svg>
      </div>

      <!--
        Le graphique porte la forme, le tableau porte les chiffres. Un SVG seul laisserait
        les valeurs illisibles au clavier et au lecteur d'écran.
      -->
      <ol class="evo__legend">
        <li
          v-for="point in series"
          :key="point.bucket"
          class="evo__legend-item"
        >
          <span>{{ point.label }}</span>
          <span
            class="evo__legend-value"
            :class="{ 'evo__legend-value--deficit': point.resultCents < 0 }"
          >{{ formatEuros(point.resultCents as Cents) }}</span>
          <span class="evo__legend-cumul">cumul {{ formatEuros(point.cumulativeResultCents as Cents) }}</span>
        </li>
      </ol>
    </template>
  </section>
</template>

<style scoped>
.evo { display: flex; flex-direction: column; gap: var(--space-2); }
.evo__title { margin: 0; font-size: var(--font-size-lg); }
.evo__empty { color: var(--color-text-muted); margin: 0; }
.evo__frame { overflow-x: auto; }
.evo__svg { width: 100%; min-width: 20rem; height: 9rem; }
.evo__axis { stroke: var(--color-border); stroke-width: 1; }
.evo__bar { fill: var(--color-success); }
.evo__bar--deficit { fill: var(--color-danger); }
.evo__legend {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(17rem, 1fr));
  gap: var(--space-1) var(--space-4);
  font-size: var(--font-size-sm);
}
.evo__legend-item { display: flex; gap: var(--space-2); align-items: baseline; white-space: nowrap; }
.evo__legend-value { font-variant-numeric: tabular-nums; margin-left: auto; }
.evo__legend-value--deficit { color: var(--color-danger); }
.evo__legend-cumul { color: var(--color-text-muted); font-size: var(--font-size-xs); }
</style>
