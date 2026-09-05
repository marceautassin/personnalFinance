<script setup lang="ts">
import { formatEuros, type Cents } from '~~/shared/types/money'
import type { AnalysisSeriesPoint } from '~~/server/services/analysis-engine'

/**
 * Recettes et dépenses en deux courbes, l'écart entre elles rempli.
 *
 * **Pourquoi deux courbes et non des barres de résultat.** Le résultat additionne recettes et
 * dépenses, et efface donc ce qui explique le déficit. Sur les données réelles, les dépenses
 * sont un mur régulier (médiane 3 960 €, écart-type 690) et ce sont les RECETTES qui sont
 * erratiques (médiane 2 080 €, écart-type 1 940). Deux courbes qui ne se croisent presque
 * jamais montrent ce diagnostic sans qu'on lise un seul chiffre — une barre de résultat, non.
 *
 * SVG inline, sans bibliothèque (AR21). Le repère est calculé en coordonnées absolues plutôt
 * qu'en `viewBox` étirée : les épaisseurs de trait et les libellés d'axes doivent garder leur
 * taille réelle, ce qu'un `preserveAspectRatio="none"` déforme.
 */
const props = defineProps<{ series: AnalysisSeriesPoint[] }>()

const W = 960
const H = 260
const PAD = { top: 16, right: 16, bottom: 34, left: 68 }

const plot = computed(() => ({
  w: W - PAD.left - PAD.right,
  h: H - PAD.top - PAD.bottom,
}))

/** Échelle : de zéro au plus haut des deux séries, avec une marge. Les dépenses sont tracées
 *  en valeur absolue — comparer une courbe qui monte à une courbe qui descend n'apprend rien. */
const maxValue = computed(() =>
  Math.max(1, ...props.series.flatMap(p => [p.incomeCents, Math.abs(p.expenseCents)])) * 1.1,
)

const x = (index: number) => {
  const n = Math.max(1, props.series.length - 1)
  return PAD.left + (index / n) * plot.value.w
}
const y = (value: number) => PAD.top + plot.value.h - (value / maxValue.value) * plot.value.h

const incomePath = computed(() =>
  props.series.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(p.incomeCents)}`).join(' '),
)
const expensePath = computed(() =>
  props.series.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(Math.abs(p.expenseCents))}`).join(' '),
)

/**
 * L'aire entre les deux courbes — le sujet du graphique.
 *
 * Elle est découpée en segments d'une tranche, chacun coloré selon le signe du résultat de la
 * tranche : rouge quand les dépenses dominent, vert quand les recettes passent devant. Une
 * aire d'un seul tenant devrait choisir une couleur unique et mentirait sur les mois positifs.
 */
const gapBands = computed(() =>
  props.series.slice(0, -1).map((p, i) => {
    const next = props.series[i + 1]!
    return {
      key: p.bucket,
      deficit: p.resultCents < 0,
      d: [
        `M ${x(i)} ${y(p.incomeCents)}`,
        `L ${x(i + 1)} ${y(next.incomeCents)}`,
        `L ${x(i + 1)} ${y(Math.abs(next.expenseCents))}`,
        `L ${x(i)} ${y(Math.abs(p.expenseCents))}`,
        'Z',
      ].join(' '),
    }
  }),
)

/** Trois repères horizontaux à des montants ronds : sans échelle, on ne compare que des hauteurs. */
const gridLines = computed(() => {
  const step = niceStep(maxValue.value / 3)
  const lines: Array<{ value: number, y: number, label: string }> = []
  for (let v = 0; v <= maxValue.value; v += step) {
    lines.push({ value: v, y: y(v), label: formatEuros(v as Cents) })
  }
  return lines
})

/** Arrondit un pas d'échelle à 1, 2 ou 5 fois une puissance de dix — les seuls pas lisibles. */
function niceStep(raw: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(raw, 1)))
  const normalized = raw / magnitude
  const factor = normalized > 5 ? 10 : normalized > 2 ? 5 : normalized > 1 ? 2 : 1
  return factor * magnitude
}

/**
 * Un libellé sur deux quand les tranches sont serrées, et JAMAIS le dernier en plus.
 *
 * Forcer l'affichage de la dernière tranche cassait le rythme et faisait se chevaucher deux
 * libellés voisins quand la parité ne tombait pas juste. Le décalage part donc de la fin :
 * la dernière tranche est toujours montrée, et le rythme remonte à partir d'elle.
 */
