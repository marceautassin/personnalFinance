# Story 2.10: UI — `TransactionList`, `CategoryEditor`, page `/transactions/[period]`

Status: ready-for-dev

## Story

As a user,
I want to browse the transactions of a given month and edit the category of any transaction in one click,
so that I can verify the LLM's work and correct mistakes quickly.

## Acceptance Criteria

1. **Given** la page `app/pages/transactions/[period].vue` (route dynamique),
   **When** elle se charge avec un paramètre `period=YYYY-MM` valide,
   **Then** elle affiche : titre du mois (ex: "Avril 2026"), navigation mois précédent/suivant (basique), et la liste des transactions du mois via `useTransactions`.

2. **Given** la `TransactionList`,
   **When** elle reçoit la liste,
   **Then** chaque transaction est rendue dans une `TransactionRow` avec : date (jour), libellé, montant formaté en EUR (couleur rouge si négatif, vert si positif), catégorie cliquable.

3. **Given** un `CategoryEditor` (popover ou inline select),
   **When** je clique sur la catégorie d'une transaction,
   **Then** un menu s'ouvre listant les catégories disponibles ; sélectionner une catégorie déclenche `useTransactions().mutateCategory(id, code)` qui PATCH l'API et refresh la liste.

4. **Given** une transaction marquée `is_manual: true`,
   **When** elle s'affiche,
   **Then** un indicateur visuel discret (badge "édité" ou icône) est visible.

5. **Given** un mois avec `bank_statements.reliability === 'unreliable'` (story 3.x produira ce flag),
   **When** la page affiche les transactions du mois,
   **Then** un bandeau d'alerte en haut de la liste signale "Mois non fiable — la réconciliation a un écart résiduel".

6. **Given** une période sans transactions (mois jamais ingéré),
   **When** la page se charge,
   **Then** elle affiche un état vide avec un lien vers `/import`.

## Tasks / Subtasks

