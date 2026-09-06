<script setup lang="ts">
import { useBaseHealth } from '~/composables/useBaseHealth'
import { formatEuros } from '~~/shared/types/money'
import { formatRatio } from '~~/shared/types/ratio'

/**
 * Barre d'application — nom, navigation et santé de la base sur une seule ligne de 44 px.
 *
 * Remplace `AppHeader` + `AppNav`, qui empilaient un titre répété sur chaque page au-dessus
 * d'une rangée de liens sans état actif : soixante pixels de hauteur pour dire deux fois où
 * l'on est, sur des écrans faits pour montrer des tableaux.
 *
 * Le rail latéral a été dessiné puis écarté (epic 16) : 208 px de largeur sur chaque écran,
 * alors que la ressource rare ici est la largeur — les courbes d'évolution et la répartition
 * en deux colonnes la consomment entièrement.
 */
const route = useRoute()

interface NavItem { label: string, href: string, match: string }

const health = useBaseHealth()

/**
 * Mois visé par « Transactions » — le dernier RELEVÉ, pas le mois du calendrier.
 *
 * Viser le mois courant ouvrait l'écran le plus dense du produit sur son état vide chaque
 * début de mois, tant que le relevé n'était pas importé. La liste des relevés est triée par
 * période décroissante et déjà chargée pour les compteurs : aucun appel de plus.
 */
const now = new Date()
const calendarPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
const latestPeriod = computed(() => health.latestPeriod.value ?? calendarPeriod)

const items = computed<NavItem[]>(() => [
  { label: 'Analyse', href: '/analyse', match: '/analyse' },
  { label: 'Évolution', href: '/evolution', match: '/evolution' },
  { label: 'Transactions', href: `/transactions/${latestPeriod.value}`, match: '/transactions' },
  { label: 'Import', href: '/import', match: '/import' },
  { label: 'Catégories', href: '/categories', match: '/categories' },
  { label: 'Règles', href: '/regles', match: '/regles' },
])

/**
 * Actif par PRÉFIXE : `/transactions/2026-08` et `/reconciliation/<hash>` sont des pages de
 * détail qui doivent garder allumée l'entrée d'où l'on vient. `NuxtLink` ne le fait pas seul
 * ici, puisque le `to` porte une période qui n'est presque jamais celle affichée.
 */
const RECONCILIATION_PARENT = '/import'
function isActive(item: NavItem): boolean {
  const path = route.path
  if (path.startsWith('/reconciliation')) return item.match === RECONCILIATION_PARENT
  return path === item.match || path.startsWith(`${item.match}/`)
}
</script>

<template>
  <div class="bar">
    <NuxtLink
      to="/analyse"
      class="bar__mark"
    >
      personnalFinance
    </NuxtLink>

    <nav
      class="bar__nav"
      aria-label="Navigation principale"
    >
      <NuxtLink
        v-for="item in items"
        :key="item.label"
        :to="item.href"
        class="bar__link"
        :class="{ 'bar__link--on': isActive(item) }"
        :aria-current="isActive(item) ? 'page' : undefined"
      >
        {{ item.label }}
      </NuxtLink>
    </nav>

    <!--
      Santé de la base — portée GLOBALE, constante d'un écran à l'autre. Les compteurs des
      en-têtes de page sont, eux, bornés à la période affichée : chaque libellé le dit, sans
      quoi « 0,2 % » ici et « 1,1 % » juste en dessous se liraient comme une contradiction.
    -->
    <!-- Story 17.7 : sur une panne, les compteurs à zéro se liraient comme une base vide. -->
    <div
      v-if="health.failed.value"
      class="bar__stats"
    >
      <span class="bar__stat bar__stat--failed">
        Santé de la base indisponible
      </span>
    </div>

    <div
      v-else-if="!health.pending.value || health.statementCount.value > 0"
      class="bar__stats"
    >
      <span class="bar__stat">
        <strong>{{ health.transactionCount.value.toLocaleString('fr-FR') }}</strong> lignes
        · <strong>{{ health.statementCount.value }}</strong> relevés
      </span>
      <NuxtLink
        to="/import"
        class="bar__stat"
      >
        Écart cumulé
        <strong :class="health.gapCents.value === 0 ? 'amount--good' : 'amount--bad'">
          {{ formatEuros(health.gapCents.value) }}
        </strong>
      </NuxtLink>
      <NuxtLink
        :to="`/transactions/${latestPeriod}`"
        class="bar__stat"
      >
        Corrigé à la main
        <strong>{{ formatRatio(health.correctionRate.value) }}</strong>
      </NuxtLink>
    </div>
  </div>
</template>

<style scoped>
.bar {
  height: var(--bar-height);
  display: flex;
  align-items: center;
  gap: var(--space-6);
  padding: 0 var(--space-6);
  background: var(--color-bg-elevated);
  border-bottom: 1px solid var(--color-border);
  /* La barre ne déborde jamais : c'est le cadre de l'application, pas son contenu. */
  overflow: hidden;
}
.bar__mark { font-size: 14px; font-weight: 600; letter-spacing: -0.01em; color: var(--color-text); flex-shrink: 0; }

.bar__nav { display: flex; gap: 2px; flex-shrink: 0; }
.bar__link {
  height: var(--bar-height);
  padding: 0 var(--space-3);
  display: flex;
  align-items: center;
  font-size: var(--font-size-base);
  color: var(--color-text-muted);
  /* Le trait actif mord sur le filet de la barre : un liseré de 2 px posé DESSUS, et non
     au-dessus, sinon la barre paraît épaissie sur l'onglet courant. */
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  transition: color var(--transition-fast);
}
.bar__link:hover { color: var(--color-text); }
.bar__link--on { color: var(--color-accent); border-bottom-color: var(--color-accent); font-weight: 500; }

/*
 * Les compteurs CÈDENT en premier quand la place manque.
 *
 * En `nowrap` sans rétrécissement, la barre débordait sous ~1150 px et imposait une barre de
 * défilement horizontale à TOUTE l'application, y compris sur des pages étroites (revue du
 * 2026-09-05). Ils disparaissent donc en dessous, plutôt que de pousser le reste : ce sont
 * des indicateurs de contexte, pas de la navigation.
 */
.bar__stats { margin-left: auto; display: flex; align-items: center; min-width: 0; }
@media (width < 1200px) {
  .bar__stats { display: none; }
}
.bar__stat--failed { color: var(--color-danger); }
.bar__stat {
  height: 20px;
  padding: 0 var(--space-3);
  display: flex;
  align-items: baseline;
  gap: var(--space-1);
  border-left: 1px solid var(--color-border);
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
  white-space: nowrap;
}
.bar__stat:first-child { border-left: none; }
.bar__stat:last-child { padding-right: 0; }
.bar__stat strong {
  font-family: var(--font-mono);
  font-size: var(--font-size-sm);
  font-weight: 500;
  color: var(--color-neutral-700);
  font-variant-numeric: tabular-nums;
}
a.bar__stat:hover, a.bar__stat:hover strong { color: var(--color-accent); }
</style>