const tickEvery = computed(() => (props.series.length > 8 ? 2 : 1))
const showTick = (index: number) => (props.series.length - 1 - index) % tickEvery.value === 0

/**
 * Survol : une bande invisible par tranche capte la souris et ouvre l'infobulle.
 *
 * Des bandes plutôt que les points eux-mêmes — viser un disque de 3 px de rayon est un exercice
 * d'adresse, et il y en a deux superposés par tranche. La bande couvre toute la hauteur, donc
 * la tranche entière est une cible. Rien de tout ceci n'est exposé au clavier : le tableau
 * sous le graphique porte déjà les mêmes valeurs, atteignables et lisibles.
 */
const hovered = ref<number | null>(null)

const bands = computed(() =>
  props.series.map((p, i) => {
    const n = Math.max(1, props.series.length - 1)
    const half = plot.value.w / n / 2
    const left = Math.max(PAD.left, x(i) - half)
    const right = Math.min(W - PAD.right, x(i) + half)
    return { key: p.bucket, index: i, x: left, width: Math.max(1, right - left) }
  }),
)

const tip = computed(() => {
  const i = hovered.value
  if (i === null) return null
  const p = props.series[i]
  if (!p) return null
  return {
    left: `${(x(i) / W) * 100}%`,
    /** Ancrage retourné près des bords, sinon l'infobulle sort du cadre. */
    anchor: x(i) < W * 0.2 ? 'start' : x(i) > W * 0.8 ? 'end' : 'middle',
    label: p.label,
    income: formatEuros(p.incomeCents as Cents),
    expense: formatEuros(p.expenseCents as Cents),
    result: formatEuros(p.resultCents as Cents),
    deficit: p.resultCents < 0,
  }
})
</script>

<template>
  <figure class="flow">
    <figcaption class="flow__legend">
      <span class="flow__key flow__key--income">Recettes</span>
      <span class="flow__key flow__key--expense">Dépenses</span>
      <span class="flow__key flow__key--deficit">Écart au défaveur</span>
      <span class="flow__key flow__key--surplus">Écart en faveur</span>
    </figcaption>

    <div class="flow__frame">
      <div
        class="flow__plot"
        @mouseleave="hovered = null"
      >
        <!--
        `aria-hidden` : le graphique n'est PAS l'information, il en est la forme. Le tableau
        sous le composant porte les valeurs, et c'est lui que lisent le clavier et le lecteur
        d'écran. Le doubler dans le SVG produirait une lecture illisible.
      -->
        <svg
          class="flow__svg"
          :viewBox="`0 0 ${W} ${H}`"
          aria-hidden="true"
        >
          <g class="flow__grid">
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
              class="flow__axis-label"
            >{{ line.label }}</text>
          </g>

          <path
            v-for="band in gapBands"
            :key="band.key"
            :d="band.d"
            :class="band.deficit ? 'flow__band flow__band--deficit' : 'flow__band flow__band--surplus'"
          />

          <path
            :d="expensePath"
            class="flow__line flow__line--expense"
          />
          <path
            :d="incomePath"
            class="flow__line flow__line--income"
          />

          <!-- Les points marquent chaque tranche : sans eux, on ne sait pas où sont les mesures. -->
          <g>
            <circle
              v-for="(p, i) in series"
              :key="`i-${p.bucket}`"
              :cx="x(i)"
              :cy="y(p.incomeCents)"
              r="3"
              class="flow__dot flow__dot--income"
            />
            <circle
              v-for="(p, i) in series"
              :key="`e-${p.bucket}`"
              :cx="x(i)"
              :cy="y(Math.abs(p.expenseCents))"
              r="3"
              class="flow__dot flow__dot--expense"
            />
          </g>

          <text
            v-for="(p, i) in series"
            v-show="showTick(i)"
            :key="`x-${p.bucket}`"
            :x="x(i)"
            :y="H - 10"
            :text-anchor="i === 0 ? 'start' : i === series.length - 1 ? 'end' : 'middle'"
            class="flow__axis-label"
          >{{ p.label }}</text>

          <!-- Repère du survol, sous les bandes de capture pour ne pas leur voler la souris. -->
          <line
            v-if="hovered !== null"
            :x1="x(hovered)"
            :x2="x(hovered)"
            :y1="PAD.top"
            :y2="PAD.top + plot.h"
            class="flow__guide"
          />
          <g v-if="hovered !== null">
            <circle
              :cx="x(hovered)"
              :cy="y(series[hovered]!.incomeCents)"
              r="5"
              class="flow__dot flow__dot--income"
            />
            <circle
              :cx="x(hovered)"
              :cy="y(Math.abs(series[hovered]!.expenseCents))"
              r="5"
              class="flow__dot flow__dot--expense"
            />
          </g>

          <rect
            v-for="band in bands"
            :key="`h-${band.key}`"
            :x="band.x"
            :y="PAD.top"
            :width="band.width"
            :height="plot.h"
            class="flow__hit"
            @mouseenter="hovered = band.index"
          />
        </svg>

        <div
          v-if="tip"
          class="flow__tip"
          :data-anchor="tip.anchor"
          :style="{ left: tip.left }"
        >
          <strong>{{ tip.label }}</strong>
          <span><i class="flow__swatch flow__swatch--income" />Recettes<b>{{ tip.income }}</b></span>
          <span><i class="flow__swatch flow__swatch--expense" />Dépenses<b>{{ tip.expense }}</b></span>
          <span :class="{ 'flow__tip-neg': tip.deficit }">Résultat<b>{{ tip.result }}</b></span>
        </div>
      </div>
    </div>
  </figure>
