---
title: 'Lisibilité des lignes neutralisées (story 19.4)'
type: 'feature'
created: '2026-09-08'
status: 'done'
baseline_commit: '6b75b4893736b2c65cef38878c75137ee5ea486b'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-19-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Le badge de réconciliation (`tag--muted`) est quasi invisible, et la descente
d'analyse ne dit rien des lignes neutralisées : elle les liste à leur montant du relevé et son
pied « N ligne(s), total X » ne retombe pas sur le total du poste — le chemin de traçabilité
qu'exige NFR2 est rompu dès qu'un groupe existe.

**Approach:** L'endpoint renvoie le **montant effectif** de chaque ligne, en plus de son état.
Les deux descentes (analyse, évolution) affichent l'effectif, rappellent le montant du relevé
entre parenthèses quand il diffère, portent le badge, et somment l'effectif. Badges repeints.

## Boundaries & Constraints

**Always:**
- État et montant effectif sont **dérivés** en rejouant `neutralizeSettlements` — jamais une
  seconde implémentation, jamais stockés.
- **Portée du calcul = portée de l'agrégat affiché** : la période `[from, to]`, sans le filtre
  `item`/`group`. Filtrer par poste ampute le groupe de ses remboursements rangés ailleurs.
- La somme des effectifs d'un poste **doit** égaler le total du poste.
- `Cents`, somme algébrique, aucun `Math.abs`, aucune écriture en base.

**Ask First:** toute modification de `neutralizeSettlements` (imputation, signes) ; tout
masquage d'une ligne neutralisée.

**Never:** pas d'écran ni d'endpoint nouveau, pas de changement du modèle de données, pas de
couleur sur la colonne « Montant » (epic 16), pas de retouche de `/regles`, de l'écran des
groupes ni du dashboard.

## I/O & Edge-Case Matrix

Sauf mention, la période contient toutes les lignes citées. `eff.` = `effectiveAmountCents`.

| Scenario | Input / State | Expected Output / Behavior |
|---|---|---|
| Hors groupe | `settlementGroupId = null` | statut `null`, eff. = montant du relevé |
| Couverture exacte | −318,50 € et +318,50 € | les deux `neutralized`, eff. `0` |
| Couverture partielle | −200 € et +150 € | avance `partial`, eff. `−50` |
| Groupe ouvert | −200 €, aucun virement | `outstanding`, eff. `−200` |
| Excédent | −100 € et +150 € | avance `neutralized` eff. `0` ; virement `partial` eff. `+50` |
| Filtre poste | `?item=alimentation`, virement rangé ailleurs | avance `neutralized` — le filtre n'ampute pas le groupe |
| Remboursement hors période | avance janvier, virement mars, période = janvier | `outstanding`, eff. `−200` — cohérent avec le total du mois |
| Somme d'un poste | poste portant une ligne neutralisée | pied de poste = total du poste affiché au-dessus |

</frozen-after-approval>

## Code Map

- `server/utils/settlement-status.ts` -- dérive l'état. Aucun test aujourd'hui.
- `server/api/transactions/index.get.ts` -- calcule l'état sur les lignes DÉJÀ filtrées (défaut).
- `app/composables/useItemTransactions.ts` -- `RangeTransaction`, type des trois descentes.
- `app/components/analysis/DistributionChart.vue` -- descente d'analyse ; `loadedTotal()` somme le brut.
- `app/composables/useTargetTransactions.ts` -- `groups.totalCents` somme le brut (évolution).
- `app/pages/evolution.vue` -- rend les lignes de la cible (~l. 386-398).
- `app/components/transactions/TransactionRow.vue` -- badges de la vue mensuelle.
- `app/assets/styles/components.css` -- `.tag`, `.tag--muted` (l. 226-239).

## Tasks & Acceptance

**Execution:**
- [x] `server/utils/settlement-status.ts` -- rendre `{ status, effectiveAmountCents }` -- un seul rejeu pour deux faits qui, dissociés, divergeraient.
- [x] `server/utils/settlement-status.test.ts` -- créer, couvrir toute la matrice -- fonction de calcul, NFR3.
- [x] `server/api/transactions/index.get.ts` -- calculer sur la période SANS filtre `item`/`group` (seconde lecture bornée aux `settlementGroupId` présents, sautée s'il n'y en a aucun), exposer `effectiveAmountCents` -- même portée que le moteur.
- [x] `server/api/transactions/index.get.test.ts` -- ajouter « filtre poste » et « remboursement hors période » -- les deux cas qui cassaient.
- [x] `app/composables/useItemTransactions.ts` -- `settlementStatus` + `effectiveAmountCents: Cents` sur `RangeTransaction`.
- [x] `app/assets/styles/components.css` -- `.tag--muted` → `.tag--settled` (accent) et `.tag--pending` (ambre) -- le filet transparent est illisible.
- [x] `app/components/transactions/TransactionRow.vue` -- basculer les trois états sur les nouvelles classes.
- [x] `app/components/analysis/DistributionChart.vue` -- badge, montant effectif, relevé entre parenthèses si différent ; `loadedTotal()` sur l'effectif -- ferme la rupture NFR2.
- [x] `app/composables/useTargetTransactions.ts` -- `groups.totalCents` sur l'effectif -- même mensonge.
- [x] `app/pages/evolution.vue` -- même rendu de ligne que la descente d'analyse -- deux descentes divergentes se contrediraient.
- [x] `app/utils/settlement-badge.ts` -- créer (non prévu) -- le descripteur de badge servait trois écrans : la règle DRY du projet demande de factoriser à la troisième occurrence.
- [x] `_bmad-output/planning-artifacts/epics.md` -- ajouter la story 19.4 (non prévu) -- la planification doit rester vraie.
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- inscrire `19-4-lisibilite-des-lignes-neutralisees` -- sans clé, Vigie ne voit pas le chantier.

