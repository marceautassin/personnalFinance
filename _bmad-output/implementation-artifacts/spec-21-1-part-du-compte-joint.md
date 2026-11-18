---
title: 'Ne compter que ma moitié du compte joint (story 21.1)'
type: 'feature'
created: '2026-09-08'
status: 'done'
baseline_commit: '73ac5bf'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-19-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** 33 virements reçus du compte joint (**+8 264,70 €**) sont rangés en mouvement
interne, donc exclus de tout. Or ce sont des remboursements de dépenses communes avancées depuis
le compte personnel. Comme le compte joint est alimenté **à parts égales**, la moitié de chaque
virement est l'argent de l'utilisateur qui revient — déjà compté en dépense via sa contribution
mensuelle (`logement-charges` 298,50 € et `enfants-*` 286,50 €). Ces dépenses sont donc comptées
**deux fois**, pour environ 3 980 € sur l'historique.

**Approach:** Un poste dédié reçoit les virements du joint. À l'agrégation, chaque virement
entrant est **coupé en deux** : une moitié réduit les dépenses sur un poste dédié, l'autre reste
un mouvement interne. Aucun rapprochement à faire à la main, aucune écriture en base.

## Boundaries & Constraints

**Always:**
- La coupe est une transformation **PURE** appliquée avant agrégation, au même endroit que
  `neutralizeSettlements` — donc traversée par l'analyse ET par la trajectoire. Aucun appelant ne
  doit pouvoir l'oublier : c'est le défaut corrigé deux fois en story 19.4.
- **Somme conservée au centime** : les deux moitiés valent exactement le montant du relevé.
- Seules les lignes **entrantes** du poste dédié sont coupées. Une sortie vers le joint est une
  contribution, déjà comptée ailleurs : elle reste entière et interne.
- Toute somme affichée mène à ses lignes (NFR2), y compris sur le poste de remboursement, qui ne
  porte aucune ligne en base.
- Les codes de poste sont des constantes nommées du référentiel, jamais des littéraux dans une
  fonction de calcul.

**Ask First:** changer le taux de 50 % ; rendre le taux configurable ; toucher à
`neutralizeSettlements`.

**Never:**
- Pas d'écriture en base : `amount_cents` reste le montant du relevé (D28).
- Pas d'appariement virement ↔ dépenses : l'utilisateur a explicitement écarté cette option.
- Pas de reclassement automatique des 33 virements entrants — c'est une règle de classement,
  geste de l'utilisateur, pas une migration de données.
- **Exception demandée le 2026-09-08** : les TROIS lignes de charges vers le joint rangées à
  tort en `internes-virement-comptes` (crédit d'impôt −1 420 €, charges −298,50 €, charges
  enfant −286,50 €, toutes de 2025) sont remises sur leurs postes de dépense, aux côtés de leurs
  douze jumelles. Correction ciblée et idempotente, sans effet sur une autre base. Elle joue en
  sens INVERSE du reste : elle augmente les dépenses de 2 005 €.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior |
|---|---|---|
| Virement entrant | +640,00 € sur le poste joint | +320,00 € en réduction de dépense, +320,00 € interne |
| Montant impair | +641,01 € | 320,50 € en dépense, 320,51 € interne — somme exacte, jamais 2 × arrondi |
| Sortie vers le joint | −298,50 € sur le poste joint | inchangée, entièrement interne : c'est une contribution |
| Montant nul | 0 € | inchangé, aucune ligne fantôme |
| Hors du poste dédié | virement rangé ailleurs | intact — la coupe ne s'applique qu'au poste nommé |
| Descente sur le remboursement | poste `<remboursement>` déplié | montre les virements sources, à leur moitié |
| Trajectoire | même période sur `/evolution` | même résultat que `/analyse` — une seule coupe, dans le moteur |
| Patrimoine | période contenant un virement du joint | augmente de la moitié : c'est une dépense en moins, pas une recette |

</frozen-after-approval>

## Code Map

- `server/services/analysis-engine.ts` -- `neutralizeSettlements` (l. 52) et ses 4 points d'appel (l. 235, 236, 304, 402) : la coupe se pose aux mêmes.
- `shared/constants/default-referential.ts` -- `FALLBACK_ITEM_CODE`, `ACCEPT_GAP_ITEM_CODE` (l. 47, 57) : le modèle de poste connu et protégé.
- `server/api/categories/items/[code].patch.ts` -- protège la nature d'un poste connu ; deux de plus à protéger.
- `server/utils/settlement-status.ts` -- le modèle de « rejeu » qui rend la descente fidèle au moteur.
- `server/api/transactions/index.get.ts` -- `effectiveAmountCents` (story 19.4) : le canal existe déjà pour montrer une ligne à sa valeur réelle.
- `server/db/migrations/` -- dernière migration `0008` ; le référentiel existant ne se re-sème pas.

## Tasks & Acceptance

**Execution:**
- [x] `shared/constants/default-referential.ts` -- ajouter le groupe `compte-joint` et deux postes : `internes-virement-joint` (interne) et `compte-joint-part-remboursee` (dépense), plus leurs constantes nommées et le taux `JOINT_SHARE_BASIS_POINTS = 5000`.
- [x] `server/db/migrations/0009_*.sql` -- insérer groupe et postes dans les bases existantes -- le seed est sauté dès que le référentiel est présent.
- [x] `server/services/analysis-engine.ts` -- `splitJointTransfers`, pure, appliquée AVANT `neutralizeSettlements` à ses 4 points d'appel.
- [x] `server/services/analysis-engine.test.ts` -- couvrir toute la matrice, dont l'impair et la conservation de la somme (NFR3).
- [x] `server/utils/settlement-status.ts` (ou voisin) -- rejouer la coupe pour que la descente sur le poste de remboursement montre les virements sources à leur moitié.
- [x] `server/api/transactions/index.get.ts` -- servir la descente du poste de remboursement, qui ne porte aucune ligne en base.
- [x] `server/api/categories/items/[code].patch.ts` -- protéger la nature des deux nouveaux postes.
- [x] `server/db/migrations/0009_*.sql` -- remettre les trois lignes de charges mal rangées sur `logement-charges` et `enfants-*` -- ciblage étroit (poste actuel + libellé + montant + date), donc sans effet ailleurs.
- [x] `_bmad-output/planning-artifacts/epics.md` + `sprint-status.yaml` -- ouvrir l'epic 21, story 21.1.