</template>

<style scoped>
.flow { margin: 0; display: flex; flex-direction: column; gap: var(--space-2); }
.flow__frame { overflow-x: auto; }
.flow__plot { position: relative; min-width: 40rem; }
.flow__svg { width: 100%; height: auto; display: block; }
.flow__hit { fill: transparent; }
.flow__guide { stroke: var(--color-text-muted); stroke-width: 1; stroke-dasharray: 3 3; }

.flow__tip {
  position: absolute;
  top: var(--space-2);
  z-index: 1;
  display: grid;
  gap: 2px;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-elevated);
  box-shadow: 0 2px 8px rgb(0 0 0 / 12%);
  font-size: var(--font-size-sm);
  white-space: nowrap;
  pointer-events: none;
}
.flow__tip[data-anchor='middle'] { transform: translateX(-50%); }
.flow__tip[data-anchor='end'] { transform: translateX(-100%); }
.flow__tip span { display: flex; align-items: center; gap: var(--space-2); }
.flow__tip b { margin-left: auto; font-variant-numeric: tabular-nums; }
.flow__tip-neg b { color: var(--color-danger); }
.flow__swatch { width: 0.75rem; height: 2px; border-radius: 1px; }
.flow__swatch--income { background: var(--color-success); }
.flow__swatch--expense { background: var(--color-danger); }
.flow__grid line { stroke: var(--color-border); stroke-width: 1; }
.flow__axis-label { fill: var(--color-text-muted); font-size: 11px; }
.flow__band { opacity: 0.22; }
.flow__band--deficit { fill: var(--color-danger); }
.flow__band--surplus { fill: var(--color-success); }
.flow__line { fill: none; stroke-width: 2; }
.flow__line--income { stroke: var(--color-success); }
/* Tireté sur les dépenses : la distinction ne doit pas reposer sur la seule couleur. */
.flow__line--expense { stroke: var(--color-danger); stroke-dasharray: 6 3; }
.flow__dot--income { fill: var(--color-success); }
.flow__dot--expense { fill: var(--color-danger); }

.flow__legend {
  display: flex;
  gap: var(--space-4);
  flex-wrap: wrap;
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
}
.flow__key { display: inline-flex; align-items: center; gap: var(--space-2); }
.flow__key::before {
  content: '';
  width: 1.4rem;
  height: 0;
  border-top-width: 2px;
  border-top-style: solid;
}
.flow__key--income::before { border-color: var(--color-success); }
.flow__key--expense::before { border-color: var(--color-danger); border-top-style: dashed; }
.flow__key--deficit::before,
.flow__key--surplus::before { height: 0.7rem; border: none; border-radius: 2px; }
.flow__key--deficit::before { background: color-mix(in srgb, var(--color-danger) 25%, transparent); }
.flow__key--surplus::before { background: color-mix(in srgb, var(--color-success) 25%, transparent); }
</style>
