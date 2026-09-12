---
stepsCompleted:
  - step-01-init
  - step-02-discovery
  - step-02b-vision
  - step-02c-executive-summary
  - step-03-success
  - step-04-journeys
  - step-05-domain
  - step-06-innovation (sautée — aucune innovation authentique détectée)
  - step-07-project-type
  - step-08-scoping
  - step-09-functional
  - step-10-nonfunctional
  - step-11-polish
  - step-12-complete
  - step-e-01-discovery
  - step-e-02-review
  - step-e-03-edit
releaseMode: phased
inputDocuments:
  - _bmad-output/planning-artifacts/prd-v1-forecast.md
  - ~/Downloads/Dépenses 2022(1).xlsx (tableur tenu à la main, 2022 — référence du besoin réel ; INTROUVABLE sur le disque au 2026-09-12, référence conservée pour mémoire)
  - _bmad-output/planning-artifacts/architecture.md
  - CLAUDE.md
workflowType: 'prd'
documentCounts:
  briefs: 0
  research: 0
  brainstorming: 0
  projectDocs: 3
classification:
  projectType: web_app
  domain: general
  complexity: high
  projectContext: brownfield
  notes: >-
    Réécriture complète après invalidation du cadrage initial par l'usage réel
    (2026-09-04). Le PRD v1 (archivé en prd-v1-forecast.md) était construit
    autour du forecast inverse et du dividende SAS ; le besoin premier réel est
    l'analyse des dépenses par catégorie sur 2 ans de relevés. Socle conservé :
    epics 1-3 (ingestion, catégorisation, réconciliation).

    Révision du 2026-09-12 : ajout du périmètre « foyer » — identité déléguée,
    multi-utilisateur cloisonné, dépenses communes partagées à parts égales,
    saisie manuelle des dépenses en espèces, et solde « qui doit combien à qui ».
    La complexité passe de `medium` à `high` : l'application cesse d'être
    mono-utilisateur et mono-machine.
