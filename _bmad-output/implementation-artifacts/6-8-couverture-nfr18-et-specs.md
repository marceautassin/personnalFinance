# Story 6.8: Couverture NFR18 et honnêteté des specs

Status: ready-for-dev

## Story

As a dev,
I want the debt balance covered by tests and the specs to describe the real code,
so that a regression is caught and the documentation stops lying.

## Contexte de cadrage (à lire avant)

Deux natures de dette, toutes deux relevées le 2026-09-04.

**Couverture.** `server/utils/debt-balance.ts` est une **fonction de calcul financier** — donc
soumise au NFR18 — et n'a **aucun fichier de test dédié**. Sa couverture est indirecte via
`crud.test.ts`, où **tous les cas GET n'ont qu'une seule dette** : `balanceSumsByDebt`, qui est
le chemin de production de `GET /api/debts`, n'est jamais exercé sur plusieurs dettes.

Le reviewer a écrit et exécuté une sonde ad-hoc (3 dettes, avances, transactions marquées et non
marquées) : **les résultats sont corrects**. Il n'y a donc pas de bug à corriger, seulement un
filet à tendre. C'est le bon moment : tendre le filet avant que 6.5 ne réécrive la fonction.

**Specs qui mentent.** Deux endroits où la story raconte autre chose que le code :

1. L'AC#4 de la story 6.4 dit qu'une échéance `lump_sum` hors horizon met « toutes les entrées à
   0 ». En réalité `debt-projection.ts:69-72` impute une échéance **passée** au mois 0. Le
   comportement est défendable, mais il n'est écrit nulle part et le test l'entérine sans que la
   spec le dise.
2. La story annonce des cas limites « mois 28/29/30/31 jours ». Le reviewer a vérifié : ils sont
   **non applicables** — `projectDebt` raisonne uniquement en `YYYY-MM` via `nextMonths`, la
   longueur des mois lui est indifférente. Les réclamer entretiendrait la fiction d'un trou de
   couverture inexistant.

## Acceptance Criteria

1. **Given** `server/utils/debt-balance.test.ts`,
   **When** écrit,
   **Then** il couvre au minimum : **plusieurs dettes simultanées** (le chemin
   `balanceSumsByDebt`, jamais exercé au-delà d'une dette), une dette **sans aucun événement**,
   une transaction portant `debt_id` mais **non marquée** (doit être ignorée du solde), et un
   **solde négatif** par sur-remboursement.

2. **Given** `GET /api/debts/[id]/impact`,
   **When** testé,
   **Then** le mode `lump_sum` est couvert **au niveau endpoint** — c'est le seul mode dont le
   résultat dépend du mois courant serveur, donc le seul fragile. Seuls `monthly` et `free` le
   sont aujourd'hui (`crud.test.ts:278-303`).

3. **Given** l'AC#4 de la story 6.4,
   **When** amendée,
   **Then** elle décrit le comportement réel : une échéance `lump_sum` **passée** est imputée au
   **mois 0**. L'amendement est daté et motivé.
   **And** l'effet de bord est évalué et écrit : une lump sum datée d'il y a trois ans et jamais
   soldée fait **exploser le mois courant du forecast**. Si cet effet est jugé indésirable, le
   signaler comme story à ouvrir — ne pas le corriger en douce ici.

4. **Given** la mention des cas limites « mois 28/29/30/31 jours » dans la story 6.4,
   **When** corrigée,
   **Then** elle est retirée et remplacée par la raison : `projectDebt` raisonne en `YYYY-MM`,
   la longueur des mois lui est indifférente. **Ne pas ajouter de tests inutiles pour cocher une
   case.**

5. **Given** `app/components/debts/DebtImpactOnDividend.vue`,
   **When** renommé,
   **Then** il devient `DebtProjectedExpense.vue` — il affiche des dépenses projetées, pas un
   dividende, et ne peut pas en afficher un (cadrage de la story 6.4). Le nom promettait ce que
   le composant ne fait pas.

6. **Given** `server/api/transactions/[id].patch.ts:34`,
   **When** corrigé,
   **Then** `isManual` n'est posé que si `categoryCode` est présent dans le patch. Ce flag
   signifie « transaction saisie ou **corrigée** à la main » ; rattacher une transaction à une
   dette n'est pas une correction de catégorisation.

7. **Given** l'ensemble,
   **When** review,
   **Then** aucun test n'est ajouté pour un cas que le code rend structurellement impossible
   (cf. AC#4), et chaque amendement de spec porte sa date et son motif.

## Tasks / Subtasks

- [ ] **Task 1 — `debt-balance.test.ts`** (AC: #1)
  - [ ] 4 cas minimum listés en AC#1

- [ ] **Task 2 — Couverture endpoint** (AC: #2)
  - [ ] `lump_sum` au niveau `impact.get.ts`

- [ ] **Task 3 — Amendements de specs** (AC: #3, #4)
  - [ ] AC#4 de 6.4 réécrite (lump sum passée → mois 0) + effet de bord évalué
  - [ ] Mention « mois 28/31 » retirée avec justification

- [ ] **Task 4 — Nommage et sémantique** (AC: #5, #6)
  - [ ] `DebtImpactOnDividend.vue` → `DebtProjectedExpense.vue`
  - [ ] `isManual` conditionné à la présence de `categoryCode`

- [ ] **Task 5 — Sanity** (AC: #7)
  - [ ] `typecheck`, `lint`, `test:run`, `test:e2e` verts

## Dev Notes

### Ordre par rapport à 6.5
Si 6.5 est faite avant, `debt-balance.test.ts` doit être écrit **contre le ledger signé** et
inclure un cas d'événement négatif. Si 6.8 passe avant, les tests seront à reprendre en 6.5 —
d'où le placement en dernier.

### Ce qui n'est PAS demandé
Aucun test sur la longueur des mois (AC#4). Aucune correction du comportement `lump_sum` passée
(AC#3 demande de le **documenter et d'évaluer**, pas de le changer) — le modifier sans décision
produit reviendrait à changer le forecast en silence.

## References
- [Source: `CLAUDE.md`#Tests — discipline, #NFR18]
- [Source: prd.md#NFR18]
- [Revue epic 6 du 2026-09-04 — MAJEUR absence de `debt-balance.test.ts`, 3 MINEURS specs/nommage]
- [Story 6.4 — AC#4 à amender, `debt-projection.ts:69-72`]
