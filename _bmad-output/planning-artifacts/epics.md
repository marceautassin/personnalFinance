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
amendments:
  - date: '2026-09-22'
    scope: >-
      Chantier « Profils et banques » (rang 1). FR73 à FR81, NFR35, NFR36,
      AR34 à AR41 ajoutées ; FR46, FR49, FR72, NFR6, NFR9, NFR24 amendées.
      Epics 27 et 28 ajoutés ; story 22.2 absorbée.
  - date: '2026-09-12'
    scope: >-
      Périmètre foyer (Phase 1 bis du PRD). Inventaire étendu de FR44 à FR62 et
      de NFR24 à NFR30, NFR2/NFR5/NFR9/NFR12/FR31 mises à jour, AR24 à AR31
      ajoutées. Epics 22 à 25 ajoutés. Le document est complété, jamais recréé.
---

# personnalFinance - Epic Breakdown

## Overview

Découpage du PRD réécrit du 2026-09-04 (39 FRs / 23 NFRs / 4 parcours) et de l'amendement d'architecture du même jour (D17-D27) en epics et stories implémentables.

> **Amendement du 2026-09-12 — le périmètre foyer.** Le PRD a été révisé puis validé le même jour : il porte désormais **62 FRs, 30 NFRs et 7 parcours**. Ce qui s'ajoute est la Phase 1 bis, où l'application cesse d'être mono-utilisateur et mono-machine : identité déléguée, second membre cloisonné, dépenses communes partagées à parts égales, saisie des dépenses en espèces, et décompte « qui doit combien à qui ».
>
> **Amendement du 2026-09-22 — profils et banques.** Le PRD porte **81 FRs, 36 NFRs et 9 parcours**. Chantier de rang 1 : les données appartiennent à des profils avant toute authentification, et les relevés Crédit Mutuel entrent au même niveau d'exigence que ceux de Boursorama. Epics **27 et 28** ; la story 22.2 est absorbée.
>
> **Ce document est complété, pas remplacé.** Les epics 12 à 21 restent en l'état ; les nouveaux démarrent à **22**, pour la raison exposée plus bas au sujet de la numérotation.

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

**Périmètre foyer — ajouté le 2026-09-12 (Phase 1 bis)**

*Identité et foyer*

- **FR44** — L'utilisateur s'authentifie via un fournisseur d'identité externe. Aucun mot de passe ni empreinte n'est stocké par l'application.
- **FR45** — Le fondateur peut inviter une personne en désignant son adresse. Invitation à usage unique, expirant sous 7 jours.
- **FR46** — La personne invitée rejoint le foyer à sa première connexion, dans un espace vierge : aucun relevé, aucune transaction, aucun référentiel hérité.
- **FR47** — L'utilisateur peut consulter la liste des membres de son foyer.
- **FR48** — Le fondateur peut retirer un membre. Retrait refusé tant que son solde n'est pas nul, montant restant indiqué.
- **FR49** — Un membre n'accède ni aux relevés, ni aux transactions, ni au référentiel, ni aux indicateurs d'un autre membre. *(Amendée le 2026-09-12 : seule exception, FR64.)*

*Dépenses communes*

- **FR50** — L'utilisateur peut marquer une transaction comme dépense commune, depuis l'écran où elle est déjà affichée. Le marquage indique explicitement qu'il **rend la dépense visible à l'autre membre**.
- **FR51** — Une dépense commune est répartie à parts égales, la somme des parts valant le montant au centime.
- **FR52** — Une dépense commune reste rangée dans le poste du payeur et pèse dans son analyse. Elle n'apparaît dans aucun autre référentiel.
- **FR53** — L'utilisateur peut retirer le marquage « commune », le solde du foyer étant recalculé immédiatement.

*Saisie manuelle des dépenses en espèces*

- **FR54** — L'utilisateur peut saisir une dépense en espèces : date, libellé, montant, poste.
- **FR55** — Une saisie manuelle n'entre dans la réconciliation d'aucun relevé et ne peut en faire basculer aucun en « non fiable ».
- **FR56** — Une saisie manuelle est identifiée comme telle partout où elle contribue à un montant affiché.
- **FR57** — L'utilisateur peut modifier et supprimer une dépense qu'il a saisie.

*Solde du foyer et règlement*

- **FR58** — Le fondateur peut saisir un solde d'ouverture daté et orienté, relu en toutes lettres avant enregistrement, pour reprendre un décompte tenu ailleurs.
- **FR59** — L'utilisateur peut consulter qui doit combien à qui, à tout moment.
- **FR60** — L'utilisateur peut descendre du solde du foyer jusqu'aux dépenses qui le composent, chacune identifiée par son origine.
- **FR61** — L'utilisateur peut enregistrer un règlement entre deux membres, qui réduit leur solde d'autant.
- **FR62** — L'utilisateur peut rattacher un règlement à la transaction de son relevé qui le porte. Cette transaction n'est alors comptée ni en recette ni en dépense.
- **FR63** — Une dépense commune dont l'avance est couverte par un remboursement rattaché — notamment un virement du compte joint — **n'alimente plus le décompte**. Le décompte ne porte que ce que le joint n'a pas soldé.
- **FR64** — Une dépense marquée commune est visible des **deux** membres : date, libellé, montant, payeur. Elle reste absente du référentiel et de l'analyse de celui qui ne l'a pas payée. **Seule exception au cloisonnement de FR49.**

**Périmètre agent conversationnel — ajouté le 2026-09-12 (premier chantier)**

- **FR65** — L'utilisateur peut ouvrir à tout moment une conversation et poser une question en langage ordinaire sur ses données.
- **FR66** — L'agent répond en français à partir des agrégats renvoyés par le moteur. Il ne produit aucun montant qui ne lui ait été renvoyé.
- **FR67** — L'utilisateur peut poser une question de suite sans redonner le contexte.
- **FR68** — Chaque réponse affiche la période et le filtre sur lesquels elle repose, et ouvre l'écran d'analyse correspondant.
- **FR69** — L'agent indique explicitement qu'il ne peut pas répondre lorsque la question sort de ce que le moteur sait calculer.
- **FR70** — L'utilisateur peut retrouver ses conversations passées et en reprendre une avec son contexte.
- **FR71** — L'utilisateur peut supprimer une conversation.
- **FR72** — L'agent n'interroge que les données de l'utilisateur connecté et les dépenses marquées communes (FR64).
- **FR37** — *(absorbée par FR65 à FR72.)* La synthèse narrative était la version non interactive de l'agent.

**Profils et banques — ajoutées le 2026-09-22 (chantier de rang 1)**

- **FR73** — L'utilisateur peut créer un profil (nom, banque par défaut). Un profil créé démarre sans relevé, transaction ni règle, avec le **référentiel initial**, jamais celui d'un autre profil.
- **FR74** — L'utilisateur peut choisir le profil courant. Son nom est affiché sur chaque écran.
- **FR75** — Toutes les données existantes sont rattachées au profil `marceau` par une migration unique. Nombre de transactions et total de chaque relevé identiques avant et après.
- **FR76** — Chaque écran et chaque endpoint de données ne restitue que les données du profil courant, restriction appliquée côté serveur.
- **FR77** — La banque d'un relevé est préremplie depuis le profil courant et modifiable. Chaque relevé conserve sa banque.
- **FR78** — Le système extrait les relevés Boursorama et Crédit Mutuel. Un relevé qui ne correspond pas à la banque choisie est refusé avec sa cause, aucune transaction enregistrée.
- **FR79** — Relevé Crédit Mutuel : seule la section du compte courant est ingérée et réconciliée sur ses propres soldes ; les autres sections sont ignorées et nommées.
- **FR80** — Débit différé de carte : l'agrégat est remplacé par les achats du détail, datés du jour d'achat. Écart ≥ 1 centime → relevé non fiable, écart exposé. Agrégat sans détail → conservé, relevé non fiable avec cette cause.
- **FR81** — Déduplication, chevauchement de période et réconciliation s'appliquent quelle que soit la banque, et par profil.
- *(Amendées le 2026-09-22 : **FR46** — référentiel de départ = référentiel initial, rattachement à un profil existant ; **FR49** — s'applique entre profils dès FR76 ; **FR72** — profil courant, puis utilisateur connecté.)*

**FR mises à jour le 2026-09-12**

- **FR31** — *(réécrite)* L'utilisateur choisit **ce qu'il regarde** — un trimestre, une année, ou l'historique complet — et la série est toujours découpée au **mois**. L'ancienne rédaction, « sur plusieurs périodes consécutives », décrivait le comportement d'avant la refonte du 2026-09-07 et ne disait ni combien de périodes, ni qui choisissait la fenêtre. **Aucun travail : l'énoncé rattrape le produit livré.**

### NonFunctional Requirements

**Justesse financière**

- **NFR1** — Valeurs monétaires en centimes entiers. Aucune arithmétique en virgule flottante. Conversion en euros à l'affichage seulement.
- **NFR2** — *(élargie le 2026-09-12)* Tout montant affiché est traçable jusqu'aux éléments qui le composent — transactions de relevé, saisies manuelles, solde d'ouverture, règlements — chacun identifié par son origine. Aucun agrégat, ratio, point de courbe ou solde de foyer sans chemin vers ses sources.
- **NFR3** — Les fonctions de calcul (agrégats par période / nature / rubrique / poste, et les 4 indicateurs) sont couvertes par au moins un cas nominal et deux cas limites : période sans transaction, recettes nulles (division par zéro), montant de signe inattendu pour la nature.
- **NFR4** — Le résultat d'une période exclut systématiquement les mouvements internes ; le solde bancaire les inclut. Deux valeurs calculées séparément, jamais confondues.

**Sécurité et confidentialité**

- **NFR5** — *(élargie le 2026-09-12)* PDF, base et **sauvegardes** stockés exclusivement sur le **réseau local du foyer** : machine hôte, plus une seconde machine du même réseau pour les sauvegardes. Aucun fichier source transmis à un tiers, ni à un hébergeur de sauvegarde.
- **NFR6** — Seules la date, le libellé et le montant sont transmis au fournisseur LLM. Aucun nom, IBAN, RIB ni adresse.
- **NFR7** — L'inférence LLM s'exécute sur une infrastructure hébergée dans l'Union européenne.
- **NFR8** — Clé d'API lue depuis une variable d'environnement, jamais en base, jamais journalisée, jamais retournée en HTTP.
- **NFR9** — *(**INVERSÉE** le 2026-09-12)* Aucun écran, aucun endpoint, aucune donnée n'est accessible sans authentification. L'application est joignable depuis Internet et ne suppose plus aucun environnement de confiance. La condition posée par l'ancienne rédaction — « toute exposition réseau rendrait l'auth bloquante » — est remplie.

**Fiabilité des données**

- **NFR10** — Réconciliation exécutée à chaque ingestion, sans exception ni contournement possible.
- **NFR11** — Un écart ≥ 1 centime marque le relevé « non fiable » ; l'état est propagé à tout agrégat auquel il contribue.
- **NFR12** — *(**INVERSÉE** le 2026-09-12)* Sauvegarde **quotidienne**, sur une machine du réseau local **distincte de l'hôte**, rétention d'au moins **30 jours**, capacité à restaurer vérifiée par une restauration réelle. La perte de la base n'est plus acceptable : marquages « commune », saisies en espèces, solde d'ouverture et règlements n'existent dans aucun PDF. ⚠️ **AR5 tombe avec elle** — la migration par vidage n'est plus une option.
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

**Cloisonnement et exposition — ajoutées le 2026-09-12**

- **NFR24** — Séparation des données entre membres appliquée **côté serveur à chaque requête**. Aucun filtrage côté interface ne tient lieu de cloisonnement. *(Amendée le 2026-09-12 : une seule exception, énumérée et close — les dépenses marquées communes, FR64.)*
- **NFR25** — L'application ne détient aucun secret d'authentification. Identité vérifiée par un fournisseur externe.
- **NFR26** — Toute requête venue hors du réseau local transite par un canal chiffré. Aucune page accessible sans authentification, indexation refusée.

**Garde-fous de l'agent — ajoutées le 2026-09-12**

- **NFR31** — L'agent ne cite aucun nombre qui ne figure **tel quel** dans ce qu'il a reçu du moteur. Un nombre dérivé — moyenne, écart, pourcentage — n'est énonçable que si le moteur l'a calculé. Forme **vérifiable** de NFR15.
- **NFR32** — L'agent n'accède à la base par aucun chemin. Il obtient ses données exclusivement par les endpoints d'analyse. Aucun de ses modules n'importe le client de base.
- **NFR33** — Toute réponse portant un montant expose la période et le filtre d'où il provient, et donne accès à l'écran qui le compose.
- **NFR34** — Identifiant du modèle et paramètres d'appel lus depuis la configuration d'environnement, **valeur distincte par usage** (catégorisation, agent). Aucun module ne les code en dur. Pas d'écran de paramétrage : changer de modèle impose de re-mesurer le taux de correction.
- **NFR17** — *(étendue)* L'indisponibilité du fournisseur fait échouer proprement l'ingestion **et l'agent**. Toutes les autres capacités restent intactes.
- **NFR6** — *(réécrite)* Bloc d'identité coupé avant transmission ; lignes brutes du tableau d'opérations transmises ; nom du titulaire résiduel dans les libellés, assumé.

**Profils et banques — ajoutées le 2026-09-22**

- **NFR35** — **Porte d'exposition.** Tant que FR44 n'est pas livrée, aucune connexion depuis l'extérieur du réseau local. Le choix du profil n'est présenté nulle part comme une authentification.
- **NFR36** — Chaque banque a un test d'extraction sur relevé réel anonymisé : aucun IBAN, numéro de compte ni de carte dans le texte transmis, **libellés compris** ; aucun nom ni adresse hors libellés ; réconciliation au centime ; pour le Crédit Mutuel, compte courant seul et égalité détail carte / agrégat. Aucun identifiant réel dans la fixture.
- *(Amendées le 2026-09-22 : **NFR6** vaut pour chaque banque ; **NFR9** s'applique à partir de FR44, NFR35 d'ici là ; **NFR24** vaut entre profils avant FR44.)*

**Justesse du partage — ajoutées le 2026-09-12**

- **NFR27** — La somme des parts d'une dépense commune égale son montant, au centime. Un montant à moitié impaire est réparti sans perte ni création : jamais deux fois le même arrondi.
- **NFR28** — Saisies manuelles et transactions de relevé forment **deux jeux distincts**. Une saisie n'entre dans aucun calcul de réconciliation et ne modifie l'état de fiabilité d'aucun relevé.
- **NFR29** — Une transaction rattachée à un règlement n'est comptée ni en recette ni en dépense. Aucun montant ne contribue à la fois au résultat d'un membre et à l'extinction d'une dette du foyer.
- **NFR30** — Deux modifications concurrentes du solde du foyer ne peuvent se perdre l'une l'autre. Une écriture fondée sur un état obsolète est **refusée** et son auteur informé, jamais appliquée par-dessus celle de l'autre membre.

*Scalabilité : plus « sans objet ». Deux utilisateurs, un serveur personnel, volume inchangé. Ce qui change est la **concurrence**, portée par NFR30.*

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
- **AR23 (D5 amendée)** — Surface d'API cible : `/api/statements`, `/api/transactions`, `/api/categories`, `/api/analysis`. Rien d'autre. *(Amendée le 2026-09-12, voir AR27.)*

**Périmètre foyer — ajoutées le 2026-09-12**

Ces exigences ne sortent pas d'un amendement d'architecture déjà écrit : **l'architecture n'a pas encore statué sur le multi-utilisateur.** Elles énoncent les contraintes que le découpage impose et que l'architecte devra trancher ou contredire explicitement.

- **AR24 — Propriété des données, migration préservante.** Chaque table métier — relevés, transactions, référentiel, règles, groupes — porte un propriétaire. La migration **préserve l'historique existant** et l'attribue au fondateur. ⚠️ **AR5 et D18 ne s'appliquent plus** : le vidage puis la ré-ingestion était sûr tant que les PDF reconstruisaient tout, la NFR12 inversée ferme cette voie. C'est la contrainte la plus structurante du périmètre.
- **AR25 — Le cloisonnement se pose dans les endpoints, jamais dans le moteur.** D19 tient : `analysis-engine.ts` reste une fonction pure qui reçoit des lignes. C'est l'endpoint qui restreint les lignes au membre connecté. Le moteur ne connaît pas la notion de membre, et ne doit pas l'apprendre.
- **AR26 — D11 à D16 sont un précédent, pas un modèle.** Un modèle multi-profils a existé dans l'architecture, retiré le 2026-09-04 comme une fiction. Il décrivait des profils **gérés par un utilisateur unique**, sans authentification ni cloisonnement. À relire pour ne pas refaire les mêmes erreurs, jamais à recopier.
- **AR27 — Surface d'API étendue (AR23 amendée).** S'ajoutent les ressources du foyer : membres et invitations, dépenses saisies à la main, décompte et règlements entre membres. ⚠️ **Collision de nom à éviter** : `/api/settlements` **existe déjà** et désigne les groupes de transactions qui se compensent (epic 19). Le règlement entre membres du foyer est une autre chose et doit porter un autre nom.
- **AR28 — Trois mécanismes voisins qui ne fusionnent pas.** Mouvement interne (virement entre comptes du même membre), dépense commune (avance pour le foyer), et coupe à 50 % des virements du compte joint (story 21.1, déjà en production). Les confondre produit des doubles comptages. La story 21.1 n'est pas retouchée.
- **AR29 — La saisie manuelle vit hors du jeu réconcilié.** Une dépense en espèces n'a aucune ligne bancaire en face. Elle ne peut pas partager la table des transactions de relevé sans casser l'invariant de réconciliation (NFR28), qui est le seul mécanisme de confiance du produit.
- **AR30 — Écriture concurrente pinée sur l'état lu.** Une modification du solde du foyer porte la version sur laquelle elle se fonde ; si elle a changé, l'écriture est refusée et son auteur informé (NFR30).
- **AR32 — L'agent ne choisit pas librement, il remplit une requête que l'application valide.** Plutôt que de laisser le modèle appeler les endpoints, il produit une demande structurée — période, granularité, cible — que le code valide **avant** de l'exécuter. Une période absurde est rejetée par l'application, pas par la bonne volonté du modèle. ⚠️ **Pourquoi c'est nécessaire** : D20 a établi que les sorties structurées du fournisseur sont **injectées dans le prompt et non contraintes au décodage**. Si le schéma n'est qu'une instruction, le choix de la période l'est aussi. Ce design tient avec un modèle médiocre sur ce point et s'améliore si le modèle est bon.
- **AR33 — Deux usages, deux configurations, un seul SDK.** L'agent ne crée pas de second fournisseur : NFR7 lui impose l'inférence en Europe comme à l'ingestion, et NFR16 continue d'exiger un point d'entrée unique vers le SDK. Mais les deux usages n'attendent pas la même chose du modèle — l'un produit du JSON, l'autre tient une conversation — et leurs paramètres sont donc distincts et lus depuis la configuration (NFR34).
- **AR31 — La porte d'exposition est un jalon, pas une étape.** L'application n'est joignable depuis Internet qu'une fois le cloisonnement vérifié par test et la sauvegarde en place. Exposer avant, c'est accepter de perdre des données qu'aucun PDF ne reconstruit.

**Profils et banques — ajoutées le 2026-09-22 (architecture D37 à D43)**

- **AR34 (D37)** — Le **profil** est le propriétaire. `profile_id` sur `category_groups`, `category_items`, `bank_statements`, `classification_rules`, `settlement_groups` ; **pas** sur `transactions`, possédées via leur relevé. Référentiel en clé de substitution, `(profile_id, code)` unique ; l'API continue d'exposer des codes. Hash du relevé gardé comme clé **globale**. Migration `0010` unique : sauvegarde **vérifiée restaurable** avant, comptages et sommes par relevé avant/après, échec sur écart.
- **AR35 (D38)** — Profil courant en cookie `pf_profile` ; seul `requireProfile(event)` le lit. **Les 23 endpoints** hors `profiles/` l'appellent ; filtrage dans la requête SQL ; ressource d'un autre profil → **404**. Test d'architecture qui échoue si un endpoint ne l'appelle pas. Changer de profil recharge l'application. L'agent propage le profil de la requête appelante.
- **AR36 (D39)** — `seedReferential(tx, profileId)` depuis `DEFAULT_REFERENTIAL`, dans la transaction de création du profil, et au bootstrap pour tout profil sans rubrique.
- **AR37 (D40)** — `BANKS = ['boursorama', 'credit_mutuel']` dans `shared/types/bank.ts` ; `bank_statements.bank` et `profiles.default_bank` ; champ multipart `bank` optionnel sur `POST /api/statements`.
- **AR38 (D41)** — `server/services/bank-formats/` : un `BankFormat` par banque (`recognizes`, `operationsText`, `balancesAndPeriod`, `cardDebits`), aucun n'importe `unpdf`. `recognizes` court **avant** l'appel au fournisseur (`400 bank_mismatch`). Boursorama **déplacé sans changement de comportement**. Un seul prompt, paragraphe propre à la banque.
- **AR39 (D42)** — Crédit Mutuel : découpage en sections sur les titres `€ …` (une section peut courir sur deux pages) ; compte courant seul, 0 ou ≥ 2 candidats → `400 statement_format_unrecognized` ; `ignoredSections` dans la réponse, sans numéros ; soldes `CREDITEUR`/`DEBITEUR` de la section retenue ; **période = lendemain du solde d'ouverture**. Détail carte : total lu par le code, lignes par un appel distinct, remplacement déterministe avant réconciliation ; `bank_statements.card_detail_missing` et état `card_detail_missing` dans `deriveReliability`. Identité en trois couches : construction, correspondance exacte des numéros lus, motif ≥ 10 chiffres.
- **AR40 (D43)** — Fixtures JSON de pages `PositionedItem` sous `tests/fixtures/statements/`, identifiants substitués par des faux de même forme, **Boursorama compris** (ses tests actuels sont sautés faute de PDF versionné).
- **AR41 (D42, points ouverts)** — ⚠️ **Bloquant pour les stories Crédit Mutuel** : trois à cinq relevés supplémentaires, couvrant solde débiteur, remboursement carte, deux cartes, détail prélevé hors période.

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

**Couverture du périmètre initial : 39/39.** 5 FRs sont couverts par le socle sans travail nouveau (FR10, FR11, FR13, FR14, FR36) et 3 sont en phase 2 (FR37-39). Les 31 restants sont portés par les epics 12 à 15.

#### Périmètre foyer — ajouté le 2026-09-12

| FR | Epic | Statut | Note |
|---|---|---|---|
| FR44 | 22 | neuf | Authentification déléguée, aucun mot de passe stocké |
| FR45 | 22 | neuf | Invitation nominative, usage unique, expiration à 7 jours |
| FR46 | 22 | neuf | Espace vierge à la première connexion, rien d'hérité |
| FR47 | 22 | neuf | Liste des membres du foyer |
| FR48 | 22 | neuf | Retrait refusé tant que le solde n'est pas nul |
| FR49 | 22 | neuf | Cloisonnement strict, appliqué côté serveur (AR25, NFR24) |
| FR50 | 24 | neuf | Marquage « commune » depuis l'écran où la ligne est déjà affichée |
| FR51 | 24 | neuf | Parts égales, somme exacte au centime (NFR27) |
| FR52 | 24 | neuf | La dépense reste chez le payeur — référentiel propre à chacun |
| FR53 | 24 | neuf | Retrait du marquage, recalcul immédiat |
| FR54 | 24 | neuf | Saisie d'une dépense en espèces |
| FR55 | 24 | neuf | Hors réconciliation — jeu de données distinct (AR29, NFR28) |
| FR56 | 24 | neuf | Origine d'une saisie manuelle visible partout (NFR2) |
| FR57 | 24 | neuf | Modification et suppression d'une saisie |
| FR58 | 25 | neuf | Solde d'ouverture daté, orienté, relu avant enregistrement (Journey 7) |
| FR59 | 25 | neuf | Qui doit combien à qui |
| FR60 | 25 | neuf | Descente du solde jusqu'aux dépenses sources (NFR2) |
| FR61 | 25 | neuf | Enregistrement d'un règlement |
| FR62 | 25 | neuf | Rattachement du règlement à sa ligne bancaire (NFR29), **réutilise les groupes de l'epic 19** |
| FR63 | 25 | neuf | Le compte joint éteint la créance — le décompte ne porte que ce qu'il ne solde pas |
| FR64 | 24 | neuf | Visibilité partagée d'une dépense commune, seule exception à FR49 |
| FR31 | — | acquis | Réécrite le 2026-09-12 pour rattraper le comportement livré le 2026-09-07. **Aucun travail.** |

#### Périmètre agent conversationnel — premier chantier

| FR | Epic | Statut | Note |
|---|---|---|---|
| FR65 | 26 | neuf | Ouvrir une conversation, poser une question en langage ordinaire |
| FR66 | 26 | neuf | Réponse en français depuis les agrégats, aucun montant non reçu (NFR31) |
| FR67 | 26 | neuf | Question de suite sans redonner le contexte |
| FR68 | 26 | neuf | Période et filtre affichés, écran d'analyse ouvrable depuis la réponse (NFR33) |
| FR69 | 26 | neuf | Refus explicite hors de portée du moteur |
| FR70 | 26 | neuf | Retrouver et reprendre une conversation |
| FR71 | 26 | neuf | Supprimer une conversation |
| FR72 | 26 + 27 | **par construction** | L'agent ne touche pas la base (NFR32) ; le cloisonnement est posé en 27.2 (22.2 jusqu'au 2026-09-22). Aucune story dédiée |
| FR37 | 26 | absorbée | La synthèse narrative devient une question parmi d'autres |

