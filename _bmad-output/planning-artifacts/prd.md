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
releaseMode: phased
inputDocuments:
  - _bmad-output/planning-artifacts/prd-v1-forecast.md
  - ~/Downloads/Dépenses 2022(1).xlsx (tableur tenu à la main, 2022 — référence du besoin réel)
  - _bmad-output/planning-artifacts/architecture.md
  - CLAUDE.md
workflowType: 'prd'
documentCounts:
  briefs: 1
  research: 0
  brainstorming: 0
  projectDocs: 3
classification:
  projectType: web_app
  domain: general
  complexity: medium
  projectContext: brownfield
  notes: >-
    Réécriture complète après invalidation du cadrage initial par l'usage réel
    (2026-09-04). Le PRD v1 (archivé en prd-v1-forecast.md) était construit
    autour du forecast inverse et du dividende SAS ; le besoin premier réel est
    l'analyse des dépenses par catégorie sur 2 ans de relevés. Socle conservé :
    epics 1-3 (ingestion, catégorisation, réconciliation).
---

# Product Requirements Document - personnalFinance

**Author:** Marceau
**Date:** 2026-09-04

## Executive Summary

**personnalFinance** est une application web locale d'analyse de dépenses personnelles. Elle ingère des relevés bancaires PDF, catégorise automatiquement chaque ligne via LLM, et restitue **où part l'argent** — par catégorie, sur une période choisie, avec l'évolution dans le temps.

Utilisateur unique : une personne qui tenait déjà cette analyse **à la main dans un tableur**, avec 23 rubriques, 68 postes et cinq indicateurs, et qui a fini par l'abandonner. Non par manque d'intérêt : parce que reporter chaque ligne de relevé une par une était intenable.

Le problème résolu n'est donc pas « comment analyser mes dépenses » — cette question a déjà sa réponse, éprouvée par des années d'usage. Il est : **comment tenir cette analyse à jour sans y passer une soirée par mois.**

L'application produit deux lectures indissociables : la **répartition** — sur une période, où part l'argent, par nature et par catégorie — et l'**évolution** — comment ces postes bougent d'une période à l'autre. Objectif opérationnel : identifier vite ce qui rend une période **déficitaire**, définie comme dépenses supérieures aux recettes, hors mouvements internes entre comptes du même utilisateur.

### What Makes This Special

**Souveraineté des données.** Les PDF ne quittent jamais la machine. Seules trois colonnes anonymes — date, libellé, montant — sont transmises au fournisseur LLM, dont l'inférence s'exécute **en Europe** : ni nom, ni IBAN, ni identifiants bancaires. L'argument ne se limite pas à restreindre ce qui sort — ce qui sort reste sous régime européen. Les agrégateurs du marché (Bankin', Linxo, Finary) exigent un accès aux comptes ou des identifiants ; ici, il n'y a rien à céder.

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
| **Complexité** | `medium` — non plus par la complexité métier (la fiscalité française sort du périmètre) mais par l'exigence de **justesse numérique** et la fiabilité de la couche LLM. Un graphique faux est pire qu'absent : on le croit. |
| **Contexte** | `brownfield` — le socle d'ingestion, de catégorisation et de réconciliation existe, est testé et reste en place. Le PRD définit ce qui s'ajoute au-dessus et ce qui disparaît. |

## Success Criteria

### User Success

**Le critère qui tranche : le tableur n'est plus rouvert.** `Dépenses.xlsx` est le concurrent réel du produit — pas Bankin', pas Linxo. Vérifié à 3 mois : si l'utilisateur rouvre son tableur pour comprendre quelque chose que l'app ne dit pas, le produit a échoué, quel que soit le nombre de graphiques livrés.

- Les ~24 relevés d'historique sont ingérés **en une seule session**, sans abandon en cours de route.
- Répondre à « où est parti mon argent en 2025 ? » en **moins de 30 secondes**, sans export ni calcul manuel.
- Au moins **une** dépense décelée que l'utilisateur ne soupçonnait pas — la preuve que l'outil apprend quelque chose plutôt que de confirmer ce qu'on sait déjà.

### Business Success

Projet personnel, mono-utilisateur : pas de revenu, pas de croissance. Le seul succès mesurable est **l'usage réel dans la durée**.

- L'app est ouverte au moins une fois par mois **à 6 mois**, sans rappel ni contrainte externe.
- Chaque nouveau relevé mensuel est ingéré dans le mois. Un historique en retard rend l'analyse fausse et la confiance s'effondre.