date: '2026-09-04'
lastEdited: '2026-09-12'
editHistory:
  - date: '2026-09-12'
    changes: >-
      Ajout du périmètre foyer (identité, multi-utilisateur, dépenses communes,
      saisie espèces, solde et règlement). NFR9 inversée (authentification
      désormais exigée), NFR12 inversée (sauvegarde désormais obligatoire),
      NFR2 et NFR5 élargies. Journeys 5 et 6 ajoutés. FR44 à FR62 et NFR24 à NFR29 ajoutées.
      « Répartition avec un conjoint » sort du hors-périmètre et de la Phase 3.
  - date: '2026-09-12'
    changes: >-
      Seconde passe, suite au rapport validation-report-2026-09-12.md.
      Journey 7 ajouté (bascule depuis l'outil de partage tiers, source de FR58).
      NFR12 spécifiée (périodicité, rétention, destination). NFR5 élargie au
      réseau local du foyer. NFR30 ajoutée (concurrence sur le solde du foyer).
      FR31 réécrite d'après le comportement livré le 2026-09-07. Sort des données
      d'un membre retiré déclaré hors périmètre. Métadonnées corrigées.
  - date: '2026-09-12'
    changes: >-
      Troisième passe, née du découpage en stories. FR63 (le compte joint éteint
      la créance, le décompte ne porte que ce qu'il ne solde pas) et FR64
      (visibilité partagée des dépenses communes, seule exception à FR49).
      FR49, FR50 et NFR24 amendées en conséquence. Doctrine flux / stock
      inscrite au modèle de domaine.
  - date: '2026-09-12'
    changes: >-
      Quatrième passe : périmètre « agent conversationnel ». FR65 à FR72 et
      NFR31 à NFR33 ajoutées, FR37 absorbée. Journey 8 ajouté. Ordre des
      chantiers inscrit en tête du périmètre (agent, puis foyer, puis forecast) :
      les numéros de phase deviennent historiques et non chronologiques.
      Le forecast reste hors de cet amendement.
  - date: '2026-09-12'
    changes: >-
      Cinquième passe, suite au rapport validation-report-2026-09-12-agent.md.
      Trois incohérences internes corrigées : étiquette de Phase 1 bis rendue
      historique, analyse narrative retirée de la Phase 2, Journey 7 rattaché à
      la Phase 1 bis. FR71 et FR72 déclarées. Absence de plafond de coût
      réexaminée et reconduite. Latence de l'agent inscrite en point de
      vigilance sous NFR23, sans cible.
  - date: '2026-09-12'
    changes: >-
      Sixième passe. NFR6 réécrite pour décrire ce que le code applique
      réellement : bloc d'identité coupé, lignes brutes du tableau d'opérations
      transmises, nom du titulaire résiduel dans les libellés et assumé.
      Le résumé exécutif et la section domaine corrigés en conséquence : ils
      annonçaient « trois colonnes anonymes », promesse jamais tenue.
      Dernier constat ouvert des deux rapports de validation, clos.
---

# Product Requirements Document - personnalFinance

**Author:** Marceau
**Date:** 2026-09-04

## Executive Summary

**personnalFinance** est une application web locale d'analyse de dépenses personnelles. Elle ingère des relevés bancaires PDF, catégorise automatiquement chaque ligne via LLM, et restitue **où part l'argent** — par catégorie, sur une période choisie, avec l'évolution dans le temps.

Utilisateur premier : une personne qui tenait déjà cette analyse **à la main dans un tableur**, avec 23 rubriques, 68 postes et cinq indicateurs, et qui a fini par l'abandonner. Non par manque d'intérêt : parce que reporter chaque ligne de relevé une par une était intenable.

**Une couche de restitution conversationnelle s'ajoute le 2026-09-12.** Un agent répond en français à des questions posées en langage ordinaire — « comment ont évolué mes restaurants entre 2025 et 2026 », « y a-t-il un cycle dans mes dépenses » — en interrogeant le moteur d'analyse et en **rapportant** ce qu'il renvoie. Il ne calcule rien et ne peut citer aucun nombre qu'il n'a pas reçu. C'est la généralisation interactive de la synthèse narrative qui était prévue en Phase 2.

**Depuis la révision du 2026-09-12, l'application n'est plus mono-utilisateur.** Elle héberge un **foyer** : plusieurs personnes, chacune avec ses relevés, son référentiel et son analyse, strictement cloisonnés. Ce qu'elles partagent est un **décompte de dépenses communes** — qui a avancé quoi, et qui doit combien à qui. Cette lecture remplace un outil de partage de dépenses tenu jusqu'ici en parallèle.

Le problème résolu n'est donc pas « comment analyser mes dépenses » — cette question a déjà sa réponse, éprouvée par des années d'usage. Il est : **comment tenir cette analyse à jour sans y passer une soirée par mois.**

L'application produit deux lectures indissociables : la **répartition** — sur une période, où part l'argent, par nature et par catégorie — et l'**évolution** — comment ces postes bougent d'une période à l'autre. Objectif opérationnel : identifier vite ce qui rend une période **déficitaire**, définie comme dépenses supérieures aux recettes, hors mouvements internes entre comptes du même utilisateur.

### What Makes This Special

**Souveraineté des données.** Les PDF ne quittent jamais la machine hôte. **Aucun identifiant bancaire n'est transmis** : IBAN, RIB, numéro de compte et adresse sont coupés du relevé avant tout appel. Ce qui part est le tableau d'opérations, vers un fournisseur dont l'inférence s'exécute **en Europe**. L'argument ne se limite pas à restreindre ce qui sort — ce qui sort reste sous régime européen. Les agrégateurs du marché (Bankin', Linxo, Finary) exigent un accès aux comptes ou des identifiants ; ici, il n'y a rien à céder. Une seule chose sort désormais : **l'identité**. L'authentification est déléguée à un fournisseur externe, qui apprend qui se connecte et quand, jamais ce que contiennent les relevés. C'est le prix assumé d'une application accessible à deux personnes depuis l'extérieur du réseau local.

**Ajustement exact.** Le référentiel de catégories appartient à l'utilisateur — sa hiérarchie, ses libellés, ses regroupements. Le tableur d'origine en fait la démonstration : le poste *Restaurant* y apparaît sous deux rubriques distinctes, *Alimentation* et *Voyages*, parce qu'il ne recouvre pas la même dépense. Aucun outil générique ne modélise cette nuance.

**L'insight fondateur : le LLM ne rend pas l'analyse possible, il rend la saisie inutile.** C'est le seul verrou qui avait fait échouer la pratique manuelle. Cinq ans plus tôt, obtenir le même résultat aurait exigé des centaines de règles de correspondance sur des libellés bancaires bruts, pour une qualité médiocre.

**Trois natures de mouvement, et non deux.** Recette, Dépense, **Mouvement interne**. Cette troisième nature — virements entre comptes du même utilisateur — est exclue du calcul de déficit. Le tableur d'origine la comptait en recette : sur un mois de 2022, un renflouement de 690 € prélevé sur l'épargne affichait un déficit de 1 734 € là où il atteignait réellement 2 424 €, et un taux d'épargne de −0,89 au lieu de −1,90. **L'outil masquait le trou qu'il devait révéler.**

**Un LLM qui ne calcule jamais.** Le moteur d'analyse produit des agrégats déterministes et testés ; le LLM les reçoit et rédige la synthèse en français. Un modèle qui calculerait pourrait inventer un montant, et l'utilisateur déciderait dessus. Les deux briques sont séparables : le moteur est testé à 100 %, la narration est jugée sur sa lisibilité et remplaçable sans toucher aux chiffres.

Deux mécanismes distincts coexistent et ne doivent pas être confondus : `llm-categorizer` attribue une catégorie à chaque ligne à l'ingestion (appel Claude) ; `charge-suggester` repère les dépenses récurrentes parmi les transactions déjà catégorisées (heuristique déterministe, zéro LLM).

## Project Classification

| | |
|---|---|
| **Type** | `web_app` — SPA Nuxt 4 (`ssr: false`), backend Nitro intégré, usage desktop, pas de SEO |
| **Domaine** | `general` — délibérément **pas** `fintech` : aucun mouvement de fonds, aucun accès bancaire, aucun conseil réglementé, aucune exigence KYC/AML/PCI. Les contraintes réelles sont la justesse au centime et la confidentialité, traitées en NFR. |
| **Complexité** | `high` — relevée de `medium` le 2026-09-12. La justesse numérique et la fiabilité de la couche LLM restent les exigences dures ; s'y ajoutent le **cloisonnement entre utilisateurs** et l'**exposition sur Internet**. Un graphique faux est pire qu'absent, on le croit ; une donnée visible par la mauvaise personne ne se rattrape pas. |
| **Contexte** | `brownfield` — le socle d'ingestion, de catégorisation et de réconciliation existe, est testé et reste en place. Le PRD définit ce qui s'ajoute au-dessus et ce qui disparaît. |
| **Hébergement** | Serveur personnel, **accessible depuis Internet** — décision du 2026-09-12. L'application n'est plus mono-machine et n'est plus en environnement de confiance implicite. |

## Success Criteria

### User Success

**Le critère qui tranche : le tableur n'est plus rouvert.** `Dépenses.xlsx` est le concurrent réel du produit — pas Bankin', pas Linxo. Vérifié à 3 mois : si l'utilisateur rouvre son tableur pour comprendre quelque chose que l'app ne dit pas, le produit a échoué, quel que soit le nombre de graphiques livrés.

- Les ~24 relevés d'historique sont ingérés **en une seule session**, sans abandon en cours de route.
- Répondre à « où est parti mon argent en 2025 ? » en **moins de 30 secondes**, sans export ni calcul manuel.
- Au moins **une** dépense décelée que l'utilisateur ne soupçonnait pas — la preuve que l'outil apprend quelque chose plutôt que de confirmer ce qu'on sait déjà.

**Le second critère qui tranche : l'outil de partage de dépenses n'est plus ouvert.** Le décompte des dépenses communes est tenu aujourd'hui dans une application tierce. Elle est le concurrent réel du périmètre foyer, au même titre que le tableur l'est du périmètre analyse. Si les membres du foyer continuent d'y saisir leurs dépenses communes, le périmètre a échoué.

- Le solde du foyer affiché par l'application **coïncide** avec celui tenu dans l'outil tiers pendant la période de recouvrement.
- Une dépense commune se marque **sans quitter l'écran** où la transaction est déjà affichée.
- Le second membre accède à son analyse **sans intervention** du premier après avoir accepté son invitation.

**Le troisième critère : une question posée à l'agent évite d'ouvrir un écran.** L'agent conversationnel n'a de valeur que s'il raccourcit le chemin vers la réponse. S'il faut vérifier chacune de ses réponses sur l'écran d'analyse, il ajoute une étape au lieu d'en retirer une.

- Une question courante — l'évolution d'un poste entre deux années, les postes qui ont le plus bougé — obtient sa réponse **sans qu'un écran d'analyse soit ouvert pour la vérifier**.
- **Zéro nombre cité par l'agent qui ne figure pas tel quel dans ce qu'il a reçu.** Mesuré par test, pas par relecture.
- Une réponse dont la période ou le filtre sont faux est **repérable immédiatement**, parce que l'agent les affiche.

### Business Success

Projet personnel, foyer de deux personnes : pas de revenu, pas de croissance. Le seul succès mesurable est **l'usage réel dans la durée**.

- L'app est ouverte au moins une fois par mois **à 6 mois**, sans rappel ni contrainte externe.
- Chaque nouveau relevé mensuel est ingéré dans le mois. Un historique en retard rend l'analyse fausse et la confiance s'effondre.

### Technical Success

- **Réconciliation au centime sur 100 % des relevés ingérés**, ou état « non fiable » explicitement affiché. Aucun relevé ne rentre silencieusement avec un écart.
- **Taux de correction manuelle ≤ 10 % des lignes** d'un relevé. Au-delà, la corvée que le produit devait supprimer est de retour, et l'utilisateur décrochera comme il a décroché du tableur. Ce seuil remplace la position du PRD v1 — « pas de barre de précision stricte (acceptée) » — qui était tenable quand la catégorisation alimentait un forecast, et ne l'est plus quand **la catégorisation est le produit**.
- Les 24 relevés d'historique ingérés sans intervention manuelle ni interruption.
- **Zéro chiffre affiché qui ne soit traçable jusqu'à une ligne de relevé** ou jusqu'à une saisie manuelle identifiée comme telle. Corollaire direct de la règle « le LLM ne calcule rien ».
- **Zéro donnée d'un membre visible par un autre.** Le cloisonnement est vérifié par test, pas par revue d'écran. Une fuite entre membres du foyer est un échec qui ne se corrige pas après coup.
- **Zéro règlement compté deux fois.** Un virement de remboursement entre membres n'apparaît jamais à la fois comme recette de la période et comme extinction de dette.
- **Zéro chiffre dérivé par l'agent.** Tout nombre qu'il prononce provient du moteur d'analyse, verbatim. C'est la forme vérifiable de « le LLM ne calcule rien ».

### Measurable Outcomes

| Indicateur | Cible | Quand |
|---|---|---|
| Tableur rouvert | **0 fois** | à 3 mois |
| Lignes corrigées manuellement | **≤ 10 %** par relevé | à chaque ingestion |
| Relevés réconciliés au centime ou marqués non fiables | **100 %** | à chaque ingestion |
| Historique ingéré | **24 relevés** en une session | au démarrage |
| Ouverture de l'app | **≥ 1 par mois** | à 6 mois |
| Délai d'ingestion d'un nouveau relevé | **< 1 mois** après réception | en régime de croisière |
| Outil de partage de dépenses tiers ouvert | **0 fois** | à 3 mois après la bascule |
| Écart entre le solde du foyer et celui de l'outil tiers | **0 centime** | pendant la période de recouvrement |
| Données d'un membre visibles par un autre | **0** | vérifié par test à chaque livraison |
| Nombres cités par l'agent absents de ses sources | **0** | vérifié par test à chaque livraison |
| Réponses de l'agent sans période ni filtre affichés | **0** | vérifié par test à chaque livraison |

**Pas de plafond de coût LLM.** Contrainte écartée par l'utilisateur, et **réexaminée le 2026-09-12** : la décision initiale avait été prise quand le fournisseur n'était appelé qu'à l'ingestion, une fois par mois. L'agent conversationnel en fait une consultation quotidienne et multi-tours, donc un ordre de grandeur différent. La prémisse a changé, la décision est **reconduite en connaissance de cause**.

Aucune cible de durée d'ingestion n'est fixée à ce stade. Le PRD v1 imposait 30 secondes par relevé (NFR1) ; le changement de fournisseur LLM rend ce chiffre invérifiable aujourd'hui. À réintroduire après la première mesure réelle.

## User Journeys

> **Note de cadrage, révisée le 2026-09-12.** Le gabarit BMad exige une couverture par types d'utilisateurs. La version précédente écartait l'exercice : l'application était mono-utilisateur et sans authentification, donc aucun rôle n'existait. **Ce n'est plus vrai.** Deux rôles réels apparaissent, et un seul reste fictif.
>
> | Rôle | Existe ? | Ce qu'il peut faire |
> |---|---|---|
> | **Membre du foyer** | Oui | Ses relevés, son référentiel, son analyse. Marque des dépenses communes, saisit des dépenses en espèces, consulte le solde du foyer. |
> | **Fondateur du foyer** | Oui | Un membre, plus le droit d'inviter et de retirer un membre, et de fixer le solde d'ouverture. |
> | Administrateur, support, consommateur d'API | Non | Aucun. Les inventer produirait des besoins fictifs — le mécanisme même qui a engendré 71 FRs dans le PRD v1. |
>
> Les parcours 1 à 4 couvrent **le même utilisateur dans des situations différentes** : chemin nominal, cas limite, récupération d'erreur. Les parcours 5 à 7 couvrent le foyer : la dépense commune de bout en bout, l'arrivée du second membre, et la reprise d'un décompte tenu ailleurs. Le parcours 8 couvre l'agent conversationnel.
>
> ⚠️ **L'ordre d'écriture n'est pas l'ordre de livraison.** Le parcours 8 est le premier chantier, avant les parcours 5 à 7. Voir « Ordre des chantiers » dans la section périmètre.

### Persona — l'ancien tenancier de tableur

Il a maintenu un fichier Excel : 23 rubriques, 68 postes, cinq indicateurs en bas de page, colonnes hebdomadaires pour vérifier ses saisies. Un système sérieux, construit sur des années.

Il l'a abandonné. Pas par désintérêt — par **épuisement de la saisie**. Reporter chaque ligne de relevé une par une, tous les mois, était intenable.

Depuis, il ne sait plus où part son argent. Il a le sentiment diffus que « ça part vite », sans pouvoir dire où. Ses relevés PDF s'accumulent dans un dossier.

*(Le PRD v1 décrivait la persona comme « Marceau, dirigeant SAS au chômage ». Ce cadrage décrivait une situation, pas un besoin, et a orienté tout le document vers la fiscalité.)*

### Journey 1 — Le rattrapage (premier usage)

**Scène d'ouverture.** Deux ans de PDF dans un dossier. La perspective de les traiter est exactement ce qui l'a fait renoncer la dernière fois.

**Montée.** Il dépose les 24 fichiers **d'un coup**. L'app les traite l'un après l'autre, affiche sa progression, et signale ce qui coince — un doublon détecté par hash, un relevé dont la réconciliation échoue au centime. Il n'a rien à saisir.

**Climax.** L'écran s'affiche. Deux ans de dépenses réparties par catégorie. **Il voit un poste qu'il n'attendait pas.**

**Résolution.** Ce qu'il n'avait pas réussi à tenir en trois ans de tableur existe en une session. Et surtout : ça restera à jour.

*Capacités révélées* — dépôt multiple, traitement séquentiel avec progression, détection de doublon, gestion des échecs sans tout interrompre, vue de répartition dès la première ingestion.

### Journey 2 — « Pourquoi ce mois est dans le rouge ? »

**Scène d'ouverture.** Un mois affiché en déficit. Il veut savoir pourquoi, pas contempler un camembert.

**Montée.** Il voit la répartition du mois. Une rubrique dépasse. Il l'ouvre : les postes en dessous. Un poste domine. Il l'ouvre encore : **les lignes de relevé**, avec leurs libellés d'origine.

**Climax.** Il remonte du chiffre agrégé jusqu'à la transaction bancaire réelle. Aucun montant n'est un mystère.

**Résolution.** Il sait ce qui a creusé le mois. Il peut décider.

*Capacités révélées* — sélecteur de période, hiérarchie repliable rubrique → poste, **descente jusqu'à la transaction source**, calcul de déficit hors mouvements internes.

C'est le parcours qui porte le produit : la descente jusqu'à la ligne de relevé fait la différence entre un camembert et un outil de décision.

### Journey 3 — Le cycle mensuel

**Scène d'ouverture.** Le relevé du mois arrive. Trente secondes de disponible.

**Montée.** Il le dépose. L'app catégorise, réconcilie, met à jour les indicateurs.

**Climax.** Il regarde une chose : **le mois est-il déficitaire ?** Et si oui, quelle rubrique a bougé par rapport au mois précédent.

**Résolution.** Il referme. Le rituel tient parce qu'il coûte trente secondes — pas une soirée.

*Capacités révélées* — ingestion unitaire, mise à jour immédiate des indicateurs, comparaison au mois précédent, **lecture en un coup d'œil**.

### Journey 4 — Quand ça se passe mal (cas limite)

**Scène d'ouverture.** Un relevé ne colle pas : la somme des transactions ne tombe pas sur le solde du PDF. Écart de 47 centimes.

**Montée.** L'app **ne se tait pas**. Le relevé est marqué « non fiable », l'écart est chiffré, et toute analyse qui l'inclut porte la marque.

**Climax.** Ailleurs, il repère une ligne mal rangée : un virement vers son livret classé en dépense. Il la reclasse en **mouvement interne**. Le déficit du mois se corrige immédiatement.

**Résolution.** Il fait confiance aux chiffres **parce que** l'app lui a dit quand ne pas leur faire confiance.

*Capacités révélées* — réconciliation bloquante avec écart chiffré, propagation de l'état « non fiable », **reclassement d'une ligne y compris de nature**, recalcul immédiat.

### Journey 5 — La dépense commune, du ticket au règlement

**Scène d'ouverture.** Courses au supermarché pour le foyer, payées avec sa carte. Une semaine plus tard, un dîner réglé en espèces par l'autre membre. Aujourd'hui, ces deux dépenses vivent dans une application tierce que personne n'aime ouvrir.

**Montée.** Le relevé du mois arrive. La ligne du supermarché est là, déjà catégorisée. Il la **marque comme commune** sans quitter l'écran. Le dîner en espèces n'a aucune ligne bancaire en face : l'autre membre l'a **saisi à la main**, avec sa date, son montant et son libellé.

**Climax.** L'écran du foyer affiche une seule phrase utile : **qui doit combien à qui.** Il ouvre le solde et descend jusqu'aux dépenses qui le composent — la ligne de relevé du supermarché d'un côté, la saisie du dîner de l'autre, chacune identifiée pour ce qu'elle est.

**Résolution.** Il fait le virement. Le mois suivant, ce virement arrive dans son relevé. Il le **rattache au règlement**, et l'application cesse de le voir comme une recette. Le solde retombe à zéro sans que rien n'ait été compté deux fois.

*Capacités révélées* — marquage d'une transaction comme commune, répartition à parts égales, saisie manuelle d'une dépense en espèces, solde entre membres, descente du solde jusqu'aux dépenses sources, enregistrement d'un règlement, **rattachement du règlement à la ligne bancaire qui le porte**.

C'est le parcours qui porte le périmètre foyer. Le rattachement du règlement en est le point dur : sans lui, chaque remboursement gonfle les recettes de celui qui le reçoit et la dette ne s'éteint jamais.

### Journey 6 — Rejoindre le foyer

**Scène d'ouverture.** Le second membre n'a jamais ouvert l'application. Elle tourne sur un serveur à la maison, joignable depuis l'extérieur.

**Montée.** Le fondateur l'invite en désignant son adresse. La personne reçoit un lien, se connecte avec son compte existant chez un fournisseur d'identité — aucun mot de passe à choisir, aucun compte à créer dans l'application.

**Climax.** Elle arrive sur une application **vide**. Pas de relevés, pas de catégories héritées, pas de chiffres de quelqu'un d'autre. Elle dépose ses propres relevés et construit son propre référentiel. Le seul écran commun est celui du foyer.

**Résolution.** Deux analyses séparées, un décompte partagé. Aucune des deux personnes ne voit les dépenses privées de l'autre, et les deux voient la même dette.

*Capacités révélées* — authentification déléguée sans mot de passe stocké, invitation nominative à usage unique et expirable, création d'un espace vierge à la première connexion, **cloisonnement strict des relevés, du référentiel et des indicateurs**, consultation et retrait des membres.

### Journey 7 — Reprendre le décompte existant

*Ajouté le 2026-09-12, seconde passe. Il comble l'unique lacune de traçabilité relevée par la validation : FR58 portait un critère de succès chiffré sans qu'aucun parcours ne la mette en situation.*

**Scène d'ouverture.** Le foyer tient déjà ses comptes ailleurs, dans une application de partage de dépenses, et ce décompte **n'est pas à zéro**. Des mois d'avances croisées y sont accumulés. Repartir de zéro effacerait de l'argent réellement dû.

**Montée.** Le fondateur lit le solde affiché par l'outil tiers et le saisit dans l'application : un montant, une date, et surtout **un sens** — qui doit à qui. C'est le geste le plus dangereux du produit : un sens inversé transforme une créance en dette, l'écart vaut le double du solde, et rien à l'écran ne le signale. L'application redit donc la saisie en toutes lettres avant de l'enregistrer, sous la forme « à cette date, telle personne doit tel montant à telle autre ».

**Climax.** Pendant quelques semaines, les deux décomptes tournent en parallèle. Chaque dépense commune est saisie des deux côtés, et les deux soldes sont comparés. **Ils coïncident au centime, ou l'un des deux ment.**

**Résolution.** La confiance acquise, l'outil tiers est fermé. C'est le moment où le périmètre foyer est validé : pas à la livraison, mais quand personne ne rouvre l'autre application.

*Capacités révélées* — saisie d'un solde d'ouverture daté et orienté, relecture en toutes lettres avant enregistrement, comparaison des deux décomptes pendant la période de recouvrement.

Ce parcours porte l'indicateur « écart de 0 centime entre le solde du foyer et celui de l'outil tiers, pendant la période de recouvrement ». Sans lui, cet indicateur n'a aucun moment d'usage où se vérifier.

### Journey 8 — Poser la question au lieu de chercher l'écran

*Ajouté le 2026-09-12. Ce parcours est celui du **premier chantier** de la séquence, avant même le foyer.*

**Scène d'ouverture.** Une intuition, pas une requête : « j'ai l'impression qu'on mange dehors plus souvent qu'avant ». Aujourd'hui, vérifier ça demande d'ouvrir l'écran d'évolution, de choisir la bonne période, de trouver le bon poste, et de lire la courbe. Quatre gestes pour une question de dix mots.

**Montée.** Il ouvre le chat et écrit sa phrase telle quelle. L'agent choisit la période et le poste, interroge le moteur, et répond en français. **Sa réponse porte, visiblement, sur quoi elle repose** : les deux années comparées, le poste retenu.

**Climax.** Il enchaîne — « et y a-t-il un cycle là-dedans ? » — sans redonner le contexte. L'agent regarde la série mensuelle et décrit sa forme : un creux en janvier, deux pics. **Il décrit une forme, il ne fabrique aucun chiffre.** Chaque montant qu'il prononce vient du moteur.

**Résolution.** Un doute lui vient sur un montant. Il ouvre l'écran d'analyse depuis la réponse elle-même, et retrouve les lignes. La conversation reste là : il la rouvrira demain sans la reconstituer.

*Capacités révélées* — conversation ouvrable à volonté et reprise avec son contexte, question en langage ordinaire, réponse qui affiche sa période et son filtre, ouverture de l'écran correspondant depuis la réponse, refus explicite des questions hors de portée du moteur.

**Le cas qui définit le produit est celui où l'agent ne sait pas.** Comparer 2024 et 2026 n'est pas à sa portée : le moteur ne compare qu'à la période immédiatement précédente. Il doit le dire. Un agent qui bricole une réponse plausible dans ce cas détruit la confiance de toutes les autres, y compris les justes.

### Journey Requirements Summary

| Domaine | Capacités |
|---|---|
| **Ingestion** | Dépôt multiple · progression · dédup par hash · échec isolé sans tout arrêter · ingestion unitaire mensuelle |
| **Fiabilité** | Réconciliation au centime · état « non fiable » propagé · écart chiffré |
| **Référentiel** | Hiérarchie 2 niveaux · 3 natures · reclassement manuel catégorie **et** nature |
| **Analyse** | Répartition par période · évolution entre périodes · mois/trimestre/année · 4 indicateurs · déficit hors mouvements internes |
| **Traçabilité** | Descente agrégat → rubrique → poste → **transaction source** · origine d'une dépense saisie à la main identifiée partout |
| **Agent** | Chat ouvrable à volonté · conversation reprise avec son contexte · question en langage ordinaire · réponse portant sa période et son filtre · ouverture de l'écran source depuis la réponse · refus explicite hors de portée du moteur · aucun nombre non reçu |
| **Foyer** | Authentification déléguée · invitation expirable · cloisonnement strict entre membres · marquage d'une dépense comme commune · répartition à parts égales · saisie manuelle d'une dépense en espèces · solde « qui doit combien à qui » · règlement rattaché à sa ligne bancaire · **reprise d'un décompte existant, daté et orienté, relu avant enregistrement** |

La gestion du référentiel (créer, renommer, supprimer une catégorie) n'est pas traitée en parcours : la capacité existe déjà dans le socle et ne constitue pas un moment de valeur.

## Domain-Specific Requirements

> **Note de cadrage.** La table de référence BMad classe le domaine `general` en complexité `low`, ce qui déclencherait l'abandon de cette étape. Elle ne propose que deux cases : domaine régulé (`fintech` → KYC, PCI DSS) ou « exigences standard ». Ce produit n'est ni l'un ni l'autre : aucun régulateur, aucune certification, mais une exigence dure — **un chiffre faux est plus dangereux qu'un chiffre absent, parce qu'on le croit et qu'on décide dessus.** Cette section documente les contraintes réelles plutôt que des conformités fictives.

### Précision financière — pourquoi elle prime ici

Le produit ne calcule rien de complexe. Il additionne. Mais il additionne **2 400 transactions sur deux ans**, agrégées en rubriques, postes, ratios et cumuls — et l'utilisateur décide à partir du résultat.

Trois conséquences structurent le reste du document :

- **L'erreur en virgule flottante devient visible à cette échelle.** D'où l'arithmétique en centimes entiers (NFR1).
- **Un chiffre invérifiable est un chiffre dangereux.** L'utilisateur doit pouvoir remonter de n'importe quel agrégat jusqu'aux lignes de relevé qui le composent (NFR2). C'est le corollaire opérationnel de « le LLM ne calcule rien ».
- **Une part n'est pas un arrondi.** Une dépense commune partagée en deux parts égales doit redonner exactement son montant : sur 641,01 €, les parts valent 320,50 € et 320,51 €, jamais deux fois le même arrondi (NFR27). Le précédent existe déjà dans le produit, sur la coupe des virements du compte joint.
- **Une donnée fausse en entrée invalide tout ce qui suit.** D'où la réconciliation systématique contre le solde du relevé (NFR10-11), la déduplication par hash et la détection de période chevauchante — cette dernière devenant critique lors du dépôt de 24 fichiers d'un coup, dont certains peuvent être des re-téléchargements du même mois.

*Énoncés vérifiables : NFR1 à NFR4 (justesse), NFR10 à NFR13 (fiabilité des données).*

### Confidentialité des données — pourquoi c'est le différenciateur

Les agrégateurs du marché exigent les identifiants bancaires de l'utilisateur ou un accès Open Banking. Ce produit ne demande rien : il lit des PDF que l'utilisateur possède déjà, et **coupe leur bloc d'identité** — IBAN, RIB, numéro de compte, adresse — avant tout appel au fournisseur. Ce qui est transmis est le tableau d'opérations, libellés bancaires compris (NFR6).

Le changement de fournisseur (cf. **Dépendance LLM**) déplace cet argument d'un cran : l'inférence s'exécutant en Europe, les données transmises ne relèvent plus d'un régime juridique extra-européen. Ce n'est pas un détail d'implémentation — c'est la raison d'être du produit face à des alternatives gratuites et mieux finies.

**Inversion du 2026-09-12.** Le PRD posait jusqu'ici que l'absence d'authentification était cohérente avec ce cadre, l'application supposant un environnement local de confiance et mono-machine, et que toute exposition réseau rendrait l'authentification bloquante. **Cette exposition est décidée** : l'application tourne sur un serveur personnel joignable depuis Internet, et accueille un second utilisateur. La condition qui rendait l'authentification bloquante est remplie.

Trois conséquences :

- **L'identité est déléguée.** L'application ne stocke aucun mot de passe ni empreinte de mot de passe. Elle ne détient donc aucun secret d'authentification à protéger, à faire tourner ou à perdre. Le second facteur est celui du fournisseur d'identité. *(Décision retenue : Google. Le choix du fournisseur relève de l'architecture, l'exigence porte sur la délégation.)*
- **Le différenciateur se nuance sans s'effondrer.** Les relevés, la base et les montants restent sur la machine hôte. Ce qui sort en plus est l'identité des deux membres et leurs horaires de connexion. Aucune donnée financière ne transite par le fournisseur d'identité.
- **Le cloisonnement devient une exigence de sécurité, pas d'affichage.** Deux personnes accèdent à la même application. Un filtrage fait côté interface serait contournable ; la séparation est appliquée à chaque requête côté serveur.

*Énoncés vérifiables : NFR5 à NFR9, NFR24 à NFR26.*

### Modèle de domaine

Trois natures de mouvement, et la troisième est structurante :

| Nature | Entre dans le déficit ? | Exemples |
|---|---|---|
| **Recette** | Oui, au crédit | Salaire, remboursement Sécu, dividende |
| **Dépense** | Oui, au débit | Courses, loyer, essence |
| **Mouvement interne** | **Non** | Virement depuis/vers un livret, retrait d'espèces |

Hiérarchie à deux niveaux : **rubrique → poste**. Un même libellé de poste peut exister sous plusieurs rubriques — *Restaurant* sous *Alimentation* et sous *Voyages* — parce qu'il n'y recouvre pas la même dépense.

**Le déficit d'une période** = Σ dépenses − Σ recettes, **hors mouvements internes**. Le solde bancaire, lui, additionne tout, virements compris : les deux chiffres coexistent et répondent à deux questions différentes.

#### Le partage n'est pas une quatrième nature

Ajouté le 2026-09-12, et à ne surtout pas confondre avec ce qui précède. « Commune » est un **marquage porté par la transaction**, orthogonal à sa nature et à son poste. Une dépense commune reste une dépense, rangée dans le poste de celui qui l'a payée, et elle continue de peser dans son analyse à lui.

Le décompte du foyer est une **seconde lecture des mêmes lignes**, pas une nature de plus, et il ne modifie aucun montant en base.

Deux mécanismes voisins existent désormais, et leur confusion produirait des doubles comptages :

| Mécanisme | Ce qu'il traite | Effet |
|---|---|---|
| **Mouvement interne** | Virement entre deux comptes du **même** membre | Exclu du résultat, inclus dans le solde bancaire |
| **Dépense commune** | Dépense avancée par un membre **pour le foyer** | Inchangée dans son analyse ; portée au décompte du foyer |
| **Part du compte joint** | Virement reçu d'un compte joint déjà alimenté à parts égales | Coupé en deux avant agrégation, mécanisme **antérieur et distinct**, hors périmètre de cette révision |

La troisième ligne décrit une règle déjà en production. Elle traite des **remboursements depuis un compte commun alimenté d'avance**, là où le périmètre foyer traite des **dépenses avancées depuis un compte personnel**. Les deux coexistent sans fusionner — mais elles **communiquent**, et c'est le point ajouté le 2026-09-12 :

**Le compte joint est lui-même un mécanisme de règlement.** S'y rembourser d'une avance éteint la créance correspondante (FR63), puisque le compte est alimenté à parts égales. Le décompte du foyer ne porte donc **que ce que le compte joint ne solde pas** : les dépenses en espèces, les avances dont on ne s'est jamais remboursé, et les dépenses avancées par l'autre membre depuis son propre compte.

#### Le nombre cité — la frontière de l'agent

Ajouté le 2026-09-12. La NFR15 dit depuis l'origine que « le LLM n'effectue aucun calcul ». C'est une intention juste et **invérifiable** : aucun test ne sait constater qu'un modèle n'a pas calculé.

L'agent conversationnel en donne la forme opposable : **il ne peut citer qu'un nombre figurant tel quel dans ce qu'il a reçu du moteur.** Jamais un nombre dérivé.

La frontière se lit sur un exemple. Devant vingt-quatre totaux mensuels :

| Ce qu'il dit | Statut |
|---|---|
| « Tes dépenses gonflent en décembre et en juillet » | **Autorisé** — c'est une observation sur une forme, aucun nombre n'est produit |
| « Décembre 2025 a pesé 1 186,40 € » | **Autorisé** si ce montant est l'un des vingt-quatre reçus |
| « Ta moyenne de décembre est de 1 186 € » | **Interdit** — cette moyenne n'a été reçue de personne, donc elle a été fabriquée |
| « C'est 12 % de plus que l'an dernier » | **Interdit**, sauf si le moteur a fourni ce taux |

Décrire une forme est le métier de l'agent. Produire un nombre est le métier du moteur. La règle est vérifiable par test : comparer chaque nombre d'une réponse à l'ensemble des nombres reçus.

**Ce que l'agent transmet au fournisseur.** Il envoie des agrégats — libellés de rubriques et de postes, montants, périodes — et non des lignes de relevé. C'est moins exposé que l'ingestion, qui transmet des libellés bancaires bruts. Mais dès qu'une question porte sur des transactions précises, ce sont ces libellés bruts qui repartent, avec ce qu'ils contiennent de noms et de commerçants. Le périmètre de NFR6 est donc à trancher pour l'agent en même temps que pour l'ingestion.

#### Flux et stock

La distinction qui gouverne tout le périmètre, formulée par l'utilisateur le 2026-09-12 :

- **L'analyse mesure un flux** — ce qui est sorti du compte. Une dépense commune de 80 € y pèse **80 €**, parce que 80 € sont sortis.
- **Le décompte du foyer mesure un stock** — une créance. La même dépense y porte **40 €**, parce que c'est ce qui est dû.

Les deux chiffres sont justes et répondent à deux questions différentes. Les confondre, c'est soit amputer l'analyse de dépenses réellement payées, soit faire du décompte un double de l'analyse.

#### Deux origines de dépense

Une dépense entre désormais dans le produit par deux chemins, et la distinction est structurante :

| Origine | Réconciliée ? | Traçabilité |
|---|---|---|
| **Ligne de relevé** | Oui, au centime contre le solde du PDF | Jusqu'au libellé bancaire d'origine |
| **Saisie manuelle** (espèces) | **Non**, aucune ligne bancaire en face | Jusqu'à la saisie, identifiée comme telle |

Une saisie manuelle qui entrerait dans le périmètre de réconciliation ferait basculer son relevé en « non fiable » à chaque usage, et viderait l'alerte de son sens. Les deux jeux sont séparés (NFR28).

*(Toute la section « Spécificités françaises » du PRD v1 — SAS, exercice fiscal, IS, flat tax, ARE, loyer dirigeant, défraiements — disparaît avec le forecast.)*

### Suppression des disclaimers

**L'application n'affiche plus aucun avertissement « ceci n'est pas un conseil financier ».**

Justification : le disclaimer existait parce que l'app **simulait** — dividende à voter, fiscalité, projection à 24 mois. Une simulation produit un chiffre qui n'existe pas encore, sur lequel un utilisateur peut décider à tort. L'application **restitue** désormais des faits issus de relevés que l'utilisateur possède déjà. Elle ne produit aucune projection ni recommandation : il n'y a rien à avertir.

Éléments retirés (~220 lignes) : `AppDisclaimer.vue` (modal bloquant à la première visite), `stores/disclaimer.ts` et son test (flag `localStorage`), l'appel dans le layout, la note en pied de page, l'acquittement dans `tests/e2e/ingestion.spec.ts`. Le **gap G1** de `CLAUDE.md` (« persister le flag disclaimer vu ») disparaît du cadrage.

Effet collatéral : le pré-remplissage `pf_disclaimer_seen_v1` ajouté dans `playwright.config.ts` pour stabiliser les E2E devient sans objet. Le modal bloquait la première visite sur une application mono-utilisateur locale : il n'a jamais rien protégé, il imposait un geste.

## Web Application Specific Requirements

### Project-Type Overview

SPA Nuxt 4 (`ssr: false`) avec backend Nitro intégré. Application **multi-utilisateur, authentifiée**, hébergée sur un serveur personnel joignable depuis Internet. **Usage desktop exclusivement.** Pas de temps réel : l'ingestion est un traitement par lot déclenché par un dépôt de fichiers.

*(La section `seo_strategy` demandée par le gabarit BMad reste sans objet. L'application est joignable depuis Internet mais chaque écran est derrière l'authentification : il n'y a aucune page publique à indexer, et l'indexation doit être refusée.)*

### Browser Matrix

| Navigateur | Support V1 |
|---|---|
| Chrome / Chromium | supporté, couvert par les E2E |
| **Firefox** | **supporté**, non couvert par les E2E sur le poste actuel |
| Safari | non supporté |
| Edge | non testé |

⚠️ **Limite d'outillage connue.** Playwright ne fournit pas de binaire Firefox pour `ubuntu26.04-x64` (`ERROR: Playwright does not support firefox on ubuntu26.04-x64`), et le binaire présent sur le poste est corrompu. La couverture automatisée Firefox est donc impossible sur la machine de développement actuelle. Le support reste un **engagement produit** ; le mode de vérification est à trancher — contrôle manuel, conteneur, ou autre machine.

*Note historique : Firefox avait été retiré du scope le 2026-09-04 au matin. Ce retrait traduisait une impasse technique transformée à tort en décision de périmètre. Décision annulée le même jour.*

### Responsive Design

**Conception desktop uniquement.** Aucun écran n'est conçu ni validé pour une consultation mobile.

Constat sans engagement : la recette du 2026-09-04 a vérifié que les pages ne débordent pas en 390 px — zéro scroll horizontal, aucun contrôle recouvert. Ce n'est pas une cible et ne sera pas maintenu activement.

**Tension assumée du 2026-09-12.** La saisie d'une dépense en espèces se fait naturellement au moment où elle a lieu, donc depuis un téléphone. Le desktop exclusif impose une **saisie rétrospective**, le soir, de mémoire ou d'après un ticket conservé. C'est une dégradation réelle de l'usage et le principal risque d'abandon du périmètre foyer.

La décision est de **ne pas** ouvrir le chantier mobile dans cette révision. L'application progressive installable sur téléphone est portée en Phase 3 Vision, où elle est désormais la capacité principale. Conséquence de conception à retenir dès maintenant : l'écran de saisie manuelle doit rester tenable dans une colonne étroite, faute de quoi le passage en application progressive imposera de le réécrire.

Conséquence sur la conception : la descente **rubrique → poste → transaction** peut occuper l'écran en largeur sans contrainte d'empilement.

### Performance Targets

**Aucune cible chiffrée en V1.** Les trois NFR de performance du PRD v1 sont supprimées : deux portaient sur le forecast, la troisième (ingestion ≤ 30 s) dépend d'un fournisseur LLM qui a changé et n'a jamais été mesurée avec GLM-5.2.

Point de vigilance à **mesurer** lors de la première ingestion réelle, sans engagement : l'agrégation de ~2 400 transactions à chaque changement de période. Une lenteur ici casserait le rituel mensuel du Journey 3, donc le critère de succès d'usage.

### Accessibility

**Pas de niveau WCAG visé.** Sur une application mono-utilisateur locale, viser AA relèverait de la conformité décorative — il n'y a personne à qui rendre des comptes.

En revanche, trois règles s'appliquent, issues de défauts **réellement constatés** lors de la recette visuelle du 2026-09-04 — chacune ayant produit un bug qu'aucun des 476 tests unitaires ni des 9 E2E n'avait vu :

- un bouton `disabled` rendait un garde-fou clavier inatteignable et sa raison de blocage inaudible ;
- désactiver un élément focalisé faisait retomber le focus sur `<body>` à chaque renommage.

Ces règles ne relèvent pas de la conformité mais de l'usage réel du produit par son unique utilisateur.

*Énoncés vérifiables : NFR18 à NFR20.*

### Implementation Considerations

Socle technique en place et conservé : SPA Nuxt 4, Nitro, SQLite + Drizzle, Zod, Vitest + Playwright, CSS vanilla sans framework.

Les graphiques sont produits en **SVG inline, sans bibliothèque tierce** — précédent établi par `ForecastChart.vue`, dont le composant disparaît avec le forecast mais dont l'approche reste valable.

## Project Scoping & Phased Development

### Ordre des chantiers — à lire avant les phases

*Ajouté le 2026-09-12.*

⚠️ **Les numéros de phase de ce document sont historiques, pas chronologiques.** Ils disent dans quel ordre les périmètres ont été écrits, pas dans quel ordre ils seront construits. L'ordre qui fait foi est celui-ci :

| Rang | Chantier | Où il est décrit | État |
|---|---|---|---|
| **1** | **L'agent conversationnel** | Journey 8, FR65 à FR72, NFR31 à NFR33 | cadré le 2026-09-12, à découper |
| **2** | **Le foyer** | « Phase 1 bis », Journeys 5 à 7, FR44 à FR64 | découpé en epics 22 à 25 |
| **3** | **Le forecast** | non cadré | hors de ce document à ce jour |

**Pourquoi l'agent passe devant le foyer.** Il coûte moins cher, il sert dès le premier jour, et il ne dépend de rien. Le foyer a son propre moteur — le déploiement et l'arrivée d'un second membre — mais cette échéance n'est pas immédiate.

**Le prix de cet ordre, et sa parade.** L'agent sera construit alors que l'application est encore mono-utilisateur, et devra apprendre le cloisonnement quand le foyer arrivera. Ce rattrapage est **gratuit à une condition** : l'agent n'accède à la base par aucun chemin, il passe exclusivement par les endpoints d'analyse, qui sont l'endroit où le cloisonnement se posera de toute façon (NFR32). S'il court-circuite cette frontière pour aller plus vite, il faudra le rouvrir entièrement.

**Le forecast en dernier, et sous condition.** Il revient au périmètre après avoir été supprimé le 2026-09-04 avec environ 8 830 lignes. La règle qui le rend viable cette fois : **une projection se dérive de l'historique mesuré et doit être utilisable sans aucune saisie.** Une saisie est un ajout ponctuel de scénario, jamais un prérequis. Le forecast v1 n'est pas mort parce que projeter serait une mauvaise idée, mais parce qu'il fallait déclarer ses charges à la main, c'est-à-dire le mal qui avait déjà tué le tableur. Il fera l'objet d'un amendement propre, avec un jalon de décision sur le modèle de l'epic 14.

### MVP Strategy & Philosophy

**Approche : MVP de résolution de problème.** Le minimum qui fait dire « c'est utile » est identifié sans ambiguïté — c'est le tableur, en automatique. Pas de MVP d'expérience ni de plateforme : il n'y a ni marché à valider, ni utilisateur à convaincre.

**Ressources :** un développeur, assisté d'agents. Pas d'équipe, pas de délai contraint, pas de budget LLM plafonné.

**Le chemin le plus court vers l'apprentissage validé** est l'ingestion des 24 relevés réels. Tout le reste n'est jugeable qu'après.

### Séquencement du MVP — et pourquoi il n'est pas négociable

Trois changements arrivent simultanément sur le composant le plus fragile du produit :

| Changement | Effet sur la catégorisation |
|---|---|
| Fournisseur : Anthropic → **GLM-5.2** | Modèle inconnu sur cette tâche |
| Référentiel : 19 catégories plates → **48 postes hiérarchisés** | Tâche nettement plus dure — deux fois plus de cibles, plus un choix de rubrique |
| Barre de qualité : « acceptée » → **≤ 10 % de corrections** | Exigence stricte là où il n'y en avait aucune |

On durcit l'exigence, on complexifie la tâche et on change de moteur en même temps. Si le taux de correction dépasse 10 %, on ne saura pas lequel des trois est en cause — et c'est le cœur du produit : si la catégorisation ne tient pas, la corvée revient et l'utilisateur décroche, exactement comme il a décroché du tableur.

D'où l'ordre imposé :

```
1. Suppression du périmètre mort           (~8 830 lignes)
2. Nouveau référentiel : 2 niveaux + 3 natures
3. Bascule LLM vers GLM-5.2
4. Ingestion en masse des 24 relevés réels
   → MESURE DU TAUX DE CORRECTION RÉEL
   ─────────────── JALON DE DÉCISION ───────────────
5. Moteur d'agrégats + 4 indicateurs
6. Vue répartition + descente jusqu'à la transaction
7. Vue évolution + sélecteur de période
```

L'étape 4 est un **jalon de décision**, pas une étape ordinaire. Si le taux dépasse 10 %, le développement s'arrête et l'on ajuste — modèle, prompt, ou référentiel moins fin — **avant** de construire des écrans par-dessus une donnée mal rangée. Un graphique de répartition n'est pas validable tant que les lignes sont dans les mauvaises cases.

> ✅ **Jalon franchi le 2026-09-05.** Le taux de repli mesuré sur l'ingestion réelle est passé de 13,0 % à 10,1 % après introduction des règles de classement (FR40-FR43). Cette séquence est historique : elle est conservée pour la traçabilité de la décision, elle ne pilote plus le développement. La séquence en vigueur est celle de la **Phase 1 bis**.

### MVP Feature Set (Phase 1)

**Parcours couverts :** Journey 1 (rattrapage), Journey 2 (pourquoi ce mois est dans le rouge), Journey 3 (cycle mensuel), Journey 4 (récupération d'erreur). Les quatre sans exception — ils décrivent le produit minimal.

**Capacités indispensables :**

- Suppression du périmètre forecast / SAS / dettes / fiscalité / disclaimers
- Référentiel à 2 niveaux (13 rubriques, 48 postes) et 3 natures de mouvement — dont une rubrique **Mouvements internes**, sans laquelle la troisième nature n'a aucune destination et le Journey 4 est impossible
- Bascule du fournisseur LLM vers Mistral / GLM-5.2, sorties structurées validées
- Ingestion en masse : dépôt multiple, progression, déduplication par hash, échec isolé
- **Jalon de mesure du taux de correction manuelle**
- Moteur d'agrégats : période × nature × rubrique × poste, hors mouvements internes
- Les 4 indicateurs : trésorerie mensuelle, taux de dépense, trésorerie cumulée, taux d'épargne
- Vue répartition avec descente agrégat → rubrique → poste → **transaction source**
- Vue évolution entre périodes, granularités mois / trimestre / année
- Correction manuelle d'une transaction : catégorie **et nature**

### Phase 1 bis — Le foyer

Ajoutée le 2026-09-12. ⚠️ **Cette étiquette est historique, pas chronologique** : le foyer est le **deuxième** chantier, l'agent conversationnel passant devant. Voir « Ordre des chantiers » en tête de cette section. *(Rédaction précédente, devenue fausse le jour même : « Elle suit la Phase 1 […] et précède les phases 2 et 3. »)*

**Parcours couverts :** Journey 5 (la dépense commune, du ticket au règlement), Journey 6 (rejoindre le foyer) et Journey 7 (reprendre le décompte existant).

**Capacités indispensables :**

- Authentification déléguée à un fournisseur d'identité externe, sans mot de passe stocké
- Notion de foyer, invitation nominative expirable, retrait d'un membre
- Cloisonnement strict des relevés, transactions, référentiel et indicateurs entre membres
- Marquage d'une transaction comme dépense commune, répartie à parts égales
- Saisie manuelle d'une dépense en espèces, hors périmètre de réconciliation
- Solde d'ouverture du foyer, daté, orienté et relu avant enregistrement, pour reprendre un décompte tenu ailleurs
- Sauvegarde quotidienne sur une seconde machine du réseau local, restauration vérifiée
- Solde « qui doit combien à qui », traçable jusqu'aux dépenses sources, ne portant que ce que le compte joint ne solde pas
- Visibilité partagée des seules dépenses marquées communes
- Enregistrement d'un règlement et **rattachement à la ligne bancaire qui le porte**
- Sauvegarde de la base, devenue obligatoire (NFR12)

**Séquencement imposé.** L'ordre n'est pas libre, pour la même raison qu'en Phase 1 : une migration de données faite deux fois coûte plus qu'une migration faite une fois.

```
1. Identité, foyer, propriété des données        → migration unique de l'historique
2. Cloisonnement vérifié par test
3. Sauvegarde de la base                          → avant toute exposition réseau
   ─────────────── PORTE D'EXPOSITION ───────────────
4. Marquage « commune » + répartition à parts égales
5. Saisie manuelle des dépenses en espèces
6. Solde d'ouverture + « qui doit combien à qui »
7. Règlement + rattachement à la ligne bancaire
```

L'étape 3 est une **porte, pas une étape ordinaire.** L'application n'est exposée sur Internet qu'une fois le cloisonnement testé et la sauvegarde en place. Exposer avant, c'est accepter de perdre des données qu'aucun PDF ne permet plus de reconstruire.

L'étape 7 ne se reporte pas. Sans elle, chaque remboursement gonfle les recettes de celui qui l'encaisse et le solde du foyer ne retombe jamais à zéro. Un décompte qui ne se solde pas ne remplace pas l'outil tiers, il s'y ajoute.

### Post-MVP Features

**Phase 2 — Croissance.** Détection des dépenses récurrentes via `charge-suggester` repositionné · comparaison explicite de deux périodes (FR39), que l'agent conversationnel ne sait pas contourner et doit refuser tant qu'elle n'existe pas.

*(L'analyse narrative par LLM quitte cette phase le 2026-09-12 : absorbée par l'agent conversationnel, elle est livrée au **premier** chantier et non en croissance ultérieure.)*

**Phase 3 — Vision.** **Application progressive installable sur téléphone**, qui rend la saisie d'une dépense en espèces contemporaine de la dépense — capacité principale de cette phase depuis le 2026-09-12 · second compte bancaire (Crédit Mutuel) et extraction paramétrée par banque · objectifs de dépense par catégorie · parts inégales entre membres du foyer · sauvegarde chiffrée hors site, seule protection contre le sinistre du logement · export des données d'un membre, qui conditionne le traitement du retrait d'un membre.

*(« Répartition des dépenses communes avec un conjoint » quitte la Phase 3 : elle est entrée en Phase 1 bis.)*

### Risk Mitigation Strategy

Table unique des risques du projet — techniques, d'usage et de ressources confondus, classés par gravité.

| Risque | Gravité | Mitigation |
|---|---|---|
| **Sorties structurées non supportées par GLM-5.2** | Bloquante | NFR14 tombe, les montants deviennent invérifiables, le critère « zéro chiffre non traçable » est intenable. **À valider avant tout développement.** |
| **Catégorisation médiocre → la corvée revient** | Critique | Trois changements simultanés (fournisseur, référentiel plus fin, seuil strict) sur le composant central. Jalon de mesure du taux de correction placé **avant** la construction des écrans. FR24 rend le seuil observable. |
| **LLM qui invente un montant** | Critique | Le LLM ne calcule rien (NFR15) · sorties structurées (NFR14) · réconciliation contre le solde du relevé (NFR10) |
| **Mouvement interne compté en recette → déficit masqué** | Élevée | Troisième nature exclue du calcul (NFR4) · reclassement manuel possible (FR22) |
| **Le tableur est rouvert** | Élevée | C'est l'échec produit. Mesure à 3 mois ; si le tableur ressort, identifier ce qu'il apportait que l'application n'apporte pas — plutôt que d'ajouter des fonctionnalités au hasard. |
| **Erreur d'arithmétique sur les agrégats** | Élevée | Centimes entiers (NFR1) · tests des fonctions de calcul (NFR3) · traçabilité jusqu'à la ligne (NFR2) |
| **Double ingestion sur un dépôt de 24 fichiers** | Moyenne | Hash SHA-256 (FR5) · détection de chevauchement de période (FR6) |
| **Un relevé échoue et bloque toute l'ingestion** | Moyenne | Échec isolé par fichier, la file continue (FR3, NFR13) |
| **Référentiel trop fin pour le modèle** | Moyenne | Repli : conserver les 13 rubriques, alléger les postes. Le détail se perd, la lecture reste. |
| **Volume d'ingestion problématique** | Faible | Repli : traiter par lots plutôt que les 24 relevés d'un coup |
| **Perte de la base de données** | Faible | Acceptée — reconstructible depuis les relevés conservés (NFR12) |
| **Fuite de la clé d'API** | Faible | `.env` gitignored, jamais journalisée (NFR8) |
| **Données d'un membre visibles par un autre** | Bloquante | Ajouté le 2026-09-12. Cloisonnement appliqué côté serveur à chaque requête, jamais par filtrage d'affichage (NFR24) · vérifié par test, pas par revue d'écran · porte d'exposition franchie seulement après ces tests |
| **Règlement compté deux fois** | Critique | Ajouté le 2026-09-12. Le virement de remboursement arrive dans le relevé de celui qui l'encaisse et s'y lit comme une recette. Sans rattachement à son règlement (FR60), les recettes sont gonflées et la dette ne s'éteint jamais. Version large du défaut qui a produit la coupe du compte joint |
| **Saisie en espèces qui pollue la réconciliation** | Critique | Ajouté le 2026-09-12. Une dépense sans ligne bancaire en face ferait basculer son relevé en « non fiable » à chaque usage, vidant l'alerte de son sens. Deux jeux de données séparés, exigence et non décision d'implémentation (FR54, NFR28) |
| **Perte de la base devenue irréparable** | Élevée | Ajouté le 2026-09-12. Saisies en espèces, marquages « commune », solde d'ouverture et règlements n'existent dans aucun PDF. NFR12 est inversée : la sauvegarde devient obligatoire et précède l'exposition réseau |
| **Exposition sur Internet d'une application sans historique de sécurité** | Élevée | Ajouté le 2026-09-12. Identité déléguée, donc aucun secret d'authentification détenu (NFR25) · canal chiffré obligatoire (NFR26) · aucune page publique, indexation refusée |
| **Agent répondant avec assurance sur la mauvaise période** | Critique | Ajouté le 2026-09-12. Plus dangereux qu'une erreur visible : la réponse est plausible et rien ne signale qu'elle porte sur autre chose que ce qui était demandé. Mitigation : toute réponse **affiche** sa période et son filtre, et ouvre l'écran correspondant (FR68) |
| **Agent fabriquant un montant** | Critique | Ajouté le 2026-09-12. NFR15 dit que le modèle ne calcule pas, ce qu'aucun test ne sait vérifier. NFR31 en donne la forme opposable : aucun nombre cité qui ne figure tel quel dans ce qui a été reçu. Vérifiable par test |
| **Agent bricolant une réponse hors de portée du moteur** | Élevée | Ajouté le 2026-09-12. Le moteur ne compare qu'à la période immédiatement précédente ; une question sur deux périodes quelconques n'a pas de réponse (FR39, Phase 2). L'agent doit le **dire** (FR69). Un agent qui invente dans ce cas détruit la confiance dans toutes ses réponses, y compris les justes |
| **Dépendance quotidienne au fournisseur LLM** | Moyenne | Ajouté le 2026-09-12. L'indisponibilité ne retarde plus un import mensuel, elle ferme une consultation quotidienne. Mitigation : l'agent échoue proprement, tout le reste de l'application reste intact (NFR17 étendue) |
| **Saisie en espèces jamais faite parce qu'elle exige un écran de bureau** | Élevée | Ajouté le 2026-09-12. Principal risque d'abandon du périmètre foyer. Aucune mitigation en Phase 1 bis : l'application progressive est portée en Phase 3 et la dégradation est assumée. À mesurer — si les dépenses en espèces ne sont pas saisies, l'outil tiers restera ouvert |

## Dépendance LLM

Le fournisseur passe d'Anthropic à **Mistral**, sur le modèle **GLM-5.2** (Z.ai), hébergé par Mistral avec **inférence en Europe** depuis août 2026. Contexte d'1 M tokens, tarif indicatif 1,40 $/M en entrée et 4,40 $/M en sortie.

Conséquences :

- **Renforcement du différenciateur** : les données transmises ne quittent plus l'Union européenne. L'argument passe de « on limite ce qui sort » à « ce qui sort reste sous régime européen ».
- **Le point d'entrée unique reste `server/services/llm-categorizer.ts`** (NFR16). Le changement de fournisseur est confiné à ce fichier — c'est le bénéfice direct de la boundary posée en story 2.4.
- ⚠️ **À VALIDER avant développement** : le support des **sorties structurées contraintes par schéma**. NFR14 en dépend entièrement — « répondre en JSON » ne suffit pas, il faut une contrainte appliquée au décodage. Si le support est absent ou partiel, la fiabilité des montants est en jeu et le critère de succès technique « zéro chiffre non traçable » devient intenable. Point d'architecture à trancher avec l'architecte.
- Le contexte d'1 M tokens rend envisageable l'ingestion de plusieurs relevés en un seul appel, ce qui sert directement l'ingestion en masse de l'historique.

**La dépendance s'élargit le 2026-09-12.** Jusqu'ici le fournisseur n'était sollicité qu'à l'ingestion, un geste mensuel. L'agent conversationnel en fait une dépendance **quotidienne** et visible : son indisponibilité ne retarde plus un import, elle ferme une fonctionnalité de consultation. NFR17 est étendue en conséquence — l'agent échoue proprement avec un message explicite, et **toutes les autres capacités restent intactes**, l'analyse comme les écrans ne dépendant d'aucun appel au fournisseur.

Un second point d'entrée apparaît donc à côté de `llm-categorizer`. NFR16 continue de s'appliquer : le SDK du fournisseur reste confiné, et l'agent ne l'importe pas directement.

**Même fournisseur, mêmes contraintes, paramètres séparés.** L'agent ne crée pas de second fournisseur : NFR7 lui impose l'inférence en Europe comme à l'ingestion. Mais les deux usages n'attendent pas la même chose du modèle, et leurs paramètres sont donc distincts et lus depuis la configuration (NFR34).

⚠️ **À valider avant développement, au même titre que les sorties structurées l'ont été avant l'epic 13.** L'agent doit choisir une période, une granularité et une cible avant d'interroger le moteur. Ce mécanisme repose sur la même fondation que les sorties structurées, dont D20 a établi qu'elles sont **injectées dans le prompt et non contraintes au décodage**. Si le schéma n'est qu'une instruction, le choix de la période l'est aussi — et c'est exactement là que loge le risque de répondre avec assurance sur la mauvaise période.

**La parade est de conception, pas de modèle.** L'agent ne choisit pas librement : il remplit une **requête structurée** que l'application valide avant de l'exécuter. Une période absurde est rejetée par le code, pas par la bonne volonté du modèle. Combiné à FR68, qui impose d'afficher la période retenue, ce design tient même avec un modèle médiocre sur ce point, et s'améliore si le modèle est bon.

Deux capacités restent à juger à l'usage, sans test automatique possible : la tenue d'une conversation sur plusieurs tours, et la qualité du français produit. Aucune n'a jamais été éprouvée sur ce modèle, qui ne produit aujourd'hui que des codes de poste. Une déception à la lecture est un signal pour rouvrir D20, pas pour retoucher le prompt indéfiniment.


## Functional Requirements

> **Contrat de capacités.** Ce qui ne figure pas ici n'existera pas dans le produit. Le PRD v1 comptait 71 FRs pour un périmètre qui s'est révélé faux ; celui-ci en compte 72 : 21 pour le foyer et 8 pour l'agent conversationnel, toutes ajoutées le 2026-09-12, plus 2 restées en Phase 2 (FR38 et FR39, FR37 ayant été absorbée par l'agent).

### Ingestion des relevés

- **FR1** — L'utilisateur peut déposer plusieurs relevés PDF en une seule opération.
- **FR2** — L'utilisateur peut suivre la progression du traitement, fichier par fichier.
- **FR3** — Un relevé dont le traitement échoue n'interrompt pas celui des autres fichiers de la file.
- **FR4** — L'utilisateur peut consulter la cause d'échec de chaque relevé non traité.
- **FR5** — Le système rejette un relevé dont le contenu a déjà été ingéré, et l'indique.
- **FR6** — Le système détecte qu'un relevé couvre une période déjà ingérée et demande à l'utilisateur de remplacer ou d'annuler.
- **FR7** — L'utilisateur peut déposer un relevé isolé, hors ingestion en masse.
- **FR8** — L'utilisateur peut consulter la liste des relevés ingérés, avec leur période et leur état de fiabilité.
- **FR9** — L'utilisateur peut supprimer un relevé ingéré ainsi que les transactions qui en proviennent.

### Fiabilité et réconciliation

- **FR10** — Le système vérifie, à chaque ingestion, que le solde initial augmenté des transactions correspond au solde final du relevé.
- **FR11** — Le système marque « non fiable » tout relevé présentant un écart, et expose le montant de cet écart.
- **FR12** — L'état « non fiable » est visible partout où le relevé concerné contribue à un agrégat affiché.
- **FR13** — L'utilisateur peut ajouter manuellement une transaction absente d'un relevé pour résorber un écart.
- **FR14** — L'utilisateur peut accepter un écart, le relevé conservant alors son état « non fiable ».

### Référentiel de catégories

- **FR15** — L'utilisateur peut consulter le référentiel organisé en rubriques et en postes.
- **FR16** — L'utilisateur peut créer, renommer et supprimer une rubrique comme un poste.
- **FR17** — Chaque poste porte une nature : recette, dépense ou mouvement interne.
- **FR18** — Le système empêche la suppression d'un poste référencé par des transactions et indique combien.
- **FR19** — Un même libellé de poste peut exister sous plusieurs rubriques distinctes.

### Catégorisation et correction

- **FR20** — Le système attribue automatiquement un poste à chaque transaction lors de l'ingestion.
- **FR21** — L'utilisateur peut reclasser une transaction vers un autre poste.
- **FR22** — L'utilisateur peut corriger la nature d'une transaction en la déplaçant vers un poste d'une autre nature. *(Reformulé le 2026-09-04 : la décision d'architecture D17 porte la nature exclusivement sur le poste, ce qui rend la rédaction initiale — « indépendamment de son poste » — insatisfaisable.)*
- **FR23** — Toute correction met à jour immédiatement les agrégats et indicateurs qui en dépendent.
- **FR24** — L'utilisateur peut consulter la proportion de transactions qu'il a corrigées manuellement, par relevé.