**Couverture du périmètre agent : 8/8.**

**Couverture du périmètre foyer : 21/21.** Aucune FR orpheline. L'epic 23 ne porte aucune FR : il livre NFR5, NFR12 et NFR26, et constitue la porte d'exposition.

**Couverture totale : 72/72.** *(au 2026-09-12)*

#### Profils et banques — chantier de rang 1 (ajouté le 2026-09-22)

| FR | Epic | Statut | Note |
|---|---|---|---|
| FR73 | 27 | neuf | Création d'un profil, référentiel initial semé dans la même transaction (AR36) |
| FR74 | 27 | neuf | Choix du profil courant, nom affiché partout |
| FR75 | 27 | neuf | Migration unique vers `marceau`, préservante (AR34) — **reprend 22.2** |
| FR76 | 27 | neuf | `requireProfile` sur 23 endpoints, test d'architecture (AR35) — **reprend 22.2** |
| FR77 | 28 | neuf | Banque préremplie, modifiable, portée par le relevé (AR37) |
| FR78 | 28 | neuf | Refus sous la mauvaise banque, avant tout appel au fournisseur (AR38) |
| FR79 | 28 | neuf | Crédit Mutuel : compte courant seul, sections ignorées nommées (AR39) |
| FR80 | 28 | neuf | Détail carte daté du jour d'achat ; agrégat sans détail → non fiable (AR39) |
| FR81 | 27 + 28 | neuf | Chevauchement de période par profil (27.2) ; toutes banques (28.1, 28.2) |
| FR46, FR49, FR72 | 22, 26 | amendées | FR49 est **tenue dès 27.2** entre profils ; FR72 par construction via 27.2 |

**Couverture du chantier : 9/9. Couverture totale : 81/81.**

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

### Epics 22 à 25 — le périmètre foyer

*Ajoutés le 2026-09-12. La numérotation reprend à **22** : les epics 12 à 21 sont consommés, epic 21 compris (coupe du compte joint, story 21.1 en review). Réemployer un numéro ferait cohabiter deux stories sans rapport dans le même dossier d'implémentation, et Vigie confondrait un travail livré avec un travail à faire.*

### Epic 22 : Le foyer et son second membre

Deux personnes ont chacune leur compte, leur espace et leurs données. Chacune dépose ses propres relevés, construit son propre référentiel, et **ne voit rien de ce qui appartient à l'autre**. L'application n'est pas encore joignable depuis l'extérieur.

**FRs couverts :** FR44, FR45, FR46, FR47, FR48, FR49
**Exigences additionnelles :** AR24, AR25, AR26 · NFR9, NFR24, NFR25

**Cet epic porte la migration, et elle ne se fait qu'une fois.** Chaque table métier prend un propriétaire, et l'historique existant est attribué au fondateur. ⚠️ **AR5 ne s'applique plus** : le vidage suivi d'une ré-ingestion depuis `_data/raw/` était sûr tant que NFR12 garantissait la reconstruction ; la NFR12 inversée ferme cette voie. La migration **préserve** les données.

**Le cloisonnement se teste ici, pas ailleurs.** Il exige deux membres réels, donc il ne peut pas être vérifié avant cet epic — et il doit l'être avant le suivant, qui ouvre l'application sur Internet.

### Epic 23 : Joignable depuis l'extérieur, et sauvegardée

Les deux membres atteignent l'application depuis **n'importe quelle connexion**, sur un canal chiffré, et aucune page ne répond sans authentification. La base est copiée chaque jour sur une autre machine du réseau, et la copie est vérifiée restaurable.

**FRs couverts :** aucun — cet epic porte des exigences non fonctionnelles.
**Exigences additionnelles :** AR31 · NFR5, NFR12, NFR26

**Un epic apparemment technique, mais dont la valeur est réelle et formulable** : sans lui, le second membre ne peut pas se connecter de là où il est. Grouper la sauvegarde avec l'exposition évite qu'elle devienne une story orpheline indéfiniment repoussée — ce que la porte du PRD interdit précisément.

**C'est la porte d'exposition.** Elle ne s'ouvre qu'une fois le cloisonnement de l'epic 22 vérifié par test. Le serveur est chez l'utilisateur, l'application ne l'est pas : le port est ouvert sur Internet et sera trouvé par des balayages automatiques en quelques heures. D'où l'exigence qu'**aucune** page ne réponde sans identification, pas seulement les pages portant des données.

### Epic 24 : Les dépenses communes

Une dépense du foyer se marque d'un geste, depuis l'écran où elle est déjà affichée, et se partage en deux parts exactes. Les dépenses réglées en espèces entrent enfin quelque part, **sans casser la réconciliation**.

**FRs couverts :** FR50, FR51, FR52, FR53, FR54, FR55, FR56, FR57, FR64
**Exigences additionnelles :** AR28, AR29 · NFR2, NFR24, NFR27, NFR28

**Trois mécanismes voisins coexistent désormais et ne fusionnent pas** (AR28) : le mouvement interne, la dépense commune, et la coupe à 50 % des virements du compte joint livrée en 21.1. Les confondre produirait des doubles comptages. **La story 21.1 n'est pas retouchée.**

### Epic 25 : Qui doit combien à qui

Le décompte du foyer existe, se reprend depuis l'outil tenu jusqu'ici, se lit jusqu'aux dépenses qui le composent, et **se solde** sans que le virement de remboursement soit compté deux fois.

**FRs couverts :** FR58, FR59, FR60, FR61, FR62, FR63
**Exigences additionnelles :** AR27, AR30 · NFR2, NFR29, NFR30

**La dernière story ne se reporte pas.** Sans le rattachement du règlement à sa ligne bancaire, chaque remboursement gonfle les recettes de celui qui l'encaisse et le solde ne retombe jamais à zéro. Un décompte qui ne se solde pas ne remplace pas l'outil tiers, il s'y ajoute.

⚠️ **Collision de nom à éviter** (AR27) : `/api/settlements` existe déjà et désigne les groupes de transactions qui se compensent, livrés à l'epic 19. Le règlement entre membres est une autre notion et doit porter un autre nom.

### Epic 26 : L'agent conversationnel

*Ajouté le 2026-09-12. ⚠️ **Numéroté après le foyer, construit avant lui.** C'est le **premier chantier** de la séquence : agent, puis foyer, puis forecast. Les numéros d'epic disent l'ordre d'écriture, pas l'ordre de livraison.*

L'utilisateur pose une question en français — « comment ont évolué mes restaurants entre 2025 et 2026 » — et obtient une réponse, avec le moyen de la vérifier. L'agent interroge le moteur et **rapporte** ; il ne calcule rien et n'agit sur rien.

**FRs couverts :** FR65, FR66, FR67, FR68, FR69, FR70, FR71 · FR37 absorbée
**Exigences additionnelles :** AR32, AR33 · NFR2, NFR6, NFR15, NFR16, NFR17, NFR31, NFR32, NFR33, NFR34

**FR72 est satisfaite par construction, sans story dédiée.** L'agent n'accède pas à la base (NFR32) et passe par les endpoints d'analyse, où le cloisonnement sera posé par la story 22.2. Le jour où le foyer arrive, l'agent devient conforme **sans être retouché**. C'est le retour sur investissement de NFR32, et la raison pour laquelle cette frontière n'est pas négociable : la franchir pour aller plus vite coûterait une réouverture complète.

### Dépendances entre epics 22 à 25

```
22 (foyer + cloisonnement)  →  23 (PORTE D'EXPOSITION + sauvegarde)  →  24 (dépenses communes)  →  25 (décompte et règlement)
```

Chaîne linéaire, imposée par le séquencement de la Phase 1 bis du PRD. Chaque epic est livrable seul : après 22 deux personnes ont chacune leur espace en local ; après 23 elles y accèdent de partout et la base survit ; après 24 les dépenses communes sont marquées et les espèces saisies ; après 25 le décompte se solde.

### Ordre de livraison, tous chantiers confondus

```
26 (agent)  →  22 → 23 → 24 → 25 (foyer)  →  forecast (non cadré)
```

Le foyer conserve les numéros 22 à 25, attribués avant que l'ordre ne change. Renuméroter ferait diverger `epics.md` du PRD et des artefacts d'implémentation pour un gain cosmétique.

**Pourquoi 24 et 25 restent séparés malgré des fichiers communs.** Le gabarit recommande de fusionner des epics qui retouchent les mêmes fichiers, et c'est bien le cas ici : les deux modifient la transformation appliquée avant agrégation. Ils sont malgré tout maintenus distincts parce que livrer 24 seul répond à une question qu'aucune analyse sur le papier ne tranche — **marquer les dépenses communes est-il un geste réellement fait ?** Si la réponse est non, l'epic 25 change de forme. C'est une frontière de risque, pas une frontière décorative.