### Technical Success

- **Réconciliation au centime sur 100 % des relevés ingérés**, ou état « non fiable » explicitement affiché. Aucun relevé ne rentre silencieusement avec un écart.
- **Taux de correction manuelle ≤ 10 % des lignes** d'un relevé. Au-delà, la corvée que le produit devait supprimer est de retour, et l'utilisateur décrochera comme il a décroché du tableur. Ce seuil remplace la position du PRD v1 — « pas de barre de précision stricte (acceptée) » — qui était tenable quand la catégorisation alimentait un forecast, et ne l'est plus quand **la catégorisation est le produit**.
- Les 24 relevés d'historique ingérés sans intervention manuelle ni interruption.
- **Zéro chiffre affiché qui ne soit traçable jusqu'à une ligne de relevé.** Corollaire direct de la règle « le LLM ne calcule rien ».

### Measurable Outcomes

| Indicateur | Cible | Quand |
|---|---|---|
| Tableur rouvert | **0 fois** | à 3 mois |
| Lignes corrigées manuellement | **≤ 10 %** par relevé | à chaque ingestion |
| Relevés réconciliés au centime ou marqués non fiables | **100 %** | à chaque ingestion |
| Historique ingéré | **24 relevés** en une session | au démarrage |
| Ouverture de l'app | **≥ 1 par mois** | à 6 mois |
| Délai d'ingestion d'un nouveau relevé | **< 1 mois** après réception | en régime de croisière |

Pas de plafond de coût LLM : contrainte écartée explicitement par l'utilisateur.

Aucune cible de durée d'ingestion n'est fixée à ce stade. Le PRD v1 imposait 30 secondes par relevé (NFR1) ; le changement de fournisseur LLM rend ce chiffre invérifiable aujourd'hui. À réintroduire après la première mesure réelle.

## User Journeys

> **Note de cadrage.** Le gabarit BMad exige une couverture par types d'utilisateurs (admin, support, consommateur d'API). L'application est **mono-utilisateur, locale, sans authentification** : ces rôles n'existent pas. Les inventer produirait des besoins fictifs — le mécanisme même qui a engendré 71 FRs dans le PRD v1. Les parcours ci-dessous couvrent donc **le même utilisateur dans des situations différentes** : chemin nominal, cas limite, récupération d'erreur.

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

### Journey Requirements Summary

| Domaine | Capacités |
|---|---|
| **Ingestion** | Dépôt multiple · progression · dédup par hash · échec isolé sans tout arrêter · ingestion unitaire mensuelle |
| **Fiabilité** | Réconciliation au centime · état « non fiable » propagé · écart chiffré |
| **Référentiel** | Hiérarchie 2 niveaux · 3 natures · reclassement manuel catégorie **et** nature |
| **Analyse** | Répartition par période · évolution entre périodes · mois/trimestre/année · 4 indicateurs · déficit hors mouvements internes |
| **Traçabilité** | Descente agrégat → rubrique → poste → **transaction source** |

La gestion du référentiel (créer, renommer, supprimer une catégorie) n'est pas traitée en parcours : la capacité existe déjà dans le socle et ne constitue pas un moment de valeur.

## Domain-Specific Requirements

> **Note de cadrage.** La table de référence BMad classe le domaine `general` en complexité `low`, ce qui déclencherait l'abandon de cette étape. Elle ne propose que deux cases : domaine régulé (`fintech` → KYC, PCI DSS) ou « exigences standard ». Ce produit n'est ni l'un ni l'autre : aucun régulateur, aucune certification, mais une exigence dure — **un chiffre faux est plus dangereux qu'un chiffre absent, parce qu'on le croit et qu'on décide dessus.** Cette section documente les contraintes réelles plutôt que des conformités fictives.

### Précision financière — pourquoi elle prime ici

Le produit ne calcule rien de complexe. Il additionne. Mais il additionne **2 400 transactions sur deux ans**, agrégées en rubriques, postes, ratios et cumuls — et l'utilisateur décide à partir du résultat.

Trois conséquences structurent le reste du document :

