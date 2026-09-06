<script setup lang="ts">
import { formatEuros, type Cents } from '~~/shared/types/money'
import { formatRatio } from '~~/shared/types/ratio'
import type { AnalysisResponse } from '~/composables/useAnalysis'
import { formatDate } from '~/utils/dates'

const props = defineProps<{
  indicators: AnalysisResponse['indicators']
  bankBalance: AnalysisResponse['bankBalance']
  /** Bornes demandées, pour dire quand le solde couvre autre chose. */
  from: string
  to: string
}>()

/**
 * La carte « Trésorerie cumulée » a été retirée le 2026-09-05 : elle portait sur douze
 * tranches alors que toutes les autres décrivent la période choisie. Une même page annonçait
 * ainsi deux portées différentes sans le dire. Le cumul vit désormais sur `/evolution`.
 */

/** FR33 — le déficit doit se voir sans lire les chiffres. */
const isDeficit = computed(() => props.indicators.resultCents < 0)

/**
 * Variation du solde bancaire, affichée à côté du résultat et jamais à sa place.
 *
 * Les deux répondent à des questions différentes : le résultat dit si la période a coûté plus
 * qu'elle n'a rapporté, le solde dit ce qu'il reste sur le compte. Sur mars 2026, le premier
 * vaut −1 893 € et le second +472 € — l'écart étant l'épargne rapatriée. Les confondre est
 * précisément ce que le produit corrige (NFR4).
 */
const bankDelta = computed(() => {
  if (!props.bankBalance) return null
  return (props.bankBalance.closingCents - props.bankBalance.openingCents) as Cents
})

/**
 * Un relevé bancaire ne coïncide presque jamais avec le calendrier : chez Boursobank il court
 * du 28/02 au 31/03. Le solde reste utile, mais il faut dire ce qu'il couvre — sinon l'écran
 * affiche une variation sur une autre période sous le titre du mois demandé.
 */
const balanceIsOffset = computed(() =>
  props.bankBalance !== null && (props.bankBalance.from !== props.from || props.bankBalance.to !== props.to),
)
</script>

<template>
  <!--
    Un BANDEAU et non quatre cartes (epic 16). Quatre surfaces ombrées et espacées coûtaient
    110 px de hauteur pour quatre nombres, et les isolaient les unes des autres là où on veut
    justement les comparer d'un coup d'œil.
  -->
  <div class="kpis">
    <div
      class="kpi"
      data-testid="indicator-result"
    >
      <!--
        « Variation du patrimoine » et non « trésorerie » (demande du 2026-09-06).
        C'est le MÊME calcul — recettes plus dépenses, mouvements internes exclus — mais nommé
        pour ce qu'il mesure. Les mouvements internes déplacent de l'argent entre les comptes
        de l'utilisateur sans en créer ni en détruire : ce qui reste est donc exactement ce que
        son patrimoine a gagné ou perdu. Sous son ancien nom comptable, l'utilisateur ne le
        lisait pas ainsi et cherchait le chiffre ailleurs.
      -->
      <span class="kpi__label">Variation du patrimoine</span>
      <strong
        class="kpi__value"
        :class="{ 'amount--bad': isDeficit }"
      >{{ formatEuros(indicators.resultCents as Cents) }}</strong>
      <span class="kpi__hint">
        <template v-if="isDeficit">
          <span
            class="indic__flag"
            role="status"
          >Appauvrissement</span>
          <!--
            Le financement interne se dit ICI, collé au déficit qu'il comble : c'est le lien
            que l'écran ne faisait pas. Puiser dans son épargne pour boucler un mois n'est pas
            une recette, c'est le symptôme.
          -->
          <template v-if="indicators.internalCents > 0">
            · comblé par {{ formatEuros(indicators.internalCents as Cents) }} pris sur vos autres comptes
          </template>
          <template v-else>· hors mouvements internes</template>
        </template>
        <template v-else>
          Recettes {{ formatEuros(indicators.incomeCents as Cents) }} · dépenses {{ formatEuros(indicators.expenseCents as Cents) }}
        </template>
      </span>
    </div>

    <div class="kpi">
      <span class="kpi__label">Taux de dépense</span>
      <strong class="kpi__value">{{ formatRatio(indicators.spendRate) }}</strong>
      <span class="kpi__hint">des recettes consommées</span>
    </div>

    <div class="kpi">
      <span class="kpi__label">Taux d'épargne</span>
      <strong class="kpi__value">{{ formatRatio(indicators.savingsRate) }}</strong>
      <span class="kpi__hint">des recettes conservées</span>
    </div>

    <div class="kpi">
      <span class="kpi__label">Solde bancaire</span>
      <strong class="kpi__value">{{ bankDelta === null ? '—' : formatEuros(bankDelta) }}</strong>
      <span class="kpi__hint">
        <template v-if="bankDelta === null">Historique incomplet sur la période</template>
        <template v-else-if="balanceIsOffset">
          Du {{ formatDate(bankBalance!.from) }} au {{ formatDate(bankBalance!.to) }}, mouvements internes compris
        </template>
        <!-- Le solde bancaire INCLUT les mouvements internes (NFR4) : il peut donc rester
             stable pendant que le patrimoine baisse, l'épargne comblant l'écart. -->
        <template v-else>Mouvements internes compris : {{ formatEuros(indicators.internalCents as Cents) }}</template>
      </span>
    </div>
  </div>
</template>

<style scoped>
/* Le bandeau vient de `components.css` ; ne reste ici que le drapeau du déficit, qui n'existe
   nulle part ailleurs. */
.indic__flag {
  display: inline-block;
  padding: 0 var(--space-2);
  border-radius: var(--radius-full);
  background: var(--color-danger);
  color: #fff;
  font-size: var(--font-size-xs);
  font-weight: 600;
}
</style>