### Analyse — répartition

- **FR25** — L'utilisateur peut sélectionner une période d'analyse au mois, au trimestre ou à l'année.
- **FR26** — L'utilisateur peut visualiser la répartition des dépenses par rubrique sur la période choisie.
- **FR27** — L'utilisateur peut visualiser la répartition des recettes sur la période choisie.
- **FR28** — L'utilisateur peut déplier une rubrique pour voir la répartition entre ses postes.
- **FR29** — Les totaux de recettes et de dépenses excluent les mouvements internes.
- **FR30** — L'utilisateur peut consulter les mouvements internes de la période, séparément des recettes et des dépenses.

### Analyse — évolution et indicateurs

- **FR31** — L'utilisateur peut visualiser l'évolution d'une rubrique ou d'un poste **à l'intérieur d'une période qu'il choisit** : un trimestre, une année, ou l'historique complet. Le découpage de la série est toujours le **mois**, quelle que soit la période regardée. *(Réécrite le 2026-09-12. Rédaction précédente : « sur plusieurs périodes consécutives », qui ne disait ni combien de périodes, ni qui choisissait la fenêtre. L'énoncé décrit désormais le comportement livré le 2026-09-07 : le sélecteur désigne **ce qu'on regarde**, et non le pas de la série — choisir « Année » donne les douze mois de cette année, pas douze années.)*
- **FR32** — L'utilisateur peut consulter, pour une période, la trésorerie de la période, le taux de dépense, la trésorerie cumulée et le taux d'épargne.
- **FR33** — L'utilisateur peut identifier immédiatement si une période est déficitaire.
- **FR34** — L'utilisateur peut voir, pour une période déficitaire, quelles rubriques ont le plus varié par rapport à la période précédente.

