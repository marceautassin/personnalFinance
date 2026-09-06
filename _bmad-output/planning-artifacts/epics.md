---
stepsCompleted:
  - step-01-validate-prerequisites
  - step-02-design-epics
  - step-03-create-stories
  - step-04-final-validation
inputDocuments:
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/implementation-artifacts/sprint-status.yaml
  - CLAUDE.md
supersedes: _bmad-output/planning-artifacts/epics-v1-forecast.md
---

# personnalFinance - Epic Breakdown

## Overview

Découpage du PRD réécrit du 2026-09-04 (39 FRs / 23 NFRs / 4 parcours) et de l'amendement d'architecture du même jour (D17-D27) en epics et stories implémentables.

**Ce document remplace `epics-v1-forecast.md`** (11 epics / 58 stories construits autour du forecast inverse et du dividende SAS, périmètre invalidé par l'usage réel).

**Contexte brownfield.** Le socle existe, tourne et est testé : 24 fichiers / 257 tests unitaires verts, lint et typecheck OK, E2E Chromium sur base dédiée. La suppression du périmètre mort (146 fichiers, −10 457 lignes) est **faite et commitée**. Ces epics ne repartent pas de zéro — ils décrivent ce qui reste à construire par-dessus l'acquis.

### Aucun document UX

Il n'existe pas de spécification UX pour ce projet et il n'y en aura pas : mono-utilisateur, l'utilisateur est le concepteur. Les exigences habituellement portées par un document UX (accessibilité, graphiques, responsive) sont énoncées directement dans le PRD et reprises ci-dessous en NFRs et exigences additionnelles.

## Requirements Inventory

### Functional Requirements

**Ingestion des relevés**

- **FR1** — L'utilisateur peut déposer plusieurs relevés PDF en une seule opération.
- **FR2** — L'utilisateur peut suivre la progression du traitement, fichier par fichier.
- **FR3** — Un relevé dont le traitement échoue n'interrompt pas celui des autres fichiers de la file.
- **FR4** — L'utilisateur peut consulter la cause d'échec de chaque relevé non traité.
- **FR5** — Le système rejette un relevé dont le contenu a déjà été ingéré, et l'indique.
- **FR6** — Le système détecte qu'un relevé couvre une période déjà ingérée et demande à l'utilisateur de remplacer ou d'annuler.
- **FR7** — L'utilisateur peut déposer un relevé isolé, hors ingestion en masse.
- **FR8** — L'utilisateur peut consulter la liste des relevés ingérés, avec leur période et leur état de fiabilité.
- **FR9** — L'utilisateur peut supprimer un relevé ingéré ainsi que les transactions qui en proviennent.

**Fiabilité et réconciliation**

- **FR10** — Le système vérifie, à chaque ingestion, que le solde initial augmenté des transactions correspond au solde final du relevé.
- **FR11** — Le système marque « non fiable » tout relevé présentant un écart, et expose le montant de cet écart.
- **FR12** — L'état « non fiable » est visible partout où le relevé concerné contribue à un agrégat affiché.
- **FR13** — L'utilisateur peut ajouter manuellement une transaction absente d'un relevé pour résorber un écart.
- **FR14** — L'utilisateur peut accepter un écart, le relevé conservant alors son état « non fiable ».

**Référentiel de catégories**

- **FR15** — L'utilisateur peut consulter le référentiel organisé en rubriques et en postes.
- **FR16** — L'utilisateur peut créer, renommer et supprimer une rubrique comme un poste.
- **FR17** — Chaque poste porte une nature : recette, dépense ou mouvement interne.
- **FR18** — Le système empêche la suppression d'un poste référencé par des transactions et indique combien.
- **FR19** — Un même libellé de poste peut exister sous plusieurs rubriques distinctes.

**Catégorisation et correction**

- **FR20** — Le système attribue automatiquement un poste à chaque transaction lors de l'ingestion.
- **FR21** — L'utilisateur peut reclasser une transaction vers un autre poste.
- **FR22** — L'utilisateur peut corriger la nature d'une transaction en la déplaçant vers un poste d'une autre nature.
- **FR23** — Toute correction met à jour immédiatement les agrégats et indicateurs qui en dépendent.
- **FR24** — L'utilisateur peut consulter la proportion de transactions qu'il a corrigées manuellement, par relevé.

**Analyse — répartition**

- **FR25** — L'utilisateur peut sélectionner une période d'analyse au mois, au trimestre ou à l'année.
- **FR26** — L'utilisateur peut visualiser la répartition des dépenses par rubrique sur la période choisie.
- **FR27** — L'utilisateur peut visualiser la répartition des recettes sur la période choisie.
- **FR28** — L'utilisateur peut déplier une rubrique pour voir la répartition entre ses postes.
- **FR29** — Les totaux de recettes et de dépenses excluent les mouvements internes.
- **FR30** — L'utilisateur peut consulter les mouvements internes de la période, séparément des recettes et des dépenses.

**Analyse — évolution et indicateurs**

- **FR31** — L'utilisateur peut visualiser l'évolution d'une rubrique ou d'un poste sur plusieurs périodes consécutives.
- **FR32** — L'utilisateur peut consulter, pour une période, la trésorerie de la période, le taux de dépense, la trésorerie cumulée et le taux d'épargne.
- **FR33** — L'utilisateur peut identifier immédiatement si une période est déficitaire.
- **FR34** — L'utilisateur peut voir, pour une période déficitaire, quelles rubriques ont le plus varié par rapport à la période précédente.

**Traçabilité**

- **FR35** — L'utilisateur peut descendre d'un montant agrégé jusqu'aux transactions qui le composent.
- **FR36** — L'utilisateur peut consulter le libellé bancaire d'origine d'une transaction et le relevé dont elle provient.

**Phase 2 — Croissance (hors MVP)**

- **FR37** — Le système produit une synthèse narrative en français d'une période, à partir d'agrégats calculés en amont.
- **FR38** — L'utilisateur peut consulter les dépenses récurrentes détectées dans son historique, avec leur montant et leur périodicité.
- **FR39** — L'utilisateur peut comparer explicitement deux périodes de son choix.

### NonFunctional Requirements

**Justesse financière**

- **NFR1** — Valeurs monétaires en centimes entiers. Aucune arithmétique en virgule flottante. Conversion en euros à l'affichage seulement.
- **NFR2** — Tout montant affiché est traçable jusqu'aux transactions qui le composent. Aucun agrégat, ratio ou point de courbe sans chemin vers ses lignes sources.
- **NFR3** — Les fonctions de calcul (agrégats par période / nature / rubrique / poste, et les 4 indicateurs) sont couvertes par au moins un cas nominal et deux cas limites : période sans transaction, recettes nulles (division par zéro), montant de signe inattendu pour la nature.
- **NFR4** — Le résultat d'une période exclut systématiquement les mouvements internes ; le solde bancaire les inclut. Deux valeurs calculées séparément, jamais confondues.

**Sécurité et confidentialité**

- **NFR5** — PDF et base stockés exclusivement sur la machine de l'utilisateur. Aucun fichier source transmis à un tiers.
- **NFR6** — Seules la date, le libellé et le montant sont transmis au fournisseur LLM. Aucun nom, IBAN, RIB ni adresse.
- **NFR7** — L'inférence LLM s'exécute sur une infrastructure hébergée dans l'Union européenne.
- **NFR8** — Clé d'API lue depuis une variable d'environnement, jamais en base, jamais journalisée, jamais retournée en HTTP.
- **NFR9** — Aucune authentification ; environnement local de confiance mono-machine. Toute exposition réseau rendrait l'auth bloquante.

**Fiabilité des données**

- **NFR10** — Réconciliation exécutée à chaque ingestion, sans exception ni contournement possible.
- **NFR11** — Un écart ≥ 1 centime marque le relevé « non fiable » ; l'état est propagé à tout agrégat auquel il contribue.
- **NFR12** — La perte de la base est acceptable : elle doit être intégralement reconstructible depuis les PDF conservés.
- **NFR13** — L'échec d'un relevé n'affecte ni les relevés déjà ingérés, ni les suivants dans la file.

**Intégration LLM**

- **NFR14** — Le client déclare un schéma de sortie, **valide systématiquement la réponse côté application**, et rejette toute réponse non conforme. Relance bornée à un essai, l'erreur de validation étant renvoyée au modèle. La conformité n'est jamais présumée acquise du fournisseur.
- **NFR15** — Le LLM n'effectue aucun calcul. Aucun montant affiché ne provient d'une sortie de modèle.
- **NFR16** — L'accès au fournisseur LLM est confiné à un module unique.
- **NFR17** — En cas d'indisponibilité du fournisseur, l'ingestion échoue proprement ; les données déjà ingérées restent consultables.

**Accessibilité**

- **NFR18** — Aucun contrôle interactif ne sort du parcours de tabulation pour signaler son indisponibilité.
- **NFR19** — Aucun élément détenant le focus n'est désactivé.
- **NFR20** — Toute raison d'indisponibilité est accessible au clavier, dans le nom accessible du contrôle.

**Maintenabilité**

- **NFR21** — L'extraction de texte PDF est confinée à un module unique.
- **NFR22** — Aucune constante métier structurante (natures, seuils, référentiel initial) codée en dur dans une fonction de calcul.

**Performance**

- **NFR23** — Aucune cible chiffrée en V1. Point de vigilance à **mesurer** : temps d'agrégation de l'historique complet lors d'un changement de période.

*Scalabilité : sans objet (mono-utilisateur, mono-machine, volume borné).*

### Additional Requirements

Issues de l'amendement d'architecture du 2026-09-04. Chacune a un impact direct sur le découpage.

**Modèle de données et référentiel**

- **AR1 (D17)** — Deux tables `category_groups(code, label, position)` et `category_items(code, group_code FK, label, nature, position)` ; `transactions.category_item_code` FK `ON DELETE RESTRICT`. Pas d'arbre auto-référencé, pas de colonne texte.
- **AR2 (D17)** — `nature` portée **exclusivement par le poste**, énumération **en anglais** : `income | expense | internal_transfer` dans `shared/types/movement-nature.ts`. Libellés FR dans l'UI uniquement.
- **AR3 (D17)** — Référentiel initial : **13 rubriques / 48 postes**, dont une rubrique **Mouvements internes** (Virement épargne · Virement entre comptes · Retrait d'espèces). Sans elle, la 3ᵉ nature n'a aucune destination et le Journey 4 est impossible.
- **AR4 (Patterns)** — Codes de poste au format `<rubrique>-<poste>`, **en français**, pour qu'un `ORDER BY code` groupe naturellement par rubrique.
- **AR5 (D18)** — Migration par **wipe et ré-ingestion** depuis `_data/raw/`, pas de table de correspondance 19 → 41. Fenêtre de validité : **avant** l'ingestion de l'historique complet.
- **AR6 (D21)** — Migrations Drizzle versionnées, commitées, avec `assertSchemaUpToDate()` au bootstrap. La base E2E est reconstruite depuis les migrations à chaque exécution.

**Moteur d'analyse**

- **AR7 (D19)** — `server/services/analysis-engine.ts` = fonction **pure** (lignes → arbre + indicateurs), `server/api/analysis.get.ts` = couche mince d'accès aux données. **Aucun `*-engine.ts` n'importe le client de base.**
- **AR8 (D19)** — Traçabilité par deux endpoints, non par précalcul : `GET /api/analysis?from=&to=&granularity=` et `GET /api/transactions?from=&to=&item=`. **L'arbre ne transporte jamais les transactions.**
- **AR9 (Patterns)** — Bornes explicites `from`/`to` en `YYYY-MM-DD` + `granularity ∈ month|quarter|year`. Jamais d'identifiant de période composite (`?period=2026-Q1`).
- **AR10 (Patterns)** — Type `Ratio` distinct de `Cents` dans `shared/types/ratio.ts`. Un taux au dénominateur nul vaut **`null`**, propagé jusqu'à l'affichage (« — »). Jamais `0`, jamais `NaN`/`Infinity`.
- **AR11 (Patterns)** — Forme de l'arbre : `natures[] → groups[] → items[]`, chaque nœud portant de quoi construire sa descente (`itemCode` + bornes).
- **AR12 (D23)** — La réponse d'analyse porte `reliability: 'reliable' | 'degraded'` et `unreliableStatements[]` **au niveau période**, pas au niveau nœud.
- **AR13 (D24)** — Chaque nœud rubrique et poste porte `previousTotalCents`, calculé **dans le moteur** (le moteur reçoit les lignes des deux périodes). Pas de diff côté client.
- **AR14 (D25)** — La réponse porte `bankBalance: { openingCents, closingCents } | null` ; `null` si les relevés ne couvrent pas la période de façon contiguë.

**Ingestion**

- **AR15 (D22)** — Ingestion par **boucle client** : un appel `POST /api/statements` par fichier, serveur sans état. La progression est l'état de la boucle. Renoncement assumé : fermer l'onglet perd la progression, le hash rend la reprise idempotente.
- **AR16 (D20)** — Fournisseur **Mistral / `zai-glm-5-2`**, inférence Europe, **un appel par relevé** malgré le contexte d'1 M tokens (grouper coupleraient les destins et violerait FR3/NFR13).
- **AR17 (D20)** — Les sorties structurées Mistral sont **injectées dans le prompt**, pas contraintes au décodage : validation Zod côté application + vérification que chaque code de poste existe réellement + **relance bornée à un essai**.
- **AR18 (D27)** — Ingestion d'un relevé **atomique** : rien n'est persisté tant qu'extraction et réconciliation n'ont pas abouti. Le mode dégradé laisse l'analyse pleinement consultable (elle ne dépend d'aucun appel LLM).
- **AR19 (D26)** — `DELETE /api/statements/:hash` supprime la ligne et cascade sur les transactions, mais **conserve le PDF** dans `_data/raw/` (NFR12).

**Frontend et transverse**

- **AR20 (D8 amendée)** — Invalidation via `fetchState.refresh()` de l'instance `useFetch` capturée. **Jamais `refreshNuxtData` après un `await`** dans un gestionnaire d'événement — le refetch ne part pas, silencieusement.
- **AR21 (PRD § Implementation Considerations)** — Graphiques en **SVG inline, sans bibliothèque tierce**.
- **AR22 (PRD § Accessibility)** — `aria-disabled` + raison dans le nom accessible, jamais `disabled` sur un contrôle porteur d'information ; ne jamais désactiver un élément focalisé.
- **AR23 (D5 amendée)** — Surface d'API cible : `/api/statements`, `/api/transactions`, `/api/categories`, `/api/analysis`. Rien d'autre.

### UX Design Requirements

**Sans objet** — aucune spécification UX n'existe pour ce projet, et il n'en est pas prévu (mono-utilisateur, l'utilisateur est le concepteur). Les exigences d'interface sont portées par AR21, AR22 et NFR18-20.

### FR Coverage Map

**Légende** — *acquis* : capacité déjà livrée par le socle et non retouchée ; *étendu* : capacité existante que le nouveau périmètre modifie ; *neuf* : à construire.

| FR | Epic | Statut | Note |
|---|---|---|---|
| FR1 | 14 | étendu | Dépôt multiple — le dépôt unitaire existe |
| FR2 | 14 | neuf | Progression fichier par fichier |
| FR3 | 14 | neuf | Échec isolé — satisfait par construction via AR15 |
| FR4 | 14 | neuf | Cause d'échec par fichier |
| FR5 | 14 | acquis | Déduplication SHA-256 |
| FR6 | 14 | acquis | Détection de période chevauchante |
| FR7 | 14 | acquis | Dépôt unitaire — non-régression asserted en 14.1 |
| FR8 | 14 | acquis | Liste des relevés + fiabilité — asserted en 13.3 |
| FR9 | 14 | neuf | Suppression d'un relevé, PDF conservé (AR19) |
| FR10 | — | acquis | Réconciliation systématique (`reconciler.ts`) |
| FR11 | — | acquis | Marquage « non fiable » + écart chiffré |
| FR12 | 15 | étendu | Propagation à l'analyse, au niveau période (AR12) |
| FR13 | 14 | acquis | Ajout manuel — non-régression asserted en 14.2 |
| FR14 | 14 | acquis | Acceptation d'un écart — non-régression asserted en 14.2 |
| FR15 | 12 | neuf | Consultation rubriques → postes |
| FR16 | 12 | étendu | CRUD étendu aux deux niveaux |
| FR17 | 12 | neuf | Nature portée par le poste (AR2) |
| FR18 | 12 | étendu | Suppression bloquée + comptage (FK RESTRICT) |
| FR19 | 12 | neuf | Même libellé sous plusieurs rubriques (AR4) |
| FR20 | 13 | étendu | Prompt de catégorisation hiérarchique (13.1) |
| FR21 | 13 | étendu | Reclassement vers un poste |
| FR22 | 13 | neuf | Correction de nature = déplacement vers un poste d'une autre nature |
| FR23 | 13 | étendu | Invalidation via l'instance capturée (AR20) |
| FR24 | 13 | neuf | Taux de correction par relevé — rend le seuil observable |
| FR25 | 15 | neuf | Sélecteur mois / trimestre / année |
| FR26 | 15 | neuf | Répartition des dépenses par rubrique |
| FR27 | 15 | neuf | Répartition des recettes |
| FR28 | 15 | neuf | Dépliage rubrique → postes |
| FR29 | 15 | neuf | Totaux hors mouvements internes (NFR4) |
| FR30 | 15 | neuf | Mouvements internes consultables à part |
| FR31 | 15 | neuf | Évolution sur périodes consécutives |
| FR32 | 15 | neuf | Les 4 indicateurs |
| FR33 | 15 | neuf | Déficit identifiable immédiatement |
| FR34 | 15 | neuf | Rubriques les plus variées (AR13, calculé dans le moteur) |
| FR35 | 15 | neuf | Descente agrégat → transactions (AR8) |
| FR36 | 15 | acquis | Libellé bancaire d'origine + relevé source |
| FR37 | — | phase 2 | Synthèse narrative — hors périmètre de ce découpage |
| FR38 | — | phase 2 | Dépenses récurrentes (`charge-suggester` conservé, sans écran au MVP) |
| FR39 | — | phase 2 | Comparaison explicite de deux périodes |

**Couverture : 39/39.** 5 FRs sont couverts par le socle sans travail nouveau (FR10, FR11, FR13, FR14, FR36) et 3 sont en phase 2 (FR37-39). Les 31 restants sont portés par les epics 12 à 15.

## Epic List

### Numérotation — pourquoi elle démarre à 12

Les epics 1 à 11 de l'ancien découpage sont consommés : les stories 1-1 à 7-8 existent comme fichiers dans `_bmad-output/implementation-artifacts/` et les epics 8 à 11 sont référencés dans `sprint-status.yaml`. Réutiliser ces numéros créerait deux stories « 5-1 » sans rapport dans le même dossier, et Vigie comme le lecteur humain confondraient un travail livré avec un travail à faire.

**Les nouveaux epics démarrent donc à 12**, sans réemploi ni trou volontaire. Les fichiers de stories seront nommés `12-1-*.md` et suivants, dans le même dossier que les anciens.

### Epic 12 : Référentiel hiérarchique et natures de mouvement

L'utilisateur organise ses catégories en rubriques et en postes, et chaque poste déclare s'il représente une recette, une dépense ou un simple mouvement d'argent entre ses propres comptes. C'est la structure que son tableur portait déjà et qu'une liste plate ne sait pas représenter.

**FRs couverts :** FR15, FR16, FR17, FR18, FR19
**Exigences additionnelles :** AR1, AR2, AR3, AR4, AR5 (volet schéma), AR6, AR22 · NFR22

**Note de séquencement — la vidange fait partie de cet epic.** Le passage de `transactions.category_code` à `category_item_code` casse les 207 transactions existantes. Pour que l'epic 12 soit livrable seul et laisse l'application cohérente, la migration **vide les transactions** et pose le nouveau référentiel. La ré-ingestion, elle, attend l'epic 13 et son prompt hiérarchique : ré-ingérer avec l'ancien prompt reviendrait à le faire deux fois. NFR12 rend l'opération sûre — les PDF de `_data/raw/` sont conservés.

### Epic 13 : Catégorisation fiable sur le nouveau référentiel

Les transactions retrouvent leur place — dans une hiérarchie deux fois plus fine, avec un modèle différent — et l'utilisateur peut enfin **mesurer** ce que ça lui coûte en corrections à la main.

**FRs couverts :** FR20, FR21, FR22, FR23, FR24
**Exigences additionnelles :** AR16, AR17, AR18, AR20 · NFR6, NFR7, NFR14, NFR15, NFR16, NFR17

**Ordre des stories = isolation des causes.** Le PRD signale que trois changements arrivent en même temps sur le composant le plus fragile (référentiel plus fin, nouveau modèle, seuil strict) et qu'en cas d'échec on ne saura pas lequel accuser. L'ordre retenu les sépare : on ré-ingère d'abord sur le **référentiel neuf avec le fournisseur actuel**, on mesure ; puis on bascule le fournisseur et on re-mesure. Deux mesures, deux causes distinguables. Cela ne coûte qu'une ré-ingestion supplémentaire de quelques relevés.

### Epic 14 : Ingestion de l'historique complet — et jalon de décision

L'utilisateur dépose ses ~24 relevés en une fois, suit l'avancement, et récupère la main sur les fichiers qui ont échoué sans que le reste soit perdu. À l'issue de cet epic, deux ans de données sont en base — ou l'on sait pourquoi on s'arrête.

**FRs couverts :** FR1, FR2, FR3, FR4, FR5, FR6, FR7, FR8, FR9
**Exigences additionnelles :** AR15, AR18, AR19, AR22 · NFR10, NFR11, NFR12, NFR13, NFR23

**Cet epic se termine par un jalon, pas par une livraison.** La dernière story mesure le taux de correction manuelle réel sur l'historique complet. **Seuil : ≤ 10 %.** Au-delà, l'epic 15 ne démarre pas : on ajuste le modèle, le prompt ou la finesse du référentiel avant de construire des écrans par-dessus une donnée mal rangée. Un graphique de répartition n'est pas validable tant que les lignes sont dans les mauvaises cases.

### Epic 15 : Analyse — répartition, évolution, indicateurs et traçabilité

L'utilisateur voit enfin où part son argent : la répartition sur la période de son choix, l'évolution d'une rubrique dans le temps, les quatre indicateurs, et la possibilité de descendre de n'importe quel montant jusqu'aux lignes de relevé qui le composent. C'est le produit.

**FRs couverts :** FR12, FR25, FR26, FR27, FR28, FR29, FR30, FR31, FR32, FR33, FR34, FR35, FR36
**Exigences additionnelles :** AR7, AR8, AR9, AR10, AR11, AR12, AR13, AR14, AR21, AR22, AR23 · NFR1, NFR2, NFR3, NFR4

**Répartition et évolution sont un seul epic, délibérément.** Les deux vues s'appuient sur le même `analysis-engine.ts` et le même endpoint. Les séparer ferait construire le moteur une première fois sans `previousTotalCents` (AR13) puis le rouvrir pour l'ajouter — de la retouche sur le fichier le plus sensible du produit, celui que NFR3 exige de couvrir à fond. Le moteur est donc construit **complet en une fois**, les vues viennent ensuite comme stories ordonnées.

### Dépendances entre epics

```
12 (référentiel)  →  13 (catégorisation)  →  14 (historique + JALON)  →  15 (analyse)
```

Chaîne strictement linéaire, imposée par le PRD § Séquencement du MVP et par la Decision Impact Analysis de l'architecture. Chaque epic est livrable et cohérent seul : après 12 l'application tourne avec un référentiel neuf et sans transactions ; après 13 l'historique court est reclassé et mesuré ; après 14 deux ans de données sont en base et consultables par relevé ; après 15 l'analyse existe.

Aucun epic ne dépend d'un epic **ultérieur** pour fonctionner.

---

## Epic 12: Référentiel hiérarchique et natures de mouvement

L'utilisateur organise ses catégories en rubriques et en postes, et chaque poste déclare s'il représente une recette, une dépense ou un simple mouvement d'argent entre ses propres comptes.

**FRs :** FR15, FR16, FR17, FR18, FR19 · **AR :** AR1-AR6, AR22 · **NFR :** NFR22

### Story 12.1: Schéma du référentiel à deux niveaux

En tant qu'utilisateur,
je veux que mes catégories soient structurées en rubriques et en postes portant chacun une nature,
afin que la structure de mon ancien tableur soit enfin représentable.

**Acceptance Criteria:**

**Given** la base porte le schéma issu de la migration `0001`
**When** la migration du référentiel est appliquée
**Then** les tables `category_groups(code PK, label, position)` et `category_items(code PK, group_code FK, label, nature, position)` existent
**And** `transactions.category_item_code` référence `category_items` en `ON DELETE RESTRICT`
**And** la table `category_definitions` a disparu

**Given** l'énumération des natures
**When** un développeur l'importe
**Then** elle vit dans `shared/types/movement-nature.ts` et vaut `income | expense | internal_transfer`
**And** aucun libellé français n'apparaît en base ni dans le code

**Given** une base vierge au premier démarrage
**When** le bootstrap s'exécute
**Then** 13 rubriques et 48 postes sont créés depuis un fichier de constantes, hors de toute fonction de calcul (NFR22)
**And** la rubrique « Mouvements internes » existe avec au moins Virement épargne, Virement entre comptes et Retrait d'espèces
**And** les codes de poste suivent le format `<rubrique>-<poste>` en français, de sorte qu'un `ORDER BY code` groupe par rubrique

**Given** deux rubriques différentes
**When** un poste « Restaurant » est créé sous chacune
**Then** les deux coexistent sous des codes distincts (`alimentation-restaurant`, `voyages-restaurant`) — FR19

**Given** une base portant l'ancien schéma
**When** l'application démarre
**Then** `assertSchemaUpToDate()` refuse le démarrage avec un message nommant la migration manquante

**Given** les 207 transactions existantes, dont les catégories n'ont pas d'équivalent dans le nouveau référentiel
**When** la migration s'applique
**Then** les transactions et les relevés sont vidés, et les PDF de `_data/raw/` sont intacts (NFR12, AR5)
**And** l'application démarre et se navigue sans erreur sur une base sans transaction

### Story 12.2: Consultation du référentiel

En tant qu'utilisateur,
je veux voir mes rubriques et les postes qu'elles contiennent,
afin de savoir dans quelles cases mes dépenses peuvent tomber.

**Acceptance Criteria:**

**Given** un référentiel peuplé
**When** l'utilisateur ouvre la page Catégories
**Then** les rubriques sont listées dans leur ordre de position, chacune dépliable sur ses postes
**And** chaque poste affiche son libellé et sa nature en français (Recette / Dépense / Mouvement interne)
**And** chaque poste affiche le nombre de transactions qui le référencent

**Given** deux postes de même libellé sous des rubriques différentes
**When** ils sont affichés
**Then** chacun apparaît sous sa rubrique, sans fusion ni signalement de doublon

**Given** une rubrique sans aucun poste
**When** elle est dépliée
**Then** un état vide explicite est affiché, pas une liste vide muette

### Story 12.3: Création, renommage et suppression d'une rubrique

En tant qu'utilisateur,
je veux gérer mes rubriques,
afin d'adapter le référentiel à ma vie plutôt que l'inverse.

**Acceptance Criteria:**

**Given** la page Catégories
**When** l'utilisateur crée une rubrique avec un libellé
**Then** elle apparaît dans la liste et son code est dérivé du libellé, unique

**Given** une rubrique existante
**When** l'utilisateur la renomme
**Then** le nouveau libellé est persisté, le code est inchangé, et les postes rattachés ne bougent pas
**And** l'écran affiche le nouveau libellé sans rechargement manuel (AR20)

**Given** une rubrique contenant au moins un poste
**When** l'utilisateur tente de la supprimer
**Then** la suppression est refusée avec un code d'erreur stable et le nombre de postes bloquants
**And** le contrôle de suppression reste focalisable, la raison figurant dans son nom accessible (AR22, NFR18-20)

**Given** une rubrique vide
**When** l'utilisateur la supprime et confirme
**Then** elle disparaît de la liste

### Story 12.4: Création, renommage et suppression d'un poste

En tant qu'utilisateur,
je veux gérer mes postes et leur nature,
afin qu'un virement vers mon livret ne soit jamais compté comme une dépense.

**Acceptance Criteria:**

**Given** une rubrique existante
**When** l'utilisateur y crée un poste en choisissant une nature parmi les trois
**Then** le poste est créé sous cette rubrique avec cette nature
**And** son code vaut `<code rubrique>-<slug du libellé>`
**And** la nature est obligatoire : aucun poste ne peut exister sans elle (FR17)

**Given** un poste existant
**When** l'utilisateur modifie son libellé ou sa nature
**Then** la modification est persistée et visible immédiatement

**Given** un poste référencé par au moins une transaction
**When** l'utilisateur tente de le supprimer
**Then** la suppression est refusée, le nombre de transactions bloquantes est indiqué (FR18)
**And** la contrainte `ON DELETE RESTRICT` empêche la suppression même par appel direct à l'API

**Given** un poste sans transaction
**When** l'utilisateur le supprime
**Then** il disparaît du référentiel

---

## Epic 13: Catégorisation fiable sur le nouveau référentiel

Les transactions retrouvent leur place dans une hiérarchie deux fois plus fine, et l'utilisateur peut mesurer ce que ça lui coûte en corrections à la main.

**FRs :** FR20, FR21, FR22, FR23, FR24 · **AR :** AR16-AR18, AR20 · **NFR :** NFR6, NFR7, NFR14-NFR17

**Ordre volontaire.** Le prompt, le reclassement et la mesure sont en place (13.1-13.3) *avant* la ré-ingestion (13.4), sans quoi la mesure du taux n'aurait rien pour s'exprimer. Le référentiel neuf est donc éprouvé avec le fournisseur actuel, *puis* le fournisseur est basculé (13.5). Deux mesures encadrent le changement, ce qui rend les deux causes séparables si le taux de correction dérape.

### Story 13.1: Prompt de catégorisation hiérarchique

En tant qu'utilisateur,
je veux que la catégorisation automatique connaisse mes rubriques, mes postes et leurs natures,
afin que chaque ligne tombe dans la bonne case du premier coup.

**Acceptance Criteria:**

**Given** un référentiel de 13 rubriques et 48 postes
**When** un relevé est catégorisé
**Then** le prompt décrit la hiérarchie rubrique → poste et les trois natures
**And** il est construit depuis la base, jamais figé dans le code : un poste créé par l'utilisateur est proposé au modèle dès l'ingestion suivante
**And** les seules données transmises restent date, libellé et montant (NFR6)

**Given** une réponse du modèle
**When** elle est reçue
**Then** elle est validée par Zod, et chaque code de poste retourné est vérifié comme existant réellement en base (NFR14)
**And** une réponse non conforme est rejetée, jamais interprétée ni corrigée au jugé

**Given** un libellé qu'aucun poste ne recouvre
**When** le modèle doit trancher
**Then** il assigne un poste de repli explicite plutôt que d'inventer un code

### Story 13.2: Reclassement d'une transaction, y compris vers une autre nature

En tant qu'utilisateur,
je veux déplacer une transaction vers n'importe quel poste,
afin de corriger un virement rangé en dépense, qui masquerait un déficit.

**Acceptance Criteria:**

**Given** une transaction affichée dans la liste d'un mois
**When** l'utilisateur ouvre son sélecteur de poste
**Then** les postes sont proposés groupés par rubrique, avec leur nature visible

**Given** une transaction classée en dépense
**When** l'utilisateur la déplace vers un poste de nature `internal_transfer`
**Then** la transaction change de poste et sa nature suit celle du poste (FR22)
**And** elle sort du calcul du résultat de la période sans quitter le solde bancaire (NFR4)

**Given** un reclassement effectué
**When** la mutation aboutit
**Then** l'écran et toutes les vues dépendantes reflètent la nouvelle valeur, via l'instance `useFetch` capturée et non `refreshNuxtData` après un `await` (AR20, FR23)

**Given** un reclassement
**When** il est enregistré
**Then** `is_manual` est posé sur la transaction, et uniquement parce que la catégorie a changé

### Story 13.3: Taux de correction manuelle par relevé

En tant qu'utilisateur,
je veux voir quelle proportion de lignes j'ai dû corriger sur chaque relevé,
afin de savoir si la catégorisation automatique me fait gagner du temps ou me le fait perdre.

**Acceptance Criteria:**

**Given** un relevé ingéré dont des transactions ont été reclassées
**When** l'utilisateur consulte la liste des relevés
**Then** chaque relevé affiche sa période, son état de fiabilité et son taux de correction : lignes `is_manual` / lignes totales (FR8)

**Given** un relevé dont aucune ligne n'a été corrigée
**When** son taux est affiché
**Then** il vaut 0 %, pas « — » : le dénominateur n'est pas nul

**Given** un relevé sans aucune transaction
**When** son taux est affiché
**Then** il vaut « — » et non 0 % — le taux n'est pas défini (AR10)

**Given** un taux dépassant 10 %
**When** il est affiché
**Then** il est visuellement distingué du reste, le seuil provenant d'une constante et non d'un littéral dans le rendu

### Story 13.4: Ré-ingestion de l'historique court sur le référentiel neuf

En tant qu'utilisateur,
je veux retrouver mes relevés déjà traités, rangés dans le nouveau référentiel,
afin de vérifier que la hiérarchie plus fine tient avant d'y verser deux ans d'historique.

**Acceptance Criteria:**

**Given** les PDF conservés dans `_data/raw/` et une base sans transaction
**When** l'utilisateur les ré-ingère
**Then** chaque relevé est traité, réconcilié et rattaché à des postes du nouveau référentiel
**And** aucune transaction ne porte de code de poste inexistant

**Given** la ré-ingestion terminée
**When** l'utilisateur consulte le résultat
**Then** le nombre de transactions par nature est cohérent : les mouvements internes sont non nuls et ne sont classés ni en recette ni en dépense

**Given** cette ré-ingestion
**When** elle est achevée
**Then** le taux de correction de chaque relevé, affiché par la story 13.3, est consigné — **avec le fournisseur actuel**, comme point de comparaison pour la story 13.5

### Story 13.5: Bascule du fournisseur vers Mistral / GLM-5.2

En tant qu'utilisateur,
je veux que mes données soient traitées par une inférence hébergée en Europe,
afin que ce qui sort de ma machine reste sous régime européen.

**Acceptance Criteria:**

**Given** le service de catégorisation
**When** le fournisseur est basculé
**Then** seul `server/services/llm-categorizer.ts` importe le SDK du fournisseur (NFR16)
**And** le modèle appelé est `zai-glm-5-2` chez Mistral, en inférence Europe (NFR7)
**And** la clé est lue depuis une variable d'environnement, jamais journalisée ni retournée en HTTP (NFR8)

**Given** un relevé à catégoriser
**When** l'appel est émis
**Then** il y a **un appel par relevé** — jamais de regroupement de plusieurs relevés (AR16)

**Given** une réponse non conforme au schéma
**When** elle est reçue
**Then** une seule relance est émise, l'erreur de validation étant renvoyée au modèle
**And** un second échec fait échouer proprement l'ingestion de ce relevé, sans rien persister (AR17, AR18)

**Given** le fournisseur indisponible
**When** l'utilisateur consulte l'application
**Then** toutes les données déjà ingérées restent consultables, l'analyse ne dépendant d'aucun appel LLM (NFR17, AR18)

**Given** la bascule effectuée
**When** l'historique court est ré-ingéré
**Then** un second relevé de mesure est consigné et comparé à celui de la story 13.2

---

## Epic 14: Ingestion de l'historique complet — et jalon de décision

L'utilisateur dépose ses ~24 relevés en une fois et récupère la main sur ceux qui ont échoué, sans que le reste soit perdu.

**FRs :** FR1-FR9 · **AR :** AR15, AR18, AR19, AR22 · **NFR :** NFR10-NFR13, NFR23

### Story 14.1: Dépôt multiple avec progression

En tant qu'utilisateur,
je veux déposer plusieurs relevés d'un coup et suivre l'avancement,
afin d'ingérer deux ans d'historique en une session sans surveiller chaque fichier.

**Acceptance Criteria:**

**Given** la page Import
**When** l'utilisateur dépose plusieurs PDF en une opération
**Then** tous sont acceptés et mis en file, l'ordre d'affichage étant stable (FR1)

**Given** une file en cours
**When** les fichiers sont traités
**Then** le client itère et appelle `POST /api/statements` une fois par fichier, le serveur restant sans état (AR15)
**And** chaque fichier affiche son état : en attente, en cours, réussi, échoué (FR2)
**And** un compteur global indique la progression

**Given** un fichier dont le contenu a déjà été ingéré
**When** il est traité
**Then** il est refusé avec un motif explicite et la file continue (FR5)

**Given** un fichier couvrant une période déjà ingérée
**When** il est traité
**Then** l'utilisateur est invité à remplacer ou annuler, sans que les fichiers suivants soient traités en arrière-plan pendant la décision (FR6)

**Given** la page Import
**When** l'utilisateur dépose un seul relevé, hors ingestion en masse
**Then** le chemin unitaire existant reste disponible et inchangé (FR7)

**Given** l'ingestion en cours
**When** l'utilisateur ferme l'onglet
**Then** la progression est perdue et redéposer les fichiers reste sans effet de bord, le hash rendant l'opération idempotente (AR15)

### Story 14.2: Échec isolé et rapport par fichier

En tant qu'utilisateur,
je veux qu'un relevé en échec n'emporte pas les autres et me dise pourquoi,
afin de ne pas tout recommencer à cause d'un PDF mal formé.

**Acceptance Criteria:**

**Given** une file de plusieurs fichiers dont l'un échoue
**When** le traitement se poursuit
**Then** les fichiers suivants sont traités normalement et les précédents restent ingérés (FR3, NFR13)

**Given** un fichier en échec
**When** l'utilisateur consulte la file
**Then** la cause est affichée en français, distinguant au minimum : PDF illisible, période introuvable, fournisseur LLM indisponible, réponse non conforme (FR4)

**Given** un fichier dont l'extraction ou la réconciliation échoue
**When** l'ingestion s'interrompt
**Then** rien n'est persisté pour ce relevé : ni ligne `bank_statements`, ni transaction (AR18)

**Given** une file entièrement traitée
**When** elle se termine
**Then** un récapitulatif indique combien de relevés ont réussi, échoué, ou été refusés en doublon

**Given** un relevé ingéré présentant un écart de réconciliation
**When** l'utilisateur ouvre sa page de réconciliation
**Then** les chemins existants restent disponibles : ajouter une transaction manquante (FR13) ou accepter l'écart en conservant l'état « non fiable » (FR14)

### Story 14.3: Suppression d'un relevé ingéré

En tant qu'utilisateur,
je veux retirer un relevé entré par erreur,
afin de ne pas devoir vider ma base pour un seul mauvais PDF.

**Acceptance Criteria:**

**Given** un relevé ingéré
**When** l'utilisateur le supprime et confirme
**Then** la ligne `bank_statements` et ses transactions disparaissent par cascade (FR9)
**And** le fichier PDF de `_data/raw/` est **conservé** (AR19, NFR12)

**Given** un relevé venant d'être supprimé
**When** l'utilisateur redépose le même fichier
**Then** l'ingestion aboutit — la déduplication porte sur la ligne en base, pas sur le fichier

**Given** le contrôle de suppression
**When** il est indisponible
**Then** il reste focalisable et sa raison figure dans son nom accessible (AR22)

### Story 14.4: Jalon — ingestion de l'historique et mesure du taux de correction

En tant qu'utilisateur,
je veux ingérer mes 24 relevés réels et connaître mon taux de correction réel,
afin de décider si la catégorisation tient avant de construire des écrans par-dessus.

**Acceptance Criteria:**

**Given** les ~24 relevés Boursorama de deux ans
**When** ils sont déposés en une session
**Then** ils sont tous traités sans abandon, ou les échecs sont identifiés et expliqués

**Given** l'historique ingéré
**When** la réconciliation est vérifiée
**Then** 100 % des relevés sont réconciliés au centime ou explicitement marqués « non fiable » — aucun n'entre silencieusement avec un écart (NFR10, NFR11)

**Given** l'historique ingéré et les corrections faites
**When** le taux de correction manuelle est mesuré par relevé
**Then** il est consigné, relevé par relevé, et sa valeur globale est comparée au **seuil de 10 %**

**Given** un taux global supérieur à 10 %
**When** le jalon est évalué
**Then** l'epic 15 ne démarre pas : le modèle, le prompt ou la finesse du référentiel sont ajustés d'abord
**And** la décision et sa justification sont consignées

**Given** l'historique complet en base
**When** le temps d'agrégation est observé lors d'un changement de période
**Then** il est mesuré et consigné, sans cible imposée à ce stade (NFR23)

---

## Epic 15: Analyse — répartition, évolution, indicateurs et traçabilité

L'utilisateur voit où part son argent, sur la période de son choix, et peut descendre de n'importe quel montant jusqu'aux lignes qui le composent.

**FRs :** FR12, FR25-FR36 · **AR :** AR7-AR14, AR21, AR22, AR23 · **NFR :** NFR1-NFR4

### Story 15.1: Moteur d'analyse — arbre d'agrégats et indicateurs

En tant qu'utilisateur,
je veux que mes totaux soient calculés de façon exacte et vérifiable,
afin de pouvoir décider sur des chiffres auxquels je fais confiance.

**Acceptance Criteria:**

**Given** un jeu de transactions et les bornes d'une période
**When** `analysis-engine.ts` est appelé
**Then** il rend l'arbre `natures[] → groups[] → items[]`, chaque nœud portant son total en `Cents` et son nombre de transactions (AR11)
**And** la fonction est **pure** : elle n'importe jamais le client de base de données (AR7)

**Given** l'arbre produit
**When** les totaux de recettes et de dépenses sont calculés
**Then** les mouvements internes en sont exclus, et sont totalisés à part (FR29, NFR4)

**Given** une période
**When** les quatre indicateurs sont calculés
**Then** la trésorerie de la période et la trésorerie cumulée sont des `Cents`, le taux de dépense et le taux d'épargne des `Ratio` (AR10)
**And** aucun ratio n'est typé `Cents`, ni l'inverse

**Given** une période sans aucune recette
**When** le taux d'épargne est calculé
**Then** il vaut `null` — jamais `0`, jamais `NaN`, jamais `Infinity` (AR10, NFR3)

**Given** une période sans aucune transaction
**When** le moteur est appelé
**Then** il rend un arbre vide et des indicateurs cohérents, sans lever d'exception (NFR3)

**Given** une transaction de signe inattendu pour la nature de son poste
**When** elle est agrégée
**Then** le comportement est défini, testé et documenté plutôt que subi (NFR3)

**Given** les lignes de la période précédente
**When** le moteur les reçoit
**Then** chaque nœud rubrique et poste porte `previousTotalCents`, calculé dans le moteur et non côté client (AR13)

### Story 15.2: Endpoint d'analyse avec fiabilité et solde bancaire

En tant qu'utilisateur,
je veux que l'application me dise quand un total repose sur un relevé douteux,
afin de ne jamais prendre un chiffre bancal pour un chiffre normal.

**Acceptance Criteria:**

**Given** l'endpoint `GET /api/analysis`
**When** il est appelé avec `from`, `to` et `granularity`
**Then** les bornes sont au format `YYYY-MM-DD` et `granularity ∈ month|quarter|year` (AR9)
**And** aucun identifiant de période composite n'est accepté

**Given** un appel valide
**When** la réponse est construite
**Then** l'endpoint est une couche mince : il va chercher les lignes et appelle le moteur (AR7)
**And** la réponse ne transporte aucune transaction (AR8)

**Given** une période dont au moins un relevé est non fiable
**When** la réponse est construite
**Then** elle porte `reliability: 'degraded'` et `unreliableStatements[]` avec hash, période et écart, **au niveau période** (AR12, FR12, NFR11)

**Given** des relevés couvrant la période de façon contiguë
**When** la réponse est construite
**Then** elle porte `bankBalance: { openingCents, closingCents }` (AR14)

**Given** un trou dans l'historique sur la période demandée
**When** la réponse est construite
**Then** `bankBalance` vaut `null` — le solde est indéterminé et ne sera pas inventé (AR14)

**Given** des paramètres invalides
**When** l'endpoint est appelé
**Then** il répond via `createError` avec un code stable et le détail Zod

### Story 15.3: Page d'analyse — sélecteur de période et indicateurs

En tant qu'utilisateur,
je veux choisir une période et voir immédiatement si elle est déficitaire,
afin de repérer en un coup d'œil les mois où ça dérape.

**Acceptance Criteria:**

**Given** la page d'analyse
**When** l'utilisateur choisit une granularité mois, trimestre ou année
**Then** la période affichée s'ajuste et l'URL reflète la sélection (FR25)
**And** l'utilisateur peut naviguer vers la période précédente ou suivante

**Given** une période sélectionnée
**When** ses indicateurs sont affichés
**Then** la trésorerie de la période, le taux de dépense, la trésorerie cumulée et le taux d'épargne sont visibles (FR32)
**And** un taux `null` s'affiche « — », jamais 0 % (AR10)

**Given** une période déficitaire
**When** elle est affichée
**Then** le déficit est immédiatement identifiable, sans lecture de chiffres (FR33)
**And** le résultat affiché exclut les mouvements internes, le solde bancaire les incluant, les deux étant distingués (NFR4, AR14)

**Given** une période marquée `degraded`
**When** elle est affichée
**Then** l'avertissement est visible avec les relevés en cause et leur écart (FR12)

**Given** une période sans transaction
**When** elle est affichée
**Then** un état vide explicite est affiché, pas des zéros

### Story 15.4: Répartition par rubrique et par poste

En tant qu'utilisateur,
je veux voir la répartition de mes dépenses et de mes recettes sur la période,
afin de découvrir où part réellement mon argent.

**Acceptance Criteria:**

**Given** une période sélectionnée
**When** la répartition des dépenses est affichée
**Then** les rubriques sont représentées avec leur montant et leur part, en SVG inline sans bibliothèque tierce (FR26, AR21)

**Given** la même période
**When** la répartition des recettes est affichée
**Then** elle est présentée séparément de celle des dépenses (FR27)

**Given** une rubrique affichée
**When** l'utilisateur la déplie
**Then** ses postes apparaissent avec leur montant et leur part dans la rubrique (FR28)

**Given** les mouvements internes de la période
**When** ils sont consultés
**Then** ils sont accessibles à part, jamais mêlés aux recettes ni aux dépenses (FR30, FR29)

**Given** un graphique affiché
**When** la fenêtre est redimensionnée en largeur
**Then** le contenu large défile dans son propre conteneur, la page ne défilant jamais horizontalement

### Story 15.5: Descente d'un agrégat jusqu'aux transactions

En tant qu'utilisateur,
je veux cliquer sur un montant et voir les lignes qui le composent,
afin de ne jamais avoir à croire un chiffre sur parole.

**Acceptance Criteria:**

**Given** un nœud poste affiché avec son montant
**When** l'utilisateur l'active
**Then** les transactions correspondantes sont affichées, obtenues via `GET /api/transactions?from=&to=&item=` (FR35, AR8)

**Given** les transactions affichées
**When** l'utilisateur les consulte
**Then** chacune montre sa date, son libellé bancaire d'origine, son montant et le relevé dont elle provient (FR36)

**Given** la somme des transactions affichées
**When** elle est comparée au montant du nœud d'où l'on vient
**Then** les deux coïncident au centime (NFR2)

**Given** n'importe quel montant, ratio ou point de courbe affiché dans l'application
**When** on cherche son origine
**Then** un chemin existe jusqu'aux lignes sources (NFR2)

### Story 15.6: Évolution entre périodes et rubriques les plus variées

En tant qu'utilisateur,
je veux voir comment une rubrique évolue dans le temps et ce qui a bougé quand un mois dérape,
afin de comprendre pourquoi je suis dans le rouge plutôt que de le constater.

**Acceptance Criteria:**

**Given** une rubrique ou un poste
**When** l'utilisateur demande son évolution
**Then** une série sur les périodes consécutives est affichée, à la granularité courante, en SVG inline (FR31, AR21)

**Given** une période déficitaire
**When** l'utilisateur en cherche la cause
**Then** les rubriques sont classées par écart avec la période précédente, la plus contributrice en tête (FR34)
**And** cet écart vient de `previousTotalCents` calculé par le moteur, non d'un diff côté client (AR13)

**Given** une période sans période précédente en base
**When** les écarts sont affichés
**Then** l'absence de comparaison est explicite, aucun écart n'étant présenté comme nul

**Given** une correction de catégorie effectuée depuis la vue des transactions
**When** l'utilisateur revient à l'analyse
**Then** les agrégats et indicateurs reflètent la correction (FR23, AR20)

---

## Epic 16 — Système de design et refonte du front

**Origine :** revue du front du 2026-09-05, canevas de conception validé par l'utilisateur.
Aucune fonctionnalité nouvelle — l'epic ne touche ni le moteur, ni les endpoints, ni le schéma.
Il rend cohérent et dense ce qui existe, et supprime la duplication CSS accumulée story après story.

**Constat chiffré à l'ouverture :** 277 règles CSS pour ~15 motifs réels ; le même bouton
redéfini 6 fois sous 5 noms de classe (`.btn`, `.confirm__btn`, `.rec-gap__btn`, `.add-tx__btn`,
`.cat-editor__trigger`) ; 4 définitions locales de tableau ; les trois couleurs sémantiques
(`#10b981`, `#ef4444`, `#f59e0b`) échouent au contraste AA sur blanc alors qu'elles sont
utilisées **en texte**.

**Décisions de conception retenues (canevas validé) :**
- Densité **outil de travail** : ligne de tableau 32 px, contrôle 28/32 px, base 13 px.
- Barre unique en haut : en-tête et navigation fusionnés, état actif, compteurs de santé de la
  base à droite. Le rail latéral a été dessiné et **écarté** : 208 px de largeur perdus sur des
  écrans dont la ressource rare est la largeur, pas la hauteur.
- **La couleur signale, elle ne décore pas** : montants neutres, couleur réservée aux totaux,
  aux écarts et aux alertes. L'écart tient compte de la nature du poste.
- Ombre réservée à ce qui recouvre le contenu (menu, dialogue, infobulle) ; une surface posée
  dans le flux se sépare par un filet de 1 px.
- Chiffres en fonte à chasse fixe, tabulaires, alignés à droite.

### Story 16.1: Fondations — tokens, fontes et reset

En tant que développeur,
je veux une seule source de vérité pour les couleurs, la typographie et les espacements,
afin que deux écrans écrits à six mois d'intervalle se ressemblent sans effort.

**Acceptance Criteria:**

**Given** la rampe neutre
**When** un gris intermédiaire est nécessaire
**Then** il existe comme token (11 marches de 0 à 900) et aucun `color-mix()` ne le fabrique

**Given** les couleurs sémantiques positif / négatif / avertissement
**When** elles sont utilisées en texte sur le fond de l'application
**Then** leur contraste atteint au moins 4,5:1 (WCAG AA)
**And** une variante vive distincte existe pour les aplats et les tracés de courbe

**Given** l'application, qui est locale et fonctionne sans réseau
**When** une fonte de marque est utilisée
**Then** ses fichiers sont servis depuis le dépôt, jamais depuis un CDN tiers

**Given** un montant affiché n'importe où dans l'application
**When** il est rendu
**Then** il utilise des chiffres tabulaires et un alignement à droite

### Story 16.2: Primitives partagées — bouton, champ, tableau, badge, surface

En tant que développeur,
je veux que chaque motif d'interface existe une fois,
afin qu'une correction de survol ou de focus s'applique partout d'un coup.

**Acceptance Criteria:**

**Given** un bouton dans n'importe quel écran ou dialogue
**When** on cherche sa définition
**Then** elle est unique, et les variantes (principale, neutre, discrète, danger) en dérivent

**Given** un contrôle qui porte une information et n'est pas disponible
**When** il est rendu
**Then** il reste focusable, porte `aria-disabled` et dit la raison dans son nom accessible (NFR18-20)

**Given** un tableau de données
**When** on le fait défiler
**Then** son en-tête reste visible
**And** la hauteur de ligne, les filets et le survol sont identiques à ceux de tous les autres tableaux

**Given** les règles CSS écrites en `<style scoped>` dans `app/`
**When** elles sont comptées par
`grep -rhoE "^\.[a-z0-9_-]+(__[a-z0-9-]+)?(--[a-z0-9-]+)? \{" --include='*.vue' app/ | wc -l`
**Then** leur nombre a diminué par rapport aux 277 de l'ouverture de l'epic

**Given** les motifs partagés — bouton, champ, tableau, panneau, badge
**When** on les cherche ailleurs que dans `components.css`
**Then** aucun n'y est redéfini localement, ce que vérifient
`grep -rnE "^\s*\.[a-z0-9_-]*(btn|button)[a-z0-9_-]* \{" --include='*.vue' app/` et
`grep -rn "border-collapse" --include='*.vue' app/`

> La feuille partagée ajoute ses propres règles : le total pour `app/` n'est donc pas
> attendu en baisse, et ce n'est pas ce que mesure ce critère. Ce qui disparaît, c'est la
> DUPLICATION — six définitions de bouton, quatre de tableau — et l'énoncé le dit désormais
> plutôt que de laisser croire à une baisse globale (revue du 2026-09-05).

### Story 16.3: Barre d'application et compteurs de santé

En tant qu'utilisateur,
je veux savoir en permanence où je suis et dans quel état est ma base,
afin de ne pas avoir à ouvrir l'import pour vérifier qu'aucun relevé ne diverge.

**Acceptance Criteria:**

**Given** n'importe quelle page
**When** elle est affichée
**Then** l'entrée de navigation correspondante est visuellement active et l'indique aux technologies d'assistance

**Given** la barre d'application
**When** elle est affichée
**Then** elle porte le nombre de lignes et de relevés, l'écart de réconciliation cumulé et le taux de correction manuelle, sur l'ensemble de la base

**Given** un compteur global et un compteur d'en-tête de page
**When** ils portent la même grandeur sur des portées différentes
**Then** leur portée est explicite dans le libellé, et aucun des deux ne répète l'autre

### Story 16.4: Refonte des six écrans

En tant qu'utilisateur,
je veux voir plus de lignes sans défiler et repérer d'un coup d'œil ce qui a bougé,
afin de corriger et de comprendre plus vite.

**Acceptance Criteria:**

**Given** la liste des transactions d'un mois
**When** elle est affichée sur un écran de bureau
**Then** au moins 20 lignes sont visibles sans défilement
**And** un filtre par libellé permet d'en atteindre une sans dérouler la liste entière

**Given** un montant de transaction dans une liste
**When** il est affiché
**Then** il est neutre ; seuls les totaux, les écarts et les alertes portent une couleur

**Given** les quatre indicateurs d'une période
**When** ils sont affichés
**Then** ils forment un bandeau unique séparé par des filets, sans ombre

**Given** les tests existants — unitaires et de bout en bout
**When** ils sont exécutés après la refonte
**Then** ils passent, les seules modifications admises portant sur des libellés délibérément changés

### Story 16.5: Descente vers les transactions depuis la trajectoire d'une rubrique

> **Statut : conçue, NON implémentée.** Dessinée sur le canevas du 2026-09-05 et validée, mais
> laissée hors de la refonte : contrairement au reste de l'epic 16, elle demande une capacité
> d'API nouvelle (`GET /api/transactions` ne sait filtrer que par POSTE, pas par RUBRIQUE).
> Le périmètre étant verrouillé, l'ajout est signalé plutôt que fait en passant.

En tant qu'utilisateur,
je veux ouvrir une tranche de la courbe d'une rubrique pour en voir les lignes,
afin de corriger une catégorie à l'endroit où je la vois déraper, sans changer de page.

**Acceptance Criteria:**

**Given** une rubrique suivie sur douze tranches
**When** l'utilisateur active un point de la courbe ou la ligne de la tranche correspondante
**Then** les transactions de cette tranche pour cette cible s'affichent sous le graphique

**Given** une cible qui est une RUBRIQUE et non un poste
**When** ses lignes sont demandées
**Then** l'endpoint sait les filtrer par rubrique, sans que le client agrège lui-même

**Given** une ligne affichée dans cette descente
**When** l'utilisateur la reclasse
**Then** le geste est le même que sur `/analyse`, et la courbe reflète la correction
