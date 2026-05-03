# Story 2.10: UI — `TransactionList`, `CategoryEditor`, page `/transactions/[period]`

Status: done

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

- [x] **Task 1 — Page `/transactions/[period]`** (AC: #1, #5, #6)
  - [x] Créer `app/pages/transactions/[period].vue`
  - [x] Validation côté page du paramètre (sinon redirect ou afficher erreur)
  - [x] Afficher header avec mois en français (`Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' })`)
  - [x] Navigation prev/next mois (boutons qui changent l'URL)
  - [x] Récupérer le statement via un nouvel endpoint (ou query séparée) pour connaître la `reliability` (cf. Task 4)

- [x] **Task 2 — Composant `TransactionList.vue`** (AC: #2)
  - [x] Créer `app/components/transactions/TransactionList.vue`
  - [x] Props : `transactions: TransactionListItem[]`
  - [x] Affiche un tableau ou liste accessible avec rôles ARIA appropriés

- [x] **Task 3 — Composant `TransactionRow.vue`** (AC: #2, #4)
  - [x] Créer `app/components/transactions/TransactionRow.vue`
  - [x] Props : transaction
  - [x] Affiche date (formatée), libellé, montant (couleur rouge/vert via class), catégorie via `CategoryEditor`
  - [x] Indicateur visuel pour `is_manual` (petit badge "modifié")
  - [x] Indicateur visuel pour `is_debt_repayment` (badge "remboursement dette") — sera complété en Story 6.x mais on prépare l'affichage

- [x] **Task 4 — Composant `CategoryEditor.vue`** (AC: #3)
  - [x] Créer `app/components/transactions/CategoryEditor.vue`
  - [x] Props : `currentCode: string`, `transactionId: number`
  - [x] Charge la liste des catégories via un nouveau endpoint `GET /api/categories` (ou via composable `useCategories`)
  - [x] Sur sélection : appelle le composable parent (event `@change`)

- [x] **Task 5 — Endpoint et composable catégories** (AC: #3)
  - [x] Créer `server/api/categories.get.ts` qui retourne `category_definitions` triées (variables d'abord, fixes ensuite, ordre alphabétique)
  - [x] Créer `app/composables/useCategories.ts`

- [x] **Task 6 — Endpoint pour récupérer un statement par hash** (AC: #5) *— optionnel V1*
  - [x] Étendu `GET /api/transactions?month=...` pour inclure `reliability` agrégée des statements contributeurs (option recommandée — plus simple, un seul fetch côté UI)

- [x] **Task 7 — État vide et navigation** (AC: #6)
  - [x] Si la liste est vide, afficher un état vide avec lien vers `/import`

- [x] **Task 8 — Sanity check final**
  - [x] `yarn typecheck`, `yarn lint`, `yarn test:run` propres (155 tests OK)
  - [ ] `yarn dev` sanity manuel — bloqué par bug Nuxt dev server identifié en story 2.9 (cf. workaround `viteEnvironmentApi`)
  - [ ] `yarn test:e2e` — couvert par `tests/e2e/ingestion.spec.ts` qui clique sur le lien "Voir les transactions" ; full run requiert `ANTHROPIC_API_KEY` + fixture PDF
  - [x] Commit unique

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

claude-opus-4-7 (Claude Code)

### Debug Log References

— `yarn test:run` : 16 fichiers, 155 tests verts
— `yarn typecheck` : OK
— `yarn lint` : OK (autofix appliqué sur les attributs Vue multilignes)

### Completion Notes List

- **Décision Task 6** : étendu la réponse de `GET /api/transactions` plutôt que créer un endpoint dédié (option « plus simple » du Dev Notes). Nouvelle shape : `{ transactions: TransactionListItem[], reliability: 'reliable' | 'unreliable' | null }`. La reliability est agrégée : si au moins un statement contributeur est `unreliable`, le mois entier l'est. `null` quand aucune transaction (mois jamais ingéré).
- **Composable refactor** : `useTransactions` retourne désormais `data` qui contient `{ transactions, reliability }` au lieu d'un array. Tests existants `index.get.test.ts` adaptés à la nouvelle shape + 1 test ajouté pour le cas `unreliable`.
- **`is_debt_repayment` badge** : préparé l'affichage (badge "remb. dette") sans implémenter le flow complet — Story 6.3 finalisera.
- **AppNav** : la rubrique « Transactions » pointe maintenant vers `/transactions/{mois courant}` ; la page route gère gracieusement les mois sans données via l'état vide.
- **Sanity check manuel `yarn dev`** : non vérifié — le bug Nuxt dev server signalé en story 2.9 (workaround `viteEnvironmentApi`) reste actif sur ce poste. Le test e2e `ingestion.spec.ts` (skip si pas de PDF/API key) couvre la navigation vers `/transactions/{period}` après ingestion réussie.

### File List

**Créés**
- `app/pages/transactions/[period].vue`
- `app/components/transactions/TransactionList.vue`
- `app/components/transactions/TransactionRow.vue`
- `app/components/transactions/CategoryEditor.vue`
- `app/composables/useCategories.ts`
- `server/api/categories.get.ts`
- `server/api/categories.get.test.ts`

**Modifiés**
- `server/api/transactions/index.get.ts` (shape de réponse + reliability)
- `server/api/transactions/index.get.test.ts` (adaptations + test unreliable)
- `app/composables/useTransactions.ts` (shape `TransactionsResponse`)
- `app/components/shared/AppNav.vue` (lien Transactions actif)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (statut 2-10)

### Change Log

- 2026-05-01 : implémentation story 2.10 — UI liste transactions, éditeur de catégorie, page `/transactions/[period]`. Extension de `GET /api/transactions` avec `reliability`. Status → review.

### Review Findings

- [x] [Review][Decision] Code mort `markAsDebtRepayment` + invariant `isDebtRepayment=true ⇒ debtId !== null` non gardé côté PATCH — résolu option 1 : `markAsDebtRepayment` retirée du composable (Story 6.3 réintroduira fonction + refine ensemble) — `useTransactions.ts:51-59` expose `markAsDebtRepayment(id, null)` qui passerait `{ isDebtRepayment: true, debtId: null }`. `TransactionPatchSchema` (`shared/schemas/transaction.schema.ts:88-100`) n'a aucun `refine` cross-field, contrairement à `NewTransactionSchema:42-48`. La fonction est inutilisée par 2.10 (placeholder visuel only — Story 6.3). Choix : (a) retirer `markAsDebtRepayment` maintenant (YAGNI) et reporter le refine à 6.3, ou (b) garder la fonction ET ajouter le refine maintenant pour fermer la fuite immédiatement.
- [x] [Review][Patch] `mutateCategory` retourne maintenant `{ ok | error, errorCode }` ; la page surface l'erreur via un bandeau `role="alert"` au-dessus de la liste [`app/composables/useTransactions.ts`, `app/pages/transactions/[period].vue`]
- [x] [Review][Patch] Reliability calculée par recouvrement de période (`period_start <= MM-31 AND period_end >= MM-01`) plutôt que via les hashes des transactions ; le bandeau `unreliable` apparaît même si la période a 0 transaction. Test ajouté [`server/api/transactions/index.get.ts`, `server/api/transactions/index.get.test.ts`]
- [x] [Review][Patch] Validation du paramètre `period` migrée vers `definePageMeta({ validate })` — Nuxt rejoue la guard à chaque navigation [`app/pages/transactions/[period].vue`]
- [x] [Review][Defer] Tests bootstrappent le schéma SQLite via `sqlite.exec(\`CREATE TABLE …\`)` au lieu d'exécuter les migrations Drizzle [`server/api/categories.get.test.ts:27-35`, `server/api/transactions/index.get.test.ts:806-837`] — deferred, pre-existing (pattern présent sur 4 fichiers de tests, refactor global)
- [x] [Review][Defer] Accès aux internals Drizzle via `@ts-expect-error db.$client ?? db.session?.client` dans les tests [`server/api/categories.get.test.ts:25-26`] — deferred, pre-existing (même pattern dans les autres tests)
- [x] [Review][Defer] `AppNav.currentPeriod` calculé une seule fois à l'init du composant : si la SPA reste ouverte par-dessus un changement de mois, le lien Transactions pointe sur l'ancien mois jusqu'au prochain reload [`app/components/shared/AppNav.vue:8-9`] — deferred, low impact (app local-first, refresh fréquent)
- [x] [Review][Defer] `CategoryEditor` attache un listener `document.click` par instance — avec N transactions, N handlers s'exécutent à chaque clic [`app/components/transactions/CategoryEditor.vue:40-43`] — deferred, optimisation perf (pas un blocker à 200 lignes)
- [x] [Review][Defer] Mock `event.path` fragile vis-à-vis des internals h3 [`server/api/transactions/index.get.test.ts:858`] — deferred, pre-existing pattern
