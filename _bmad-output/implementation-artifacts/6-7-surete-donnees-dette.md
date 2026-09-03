# Story 6.7: Sûreté des données de dette

Status: ready-for-dev

## Story

As a user,
I want to be told what a deletion will destroy before it happens,
so that losing months of repayment markings is never silent.

## Contexte de cadrage (à lire avant)

Trois défauts de la revue du 2026-09-04, tous du même genre : **la donnée peut se perdre ou
devenir incohérente sans que rien ne le signale.**

**1. Suppression destructive silencieuse.** `server/api/debts/[id].delete.ts:27-30` démarque
toutes les transactions rattachées, et `app/pages/dettes.vue:133` annonce seulement *« Cette
action est définitive »*. Scénario : dette « Papa » avec 18 remboursements marqués sur 12 mois →
suppression → 18 lignes perdent `debt_id` et `is_debt_repayment`, **sans undo**.

L'AC#8 de la story 6.1 demandait explicitement d'arbitrer entre un `409 debt_has_repayments` et
un SET NULL **en review 6.3** ; 6.3 ne l'a pas tranché et 6.1 a implémenté le SET NULL en
silence. **Arbitrage rendu le 2026-09-04 : on garde le SET NULL**, mais avec un avertissement
chiffré — refuser bloquerait une suppression légitime après solde.

**2. Deux colonnes pour un seul fait.** `is_debt_repayment` et `debt_id` encodent la même chose
sans contrainte qui les couple. `balanceSumsByDebt` filtre sur les deux : une ligne
`debt_id = 3, is_debt_repayment = 0` **disparaît silencieusement du solde**. Ce n'est pas
théorique — le PATCH antérieur à la story 6.3 persistait un `debtId` seul.

**Arbitrage rendu le 2026-09-04 : contrainte `CHECK`, pas suppression du flag.** Supprimer
`is_debt_repayment` serait plus pur (c'est un état dérivé de `debt_id IS NOT NULL`, que le
projet interdit) mais toucherait **28 fichiers**, très majoritairement des tests d'autres epics
(dashboard, réconciliation, statements, charge-suggester, forecast). Le `CHECK` coûte une
migration. Le prix de la pureté est ici disproportionné — écart assumé et documenté.

**3. Intégrité laissée au code applicatif.** `transactions.debt_id` n'a **pas de FK** :
l'intégrité repose entièrement sur le handler de suppression. Choix documenté à l'origine, mais
fragile dès que l'epic 10 ajoutera un second chemin d'écriture.

## Acceptance Criteria

1. **Given** la contrainte `CHECK((debt_id IS NULL) = (is_debt_repayment = 0))` sur `transactions`,
   **When** une écriture tente de poser `debt_id` sans le flag (ou l'inverse),
   **Then** elle est rejetée par la base. Un **back-fill** des lignes historiques dans cet état
   précède la pose de la contrainte.

2. **Given** `transactions.debt_id`,
   **When** le schéma est corrigé,
   **Then** il porte une FK vers `debts.id` en `ON DELETE SET NULL` — l'intégrité ne dépend plus
   du seul handler.

3. **Given** la suppression d'une dette rattachée à N transactions,
   **When** la confirmation s'affiche,
   **Then** elle annonce le **nombre exact** de transactions qui perdront leur marquage
   (ex : *« 18 transactions perdront leur marquage de remboursement. »*), en français, dans
   le `ConfirmDialog` existant.

4. **Given** le déliage des transactions et la suppression de la dette,
   **When** exécutés,
   **Then** ils sont dans une **même transaction SQL**. Aujourd'hui ce sont deux ordres séparés :
   une interruption entre les deux laisse des transactions déliées et la dette vivante.

5. **Given** `app/composables/useDebts.ts:48-50`,
   **When** `deleteDebt` réussit,
   **Then** il invalide aussi les clés `transactions-<mois>`. Aujourd'hui il ne rafraîchit que la
   liste des dettes : une page `/transactions/[period]` déjà chargée continue d'afficher
   « ↳ créancier » sur des lignes désormais non marquées.

6. **Given** les conventions CLAUDE.md,
   **When** review,
   **Then** erreurs métier via `createError` avec code stable ; pas de mutation Pinia directe ;
   libellés UI en français ; l'écart assumé sur `is_debt_repayment` (état dérivé conservé) est
   **écrit dans le code**, à côté de la contrainte, avec son motif.

7. **Given** des tests,
   **When** exécutés,
   **Then** ils couvrent : rejet d'un `debt_id` sans flag par le `CHECK`, comptage exact renvoyé
   avant suppression, suppression atomique (dette + déliage), et FK `SET NULL` effective.

## Tasks / Subtasks

- [ ] **Task 1 — Contrainte et FK** (AC: #1, #2)
  - [ ] Back-fill des lignes incohérentes, puis `CHECK` + FK `ON DELETE SET NULL`

- [ ] **Task 2 — Suppression sûre** (AC: #3, #4)
  - [ ] Comptage exposé avant suppression, message FR chiffré dans `dettes.vue`
  - [ ] Déliage + suppression dans une même transaction SQL

- [ ] **Task 3 — Invalidation** (AC: #5)
  - [ ] `useDebts.deleteDebt` invalide `transactions-<mois>`

- [ ] **Task 4 — Tests + sanity** (AC: #6, #7)
  - [ ] Cas listés en AC#7 ; `typecheck`, `lint`, `test:run`, `test:e2e` verts

## Dev Notes

### Pourquoi le `CHECK` et pas la suppression du flag
Mesure du 2026-09-04 : `is_debt_repayment` est consommé par **28 fichiers**, `debt_id` par 36.
Le supprimer imposerait de réécrire les fixtures de tests de la moitié des epics pour un gain de
pureté. La contrainte rend l'état incohérent **impossible**, ce qui est l'objectif réel ; la
duplication devient inoffensive parce qu'elle est garantie cohérente par la base.

### Interaction avec 6.5
Si 6.5 (ledger signé) est faite avant, l'AC#1 doit tenir compte du fait qu'une transaction
**entrante** peut désormais être rattachée : le `CHECK` porte sur la cohérence des deux colonnes,
pas sur le signe du montant.

## References
- [Source: prd.md#FR9, FR29-FR34]
- [Source: `CLAUDE.md`#Anti-patterns interdits (état dérivé — écart assumé ici, motivé)]
- [Revue epic 6 du 2026-09-04 — MAJEUR suppression destructive, MAJEUR couplage des colonnes, 3 MINEURS]
- [Story 6.1 AC#8 — arbitrage resté ouvert, tranché le 2026-09-04 : SET NULL avec avertissement]
- [Story 6.3 — origine des lignes `debt_id` sans flag]
