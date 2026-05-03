<script setup lang="ts">
interface NavItem {
  label: string
  href: string | null
}

// La rubrique Transactions cible le mois courant ; la page route gère mois sans données.
const now = new Date()
const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

const items: NavItem[] = [
  { label: 'Dashboard', href: '/' },
  { label: 'Import', href: '/import' },
  { label: 'Transactions', href: `/transactions/${currentPeriod}` },
  { label: 'Charges', href: null },
  { label: 'Revenus', href: null },
  { label: 'SAS', href: null },
  { label: 'Dettes', href: null },
  { label: 'Forecast', href: null },
  { label: 'Paramètres', href: null },
]
</script>

<template>
  <nav
    class="nav"
    aria-label="Navigation principale"
  >
    <ul class="nav__list">
      <li
        v-for="item in items"
        :key="item.label"
      >
        <NuxtLink
          v-if="item.href"
          :to="item.href"
          class="nav__link"
        >
          {{ item.label }}
        </NuxtLink>
        <span
          v-else
          class="nav__link nav__link--disabled"
          aria-disabled="true"
          tabindex="-1"
        >
          {{ item.label }}
        </span>
      </li>
    </ul>
  </nav>
</template>

<style scoped>
.nav { border-bottom: 1px solid var(--color-border); }
.nav__list { display: flex; flex-wrap: wrap; gap: var(--space-1); }
.nav__link {
  display: inline-block;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  color: var(--color-text);
  font-size: var(--font-size-sm);
  transition: background-color var(--transition-fast);
}
.nav__link:hover { background: var(--color-neutral-100); }
.nav__link--disabled { color: var(--color-text-muted); cursor: not-allowed; }
.nav__link--disabled:hover { background: transparent; }
</style>