### Traçabilité

- **FR35** — L'utilisateur peut descendre d'un montant agrégé jusqu'aux transactions qui le composent.
- **FR36** — L'utilisateur peut consulter le libellé bancaire d'origine d'une transaction et le relevé dont elle provient.

### Règles de classement

- **FR40** — L'utilisateur peut définir des règles qui rangent automatiquement dans un poste tout libellé contenant un motif donné.
- **FR41** — Une règle s'applique à l'ingestion, par-dessus la catégorisation automatique, et l'écrase.
- **FR42** — L'utilisateur peut consulter, pour chaque règle, le nombre de transactions déjà en base qu'elle couvre.
- **FR43** — Après une correction manuelle, le système propose de créer une règle à partir du commerçant du libellé, et l'utilisateur peut ajuster le motif avant de l'accepter.

*Ajoutées le 2026-09-05, après mesure. Elles ne figuraient pas au cadrage : c'est la première ingestion réelle qui les a rendues nécessaires. Sur quatre occurrences d'un même libellé (`VIR INST SOCIETEX`, les remboursements de compte courant de la SASU de l'utilisateur), le modèle en avait classé trois en repli et une ailleurs — non par faiblesse, mais parce que rien ne pouvait lui apprendre ce que ce libellé désigne. Les libellés bancaires étant très répétitifs, une règle écrite une fois vaut pour toutes leurs occurrences futures, sans token et sans hasard. Effet mesuré : le taux de repli passe de 13,0 % à 10,1 %.*

*Le motif est une sous-chaîne, jamais une expression régulière : dans un outil personnel, une regex échoue silencieusement et se débogue mal, pour un gain nul sur des libellés qui sont des chaînes fixes.*

*FR42 n'est pas un confort d'affichage. Le 2026-09-05, une règle « DUPONT Jean » — a priori évidente puisqu'il s'agit du titulaire — annonçait **106 lignes couvertes**. L'inspection a montré qu'elle aurait rangé en mouvement interne 7 604 € de remboursement d'emprunt et 4 296 € de charges, c'est-à-dire fait disparaître 14 300 € de dépenses réelles. Le compteur a arrêté la règle avant qu'elle ne serve. Une règle qui couvre beaucoup de lignes doit être regardée, pas célébrée.*

*FR43 propose, ne décide pas. Toutes les corrections ne se généralisent pas : déplacer un restaurant vers la rubrique Voyages vaut pour ce séjour-là, pas pour le bistrot du coin. Et le motif est éditable, parce qu'aucune extraction ne peut deviner si le suffixe d'un libellé appartient au nom de l'enseigne (`BOULANGERIE EX 2`) ou au numéro de terminal (`CDISCOUNT 4`).*

### Identité et foyer

*Ajoutées le 2026-09-12. Phase 1 bis.*

- **FR44** — L'utilisateur s'authentifie auprès de l'application via un fournisseur d'identité externe. L'application ne stocke ni mot de passe ni empreinte de mot de passe.
- **FR45** — Le fondateur du foyer peut inviter une personne en désignant son adresse. L'invitation est à usage unique et expire sous 7 jours si elle n'est pas acceptée.
- **FR46** — Une personne invitée rejoint le foyer à sa première connexion, dans un espace vierge : aucun relevé, aucune transaction, aucun référentiel hérité d'un autre membre.
- **FR47** — L'utilisateur peut consulter la liste des membres de son foyer.
- **FR48** — Le fondateur peut retirer un membre du foyer. Le retrait est refusé tant que le solde de ce membre n'est pas nul, et le système indique le montant restant.
- **FR49** — Un membre ne peut accéder ni aux relevés, ni aux transactions, ni au référentiel, ni aux indicateurs d'un autre membre. **Seule exception : les dépenses marquées communes (FR64).**

### Dépenses communes

*Ajoutées le 2026-09-12. Phase 1 bis.*

- **FR50** — L'utilisateur peut marquer une transaction de son relevé comme dépense commune du foyer, depuis l'écran où elle est déjà affichée. Le marquage indique explicitement qu'il **rend cette dépense visible à l'autre membre** (FR64).
- **FR51** — Une dépense commune est répartie à parts égales entre les membres du foyer, la somme des parts étant égale au montant de la dépense au centime.
- **FR52** — Une dépense commune reste rangée dans le poste du référentiel de celui qui l'a payée et continue de peser dans son analyse. Elle n'apparaît dans le référentiel d'aucun autre membre.
- **FR53** — L'utilisateur peut retirer le marquage « commune » d'une transaction, le solde du foyer étant recalculé immédiatement.

### Saisie manuelle des dépenses en espèces

*Ajoutées le 2026-09-12. Phase 1 bis.*

- **FR54** — L'utilisateur peut saisir une dépense réglée en espèces, avec sa date, son libellé, son montant et son poste.
- **FR55** — Une dépense saisie manuellement n'entre dans la réconciliation d'aucun relevé et ne peut faire basculer aucun relevé en état « non fiable ».
- **FR56** — Une dépense saisie manuellement est identifiée comme telle partout où elle contribue à un montant affiché.
- **FR57** — L'utilisateur peut modifier et supprimer une dépense qu'il a lui-même saisie.

### Solde du foyer et règlement

*Ajoutées le 2026-09-12. Phase 1 bis.*

- **FR58** — Le fondateur peut saisir un solde d'ouverture du foyer, avec sa date et son sens, pour reprendre un décompte tenu jusque-là dans un outil tiers. Avant enregistrement, le système redit la saisie en toutes lettres — qui doit quel montant à qui, à quelle date — et exige une confirmation. *(Relecture ajoutée le 2026-09-12 : un sens inversé produit un écart valant le double du solde, qu'aucun autre contrôle ne rattrape. Tracée au Journey 7.)*
- **FR59** — L'utilisateur peut consulter qui doit combien à qui, à tout moment.
- **FR60** — L'utilisateur peut descendre du solde du foyer jusqu'aux dépenses qui le composent, chacune identifiée comme ligne de relevé ou comme saisie manuelle.
- **FR61** — L'utilisateur peut enregistrer un règlement entre deux membres, qui réduit leur solde du montant réglé.
- **FR62** — L'utilisateur peut rattacher un règlement à la transaction de son relevé qui le porte. La transaction rattachée n'est alors comptée ni en recette ni en dépense de sa période.
- **FR63** — Une dépense commune dont l'avance est couverte par un remboursement déjà rattaché — notamment un virement reçu du compte joint — **n'alimente plus le décompte du foyer**. Le décompte ne contient que les dépenses communes qui n'ont pas été soldées par ailleurs. *(Ajoutée le 2026-09-12, seconde passe de découpage.)*
- **FR64** — Une dépense marquée commune est visible des **deux** membres : sa date, son libellé, son montant et son payeur. Elle reste absente du référentiel et de l'analyse de celui qui ne l'a pas payée. C'est la seule exception au cloisonnement de FR49.

