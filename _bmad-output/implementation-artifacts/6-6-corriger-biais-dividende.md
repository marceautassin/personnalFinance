# Story 6.6: Corriger les deux biais sur le dividende

Status: review

## Story

As a user,
I want debt repayments counted exactly once in the forecast,
so that the dividend I vote at the AG is the right number.

## Contexte de cadrage (à lire avant)

C'est **la seule story du lot qui corrige le chiffre que l'application existe pour produire**.
Les deux défauts remontés par la revue du 2026-09-04 gonflent tous les deux les dépenses
projetées, donc le dividende à voter.

**Biais 1 — la mensualité du mois courant est comptée deux fois.**
`server/api/debts/[id]/impact.get.ts:47` ancre la projection au **mois courant** en partant du
**solde courant**. Scénario : dette 1 000 €, mensualité 100 €, l'utilisateur paie le 5 du mois et
marque la transaction → `currentBalance = 900`, mais `series[0] = 100`. L'horizon 6 mois annonce
600 € alors que 500 € restent réellement à sortir. **Le même ancrage est repris par
`server/services/forecast-engine.ts:179`** : le biais ne reste pas dans la carte d'impact, il
remonte jusqu'au dividende.

**Biais 2 — un remboursement compté comme dépense variable ET reprojeté.**
Marquer une transaction comme remboursement **ne change pas sa catégorie**. La catégorie dédiée
`remboursement_dette` existe et est `isVariable: false` (donc exclue de `buildVariableHistory`),
mais **rien ne force son usage** : un remboursement laissé en `courses` entre dans la moyenne
mobile de `variable-projection.ts` **et** est reprojeté par `projectDebt`.

## Acceptance Criteria

1. **Given** une dette `monthly` dont la mensualité du mois courant est déjà réglée et marquée,
   **When** `GET /api/debts/[id]/impact` est appelé,
   **Then** le mois courant ne recompte pas cette mensualité. Deux implémentations acceptables :
   démarrer la série au **mois suivant** en mode `monthly`, ou **déduire du mois 0** les
   remboursements déjà enregistrés sur ce mois. Le choix est documenté dans la story.

2. **Given** `server/services/forecast-engine.ts:179`,
   **When** il projette les dettes,
   **Then** il utilise **le même ancrage corrigé** que l'endpoint impact. La règle d'ancrage
   n'existe qu'à **un seul endroit** (source unique) — la dupliquer ferait diverger la carte
   d'impact et le dividende, exactement le motif de `category-references.ts` (story 5.6).

3. **Given** une transaction marquée `is_debt_repayment = 1` restée dans une catégorie variable,
   **When** `buildVariableHistory` construit l'historique,
   **Then** elle est **exclue**. L'exclusion porte sur le flag, pas sur la catégorie : elle reste
   correcte même si l'utilisateur n'utilise jamais `remboursement_dette`.

4. **Given** le marquage d'une transaction comme remboursement,
   **When** il est posé,
   **Then** le comportement retenu vis-à-vis de la catégorie est **explicite et documenté** :
   soit bascule automatique vers `remboursement_dette`, soit statu quo assumé parce que l'AC#3
   rend la catégorie sans effet sur le calcul. Ne pas laisser ce point implicite — c'est
   précisément ce qui a produit le biais.

5. **Given** les snapshots forecast (G5) dans `tests/fixtures/snapshots/`,
   **When** les deux corrections sont appliquées,
   **Then** ils sont **régénérés**, et chaque écart est justifié dans la story. Un snapshot qui
   change sans explication est un bug, pas une mise à jour.

6. **Given** NFR18,
   **When** les tests sont écrits,
   **Then** ils couvrent : mensualité du mois courant déjà payée (le cas du biais 1),
   mensualité non encore payée (non-régression), remboursement en catégorie variable exclu de la
   moyenne mobile (biais 2), et une dette `free` (aucun effet).

7. **Given** les conventions CLAUDE.md,
   **When** review,
   **Then** `projectDebt` reste **pure** (mois injecté, aucun `Date.now()` interne, aucun accès
   DB) — la correction d'ancrage se fait chez l'appelant, pas dans le service.

## Tasks / Subtasks

