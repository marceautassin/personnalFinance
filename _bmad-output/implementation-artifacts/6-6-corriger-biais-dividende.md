# Story 6.6: Corriger les deux biais sur le dividende

Status: ready-for-dev

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

- [ ] **Task 1 — Ancrage unique** (AC: #1, #2, #7)
  - [ ] Helper d'ancrage partagé, consommé par `impact.get.ts` et `forecast-engine.ts`
  - [ ] `projectDebt` inchangé et toujours pur

- [ ] **Task 2 — Exclusion des remboursements des variables** (AC: #3, #4)
  - [ ] `buildVariableHistory` filtre `is_debt_repayment = 1`
  - [ ] Décision catégorie tranchée et écrite

- [ ] **Task 3 — Snapshots** (AC: #5)
  - [ ] Régénération + justification écart par écart

- [ ] **Task 4 — Tests + sanity** (AC: #6)
  - [ ] Cas listés en AC#6 ; `typecheck`, `lint`, `test:run`, `test:e2e` verts

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