*Le foyer compte 21 FRs pour un périmètre qui pourrait sembler tenir en une phrase. Trois d'entre elles portent l'essentiel du risque. **FR51** garantit qu'un partage ne perd pas de centime, faute de quoi le solde dérive sans que personne ne sache pourquoi. **FR55** empêche la saisie en espèces de contaminer l'invariant de réconciliation, seul mécanisme de confiance du produit. **FR62** empêche le double comptage du règlement : sans elle, le décompte ne se solde jamais et l'outil tiers reste ouvert, ce qui est la définition de l'échec du périmètre.*

*FR63 et FR64 sont nées d'un examen du 2026-09-12, pendant le découpage en stories. Elles corrigent deux défauts que le PRD portait sans le savoir.*

*Sans **FR63**, le décompte gonflerait indéfiniment : chaque dépense commune que le payeur s'est déjà remboursée depuis le compte joint resterait comptée comme une créance. Le compte joint étant alimenté à parts égales, s'y rembourser de 80 € revient à prendre 40 € de son propre argent et 40 € de celui de l'autre : la créance est éteinte. **Pour tout ce qui transite par le compte joint, le règlement est automatique** — le décompte du foyer ne sert qu'à ce qui lui échappe : les espèces, les avances jamais remboursées, et les dépenses avancées par l'autre membre depuis son propre compte. Le lien se fait par le mécanisme de regroupement livré à l'epic 19 : un groupe éteint la créance en même temps qu'il neutralise l'avance dans l'analyse. Un seul geste, deux effets cohérents, aucune désynchronisation possible.*