- [ ] **Task 1 — Page `/transactions/[period]`** (AC: #1, #5, #6)
  - [ ] Créer `app/pages/transactions/[period].vue`
  - [ ] Validation côté page du paramètre (sinon redirect ou afficher erreur)
  - [ ] Afficher header avec mois en français (`Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' })`)
  - [ ] Navigation prev/next mois (boutons qui changent l'URL)
  - [ ] Récupérer le statement via un nouvel endpoint (ou query séparée) pour connaître la `reliability` (cf. Task 4)

- [ ] **Task 2 — Composant `TransactionList.vue`** (AC: #2)
  - [ ] Créer `app/components/transactions/TransactionList.vue`
  - [ ] Props : `transactions: TransactionListItem[]`
  - [ ] Affiche un tableau ou liste accessible avec rôles ARIA appropriés

- [ ] **Task 3 — Composant `TransactionRow.vue`** (AC: #2, #4)
  - [ ] Créer `app/components/transactions/TransactionRow.vue`
  - [ ] Props : transaction
  - [ ] Affiche date (formatée), libellé, montant (couleur rouge/vert via class), catégorie via `CategoryEditor`
  - [ ] Indicateur visuel pour `is_manual` (petit badge "modifié")
  - [ ] Indicateur visuel pour `is_debt_repayment` (badge "remboursement dette") — sera complété en Story 6.x mais on prépare l'affichage

- [ ] **Task 4 — Composant `CategoryEditor.vue`** (AC: #3)
  - [ ] Créer `app/components/transactions/CategoryEditor.vue`
  - [ ] Props : `currentCode: string`, `transactionId: number`
  - [ ] Charge la liste des catégories via un nouveau endpoint `GET /api/categories` (ou via composable `useCategories`)
  - [ ] Sur sélection : appelle le composable parent (event `@change`)

- [ ] **Task 5 — Endpoint et composable catégories** (AC: #3)
  - [ ] Créer `server/api/categories.get.ts` qui retourne `category_definitions` triées (variables d'abord, fixes ensuite, ordre alphabétique)
  - [ ] Créer `app/composables/useCategories.ts`

- [ ] **Task 6 — Endpoint pour récupérer un statement par hash** (AC: #5) *— optionnel V1*
  - [ ] Créer `server/api/statements/[hash].get.ts` (utilisé pour récupérer la `reliability`)
  - [ ] Ou : étendre `GET /api/transactions?month=...` pour inclure les méta du statement dans la réponse (plus simple — recommandé)

- [ ] **Task 7 — État vide et navigation** (AC: #6)
  - [ ] Si la liste est vide ET aucun statement existant pour la période, afficher un état vide
  - [ ] Sinon, afficher un message "Aucune transaction extraite" (cas rare mais possible)

- [ ] **Task 8 — Sanity check final**
  - [ ] `yarn dev` → naviguer vers `/transactions/2026-04` après ingestion
  - [ ] Cliquer sur une catégorie, en choisir une autre, vérifier le PATCH et le refresh
  - [ ] `yarn typecheck`, `yarn lint`, `yarn test:run`, `yarn test:e2e` propres
  - [ ] Commit unique

## Dev Notes

### Structure de `app/pages/transactions/[period].vue`

```vue
<script setup lang="ts">
const route = useRoute()
const router = useRouter()

const period = computed(() => route.params.period as string)

// Validation
if (!/^\d{4}-\d{2}$/.test(period.value)) {
  throw createError({ statusCode: 400, statusMessage: 'invalid period format' })
}

const monthRef = computed(() => period.value)
const { data: transactions, pending, refresh } = useTransactions(monthRef)

// Format mois en FR
const monthLabel = computed(() => {
  const [year, month] = period.value.split('-').map(Number)
  return new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' })
    .format(new Date(year, month - 1, 1))
})

function navigate(delta: number) {
  const [y, m] = period.value.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  const newPeriod = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  router.push(`/transactions/${newPeriod}`)
}

async function onCategoryChange(transactionId: number, categoryCode: string) {
  const { mutateCategory } = useTransactions(monthRef)
  await mutateCategory(transactionId, categoryCode)
}
</script>

<template>
  <section class="page">
    <header class="page__header">
      <button @click="navigate(-1)" aria-label="Mois précédent">←</button>
      <h2>{{ monthLabel }}</h2>
      <button @click="navigate(1)" aria-label="Mois suivant">→</button>
    </header>

    <div v-if="pending">Chargement…</div>
    <div v-else-if="!transactions?.length" class="empty">
      <p>Aucune transaction pour ce mois.</p>
      <NuxtLink to="/import">Importer un relevé</NuxtLink>
    </div>
    <TransactionList
      v-else
      :transactions="transactions"
      @category-change="onCategoryChange"
    />
  </section>
</template>
```

### Note sur `useTransactions(monthRef)` réinstancié

Le snippet ci-dessus appelle `useTransactions` deux fois (une pour data, une pour `mutateCategory`). En pratique, `useTransactions` étant un composable qui crée un useFetch keyé, deux appels avec la même key partagent le même cache Nuxt. La duplication est OK fonctionnellement mais légèrement inélégante. Refactor possible : retourner `{ data, pending, refresh, mutateCategory, markAsDebtRepayment }` depuis un seul appel et déstructurer.

### Anti-patterns à éviter

- ❌ Logique métier dans le composant — passer par les composables.
- ❌ Format de date manuel via concat de strings — `Intl.DateTimeFormat('fr-FR', ...)`.
- ❌ Charger les catégories à chaque ouverture du `CategoryEditor` — composable avec cache `useFetch`.
- ❌ Implémenter le marquage `isDebtRepayment` complet ici — placeholder visuel uniquement, le flow est en Story 6.3.

### Project Structure Notes

Cette story crée :
- `app/pages/transactions/[period].vue`
- `app/components/transactions/TransactionList.vue`
- `app/components/transactions/TransactionRow.vue`
- `app/components/transactions/CategoryEditor.vue`
- `app/composables/useCategories.ts`
- `server/api/categories.get.ts`
- (optionnel) `server/api/statements/[hash].get.ts` ou enrichir `transactions.get.ts`

### Definition of Done

- [ ] Page `/transactions/[period]` opérationnelle, navigation entre mois fonctionnelle
- [ ] `TransactionList` + `TransactionRow` + `CategoryEditor` créés
- [ ] PATCH d'une catégorie via clic → liste se rafraîchit
- [ ] Indicateurs visuels `is_manual` et préparation `is_debt_repayment`
- [ ] État vide avec lien vers `/import`
- [ ] Bandeau "mois non fiable" si applicable
- [ ] `yarn typecheck`, `yarn lint`, `yarn test:run` propres
- [ ] Commit unique

### References

- [Source: `CLAUDE.md`#Anti-patterns interdits] — composants ne font pas de fetch direct
- [Source: `CLAUDE.md`#API REST] — convention endpoints
- [Source: `_bmad-output/planning-artifacts/architecture.md`#Project Structure] — emplacement des composants
- [Source: `_bmad-output/planning-artifacts/prd.md`#FR7, §FR8] — consultation et édition
- [Source: `_bmad-output/planning-artifacts/epics.md`#Story 2.10] — story originale
- [Previous stories: `2-7` GET endpoint + composable, `2-8` PATCH + mutateCategory]

## Dev Agent Record

### Agent Model Used

_(à remplir)_

### Debug Log References

_(à remplir)_

### Completion Notes List

_(à remplir — éventuelle décision sur l'enrichissement de `transactions.get.ts` vs endpoint statement séparé)_

### File List

_(à remplir)_