- **L'erreur en virgule flottante devient visible à cette échelle.** D'où l'arithmétique en centimes entiers (NFR1).
- **Un chiffre invérifiable est un chiffre dangereux.** L'utilisateur doit pouvoir remonter de n'importe quel agrégat jusqu'aux lignes de relevé qui le composent (NFR2). C'est le corollaire opérationnel de « le LLM ne calcule rien ».
- **Une donnée fausse en entrée invalide tout ce qui suit.** D'où la réconciliation systématique contre le solde du relevé (NFR10-11), la déduplication par hash et la détection de période chevauchante — cette dernière devenant critique lors du dépôt de 24 fichiers d'un coup, dont certains peuvent être des re-téléchargements du même mois.

*Énoncés vérifiables : NFR1 à NFR4 (justesse), NFR10 à NFR13 (fiabilité des données).*

### Confidentialité des données — pourquoi c'est le différenciateur

Les agrégateurs du marché exigent les identifiants bancaires de l'utilisateur ou un accès Open Banking. Ce produit ne demande rien : il lit des PDF que l'utilisateur possède déjà, et n'expose au fournisseur LLM que trois colonnes anonymes.

Le changement de fournisseur (cf. **Dépendance LLM**) déplace cet argument d'un cran : l'inférence s'exécutant en Europe, les données transmises ne relèvent plus d'un régime juridique extra-européen. Ce n'est pas un détail d'implémentation — c'est la raison d'être du produit face à des alternatives gratuites et mieux finies.

L'absence d'authentification est cohérente avec ce cadre : l'application suppose un environnement local de confiance, mono-machine. Toute exposition réseau la rendrait bloquante.

*Énoncés vérifiables : NFR5 à NFR9.*

### Modèle de domaine

Trois natures de mouvement, et la troisième est structurante :

| Nature | Entre dans le déficit ? | Exemples |
|---|---|---|
| **Recette** | Oui, au crédit | Salaire, remboursement Sécu, dividende |
| **Dépense** | Oui, au débit | Courses, loyer, essence |
| **Mouvement interne** | **Non** | Virement depuis/vers un livret, retrait d'espèces |

Hiérarchie à deux niveaux : **rubrique → poste**. Un même libellé de poste peut exister sous plusieurs rubriques — *Restaurant* sous *Alimentation* et sous *Voyages* — parce qu'il n'y recouvre pas la même dépense.

**Le déficit d'une période** = Σ dépenses − Σ recettes, **hors mouvements internes**. Le solde bancaire, lui, additionne tout, virements compris : les deux chiffres coexistent et répondent à deux questions différentes.

*(Toute la section « Spécificités françaises » du PRD v1 — SAS, exercice fiscal, IS, flat tax, ARE, loyer dirigeant, défraiements — disparaît avec le forecast.)*

### Suppression des disclaimers

**L'application n'affiche plus aucun avertissement « ceci n'est pas un conseil financier ».**

Justification : le disclaimer existait parce que l'app **simulait** — dividende à voter, fiscalité, projection à 24 mois. Une simulation produit un chiffre qui n'existe pas encore, sur lequel un utilisateur peut décider à tort. L'application **restitue** désormais des faits issus de relevés que l'utilisateur possède déjà. Elle ne produit aucune projection ni recommandation : il n'y a rien à avertir.

Éléments retirés (~220 lignes) : `AppDisclaimer.vue` (modal bloquant à la première visite), `stores/disclaimer.ts` et son test (flag `localStorage`), l'appel dans le layout, la note en pied de page, l'acquittement dans `tests/e2e/ingestion.spec.ts`. Le **gap G1** de `CLAUDE.md` (« persister le flag disclaimer vu ») disparaît du cadrage.

Effet collatéral : le pré-remplissage `pf_disclaimer_seen_v1` ajouté dans `playwright.config.ts` pour stabiliser les E2E devient sans objet. Le modal bloquait la première visite sur une application mono-utilisateur locale : il n'a jamais rien protégé, il imposait un geste.

## Web Application Specific Requirements

### Project-Type Overview

SPA Nuxt 4 (`ssr: false`) avec backend Nitro intégré. Application locale, mono-utilisateur, sans authentification. **Usage desktop exclusivement.** Pas de SEO, pas de temps réel : l'ingestion est un traitement par lot déclenché par un dépôt de fichiers.

*(La section `seo_strategy` demandée par le gabarit BMad est sans objet : l'application n'est pas exposée publiquement.)*

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

### Post-MVP Features

**Phase 2 — Croissance.** Analyse narrative par LLM (le moteur calcule, le modèle rédige) · détection des dépenses récurrentes via `charge-suggester` repositionné · comparaison explicite de deux périodes.