*Sans **FR64**, deux exigences se contredisaient frontalement. Les dépenses avancées par l'autre membre depuis son compte n'apparaissent dans aucun relevé du premier, mais elles composent le solde qu'il doit. FR60 lui promet d'atteindre les dépenses sources, FR49 le lui interdit. **On ne peut pas devoir de l'argent à quelqu'un sans avoir le droit de savoir pourquoi.** L'exception est donc étroite et volontaire : la dépense marquée devient visible des deux, et rien d'autre ne l'est.*

*Le corollaire est assumé et doit être dit à l'utilisateur au moment du geste : **marquer une dépense comme commune, c'est la montrer.** Qui veut garder une dépense privée ne la marque pas, et renonce à s'en faire rembourser. Arbitrage sain, à condition d'être conscient — d'où la mention portée par FR50.*

*FR53 et FR57 n'apparaissent dans aucun parcours, comme FR9 et pour la même raison : ce sont des capacités de rattrapage. Un marquage « commune » posé par erreur et une saisie en espèces fautive arriveront, et sans elles la seule issue serait de vivre avec. Déclarées orphelines plutôt que masquées.*

*FR48 refuse le retrait d'un membre débiteur. L'alternative — retirer et oublier la dette — transformerait une erreur de manipulation en perte d'argent silencieuse.*