**Acceptance Criteria:**
- Given un poste portant une ligne neutralisée, when je le déplie dans l'analyse, then son pied affiche exactement le total du poste affiché au-dessus.
- Given une ligne neutralisée ou partielle, when elle s'affiche dans une descente, then elle porte un badge lisible et son montant du relevé apparaît entre parenthèses à côté de l'effectif.
- Given une ligne `outstanding`, when elle s'affiche, then son montant n'est pas parenthésé — elle compte entière.
- Given les trois badges, when ils s'affichent, then leur contraste texte/fond atteint 4,5:1.

## Spec Change Log

### 2026-09-08 — revue adversariale (4 relecteurs, contexte neuf)

**Déclencheur.** Le chasseur de cas limites et `pr-reviewer` ont trouvé, indépendamment, que la
descente de `/evolution` violait la règle « portée = portée de l'agrégat affiché » que la section
figée pose pourtant. `categorySeries` neutralise sur la FENÊTRE entière puis répartit par
tranche ; la descente n'interrogeait qu'une tranche. Mesuré ensuite sur données réelles : point
d'août = −183,50 €, descente = −241,50 €.

**Amendé.** Le contrat de `GET /api/transactions` gagne `settlementFrom`/`settlementTo`
optionnels — la portée de réconciliation, quand elle déborde les lignes demandées. Absents, la
portée reste `[from, to]` : le cas de la page d'analyse, inchangé. Une portée plus ÉTROITE que
les lignes demandées est refusée en 422, c'est le défaut que la story corrige.

**État connu-mauvais évité.** Une descente qui remet dans son total une ligne que le point
qu'elle explique ne compte pas — le mensonge NFR2 fermé sur l'analyse et rouvert sur l'évolution.

**KEEP.** À préserver si le code est re-dérivé : la dérivation UNIQUE par rejeu de
`neutralizeSettlements` (jamais deux implémentations) ; les colonnes de la ligne de transaction
en largeur FIXE et tenues même vides (en `auto`, une colonne vide s'effondre et décale la colonne
des montants de la largeur du badge) ; l'ordre explicite `asc(date), asc(id)` sur les DEUX
requêtes qui alimentent le moteur, son tri étant stable ; la mention « dont N neutralisée(s) »,
qui explique l'écart entre les lignes listées et le compte de transactions du poste.

**Corrigés au passage (patches).** Type `SettlementStatus` factorisé dans `shared/types/` (il
existait en trois exemplaires, dont un littéral) ; ligne à montant nul dans un groupe classée
`outstanding` et non `neutralized` — rien n'y a été remboursé ; repli sous 1 000 px, où les
pistes fixes affamaient le libellé jusqu'à le faire disparaître ; pied de la descente d'évolution
aligné sur celui de l'analyse ; tests ajoutés sur `useTargetTransactions`, qui n'en avait aucun.

**Reporté** dans `deferred-work.md` : l'excédent de remboursement porté en bloc par une seule
ligne, qui peut lui faire afficher un montant supérieur au sien. Le corriger demande de toucher
`neutralizeSettlements`, que la section figée range en « Ask First ».

## Design Notes

Rendu attendu, identique dans les deux descentes :

```
12 avr.  CARREFOUR        0,00 €  (-318,50 €)  [remboursé]
15 avr.  RESTAURANT     -42,10 €
20 avr.  AVANCE PAUL    -50,00 €  (-200,00 €)  [remboursé en partie]
                                    3 ligne(s), total -81,30 €
```

Badges : `remboursé` / `remboursé en partie` en `--color-accent-subtle` sur `--color-accent` ;
`à rembourser` en `--color-warning-subtle` sur `--color-warning`. Le bleu dit « traité »,
l'ambre « en attente » ; ni vert ni rouge, réservés à la variation.

## Verification

**Commands:**
- `yarn test:run` -- tous verts, dont `settlement-status.test.ts`
- `yarn lint:fix` -- aucune erreur résiduelle
- `yarn typecheck` -- 0 erreur (contrôle les templates Vue, contrairement à `tsc`)

**Manual checks:**
- Sur une COPIE de la base réelle, avril 2026 : déplier un poste portant une avance liée et
  vérifier que le pied du poste retombe sur le total affiché au-dessus.
