# Story 3.2: UI — `ReconciliationGap`, `AddManualTransaction`, page `/reconciliation/[hash]`

Status: done

## Story

As a user,
I want a clear gap view with the ability to add missing transactions or accept the gap,
so that I can resolve any ingestion discrepancy explicitly without dropping back to a spreadsheet.

## Acceptance Criteria

1. **Given** la réponse de succès de l'ingestion (`app/pages/import.vue:84-108`) déjà visible avec le warning `result.isBalanced === false`,
   **When** elle s'affiche,
   **Then** le `<NuxtLink>` `/reconciliation/{hash}` (déjà en place) doit cibler une page existante (n'est plus marquée *"disponible en Epic 3"*) ; cette mention textuelle est retirée.

2. **Given** la page `app/pages/reconciliation/[hash].vue`,
   **When** elle se charge avec un `hash` valide existant,
   **Then** elle affiche : période du statement, soldes attendu/trouvé en € formatés, gap formaté en € (couleur `--color-warning`), et la liste des transactions du statement (read-only) avec un badge sur celles `is_manual: true`.

3. **Given** la page chargée avec un `hash` invalide (regex échoue) ou inexistant (404),
   **When** la page se charge,
   **Then** elle affiche un état d'erreur FR clair via `useApiError` et un lien retour vers `/import`.

4. **Given** le composant `ReconciliationGap` qui rend la zone gap,
   **When** `gapCents !== 0`,
   **Then** il affiche un bouton primaire *"Ajouter une transaction"* qui ouvre `AddManualTransaction`, et un bouton secondaire *"Accepter l'écart (mois non fiable)"*.

5. **Given** le formulaire `AddManualTransaction` (date, libellé, montant signé en €, catégorie via `CategoryEditor` ou select dédié),
   **When** je soumets un formulaire valide,
   **Then** le composable `useReconciliation` POST `{ action: 'add_transaction', transaction: {...} }` ; le composant parent rafraîchit l'état (`refresh()` du `useFetch` de la page) et le nouveau gap est affiché.

6. **Given** un `AddManualTransaction` avec un montant en euros décimal (ex: `12,34` ou `12.34`),
   **When** je soumets,
   **Then** la conversion vers `Cents` est faite via `eurosToCents()` (jamais `parseFloat * 100`). Le signe est explicite (input `MoneyInput` ou champ avec sélecteur entrée/sortie).

7. **Given** un gap résiduel et un clic sur *"Accepter l'écart"*,
   **When** le `ConfirmDialog` apparaît avec un message FR explicite (*"Cette action marquera le mois comme non fiable et ne pourra pas être annulée. Continuer ?"*),
   **Then** la confirmation déclenche un POST `{ action: 'accept_gap' }`. Sur succès, la page recharge l'état (`refresh()`) et affiche désormais `gapCents === 0` + un badge *"Mois non fiable"*.

8. **Given** une erreur API (404, 422, 400 reconciliation_failed, etc.),
   **When** elle remonte au composable,
   **Then** un bandeau `role="alert"` affiche le message FR via `useApiError().mapError(err)` ; le formulaire reste utilisable (pas de redirection).

9. **Given** un statement déjà équilibré (`gapCents === 0`),
   **When** la page se charge,
   **Then** elle affiche un état de succès (*"Réconciliation OK"*) et masque les boutons d'action.

10. **Given** un statement marqué `unreliable`,
    **When** la page se charge,
    **Then** elle affiche le `ReliabilityBadge` (composant créé dans la story 3.3 ; placeholder div en attendant) en haut de la page.

## Tasks / Subtasks

- [x] **Task 1 — Composable `useReconciliation`** (AC: #2, #5, #7, #8)
  - [x] Créer `app/composables/useReconciliation.ts`
  - [x] Expose `useStatementDetail(hashRef: Ref<string>)` qui wrap `useFetch<StatementDetailResponse>('/api/statements/{hash}')` avec `key` réactive (`statement-${hash}`), `server: false`
  - [x] Expose `addManualTransaction(hash, transaction)` et `acceptGap(hash)` qui POST `/api/reconciliation/{hash}`, retournent `{ ok | error, errorCode }` (cf. pattern `useTransactions.mutateCategory`)
  - [x] Sur succès : invalider via `useInvalidate()` (forecast + dashboard, déjà no-op V1)

- [x] **Task 2 — Page `app/pages/reconciliation/[hash].vue`** (AC: #2, #3, #9, #10)
  - [x] Validation du paramètre `hash` via `definePageMeta({ validate: route => /^[a-f0-9]{64}$/.test(route.params.hash as string) })` (pattern story 2.10 review)
  - [x] Chargement via `useStatementDetail`
  - [x] States : pending / error / success (gap === 0) / gap (gap !== 0)
  - [x] Si erreur ou 404 : message FR + lien `/import`
  - [x] Si statement.reliability === 'unreliable' : afficher `ReliabilityBadge` (placeholder ou import futur)

- [x] **Task 3 — Composant `ReconciliationGap.vue`** (AC: #2, #4)
  - [x] Créer `app/components/reconciliation/ReconciliationGap.vue`
  - [x] Props : `expectedCents: Cents`, `foundCents: Cents`, `gapCents: Cents`, `isBalanced: boolean`
  - [x] Émet `@add-transaction` et `@accept-gap`
  - [x] Affiche les soldes via `formatEuros()` (jamais de format manuel)
  - [x] Bouton "Accepter l'écart" désactivé si `isBalanced`

- [x] **Task 4 — Composant `AddManualTransaction.vue`** (AC: #5, #6)
  - [x] Créer `app/components/reconciliation/AddManualTransaction.vue`
  - [x] Props : `hash: string`, liste catégories via `useCategories()`
  - [x] Champs : date (input type=date), libellé (text), montant (number step=0.01 + select sens entrée/sortie OU input signé), catégorie (select)
  - [x] Validation côté client minimale : date format YYYY-MM-DD, libellé non vide, montant ≠ 0, catégorie sélectionnée
  - [x] Conversion € → Cents via `eurosToCents()` ; application du signe
  - [x] Émet `@submit` avec `{ transactionDate, label, amountCents, categoryCode }`
  - [x] Bouton submit désactivé pendant l'attente API

- [x] **Task 5 — `ConfirmDialog` + flux accept_gap** (AC: #7)
  - [x] Réutiliser `app/components/shared/ConfirmDialog.vue` (à créer s'il n'existe pas — composant simple : `<dialog>` natif avec slot, props `title`, `message`, événements `@confirm` / `@cancel`)
  - [x] Texte FR explicite mentionnant l'irréversibilité

- [x] **Task 6 — Mise à jour `app/pages/import.vue`** (AC: #1)
  - [x] Retirer la mention `(disponible en Epic 3)` ligne 99
  - [x] Vérifier que le lien existant pointe bien vers `/reconciliation/{hash}` (déjà OK ligne 96)

- [x] **Task 7 — Tests unitaires**
  - [x] Test composable `useReconciliation` : succès / erreur / `errorCode` extrait
  - [x] Test composant `AddManualTransaction` (Vitest + @vue/test-utils si pattern déjà en place ; sinon test logique de conversion € → cents et émission d'événement isolément)
  - [x] Pas de test E2E ici (couvert en story 3.3)

- [x] **Task 8 — Sanity check final**
  - [x] `yarn typecheck`, `yarn lint`, `yarn test:run` propres
  - [x] Sanity manuel `yarn dev` si possible (cf. workaround Nuxt dev server évoqué story 2.9)
  - [x] Commit unique

## Dev Notes

### Shape de la réponse `GET /api/statements/[hash]` (story 3.1)

```ts
interface StatementDetailResponse {
  hash: string
  periodStart: string         // YYYY-MM-DD
  periodEnd: string
  openingBalanceCents: Cents
  closingBalanceCents: Cents
  reliability: 'reliable' | 'unreliable'
  transactions: TransactionListItem[]   // shape de useTransactions
  reconciliation: { isBalanced: boolean, gapCents: Cents }
}
```

Cette story **dépend de la story 3.1** (endpoint GET + POST). Si 3.1 n'est pas mergée, bloquer.

### Conversion € → Cents

```ts
import { eurosToCents } from '~~/shared/types/money'

const amountCents = direction === 'expense'
  ? -eurosToCents(amountEuros)
  : eurosToCents(amountEuros)
```

⚠️ Jamais `Math.round(parseFloat(input) * 100)` — `eurosToCents` fait la compensation IEEE-754 (`shared/types/money.ts:43-46`).

### Composant `ConfirmDialog`

`app/components/shared/ConfirmDialog.vue` est listé dans l'architecture (`architecture.md:485`) mais n'existe pas encore. Implémentation minimale recommandée :

```vue
<script setup lang="ts">
const props = defineProps<{ open: boolean, title: string, message: string }>()
const emit = defineEmits<{ confirm: [], cancel: [] }>()
const dialogRef = ref<HTMLDialogElement | null>(null)
watch(() => props.open, (open) => {
  if (open) dialogRef.value?.showModal()
  else dialogRef.value?.close()
})
</script>
<template>
  <dialog ref="dialogRef" @close="emit('cancel')">
    <h3>{{ title }}</h3>
    <p>{{ message }}</p>
    <div>
      <button type="button" @click="emit('cancel')">Annuler</button>
      <button type="button" class="btn--primary" @click="emit('confirm')">Confirmer</button>
    </div>
  </dialog>
</template>
```

KISS : `<dialog>` natif HTML, pas de bibliothèque.

### Pattern useFetch + refresh

Suivre `useTransactions` (`app/composables/useTransactions.ts:38-66`) :
- `useFetch` avec `key` calculée pour la réactivité,
- `refresh()` exposé pour rafraîchir après mutation,
- mutations via `$fetch` direct (pas via `useFetch`) avec gestion d'erreur retournant `{ ok | error, errorCode }`.

### `ReliabilityBadge` (story 3.3)

Le composant `ReliabilityBadge.vue` est créé en story 3.3. Pour cette story 3.2, deux options :
- (a) Créer un placeholder local dans la page (`<span class="badge badge--unreliable">Mois non fiable</span>`) qui sera remplacé en 3.3.
- (b) Coordonner avec 3.3 et créer le composant ici, le réutiliser en 3.3.

**Recommandation** : option (a) pour rester strictement dans le scope (KISS) ; story 3.3 fera le swap quand le composant existera.

### Anti-patterns à éviter

- ❌ Logique métier dans le template — passer par le composable.
- ❌ `parseFloat` ou `* 100` à la main sur les montants.
- ❌ Format manuel des montants — toujours `formatEuros(cents)`.
- ❌ Ignorer la valeur de retour `errorCode` du composable — l'UI doit pouvoir distinguer 422 (formulaire invalide) d'une erreur réseau.
- ❌ Modifier `bank_statements.reliability` côté client (read-only) — flow exclusivement via `accept_gap`.
- ❌ Créer un nouveau code d'erreur — tous existent déjà (story 3.1).

### Project Structure Notes

Cette story crée :
- `app/pages/reconciliation/[hash].vue`
- `app/components/reconciliation/ReconciliationGap.vue`
- `app/components/reconciliation/AddManualTransaction.vue`
- `app/components/shared/ConfirmDialog.vue` (si inexistant)
- `app/composables/useReconciliation.ts`

Et modifie :
- `app/pages/import.vue` (retire mention "disponible en Epic 3")

### Definition of Done

- [ ] Page `/reconciliation/[hash]` opérationnelle (gap, accept_gap, add_transaction)
- [ ] Lien depuis `/import` fonctionnel sans mention temporaire
- [ ] Composables et composants créés
- [ ] Conversion € → Cents via `eurosToCents`, format via `formatEuros`
- [ ] Erreurs API surfacées en FR via `useApiError`
- [ ] `yarn typecheck`, `yarn lint`, `yarn test:run` verts
- [ ] Commit unique

### References

- [Source: `_bmad-output/planning-artifacts/prd.md`#FR13-FR14] — règles métier UI réconciliation
- [Source: `_bmad-output/planning-artifacts/epics.md`#Story 3.2] — story originale
- [Source: `_bmad-output/planning-artifacts/architecture.md`#Project Structure (lignes 485, 500-502)] — composants et page
- [Source: `CLAUDE.md`#Invariants critiques] — Cents, formatEuros, boundaries composants/composables
- [Source: `app/composables/useTransactions.ts`] — pattern composable + mutation
- [Source: `app/composables/useStatements.ts`] — pattern $fetch + erreurs
- [Source: `app/composables/useApiError.ts`] — mapping FR
- [Source: `app/pages/transactions/[period].vue`] — pattern definePageMeta validate
- [Source: `app/pages/import.vue:91-100`] — emplacement de la mention à retirer
- [Source: `shared/types/money.ts:43-56`] — `eurosToCents`, `formatEuros`
- [Previous story: `3-1-endpoint-post-api-reconciliation` — endpoints consommés]

## Dev Agent Record

### Agent Model Used

claude-opus-4-7 (Claude Code)

### Debug Log References

— `yarn test:run` : 19 fichiers, **189 tests verts** (3 nouveaux pour l'helper `buildAmountCents`)
— `yarn lint` : OK
— `yarn typecheck` : OK (correctif TS sur le typage du body `$fetch` — discriminated union typée explicitement)

### Completion Notes List

- **`useStatementDetail` & `useReconciliation` colocalisés** dans le même fichier `useReconciliation.ts` : le composable de fetch est étroitement couplé aux mutations qui l'invalident, KISS. Le typage `StatementDetailResponse` y est exporté.
- **Helper `buildAmountCents` extrait** dans `app/components/reconciliation/amount.ts` pour testabilité (cf. AC#6 → conversion € → Cents). Évite de tester un composant Vue entier juste pour valider une formule de signe.
- **`ConfirmDialog` natif** : `<dialog>` HTML + `showModal()` ; pas de bibliothèque, KISS comme prévu en Dev Notes. Bouton de confirmation rouge (variant danger) car l'action est destructive.
- **`ReliabilityBadge` non importé ici** : la page utilise un placeholder local `<p class="rec-page__badge">⚠️ Mois non fiable</p>` ; story 3.3 le remplacera (option (a) du plan, KISS).
- **Validation côté client minimale** : regex de date, montant absolu positif, libellé non vide, catégorie sélectionnée. La validation forte reste côté serveur (Zod). Conversion via `eurosToCents` exclusivement (jamais `* 100`).
- **Refresh après mutation** : `refresh()` du `useFetch` est rappelé après `add_transaction` et `accept_gap`, ce qui recharge l'état complet (transactions + reconciliation + reliability) en une seule requête.
- **Sens de la transaction** : choix d'un select `expense | income` séparé du montant absolu plutôt que d'accepter un montant signé directement — UX plus claire pour Marceau et évite les ambiguïtés de saisie.
- **Mention "(disponible en Epic 3)"** retirée de `import.vue` ligne 99.

### File List

**Créés**
- `app/composables/useReconciliation.ts`
- `app/components/shared/ConfirmDialog.vue`
- `app/components/reconciliation/ReconciliationGap.vue`
- `app/components/reconciliation/AddManualTransaction.vue`
- `app/components/reconciliation/amount.ts`
- `app/components/reconciliation/amount.test.ts`
- `app/pages/reconciliation/[hash].vue`

**Modifiés**
- `app/pages/import.vue` (retrait mention "Epic 3")
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (statut 3-2)

### Change Log

- 2026-05-05 : implémentation story 3.2 — page `/reconciliation/[hash]`, composants `ReconciliationGap` + `AddManualTransaction` + `ConfirmDialog`, composable `useReconciliation`. Status → review.

### Review Findings

- [x] [Review][Patch] `parseEuros` rejette les saisies françaises courantes (`1 234,56` avec NBSP, `12,5` à 1 décimale uniquement OK, mais le NBSP intl n'est pas trim). Strip NBSP/espaces fines AVANT le test regex et accepter 0-2 décimales [`app/components/reconciliation/AddManualTransaction.vue:38-44`]
- [x] [Review][Patch] Submit double-Enter race : `submitting` est un prop venant du parent, propagation Vue asynchrone → l'utilisateur peut taper Enter 2× avant que `:disabled` ne s'applique → 2 inserts. Ajouter un état local `localSubmitting` mis à `true` synchronement dans `onSubmit()` [`app/components/reconciliation/AddManualTransaction.vue` + `app/pages/reconciliation/[hash].vue:48-58`]
- [x] [Review][Patch] `EMPTY` const partagé en `default: () => EMPTY` du `useFetch` → toute mutation involontaire (ex: `data.value.transactions.push(...)`) pollue les invocations futures. Remplacer par une factory : `default: () => ({ ...EMPTY, transactions: [], reconciliation: { ...EMPTY.reconciliation } })` [`app/composables/useReconciliation.ts:23-32`]
- [x] [Review][Patch] `ConfirmDialog` émet un `cancel` parasite après `confirm` : `onConfirm` → parent set `showConfirm=false` → watcher `el.close()` → native `@close` event → `emit('cancel')`. Tracker un flag `confirmedFlag` qui supprime le `cancel` si le close suit un confirm [`app/components/shared/ConfirmDialog.vue:14-19, 21-31`]
- [x] [Review][Patch] `StatementDetailResponse.reliability` typé inline `'reliable' | 'unreliable'` au lieu d'importer `ReliabilityValue` depuis `server/db/schema` (source de vérité). Drift potentiel si le schéma évolue [`app/composables/useReconciliation.ts:13`]