### Epics 27 et 28 — profils et banques

*Ajoutés le 2026-09-22. **Numérotés en dernier, livrés en premier** : c'est le chantier de rang 1 du PRD amendé.*

### Epic 27 : Deux profils, chacun ses données

Marceau retrouve tout son historique sous le profil `marceau`, crée un second profil, bascule de l'un à l'autre, et aucun ne voit les données de l'autre — **côté serveur**, pas par filtrage d'écran.

**FRs couverts :** FR73, FR74, FR75, FR76, FR81 (chevauchement par profil)
**Exigences additionnelles :** AR34, AR35, AR36, AR37 (colonnes) · NFR24, NFR35

**Cet epic reprend la story 22.2.** La propriété des données et le cloisonnement serveur y étaient liés à l'authentification ; le PRD les en détache. 22.2 est marquée absorbée, pas supprimée : Vigie garde sa trace.

**Ce que l'epic ne protège pas.** Choisir un profil n'est pas s'identifier. NFR35 interdit toute exposition hors du réseau local tant que 22.1 n'est pas livrée.

### Epic 28 : Les relevés Crédit Mutuel

Le second profil dépose ses relevés Crédit Mutuel : seul le compte courant est lu, les achats par carte sont détaillés et contrôlés au centime, et aucun identifiant bancaire ne part vers le fournisseur.

**FRs couverts :** FR77, FR78, FR79, FR80, FR81 (toutes banques)
**Exigences additionnelles :** AR37, AR38, AR39, AR40, AR41 · NFR6, NFR36

⚠️ **Bloqué en partie** : 28.2 et 28.3 attendent trois à cinq relevés Crédit Mutuel supplémentaires (AR41). 28.1 ne l'est pas.

**Pourquoi deux epics.** La frontière est de risque : l'epic 27 ne dépend d'aucun PDF et démarre tout de suite, l'epic 28 dépend de relevés à fournir. Fusionnés, le cloisonnement attendrait des PDF sans raison. Les fichiers se recouvrent peu (`schema.ts` et les endpoints pour 27, l'extracteur et l'orchestrateur pour 28).

### Dépendances des epics 27 et 28

```
27.1 (migration, colonne bank)  →  27.2  →  27.3  →  28.1  →  28.2  →  28.3
```

*Corrigé le 2026-09-22 à la rédaction des stories.* 28.1 préremplit la banque depuis le profil
courant : elle a besoin de `requireProfile` (27.2) et de `useProfiles` (27.3), pas seulement de la
colonne posée en 27.1. La chaîne est donc linéaire. Le gain de parallélisme était illusoire.

### Ordre de livraison — révisé le 2026-09-22

```
27 → 28 (profils et banques)  →  26 (agent)  →  22 → 23 → 24 → 25 (foyer)  →  forecast (non cadré)
```

*L'ordre précédent (26 → 22-25 → forecast) est remplacé. L'epic 22 perd sa story 22.2 ; 22.1 rattachera une identité à un profil existant au lieu de créer l'espace.*
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

---

## Epic 17 — Correctifs de l'audit du 2026-09-06

Audit complet de l'application mené le 2026-09-06 sur quatre axes (services back, front, tests
et outillage, conformité au PRD), sur la base des **1 855 transactions et 20 relevés réels** en
base. Le socle est sain — 510 tests verts, lint et typecheck propres, moteur pur, sommes
algébriques, ratios à `null`, aucune clé en dur. Cet epic corrige ce que l'audit a trouvé.

**Nature de l'epic.** Aucune fonctionnalité nouvelle : ce sont des défauts, une non-conformité
de sécurité et de la dette. Les *idées* nées de l'audit vivent dans l'epic 18.

**FRs concernés :** aucun nouveau · **NFR :** NFR2, NFR3, NFR6, NFR12, NFR14, NFR23

**Ordre = gravité décroissante.** 17.1 à 17.3 touchent respectivement la confidentialité, la
justesse des soldes et la justesse des indicateurs : ils passent avant tout le reste.

### Story 17.1: Ne transmettre au fournisseur que le tableau d'opérations

> **Non-conformité NFR6 constatée.** L'orchestrateur envoie `raw.rawText`, c'est-à-dire le
> texte **intégral** du relevé, en-tête compris. Vérifié sur un relevé réel : le bloc d'en-tête
> porte un IBAN `FR76…` et l'adresse postale du titulaire. Le PRD (NFR6), l'architecture et
> `CLAUDE.md` §Sécurité affirment tous trois le contraire. La documentation décrit une garantie
> que le code n'applique pas.

En tant qu'utilisateur,
je veux que seules les lignes d'opérations quittent ma machine,
afin que mon IBAN et mon adresse ne soient jamais transmis à un tiers.

**Acceptance Criteria:**

**Given** un relevé dont la page porte les en-têtes de colonnes Débit et Crédit
**When** son texte est préparé pour le fournisseur
**Then** tout ce qui se trouve au-dessus de la ligne d'en-tête est retiré, identité comprise

**Given** un relevé dont la structure de colonnes n'est pas reconnue (repli texte plat)
**When** son texte est préparé
**Then** le texte est coupé au début du tableau d'opérations quand ce début est repérable

**Given** un texte préparé, quel que soit le chemin emprunté
**When** il est inspecté
**Then** aucun motif d'IBAN ni de BIC n'y subsiste, remplacés par un marqueur neutre

**Given** la fixture de relevé réel du dépôt
**When** le test de non-régression s'exécute
**Then** il échoue si un IBAN reparaît dans ce qui part au fournisseur

**Note de portée.** Le nom du titulaire figure **dans les libellés bancaires eux-mêmes**
(`VIR SEPA DUPONT Jean charges`). Il est indissociable de la donnée métier et reste
transmis : la story traite le bloc d'identité, pas les libellés. À tracer au PRD.

### Story 17.2: Lecture des soldes robuste aux séparateurs de milliers

> **Défaut latent, à fort rayon.** Les deux expressions régulières de solde capturent en mode
> paresseux jusqu'à la première espace. Testé : `SOLDE AU : 31/12/2024 2 817,46` capture `"2"`,
> soit **2,00 €** au lieu de 2 817,46 €. Cela ne se voit pas aujourd'hui parce qu'`unpdf`
> aplatit `2 817,46` en `2817,46`. Un changement de version ou de gabarit ferait basculer tous
> les relevés à quatre chiffres en « écart non examiné », avec des écarts de plusieurs milliers
> d'euros et sans la moindre erreur levée.

En tant qu'utilisateur,
je veux que les soldes soient lus correctement quel que soit le séparateur de milliers,
afin qu'une mise à jour de bibliothèque ne fausse pas silencieusement ma réconciliation.

**Acceptance Criteria:**

**Given** un solde écrit `2 817,46` avec une espace, une espace insécable ou une espace fine
**When** il est lu depuis le texte du relevé
**Then** la valeur retenue est 364 913 centimes dans les trois cas

**Given** le récapitulatif Boursobank à trois montants sur une même ligne
**When** ces montants portent des séparateurs de milliers
**Then** c'est bien le deuxième qui est retenu comme solde de clôture

**Given** les vingt relevés déjà ingérés
**When** leurs soldes sont relus
**Then** les valeurs sont identiques à celles en base — aucune régression

### Story 17.3: Un écart accepté ne fausse ni le résultat ni le taux de correction

> **Défaut de justesse.** L'acceptation d'un écart insère une transaction sur
> `divers-non-categorise`, de nature `expense` et marquée `is_manual`. Deux conséquences :
> un écart **positif** vient *diminuer* les dépenses de la période, et la ligne compte dans le
> numérateur du taux de correction — l'indicateur du jalon 14.4. De plus la nature du poste de
> repli est modifiable par l'utilisateur : un écart accepté peut donc basculer en recette.

En tant qu'utilisateur,
je veux qu'un écart que j'assume reste une différence inexpliquée,
afin qu'il n'apparaisse ni comme une dépense, ni comme une recette, ni comme une correction.

**Acceptance Criteria:**

**Given** un relevé dont j'accepte l'écart
**When** la ligne d'écart est créée
**Then** elle porte un poste dédié de nature `internal_transfer`, protégé et non supprimable

**Given** une période contenant un écart accepté
**When** ses indicateurs sont calculés
**Then** l'écart est absent du résultat et présent dans le solde bancaire (NFR4)

**Given** un relevé portant un écart accepté
**When** son taux de correction manuelle est calculé
**Then** la ligne d'écart ne compte ni au numérateur ni au dénominateur

**Given** la base existante, qui porte déjà des écarts acceptés
**When** la migration s'applique
**Then** les lignes concernées sont déplacées vers le nouveau poste

### Story 17.4: Dates de transaction bornées à la période du relevé

> Rien ne contraint les dates renvoyées par le modèle. Une ligne du relevé de mars 2026 datée
> `2025-03-05` par le modèle serait insérée telle quelle : la réconciliation du relevé resterait
> juste, mais la ligne polluerait l'analyse de mars 2025, et la fiabilité — calculée par période
> de relevé — ne signalerait rien. Zéro occurrence sur les 1 855 lignes actuelles : le défaut
> est latent, la garde est bon marché.

En tant qu'utilisateur,
je veux qu'une ligne ne puisse pas atterrir dans un mois auquel elle n'appartient pas,
afin qu'une hallucination de date ne contamine pas une période déjà validée.

**Acceptance Criteria:**

**Given** une transaction extraite dont la date sort de la période résolue du relevé
**When** l'ingestion se poursuit
**Then** elle est refusée avec un code métier et le détail des lignes fautives

**Given** une période déduite par repli des dates du modèle
**When** la garde s'applique
**Then** elle ne rejette rien, la période étant par construction l'enveloppe des dates

### Story 17.5: Relance sur défaillance transitoire, soldes vérifiés avant l'appel

> Deux défauts d'ordonnancement et de robustesse. (1) La relance couvre uniquement la
> non-conformité de schéma : un JSON tronqué, un timeout, un 5xx ou un 429 remontent en erreur
> dès la première tentative, alors qu'AR17 annonce une relance. (2) Les soldes obligatoires sont
> vérifiés **après** l'appel au fournisseur : un relevé sans solde lisible fait payer un appel
> voué au rejet. (3) Un 401/403 est classé « fournisseur indisponible », message trompeur pour
> une clé invalide.

En tant qu'utilisateur,
je veux qu'un incident réseau passager ne perde pas mon ingestion,
afin de ne pas rejouer un dépôt de vingt-quatre fichiers pour un timeout.

**Acceptance Criteria:**

**Given** un appel qui échoue sur timeout, 5xx ou 429
**When** l'ingestion se poursuit
**Then** un second appel est tenté après une courte attente, puis l'erreur remonte

**Given** une clé d'API invalide (401 ou 403)
**When** l'appel échoue
**Then** aucune relance n'est tentée et le message distingue la configuration de la panne

**Given** un relevé dont les soldes ne sont pas lisibles
**When** il est ingéré
**Then** l'échec survient avant tout appel au fournisseur

### Story 17.6: Descente par poste — rechargement et anti-course

> **Le défaut le plus visible du produit.** Un poste laissé ouvert dans la répartition conserve
> son état d'ouverture au changement de période, mais ses lignes sont vidées et jamais
> rechargées : le poste affiche « 0 ligne, total 0,00 € » sous un montant non nul. Le même
> symptôme survient après un reclassement, le poste d'arrivée n'étant pas invalidé. S'y ajoute
> une course : aucun jeton n'annule un chargement en vol, si bien que les lignes de mars peuvent
> s'afficher sous les totaux d'avril. C'est NFR2 qui est en jeu — un montant doit mener à ses
> lignes, pas à zéro ligne.

En tant qu'utilisateur,
je veux qu'un poste ouvert montre toujours les lignes de la période affichée,
afin de pouvoir croire ce que je lis.

**Acceptance Criteria:**

**Given** un poste déplié
**When** la période change
**Then** ses lignes sont rechargées pour la nouvelle période, sans geste supplémentaire

**Given** une transaction reclassée depuis un poste vers un autre
**When** les deux postes sont ouverts
**Then** les deux listes reflètent le déplacement

**Given** un chargement de lignes encore en vol
**When** la période change avant sa réponse
**Then** la réponse tardive est ignorée

### Story 17.7: Erreurs de chargement visibles et invalidation ciblée

> Trois écrans confondent « échec » et « vide » : sur une erreur serveur, la page transactions
> affiche « Aucune transaction pour ce mois », la page import « Aucun relevé ingéré », et les
> compteurs de santé tombent à zéro. Par ailleurs chaque mutation enchaîne un rafraîchissement
> ciblé **puis** un rafraîchissement global — et l'ingestion en déclenche un par fichier, soit
> vingt-quatre rechargements complets sur un dépôt d'historique.

En tant qu'utilisateur,
je veux distinguer une absence de donnée d'une panne,
afin de ne pas conclure que mon historique a disparu.

**Acceptance Criteria:**

**Given** un chargement en erreur sur les écrans transactions, import ou barre d'application
**When** la réponse arrive
**Then** un message d'erreur est affiché, distinct de l'état vide

**Given** une mutation réussie
**When** les données sont réactualisées
**Then** seules les clés concernées sont rafraîchies, une seule fois

**Given** un dépôt de plusieurs fichiers
**When** la file progresse
**Then** le rafraîchissement global est déclenché une fois à la fin, pas à chaque fichier

### Story 17.8: Index de poste et échappement des motifs de recherche

> `transactions.category_item_code` n'est pas indexé alors qu'il porte le filtre par poste, la
> vérification de clé étrangère avant suppression et le dépliage. Par ailleurs les trois usages
> de `LIKE` interpolent le motif sans échapper `%` et `_` : un motif contenant `_` compte des
> correspondances qui n'en sont pas (`a_b` attrape `aXb`). Paramétré, donc sans injection, mais
> le compteur de portée d'une règle ment.

**Acceptance Criteria:**

**Given** un filtre ou une suppression portant sur un poste
**When** la requête s'exécute
**Then** elle s'appuie sur un index dédié

**Given** une règle dont le motif contient `%` ou `_`
**When** sa portée est comptée ou prévisualisée
**Then** ces caractères sont traités comme littéraux

### Story 17.9: Suppression du périmètre forecast résiduel

> `CLAUDE.md` affirme que l'ancien périmètre a été « entièrement supprimé du code ». C'est faux.
> Restent sans aucun appelant : le service de suggestion de charges et sa table, les utilitaires
> de période, un schéma de relevé périmé, quatre composables et utilitaires front, et deux
> dépendances déclarées jamais importées. Le service résiduel porte au passage les deux derniers
> `Math.abs` sur montants du dépôt.

**Acceptance Criteria:**

**Given** le dépôt après nettoyage
**When** on cherche un import du périmètre forecast
**Then** il n'en reste aucun, et la table orpheline est retirée par migration

**Given** la suite de tests
**When** elle s'exécute après suppression
**Then** elle reste verte, les tests du code retiré ayant disparu avec lui

### Story 17.10: Sauvegarde et restauration des corrections

> **NFR12 est faux dès la première correction.** Les PDF sont conservés, mais une ré-ingestion
> ne restitue ni les reclassements manuels, ni les écarts acceptés : ils ne vivent qu'en base,
> et rien ne les sauvegarde. La donnée la plus chère du projet — le travail de rangement de
> l'utilisateur — n'a aucune copie.

En tant qu'utilisateur,
je veux pouvoir sauvegarder et restaurer mon travail de classement,
afin qu'une base perdue ne me coûte pas des heures de reclassement.

**Acceptance Criteria:**

**Given** une base peuplée
**When** la commande de sauvegarde est lancée
**Then** une copie cohérente de la base est écrite, horodatée, hors du dossier suivi par git

**Given** une sauvegarde des corrections
**When** elle est produite
**Then** elle contient les règles, les reclassements manuels et les écarts acceptés, dans un
format lisible et indépendant des identifiants techniques

### Story 17.11: Intégration continue et seuil de couverture

> Aucune CI. Les seuils de couverture sont déclarés à **0 %** et aucun script ne les mesure :
> le gap G4 n'est pas « manuel », il est absent. Deux trous de couverture NFR3 subsistent par
> ailleurs sur le suggérateur (base vide) et sur les fonctions de fiabilité.

**Acceptance Criteria:**

**Given** une poussée sur une branche
**When** la CI s'exécute
**Then** elle installe, lint, typecheck et joue les tests unitaires

**Given** la mesure de couverture
**When** elle s'exécute sur le moteur et les types partagés
**Then** un seuil non nul est appliqué et documenté

---

## Epic 18 — Améliorations issues de l'audit

Propositions nées de l'audit du 2026-09-06, **aucune n'est implémentée**. Elles sont consignées
ici pour être arbitrées, pas exécutées : le périmètre du PRD reste verrouillé et plusieurs
d'entre elles demandent un amendement explicite avant d'entrer en sprint.

**Constat qui les ordonne.** Sur les 1 855 lignes en base, **311 tombent au poste de repli**,
pour environ 13 900 € — devant les courses alimentaires. Tant que ce bloc existe, « où part
l'argent » ne peut pas répondre. Les stories 18.1 et 18.2 attaquent ce bloc ; le reste vient
après.

