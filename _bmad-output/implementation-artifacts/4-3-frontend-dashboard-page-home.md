# Story 4.3: Frontend — `MonthlyNarrative`, `BalanceSummary`, `MonthSelector`, page `/`

Status: review

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

- [x] **Task 1 — Composable `useDashboard`** (AC: #2)
  - [x] Créer `app/composables/useDashboard.ts`
  - [x] Pattern : interface `DashboardResponse` (mirror du JSON serveur, avec `Cents` brand) ; factory `emptyDashboard()` (pas de singleton, cf. defer story 3.2)
  - [x] `key: computed(() =>` `dashboard-${monthRef.value}` `)` ; `server: false`
  - [x] Pas de mutation — read-only

- [x] **Task 2 — Composant `BalanceSummary.vue`** (AC: #3)
  - [x] `app/components/dashboard/BalanceSummary.vue`
  - [x] Props : `balanceCents`, `incomeCents`, `expenseCents`
  - [x] Mise en page : grid responsive (stack mobile, 2 colonnes ≥640px) via tokens CSS `--space-*`
  - [x] Tabular-nums sur les chiffres (cohérent avec `transactions/[period].vue`)

- [x] **Task 3 — Composant `MonthlyNarrative.vue`** (AC: #4)
  - [x] `app/components/dashboard/MonthlyNarrative.vue`
  - [x] Props : `phrases: string[]` (typé en clair, **aucun import** de `server/`)
  - [x] Rendu : `<ul><li v-for>` ; mise en avant de la 1ʳᵉ phrase (`--primary`)
  - [x] Empty state : phrase fallback (cf. AC#4)

- [x] **Task 4 — Composant `MonthSelector.vue`** (AC: #5, #6)
  - [x] `app/components/dashboard/MonthSelector.vue`
  - [x] v-model : `modelValue: string`, `update:modelValue` à chaque sélection
  - [x] Liste : statements triés DESC par `period_end` (déjà le cas dans `useStatementsList`) → mapper vers `{ value: 'YYYY-MM', label }` unique par mois
  - [x] Format FR via `Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' })` sur `new Date(periodEnd + 'T00:00:00Z')`, capitalisé

- [x] **Task 5 — Page `app/pages/index.vue`** (AC: #1, #6, #7, #8, #9, #10)
  - [x] Remplacer le placeholder (clôt le defer 1.1)
  - [x] Synchro `monthRef` ↔ URL query `month` via `useRoute()` + `useRouter().push(...)` ; `defaultMonth` = `statements[0]?.periodEnd.slice(0,7)` ?? mois courant
  - [x] Layout : single column, espacement vertical `--space-4`
  - [x] État vide branche AC#9
  - [x] Bandeau unreliable AC#8 + erreur AC#10

- [x] **Task 6 — Tests E2E `tests/e2e/dashboard.spec.ts`** (AC: #12)
  - [x] Pattern `tests/e2e/reconciliation.spec.ts` (skip auto si `!FIXTURE` ou `!ANTHROPIC_API_KEY`), `describe.serial`
  - [x] Cas (a) : ingest fixture → goto `/` → assert solde + narrative rendus
  - [x] Cas (b) : aucun statement → goto `/` → assert état vide + `[href="/import"]` cliquable
  - [x] Cas (c) : ≥2 mois → MonthSelector → choisir un autre → `toHaveURL(/month=/)` + re-render (skip si <2 mois)

- [x] **Task 7 — Sanity check final**
  - [x] `yarn typecheck`, `yarn lint`, `yarn test:run` verts (216 tests, 0 régression)
  - [x] `yarn dev` : serveur OK, `/api/dashboard` peuplé pour le mois par défaut réel (`2026-03`), reliability propagée. Smoke browser non exécuté : Playwright ne supporte pas l'OS du sandbox (ubuntu 26.04) — validation via réponses serveur + types.
  - [x] Aucun nouveau code d'erreur introduit
  - [ ] Commit unique (en attente du feu vert utilisateur)

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

Claude Opus 4.8 (1M context)

### Debug Log References

- `yarn dev` + `curl` : bootstrap OK, `/api/statements` (200) et `/api/dashboard?month=2026-03` (200, données peuplées : balance 1 023,98 €, 3 deltas, reliability `reliable`). Le relevé de dev couvre `2026-02-28 → 2026-03-31` (statement à cheval), donc `defaultMonth` = `2026-03`.
- Smoke test navigateur impossible : `npx playwright install chromium` échoue (Playwright ne supporte pas ubuntu 26.04 sur ce sandbox). Validation reportée sur les réponses serveur + typecheck.

### Completion Notes List

- **Composable `useDashboard`** : miroir client de `DashboardResponse` (types `server/` non importables côté client), factory `emptyDashboard()` fraîche par appel, `key` réactive `dashboard-${month}`, `server: false`. Read-only.
- **`BalanceSummary.vue`** : solde mis en avant (`--font-size-3xl`), revenus (vert) / dépenses (rouge, signe `-` préservé via `formatEuros`). `tabular-nums`. Grid responsive (stack mobile → 2 colonnes ≥640px).
- **`MonthlyNarrative.vue`** : afficheur pur de `string[]`, 1ʳᵉ phrase en gras, fallback FR si vide. Aucun import serveur.
- **`MonthSelector.vue`** : v-model `string`, mois uniques dédupliqués depuis `useStatementsList` (déjà trié DESC), libellé FR capitalisé.
- **`index.vue`** : remplace le placeholder (clôt defer 1.1). `monthRef` ↔ URL `?month=`, `defaultMonth` = mois le plus récent ingéré sinon mois courant. État vide (zéro relevé) avec CTA `/import`, bandeau unreliable (`role="alert"` + `ReliabilityBadge`), message d'erreur via `useApiError`.
- **E2E** : 3 cas en `describe.serial`, skip auto sans fixture/clé (pattern reconciliation). Cas (c) skip dynamique si <2 mois ingérés.
- Aucun nouveau code d'erreur, aucun `$fetch` direct dans un composant, aucun store Pinia, pas de `*100`/`/100` manuel, styles CSS vanilla scoped, libellés FR.

### File List

- `app/composables/useDashboard.ts` (NEW)
- `app/components/dashboard/BalanceSummary.vue` (NEW)
- `app/components/dashboard/MonthlyNarrative.vue` (NEW)
- `app/components/dashboard/MonthSelector.vue` (NEW)
- `app/pages/index.vue` (MODIFIED — remplace le placeholder, clôt defer 1.1)
- `tests/e2e/dashboard.spec.ts` (NEW)

### Change Log

- 2026-05-31 : implémentation story 4.3 — page `/` dashboard (BalanceSummary, MonthlyNarrative, MonthSelector), composable `useDashboard`, synchro URL ↔ mois, état vide, bandeau unreliable, 3 cas E2E. Typecheck/lint/216 tests verts. Status → review.
- 2026-05-31 : patches review (Blind/Edge/Auditor, 12/12 AC PASS) — `MonthSelector` formate les labels en `timeZone: 'UTC'`, E2E scope les assertions BalanceSummary au composant `.balance`.

### Review Findings

Code review adversariale (Blind Hunter + Edge Case Hunter + Acceptance Auditor) — 2026-05-31. Verdict Auditor : **12/12 AC PASS**, aucune violation de convention.

- [x] [Review][Patch] `MonthSelector` : libellé de mois formaté sans `timeZone: 'UTC'` → label/valeur pouvaient diverger d'un mois selon le fuseau. Corrigé (formatter en UTC). [`app/components/dashboard/MonthSelector.vue`]
- [x] [Review][Patch] E2E : `getByText(/Revenus/i)` percutait potentiellement une phrase narrative (strict mode → échec faux-positif). Corrigé : assertions scopées au composant `.balance`. [`tests/e2e/dashboard.spec.ts`]
- [x] [Review][Defer] Flash des données du mois précédent pendant le refetch au changement de mois — identique au pattern accepté de `transactions/[period].vue` (fetch local quasi-instantané). [`app/pages/index.vue`] — deferred, cohérence pattern
- [x] [Review][Defer] E2E cas (c) skip quasi-systématique (fixture mono-mois) — nécessite une fixture 2 mois. [`tests/e2e/dashboard.spec.ts`] — deferred
- [x] [Review][Defer] E2E état vide suppose `_data` fraîche (non enforced) — hygiène E2E commune à la suite. [`tests/e2e/dashboard.spec.ts`] — deferred
- [x] [Review][Defer] Pas d'état « mois sans données » dédié + desync `MonthSelector` si `?month=` pointe un mois non-ingéré — atteignable seulement via URL manuelle (le selector n'offre que des mois valides). [`app/pages/index.vue`] — deferred, edge

Écartés (7) : double-fetch cold-load (invisible, KISS/NFR8), URL `/` sans `?month` au défaut (par design), `router.push` duplicate (VR4 ne throw pas + `<select>` n'émet pas sur valeur identique), `:key="i"` (texte pur), flash `<h1>` pendant load statements (négligeable), signe `expenseCents` (conforme AC#3), type `data` nullable (factory `default` garantit non-null).