*FR52 découle du choix d'un référentiel propre à chaque membre. Une dépense commune se range donc dans un seul référentiel, celui du payeur. L'autre membre voit la dépense dans le décompte du foyer, jamais dans une de ses propres rubriques. C'est cohérent avec le principe posé dès l'Executive Summary : le référentiel appartient à celui qui le construit.*

### Agent conversationnel

*Ajoutées le 2026-09-12. **Premier chantier de la séquence**, avant le foyer.*

- **FR65** — L'utilisateur peut ouvrir à tout moment une conversation avec un agent et lui poser une question en langage ordinaire sur ses données.
- **FR66** — L'agent répond en français, à partir des agrégats renvoyés par le moteur d'analyse. Il ne produit aucun montant qui ne lui ait été renvoyé.
- **FR67** — L'utilisateur peut poser une question de suite sans redonner le contexte : la conversation garde son fil.
- **FR68** — Chaque réponse affiche **la période et le filtre** sur lesquels elle repose, et permet d'ouvrir l'écran d'analyse correspondant.
- **FR69** — L'agent indique explicitement qu'il ne peut pas répondre lorsque la question sort de ce que le moteur sait calculer, au lieu de produire une réponse approchée.
- **FR70** — L'utilisateur peut retrouver ses conversations passées et en reprendre une avec son contexte.
- **FR71** — L'utilisateur peut supprimer une conversation.
- **FR72** — L'agent n'interroge que les données de l'utilisateur connecté et les dépenses marquées communes (FR64). Il n'a accès à aucune autre donnée d'un autre membre.

*Le périmètre est délibérément étroit : **l'agent lit, il n'agit pas.** Il ne reclasse aucune transaction, ne crée aucune règle, ne marque aucune dépense comme commune. Une capacité d'action supposerait qu'on lui fasse confiance pour modifier des données, ce qui est un tout autre sujet que lui faire confiance pour décrire un tableau.*

*Le cas de **FR69** est celui qui définit le produit. Le moteur ne compare qu'à la période immédiatement précédente : « entre 2025 et 2026 » a une réponse, « entre 2024 et 2026 » n'en a pas tant que FR39 n'existe pas. Un agent qui bricole dans ce cas rend toutes ses autres réponses suspectes, y compris les justes. Dire « je ne sais pas » est ici une fonctionnalité, pas un aveu.*

***FR71** n'apparaît dans aucun parcours, comme FR9, FR53 et FR57, et pour la même raison : c'est une capacité de rattrapage. Une conversation qu'on ne veut plus garder arrivera, et sans elle la seule issue serait de vivre avec. Déclarée orpheline plutôt que masquée.*

***FR72** ne trace pas vers un parcours mais vers une **contrainte** : FR64 et NFR24, dont elle est la conséquence appliquée à l'agent. C'est correct — une règle de cloisonnement n'a pas de moment d'usage, elle a un périmètre. Elle est énoncée comme exigence pour que la conformité de l'agent au foyer soit vérifiable, plutôt que supposée acquise.*

*Les conversations de **FR70** sont un objet durable qu'aucun relevé ne reconstruit. Elles relèvent donc de la sauvegarde obligatoire (NFR12) et du cloisonnement (NFR24) : une conversation appartient à un membre.*

### Phase 2 — Croissance

- **FR37** — *(absorbée le 2026-09-12 par FR65 à FR72.)* La synthèse narrative d'une période était la version non interactive de l'agent : le moteur calcule, le modèle rédige. Elle reste atteignable comme une question parmi d'autres — « résume-moi ce mois » — et ne justifie plus une capacité distincte.
- **FR38** — L'utilisateur peut consulter les dépenses récurrentes détectées dans son historique, avec leur montant et leur périodicité.
- **FR39** — L'utilisateur peut comparer explicitement deux périodes de son choix.

### Notes de traçabilité des FRs

**FR24** existe pour rendre observable le critère de succès « ≤ 10 % de corrections manuelles ». Un seuil que rien ne mesure ne sert à rien — le PRD v1 en comptait plusieurs. C'est cette capacité qui rend possible le jalon de décision du séquencement MVP.

**FR9** n'apparaît dans aucun parcours utilisateur. Elle est retenue malgré tout : sur 24 fichiers déposés d'un coup, un mauvais PDF finira par passer, et sans elle la seule issue serait de vider la base.

**Hors périmètre, explicitement** : export de données, budgets, objectifs par catégorie, alertes, second compte bancaire, parts inégales entre membres du foyer, application installable sur téléphone, foyer de plus de deux membres, gestion de comptes utilisateurs interne à l'application, sort des données d'un membre retiré, sauvegarde hors site, **agent capable d'agir sur les données** (reclasser, créer une règle, marquer une dépense).

*« Projections » quitte cette liste le 2026-09-12 sans pour autant entrer au périmètre : le forecast est le **troisième chantier** de la séquence et fera l'objet d'un amendement propre. Tant qu'il n'est pas écrit ici, il n'existe pas.*

*L'**agent qui agit** reste dehors, et c'est délibéré. Lui faire confiance pour décrire un tableau et lui faire confiance pour modifier des données sont deux questions différentes. La seconde ne se pose pas tant que la première n'a pas de réponse à l'usage.* Aucune de ces capacités n'existera sans être ajoutée ici au préalable.

*« Répartition avec un conjoint » quitte cette liste le 2026-09-12 : la capacité est entrée au périmètre, en Phase 1 bis, par les FR50 à FR62.*

*Le sort des données d'un membre retiré du foyer est **explicitement hors périmètre**, décision du 2026-09-12. FR48 traite son solde, qui doit être nul avant tout retrait, et rien d'autre. Ses relevés, ses transactions et son référentiel restent en base : ni suppression, ni export, ni restitution. Ce n'est pas un oubli mais un choix, pris en connaissance de la question — qui se posera au premier retrait réel et devra alors être tranchée, probablement par une capacité d'export, elle-même hors périmètre aujourd'hui. La déclarer ici vaut mieux que la laisser silencieuse.*

*Le foyer est dimensionné pour **deux membres**. Le modèle n'interdit pas d'en accueillir davantage, mais aucun écran, aucun calcul de solde et aucun test ne couvre ce cas : le supposer acquis serait une promesse non tenue.*

## Non-Functional Requirements

> **Sélectivité.** Seules les catégories qui s'appliquent réellement sont documentées. Une catégorie est ajoutée au gabarit BMad — **la justesse financière** — parce qu'elle est la qualité déterminante de ce produit : ni la vitesse, ni la disponibilité, mais l'exactitude du chiffre affiché.

### Justesse financière

- **NFR1** — Toutes les valeurs monétaires sont représentées en interne par des entiers de centimes. Aucune opération arithmétique n'est effectuée en virgule flottante. La conversion en euros n'intervient qu'à l'affichage.
- **NFR2** — Tout montant affiché est traçable jusqu'aux éléments qui le composent — transactions de relevé, dépenses saisies manuellement, solde d'ouverture ou règlements. Aucun agrégat, ratio, point de courbe ou solde de foyer ne peut exister sans que l'utilisateur puisse en atteindre les éléments sources, chacun identifié par son origine. *(Élargi le 2026-09-12 : un montant du foyer peut reposer sur une saisie manuelle ou un solde d'ouverture, qui n'ont aucune ligne de relevé en face.)*
- **NFR3** — Les fonctions de calcul — agrégats par période, par nature, par rubrique et par poste, ainsi que les quatre indicateurs — sont couvertes par des tests unitaires comprenant au minimum un cas nominal et deux cas limites : période sans transaction, recettes nulles (division par zéro sur les taux), montant de signe inattendu pour la nature.
- **NFR4** — Le calcul du résultat d'une période exclut systématiquement les mouvements internes. Le solde bancaire, lui, les inclut. Les deux valeurs sont calculées séparément et ne sont jamais confondues.

### Sécurité et confidentialité

