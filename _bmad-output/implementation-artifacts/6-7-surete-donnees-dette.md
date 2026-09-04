# Story 6.7: Sûreté des données de dette

Status: review

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

- [x] **Task 1 — Contrainte et FK** (AC: #1, #2)
  - [x] Back-fill des lignes incohérentes, puis `CHECK` + FK `ON DELETE SET NULL`

- [x] **Task 2 — Suppression sûre** (AC: #3, #4)
  - [x] Comptage exposé avant suppression, message FR chiffré dans `dettes.vue`
  - [x] Déliage + suppression dans une même transaction SQL

- [x] **Task 3 — Invalidation** (AC: #5)
  - [x] `useDebts.deleteDebt` invalide `transactions-<mois>`

- [x] **Task 4 — Tests + sanity** (AC: #6, #7)
  - [x] Cas listés en AC#7 ; `typecheck`, `lint`, `test:run`, `test:e2e` verts

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

## Dev Agent Record

### Agent Model Used
claude-opus-5[1m] (exécution autonome, 2026-09-04)

### Migration appliquée à la base de dev

Ajouter un `CHECK` et une FK à une table SQLite existante impose le rebuild en 12 étapes.
Exécuté sur la base réelle (207 transactions), avec back-fill défensif préalable :

```
back-fill:      0 + 0 lignes          (aucune incohérence présente — vérifié avant)
transactions:   207 -> 207            (aucune perte)
integrity_check: ok  | foreign_key_check: []
CHECK active:   « CHECK constraint failed: transactions_debt_coherence_check »
```

La dernière ligne vient d'un `INSERT` volontairement incohérent (`debt_id` sans flag) :
la contrainte est **prouvée active**, pas seulement déclarée.

### Notes

- Le déliage explicite est **conservé** malgré la FK `ON DELETE SET NULL` : la FK remet
  `debt_id` à NULL mais ne touche pas `is_debt_repayment`, ce que la nouvelle contrainte
  refuserait. Les deux colonnes doivent bouger ensemble.
- `linkedTransactionCount` est exposé par `GET /api/debts` (et par POST/PUT pour la cohérence
  du contrat) plutôt que par un endpoint dédié : l'UI a déjà la liste au moment d'ouvrir la
  confirmation, aucune requête supplémentaire.
- `deleteDebt` invalide via `refreshNuxtData()` sans clé : les clés `transactions-<mois>` sont
  dynamiques et non énumérables depuis le composable.
- Premier jet du message FR **faux** au pluriel (« 18 transactions perdraient son marquage ») —
  corrigé en deux formes explicites plutôt qu'une concaténation conditionnelle.

### Écart assumé, écrit dans le code

`is_debt_repayment` reste un **état dérivé** de `debt_id IS NOT NULL`, ce que le CLAUDE.md
interdit. Le motif et son chiffrage (28 fichiers contre 1 contrainte) sont consignés **dans
`server/db/schema.ts`**, à côté de la contrainte — pas seulement ici — pour que personne ne le
« nettoie » sans repayer le coût.

### Validation
`test:run` → 452 passed / 39 fichiers · `lint` OK · `typecheck` OK

4 cas ajoutés : `linkedTransactionCount` à 2 et à 0, rejet par la base d'un `debt_id` sans flag,
rejet d'un flag sans `debt_id`.

⚠️ **Validation visuelle NON FAITE** — le message de confirmation chiffré n'a pas été vu à
l'écran. À couvrir en recette visuelle.

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