**Phase 3 — Vision.** Second compte bancaire (Crédit Mutuel) et extraction paramétrée par banque · répartition des dépenses communes avec un conjoint · objectifs de dépense par catégorie.

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

## Dépendance LLM

Le fournisseur passe d'Anthropic à **Mistral**, sur le modèle **GLM-5.2** (Z.ai), hébergé par Mistral avec **inférence en Europe** depuis août 2026. Contexte d'1 M tokens, tarif indicatif 1,40 $/M en entrée et 4,40 $/M en sortie.

Conséquences :

- **Renforcement du différenciateur** : les données transmises ne quittent plus l'Union européenne. L'argument passe de « on limite ce qui sort » à « ce qui sort reste sous régime européen ».
- **Le point d'entrée unique reste `server/services/llm-categorizer.ts`** (NFR16). Le changement de fournisseur est confiné à ce fichier — c'est le bénéfice direct de la boundary posée en story 2.4.
- ⚠️ **À VALIDER avant développement** : le support des **sorties structurées contraintes par schéma**. NFR14 en dépend entièrement — « répondre en JSON » ne suffit pas, il faut une contrainte appliquée au décodage. Si le support est absent ou partiel, la fiabilité des montants est en jeu et le critère de succès technique « zéro chiffre non traçable » devient intenable. Point d'architecture à trancher avec l'architecte.
- Le contexte d'1 M tokens rend envisageable l'ingestion de plusieurs relevés en un seul appel, ce qui sert directement l'ingestion en masse de l'historique.


## Functional Requirements

> **Contrat de capacités.** Ce qui ne figure pas ici n'existera pas dans le produit. Le PRD v1 comptait 71 FRs pour un périmètre qui s'est révélé faux ; celui-ci en compte 39, dont 3 en phase 2.

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

- **FR31** — L'utilisateur peut visualiser l'évolution d'une rubrique ou d'un poste sur plusieurs périodes consécutives.
- **FR32** — L'utilisateur peut consulter, pour une période, la trésorerie de la période, le taux de dépense, la trésorerie cumulée et le taux d'épargne.
- **FR33** — L'utilisateur peut identifier immédiatement si une période est déficitaire.
- **FR34** — L'utilisateur peut voir, pour une période déficitaire, quelles rubriques ont le plus varié par rapport à la période précédente.

### Traçabilité

- **FR35** — L'utilisateur peut descendre d'un montant agrégé jusqu'aux transactions qui le composent.
- **FR36** — L'utilisateur peut consulter le libellé bancaire d'origine d'une transaction et le relevé dont elle provient.

### Phase 2 — Croissance

- **FR37** — Le système produit une synthèse narrative en français d'une période, à partir d'agrégats calculés en amont.
- **FR38** — L'utilisateur peut consulter les dépenses récurrentes détectées dans son historique, avec leur montant et leur périodicité.
- **FR39** — L'utilisateur peut comparer explicitement deux périodes de son choix.

### Notes de traçabilité des FRs

**FR24** existe pour rendre observable le critère de succès « ≤ 10 % de corrections manuelles ». Un seuil que rien ne mesure ne sert à rien — le PRD v1 en comptait plusieurs. C'est cette capacité qui rend possible le jalon de décision du séquencement MVP.

**FR9** n'apparaît dans aucun parcours utilisateur. Elle est retenue malgré tout : sur 24 fichiers déposés d'un coup, un mauvais PDF finira par passer, et sans elle la seule issue serait de vider la base.

**Hors périmètre, explicitement** : export de données, budgets, objectifs par catégorie, alertes, second compte bancaire, répartition avec un conjoint, projections. Aucune de ces capacités n'existera sans être ajoutée ici au préalable.

## Non-Functional Requirements

> **Sélectivité.** Seules les catégories qui s'appliquent réellement sont documentées. Une catégorie est ajoutée au gabarit BMad — **la justesse financière** — parce qu'elle est la qualité déterminante de ce produit : ni la vitesse, ni la disponibilité, mais l'exactitude du chiffre affiché.

### Justesse financière

