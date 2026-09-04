# Story 6.8: Couverture NFR18 et honnêteté des specs

Status: review

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

- [x] **Task 1 — `debt-balance.test.ts`** (AC: #1)
  - [x] 4 cas minimum listés en AC#1

- [x] **Task 2 — Couverture endpoint** (AC: #2)
  - [x] `lump_sum` au niveau `impact.get.ts`

- [x] **Task 3 — Amendements de specs** (AC: #3, #4)
  - [x] AC#4 de 6.4 réécrite (lump sum passée → mois 0) + effet de bord évalué
  - [x] Mention « mois 28/31 » retirée avec justification

- [x] **Task 4 — Nommage et sémantique** (AC: #5, #6)
  - [x] `DebtImpactOnDividend.vue` → `DebtProjectedExpense.vue`
  - [x] `isManual` conditionné à la présence de `categoryCode`

- [x] **Task 5 — Sanity** (AC: #7)
  - [x] `typecheck`, `lint`, `test:run`, `test:e2e` verts

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

## Dev Agent Record

### Agent Model Used
claude-opus-5[1m] (exécution autonome, 2026-09-04)

### Couverture ajoutée

`server/utils/debt-balance.test.ts` — **12 cas**, dont le trou identifié en revue :
`balanceSumsByDebt` exercé sur **3 dettes simultanées** avec des mouvements distincts, en
vérifiant qu'aucun solde ne fuit d'une dette à l'autre. Plus : dette sans événement, transaction
`debt_id` NON marquée ignorée, sur-remboursement → solde négatif, base vide, et
`linkedTransactionCountsByDebt`.

`crud.test.ts` — `lump_sum` couvert au niveau **endpoint** sur ses 3 cas : échéance dans
l'horizon, au-delà de 24 mois, et **passée mais encore due**. Les dates sont calculées par
rapport au mois courant réel pour que le test reste vrai quel que soit le jour où il tourne —
c'est précisément parce que ce mode dépend du mois serveur qu'il était fragile.

### Specs amendées (story 6.4)

- **AC#4 réécrite** : distingue désormais l'échéance *future hors horizon* (tout à 0) de
  l'échéance *passée encore due* (imputée au mois 0). Le code faisait ça depuis l'origine, la
  spec disait l'inverse et le test entérinait sans que rien ne le documente.
- **Effet de bord signalé, NON corrigé** : une `lump_sum` d'il y a trois ans jamais soldée fait
  sortir tout le solde sur le mois courant et gonfle brutalement le forecast. Consigné comme
  **décision produit à ouvrir** — le modifier aurait changé le forecast sans arbitrage.
- **Cas limites « mois 28/29/30/31 » retirés** avec leur raison : `projectDebt` raisonne en
  `YYYY-MM`, la longueur des mois lui est indifférente. Aucun test ajouté pour cocher une case
  (AC#7).

### Nommage et sémantique

- `DebtImpactOnDividend.vue` → `DebtProjectedExpense.vue` (il n'affiche pas de dividende).
- `isManual` n'est plus posé que si `categoryCode` est dans le patch. Le test qui asseyait
  l'ancien comportement a été mis à jour, et un cas dédié vérifie que le flag est bien posé
  quand la catégorie change.

### Validation
`test:run` → 468 passed / 40 fichiers · `lint` OK · `typecheck` OK · `test:e2e` → 9 passed, 0 failed

---

## Revue `pr-reviewer` du 2026-09-04 (contexte neuf) — verdict initial BLOQUER

### 🔴 BLOQUANT — corrigé

**Le solde comptait une transaction ENTRANTE rattachée comme une sortie.** La story 6.5 avait
levé la garde `amountCents >= 0` à l'**écriture** sans corriger l'**arithmétique** :
`debt-balance.ts` sommait toujours `abs(amount)` et le soustrayait.

```
créance -50 000, encaissement +20 000 rattaché  →  -70 000   (attendu -30 000)
```

C'est le cas d'usage même que D16 déclare débloquer : FR66-FR68 restaient faux, en silence, et
le résultat remontait au forecast puis au dividende via `currentDebtBalance`.

**Pourquoi aucun test ne l'a vu** : le test réécrit en 6.5 n'assertait que les deux booléens
écrits, et aucun cas ne seedait de transaction rattachée à montant positif. 468 tests au vert
sur un solde faux.

Correction : somme **signée** (`initial + Σevents + Σ montants rattachés`). Le comportement
pour les sorties est strictement identique — aucune régression sur l'existant. Idem dans
`repaidInMonthCents`, qui filtre désormais `amount_cents < 0` : un encaissement n'est pas un
remboursement et ne doit pas neutraliser la mensualité projetée.

Vérifié en HTTP réel après correction : `currentBalanceCents = -30000`. Et couvert par 4 cas
nouveaux (unitaire + endpoint), dont celui reproduisant les chiffres exacts du reviewer.

### 🟠 MAJEURS — corrigés

- **Aucun artefact de migration dans le dépôt.** `server/db/migrations/` n'existait pas : le
  rebuild SQLite fait à la main n'était reproductible nulle part, et une base antérieure
  tournait sans `debt_events` ni contrainte, sans aucun signal. → `yarn db:generate` exécuté et
  la baseline `0000_charming_starbolt.sql` est commitée, **et** le bootstrap porte désormais
  `assertSchemaUpToDate()` qui refuse de démarrer sur un schéma périmé. Sonde vérifiée sur une
  copie de base réelle amputée de `debt_events`, puis couverte par 2 tests.
- **La nouvelle capacité financière de 6.5 n'avait aucun cas nominal** (NFR18). → couverte, cf.
  bloquant.
- **Glissement sémantique de `is_debt_repayment`** : depuis 6.5 le flag ne signifie plus
  « remboursement » mais « rattachée à une dette », entrées comprises — la `CHECK` l'y oblige.
  C'est la racine du bloquant. Documenté dans `debt-balance.ts` avec un ⚠️ explicite contre un
  retour à `abs()`.

### 🟡 MINEURS — corrigés

- `adjustment` figé à la baisse dans `DebtEventForm` → les deux sens sont proposés.
- `currentMonth()` dupliqué dans `forecast.get.ts` alors que `debt-anchor.ts` prétendait être la
  source unique → dédupliqué.
- `[id].put.ts` faisait un `GROUP BY` sur toute la table pour un compteur → requête ciblée.
- Libellé UI périmé dans `DebtProjectedExpense` (« arrive avec le forecast (à venir) », or
  l'epic 7 est livré) → corrigé.

### Reste ouvert, assumé

- `useDebts.deleteDebt` utilise `refreshNuxtData()` sans clé. Le reviewer le juge « un marteau » :
  c'est exact, mais les clés `transactions-<mois>` sont dynamiques et non énumérables depuis le
  composable. Conservé, motif documenté dans le code.
- DDL des tests réécrite à la main, divergente du schéma réel — **dette pré-existante** du dépôt,
  consignée depuis la story 2.10. C'est elle qui rend les tests aveugles aux contraintes.

### ⚠️ Validation visuelle : NON FAITE

Troisième occurrence consécutive — MCP Playwright indisponible dans le contexte du reviewer.
`/dettes` (carte Créance/Dette, formulaire de mouvement signé, message de suppression chiffré)
et `/transactions/[period]` n'ont été regardés par personne. **Recette visuelle à faire avec
Marceau avant clôture.**

### Validation finale
`test:run` → **476 passed / 40 fichiers** · `lint` OK · `typecheck` OK · `test:e2e` → 9 passed, 0 failed
