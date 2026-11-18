# Epic 19 Context: Avances remboursées — neutraliser sans effacer

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

L'utilisateur avance régulièrement de l'argent pour des tiers (courses, achats divers) et se
fait rembourser plus tard par un virement, parfois unique pour plusieurs avances et parfois sur
un autre mois. Ces allers-retours gonflent artificiellement dépenses ET recettes : 47 lignes de
recettes ressemblant à des remboursements, ~8 700 €, soit 8 % des recettes de l'historique.
L'epic permet de RÉUNIR les lignes qui se compensent et d'ÉCARTER les deux côtés des agrégats,
sans jamais rien effacer ni déplacer entre les mois. Capacité NOUVELLE hors périmètre verrouillé
du 2026-09-04 — amendement PRD à porter. Elle sert NFR4 (ne pas confondre ce qui enrichit et ce
qui circule) et fiabilise la variation du patrimoine (story 18.14).

## Stories

- Story 19.1 : Grouper des transactions qui se compensent
- Story 19.2 : Neutraliser les lignes couvertes, garder le reste
- Story 19.3 : Voir et gérer ses groupes

## Requirements & Constraints

- **Les deux côtés sont ÉCARTÉS, aucun n'est réduit.** Seul modèle qui ne déplace rien entre
  les mois. Réduire la dépense du montant remboursé obligerait à choisir quel mois porte la
  réduction — et c'est là qu'on gonfle ou dégonfle.
- **Le reste non couvert demeure une vraie dépense**, dans SON mois et SA rubrique. Imputation
  sur les avances les plus ANCIENNES d'abord.
- **Un excédent de remboursement est une vraie recette** — de l'argent reçu qui n'a rien
  remboursé. Il est porté par la ligne d'entrée la plus récente.
- **Un groupe peut rester ouvert** : sans remboursement rattaché, rien n'est neutralisé. Ce
  n'est pas une erreur, c'est la vérité du moment.
- **Neutralisation rétroactive assumée** : lier en mars une avance de janvier fait baisser les
  dépenses de janvier après coup.
- **Traçabilité (NFR2)** : les lignes restent visibles, badgées, jamais supprimées. Tout montant
  affiché doit garder un chemin jusqu'aux lignes qui le composent — y compris quand certaines
  d'entre elles ne pèsent plus rien.
- **NFR3** : la neutralisation est une fonction de calcul — couverture exacte, partielle,
  excédentaire, groupe ouvert, groupe à cheval sur deux mois sont tous couverts par des tests.

## Technical Decisions

- La neutralisation est une transformation **PURE** appliquée aux lignes AVANT agrégation, dans
  `analysis-engine`. Elle ne touche jamais la base : `amount_cents` reste le montant du relevé
  (D28), signé, sans `Math.abs`.
- **Portée de la neutralisation = portée de l'agrégat.** Le moteur neutralise sur l'ensemble des
  lignes qu'on lui donne, c'est-à-dire la période analysée. Tout affichage d'état de
  réconciliation doit se calculer sur la MÊME portée, sinon l'écran contredit le total.
- **L'état d'une ligne est DÉRIVÉ**, jamais stocké : `settlement-status.ts` rejoue
  `neutralizeSettlements` plutôt que de refaire le calcul. Deux implémentations de la même règle
  finiraient par diverger — même raison que le drapeau `enabled` écarté en 18.9.
- Trois états : `neutralized` (ne pèse plus rien), `partial` (pèse moins que son montant),
  `outstanding` (pèse pour son montant entier).
- Le signe bancaire, et non la nature du poste, décide de ce qui est une avance : une avance
  rangée en « Alimentation » et un remboursement rangé en « Remboursements » se compensent.

## UX & Interaction Patterns

- Un **badge** signale toute ligne appartenant à un groupe et dit ce qu'elle est DEVENUE — « lié »
  sans état laisserait croire qu'une avance non remboursée ne compte plus.
- La couleur SIGNALE, elle ne décore pas (epic 16) : la colonne « Montant » reste neutre, seuls
  les écarts, alertes et états sont colorés.
- Un `disabled` sur un contrôle porteur d'information est interdit — `aria-disabled` + raison
  dans le nom accessible.

## Cross-Story Dependencies

- 19.2 dépend de 19.1 (le groupe doit exister pour être neutralisé) ; 19.3 dépend des deux.
- Consomme la descente d'agrégat vers les transactions (15.5) et la refonte visuelle (epic 16).
- Fiabilise la variation du patrimoine (18.14) et l'évolution (18.16).