- [x] **Task 1 — Ancrage unique** (AC: #1, #2, #7)
  - [x] Helper d'ancrage partagé, consommé par `impact.get.ts` et `forecast-engine.ts`
  - [x] `projectDebt` inchangé et toujours pur

- [x] **Task 2 — Exclusion des remboursements des variables** (AC: #3, #4)
  - [x] `buildVariableHistory` filtre `is_debt_repayment = 1`
  - [x] Décision catégorie tranchée et écrite

- [x] **Task 3 — Snapshots** (AC: #5)
  - [x] Régénération + justification écart par écart

- [x] **Task 4 — Tests + sanity** (AC: #6)
  - [x] Cas listés en AC#6 ; `typecheck`, `lint`, `test:run`, `test:e2e` verts

## Dev Notes

### Ordre par rapport à 6.5
Cette story est **indépendante du ledger signé** (elle touche l'ancrage et la projection
variable, pas le calcul de solde). Elle peut donc être faite avant ou après 6.5. Elle est
placée après uniquement pour que ses snapshots soient régénérés une seule fois, sur le modèle
définitif.

### Attention au double effet sur le forecast
Les deux corrections vont dans le même sens : elles **baissent** les dépenses projetées, donc le
dividende requis. Un écart de snapshot à la baisse est attendu ; un écart à la hausse signale un
problème.

## References
- [Source: prd.md#FR33, FR34, FR41-FR52]
- [Source: `CLAUDE.md`#Forecast = fonction pure, #NFR18, #G5]
- [Revue epic 6 du 2026-09-04 — 2 MAJEURS à impact direct sur le dividende]
- [Story 6.4 — `projectDebt`, `impact.get.ts`]
- [Story 7.1 — `variable-projection`, `buildVariableHistory` ; 7.3 — `forecast-engine`]

## Dev Agent Record

### Agent Model Used
Agent de développement.

### Décision AC#1 — plafonner, pas déduire

**Premier correctif écrit : FAUX.** Déduire le déjà-réglé du mois 0 en gardant la même série
faisait *perdre une mensualité au total projeté* — le solde restant dû ne disparaît pas, il sort
plus tard. Le test d'endpoint l'a attrapé (`expected 100000 to be 200000`).

Correctif retenu : le mois de départ est **plafonné au reliquat** de sa mensualité
(`max(0, mensualité − déjà réglé)`), le reste de la série suit normalement. C'est la seule des
deux options de l'AC#1 qui reste exacte en **paiement partiel** — décaler la série d'un mois
écraserait le reliquat encore dû sur le mois courant.

Le plafonnement ne s'applique qu'au mode `monthly` : `lump_sum` est un versement unique, pas une
capacité mensuelle ; `free` ne projette rien.

### Décision AC#4 — catégorie inchangée au marquage

Statu quo **assumé** : marquer une transaction ne bascule pas sa catégorie. L'exclusion de
l'AC#3 porte sur le **flag** `is_debt_repayment`, pas sur la catégorie — le calcul est donc
correct quel que soit le classement de l'utilisateur. Basculer la catégorie d'office aurait
modifié une donnée saisie par l'utilisateur pour compenser un défaut de calcul déjà corrigé
ailleurs.

### AC#5 — snapshots : aucun écart, et c'est normal

`git diff` sur `server/services/__snapshots__/forecast-engine.test.ts.snap` → **vide**. Le
snapshot fige `computeForecast`, fonction **pure** dont les entrées sont injectées ; les deux
correctifs vivent dans la couche d'accès DB (`buildForecastInput`, `buildVariableHistory`). Le
snapshot ne pouvait donc pas bouger. Il n'a pas été « régénéré » : il n'avait pas à l'être.

### Validation
`test:run` → 448 passed / 39 fichiers · `lint` OK · `typecheck` OK

Nouveau fichier `server/utils/debt-anchor.test.ts` — 10 cas, dont le scénario **exact** de la
revue (dette 900, mensualité 100, mois réglé → horizon 6 = **500**, et non 600), le paiement
partiel, et un invariant « le total projeté ne perd jamais de solde » balayant 5 valeurs de
déjà-réglé.

⚠️ Aucun changement d'UI dans cette story — rien à valider visuellement.

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
