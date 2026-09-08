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
import type { MenuEntry } from '~/components/shared/AppBarMenu.vue'

const route = useRoute()

interface NavItem { label: string, href: string, match: string }

const health = useBaseHealth()

/**
 * Tranche visée par « Transactions » — l'ANNÉE du dernier relevé (demande du 2026-09-06).
 *
 * Deux choix s'empilent ici, et ils ont la même raison d'être.
 *
 * L'ANNÉE plutôt que le mois : « Analyse » s'ouvre sur l'année, et atterrir sur un mois depuis
 * l'onglet voisin obligeait à changer d'échelle à chaque visite. Un an fait un millier de
 * lignes, que le filtre et la recherche rendent praticables.
 *
 * Le dernier RELEVÉ plutôt que le calendrier : viser l'année civile ouvrirait l'écran le plus
 * dense du produit sur son état vide chaque 1er janvier, tant que le relevé n'est pas importé.
 * La liste des relevés est triée par période décroissante et déjà chargée pour les compteurs :
 * aucun appel de plus.
 */
const now = new Date()
const calendarPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
const latestPeriod = computed(() => health.latestPeriod.value ?? calendarPeriod)
const latestYear = computed(() => latestPeriod.value.slice(0, 4))

const items = computed<NavItem[]>(() => [
  { label: 'Analyse', href: '/analyse', match: '/analyse' },
  { label: 'Évolution', href: '/evolution', match: '/evolution' },
])

/**
 * Les deux menus — sept liens de même poids ne disaient pas lesquels vont ensemble
 * (demande du 2026-09-08).
 *
 * « À ranger » est une vue des transactions et vivait à l'autre bout de la barre ; Import,
 * Règles et Catégories alimentent et paramètrent la base sans que rien ne les rapproche.
 * Aucune page n'est créée, déplacée ni renommée : seule la façon d'y accéder change.
 */
interface NavMenu { label: string, entries: MenuEntry[], matches: string[] }

const menus = computed<NavMenu[]>(() => [
  {
    label: 'Transactions',
    entries: [
      { label: 'Toutes', href: `/transactions/${latestYear.value}` },
      { label: 'À ranger', href: '/a-ranger' },
    ],
    matches: ['/transactions', '/a-ranger'],
  },
  {
    label: 'Données',
    entries: [
      { label: 'Import', href: '/import' },
      { label: 'Règles', href: '/regles' },
      { label: 'Catégories', href: '/categories' },
    ],
    // `/reconciliation/<hash>` s'ouvre depuis la liste des relevés : elle allumait « Import »,
    // elle allume désormais le menu qui le contient.
    matches: ['/import', '/regles', '/categories', '/reconciliation'],
  },
])

/** Un seul menu ouvert à la fois : l'arbitrage vit ici, pas dans les menus eux-mêmes. */
const openMenu = ref<string | null>(null)
function setOpen(label: string, value: boolean) {
  if (value) {
    openMenu.value = label
    return
  }
  // Ne referme que SI c'est bien ce menu qui est ouvert. Un `false` émis par un menu déjà
  // fermé — l'ordre `focusout` puis `click` en produit — éteindrait sinon le voisin qui vient
  // de s'ouvrir (revue du 2026-09-08).
  if (openMenu.value === label) openMenu.value = null
}

/**
 * Actif par PRÉFIXE : `/transactions/2026-08` et `/reconciliation/<hash>` sont des pages de
 * détail qui doivent garder allumée l'entrée d'où l'on vient. `NuxtLink` ne le fait pas seul
 * ici, puisque le `to` porte une période qui n'est presque jamais celle affichée.
 */
function matchesPath(match: string): boolean {
  const path = route.path
  return path === match || path.startsWith(`${match}/`)
}

function isActive(item: NavItem): boolean {
  return matchesPath(item.match)
}

function isMenuActive(menu: NavMenu): boolean {
  return menu.matches.some(matchesPath)
}

/** Changer de page referme : un menu resté ouvert par-dessus l'écran suivant est un oubli. */
watch(() => route.path, () => {
  openMenu.value = null
})
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

      <AppBarMenu
        v-for="menu in menus"
        :key="menu.label"
        :label="menu.label"
        :entries="menu.entries"
        :active="isMenuActive(menu)"
        :open="openMenu === menu.label"
        @update:open="value => setOpen(menu.label, value)"
      />
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
      <!-- Le taux porte sur TOUTE la base : il mène à l'année, pas à un mois. -->
      <NuxtLink
        :to="`/transactions/${latestYear}`"
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
  /*
   * `clip` et non `hidden` : les deux rognent, mais `hidden` crée un conteneur de DÉFILEMENT —
   * il rognait le menu ouvert sous la barre et la faisait défiler sur elle-même dès qu'une
   * entrée prenait le focus. `overflow-x: clip` laisse `overflow-y` à `visible`, donc le menu
   * déborde vers le bas, et la barre ne provoque toujours jamais de défilement horizontal de
   * l'application, y compris en fenêtre étroite (revue du 2026-09-08).
   */
  overflow-x: clip;
}
.bar__mark { font-size: 14px; font-weight: 600; letter-spacing: -0.01em; color: var(--color-text); flex-shrink: 0; }

.bar__nav { display: flex; gap: 2px; flex-shrink: 0; }
/* `.bar__link` vit désormais dans `components.css` : le déclencheur de menu le porte aussi, et
   un style scopé ne franchit pas la frontière d'un composant enfant (revue du 2026-09-08). */

/*
 * Les compteurs CÈDENT en premier quand la place manque.
 *
 * En `nowrap` sans rétrécissement, la barre débordait sous ~1150 px et imposait une barre de
 * défilement horizontale à TOUTE l'application, y compris sur des pages étroites (revue du
 * 2026-09-05). Ils disparaissent donc en dessous, plutôt que de pousser le reste : ce sont
 * des indicateurs de contexte, pas de la navigation.
 */
/* `clip` et non `hidden`, pour la même raison que sur `.bar` : les compteurs portent DEUX liens
   focusables, et un conteneur de défilement les aurait emportés hors de vue à la tabulation,
   sans retour possible (revue du 2026-09-08). */
.bar__stats { margin-left: auto; display: flex; align-items: center; min-width: 0; overflow: clip; }
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