- **NFR5** — Les relevés PDF, la base de données et ses sauvegardes sont stockés exclusivement sur le **réseau local du foyer** : la machine hôte, et une seconde machine du même réseau pour les sauvegardes. Aucun fichier source n'est transmis à un service tiers, ni à un hébergeur de sauvegarde. *(Élargi deux fois le 2026-09-12. D'abord « la machine de l'utilisateur » vers « la machine hôte du foyer », qui héberge les données de plusieurs membres et est joignable depuis Internet. Puis vers le réseau local, NFR12 imposant une sauvegarde hors de la machine hôte. Le différenciateur de souveraineté est intégralement préservé : rien ne sort du domicile.)*
- **NFR6** — *(**Réécrite le 2026-09-12** pour dire ce que le code applique. Rédaction précédente : « Les seules données transmises au fournisseur LLM sont la date, le libellé et le montant des transactions. Aucun nom, IBAN, RIB ni adresse ne sort de la machine. » Elle promettait une garantie que le produit n'a jamais tenue, et elle le faisait au cœur de l'argument de souveraineté.)* Trois énoncés distincts :

  **Ce qui est coupé avant transmission.** Le bloc d'identité du relevé — IBAN, RIB, numéro de compte, nom et adresse du titulaire — est retiré par `pdf-extractor` : coupe géométrique au-dessus de l'en-tête de colonnes, puis passe d'expurgation par motif. Aucun identifiant bancaire ne quitte la machine.

  **Ce qui est transmis.** Les **lignes brutes du tableau d'opérations**, et non un triplet déjà structuré. Le modèle réalise l'extraction : lui envoyer `{date, libellé, montant}` supposerait que le travail soit déjà fait.

  **Le résidu, connu et assumé.** Le nom du titulaire figure à l'intérieur des libellés bancaires eux-mêmes — `VIR SEPA DUPONT Jean charges` — où il est indissociable de la donnée métier. L'expurger casserait la catégorisation, qui s'appuie précisément sur ces libellés. **Arbitrage explicite de l'utilisateur, le 2026-09-12 : les libellés ne sont pas sensibles, les identifiants bancaires le sont.** Le premier point traite le second ; le résidu est accepté.

  *Portée pour l'agent conversationnel : il transmet des agrégats — libellés de rubriques et de postes, montants, périodes. Une question portant sur des transactions précises fait repartir des libellés bancaires, ce que cet arbitrage couvre. Aucune exigence supplémentaire n'est nécessaire.*
- **NFR7** — L'inférence LLM s'exécute sur une infrastructure hébergée dans l'Union européenne.
- **NFR8** — La clé d'API est lue depuis une variable d'environnement, jamais écrite en base, jamais journalisée, jamais retournée dans une réponse HTTP.
- **NFR9** — *(Inversée le 2026-09-12. Rédaction précédente : « L'application ne comporte aucune authentification et suppose un environnement local de confiance, mono-machine. Toute exposition réseau rendrait l'authentification bloquante. » La condition posée par cette phrase est désormais remplie.)* Aucun écran, aucun endpoint et aucune donnée n'est accessible sans authentification préalable. L'application est joignable depuis Internet et ne suppose plus aucun environnement de confiance.

### Cloisonnement et exposition

*Ajoutées le 2026-09-12.*

- **NFR24** — La séparation des données entre membres du foyer est appliquée côté serveur à chaque requête. Aucun filtrage effectué côté interface ne tient lieu de cloisonnement. **Une seule exception, énumérée et close : les dépenses marquées communes (FR64), dont la date, le libellé, le montant et le payeur sont visibles des deux membres.** Toute autre donnée reste cloisonnée, y compris le poste sur lequel la dépense est rangée chez son payeur.
- **NFR25** — L'application ne détient aucun secret d'authentification. L'identité est vérifiée par un fournisseur externe, et aucun mot de passe ni empreinte de mot de passe n'est stocké.
- **NFR26** — Toute requête provenant de l'extérieur du réseau local transite par un canal chiffré. Aucune page de l'application n'est accessible sans authentification, et l'indexation par les moteurs de recherche est refusée.

### Justesse du partage

*Ajoutées le 2026-09-12.*

- **NFR27** — La somme des parts d'une dépense commune est égale au montant de cette dépense, au centime. Un montant dont la moitié n'est pas entière en centimes est réparti sans perte ni création : jamais deux fois le même arrondi.
- **NFR28** — Les dépenses saisies manuellement et les transactions issues de relevés constituent deux jeux de données distincts. Une saisie manuelle n'entre dans aucun calcul de réconciliation et ne peut modifier l'état de fiabilité d'aucun relevé.
- **NFR29** — Une transaction rattachée à un règlement entre membres n'est comptée ni en recette ni en dépense de sa période. Aucun montant ne contribue simultanément au résultat d'un membre et à l'extinction d'une dette du foyer.
- **NFR30** — Deux modifications concurrentes du solde du foyer ne peuvent pas se perdre l'une l'autre. Une écriture fondée sur un état devenu obsolète est **refusée**, et son auteur en est informé ; elle n'est jamais appliquée silencieusement par-dessus celle de l'autre membre. *(Ajoutée le 2026-09-12, seconde passe. La section Scalabilité relevait ce point en prose depuis la première passe, sans qu'aucune exigence ne le porte : FR59 et FR61 écrivent dans un état partagé par deux personnes.)*

### Garde-fous de l'agent conversationnel

*Ajoutées le 2026-09-12.*

- **NFR31** — L'agent ne cite aucun nombre qui ne figure **tel quel** dans les données qu'il a reçues du moteur d'analyse. Un nombre dérivé, moyenne, écart ou pourcentage, ne peut être énoncé que si le moteur l'a calculé et renvoyé. C'est la forme vérifiable de NFR15, qui énonce une intention qu'aucun test ne sait constater.
- **NFR32** — L'agent n'accède à la base de données par aucun chemin. Il obtient ses données exclusivement par les endpoints d'analyse, où s'applique le cloisonnement entre membres (NFR24). Aucun module de l'agent n'importe le client de base de données.
- **NFR33** — Toute réponse de l'agent portant un montant expose la période et le filtre dont ce montant provient, et donne accès à l'écran qui le compose. Aucun chiffre n'est énoncé sans son chemin de vérification (NFR2).

### Fiabilité des données

- **NFR10** — La réconciliation entre la somme des transactions et le solde du relevé s'exécute à chaque ingestion, sans exception ni possibilité de contournement.
- **NFR11** — Un relevé présentant un écart d'au moins un centime est marqué « non fiable ». Cet état est propagé à tout agrégat auquel le relevé contribue.
- **NFR12** — *(Inversée le 2026-09-12. Rédaction précédente : « La perte de la base de données est acceptable. La base doit pouvoir être intégralement reconstruite à partir des relevés PDF conservés. »)* La base de données est sauvegardée **quotidiennement**, sur une **machine du réseau local distincte de la machine hôte**, avec une rétention d'au moins **30 jours**. La capacité à restaurer est vérifiée par une restauration réelle, pas par la seule présence du fichier. **La perte de la base n'est plus acceptable** : les marquages « commune », les dépenses saisies en espèces, le solde d'ouverture du foyer et les règlements n'existent dans aucun relevé PDF et ne sont reconstructibles par aucun moyen. La sauvegarde est en place **avant** toute exposition de l'application sur Internet.

  *(Spécifiée le 2026-09-12, seconde passe. La rédaction de la première passe disait « sauvegardée automatiquement », sans périodicité, sans rétention et sans destination : une sauvegarde quotidienne écrite sur le disque portant la base l'aurait satisfaite sans protéger de rien. La destination reste **dans le foyer**, ce qui préserve NFR5 : la protection couvre la panne matérielle et l'erreur humaine, pas le sinistre du logement. La sauvegarde chiffrée hors site est portée en Phase 3 Vision.)*
- **NFR13** — L'échec du traitement d'un relevé n'affecte ni les relevés déjà ingérés, ni les suivants dans la file.

### Intégration LLM

- **NFR14** — Le client LLM déclare un schéma de sortie au fournisseur, **valide systématiquement la réponse contre ce schéma côté application**, et rejette toute réponse non conforme plutôt que de l'interpréter. Une relance bornée à un essai est autorisée, l'erreur de validation étant renvoyée au modèle. **La conformité n'est jamais présumée acquise du fournisseur.**

  *(Reformulé le 2026-09-04 après vérification : les « Custom Structured Outputs » de Mistral injectent le schéma dans le prompt système — c'est une instruction, pas une contrainte au décodage. La rédaction initiale supposait une garantie que le fournisseur n'offre pas. Voir D20.)*

  **Un schéma protège la forme, jamais les valeurs.** Un JSON parfaitement conforme peut porter un montant inventé ; c'est la réconciliation contre le solde du relevé (NFR10) qui l'attrape. NFR10 est le filet, NFR14 la ceinture.
- **NFR15** — Le LLM n'effectue aucun calcul. Il reçoit des agrégats déjà calculés et produit exclusivement du texte. Aucun montant affiché ne provient d'une sortie de modèle.
- **NFR16** — L'accès au fournisseur LLM est confiné à un module unique. Aucun autre fichier du projet n'importe le SDK du fournisseur.
- **NFR17** — En cas d'indisponibilité du fournisseur, l'ingestion **et l'agent conversationnel** échouent proprement avec un message explicite. Toutes les autres capacités restent intactes : les données déjà ingérées, l'analyse, l'évolution et le décompte du foyer ne dépendent d'aucun appel au fournisseur. *(Étendue à l'agent le 2026-09-12 : la dépendance passe d'un geste mensuel à une consultation quotidienne.)*

### Accessibilité

- **NFR18** — Aucun contrôle interactif ne sort du parcours de tabulation pour signaler son indisponibilité.
- **NFR19** — Aucun élément détenant le focus n'est désactivé.
- **NFR20** — Toute raison d'indisponibilité d'un contrôle est accessible au clavier, dans son nom accessible.

### Maintenabilité

- **NFR21** — L'extraction de texte PDF est confinée à un module unique. Aucun autre fichier n'importe la bibliothèque d'extraction.
- **NFR22** — Aucune constante métier structurante — natures, seuils, référentiel initial — n'est codée en dur dans une fonction de calcul.
- **NFR34** — L'identifiant du modèle et ses paramètres d'appel sont lus depuis la configuration d'environnement, avec une **valeur distincte par usage** : catégorisation d'un côté, agent conversationnel de l'autre. Aucun module ne les code en dur. La clé d'API reste soumise à NFR8 et ne figure dans aucune interface. *(Ajoutée le 2026-09-12.)*

  *Aujourd'hui `zai-glm-5-2` est une constante du module de catégorisation. C'était acceptable avec un seul appelant ; avec l'agent il y en a deux, aux besoins opposés — l'un produit du JSON, l'autre tient une conversation. Les figer sur la même valeur obligerait à toucher au fichier de la catégorisation pour régler l'agent.*

  *Aucun écran de paramétrage n'est prévu, et c'est délibéré. **Changer de modèle n'est pas un réglage, c'est un jalon** : le seuil de 10 % de corrections manuelles doit être re-mesuré après tout changement, et l'epic 13 a été séquencé précisément pour distinguer l'effet du modèle de celui du référentiel. Un menu déroulant permettrait de contourner ce garde-fou en trois secondes. Éditer un fichier de configuration puis redémarrer est un geste assez délibéré pour l'occasion, sur une application mono-machine administrée par son utilisateur.*

### Performance

- **NFR23** — Aucune cible de performance n'est fixée pour cette version. Toute cible chiffrée devra faire l'objet d'un arbitrage explicite. Deux points de vigilance à **mesurer**, sans engagement :

  *Le temps d'agrégation de l'historique complet lors d'un changement de période.*

  *Le délai de réponse de l'agent conversationnel. **Ajouté le 2026-09-12, et de nature différente des autres.** L'agent est la première surface **interactive** du produit : tout le reste est du traitement par lot déclenché à la main, où quarante secondes sont normales, alors qu'une conversation à quarante secondes est vécue comme une panne. Décision prise : pas de cible a priori, on juge à l'usage. Si l'attente casse l'usage, la cible sera posée à ce moment-là, sur une mesure réelle plutôt que sur une intuition.*

  *Un troisième point est à surveiller sans exigence à ce stade : les conversations s'accumulent sans borne et la sauvegarde quotidienne (NFR12) les emporte. Ni rétention ni purge ne sont définies. Sans effet aujourd'hui, à reconsidérer si le volume devient visible.*

### Scalabilité

*Réécrite le 2026-09-12. Rédaction précédente : « Sans objet. Application mono-utilisateur, mono-machine, volume borné par l'historique bancaire d'une personne. »*

Toujours sans cible chiffrée, mais plus « sans objet ». L'application sert **deux utilisateurs** depuis un serveur personnel, et le volume reste borné par l'historique bancaire de deux personnes, soit un ordre de grandeur inchangé. Ce qui change n'est pas le volume mais la **concurrence** : deux personnes peuvent consulter le solde du foyer et le modifier au même moment. Aucune exigence chiffrée n'est posée. Le comportement attendu en cas de modification concurrente est désormais porté par **NFR30**, et non plus laissé à l'état d'observation.
