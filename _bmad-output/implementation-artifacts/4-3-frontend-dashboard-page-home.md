# Story 4.3: Frontend — `MonthlyNarrative`, `BalanceSummary`, `MonthSelector`, page `/`

Status: ready-for-dev

## Story

As a user,
I want the home page to show me why my account is in its current state,
so that I understand my situation in under 30 seconds.

## Acceptance Criteria

1. **Given** la home `app/pages/index.vue` (qui rend actuellement `<NuxtWelcome />` placeholder, cf. defer 1.1),
   **When** elle est ouverte,
   **Then** elle affiche en ordre vertical : `MonthSelector` → `BalanceSummary` → `MonthlyNarrative` → (si applicable) bandeau "Mois non fiable" → (si applicable) état vide CTA `/import`. Le titre `<h1>` ou `<h2>` est *« Tableau de bord »* (FR).

2. **Given** un composable `useDashboard(monthRef: Ref<string>)`,
   **When** créé dans `app/composables/useDashboard.ts`,
   **Then** il enveloppe `useFetch<DashboardResponse>('/api/dashboard', { query: { month: monthRef }, key: computed(...), default: () => emptyDashboard(), server: false })` selon le pattern `useTransactions` / `useStatementDetail`. Il expose `{ data, pending, error, refresh }`.

3. **Given** un composant `BalanceSummary.vue`,
   **When** il reçoit en prop `{ balanceCents, incomeCents, expenseCents }`,
   **Then** il affiche 3 chiffres formatés via `formatEuros` :
   - **Solde fin de mois** (mise en avant — gros caractères)
   - **Total revenus** (vert/positif, libellé "Revenus")
   - **Total charges** (rouge/négatif, libellé "Dépenses" — le signe `-` est conservé via `formatEuros`)