### Story 18.1: Filtres de requalification sur la vue mensuelle

> **Arbitré le 2026-09-06.** La proposition initiale était un écran de revue dédié couvrant tout
> l'historique. L'utilisateur a tranché pour des filtres sur la vue mensuelle existante : un
> écran de moins, et la requalification se fait mois par mois. Le passage à l'échelle sur les
> vingt mois est assuré par la story 18.2 — on requalifie une ligne, on écrit la règle, on
> l'applique à l'historique.

En tant qu'utilisateur,
je veux filtrer les lignes d'un mois par poste, par nature et par libellé, et voir le
sous-total de ce que je filtre,
afin d'isoler les lignes non catégorisées et de les ranger sans les chercher à l'œil.

**Acceptance Criteria:**

**Given** la vue mensuelle
**When** l'utilisateur choisit un poste
**Then** seules les lignes de ce poste restent affichées

**Given** un filtre actif, quel qu'il soit
**When** les lignes sont affichées
**Then** leur nombre et leur somme algébrique sont annoncés

**Given** un filtre par nature
**When** il est combiné au filtre par poste et à la recherche de libellé
**Then** les trois se cumulent

**Given** un filtre qui ne laisse aucune ligne
**When** la liste est rendue
**Then** l'état vide dit que le filtre est en cause, et non que le mois est vide

**Given** une ligne reclassée alors qu'un filtre par poste est actif
**When** elle quitte le poste filtré
**Then** elle disparaît de la liste, et les compteurs suivent

### Story 18.2: Ré-application d'une règle à l'historique

> **Arbitré le 2026-09-06 :** les lignes reclassées par une règle **ne comptent PAS** comme
> corrections manuelles. Le taux de correction mesure la corvée résiduelle — les lignes reprises
> une à une. Une règle est précisément l'échappatoire à cette corvée : compter ses lignes ferait
> exploser l'indicateur du jalon 14.4 sans qu'aucune corvée n'ait eu lieu.

En tant qu'utilisateur,
je veux appliquer une règle que je viens d'écrire aux lignes déjà en base,
afin qu'une connaissance que je viens de formaliser ne serve pas qu'aux relevés futurs.

**Acceptance Criteria:**

**Given** une règle existante
**When** l'utilisateur demande son application à l'historique
**Then** les lignes que son motif couvre sont reclassées, et leur nombre est annoncé

**Given** une ligne déjà corrigée à la main
**When** une règle la couvre
**Then** elle n'est PAS touchée — une règle ne défait pas un choix explicite de l'utilisateur

**Given** une ligne couverte par plusieurs règles
**When** l'application a lieu
**Then** c'est le même départage qu'à l'ingestion qui tranche — le motif le plus long gagne

**Given** des lignes reclassées par une règle
**When** le taux de correction manuelle est recalculé
**Then** il est inchangé : ces lignes ne sont pas des corrections manuelles

**Given** l'application d'une règle
**When** elle est demandée
**Then** l'utilisateur en connaît la portée avant de confirmer, et les vues d'analyse sont
rafraîchies après

**Note d'implémentation.** L'application réutilise `applyRules` du moteur, sur le jeu COMPLET
des règles restreint aux lignes que le motif couvre. Appliquer la règle seule contredirait le
départage de l'ingestion et rendrait le classement dépendant de l'ordre des clics.

### Story 18.3: Rubriques classées par variation

En tant qu'utilisateur,
je veux voir en tête les rubriques qui ont le plus bougé depuis la période précédente,
afin de répondre à « pourquoi ce mois est dans le rouge » sans lire toute la liste.

**Valeur :** haute · **Effort :** S · **Origine :** FR34, **partiellement livré** — l'écart est
affiché mais le tri reste sur le montant.

### Story 18.4: Relevé source et fiabilité partout

En tant qu'utilisateur,
je veux atteindre le relevé d'origine depuis n'importe quelle ligne, et voir la fiabilité sur
la vue d'évolution,
afin que la traçabilité ne s'arrête pas à la vue de répartition.

**Valeur :** moyenne, ferme deux trous · **Effort :** S · **Origine :** FR36 et FR12,
**partiellement livrés** — le hash du relevé transite déjà dans les charges utiles mais n'est
rendu nulle part.

### Story 18.5: Comparaison à la moyenne des douze tranches

En tant qu'utilisateur,
je veux comparer une rubrique à sa moyenne sur douze tranches, pas seulement à la tranche
précédente,
afin de distinguer une vraie dérive d'un mois atypique.

**Valeur :** haute · **Effort :** M · **Origine :** nouveau, voisin de FR39 · **Dépend de :** le
moteur reçoit déjà deux jeux de lignes, il faut lui en passer douze.

### Story 18.6: Recherche plein texte sur l'historique

En tant qu'utilisateur,
je veux chercher un libellé sur tout l'historique et en voir le total,
afin de répondre à « combien chez ce marchand en deux ans » sans passer par les catégories.

**Valeur :** moyenne, sert aussi l'écriture de règles · **Effort :** S/M · **Origine :** nouveau
· **Note :** le filtre existant est client et ne couvre qu'un mois.

### Story 18.7: Export CSV d'une période

En tant qu'utilisateur,
je veux exporter les lignes d'une période avec rubrique, poste et nature,
afin de contrôler les chiffres hors de l'application.

**Valeur :** moyenne · **Effort :** S · **Origine :** **hors périmètre explicite** du PRD
(§ Notes de traçabilité, « export de données »). Amendement requis.

### Story 18.8: Objectifs de dépense par rubrique

En tant qu'utilisateur,
je veux fixer un plafond mensuel par rubrique et voir où j'en suis,
afin de passer du constat à la décision.

**Valeur :** haute mais structurante · **Effort :** M · **Origine :** **Vision phase 3**, hors
périmètre V1 · **Contrainte :** table dédiée, calcul hors du moteur (NFR22).

### Écarté volontairement

- **Projection de fin de mois** et **alertes de dérive** : trop proches du forecast invalidé le
  2026-09-04, et hors périmètre explicite. Le besoin réel est couvert par 18.3.
- **Split d'une transaction** : casse l'invariant « une ligne de relevé = une transaction » et
  oblige à rouvrir réconciliation et traçabilité. À ne pas envisager avant 18.1 à 18.4.
- **Import d'autres banques** : Vision phase 3, dépend d'une extraction paramétrée par banque
  qui n'est pas décidée.
- **Taux de confiance du modèle** : le fournisseur ne l'expose pas. Le signal exploitable est le
  taux de repli, déjà mesuré.

### Story 18.9: État d'application d'une règle

> **Né de l'usage réel, 2026-09-06.** La 18.2 livrée, l'utilisateur constate : « on appuie sur
> Appliquer, on a la pop-up, mais après le tableau ne nous dit pas si une règle est en
> application ou pas ». Il proposait un interrupteur ; l'arbitrage a retenu un **état dérivé**,
> parce qu'un interrupteur promet de défaire ce qu'on ne sait pas défaire : le poste d'origine
> d'une ligne n'est conservé nulle part, une fois la règle appliquée.

En tant qu'utilisateur,
je veux voir, pour chaque règle, si l'historique est déjà rangé conformément à elle,
afin de savoir laquelle appliquer sans les essayer une par une.

**Acceptance Criteria:**

**Given** une règle dont toutes les lignes couvertes sont déjà au bon poste
**When** la liste des règles est affichée
**Then** elle est annoncée « à jour », et son bouton d'application est indisponible

**Given** une règle dont des lignes couvertes iraient ailleurs
**When** la liste est affichée
**Then** le nombre de lignes restant à ranger est annoncé, et l'application est disponible

**Given** une règle qui ne couvre aucune ligne
**When** la liste est affichée
**Then** elle est distinguée des deux cas précédents — il n'y a rien à ranger, et rien n'est en retard

**Given** une règle qu'on vient d'appliquer
**When** la liste est rafraîchie
**Then** son état bascule à « à jour » sans intervention

**Given** une ligne couverte mais corrigée à la main
**When** l'état est calculé
**Then** elle ne compte pas comme « à ranger » — l'application ne la toucherait pas

**Note d'implémentation.** L'état est CALCULÉ à chaque lecture, jamais stocké : un drapeau en
base divergerait de la réalité dès la première ingestion. Le calcul rejoue le départage du
moteur une seule fois pour toutes les lignes, puis compte par règle.

### Story 18.10: Écran dédié aux lignes non catégorisées

> **Arbitrage du 2026-09-06 INVERSÉ le même jour, à l'usage.** La story 18.1 avait retenu des
> filtres sur la vue mensuelle plutôt qu'un écran dédié. À l'essai : « c'est assez pénible de
> refaire le filtre quand on repasse sur la page ». Les filtres restent — ils servent à autre
> chose — mais la revue du repli obtient l'écran que le cadrage initial proposait.

En tant qu'utilisateur,
je veux un écran qui rassemble mes lignes non catégorisées sur tout l'historique, groupées par
libellé,
afin de vider le poste de repli sans refaire vingt fois le même filtre.

**Acceptance Criteria:**

**Given** un historique portant des lignes au poste de repli
**When** l'écran est ouvert
**Then** elles sont toutes présentes, toutes périodes confondues, groupées par libellé normalisé

**Given** un groupe de lignes partageant le même libellé
**When** il est affiché
**Then** son nombre de lignes et son total sont annoncés, et les groupes les plus lourds viennent
en premier

**Given** un groupe rangé dans un poste
**When** le classement est confirmé
**Then** toutes ses lignes changent de poste d'un seul geste, et le groupe quitte l'écran

**Given** un groupe que l'on vient de ranger
**When** son libellé se prête à une règle
**Then** l'écran propose de la créer, et de l'appliquer à l'historique

**Given** un poste de repli vide
**When** l'écran est ouvert
**Then** il le dit, et n'affiche pas une liste vide sans explication

**Given** la liste des règles
**When** elle est affichée
**Then** un lien mène à cet écran

### Story 18.11: Sens des mouvements internes — flux bruts et phrase de lecture

> **Née de l'usage réel, 2026-09-06.** « Dans le bloc mouvement interne il n'y a pas de code
> couleur sur les débits et crédits, du coup je ne comprends pas bien comment je dois lire cette
> analyse. En 2026 comment je dois interpréter la ligne virement épargne ? »
>
> **Le code couleur n'est PAS la réponse.** Sur les dépenses et les recettes, la couleur signale
> la VARIATION contre la période précédente, pas le sens du flux. L'étendre aux mouvements
> internes laisserait croire qu'un virement est favorable ou défavorable, ce qu'il n'est
> précisément pas. Ce qui manque, c'est la DIRECTION.
>
> **Et le net la cache.** Sur 2026, « Virement entre comptes » affiche −651,40 € alors que
> 4 512 € sont sortis et 3 861 € rentrés : le net ne dit rien des flux qui le composent.
> « Virement épargne » affiche +3 784 €, qui sont en réalité 3 902 € tirés du livret contre
> 80 € versés dedans — l'épargne a été puisée, pas alimentée, et l'écran ne le disait pas.

En tant qu'utilisateur,
je veux voir ce qui est sorti et ce qui est rentré sur chaque poste de mouvement interne, et
lire en une phrase ce que le bloc raconte,
afin de comprendre comment j'ai bouclé la période sans reconstituer les flux de tête.

**Acceptance Criteria:**

**Given** un nœud d'analyse, poste ou rubrique
**When** il est agrégé
**Then** il porte la somme de ses montants NÉGATIFS et celle de ses montants POSITIFS, en plus
de son net — les trois restant cohérents entre eux

**Given** un poste sans aucun montant dans un sens
**When** ses flux sont rendus
**Then** le sens vide vaut zéro, et l'affichage le distingue d'un montant

**Given** le bloc des mouvements internes
**When** il est affiché
**Then** chaque ligne montre sorties, entrées et net, et l'orientation de chaque colonne est
annoncée pour un lecteur d'écran

**Given** un bloc de mouvements internes dont le net est positif
**When** il est affiché
**Then** une phrase dit que cet argent est revenu sur le compte courant depuis les autres
comptes ; net négatif, elle dit l'inverse ; net nul, elle ne conclut rien

**Given** les blocs de dépenses et de recettes
**When** ils sont affichés
**Then** ils ne changent pas — les flux bruts n'y ajoutent rien, la nature du poste y disant
déjà le sens attendu

**Note d'implémentation.** Les deux sommes sont calculées par le moteur pour TOUS les nœuds, sans
distinction de nature : une fonction de calcul n'a pas à savoir ce que l'écran affichera (NFR22).
C'est l'UI qui choisit de ne montrer les colonnes que sur les mouvements internes. NFR3
s'applique : cas nominal, poste à sens unique, poste vide.

### Story 18.12: Descente de l'évolution vers l'analyse d'une tranche

> **Demandée le 2026-09-06 :** « rendre cliquable les lignes du tableau période, qui renvoie
> vers la page analyse sur le mois cliqué ».

En tant qu'utilisateur,
je veux ouvrir l'analyse d'une tranche depuis la ligne correspondante du tableau d'évolution,
afin d'aller voir ce qui explique un mois qui sort du lot, sans le resélectionner à la main.

**Acceptance Criteria:**

**Given** une ligne du tableau d'évolution
**When** elle est activée, n'importe où sur sa largeur
**Then** l'analyse s'ouvre sur cette tranche, au pas de la série

**Given** cette même ligne
**When** elle est atteinte au clavier
**Then** elle est focalisable et s'active comme un lien — ouverture dans un onglet comprise