- **NFR1** — Toutes les valeurs monétaires sont représentées en interne par des entiers de centimes. Aucune opération arithmétique n'est effectuée en virgule flottante. La conversion en euros n'intervient qu'à l'affichage.
- **NFR2** — Tout montant affiché est traçable jusqu'aux transactions qui le composent. Aucun agrégat, ratio ou point de courbe ne peut exister sans que l'utilisateur puisse en atteindre les lignes sources.
- **NFR3** — Les fonctions de calcul — agrégats par période, par nature, par rubrique et par poste, ainsi que les quatre indicateurs — sont couvertes par des tests unitaires comprenant au minimum un cas nominal et deux cas limites : période sans transaction, recettes nulles (division par zéro sur les taux), montant de signe inattendu pour la nature.
- **NFR4** — Le calcul du résultat d'une période exclut systématiquement les mouvements internes. Le solde bancaire, lui, les inclut. Les deux valeurs sont calculées séparément et ne sont jamais confondues.

### Sécurité et confidentialité

- **NFR5** — Les relevés PDF et la base de données sont stockés exclusivement sur la machine de l'utilisateur. Aucun fichier source n'est transmis à un service tiers.
- **NFR6** — Les seules données transmises au fournisseur LLM sont la date, le libellé et le montant des transactions. Aucun nom, IBAN, RIB ni adresse ne sort de la machine.
- **NFR7** — L'inférence LLM s'exécute sur une infrastructure hébergée dans l'Union européenne.
- **NFR8** — La clé d'API est lue depuis une variable d'environnement, jamais écrite en base, jamais journalisée, jamais retournée dans une réponse HTTP.
- **NFR9** — L'application ne comporte aucune authentification et suppose un environnement local de confiance, mono-machine. Toute exposition réseau rendrait l'authentification bloquante.

### Fiabilité des données

- **NFR10** — La réconciliation entre la somme des transactions et le solde du relevé s'exécute à chaque ingestion, sans exception ni possibilité de contournement.
- **NFR11** — Un relevé présentant un écart d'au moins un centime est marqué « non fiable ». Cet état est propagé à tout agrégat auquel le relevé contribue.
- **NFR12** — La perte de la base de données est acceptable. La base doit pouvoir être intégralement reconstruite à partir des relevés PDF conservés.
- **NFR13** — L'échec du traitement d'un relevé n'affecte ni les relevés déjà ingérés, ni les suivants dans la file.

### Intégration LLM

- **NFR14** — Le client LLM déclare un schéma de sortie au fournisseur, **valide systématiquement la réponse contre ce schéma côté application**, et rejette toute réponse non conforme plutôt que de l'interpréter. Une relance bornée à un essai est autorisée, l'erreur de validation étant renvoyée au modèle. **La conformité n'est jamais présumée acquise du fournisseur.**

  *(Reformulé le 2026-09-04 après vérification : les « Custom Structured Outputs » de Mistral injectent le schéma dans le prompt système — c'est une instruction, pas une contrainte au décodage. La rédaction initiale supposait une garantie que le fournisseur n'offre pas. Voir D20.)*

  **Un schéma protège la forme, jamais les valeurs.** Un JSON parfaitement conforme peut porter un montant inventé ; c'est la réconciliation contre le solde du relevé (NFR10) qui l'attrape. NFR10 est le filet, NFR14 la ceinture.
- **NFR15** — Le LLM n'effectue aucun calcul. Il reçoit des agrégats déjà calculés et produit exclusivement du texte. Aucun montant affiché ne provient d'une sortie de modèle.
- **NFR16** — L'accès au fournisseur LLM est confiné à un module unique. Aucun autre fichier du projet n'importe le SDK du fournisseur.
- **NFR17** — En cas d'indisponibilité du fournisseur, l'ingestion échoue proprement avec un message explicite. Les données déjà ingérées restent consultables.

### Accessibilité

- **NFR18** — Aucun contrôle interactif ne sort du parcours de tabulation pour signaler son indisponibilité.
- **NFR19** — Aucun élément détenant le focus n'est désactivé.
- **NFR20** — Toute raison d'indisponibilité d'un contrôle est accessible au clavier, dans son nom accessible.

### Maintenabilité

- **NFR21** — L'extraction de texte PDF est confinée à un module unique. Aucun autre fichier n'importe la bibliothèque d'extraction.
- **NFR22** — Aucune constante métier structurante — natures, seuils, référentiel initial — n'est codée en dur dans une fonction de calcul.

### Performance

- **NFR23** — Aucune cible de performance n'est fixée pour cette version. Point de vigilance à mesurer lors de la première ingestion réelle : le temps d'agrégation de l'historique complet lors d'un changement de période. Toute cible chiffrée devra faire l'objet d'un arbitrage explicite.

### Scalabilité

Sans objet. Application mono-utilisateur, mono-machine, volume borné par l'historique bancaire d'une personne.