4. **Given** un composant `MonthlyNarrative.vue`,
   **When** il reçoit en prop `{ phrases: string[] }` (déjà formatées côté serveur — cf. story 4.1 AC#1),
   **Then** il affiche les phrases telles quelles, dans l'ordre. Si `phrases.length === 0`, il affiche *« Aucun écart marquant ce mois-ci par rapport aux mois précédents. »*. Pas d'animation, pas de scroll horizontal. **Le composant n'importe rien du serveur** : il consomme uniquement des `string[]`.

5. **Given** un composant `MonthSelector.vue`,
   **When** il est monté,
   **Then** il fetch la liste des mois ingérés via `useStatementsList()` (story 3.3, déjà créé) et affiche un select FR (mois `YYYY-MM` mapping vers libellé *« Avril 2026 »* via `Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' })`). Sélection émet `update:modelValue` (v-model).

6. **Given** la sélection d'un mois,
   **When** je change la valeur,
   **Then** l'URL met à jour `?month=YYYY-MM` via `useRouter().push({ query: { month } })` ou équivalent ; la home re-fetch via le `monthRef` réactif (le composable `useDashboard` doit refetch automatiquement). Pas de full reload.

7. **Given** la home s'ouvre sans `?month=`,
   **When** elle calcule le `monthRef` initial,
   **Then** elle prend **le mois le plus récent ingéré** (premier élément de `useStatementsList`). Si **aucun statement** n'est ingéré, `monthRef` vaut le mois courant (`YYYY-MM` aujourd'hui) — l'API renverra l'état vide (cf. story 4.1 AC#2).

8. **Given** un mois flagué `unreliable`,
   **When** la home l'affiche,
   **Then** un bandeau d'alerte est rendu via `<ReliabilityBadge :reliability="data.reliability" />` (story 3.3) **avec** un wrapper `role="alert"` pour cohérence avec `transactions/[period].vue` (cf. patch story 3.3). Aucun nouveau composant à créer pour le badge.

9. **Given** aucun statement n'est ingéré (`useStatementsList().data.value.statements.length === 0`),
   **When** la home se charge,
   **Then** elle affiche un état vide :
   - Titre : *« Aucun relevé importé »*
   - Texte : *« Importe ton premier relevé Boursorama pour voir apparaître ton dashboard. »*
   - CTA `<NuxtLink to="/import">` style bouton primaire : *« Importer un relevé »*

   Dans cet état, `BalanceSummary`, `MonthlyNarrative` et `MonthSelector` ne sont **pas** rendus.

10. **Given** un fetch en erreur (réseau, 500),
    **When** `error.value` est truthy,
    **Then** le composant affiche une alerte FR via `useApiError().mapError(error.value)` (cf. pattern `reconciliation/[hash].vue:35`). Pas de plantage.

11. **Given** les conventions CLAUDE.md,
    **When** la story est review,
    **Then** :
    - aucun composant ne fait `$fetch` direct (tout passe par les composables)
    - aucun `*100` / `/100` à la main (tout par helpers `money.ts`)
    - styles CSS vanilla en `<style scoped>` (pas de Tailwind)
    - libellés UI en FR
    - aucun store Pinia introduit (data serveur via composables)

12. **Given** des tests E2E,
    **When** ils s'exécutent,
    **Then** ils couvrent : (a) home avec un PDF ingéré → `BalanceSummary` visible + `MonthlyNarrative` rendu ; (b) home sans aucun statement → état vide + lien vers `/import` cliquable ; (c) navigation entre mois via `MonthSelector` met à jour URL et re-render. Les tests dépendent du même setup que `tests/e2e/reconciliation.spec.ts` (skip auto si pas d'`ANTHROPIC_API_KEY` ou pas de fixture).

## Tasks / Subtasks

- [ ] **Task 1 — Composable `useDashboard`** (AC: #2)
  - [ ] Créer `app/composables/useDashboard.ts`
  - [ ] Pattern : interface `DashboardResponse` (mirror du JSON serveur, avec `Cents` brand) ; factory `emptyDashboard()` (pas de singleton, cf. defer story 3.2)
  - [ ] `key: computed(() =>` `dashboard-${monthRef.value}` `)` ; `server: false`
  - [ ] Pas de mutation — read-only

- [ ] **Task 2 — Composant `BalanceSummary.vue`** (AC: #3)
  - [ ] `app/components/dashboard/BalanceSummary.vue`
  - [ ] Props : `balanceCents`, `incomeCents`, `expenseCents`
  - [ ] Mise en page : grid 3 colonnes desktop, stack mobile (utiliser tokens CSS existants `--space-*`)
  - [ ] Tabular-nums sur les chiffres (cohérent avec `transactions/[period].vue`)

- [ ] **Task 3 — Composant `MonthlyNarrative.vue`** (AC: #4)
  - [ ] `app/components/dashboard/MonthlyNarrative.vue`
  - [ ] Props : `phrases: string[]` (typé en clair, **aucun import** de `server/`)
  - [ ] Rendu : `<ul><li v-for="(p, i) in phrases" :key="i">{{ p }}</li></ul>` ou équivalent ; styling pour mise en avant de la 1ʳᵉ phrase si pertinent
  - [ ] Empty state : phrase fallback (cf. AC#4)

- [ ] **Task 4 — Composant `MonthSelector.vue`** (AC: #5, #6)
  - [ ] `app/components/dashboard/MonthSelector.vue`
  - [ ] v-model : `modelValue: string` (mois courant), `update:modelValue` à chaque sélection
  - [ ] Liste : statements triés DESC par `period_end` (déjà le cas dans `useStatementsList`) → mapper vers `{ value: 'YYYY-MM', label: 'Avril 2026' }` unique par mois
  - [ ] Format FR via `Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' })` sur `new Date(periodEnd + 'T00:00:00Z')`

- [ ] **Task 5 — Page `app/pages/index.vue`** (AC: #1, #6, #7, #8, #9, #10)
  - [ ] Remplacer `<NuxtWelcome />` (placeholder de story 1.1)
  - [ ] Synchro `monthRef` ↔ URL query `month` via `useRoute()` + `useRouter().push(...)` ; au mount, calculer `defaultMonth` = `statements[0]?.periodEnd.slice(0,7)` ?? `today.toISOString().slice(0,7)`
  - [ ] Layout : single column, espacement vertical `--space-4`
  - [ ] État vide branche AC#9
  - [ ] Bandeau unreliable AC#8

- [ ] **Task 6 — Tests E2E `tests/e2e/dashboard.spec.ts`** (AC: #12)
  - [ ] Pattern `tests/e2e/reconciliation.spec.ts` (skip auto si `!FIXTURE` ou `!ANTHROPIC_API_KEY`)
  - [ ] Cas (a) : ingest fixture → goto `/` → assert `BalanceSummary` rendu, narrative visible
  - [ ] Cas (b) : aucun statement (avant ingestion) → goto `/` → assert état vide + `[href="/import"]` cliquable
  - [ ] Cas (c) : 2 mois ingérés → MonthSelector → choisir le précédent → `expect(page).toHaveURL(/month=/)` + dashboard re-render

- [ ] **Task 7 — Sanity check final**
  - [ ] `yarn typecheck`, `yarn lint`, `yarn test:run` verts
  - [ ] `yarn dev` : ouvrir manuellement `/` → vérifier rendu, navigation MonthSelector, état vide en wipant `_data/app.db`
  - [ ] Aucun nouveau code d'erreur introduit
  - [ ] Commit unique

## Dev Notes

### Layout & priorité visuelle (FR37)

L'objectif PRD : *« comprendre en < 30 sec »*. Hiérarchie visuelle attendue :
1. Solde fin de mois (gros, central)
2. Décomposition revenus/dépenses (à côté)
3. 2-3 phrases narratives (en-dessous)
4. Sélecteur de mois (en haut, discret — pas l'élément le plus voyant)

Pas besoin de graphe / chart en V1 (FR37 ne le demande pas ; le forecast chart arrivera en story 7.6).

### Synchro URL ↔ état

Pourquoi mettre le mois dans l'URL ? FR40 — *« navigation entre les mois ingérés »*. URL = bookmarkable, partageable, navigable via back/forward natif.

Pattern simple :
```ts
const route = useRoute()
const router = useRouter()
const monthRef = computed({
  get: () => (route.query.month as string) || defaultMonth.value,
  set: (m) => router.push({ query: { ...route.query, month: m } }),
})
```

### Pourquoi un composable `useDashboard` plutôt qu'un `useFetch` inline

CLAUDE.md anti-pattern : *« Composant Vue qui fait `$fetch`/`useFetch` directement »*. Le composable centralise :
- la `key` réactive (refetch sur changement de mois)
- le `default` (factory pour éviter le partage de singleton — cf. defer story 3.2)
- la typage `DashboardResponse`

### Reliability — réutiliser `ReliabilityBadge`

Le composant a été créé en story 3.3. Pour la home, l'utiliser **dans un wrapper `role="alert"`** (cohérent avec le patch fait sur `transactions/[period].vue` en review story 3.3). Pas de duplication de "Mois non fiable"/"Mois fiable" — la propagation FR3 (story 3.3 AC#9) interdit toute duplication de ces strings.

### État vide — UX

Quand `useStatementsList().data.value.statements.length === 0`, le `useDashboard` fetch quand même (sur le mois courant) et renvoie tous zéros (`reliability: null`, `deltasVsPriorMonths: []`). On pourrait afficher la home zéros, mais cela créerait une UX confuse ("tout est à 0 ?"). Préférable : empty state dédié avec CTA.

Heuristique de détection : `statementsList.data.value.statements.length === 0`. Pas besoin d'attendre le fetch dashboard.

### Format FR des mois

`Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' })` produit `'avril 2026'` (minuscule). Capitalize :
```ts
const fmt = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' })
const label = fmt.format(d).replace(/^./, c => c.toUpperCase())
```

### Performance — pré-fetch

Pas de pré-fetch des mois précédents en V1 (NFR8 : "ressenti instantané quand possible", best-effort). Si la latence est gênante en prod, ajouter un `prefetch` sur les liens `MonthSelector`. KISS d'abord.

### Anti-patterns à éviter

- ❌ `$fetch('/api/dashboard'...)` direct dans la page (utiliser `useDashboard`)
- ❌ Reformatage manuel des montants (`balance.toFixed(2) + ' €'`) — utiliser `formatEuros`
- ❌ Wrapper Pinia autour de `data` (data serveur, pas data UI)
- ❌ Calcul des deltas côté UI (déjà fait par `pickTopDeltas` en serveur)
- ❌ Hardcoder le seuil "10 € / 20 %" côté UI (le serveur les applique déjà)
- ❌ Cache localStorage du dashboard (le `useFetch` Nuxt suffit + invalidation par `useInvalidate.invalidateDashboard()` côté forecast/futur ; ne pas réinventer)
- ❌ Importer `narrative-generator.ts` (`server/services/`) depuis un composant côté client : Nuxt exclut l'arbre `server/` du bundle client. Le formatage est fait côté serveur dans `dashboard.get.ts` qui expose `phrases: string[]` dans la réponse (cf. story 4.1 AC#1). `MonthlyNarrative.vue` consomme directement ces strings — aucun import du service requis.

### Project Structure Notes

Cette story crée :
- `app/composables/useDashboard.ts`
- `app/components/dashboard/BalanceSummary.vue`
- `app/components/dashboard/MonthlyNarrative.vue`
- `app/components/dashboard/MonthSelector.vue`
- `tests/e2e/dashboard.spec.ts`

Modifie :
- `app/pages/index.vue` (remplace placeholder NuxtWelcome — clôt le defer 1.1)
- éventuellement `server/api/dashboard.get.ts` pour ajouter `phrases: string[]` (cf. note ci-dessus)

### Definition of Done

- [ ] Page `/` rendue avec dashboard fonctionnel
- [ ] `MonthSelector` navigable, URL mise à jour
- [ ] État vide opérationnel
- [ ] Bandeau unreliable propagé
- [ ] 3 cas E2E passent
- [ ] Defer 1.1 (NuxtWelcome) clôturé
- [ ] `yarn typecheck`, `yarn lint`, `yarn test:run` verts
- [ ] Vérification manuelle `yarn dev` OK
- [ ] Commit unique

### References

- [Source: `_bmad-output/planning-artifacts/prd.md`#FR37-FR40] — règles métier home dashboard
- [Source: `_bmad-output/planning-artifacts/epics.md`#Story 4.3] — story originale
- [Source: `_bmad-output/planning-artifacts/architecture.md`#Project Structure (487), Domain → Touchpoints (686)]
- [Source: `CLAUDE.md`#Anti-patterns interdits] — composants → composables, pas de cache Pinia, pas de `$fetch` direct
- [Source: `app/composables/useTransactions.ts`] — pattern composable read+key réactif
- [Source: `app/composables/useReconciliation.ts`] — pattern factory `default` + `key: computed`
- [Source: `app/composables/useStatements.ts`] — `useStatementsList` à réutiliser pour MonthSelector
- [Source: `app/components/shared/ReliabilityBadge.vue`] — composant réutilisable
- [Source: `app/pages/transactions/[period].vue:64-71`] — pattern bandeau alerte unreliable
- [Source: `tests/e2e/reconciliation.spec.ts`] — pattern E2E avec skip conditionnel
- [Source: `_bmad-output/implementation-artifacts/deferred-work.md`] — defer 1.1 (NuxtWelcome) à clôturer
- [Stories précédentes :
  - `4-1-endpoint-get-api-dashboard` — fournit la réponse JSON consommée par `useDashboard`
  - `4-2-service-narrative-generator` — fournit `formatDelta` (côté serveur, sortie `phrases: string[]` en réponse 4.1)]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

### Change Log

### Review Findings