**Given** le tableau de la cible suivie
**When** il est affiché
**Then** ses lignes ne mènent PAS à l'analyse — on y suit une cible, et partir sur l'analyse
générale ferait perdre ce focus (arbitrage du 2026-09-06, à l'usage)

**Note d'implémentation.** UN SEUL lien par ligne, étiré sur la rangée par un `::after`. Un
gestionnaire de clic sur la `<tr>` donnerait la même zone de clic mais pas un lien : ni focus,
ni ouverture dans un onglet, ni annonce par un lecteur d'écran.

### Story 18.13: Le suivi d'une cible devient le cœur de la page d'évolution

> **Née de l'usage réel, 2026-09-06.** « C'est un super outil mais il est complètement caché en
> bas de la page. Quand tu sélectionnes une rubrique ça se déplie en bas sans que tu le voies.
> Les lignes ne doivent pas rediriger sur analyse car on est sur un focus, par contre il me
> faudrait le détail des transactions. » Puis : « quand tu prends une catégorie qui se compose
> de sous-catégories il faudrait le voir sur le graphique, au survol par exemple ».

En tant qu'utilisateur,
je veux suivre une rubrique sans la chercher, ouvrir n'importe quelle tranche jusqu'aux lignes,
et voir de quels postes une tranche est faite,
afin de répondre à « qu'est-ce qui a dérapé, et depuis quand » sans quitter la page.

**Acceptance Criteria:**

**Given** la page d'évolution
**When** elle s'ouvre
**Then** le suivi d'une cible est la première section, avant les courbes générales

**Given** une tranche du tableau de la cible
**When** elle est activée
**Then** ses transactions s'affichent sous elle, sans quitter la page

**Given** une cible qui est une RUBRIQUE
**When** ses lignes sont demandées
**Then** l'endpoint filtre par rubrique, sans que le client agrège lui-même

**Given** une tranche ouverte
**When** la cible, le pas ou la fenêtre changent
**Then** elle se referme — ses lignes ne la décrivent plus

**Given** une cible qui est une rubrique composée de plusieurs postes
**When** un point de la courbe est survolé
**Then** l'infobulle donne la répartition par poste, du plus lourd au plus léger

**Given** une cible qui est déjà un poste
**When** un point est survolé
**Then** aucune répartition n'est proposée — il n'y a rien à répartir

**Note d'implémentation.** La répartition est orientée comme la valeur qu'elle détaille : sur
une cible de dépense, la courbe monte quand on dépense, et ses postes doivent suivre le même
sens. Mélanger les deux rendrait l'infobulle illisible.

### Story 18.14: Voir si le patrimoine monte ou baisse

> **Le manque de fond, formulé le 2026-09-06 :** « Je crois que je sais enfin ce qu'il me manque
> comme info : est-ce que mon patrimoine financier a augmenté ou baissé. Ici il a clairement
> baissé mais il faut que je puisse le voir clairement. Les mouvements de renflouement depuis
> mon épargne sont un signe d'appauvrissement. Je consomme sans recharger. »
>
> **Le chiffre EXISTAIT déjà, mal nommé.** Recettes plus dépenses, mouvements internes exclus,
> c'est très exactement la variation du patrimoine — les virements entre comptes de
> l'utilisateur ne créent ni ne détruisent rien. L'app l'appelait « Trésorerie de la période »,
> vocabulaire comptable dans lequel l'utilisateur ne reconnaissait pas sa question.
>
> **Et le solde bancaire masquait la baisse.** Sur l'historique réel : le compte courant perd
> 2 646 € quand le patrimoine perd 10 412 €. L'écart, 7 766 €, est ce qui a été tiré de
> l'épargne pour tenir le compte à flot.

En tant qu'utilisateur,
je veux voir si mon patrimoine monte ou baisse, et par quoi un déficit a été comblé,
afin de savoir si je consomme mon épargne au lieu de la reconstituer.

**Acceptance Criteria:**

**Given** une période
**When** ses indicateurs sont affichés
**Then** la variation du patrimoine est nommée comme telle, et non en termes comptables

**Given** une période déficitaire comblée par des mouvements internes
**When** l'indicateur est affiché
**Then** il dit de combien le déficit a été comblé depuis les autres comptes

**Given** la courbe de patrimoine
**When** elle est affichée
**Then** elle cumule depuis le DÉBUT de l'historique, pas depuis le début de la fenêtre

**Given** une fenêtre qui ne commence pas à l'origine de l'historique
**When** la courbe est affichée
**Then** le patrimoine acquis avant elle est annoncé, plutôt que laissé croire nul

**Given** la courbe de patrimoine
**When** elle est calculée
**Then** les mouvements internes en sont exclus (NFR4)

**Réserve à porter au PRD.** L'app ne voit que le compte courant. Un mouvement classé
« interne » est SUPPOSÉ neutre pour le patrimoine ; s'il s'agissait d'une dépense mal rangée,
le chiffre serait faux d'autant. Le classement de l'utilisateur décide.

### Story 18.15: Transactions d'une tranche groupées par poste

> **Demandée le 2026-09-06 :** « c'est top d'avoir les transactions sous les mois mais il
> faudrait les classer ou regrouper par sous-catégories ».

En tant qu'utilisateur,
je veux que les lignes d'une tranche soient rassemblées sous leur poste,
afin de voir la composition d'un mois sans trier cinquante lignes de tête.

**Acceptance Criteria:**

**Given** une tranche ouverte sur une cible qui est une rubrique
**When** ses lignes s'affichent
**Then** elles sont groupées par poste, chaque groupe annonçant son nombre de lignes et son total

**Given** ces groupes
**When** ils sont ordonnés
**Then** le plus lourd vient en premier, au poids et non au signe

### Story 18.16: L'évolution regarde une période, pas douze pas

> **Formulé le 2026-09-07 :** « le graphique et le tableau ne se mettent pas bien lorsque je
> veux une vue sur l'année. Je m'attends à avoir un détail par mois sur toute l'année et pas
> toutes les années depuis 2014. » Puis, en comprenant le modèle : « ha oui en fait ça se lit
> jusqu'à ».
>
> Le sélecteur désignait le PAS et la fenêtre valait douze tranches de ce pas : « Année »
> donnait donc douze ANNÉES. Le même mot ne voulait pas dire la même chose que sur l'analyse,
> où il désigne la période regardée.

En tant qu'utilisateur,
je veux que le sélecteur de l'évolution désigne ce que je regarde, comme sur l'analyse,
afin qu'un mot veuille dire la même chose partout.

**Acceptance Criteria:**

**Given** la vue « Année »
**When** elle est choisie
**Then** la série donne les douze mois de cette année

**Given** la vue « Trimestre »
**When** elle est choisie
**Then** la série donne ses trois mois

**Given** la vue « Tout l'historique »
**When** elle est choisie
**Then** la série donne chaque mois du premier au dernier mouvement

**Given** la vue « Tout l'historique »
**When** elle est affichée
**Then** le pas de période est indisponible, avec sa raison dans le nom accessible — elle n'a
pas de voisin

**Given** un changement de vue
**When** il a lieu
**Then** la date de référence est conservée, comme sur l'écran d'analyse

**Given** un historique vide
**When** « Tout l'historique » est demandé
**Then** la série est vide, et l'écran le dit

### Story 18.17: Tri par colonne sur la liste des transactions

> **Demandé le 2026-09-07 :** « dans le tableau transaction est-ce que tu peux mettre le sort
> sur les colonnes ».

En tant qu'utilisateur,
je veux trier la liste des transactions par date, libellé, montant ou catégorie,
afin de retrouver la plus grosse dépense d'une période sans la chercher ligne à ligne.

**Acceptance Criteria:**

**Given** la liste des transactions
**When** elle s'affiche sans qu'on ait rien trié
**Then** l'ordre est celui de l'API — date croissante — et rien ne bouge

**Given** un en-tête de colonne
**When** il est activé
**Then** la liste se trie sur cette colonne, et un second clic inverse le sens

**Given** un tri actif
**When** la colonne est annoncée à un lecteur d'écran
**Then** son état de tri l'est aussi

**Given** deux lignes égales sur le critère de tri
**When** elles sont ordonnées
**Then** leur ordre est stable d'un rendu à l'autre

**Given** un tri par montant
**When** il s'applique
**Then** il porte sur le montant SIGNÉ : une dépense de 500 € et un remboursement de 500 € ne
se mélangent pas (D28)

**Given** un tri par catégorie
**When** il s'applique
**Then** il porte sur le libellé affiché, pas sur le code qui le porte

**Note de portée.** Le tri par libellé porte sur le libellé bancaire ENTIER, date d'opération
comprise : c'est ce que la colonne affiche, et trier sur autre chose donnerait une colonne
visiblement désordonnée. Pour regrouper un même marchand, la recherche par libellé et l'écran
« À ranger » sont les bons outils.

### Story 18.18: Filtrer sur plusieurs catégories à la fois

> **Demandé le 2026-09-07 :** « il faudrait que je puisse filtrer sur certaines catégories ».
> Le filtre ne retenait qu'un seul poste.

En tant qu'utilisateur,
je veux retenir plusieurs postes, ou des rubriques entières,
afin de comparer des dépenses qui vont ensemble sans les regarder une par une.

**Acceptance Criteria:**

**Given** le filtre de postes
**When** aucun poste n'est coché
**Then** toutes les lignes passent — c'est l'absence de sélection qui ne filtre rien

**Given** plusieurs postes cochés
**When** la liste est filtrée
**Then** les lignes de tous ces postes sont retenues, et le compte comme le sous-total suivent

**Given** une rubrique cochée
**When** elle l'est
**Then** tous ses postes le sont ; décocher l'un d'eux la laisse dans un état intermédiaire

**Given** une sélection
**When** le déclencheur du filtre est affiché
**Then** il nomme le poste unique, ou la rubrique entière, ou compte les postes retenus

**Given** deux postes de même libellé sous deux rubriques différentes
**When** ils apparaissent dans la recherche
**Then** leur rubrique les distingue

**Given** une recherche sans résultat
**When** elle est affichée
**Then** elle le dit, plutôt que de laisser une liste vide

**Note d'implémentation.** La sélection est une simple liste de codes de POSTES : cocher une
rubrique coche les siens. Rien n'a besoin de savoir d'où vient une sélection, et le filtrage
reste une appartenance à un ensemble.

### Story 18.19: Moyenne mensuelle de la cible suivie

> **Demandé le 2026-09-07 :** « dans la section suivre une rubrique ce serait chouette de
> pouvoir avoir le choix entre la somme et la moyenne dans le tableau ». Arbitré en LIGNE DE
> RÉFÉRENCE : le tableau garde ses sommes, la moyenne s'ajoute en pied et sur la courbe.

En tant qu'utilisateur,
je veux savoir ce qu'une rubrique me coûte en moyenne par mois,
afin de situer un mois par rapport à l'ordinaire plutôt que par rapport au mois précédent.

**Acceptance Criteria:**

**Given** une cible suivie
**When** son tableau est affiché
**Then** un pied de tableau donne la moyenne mensuelle et le nombre de mois sur lequel elle porte

**Given** une période contenant des mois sans mouvement
**When** la moyenne est calculée
**Then** ces mois sont EXCLUS du dénominateur — sur une année en cours, les mois à venir
écraseraient la moyenne

**Given** une moyenne affichée
**When** la courbe est tracée
**Then** une ligne de référence la matérialise, orientée comme la courbe

**Given** une cible sans aucun mouvement sur la période
**When** le tableau est affiché
**Then** aucune moyenne n'est annoncée — il n'y en a pas, et zéro n'en serait pas une

**Note de portée.** La moyenne est celle des MOIS, pas celle des transactions. Le panier moyen
par transaction répond à une autre question — « est-ce que j'achète plus souvent ou plus
cher ? » — qui reste ouverte.

## Epic 19 — Avances remboursées : neutraliser sans effacer

> **Demandé le 2026-09-07, et qualifié « assez important » par l'utilisateur.** « Il arrive
> souvent que je fasse des achats pour mes parents et je me rembourse après via un virement. Il
> faudrait pouvoir lier des transactions de dépenses et de revenus pour qu'elles ne viennent pas
> polluer mon analyse. » Puis, sur la forme réelle : « je fais plusieurs dépenses (courses,
> achat de bouteille de gaz etc.) et je me rembourse en UN virement qui regroupe plusieurs
> dépenses ou un virement du montant exact. Il faut donc un mécanisme de réconciliation qui me
> permette de garder la trace tout de même, mais ne pas gonfler ou dégonfler artificiellement
> mes analyses. Sachant aussi qu'un remboursement peut se faire sur un autre mois. »

**Ampleur mesurée sur les données réelles :** 47 lignes de recettes ressemblant à des
remboursements, environ 8 700 € — « SEJOUR EXEMPLE » 440 €, « MEUBLE EXEMPLE » 610 €. Ce
n'est pas un cas marginal, c'est 8 % des recettes de l'historique.

**Portée PRD.** Capacité NOUVELLE, absente du périmètre verrouillé du 2026-09-04. Elle sert
directement NFR4 — ne pas confondre ce qui enrichit et ce qui circule — et la mesure du
patrimoine de la story 18.14, qu'elle rend plus juste. Amendement à porter au PRD.

**Décisions de cadrage, prises avec l'utilisateur le 2026-09-07.**

1. **Les deux côtés sont ÉCARTÉS des agrégats, aucun n'est réduit.** C'est le seul modèle qui
   ne déplace rien entre les mois : janvier perd une dépense qui n'était pas la sienne, mars
   perd une recette qui n'en était pas une. Réduire la dépense du montant remboursé obligerait
   à choisir quel mois porte la réduction — et c'est là qu'on gonfle ou dégonfle.
2. **Le reste non couvert demeure une vraie dépense**, dans SON mois et SA rubrique. Le
   remboursement s'impute sur les avances les plus anciennes d'abord, jusqu'à épuisement.
3. **Les lignes restent visibles et traçables** : marquées dans la liste, jamais supprimées.
4. **La neutralisation est rétroactive** : lier en mars une avance de janvier fait baisser les
   dépenses de janvier après coup. Conséquence assumée du modèle.
5. **Un groupe peut rester ouvert** : sans remboursement rattaché, rien n'est neutralisé et les
   dépenses restent à la charge de l'utilisateur — ce qui est la vérité du moment.

### Story 19.1: Grouper des transactions qui se compensent

En tant qu'utilisateur,
je veux réunir plusieurs dépenses et le ou les virements qui me les remboursent,
afin que ce que j'ai avancé pour un tiers cesse de peser sur mon analyse.

**Acceptance Criteria:**

**Given** plusieurs transactions
**When** je les réunis dans un groupe
**Then** le groupe existe, porte un libellé, et chaque ligne sait à quel groupe elle appartient

**Given** une ligne d'un groupe
**When** je la retire
**Then** elle redevient une transaction ordinaire, et le groupe se recalcule

**Given** un groupe
**When** il ne reste qu'une ligne ou aucune
**Then** il reste valide — une avance sans remboursement est un groupe ouvert, pas une erreur

**Given** un groupe supprimé
**When** la suppression a lieu
**Then** aucune transaction n'est perdue : elles redeviennent simplement libres

### Story 19.2: Neutraliser les lignes couvertes, garder le reste

En tant qu'utilisateur,
je veux que seules les sommes réellement remboursées disparaissent de mon analyse,
afin que ce que j'ai payé de ma poche continue d'apparaître.

**Acceptance Criteria:**

**Given** un groupe dont les remboursements couvrent exactement les avances
**When** la période est agrégée
**Then** ni les avances ni les remboursements n'entrent dans les dépenses ou les recettes

**Given** un groupe dont les remboursements couvrent partiellement les avances
**When** la période est agrégée
**Then** l'imputation se fait sur les avances les plus ANCIENNES d'abord, et le reste non
couvert compte comme dépense dans son mois et sa rubrique

**Given** un groupe dont les remboursements dépassent les avances
**When** la période est agrégée
**Then** l'excédent compte comme une recette — c'est de l'argent reçu qui n'a rien remboursé

**Given** un groupe sans aucun remboursement
**When** la période est agrégée
**Then** rien n'est neutralisé : les avances restent des dépenses

**Given** un groupe à cheval sur plusieurs mois
**When** chaque mois est agrégé
**Then** aucun montant ne passe d'un mois à l'autre — chaque ligne est traitée dans le sien

**Given** la variation du patrimoine
**When** elle est calculée sur une période contenant un groupe équilibré
**Then** elle est inchangée par ce groupe : faire circuler l'argent d'un tiers n'enrichit ni
n'appauvrit

**Note d'implémentation.** La neutralisation est une transformation PURE appliquée aux lignes
avant agrégation, dans `analysis-engine`. Elle ne touche jamais la base : `amount_cents` reste
le montant du relevé (D28). NFR3 s'applique — couverture exacte, partielle, excédentaire,
groupe ouvert, groupe à cheval sur deux mois.

### Story 19.3: Voir et gérer ses groupes

En tant qu'utilisateur,
je veux repérer une ligne neutralisée et retrouver le groupe qui l'explique,
afin que la traçabilité ne soit pas sacrifiée à la propreté des chiffres (NFR2).

**Acceptance Criteria:**

**Given** la liste des transactions
**When** une ligne appartient à un groupe
**Then** un BADGE la signale (demandé explicitement le 2026-09-07), et dit si elle est
neutralisée, partiellement couverte, ou restée à la charge de l'utilisateur

**Given** plusieurs lignes sélectionnées
**When** je demande à les lier
**Then** un groupe est créé, et les vues d'analyse se rafraîchissent

**Given** un groupe
**When** il est affiché
**Then** on voit ce qu'il totalise d'avances, de remboursements, et ce qui reste à charge

### Story 19.4: Voir ce qui ne compte pas, là où on lit les totaux

> **Née de l'usage réel, le 2026-09-08.** « La couleur des badges remboursé n'est pas très
> visible » et « dans la partie analyse on ne voit pas ces lignes qui ne font pas partie du
> total ». Derrière la demande cosmétique, deux défauts : le pied de la descente d'analyse
> sommait les montants BRUTS sous un total qui neutralise, et l'état de réconciliation se
> calculait sur les lignes déjà filtrées par poste — donc faux dès que le remboursement était
> rangé ailleurs.

En tant qu'utilisateur,
je veux repérer dans l'analyse les lignes qui ne pèsent pas ce qu'elles affichent,
afin de vérifier un total sans avoir à deviner pourquoi il ne tombe pas juste (NFR2).

**Acceptance Criteria:**

**Given** un poste contenant une ligne neutralisée
**When** je le déplie dans l'analyse
**Then** le pied de la descente affiche exactement le total du poste affiché au-dessus

**Given** une ligne neutralisée ou partiellement couverte
**When** elle s'affiche dans une descente
**Then** elle porte un badge lisible, montre le montant qui COMPTE, et rappelle le montant du
relevé entre parenthèses

**Given** une avance dont le remboursement est rangé sur un autre poste
**When** je descends sur le poste de l'avance
**Then** son état est celui que le moteur lui a donné sur la période, jamais celui qu'un groupe
amputé de ses remboursements laisserait croire

**Given** une avance dont le remboursement tombe dans un autre mois
**When** je regarde le mois de l'avance
**Then** elle est « à rembourser » et compte entière — l'état décrit ce que le moteur a fait sur
la période regardée, pas l'état absolu du groupe

**Note d'implémentation.** L'état ET le montant effectif sortent du même rejeu de
`neutralizeSettlements`. La portée du calcul est celle de l'agrégat affiché : la période, sans
le filtre de poste ou de rubrique.

## Epic 20 — Navigation et confort d'usage

> **Ouvert le 2026-09-08.** L'epic 16 a refondu l'apparence des écrans ; leur ORGANISATION, elle,
> n'a jamais été reprise. Demande de l'utilisateur : « ranger les onglets de manière logique ».

La barre alignait sept liens de même poids sans dire lesquels vont ensemble. Cet epic accueille
les ajustements d'architecture de l'information et de confort nés de l'usage réel — il ne touche
ni aux calculs, ni aux données, ni au périmètre fonctionnel.

### Story 20.1: Regrouper la navigation en deux menus

En tant qu'utilisateur,
je veux que les onglets disent ce qui va ensemble,
afin de trouver un écran sans relire les sept libellés à chaque fois.

**Acceptance Criteria:**

**Given** n'importe quelle page
**When** je regarde la barre
**Then** elle porte quatre entrées : Analyse, Évolution, Transactions ▾ et Données ▾ — le premier
menu contenant « Toutes » et « À ranger », le second Import, Règles et Catégories

**Given** un menu ouvert
**When** je le parcours au clavier
**Then** les flèches circulent dans la liste, `Escape` referme, et le focus revient au déclencheur

**Given** une page atteinte par une URL profonde — `/transactions/2026-08`, `/reconciliation/<hash>`
**When** elle s'affiche
**Then** l'entrée de menu qui la contient est allumée

**Given** deux menus
**When** j'en ouvre un alors que l'autre est ouvert
**Then** le premier se referme — jamais deux à la fois

**Note d'implémentation.** Aucune page n'est créée, déplacée ni renommée, aucune URL ne change :
seule la façon d'y accéder est reprise. Le déclencheur est un BOUTON et non un lien — un élément
qui navigue *et* ouvre un menu oblige à deviner ce que fera le clic. Pas de compteur sur les
entrées : le nombre de non-catégorisés n'est porté par aucune donnée déjà chargée, et l'afficher
imposerait une requête sur chaque page.

## Epic 21 — Compte joint : ne compter que ma moitié

> **Demandé le 2026-09-08.** « Il faudrait que je les groupe avec les dépenses mais je ne veux
> pas faire de bêtise en faisant cela. » Puis, sur l'alimentation du compte : « ce compte joint
> est alimenté par des virements pour charges, par le crédit d'impôt et de l'argent que nous
> avions dessus », et enfin la règle : « on met la même chose tous les deux donc compte 50 % ».

**Le double comptage, mesuré.** 33 virements reçus du joint (+8 264,70 €) étaient rangés en
mouvement interne, donc exclus de tout. Or les contributions mensuelles VERS le joint
(`logement-charges` 298,50 €, `enfants-*` 286,50 €) sont, elles, déjà comptées en dépense. La
moitié de chaque virement reçu est donc de l'argent déjà dépensé une première fois : environ
3 980 € comptés deux fois sur l'historique.

**Arbitrage du 2026-09-08.** Pas d'appariement virement ↔ dépenses — écarté explicitement au
profit d'une coupe automatique. Et la moitié qui rembourse est une **dépense en moins**, pas une
recette : le résultat est identique dans les deux cas, mais la mission de l'app est « où part
l'argent », et de l'argent qu'on n'a finalement pas dépensé n'a pas sa place dans les dépenses
(cohérent avec D28 et l'epic 19).

### Story 21.1: Ne compter que la moitié qui est vraiment à ma charge

En tant qu'utilisateur,
je veux que ce qui me revient du compte joint cesse d'être compté deux fois,
afin que mes dépenses disent ce que j'ai réellement supporté.

**Acceptance Criteria:**

**Given** un virement reçu du compte joint
**When** la période est agrégée
**Then** la moitié diminue les dépenses et l'autre reste un mouvement interne, sans qu'un
centime se perde ni s'invente

**Given** une contribution VERS le joint
**When** la période est agrégée
**Then** elle reste entière — c'est une dépense, pas un remboursement

**Given** le poste « Part remboursée », qui ne porte aucune ligne en base
**When** je le déplie
**Then** j'atteins les virements qui le composent, chacun à sa moitié (NFR2)

**Given** la même période
**When** je la regarde sur l'analyse puis sur la trajectoire
**Then** les deux disent le même montant

**Note d'implémentation.** La coupe est une transformation PURE appliquée avant agrégation, aux
mêmes points que `neutralizeSettlements` : aucun appelant ne doit pouvoir l'oublier. L'arrondi
va à l'interne — la moitié qui compte est plancher — et huit des trente-trois virements sont
impairs. Le moteur ignorant SILENCIEUSEMENT un poste absent du référentiel, une sonde de
démarrage refuse de servir une base semée où ces postes manquent.

## Epic 22 — Le foyer et son second membre

> **Ouvert le 2026-09-12.** Révision du PRD : l'application cesse d'être mono-utilisateur.
> « Je vais déployer sur une autre machine et on va potentiellement ajouter un user en plus »,
> puis « il me faut donc pouvoir me logger en tant que marceau et inviter quelqu'un pour
> rejoindre mon foyer ».

Deux personnes ont chacune leur compte, leur espace et leurs données. Chacune dépose ses relevés,
construit son référentiel, et ne voit rien de ce qui appartient à l'autre.

**FRs :** FR44, FR45, FR46, FR47, FR48, FR49 · **AR :** AR24, AR25, AR26 · **NFR :** NFR9, NFR24, NFR25

**AR5 ne s'applique plus.** La migration du référentiel se faisait par vidage puis ré-ingestion
depuis `_data/raw/`, sûre tant que NFR12 garantissait la reconstruction. NFR12 est inversée : la
migration de propriété **préserve** les données. C'est la contrainte la plus structurante de l'epic.

### Story 22.1: Se connecter avec un compte que l'on a déjà

> *Amendée le 2026-09-22.* Les profils existent déjà (epic 27). Une identité vérifiée se
> **rattache à un profil existant** — `marceau` pour le fondateur — et `requireProfile` lit
> désormais la session au lieu du cookie `pf_profile`, sans qu'aucun endpoint change (AR35). Le
> choix libre du profil disparaît à cette story.

En tant qu'utilisateur,
je veux entrer dans l'application avec un compte existant chez un fournisseur d'identité,
afin de n'avoir ni mot de passe à choisir, ni compte de plus à créer.

**Acceptance Criteria:**

**Given** une session non authentifiée
**When** j'ouvre n'importe quelle page de l'application
**Then** je suis renvoyé vers l'écran de connexion, sans qu'aucune donnée n'ait été servie

**Given** une identité vérifiée par le fournisseur
**When** je reviens sur l'application
**Then** j'accède à mes écrans, et la base ne contient ni mot de passe ni empreinte de mot de passe (NFR25)

**Given** un appel direct à un endpoint, hors navigateur et sans session
**When** il est reçu
**Then** il est refusé avant tout accès à la base (NFR9)

**Note d'implémentation.** Le fournisseur retenu est Google, mais l'exigence porte sur la
**délégation**, pas sur le fournisseur : aucun code métier ne doit dépendre de son nom. La
connexion exige Internet, y compris depuis le réseau local — renoncement assumé.

### Story 22.2: Chaque donnée a un propriétaire, et chaque requête s'y limite

> ⚠️ **Absorbée le 2026-09-22 par les stories 27.1 et 27.2.** La propriété des données et le
> cloisonnement serveur sont livrés par le chantier « Profils et banques », avant et sans
> l'authentification. Le texte ci-dessous est conservé pour mémoire ; **ne pas l'implémenter**.

En tant qu'utilisateur,
je veux que mes relevés, mes transactions et mon référentiel m'appartiennent explicitement,
afin que personne d'autre ne puisse les atteindre quand l'application accueillera quelqu'un.

**Acceptance Criteria:**

**Given** la base existante, avec son historique de deux ans
**When** la migration s'applique
**Then** chaque relevé, transaction, rubrique, poste, règle et groupe porte le fondateur comme
propriétaire, **et aucune ligne n'est perdue** — le nombre de transactions est identique avant et après

**Given** une requête authentifiée
**When** elle atteint n'importe quel endpoint de données
**Then** la restriction au propriétaire est appliquée **côté serveur**, jamais par un filtrage
d'affichage (NFR24)

**Given** une identité forgée désignant des données qui ne lui appartiennent pas
**When** elle interroge l'endpoint directement
**Then** la réponse est vide ou refusée, jamais partielle

**Given** le moteur d'analyse
**When** il calcule
**Then** il ignore toujours la notion de membre : il reçoit des lignes déjà restreintes par
l'endpoint (AR25, D19 préservée)

**Note d'implémentation.** Les décisions D11 à D16 décrivaient un modèle multi-profils retiré le
2026-09-04. Elles modélisaient des profils **gérés par un utilisateur unique**, sans
authentification ni cloisonnement : à relire comme un précédent, jamais à recopier (AR26).

### Story 22.3: Inviter quelqu'un à rejoindre le foyer

En tant que fondateur du foyer,
je veux inviter une personne en désignant son adresse,
afin qu'elle accède à l'application sans que je lui transmette quoi que ce soit de secret.

**Acceptance Criteria:**

**Given** une adresse saisie par le fondateur
**When** l'invitation est émise
**Then** elle est à usage unique et expire au bout de 7 jours si elle n'est pas acceptée

**Given** une invitation déjà consommée, ou expirée
**When** quelqu'un tente de l'utiliser
**Then** elle est refusée, et le motif du refus est distinct de « invitation inconnue »

**Given** une personne invitée qui se connecte pour la première fois
**When** elle arrive sur l'application
**Then** son espace est **vierge** : aucun relevé, aucune transaction, aucun référentiel hérité
d'un autre membre

**Note d'implémentation.** L'espace vierge n'est pas un écran vide par accident : c'est la preuve
visible que le cloisonnement de 22.2 fonctionne. Si quoi que ce soit du fondateur apparaît, la
story 22.2 est en défaut, pas celle-ci.

### Story 22.4: Voir les membres du foyer, et en retirer un

En tant que fondateur du foyer,
je veux savoir qui en fait partie et pouvoir en retirer quelqu'un,
afin que la composition du foyer suive la réalité.

**Acceptance Criteria:**

**Given** un foyer de deux membres
**When** je consulte la liste
**Then** chaque membre y figure, avec la date à laquelle il a rejoint

**Given** un membre dont le solde n'est pas nul
**When** je tente de le retirer
**Then** le retrait est refusé et le **montant restant** est indiqué

**Given** un membre dont le solde est nul
**When** je le retire
**Then** il perd l'accès, et ses relevés comme ses transactions **restent en base** — le sort de
ses données est explicitement hors périmètre (PRD § hors-périmètre, 2026-09-12)

**Note d'implémentation.** Le refus de retirer un membre débiteur n'est pas un garde-fou
décoratif : sans lui, une erreur de manipulation devient une perte d'argent silencieuse.

## Epic 23 — Joignable depuis l'extérieur, et sauvegardée

> **La porte d'exposition du PRD.** Elle ne s'ouvre qu'une fois le cloisonnement de l'epic 22
> vérifié par test.

Les deux membres atteignent l'application depuis n'importe quelle connexion, sur un canal chiffré,
et aucune page ne répond sans authentification. La base est copiée chaque jour sur une autre
machine du réseau.

**FRs :** aucun — cet epic porte des exigences non fonctionnelles · **AR :** AR31 · **NFR :** NFR5, NFR12, NFR26

**Pourquoi un epic et non deux stories dispersées.** Isolées, la sauvegarde et le durcissement
seraient repoussées indéfiniment derrière des fonctionnalités visibles. Réunies, elles portent une
valeur formulable : le second membre peut enfin se connecter d'où il est.

### Story 23.1: La base est sauvegardée, et la sauvegarde est restaurable

En tant qu'utilisateur,
je veux que la base soit copiée tous les jours ailleurs que sur la machine qui la porte,
afin qu'une panne ne fasse pas disparaître ce qu'aucun relevé PDF ne permet de reconstruire.

**Acceptance Criteria:**

**Given** l'application en fonctionnement
**When** vingt-quatre heures s'écoulent
**Then** une copie de la base existe sur une **machine du réseau local distincte de l'hôte** (NFR5, NFR12)

**Given** trente jours de sauvegardes
**When** je regarde ce qui est conservé
**Then** au moins trente versions sont disponibles, la plus ancienne n'étant pas écrasée avant ce délai

**Given** une sauvegarde quelconque
**When** elle est restaurée sur une base vierge
**Then** l'application démarre dessus et les données sont intactes — la restauration est **éprouvée**,
pas supposée

**Given** une sauvegarde qui échoue
**When** l'échec se produit
**Then** il est visible, et non silencieux

**Note d'implémentation.** La copie reste **dans le foyer** : NFR5 est préservée, rien ne part chez
un tiers. La contrepartie est écrite au PRD — cette sauvegarde protège de la panne matérielle et de
l'erreur humaine, pas du sinistre du logement. La sauvegarde chiffrée hors site est en Phase 3.

### Story 23.2: Rien ne répond sans être identifié, et tout passe par un canal chiffré

En tant qu'utilisateur,
je veux que l'application soit joignable depuis n'importe où sans être lisible par n'importe qui,
afin de m'en servir en déplacement sans exposer deux ans de relevés bancaires.

**Acceptance Criteria:**

**Given** une requête venue hors du réseau local
**When** elle atteint l'application
**Then** elle transite par un canal chiffré ; une requête en clair est refusée ou redirigée, jamais servie

**Given** n'importe quelle URL de l'application, y compris une page sans donnée
**When** elle est demandée sans session valide
**Then** elle ne répond pas — la protection ne se limite pas aux écrans portant des chiffres (NFR26)

**Given** un robot d'indexation
**When** il explore le domaine
**Then** l'indexation est refusée

**Given** l'epic 22 dont le cloisonnement n'aurait pas été vérifié par test
**When** on envisage d'ouvrir l'accès
**Then** **on ne l'ouvre pas** — c'est une porte, pas une étape (AR31)

**Note d'implémentation.** Le serveur est chez l'utilisateur, l'application ne l'est pas : le port
est ouvert sur Internet et sera trouvé par des balayages automatiques en quelques heures. C'est ce
qui justifie qu'aucune page ne réponde, et pas seulement celles qui portent des données.

## Epic 24 — Les dépenses communes

> **Demandé le 2026-09-12.** « On flag des dépenses comme communes (transaction auchan par
> exemple) et cela abonde sur une cagnotte », et « il y a les deux car il y a des dépenses en cash
> et des dépenses avec la carte bancaire ».

Une dépense du foyer se marque d'un geste, depuis l'écran où elle est déjà affichée, et se partage
en deux parts exactes. Les dépenses réglées en espèces entrent enfin quelque part, sans casser la
réconciliation.

**FRs :** FR50, FR51, FR52, FR53, FR54, FR55, FR56, FR57, FR64 · **AR :** AR28, AR29 · **NFR :** NFR2, NFR24, NFR27, NFR28

**Trois mécanismes voisins, qui ne fusionnent pas (AR28).** Le mouvement interne (virement entre
comptes du même membre), la dépense commune (avance pour le foyer), et la coupe à 50 % des virements
du compte joint livrée en 21.1. Les confondre produit des doubles comptages. **La story 21.1 n'est
pas retouchée.**

> ✅ **Tranché le 2026-09-12 — flux contre stock.** Une dépense commune de 80 € pèse **80 €** dans
> l'analyse de celui qui l'a payée, parce que 80 € sont sortis de son compte : l'analyse mesure un
> **flux**. Elle porte **40 €** au décompte du foyer, parce que c'est ce qui est dû : le décompte
> mesure un **stock**. Les deux chiffres sont justes et répondent à deux questions différentes.
>
> **Pourquoi ce n'est pas l'arbitrage de la story 21.1.** En 21.1 il y avait un vrai double
> comptage : la contribution mensuelle au compte joint était déjà comptée en dépense, et le virement
> reçu la remboursait — le même euro apparaissait deux fois. Ici rien n'apparaît deux fois : une
> dépense d'un côté, une créance de l'autre. Le précédent ne s'applique pas.

### Story 24.1: Marquer une dépense comme commune

En tant que membre du foyer,
je veux désigner une ligne de mon relevé comme dépense du foyer,
afin qu'elle entre dans notre décompte sans que j'aie à la ressaisir ailleurs.

**Acceptance Criteria:**

**Given** une transaction affichée dans ma liste
**When** je la marque comme commune
**Then** le marquage se fait **sans quitter l'écran** où elle est déjà affichée (FR50)

**Given** une dépense commune de 80,00 €
**When** elle est répartie
**Then** chaque membre porte une part de 40,00 €, et la somme des parts vaut exactement 80,00 €

**Given** une dépense commune de 641,01 €, dont la moitié n'est pas entière en centimes
**When** elle est répartie
**Then** les parts valent 320,50 € et 320,51 € — jamais deux fois le même arrondi, jamais un
centime perdu ni inventé (NFR27)

**Given** une dépense commune payée par un membre
**When** l'autre membre consulte son propre référentiel
**Then** elle n'y apparaît dans **aucune** de ses rubriques : elle reste rangée chez le payeur (FR52)

**Given** une dépense que je m'apprête à marquer
**When** le marquage m'est proposé
**Then** il m'est dit explicitement que **ce geste la rend visible à l'autre membre** (FR50)

**Given** une dépense marquée commune
**When** l'autre membre la consulte depuis le décompte
**Then** il voit sa date, son libellé, son montant et son payeur — **et rien d'autre** : ni le poste
sur lequel elle est rangée, ni le relevé dont elle provient, ni aucune ligne voisine (FR64)

**Given** une dépense **non** marquée
**When** l'autre membre cherche à l'atteindre par n'importe quel chemin
**Then** elle lui reste invisible (FR49, NFR24)

**Note d'implémentation — le marquage est un acte de divulgation.** FR64 est la **seule** exception
au cloisonnement, et elle est énumérée et close. Elle existe parce qu'on ne peut pas devoir de
l'argent à quelqu'un sans avoir le droit de savoir pourquoi : sans elle, FR60 (descendre jusqu'aux
dépenses sources) et FR49 (ne rien voir d'un autre membre) se contredisent frontalement. Le
corollaire est assumé : qui veut garder une dépense privée ne la marque pas, et renonce à s'en faire
rembourser. C'est pourquoi l'avertissement au moment du geste n'est pas un confort.

**Note d'implémentation.** Aucune écriture de montant en base : `amount_cents` reste le montant du
relevé, conformément à D28. La répartition est une transformation appliquée avant agrégation, au
même endroit que la coupe du compte joint et que la neutralisation des avances — un appelant ne
doit pas pouvoir l'oublier, défaut déjà corrigé deux fois en 19.4 et 21.1.

### Story 24.2: Défaire un marquage posé par erreur

En tant que membre du foyer,
je veux retirer le caractère commun d'une dépense,
afin qu'une erreur de clic ne reste pas dans notre décompte.

**Acceptance Criteria:**

**Given** une dépense marquée comme commune
**When** je retire le marquage
**Then** le décompte du foyer est recalculé immédiatement, sans rechargement de page (FR53)

**Given** une dépense dont le marquage est retiré
**When** je regarde mon analyse
**Then** elle est redevenue une dépense ordinaire de mon poste, sans trace de la répartition

### Story 24.3: Saisir une dépense réglée en espèces

En tant que membre du foyer,
je veux enregistrer une dépense payée en liquide,
afin que ce que j'ai avancé compte, même sans ligne bancaire en face.

**Acceptance Criteria:**

**Given** une dépense en espèces
**When** je la saisis
**Then** je renseigne sa date, son libellé, son montant et son poste (FR54)

**Given** une dépense saisie à la main
**When** la réconciliation d'un relevé s'exécute
**Then** cette saisie **n'entre dans aucun calcul de réconciliation** et ne peut faire basculer
aucun relevé en « non fiable » (FR55, NFR28)

**Given** un relevé déjà marqué « non fiable »
**When** je saisis une dépense en espèces sur la même période
**Then** son état de fiabilité est inchangé — la saisie ne le corrige pas davantage qu'elle ne le dégrade

**Note d'implémentation.** Les saisies manuelles forment un **jeu de données distinct** des
transactions de relevé (AR29). Les loger dans la même table casserait l'invariant de réconciliation,
qui est le seul mécanisme de confiance du produit. Renoncement assumé du périmètre : la saisie se
fait depuis un écran de bureau, donc de mémoire ou d'après un ticket, l'application installable sur
téléphone étant en Phase 3.

### Story 24.4: Reconnaître d'où vient une ligne, partout

En tant que membre du foyer,
je veux distinguer une dépense saisie à la main d'une ligne de relevé,
afin de savoir ce qui est adossé à ma banque et ce qui repose sur ma mémoire.

**Acceptance Criteria:**

**Given** un montant affiché composé de lignes de relevé et de saisies manuelles
**When** je descends jusqu'à ses sources
**Then** chaque élément porte son origine, lisible sans survol (FR56, NFR2)

**Given** une saisie manuelle
**When** elle contribue à un agrégat, à un indicateur ou au décompte du foyer
**Then** son origine reste identifiable à cet endroit aussi — pas seulement sur l'écran de saisie

### Story 24.5: Corriger ou supprimer une dépense que j'ai saisie

En tant que membre du foyer,
je veux modifier ou effacer une saisie,
afin qu'un montant tapé de travers ne fausse pas notre décompte indéfiniment.

**Acceptance Criteria:**

**Given** une dépense que j'ai saisie
**When** je la modifie ou la supprime
**Then** l'opération aboutit et le décompte du foyer est recalculé (FR57)

**Given** une dépense saisie par l'autre membre
**When** je tente de la modifier
**Then** l'opération est refusée — chacun corrige ses propres saisies

## Epic 25 — Qui doit combien à qui

> **L'objectif énoncé le 2026-09-12 :** « mon but est de remplacer le tricount », et sur ce que
> l'outil doit dire : « qui doit combien à qui ».

Le décompte du foyer existe, se reprend depuis l'outil tenu jusqu'ici, se lit jusqu'aux dépenses qui
le composent, et **se solde**.

**FRs :** FR58, FR59, FR60, FR61, FR62, FR63 · **AR :** AR27, AR30 · **NFR :** NFR2, NFR29, NFR30

**Le décompte ne porte pas toutes les dépenses communes.** Le compte joint est lui-même un mécanisme
de règlement : s'y rembourser d'une avance éteint la créance, puisqu'il est alimenté à parts égales.
Le décompte ne suit donc que ce qui lui échappe — les espèces, les avances jamais remboursées, et
les dépenses avancées par l'autre membre depuis son propre compte (FR63).

⚠️ **Collision de nom (AR27).** `/api/settlements` existe déjà et désigne les groupes de
transactions qui se compensent, livrés à l'epic 19. Le règlement entre membres est une autre notion
et doit porter un autre nom.

**La dernière story ne se reporte pas.** Sans le rattachement du règlement à sa ligne bancaire,
chaque remboursement gonfle les recettes de celui qui l'encaisse et le solde ne retombe jamais à
zéro. Un décompte qui ne se solde pas ne remplace pas l'outil tiers, il s'y ajoute.

### Story 25.1: Reprendre le décompte tenu jusqu'ici

En tant que fondateur du foyer,
je veux saisir le solde qui existe déjà dans notre outil actuel,
afin de ne pas effacer des mois d'avances croisées en repartant de zéro.

**Acceptance Criteria:**

**Given** un décompte existant dans un outil tiers
**When** je saisis le solde d'ouverture
**Then** je renseigne un montant, une date et un **sens** — qui doit à qui (FR58)

**Given** une saisie complète
**When** je valide
**Then** l'application **redit la saisie en toutes lettres** — « à cette date, telle personne doit
tel montant à telle autre » — et exige une confirmation avant d'enregistrer

**Given** un solde d'ouverture enregistré
**When** je consulte le décompte
**Then** il en tient compte, et ce solde est atteignable depuis le décompte comme n'importe quelle
autre composante (NFR2)

**Note d'implémentation.** Le sens inversé est l'erreur la plus probable et la plus coûteuse : elle
transforme une créance en dette, l'écart vaut le **double** du solde, et aucun autre contrôle ne la
rattrape. La relecture en toutes lettres est le seul garde-fou, elle n'est pas négociable.

### Story 25.2: Voir qui doit combien à qui

En tant que membre du foyer,
je veux lire notre situation en une phrase,
afin de savoir où nous en sommes sans ouvrir une autre application.

**Acceptance Criteria:**

**Given** des dépenses communes et un solde d'ouverture
**When** j'ouvre l'écran du foyer
**Then** il affiche qui doit combien à qui, sans que j'aie à interpréter un tableau (FR59)

**Given** un décompte équilibré
**When** je le consulte
**Then** il le dit explicitement, plutôt que d'afficher zéro sans commentaire

**Given** les deux membres consultant au même moment
**When** ils regardent le décompte
**Then** ils lisent la même valeur

### Story 25.3: Descendre du solde jusqu'aux dépenses qui le composent

En tant que membre du foyer,
je veux savoir d'où vient le montant affiché,
afin de pouvoir le vérifier plutôt que de devoir y croire.

**Acceptance Criteria:**

**Given** un solde affiché
**When** je le déplie
**Then** j'atteins les dépenses qui le composent, chacune identifiée comme ligne de relevé, saisie
manuelle, solde d'ouverture ou règlement (FR60, NFR2)

**Given** la liste des composantes
**When** j'en fais la somme
**Then** elle vaut exactement le solde affiché, au centime

**Given** une dépense avancée par l'autre membre depuis son propre compte
**When** je la consulte depuis le décompte
**Then** je vois sa date, son libellé, son montant et son payeur, **et rien de plus** — ni son poste,
ni son relevé, ni aucune ligne voisine (FR64)

### Story 25.4: Enregistrer un règlement entre nous

En tant que membre du foyer,
je veux consigner un remboursement que l'un a fait à l'autre,
afin que notre décompte redescende.

**Acceptance Criteria:**

**Given** un remboursement effectué entre les deux membres
**When** je l'enregistre
**Then** le solde est réduit du montant réglé (FR61)

**Given** un règlement qui solde exactement la dette
**When** il est enregistré
**Then** le décompte affiche l'équilibre

**Given** deux membres qui modifient le décompte au même moment
**When** la seconde écriture se fonde sur un état déjà dépassé
**Then** elle est **refusée** et son auteur en est informé — jamais appliquée par-dessus celle de
l'autre (NFR30, AR30)

### Story 25.5: Rattacher le règlement au virement qui le porte

En tant que membre du foyer,
je veux relier un remboursement à la ligne de mon relevé qui le contient,
afin que cet argent ne soit pas compté à la fois comme une recette et comme une dette éteinte.

**Acceptance Criteria:**

**Given** un règlement enregistré et le virement correspondant apparu dans mon relevé
**When** je les rattache
**Then** cette transaction n'est comptée **ni en recette ni en dépense** de sa période (FR62, NFR29)

**Given** une transaction rattachée à un règlement
**When** je consulte mon analyse de la période
**Then** mon résultat est inchangé par ce virement — il n'améliore pas artificiellement mes recettes

**Given** une transaction rattachée
**When** je défais le rattachement
**Then** elle redevient une transaction ordinaire et le décompte est recalculé

**Note d'implémentation — réutiliser le regroupement, ne pas en inventer un second.** Le mécanisme
de groupes livré à l'epic 19 fait déjà exactement ça : relier une avance et son remboursement, et
neutraliser ce qui est couvert. Le rattachement d'un règlement **est** un groupe. Construire un
second mécanisme en parallèle garantirait la divergence : on neutraliserait dans l'analyse sans
solder le décompte, ou l'inverse, et les deux écrans se contrediraient sans que rien ne le signale.
Un groupe, un geste, deux effets cohérents.

C'est par ailleurs la version large du défaut qui a produit la story 21.1 : un mouvement d'argent
entre comptes qui, faute d'être reconnu pour ce qu'il est, se lit comme une recette. Aucun montant ne
doit contribuer simultanément au résultat d'un membre et à l'extinction d'une dette du foyer.

### Story 25.6: Ce que le compte joint a déjà remboursé ne reste pas dû

En tant que membre du foyer,
je veux que les avances dont je me suis remboursé depuis le compte joint sortent du décompte,
afin que notre solde ne gonfle pas d'une dette qui n'existe plus.

**Acceptance Criteria:**

**Given** une dépense commune de 80 € avancée depuis mon compte personnel
**When** je me rembourse 80 € depuis le compte joint et que je rattache ce virement à l'avance
**Then** la créance de 40 € **disparaît du décompte** — le compte joint étant alimenté à parts
égales, j'ai pris 40 € de mon argent et 40 € du sien, la dette est éteinte (FR63)

**Given** cette même dépense
**When** je consulte mon analyse
**Then** elle continue d'y peser selon la coupe de la story 21.1, **inchangée** — le décompte du
foyer ne modifie en rien ce mécanisme

**Given** une dépense commune dont je ne me suis **pas** remboursé
**When** je consulte le décompte
**Then** la créance de 40 € y figure toujours

**Given** une dépense en espèces marquée commune
**When** je consulte le décompte
**Then** elle y figure — aucun virement du joint ne peut l'avoir soldée

**Note d'implémentation.** C'est la jonction entre deux mondes qui existaient séparément : le
regroupement de transactions (epic 19) et le décompte du foyer. Un même groupe éteint la créance et
neutralise l'avance. **La story 21.1 n'est pas retouchée** : elle traite la moitié à charge dans
l'analyse, ce qui reste vrai indépendamment du décompte.

## Epic 26 — L'agent conversationnel

> **Demandé le 2026-09-12.** « J'aimerais pouvoir avoir une interaction avec un agent pour lui poser
> des questions sur les évolutions de ma trésorerie », puis, après cadrage : « avoir un agent qui
> m'aide déjà avec le passé et qui peut me faire une analyse de mon comportement avec mes données,
> c'est très bien ».

⚠️ **Numéroté après le foyer, construit avant lui.** Premier chantier de la séquence.

L'utilisateur pose une question en français et obtient une réponse, avec le moyen de la vérifier.
L'agent interroge le moteur d'analyse et **rapporte** ce qu'il renvoie.

**FRs :** FR65 à FR71, FR37 absorbée · **AR :** AR32, AR33 · **NFR :** NFR2, NFR6, NFR15, NFR16, NFR17, NFR31 à NFR34

**Trois frontières, et aucune n'est négociable.**

**Il ne calcule pas.** NFR31 en donne la forme vérifiable : aucun nombre qui ne figure tel quel dans
ce qu'il a reçu.

**Il ne touche pas la base.** NFR32. C'est ce qui le rendra conforme au foyer sans retouche, le
cloisonnement étant posé dans les endpoints par la story 22.2. Le franchir pour aller plus vite
coûterait une réouverture complète.

**Il n'agit pas.** Il ne reclasse aucune transaction, ne crée aucune règle, ne marque aucune dépense.
Faire confiance à un modèle pour décrire un tableau et lui faire confiance pour modifier des données
sont deux questions distinctes ; la seconde ne se pose pas tant que la première n'a pas de réponse à
l'usage.

### Story 26.1: Comprendre la question avant d'y répondre

En tant qu'utilisateur,
je veux que l'application me montre ce qu'elle a compris de ma question,
afin de savoir si elle regarde la bonne période avant de me donner un chiffre.

**Acceptance Criteria:**

**Given** la question « comment ont évolué mes dépenses de restaurant entre 2025 et 2026 »
**When** elle est interprétée
**Then** l'application affiche la **requête retenue** — période, granularité, cible — avant ou avec
la réponse

**Given** une requête produite par le modèle
**When** l'application la reçoit
**Then** elle la **valide** : bornes de dates réelles, granularité connue, poste ou rubrique existant
dans le référentiel. Une requête invalide est **rejetée par le code**, jamais exécutée (AR32)

**Given** une question dont la cible n'existe pas au référentiel
**When** elle est interprétée
**Then** l'application le dit, plutôt que d'exécuter une requête sur une catégorie inventée

**Given** le module de l'agent
**When** on inspecte ses imports
**Then** il n'importe **pas** le client de base de données : il n'obtient ses données que par les
endpoints d'analyse (NFR32)

**Given** l'identifiant du modèle et ses paramètres
**When** on les cherche dans le code
**Then** ils viennent de la configuration d'environnement, avec une **valeur distincte** de celle de
la catégorisation (NFR34)

**Note d'implémentation — cette story est un jalon.** Elle isole le risque technique de l'epic avant
de construire quoi que ce soit par-dessus, sur le modèle de l'epic 14. D20 a établi que les sorties
structurées du fournisseur sont injectées dans le prompt et **non contraintes au décodage** : si le
schéma n'est qu'une instruction, le choix de la période l'est aussi. **Mesure à faire sur une série
de questions réelles : à quelle fréquence la requête retenue est-elle celle attendue ?** Si le taux
est mauvais, on ajuste le prompt ou l'on restreint la grammaire des questions **avant** d'écrire
l'écran de conversation. Un agent qui se trompe de période est plus dangereux qu'un agent absent.

### Story 26.2: Obtenir une réponse, et pouvoir la vérifier

En tant qu'utilisateur,
je veux une réponse en français accompagnée de son chemin de vérification,
afin de ne pas avoir à croire l'agent sur parole.

**Acceptance Criteria:**

**Given** une requête validée
**When** l'agent répond
**Then** la réponse est en français, lisible, et repose sur les agrégats renvoyés par le moteur (FR66)

**Given** une réponse contenant des montants
**When** on compare chacun aux données reçues du moteur
**Then** **chaque nombre y figure tel quel.** Aucune moyenne, aucun écart, aucun pourcentage qui
n'ait été calculé par le moteur (NFR31)

**Given** une réponse portant un montant
**When** je la lis
**Then** elle affiche la période et le filtre dont il provient, et me permet d'**ouvrir l'écran
d'analyse correspondant** (FR68, NFR33)

**Given** vingt-quatre totaux mensuels reçus
**When** l'agent décrit un cycle
**Then** il peut dire « tes dépenses gonflent en décembre et en juillet » — une forme — mais **pas**
« ta moyenne de décembre est de 1 186 € », qui serait un nombre fabriqué

**Note d'implémentation.** La règle du nombre cité est **testable** : comparer l'ensemble des nombres
d'une réponse à l'ensemble des nombres reçus. C'est ce qui distingue NFR31 de NFR15, qui énonce la
même intention sans qu'aucun test ne puisse la constater. Décrire une forme est le métier de
l'agent ; produire un nombre est le métier du moteur.

### Story 26.3: Quand il ne sait pas, il le dit

En tant qu'utilisateur,
je veux que l'agent refuse plutôt qu'il n'approxime,
afin de pouvoir faire confiance à ses réponses quand il en donne une.

**Acceptance Criteria:**

**Given** la question « compare 2024 et 2026 »
**When** elle est interprétée
**Then** l'agent répond qu'il ne sait pas comparer deux périodes non consécutives, **sans produire de
chiffre** — le moteur ne compare qu'à la période immédiatement précédente (FR69, FR39 en Phase 2)

**Given** une question sans rapport avec les données — un conseil, une prévision, une opinion
**When** elle est posée
**Then** l'agent dit qu'elle sort de son périmètre

**Given** une demande d'action — reclasser, créer une règle, marquer une dépense
**When** elle est formulée
**Then** l'agent indique qu'il ne modifie aucune donnée et renvoie vers l'écran concerné

**Given** le fournisseur LLM indisponible
**When** une question est posée
**Then** l'échec est explicite, et **toutes les autres capacités de l'application restent intactes** —
analyse, évolution, transactions (NFR17)

**Note d'implémentation.** Le refus est une fonctionnalité, pas un aveu. Un agent qui bricole une
réponse plausible hors de portée du moteur rend **toutes** ses réponses suspectes, y compris les
justes. C'est le cas qui décide si l'agent sera utilisé ou abandonné au bout de trois semaines.

### Story 26.4: Enchaîner sans tout réexpliquer

En tant qu'utilisateur,
je veux poser une question de suite sans redonner le contexte,
afin de creuser un sujet comme dans une conversation normale.

**Acceptance Criteria:**

**Given** une première question sur les restaurants en 2026
**When** j'écris ensuite « et y a-t-il un cycle là-dedans ? »
**Then** l'agent comprend qu'il s'agit du même poste et de la même période (FR67)

**Given** une question de suite qui change explicitement de sujet
**When** elle est posée
**Then** le nouveau contexte remplace l'ancien, et la requête retenue le montre (FR68)

**Given** une suite de questions
**When** chacune obtient sa réponse
**Then** chaque réponse porte **sa propre** période et son propre filtre — le contexte hérité ne
dispense jamais de les afficher

### Story 26.5: Retrouver, reprendre et supprimer une conversation

En tant qu'utilisateur,
je veux rouvrir demain la discussion d'aujourd'hui,
afin de ne pas reconstituer un raisonnement que j'ai déjà mené.

**Acceptance Criteria:**

**Given** des conversations passées
**When** j'ouvre l'agent
**Then** je les retrouve et peux en reprendre une **avec son contexte** (FR70)

**Given** une conversation reprise
**When** je pose une question de suite
**Then** elle est comprise comme si la discussion n'avait pas été interrompue

**Given** une conversation dont je ne veux plus
**When** je la supprime
**Then** elle disparaît définitivement (FR71)

**Note d'implémentation.** Les conversations sont un objet **durable qu'aucun relevé ne reconstruit**.
Elles relèvent donc de la sauvegarde obligatoire (NFR12) au même titre que les saisies manuelles et le
solde d'ouverture du foyer. Le PRD signale, sans l'exiger à ce stade, qu'elles s'accumulent sans borne
et que la sauvegarde quotidienne les emporte : ni rétention ni purge ne sont définies. Sans effet
aujourd'hui, à reconsidérer si le volume devient visible.

---

## Epic 27 — Deux profils, chacun ses données

> **Ouvert le 2026-09-22.** « Je veux que toutes les données déjà chargées soient affectées à mon
> profil marceau », puis « sur le prochain profil que je vais créer on va l'affecter à Crédit
> Mutuel ». Chantier de rang 1, devant l'agent et le foyer.

Marceau retrouve tout son historique sous son profil, crée un second profil pour une autre
personne, et bascule de l'un à l'autre. Aucun profil ne voit les données de l'autre, et c'est le
serveur qui l'impose.

**FRs :** FR73, FR74, FR75, FR76, FR81 · **AR :** AR34, AR35, AR36, AR37 · **NFR :** NFR24, NFR35

**Reprend la story 22.2**, marquée absorbée. **Ne protège pas d'une personne** : sans
authentification, quiconque a l'application devant lui peut changer de profil — d'où NFR35.

### Story 27.1: Tout mon historique m'appartient, sans rien perdre

En tant que Marceau,
je veux que chacune de mes données existantes soit rattachée à mon profil,
afin qu'un second profil puisse exister sans que rien de ce que j'ai construit ne bouge.

**Acceptance Criteria:**

**Given** la base actuelle, avec deux ans d'historique, des corrections, des règles et des groupes
**When** la migration `0010` s'applique
**Then** une table `profiles` existe et contient le profil `marceau`, banque par défaut `boursorama`
**And** chaque rubrique, poste, relevé, règle et groupe porte `profile_id` = `marceau`
**And** chaque relevé porte `bank = 'boursorama'` (AR37)

**Given** la migration
**When** elle s'exécute
**Then** une sauvegarde est prise **avant**, et sa restaurabilité est vérifiée — ouverture de la copie,
`PRAGMA integrity_check` à `ok`, comptage de chaque table égal à la source — faute de quoi la
migration ne démarre pas

**Given** la base avant et après migration
**When** on compare
**Then** le nombre de lignes de chaque table et la somme de `amount_cents` de chaque relevé sont
identiques, et tout écart fait échouer la migration (FR75)

**Given** le référentiel migré
**When** on le lit
**Then** `category_groups` et `category_items` ont une clé de substitution entière et `(profile_id,
code)` est unique ; `transactions` et `classification_rules` référencent le poste par identifiant ;
`classification_rules` est unique par `(profile_id, pattern)` (AR34)
**And** `transactions` ne porte **aucune** colonne de profil : elle appartient au profil de son relevé

**Given** l'application après migration
**When** Marceau l'utilise
**Then** chaque écran affiche exactement les mêmes chiffres qu'avant — analyse, évolution,
relevés, fiabilité, règles, groupes — et l'API expose toujours des **codes** de poste

**Given** une base neuve (E2E)
**When** les migrations sont rejouées puis le bootstrap s'exécute
**Then** le profil `marceau` existe et reçoit le référentiel initial (AR36)

**Note d'implémentation.** Rebuild de table (création, copie, bascule) : SQLite ne porte pas de clé
étrangère `NOT NULL` par `ALTER TABLE`. Migration versionnée et commitée (D21), **jamais** de
`drizzle push`. C'est la story la plus risquée du chantier : la perte de ces données n'est pas
rattrapable depuis les PDF (NFR12).

### Story 27.2: Chaque requête se limite au profil courant

En tant qu'utilisateur,
je veux que le serveur ne me rende et ne me laisse modifier que les données du profil choisi,
afin qu'un profil ne puisse ni lire ni altérer les données d'un autre, même par une requête directe.

**Acceptance Criteria:**

**Given** une requête vers n'importe lequel des 23 endpoints de `server/api/`, hors `profiles/`
**When** elle est traitée
**Then** le profil courant est obtenu par `requireProfile(event)` et **uniquement** par lui (AR35)
**And** en l'absence de profil valide, la réponse est `400 profile_required`

**Given** deux profils A et B possédant chacun des données
**When** A interroge l'analyse, l'évolution, les transactions, les relevés, le référentiel, les
règles ou les groupes
**Then** seules les données de A sont renvoyées, le filtre étant appliqué **dans la requête SQL** (FR76, NFR24)

**Given** une ressource de B désignée par son identifiant, son code ou son hash
**When** A tente de la lire, la modifier ou la supprimer
**Then** la réponse est **404**, et la ressource est inchangée

**Given** A crée un groupe de transactions
**When** l'une des lignes appartient à B
**Then** la création est refusée

**Given** A dépose un relevé couvrant une période que seul B a déjà ingérée
**When** la détection de chevauchement s'exécute
**Then** aucun chevauchement n'est signalé (FR81)

**Given** la suite de tests
**When** elle s'exécute
**Then** un test d'architecture énumère les fichiers de `server/api/` et échoue si l'un d'eux, hors
`profiles/`, n'appelle pas `requireProfile`

**Given** le moteur d'analyse
**When** il calcule
**Then** il ne connaît toujours pas la notion de profil (D19)

**Note d'implémentation.** Le cookie `pf_profile` peut être posé à la main dans les tests : l'écran
de choix arrive en 27.3. Un profil B de test se crée directement en base dans les fixtures.

### Story 27.3: Créer un profil et passer de l'un à l'autre

En tant que Marceau,
je veux créer un profil pour une autre personne et choisir celui sur lequel je travaille,
afin qu'elle suive ses dépenses dans un espace qui n'est pas le mien.

**Acceptance Criteria:**

**Given** l'écran de gestion des profils
**When** je crée un profil avec un nom et une banque par défaut
**Then** le profil existe, **avec le référentiel initial**, sans relevé, transaction ni règle (FR73)
**And** profil et référentiel sont créés dans la même transaction : un échec ne laisse aucun profil
à moitié créé (AR36)

**Given** un nom déjà pris
**When** je crée un profil
**Then** la création est refusée avec un message explicite

**Given** plusieurs profils
**When** j'en choisis un
**Then** le cookie `pf_profile` est posé, l'application **se recharge entièrement**, et chaque écran
n'affiche que les données de ce profil (AR35)

**Given** n'importe quel écran
**When** il s'affiche
**Then** le nom du profil courant est visible dans l'en-tête (FR74)

**Given** l'écran de choix du profil
**When** il s'affiche
**Then** rien ne le présente comme une connexion ou une sécurité (NFR35)

**Given** un nouveau profil
**When** il dépose son premier relevé Boursorama
**Then** la catégorisation range les lignes dans son référentiel initial, jamais dans celui de
`marceau`

**Note d'implémentation.** Pas de renommage ni de suppression de profil : hors périmètre au PRD.
Composable `useProfiles`, pas de `$fetch` dans un composant.

---

## Epic 28 — Les relevés Crédit Mutuel

> **Ouvert le 2026-09-22.** « La deuxième évolution est de pouvoir choisir une banque en fonction
> de son compte […] je vais te donner un extrait de compte pour que tu puisses créer le parseur
> spécifique. »

Le second profil dépose ses relevés Crédit Mutuel. Seul le compte courant est lu, les achats par
carte apparaissent un par un et leur somme est contrôlée au centime, et aucun identifiant bancaire
ne part vers le fournisseur.

**FRs :** FR77, FR78, FR79, FR80, FR81 · **AR :** AR37, AR38, AR39, AR40, AR41 · **NFR :** NFR6, NFR36

⚠️ **28.2 et 28.3 sont bloquées par AR41** : trois à cinq relevés Crédit Mutuel supplémentaires,
couvrant un solde débiteur, un remboursement carte, deux cartes et un détail prélevé hors période.
Un seul relevé a été lu : écrire le format dessus figerait ses particularités comme des règles.

### Story 28.1: Choisir la banque d'un relevé, et être arrêté si elle ne correspond pas

En tant qu'utilisateur,
je veux que la banque de mon relevé soit proposée d'office et qu'un mauvais choix soit refusé net,
afin qu'un relevé ne soit jamais lu avec les règles d'une autre banque.

**Acceptance Criteria:**

**Given** l'écran de dépôt
**When** il s'affiche
**Then** la banque est préremplie avec la banque par défaut du profil courant, et modifiable (FR77)
**And** `POST /api/statements` accepte un champ `bank` optionnel, qui vaut sinon la banque par
défaut du profil (AR37)

**Given** un relevé ingéré
**When** on le consulte
**Then** sa banque est enregistrée et affichée dans la liste des relevés

**Given** un relevé Boursorama déposé sous « Crédit Mutuel », ou l'inverse
**When** l'ingestion démarre
**Then** il est refusé en `400 bank_mismatch` avec un message en français, **avant tout appel au
fournisseur**, et aucune ligne n'est écrite (FR78, AR38)

**Given** le code d'extraction
**When** on le lit
**Then** la logique propre à Boursorama vit dans `server/services/bank-formats/boursorama.ts`
derrière le type `BankFormat`, et `pdf-extractor.ts` reste le seul importateur de `unpdf` (NFR21)

**Given** les relevés Boursorama de référence
**When** ils sont ré-extraits après déplacement
**Then** soldes, période et texte transmis sont **identiques** à ceux d'avant : aucun changement de
comportement

**Given** la suite de tests
**When** elle s'exécute, en local comme en CI
**Then** un test d'extraction Boursorama tourne sur une fixture JSON de pages positionnées, aux
identifiants substitués par des faux de même forme, et vérifie qu'**aucun** faux identifiant
n'apparaît dans le texte transmis (NFR36, AR40)
**And** ce test n'est plus sauté faute de PDF, comme le sont les tests actuels

**Given** le prompt d'extraction
**When** il est construit
**Then** sa partie commune ne mentionne plus Boursorama, et un paragraphe propre à la banque du
relevé s'y ajoute

**Note d'implémentation.** Story sans relevé Crédit Mutuel : `credit_mutuel` n'y apporte que
`recognizes`, ce qui suffit à tester le refus croisé. Le reste de son format arrive en 28.2.

### Story 28.2: Lire le compte courant d'un relevé Crédit Mutuel, et lui seul

En tant que titulaire d'un compte Crédit Mutuel,
je veux que mes relevés soient lus, réconciliés et catégorisés comme ceux de Boursorama,
afin de suivre mes dépenses sans rien saisir.

**Acceptance Criteria:**

**Given** un relevé Crédit Mutuel contenant un compte courant, des livrets et un plan d'épargne
**When** il est ingéré
**Then** seules les opérations de la section du compte courant sont importées (FR79)
**And** la réponse d'ingestion nomme les sections ignorées, **sans leurs numéros**, et l'écran les
affiche

**Given** une section de compte courant qui court sur deux pages
**When** le relevé est découpé
**Then** elle reste une seule section, et ses opérations des deux pages sont importées

**Given** aucune section, ou plusieurs, reconnue comme compte courant
**When** l'ingestion s'exécute
**Then** le relevé est refusé en `400 statement_format_unrecognized`, sans ligne écrite

**Given** la section retenue
**When** ses soldes sont lus
**Then** ouverture et clôture sont le premier et le dernier `SOLDE CREDITEUR AU` ou
`SOLDE DEBITEUR AU` **de cette section**, `DEBITEUR` donnant un montant négatif
**And** la période commence **le lendemain** du solde d'ouverture et se termine au solde de clôture

**Given** deux relevés Crédit Mutuel consécutifs
**When** le second est déposé
**Then** aucun chevauchement de période n'est signalé (FR81)

**Given** un relevé dont la somme des lignes ne tombe pas sur les soldes
**When** il est ingéré
**Then** il est marqué « non fiable » avec l'écart, exactement comme un relevé Boursorama (FR81)

**Given** le texte transmis au fournisseur
**When** on le lit
**Then** il ne contient ni IBAN, ni numéro de compte, ni numéro de carte — **libellés compris**,
ex. `VIR PEL <numéro>` — ni nom ou adresse du titulaire hors libellés (NFR6, NFR36)
**And** les trois couches d'AR39 sont en place : sélection par construction, remplacement exact des
numéros lus dans le document, masquage des suites d'au moins dix chiffres
**And** les numéros de chèque (sept chiffres) restent lisibles

**Given** la suite de tests
**When** elle s'exécute
**Then** chaque relevé Crédit Mutuel de référence a sa fixture JSON anonymisée, qui vérifie soldes,
période, section retenue, sections ignorées et absence de tout faux identifiant planté (AR40)

**Note d'implémentation.** ⚠️ **Bloquée par AR41.** Dans cette story, la ligne `RELEVE CARTE` reste
une ligne comme les autres : son remplacement par le détail est l'objet de 28.3. Le bloc de détail
carte n'est **pas** transmis au fournisseur ici.

### Story 28.3: Voir mes achats par carte un par un, au centime près

En tant que titulaire d'une carte à débit différé,
je veux voir chaque achat plutôt qu'une seule ligne mensuelle,
afin de savoir où part l'argent que je dépense par carte.

**Acceptance Criteria:**

**Given** un relevé portant une ligne `RELEVE CARTE` de montant T et un bloc de détail totalisant T
**When** il est ingéré
**Then** la ligne agrégée disparaît et chaque achat du détail devient une transaction, catégorisée
et **datée de son jour d'achat** (FR80)
**And** le total T est lu par le code, jamais par le modèle ; les lignes du détail sont extraites
par un **appel distinct** au fournisseur (AR39)

**Given** un achat du détail antérieur au début de la période du relevé
**When** l'analyse du mois de l'achat est affichée
**Then** l'achat y figure, et le relevé qui le porte reste celui qu'on atteint en descendant jusqu'à
la ligne (FR36)

**Given** des achats du détail dont la somme diffère de T d'au moins un centime
**When** le relevé est réconcilié
**Then** il est marqué « non fiable », l'écart est exposé, et la réponse d'ingestion précise qu'il
vient du détail carte

**Given** une ligne `RELEVE CARTE` sans bloc de détail correspondant
**When** le relevé est ingéré
**Then** la ligne est conservée telle quelle, `card_detail_missing` est vrai, et le relevé est dans
l'état dégradé `card_detail_missing` avec cette cause affichée partout où il contribue (FR80, FR12)
**And** accepter un écart n'efface pas cet état

**Given** deux cartes sur le même compte
**When** le relevé est ingéré
**Then** chaque agrégat est remplacé par **son** détail, rapproché par son total

**Given** un bloc de détail sans ligne agrégée correspondante
**When** le relevé est ingéré
**Then** ses achats ne sont pas importés, et la réponse d'ingestion le dit

**Given** le texte transmis pour le détail
**When** on le lit
**Then** il ne contient que les lignes d'achat : ni l'en-tête du bloc (numéro de carte, titulaire),
ni la ligne de total (NFR36)

**Given** le moteur d'analyse et `deriveReliability`
**When** les tests s'exécutent
**Then** le nouvel état a son cas nominal et deux cas limites, comme toute fonction de fiabilité
(NFR3)

**Note d'implémentation.** ⚠️ **Bloquée par AR41.** Le signe d'un remboursement dans le détail
(colonne unique `Montant euros`) n'est pas connu : il se lit sur un relevé réel, pas se suppose.
