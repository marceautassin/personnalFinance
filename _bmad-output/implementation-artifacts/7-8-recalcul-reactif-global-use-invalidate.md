# Story 7.8: Recalcul réactif global — `useInvalidate` (FR53)

Status: done

## Story

As a user,
I want the forecast (and dashboard) to recompute automatically after any model change or ingestion,
so that what I see is always consistent with the latest data (FR53).

## Acceptance Criteria

1. **Given** `useInvalidate`,
   **Then** `invalidateForecast()` rafraîchit les `useFetch` forecast (clés `forecast-{6,12,24}`) — plus de no-op stub.
2. **Given** `invalidateDashboard()`,
   **Then** il rafraîchit les données actives (clés dashboard dynamiques `dashboard-${month}` → `refreshNuxtData()` sans clé, borné à ce qui est monté).
3. **Given** toutes les mutations de modèle (charges, revenus, SAS, fiscalité, dettes, transactions, overrides) et l'ingestion,
   **Then** elles appellent déjà `invalidateForecast`/`invalidateDashboard` (via `runMutation`/`useMutations`/`useStatements`) → l'implémentation réelle suffit à câbler FR53 partout.
4. **Given** des tests unitaires,
   **Then** `invalidateForecast` appelle `refreshNuxtData(['forecast-6','forecast-12','forecast-24'])` ; `invalidateDashboard` appelle `refreshNuxtData()` ; `invalidateStatementsList` cible `'statements-list'`.
5. **Given** CLAUDE.md,
   **Then** : pas de cache Pinia de données serveur ; le forecast reste pur/recalculé (D9) ; aucun état dérivé.

## Tasks / Subtasks

- [x] **Task 1 — Implémenter `useInvalidate`** (AC: #1, #2) — forecast keys + refresh global dashboard
- [x] **Task 2 — Vérifier les appelants** (AC: #3) — mutations + ingestion appellent déjà les invalidations
- [x] **Task 3 — Tests** (AC: #4) — `useInvalidate.test.ts`
- [x] **Task 4 — Sanity** — typecheck/lint/test verts ; E2E forecast (override → recalcul) OK

## Dev Notes

### Câblage déjà en place
Les composables de mutation (`useMutations`/`runMutation`) et `useStatements` (ingestion) appelaient
déjà `invalidateForecast`/`invalidateDashboard` (stubs). 7.8 = remplacer les stubs par le vrai
`refreshNuxtData`. Aucun autre point à toucher.

### Clés
- Forecast : ensemble borné `{6,12,24}` → refresh ciblé.
- Dashboard : clés par mois dynamiques → `refreshNuxtData()` (rafraîchit l'actif monté). Le dashboard
  étant read-only, l'invalidation ne concerne en pratique que la vue courante après mutation ailleurs.

### Catégories
Les mutations de catégories n'appellent pas `invalidateForecast` : une catégorie variable nouvelle/
renommée sans transactions contribue 0 au forecast (projection sur l'historique) — aucun impact
numérique. Documenté.

### References
- [Source: prd.md#FR53]
- [Source: architecture.md:254-258 (D9 forecast pur), 427 (invalidation UI sur mutation)]
- [Source: `useForecast.ts` (7.6), `useDashboard.ts`, `useMutations.ts`, `useStatements.ts`]

## Dev Agent Record

### Agent Model Used

Agent de développement.

### Completion Notes List

- `useInvalidate.invalidateForecast` → `refreshNuxtData(['forecast-6','forecast-12','forecast-24'])` ; `invalidateDashboard` → `refreshNuxtData()`. Stubs supprimés.
- Câblage FR53 complet sans toucher les appelants (déjà en place depuis les refactors précédents).
- 3 tests unitaires (`refreshNuxtData` mocké). E2E forecast (override → forecast refetch) inchangé et vert.

### File List

- `app/composables/useInvalidate.ts` (modifié — implémentation réelle)
- `app/composables/useInvalidate.test.ts` (nouveau)

### Change Log

- 2026-07-09 : Implémentation story 7.8 — recalcul réactif global (`useInvalidate`, FR53). Status → review.

### Review Findings

Code review du 2026-07-19 (Blind Hunter + Edge Case Hunter + Acceptance Auditor). **Aucun finding.**
Câblage FR53 vérifié de bout en bout, y compris hors diff : `invalidateForecast` →
`refreshNuxtData(['forecast-6','forecast-12','forecast-24'])`, `invalidateDashboard` →
`refreshNuxtData()`, stubs supprimés. `useMutations` appelle bien les deux invalidations et est
consommé par les mutations charges/revenus/SAS/fiscalité/dettes/transactions ; `useOverrides`,
`useStatements` et `useReconciliation` invalident également.

*(Le `await` manquant sur `invalidateForecast()` dans `useOverrides` a été corrigé côté story 7.7.)*