**Acceptance Criteria:**
- Given un virement du joint de X, when la période est agrégée, then les dépenses baissent de X/2 et le solde bancaire est inchangé.
- Given la même période, when je la regarde sur `/analyse` puis sur `/evolution`, then les deux disent le même montant.
- Given le poste de remboursement, when je le déplie, then j'atteins les virements qui le composent.
- Given 33 virements reclassés d'un coup par une règle, when j'ouvre l'analyse, then aucune action de plus n'est requise.

## Spec Change Log

### 2026-09-08 — revue adversariale (4 relecteurs, contexte neuf)

**Déclencheurs.** Deux BLOQUANTS, dont un démontré par exécution.

1. **Coupe ∘ réconciliation.** `splitJointTransfers` recopiait `settlementGroupId` sur les deux
   moitiés : `neutralizeSettlements` voyait alors deux remboursements au lieu d'un et reversait
   le reliquat sur la seule moitié interne — la part remboursée **disparaissait**, et le double
   comptage que la story corrige revenait intégralement. Les deux mécanismes s'excluent
   désormais ; la réconciliation, plus précise puisqu'elle nomme les dépenses couvertes, gagne.
2. **Postes supprimables.** « Part remboursée » est CALCULÉ : il ne porte jamais de ligne, donc
   le garde-fou « on ne supprime pas un poste qui contient des transactions » ne le protégeait de
   rien. Sa suppression réussissait toujours, faisait disparaître la moitié coupée de tous les
   agrégats — le moteur ignore silencieusement un poste hors référentiel — puis empêchait
   l'application de redémarrer, sans issue par l'interface. Les deux postes et leur rubrique
   rejoignent `PROTECTED_ITEM_CODES` / `PROTECTED_GROUP_CODES`.

**Amendé (majeurs).**
- Le patrimoine ANTÉRIEUR à une fenêtre était une somme SQL brute : la coupe ne le traversait
  pas, et un même mois pesait différemment selon qu'il tombait avant la fenêtre ou dedans. Il
  passe par `resultTotalCents`, dans le moteur. Vérifié : le cumul en fin 2025 vu depuis la
  fenêtre 2025 égale exactement le report avant la fenêtre 2026.
- La descente REMPLAÇAIT le filtre au lieu de l'étendre : une vraie ligne rangée sur le poste
  calculé, ou un poste ajouté à la rubrique, comptait sans être atteignable. Filtre additif.
- Sur une liste non filtrée, la moitié remboursée n'apparaissait dans aucune ligne : la somme
  était courte. Sans poste demandé, une ligne pèse son montant entier.
- Le poste calculé était proposé au LLM, qui pouvait y ranger de vraies lignes comptant EN PLUS
  de la moitié coupée. Retiré de la liste envoyée au modèle.

**KEEP.** À préserver si le code est re-dérivé : la coupe posée aux mêmes points que
`neutralizeSettlements` PLUS `resultTotalCents` ; l'arrondi qui va à l'interne, avec le reste
calculé par soustraction et jamais par un second arrondi ; le refus de couper une ligne déjà
réconciliée, une ligne sortante, ou un montant dont la moitié serait nulle ; la sonde de
démarrage qui vérifie la NATURE des deux postes et laisse passer une base vierge — le seed suit ;
la migration dont chaque insertion est conditionnée à l'existence de sa rubrique parente.

**Corrigés au passage.** Ligne fantôme à 0 € sur un virement d'un centime ; `UPDATE` de migration
gardés contre une FK et ciblés aussi par libellé ; positions calculées plutôt qu'un `99` magique ;
badge « moitié · compte joint », sans lequel un montant divisé par deux ne s'expliquait pas ;
débordement du badge sous 1 000 px, où il chevauchait le bouton de reclassement.

**Couverture.** Les critères d'acceptation n'avaient aucun test au niveau `analyze()` : ajoutés
(dépenses réduites de moitié, solde bancaire inchangé, concordance analyse/trajectoire,
patrimoine qui traverse la coupe), plus la protection des postes et le filtre additif.

## Design Notes

```
Relevé :   VIR INST M J DUPONT OU MME A DUPO   +640,00 €
                    │
   ┌────────────────┴────────────────┐
   +320,00 € → Compte joint · Part remboursée   (dépense : la réduit)
   +320,00 € → Mouvements internes · Virement du joint  (exclu de tout)
```

L'arrondi va **à l'interne** : la moitié qui compte est plancher, celle qui ne compte pas porte
le centime en trop. Huit des 33 virements sont impairs.

## Verification

**Commands:**
- `yarn test:run` -- verts, dont les cas de la matrice
- `yarn apply-migration` puis `yarn test:e2e` -- verts
- `yarn lint:fix` / `yarn typecheck` -- 0 erreur

**Manual checks:**
- Sur une COPIE de la base : classer les 33 virements par une règle, puis vérifier que les
  dépenses 2026 baissent de ~1 702 € et que `/analyse` et `/evolution` s'accordent.
