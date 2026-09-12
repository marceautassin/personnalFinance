---
validationTarget: '_bmad-output/planning-artifacts/prd.md'
validationDate: '2026-09-12'
inputDocuments:
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/planning-artifacts/architecture.md
  - CLAUDE.md
missingInputDocuments:
  - '~/Downloads/Dépenses 2022(1).xlsx (introuvable au 2026-09-12)'
excludedInputDocuments:
  - '_bmad-output/planning-artifacts/prd-v1-forecast.md (archive du périmètre invalidé — CLAUDE.md interdit de s''en servir comme référence)'
validationStepsCompleted:
  - step-v-01-discovery
  - step-v-02-format-detection
  - step-v-03-density-validation
  - step-v-04-brief-coverage-validation
  - step-v-05-measurability-validation
  - step-v-06-traceability-validation
  - step-v-07-implementation-leakage-validation
  - step-v-08-domain-compliance-validation
  - step-v-09-project-type-validation
  - step-v-10-smart-validation
  - step-v-11-holistic-quality-validation
  - step-v-12-completeness-validation
  - step-v-13-report-complete
validationStatus: COMPLETE
holisticQualityRating: '4.5/5 — Bon, tirant vers excellent'
overallStatus: 'Warning à la validation, constats traités le jour même — 1 seul reste ouvert (NFR6)'
remediationDate: '2026-09-12'
---

# Rapport de validation du PRD

**PRD validé :** `_bmad-output/planning-artifacts/prd.md`
**Date :** 2026-09-12
**Contexte :** validation consécutive à la révision « foyer » du 2026-09-12 (FR44-FR62, NFR24-NFR29, NFR9 et NFR12 inversées, Journeys 5 et 6, Phase 1 bis).

## Documents d'entrée

| Document | État |
|---|---|
| `prd.md` | chargé |
| `architecture.md` | chargé |
| `CLAUDE.md` | chargé |
| `~/Downloads/Dépenses 2022(1).xlsx` | **introuvable** — référencé en frontmatter, absent du disque |
| `prd-v1-forecast.md` | **écarté volontairement** — archive du périmètre invalidé |

## Constats de validation

[Les constats sont ajoutés au fil des étapes.]

## Détection de format

**Structure du PRD, en-têtes de niveau 2 dans l'ordre :**

1. Executive Summary
2. Project Classification
3. Success Criteria
4. User Journeys
5. Domain-Specific Requirements
6. Web Application Specific Requirements
7. Project Scoping & Phased Development
8. Dépendance LLM
9. Functional Requirements
10. Non-Functional Requirements

**Sections cœur BMAD :**

| Section attendue | État | Portée par |
|---|---|---|
| Executive Summary | présente | `## Executive Summary` |
| Success Criteria | présente | `## Success Criteria` |
| Product Scope | présente | `## Project Scoping & Phased Development` |
| User Journeys | présente | `## User Journeys` |
| Functional Requirements | présente | `## Functional Requirements` |
| Non-Functional Requirements | présente | `## Non-Functional Requirements` |

**Classification : BMAD Standard — 6 sections cœur sur 6.**

**Sections hors gabarit, conservées :** `Project Classification`, `Domain-Specific Requirements`, `Web Application Specific Requirements`, `Dépendance LLM`. Les trois premières correspondent à des étapes du gabarit BMad rendues en sections propres. `Dépendance LLM` est une section spécifique au projet, justifiée par un risque bloquant documenté.

**Effet de la révision du 2026-09-12 sur la structure :** aucun en-tête de niveau 2 ajouté ni supprimé. Les 19 FRs et 6 NFRs nouvelles ont été insérées dans les sections existantes, sous de nouveaux en-têtes de niveau 3. La structure reste conforme.

## Densité d'information

Le gabarit BMad énumère des anti-motifs en anglais. Ils ont été transposés en français avant recherche, et les formes anglaises ont été cherchées également, le PRD contenant des exigences rédigées en anglais dans les documents amont.

**Remplissage conversationnel : 0 occurrence.**

| Motif recherché | Occurrences |
|---|---|
| « Il est important de », « Il est à noter », « il faut noter » | 0 |
| « il convient de », « dans le but de », « dans le cadre de » | 0 |
| « en raison du fait que », « à l'heure actuelle » | 0 |
| « Le système permettra à l'utilisateur de » | 0 |
| « In order to », « It is important to note », « Due to the fact » | 0 |

**Formulations verbeuses : 0 occurrence.** **Redondances : 0 occurrence.**

**Total : 0 violation. Verdict : PASS.**

### Formulation des exigences

Les 62 FRs se répartissent en deux formes, toutes deux conformes :

| Forme | Nombre | Conformité |
|---|---|---|
| « L'utilisateur peut … » | 48 | conforme — capacité exprimée à la voix active, sans périphrase |
| « Le système + verbe au présent » | 7 | conforme — réservée aux comportements automatiques sans geste utilisateur |
| Autres formes déclaratives | 7 | conforme |

Aucune occurrence de la tournure proscrite « le système permettra à l'utilisateur de », y compris dans les 19 FRs ajoutées le 2026-09-12.

### Observation hors barème

Le document compte 754 lignes, dont une proportion notable de notes en italique justifiant les décisions, citant les rédactions antérieures et documentant les inversions. Ce n'est **pas** du remplissage au sens BMad : chaque note porte une information non déductible du reste, et sert la traçabilité des décisions, qui est un principe explicite du projet.

Point de vigilance tout de même : les notes de révision s'accumulent au fil des amendements. Trois dates de révision cohabitent désormais dans le document (2026-09-04, 2026-09-05, 2026-09-12). Au prochain amendement, envisager de déplacer l'historique des rédactions antérieures dans une section dédiée plutôt que de l'inscrire au fil des exigences.

## Couverture du Product Brief

**Statut : sans objet — aucun Product Brief n'existe dans le dépôt.**

Le frontmatter du PRD déclare `documentCounts.briefs: 1`, mais `inputDocuments` ne référence aucun fichier de brief et aucun fichier correspondant n'existe dans le dossier de planification. Le compteur désigne vraisemblablement `prd-v1-forecast.md`, l'archive du périmètre invalidé, qui a servi d'entrée à la réécriture du 2026-09-04 sans être un brief.

**Constat mineur :** `documentCounts.briefs: 1` est trompeur. À corriger en `0` ou à documenter.

**Source de vérité du périmètre ajouté le 2026-09-12 :** un entretien de cadrage mené avec l'utilisateur, dont les cinq décisions sont inscrites dans le PRD lui-même. Il n'existe pas de document amont contre lequel vérifier la couverture. Les étapes suivantes valident donc la cohérence **interne** du PRD, pas sa fidélité à un brief.

Décisions de cadrage tracées, pour mémoire :

| Décision | Où elle est inscrite dans le PRD |
|---|---|
| Second membre = utilisateur complet avec sa propre analyse | Journey 6, FR46, FR49 |
| Répartition à parts égales, sans parts paramétrables | FR51, NFR27, hors-périmètre |
| Solde d'ouverture saisi à la main, pas d'import | FR58 |
| Règle des 50 % du compte joint inchangée et non fusionnée | Modèle de domaine, tableau des trois mécanismes |
| Desktop maintenu, application mobile installable en Phase 3 | Responsive Design, Phase 3 Vision |
| Identité déléguée à un fournisseur externe | FR44, NFR25 |
| Serveur personnel exposé sur Internet | Project Classification, NFR9, NFR26 |

## Mesurabilité des exigences

### Exigences fonctionnelles

**62 FRs analysées.**

| Contrôle | Violations |
|---|---|
| Conformité de forme « acteur + capacité » | 0 |
| Adjectifs subjectifs (facile, intuitif, rapide, fluide, performant…) | 0 |
| Fuite d'implémentation (noms de technologies, bibliothèques) | 0 |
| Quantificateurs vagues | 2 retenues sur 3 occurrences |

**Aucune fuite d'implémentation dans les 62 FRs.** Vérifié sur Nuxt, SQLite, Drizzle, Vue, Pinia, Zod, Vitest, Playwright, Nitro, Postgres, Mistral, Google, OAuth, JWT, SHA-256, unpdf, SVG et stockage local : zéro occurrence dans une exigence.

Point notable sur la révision du 2026-09-12 : **FR44** dit « un fournisseur d'identité externe » et non « Google ». Le nom du fournisseur n'apparaît que dans une note de la section domaine, présentée comme une décision d'architecture. C'est la bonne frontière.

#### Constats sur les quantificateurs

| Réf. | Ligne | Formulation | Verdict |
|---|---|---|---|
| **FR31** | 594 | « sur **plusieurs** périodes consécutives » | ⚠️ **Modéré.** Combien de périodes la vue d'évolution couvre-t-elle ? Douze mois, quatre trimestres, tout l'historique ? La capacité n'est pas testable en l'état, et la question se posera au découpage en stories. |
| **FR1** | 549 | « déposer **plusieurs** relevés PDF » | ℹ️ **Informatif.** La capacité est binaire, dépôt multiple contre dépôt unitaire, et le Journey 1 chiffre le cas réel à 24 fichiers. Aucune borne haute n'est posée : acceptable pour un usage personnel, à surveiller si un dépôt massif dégrade le traitement. |
| FR19 | 573 | « sous **plusieurs** rubriques distinctes » | ✅ Non retenu. Énoncé de modèle signifiant « plus d'une », sans ambiguïté de test. |
| NFR5 | 695 | « les données de **plusieurs** membres » | ✅ Non retenu. L'occurrence est dans une note de révision, pas dans l'énoncé normatif. |

**Total FR : 2 constats, dont 1 modéré.**

### Exigences non fonctionnelles

**29 NFRs analysées.** Les six ajoutées le 2026-09-12 sont toutes testables par un critère binaire vérifiable, ce qui est le bon registre pour des exigences de cloisonnement et de justesse.

| Réf. | Critère | Testable ? |
|---|---|---|
| NFR24 | séparation appliquée côté serveur à chaque requête | oui, par test d'accès croisé entre deux membres |
| NFR25 | aucun mot de passe ni empreinte stockés | oui, par inspection du schéma |
| NFR26 | canal chiffré, aucune page accessible sans authentification | oui, par requête non authentifiée sur chaque route |
| NFR27 | somme des parts égale au montant, au centime | oui, y compris sur montant impair |
| NFR28 | saisie manuelle hors réconciliation | oui, par ingestion d'un relevé après saisie |
| NFR29 | transaction rattachée à un règlement neutralisée | oui, par comparaison du résultat avant et après rattachement |

#### Constats

| Réf. | Sévérité | Constat |
|---|---|---|
| **NFR12** | ⚠️ **Modéré** | « sauvegardée automatiquement » sans **périodicité**, sans **rétention**, et sans dire où la sauvegarde est écrite. Une sauvegarde quotidienne sur le même disque que la base ne protège de rien. L'exigence est la plus critique de la révision et la moins spécifiée. |
| **Concurrence** | ⚠️ **Modéré** | La section Scalabilité relève que deux membres peuvent modifier le solde du foyer au même moment et annonce un « point à vérifier ». **Aucune NFR ne le porte.** Une exigence énoncée en prose hors du contrat n'est pas opposable. FR59 et FR61 écrivent dans un état partagé, cette lacune les concerne directement. |
| NFR23 | ℹ️ Informatif | Absence de cible de performance, assumée et justifiée. Non-exigence délibérée, pas un oubli. |

**Total NFR : 3 constats, dont 2 modérés.**

### Évaluation

| | |
|---|---|
| Exigences totales | 91 |
| Violations totales | 5 |
| **Sévérité** | **Warning** (barème : 5 à 10 violations) |

**Nuance sur le verdict.** Le barème classe ce résultat en Warning à 5 constats sur 91 exigences, soit 5,5 %. Aucun constat n'est critique, aucune exigence n'est intestable, et trois des cinq sont informatifs ou délibérés. Les **deux points à traiter** sont la périodicité de sauvegarde (NFR12) et l'absence d'exigence de concurrence sur le solde du foyer. Le troisième, la fenêtre de FR31, est antérieur à la révision.

## Traçabilité

### Chaînes

| Chaîne | État |
|---|---|
| Executive Summary → Success Criteria | **intacte** — les deux concurrents nommés dans le résumé, le tableur et l'outil de partage tiers, ont chacun leur critère de sortie chiffré et leur échéance |
| Success Criteria → User Journeys | **une lacune** (détail ci-dessous) |
| User Journeys → Functional Requirements | **lacunes** sur 3 FRs de la révision et 4 antérieures |
| Périmètre → FRs | **intacte** — les 9 capacités listées en Phase 1 bis correspondent une à une aux FR44-FR62 et à NFR12 |

### Matrice des parcours

| Parcours | FRs portées | Couverture |
|---|---|---|
| Journey 1 — rattrapage | FR1 à FR9, FR20 | complète |
| Journey 2 — pourquoi ce mois est rouge | FR25 à FR36 | complète |
| Journey 3 — cycle mensuel | FR7, FR23, FR32 à FR34 | complète |
| Journey 4 — quand ça se passe mal | FR10 à FR14, FR17, FR21 à FR23 | complète |
| **Journey 5 — dépense commune** | FR50, FR51, FR54, FR56, FR59 à FR62 | **9 FRs sur 13** |
| **Journey 6 — rejoindre le foyer** | FR44 à FR49 | **complète, 6 sur 6** |

### Exigences orphelines

**Nées de la révision du 2026-09-12 :**

| Réf. | Sévérité | Constat |
|---|---|---|
| **FR58** — solde d'ouverture | ⚠️ **Modéré, à traiter** | Aucun parcours ne montre la **reprise du décompte tenu dans l'outil tiers**. C'est pourtant un moment d'usage réel, à fort risque : un solde saisi dans le mauvais sens inverse la dette, et l'erreur ne se voit pas. Le Success Criteria parle d'une « période de recouvrement » pendant laquelle les deux soldes doivent coïncider au centime — ce moment n'est dramatisé nulle part. |
| FR53 — retirer le marquage « commune » | ℹ️ Informatif | Complément de FR50, même statut que FR9 : capacité de rattrapage qu'aucun parcours ne met en scène, retenue parce qu'un marquage erroné arrivera. |
| FR57 — modifier ou supprimer une saisie manuelle | ℹ️ Informatif | Même statut. Complément de FR54. |
| FR52 — dépense commune rangée chez le payeur | ✅ Non retenu | Implicitement couverte par Journey 5, où la ligne est « déjà catégorisée » avant marquage. |
| FR55 — saisie hors réconciliation | ✅ Non retenu | Contrainte, non capacité. Tracée vers le modèle de domaine et la table des risques plutôt que vers un parcours, ce qui est correct. |

**Antérieures à la révision, rappelées pour mémoire :**

| Réf. | Statut |
|---|---|
| FR40 à FR43 — règles de classement | Orphelines de parcours, tracées vers une **mesure réelle** documentée dans le PRD (taux de repli passé de 13,0 % à 10,1 % le 2026-09-05). Justification solide, mais aucun parcours ne décrit l'écriture d'une règle. |
| FR9 — supprimer un relevé | Orpheline **déclarée** dans le PRD, avec sa justification. Traitement exemplaire. |
| FR15 à FR19 — référentiel | Absence de parcours **déclarée et justifiée** : la capacité existait déjà dans le socle et ne constitue pas un moment de valeur. |
| FR37 à FR39 | Phase 2, hors MVP. Sans objet. |

### Évaluation

| | |
|---|---|
| FRs analysées | 62 |
| FRs sans parcours source | 10 |
| dont orphelines **déclarées et justifiées** dans le PRD | 5 (FR9, FR15 à FR19 traitées en bloc) |
| dont orphelines **justifiées hors parcours** | 4 (FR40 à FR43) |
| dont **non justifiées** | 3 (FR53, FR57, **FR58**) |

**Sévérité au barème strict : Critical**, le barème classant ainsi dès qu'une FR orpheline existe. Lecture retenue : **un seul constat mérite action**, FR58. Les autres sont soit déclarées dans le PRD avec leur raison, soit des compléments de rattrapage du même type que FR9, que le PRD assume explicitement.

**Recommandation.** Étendre Journey 5 d'une scène d'ouverture sur la reprise du décompte existant, ou écrire un court Journey 7 sur la bascule depuis l'outil tiers. Cette bascule porte le critère de succès « écart de 0 centime pendant la période de recouvrement », qui n'a aujourd'hui aucun parcours pour le soutenir.

## Fuite d'implémentation

### Dans les exigences

**0 violation sur 91 exigences.**

| Catégorie | Violations |
|---|---|
| Frameworks front (React, Vue, Angular, Svelte, Next, Nuxt…) | 0 |
| Frameworks back (Express, Django, Rails, Spring, FastAPI…) | 0 |
| Bases de données (PostgreSQL, MySQL, MongoDB, Redis, SQLite…) | 0 |
| Plateformes cloud (AWS, GCP, Azure, Vercel, Netlify, Cloudflare) | 0 |
| Infrastructure (Docker, Kubernetes, Terraform…) | 0 |
| Bibliothèques (Redux, Zustand, axios, lodash, jQuery…) | 0 |
| Formats de données (JSON, XML, YAML, CSV) | 0 |
| Protocoles et standards d'identité (REST, GraphQL, WebSocket, OAuth, JWT, SAML, OpenID) | 0 |

Cinq correspondances brutes ont été écartées après examen : quatre sont des faux positifs de recherche de sous-chaîne (`restant`, `reste`, `restaurable`, `restent` contiennent « rest »), et NFR8 mentionne « réponse HTTP » pour désigner l'endroit où la clé d'API ne doit jamais apparaître. Ce dernier est **pertinent pour la capacité** et non une fuite : l'exigence porte sur ce qui doit rester secret, pas sur la façon de construire le serveur.

**Résultat sur la révision du 2026-09-12 :** les 19 FRs et 6 NFRs ajoutées ne contiennent aucun nom de technologie. Le cas le plus exposé était l'authentification, où le réflexe naturel aurait été d'écrire « connexion Google » ou « OAuth ». FR44 dit « un fournisseur d'identité externe », NFR25 dit « l'identité est vérifiée par un fournisseur externe ». Le nom du fournisseur n'apparaît que dans une note de la section domaine, explicitement désignée comme décision d'architecture.

### Hors des exigences

Les sections contextuelles nomment la pile en place : Nuxt, Nitro, SQLite, Drizzle, Zod, Vitest, Playwright, CSS sans framework. Elles se trouvent dans `Project Classification`, `Implementation Considerations`, `Browser Matrix` et la section `Dépendance LLM`.

**Non retenu comme violation.** Le contrat de capacités est constitué des FRs et NFRs, et il est propre. Ces mentions documentent un socle **existant** dans un projet en contexte brownfield : les taire rendrait le PRD moins utile sans le rendre plus conforme.

**Sévérité : PASS.**

## Conformité de domaine

**Domaine déclaré : `general`. Complexité de domaine au référentiel : `low`. Contrôles détaillés : sans objet.**

Aucune section réglementaire spéciale n'est exigée. Deux remarques néanmoins, la révision du 2026-09-12 ayant déplacé deux curseurs.

### Le classement `general` tient toujours

Le référentiel associe le domaine `fintech` aux signaux « payment, banking, transaction, funds », tous présents dans ce PRD. Le classement `general` avait été justifié explicitement : aucun mouvement de fonds, aucun accès bancaire, aucun conseil réglementé, aucune exigence de connaissance client, de lutte anti-blanchiment ou de sécurité des paiements.

**Cette justification survit à la révision.** FR61 « enregistrer un règlement » consigne un virement effectué ailleurs, elle ne l'exécute pas. L'application reste en lecture sur des relevés que l'utilisateur possède déjà. Le classement `general` est maintenu à raison.

À surveiller malgré tout : toute capacité future qui **déclencherait** un virement au lieu de le consigner ferait basculer le domaine en `fintech` et rendrait les sections réglementaires obligatoires.

### Donnée personnelle d'un tiers — point nouveau

Ce qui change réellement, et qu'aucune section ne traite : **jusqu'ici l'utilisateur ne détenait que ses propres données.** Il détiendra désormais, sur un serveur qu'il administre et qui est joignable depuis Internet, les relevés bancaires d'une autre personne identifiée.

**Sévérité : informatif, pas un manquement.** L'exemption dite domestique du règlement européen couvre précisément le traitement mené dans le cadre d'une activité personnelle ou domestique, ce qu'est un foyer par définition. Aucune section de conformité n'est donc requise.

Deux conséquences pratiques valent tout de même d'être notées, et elles relèvent du produit, pas du droit :

- **Le retrait d'un membre ne dit rien de ses données.** FR48 traite le solde, pas les relevés. Que deviennent-ils si la personne quitte le foyer ? Suppression, restitution, conservation ? Le PRD est muet, et c'est la question que la personne invitée posera en premier.
- **NFR12 rend la sauvegarde obligatoire**, donc les relevés d'un tiers seront copiés quelque part. Le lieu de cette copie n'est pas spécifié, ce qui recoupe le constat de mesurabilité sur NFR12.

**Recommandation.** Ajouter une FR sur le sort des données d'un membre retiré, ou déclarer explicitement que la question est hors périmètre. Le silence actuel n'est ni l'un ni l'autre.

## Conformité au type de projet

**Type déclaré : `web_app`.**

### Sections requises

| Section attendue | État | Où |
|---|---|---|
| `browser_matrix` | **présente** | Matrice des navigateurs, avec une limite d'outillage Firefox documentée |
| `responsive_design` | **présente** | Desktop uniquement, avec la tension mobile explicitée depuis le 2026-09-12 |
| `performance_targets` | **présente** | Aucune cible chiffrée, décision assumée et justifiée (NFR23) |
| `seo_strategy` | **présente en tant qu'exclusion motivée** | Déclarée sans objet, motif mis à jour le 2026-09-12 : l'application est joignable depuis Internet mais chaque écran est derrière l'authentification, aucune page publique à indexer |
| `accessibility_level` | **présente** | Aucun niveau WCAG visé, remplacé par trois règles issues de défauts réellement constatés (NFR18 à NFR20) |

**5 sur 5.**

### Sections à exclure

| Section proscrite | État |
|---|---|
| `native_features` | **absente** |
| `cli_commands` | **absente** |

**0 violation.**

Note sur la Phase 3 : l'application progressive installable sur téléphone, promue capacité principale de la phase Vision le 2026-09-12, ne constitue pas une fonctionnalité native. Le référentiel range explicitement « PWA » parmi les signaux de détection du type `web_app`. La trajectoire reste dans le type déclaré.

### Score

**Conformité : 100 %. Sévérité : PASS.**

### Observation hors barème

Le référentiel n'exige une section `auth_model` que pour le type `api_backend`. Ce PRD n'en a donc pas besoin formellement. Sur le fond, l'application vient pourtant d'acquérir un modèle d'authentification et d'autorisation complet, aujourd'hui **dispersé** entre six FRs, quatre NFRs, la section domaine et la classification.

Ce n'est pas un manquement au gabarit, mais un lecteur qui cherche « comment marche l'accès » doit assembler quatre endroits. À considérer au prochain amendement : une section dédiée, ou un renvoi unique depuis la section domaine.

## Qualité SMART des exigences fonctionnelles

**62 FRs notées sur les cinq critères : Spécifique, Mesurable, Atteignable, Pertinente, Traçable. Échelle de 1 à 5.**

### Synthèse

| | |
|---|---|
| Toutes notes ≥ 3 | **98,4 %** (61 sur 62) |
| Toutes notes ≥ 4 | **75,8 %** (47 sur 62) |
| Moyenne générale | **4,84 / 5** |
| FRs signalées (une note < 3) | **1** — FR58 |
| **Sévérité** | **PASS** (barème : moins de 10 % de FRs signalées) |

### Table de notation

| FR | S | M | A | P | T | Moy. | Signalée |
|---|---|---|---|---|---|---|---|
| FR1 | 4 | 4 | 5 | 5 | 5 | 4.6 |  |
| FR2 | 5 | 5 | 5 | 5 | 5 | 5.0 |  |
| FR3 | 5 | 5 | 5 | 5 | 5 | 5.0 |  |
| FR4 | 5 | 5 | 5 | 5 | 5 | 5.0 |  |
| FR5 | 5 | 5 | 5 | 5 | 5 | 5.0 |  |
| FR6 | 5 | 5 | 5 | 5 | 5 | 5.0 |  |
| FR7 | 5 | 5 | 5 | 5 | 5 | 5.0 |  |
| FR8 | 5 | 5 | 5 | 5 | 5 | 5.0 |  |
| FR9 | 5 | 5 | 5 | 4 | 3 | 4.4 |  |
| FR10 | 5 | 5 | 5 | 5 | 5 | 5.0 |  |
| FR11 | 5 | 5 | 5 | 5 | 5 | 5.0 |  |
| FR12 | 5 | 5 | 5 | 5 | 5 | 5.0 |  |
| FR13 | 5 | 5 | 5 | 5 | 5 | 5.0 |  |
| FR14 | 5 | 5 | 5 | 5 | 5 | 5.0 |  |
| FR15 | 5 | 5 | 5 | 5 | 3 | 4.6 |  |
| FR16 | 5 | 5 | 5 | 5 | 3 | 4.6 |  |
| FR17 | 5 | 5 | 5 | 5 | 3 | 4.6 |  |
| FR18 | 5 | 5 | 5 | 5 | 3 | 4.6 |  |
| FR19 | 4 | 5 | 5 | 5 | 3 | 4.4 |  |
| FR20 | 5 | 5 | 5 | 5 | 5 | 5.0 |  |
| FR21 | 5 | 5 | 5 | 5 | 5 | 5.0 |  |
| FR22 | 5 | 5 | 5 | 5 | 5 | 5.0 |  |
| FR23 | 5 | 5 | 5 | 5 | 5 | 5.0 |  |
| FR24 | 5 | 5 | 5 | 5 | 4 | 4.8 |  |
| FR25 | 5 | 5 | 5 | 5 | 5 | 5.0 |  |
| FR26 | 5 | 5 | 5 | 5 | 5 | 5.0 |  |
| FR27 | 5 | 5 | 5 | 5 | 5 | 5.0 |  |
| FR28 | 5 | 5 | 5 | 5 | 5 | 5.0 |  |
| FR29 | 5 | 5 | 5 | 5 | 5 | 5.0 |  |
| FR30 | 5 | 5 | 5 | 5 | 5 | 5.0 |  |
| FR31 | 3 | 3 | 5 | 5 | 5 | 4.2 |  |
| FR32 | 5 | 5 | 5 | 5 | 5 | 5.0 |  |
| FR33 | 5 | 4 | 5 | 5 | 5 | 4.8 |  |
| FR34 | 5 | 4 | 5 | 5 | 5 | 4.8 |  |
| FR35 | 5 | 5 | 5 | 5 | 5 | 5.0 |  |
| FR36 | 5 | 5 | 5 | 5 | 5 | 5.0 |  |
| FR37 | 4 | 3 | 4 | 5 | 4 | 4.0 |  |
| FR38 | 5 | 4 | 5 | 5 | 4 | 4.6 |  |
| FR39 | 5 | 5 | 5 | 5 | 4 | 4.8 |  |
| FR40 | 5 | 5 | 5 | 5 | 3 | 4.6 |  |
| FR41 | 5 | 5 | 5 | 5 | 3 | 4.6 |  |
| FR42 | 5 | 5 | 5 | 5 | 3 | 4.6 |  |
| FR43 | 5 | 5 | 5 | 5 | 3 | 4.6 |  |
| FR44 | 5 | 5 | 5 | 5 | 5 | 5.0 |  |
| FR45 | 5 | 5 | 5 | 5 | 5 | 5.0 |  |
| FR46 | 5 | 5 | 5 | 5 | 5 | 5.0 |  |
| FR47 | 5 | 5 | 5 | 5 | 5 | 5.0 |  |
| FR48 | 5 | 5 | 5 | 5 | 5 | 5.0 |  |
| FR49 | 5 | 5 | 5 | 5 | 5 | 5.0 |  |
| FR50 | 5 | 5 | 5 | 5 | 5 | 5.0 |  |
| FR51 | 5 | 5 | 5 | 5 | 5 | 5.0 |  |
| FR52 | 5 | 5 | 5 | 5 | 4 | 4.8 |  |
| FR53 | 5 | 5 | 5 | 4 | 3 | 4.4 |  |
| FR54 | 5 | 5 | 5 | 5 | 5 | 5.0 |  |
| FR55 | 5 | 5 | 5 | 5 | 4 | 4.8 |  |
| FR56 | 5 | 5 | 5 | 5 | 5 | 5.0 |  |
| FR57 | 5 | 5 | 5 | 4 | 3 | 4.4 |  |
| FR58 | 4 | 5 | 5 | 5 | 2 | 4.2 | **X** |
| FR59 | 5 | 5 | 5 | 5 | 5 | 5.0 |  |
| FR60 | 5 | 5 | 5 | 5 | 5 | 5.0 |  |
| FR61 | 5 | 5 | 5 | 5 | 5 | 5.0 |  |
| FR62 | 5 | 5 | 5 | 5 | 5 | 5.0 |  |
**Légende :** 1 = insuffisant, 3 = acceptable, 5 = excellent. Une FR est signalée dès qu'une note descend sous 3.

### La seule FR signalée

**FR58 — solde d'ouverture du foyer. Traçabilité notée 2.**

L'énoncé est bon : la date et le sens du solde sont exigés, ce qui évite l'erreur la plus probable, une dette inversée. Ce qui manque est en amont. Aucun parcours ne décrit la bascule depuis l'outil de partage existant, alors que le Success Criteria engage un écart de zéro centime entre les deux décomptes pendant la période de recouvrement. Une exigence qui porte un critère de succès sans parcours pour la mettre en situation reste abstraite au moment du découpage en stories.

**Correctif suggéré :** une scène d'ouverture ajoutée à Journey 5, ou un court Journey 7 sur la bascule. Deux paragraphes suffisent.

### Notes basses sans signalement

Quatorze FRs portent au moins un 3, sans franchir le seuil. Trois groupes, de nature différente :

| Groupe | FRs | Note basse | Statut |
|---|---|---|---|
| Référentiel et suppression de relevé | FR9, FR15 à FR19 | Traçabilité 3 | **Assumé.** Le PRD déclare et justifie l'absence de parcours pour ces capacités. |
| Règles de classement | FR40 à FR43 | Traçabilité 3 | **Justifié hors parcours.** Tracées vers une mesure réelle documentée, sans parcours dédié. |
| Compléments du foyer | FR53, FR57 | Traçabilité 3 | Compléments de rattrapage de FR50 et FR54, même statut que FR9. |

**FR31 mérite une mention à part.** Spécificité et mesurabilité à 3, les deux plus basses notes de tout le document hors FR58. « Visualiser l'évolution sur plusieurs périodes consécutives » ne dit ni combien de périodes, ni si la fenêtre est choisie par l'utilisateur ou fixée. La capacité est implémentée depuis longtemps, ce qui explique que personne n'ait buté dessus, mais l'énoncé ne permettrait pas de la réimplémenter à l'identique.

### Lecture du résultat sur la révision du 2026-09-12

Les 19 FRs ajoutées se comportent bien : 16 notées 5 partout, 2 à traçabilité 3 pour des compléments assumés, 1 signalée. Aucune n'est intestable, aucune n'est subjective, aucune ne fuit vers l'implémentation.

## Qualité d'ensemble

### Cohérence et flux du document

**Évaluation : bonne.**

**Forces.**

- **Le document raconte une histoire, et cette histoire est vraie.** L'abandon d'un tableur, la cause identifiée (la saisie, pas l'analyse), la solution, puis l'arrivée d'un second besoin. Chaque section prolonge la précédente.
- **Les décisions sont datées et motivées, y compris les erreurs.** Le retrait puis le rétablissement de Firefox le même jour, la reformulation de NFR14 après vérification du fournisseur, l'inversion de NFR9. Un lecteur nouveau comprend non seulement l'état actuel mais comment on y est arrivé.
- **Les contre-exemples chiffrés portent l'argumentation.** Le renflouement de 690 € qui masquait un déficit, la règle « DUPONT Jean » qui aurait fait disparaître 14 300 € de dépenses. Ces passages font plus pour la compréhension que n'importe quelle définition.
- **La révision du 2026-09-12 s'insère sans rupture.** Aucun en-tête de niveau 2 ajouté, les nouveautés logées sous les sections existantes, chaque inversion citant sa rédaction antérieure.

**Points faibles.**

- **Les strates de révision s'accumulent.** Trois dates cohabitent, et les citations de rédactions antérieures sont dispersées au fil des exigences. Lisible aujourd'hui, coûteux au quatrième amendement.
- **Le modèle d'accès est éclaté.** Authentification, invitation, cloisonnement et exposition réseau vivent dans quatre sections différentes.
- **Deux mécanismes de partage coexistent** — la coupe du compte joint et les dépenses communes — et leur distinction, bien qu'exposée dans un tableau, repose sur une nuance que le lecteur doit tenir en tête.

### Double audience

**Pour les humains.**

| Lecteur | Évaluation |
|---|---|
| Décideur | Excellente. Le résumé exécutif et les critères de succès donnent la vision, le différenciateur et les cibles chiffrées en deux pages. |
| Développeur | Bonne. 62 FRs testables, invariants explicites, cas limites nommés. Manque : la fenêtre de FR31 et la périodicité de sauvegarde de NFR12. |
| Concepteur | Correcte. Six parcours écrits en scènes, ce qui est le bon format. Manque : la bascule depuis l'outil tiers, et aucun document UX n'existe dans le dépôt. |
| Décision partagée | Excellente. Le périmètre est verrouillé, le hors-périmètre énuméré, les risques classés par gravité avec leur mitigation. |

**Pour les modèles.**

| Usage aval | Évaluation |
|---|---|
| Structure exploitable | Excellente. En-têtes de niveau 2 réguliers, exigences numérotées sans trou, tableaux structurés. |
| Génération UX | Correcte. Les parcours sont riches mais aucune spécification d'écran n'existe. |
| Génération d'architecture | Excellente. Invariants, frontières et contraintes sont énoncés sans imposer de solution. |
| Découpage en epics et stories | Bonne. Le séquencement de Phase 1 bis fournit un ordre d'exécution directement exploitable, avec une porte explicite. |

**Note de double audience : 4,5 sur 5.**

### Conformité aux principes BMad

| Principe | État | Note |
|---|---|---|
| Densité d'information | **Respecté** | 0 violation sur les motifs français et anglais |
| Mesurabilité | **Respecté** | 5 constats sur 91 exigences, aucun critique |
| Traçabilité | **Partiel** | 3 FRs sans source, dont FR58 qui porte un critère de succès |
| Conscience du domaine | **Respecté** | Le classement `general` est argumenté plutôt que subi ; le PRD ajoute une catégorie propre, la justesse financière |
| Zéro anti-motif | **Respecté** | Aucun adjectif subjectif, aucune fuite d'implémentation dans les exigences |
| Double audience | **Respecté** | Lisible par un humain, structuré pour un modèle |
| Format Markdown | **Respecté** | Structure conforme, tableaux exploitables |

**6 principes sur 7 pleinement respectés.**

### Note globale

**4,5 sur 5 — Bon, tirant vers excellent.**

Le document est nettement au-dessus de la moyenne des PRD. Ce qui le distingue n'est pas sa complétude mais son **honnêteté** : il documente ses erreurs passées, cite les rédactions qu'il remplace, déclare ses exigences orphelines au lieu de les masquer, et écrit les tensions non résolues plutôt que de les lisser. La tension mobile de la saisie en espèces en est l'exemple le plus net.

Ce qui l'empêche d'atteindre 5 : une lacune de traçabilité qui touche un critère de succès, et une exigence critique sous-spécifiée.

### Les trois améliorations qui comptent

1. **Écrire la bascule depuis l'outil de partage existant.** C'est la seule FR signalée du document, et elle porte un critère de succès chiffré. Deux paragraphes ajoutés à Journey 5, ou un Journey 7 court. Sans cette scène, la reprise du solde sera conçue au moment du code, donc mal.

2. **Spécifier NFR12.** L'exigence la plus critique de la révision est la moins précise : sauvegarde « automatique », sans périodicité, sans rétention, sans destination. Une sauvegarde quotidienne écrite sur le disque qui porte la base ne protège de rien, et rien dans l'énoncé actuel ne l'interdit.

3. **Porter la concurrence en exigence numérotée.** La section Scalabilité observe que deux membres peuvent modifier le solde du foyer simultanément, et annonce un point à vérifier. Une observation en prose n'est pas opposable. FR59 et FR61 écrivent dans un état partagé : il leur faut une NFR.

## Complétude

### Variables de gabarit

**0 variable résiduelle.** Aucune occurrence de `{variable}`, `{{variable}}`, `[TODO]`, `[TBD]`, `[placeholder]` ou `[à compléter]`. Le document ne porte aucune trace de son gabarit.

### Contenu par section

| Section | État | Remarque |
|---|---|---|
| Executive Summary | **complète** | Vision, différenciateur, utilisateurs, et le pivot foyer intégré au résumé |
| Success Criteria | **complète** | Succès utilisateur, métier et technique, plus un tableau de 9 indicateurs chiffrés et datés |
| Product Scope | **complète** | Trois phases plus une Phase 1 bis, hors-périmètre énuméré, stratégie de mitigation des risques |
| User Journeys | **complète** | 6 parcours en scènes, rôles tabulés, capacités révélées listées par parcours |
| Functional Requirements | **complète** | 62 FRs numérotées sans trou ni doublon |
| Non-Functional Requirements | **complète** | 29 NFRs numérotées sans trou ni doublon, 9 catégories |

**6 sections cœur sur 6.**

### Complétude par critère

| Critère | Résultat |
|---|---|
| Critères de succès mesurables | **tous** — chaque ligne du tableau porte une cible et une échéance |
| Parcours couvrant tous les types d'utilisateurs | **oui** — membre et fondateur couverts, les rôles inexistants déclarés comme tels |
| FRs couvrant le périmètre MVP | **oui** — les 9 capacités de Phase 1 bis correspondent une à une aux FR44 à FR62 et à NFR12 |
| NFRs portant un critère spécifique | **28 sur 29** — NFR23 est une non-exigence assumée, NFR12 manque de précision |

### Frontmatter

| Champ | État |
|---|---|
| `stepsCompleted` | **présent**, 15 étapes dont les 3 de la révision |
| `classification` | **présent** — domaine, type de projet, complexité, contexte |
| `inputDocuments` | **présent**, mais un document listé est introuvable sur le disque |
| Date | **partiel** — pas de clé `date:`, mais `lastEdited: '2026-09-12'` et une date dans le corps |
| `editHistory` | présent, ajouté le 2026-09-12 |

**4 champs sur 4, dont 1 partiel.**

### Synthèse

**Complétude : 100 % des sections, aucune lacune critique.**

Trois constats mineurs, tous dans le frontmatter :

| Constat | Sévérité |
|---|---|
| `documentCounts.briefs: 1` alors qu'aucun brief n'existe | mineur |
| `~/Downloads/Dépenses 2022(1).xlsx` listé en entrée mais introuvable | mineur |
| Pas de clé `date:` explicite | cosmétique |

**Sévérité : Warning**, au seul titre de ces trois écarts de métadonnées. Aucun n'affecte l'exploitabilité du document en aval.

## Synthèse finale

**Statut global : Warning. Le PRD est exploitable en l'état pour le découpage en epics et stories.**

### Résultats par contrôle

| Contrôle | Résultat |
|---|---|
| Format | **BMAD Standard**, 6 sections cœur sur 6 |
| Densité d'information | **PASS** — 0 violation |
| Couverture du brief | sans objet — aucun brief n'existe |
| Mesurabilité | **Warning** — 5 constats sur 91 exigences, aucun critique |
| Traçabilité | **Critical au barème strict** — 3 FRs sans source, 1 seule à traiter |
| Fuite d'implémentation | **PASS** — 0 violation |
| Conformité de domaine | sans objet — domaine `general` confirmé |
| Conformité au type de projet | **PASS** — 100 %, 5 sections requises sur 5 |
| Qualité SMART | **PASS** — 98,4 % des FRs à toutes notes ≥ 3, moyenne 4,84 sur 5 |
| Qualité d'ensemble | **4,5 sur 5** — 6 principes BMad sur 7 |
| Complétude | **Warning** — 100 % des sections, 3 écarts de métadonnées |

### Problèmes critiques

**Aucun.** Le seul contrôle classé Critical l'est par une règle mécanique du barème, qui déclenche dès qu'une FR est orpheline. Cinq des dix FRs concernées sont déclarées orphelines **dans le PRD lui-même**, avec leur justification, et quatre autres sont tracées vers une mesure documentée. Une seule mérite action.

### Avertissements

| # | Constat | Sévérité |
|---|---|---|
| 1 | **FR58** — aucun parcours ne couvre la reprise du décompte tenu dans l'outil tiers, alors qu'un critère de succès chiffré en dépend | modéré |
| 2 | **NFR12** — sauvegarde exigée sans périodicité, sans rétention, sans destination. L'exigence la plus critique de la révision est la moins précise | modéré |
| 3 | **Concurrence** — deux membres peuvent modifier le solde du foyer simultanément. Observé en prose dans la section Scalabilité, porté par aucune NFR | modéré |
| 4 | **FR31** — « plusieurs périodes consécutives » ne dit ni combien, ni qui choisit la fenêtre. Antérieur à la révision | modéré |
| 5 | **Retrait d'un membre** — FR48 traite le solde, pas le sort des relevés de la personne retirée | mineur |
| 6 | `documentCounts.briefs: 1` alors qu'aucun brief n'existe | mineur |
| 7 | Un document d'entrée listé en frontmatter est introuvable sur le disque | mineur |
| 8 | **NFR6** — affirme que seuls date, libellé et montant sont transmis au fournisseur LLM. `CLAUDE.md` documente que c'est inexact, le modèle réalisant l'extraction. **Antérieur à la révision, hors du plan d'édition approuvé** | à trancher |

### Forces

- **Densité et propreté du contrat de capacités.** Zéro remplissage, zéro adjectif subjectif, zéro nom de technologie dans 91 exigences.
- **La frontière produit-architecture est tenue là où elle est la plus fragile.** FR44 dit « fournisseur d'identité externe », pas « Google ».
- **Les inversions sont assumées et citées.** NFR9 et NFR12 portent leur rédaction antérieure, ce qui rend la bascule vérifiable.
- **Les orphelines sont déclarées, pas masquées.** FR9 et le bloc du référentiel documentent eux-mêmes pourquoi aucun parcours ne les porte.
- **Les risques neufs sont écrits avant d'avoir coûté.** Double comptage du règlement, pollution de la réconciliation, abandon de la saisie en espèces faute de mobile.
- **La tension non résolue est écrite plutôt que lissée.** Le desktop exclusif contre la saisie contemporaine des dépenses en espèces.

### Les trois améliorations qui comptent

1. **Écrire la bascule depuis l'outil de partage existant** — deux paragraphes dans Journey 5, ou un Journey 7 court.
2. **Spécifier NFR12** — périodicité, rétention, destination distincte du disque portant la base.
3. **Porter la concurrence en NFR numérotée** — FR59 et FR61 écrivent dans un état partagé.

### Recommandation

Le PRD peut servir de source au découpage en epics et stories dès maintenant. Les trois améliorations ci-dessus se traitent en une courte passe d'édition et gagnent à être faites **avant** le découpage : elles produiraient sinon des stories sous-spécifiées sur la sauvegarde, la reprise de solde et la concurrence.

Rappel de la règle projet : aucune implémentation ne démarre sans `epics.md` à jour et sans `sprint-status.yaml` généré pour le chantier.

---

## Suite donnée — passe d'édition du 2026-09-12

Les constats ci-dessus ont été traités le jour même, dans une seconde passe d'édition du PRD.

| # | Constat | Suite |
|---|---|---|
| 1 | FR58 sans parcours source | **Résolu.** `Journey 7 — Reprendre le décompte existant` ajouté. FR58 renforcée d'une relecture en toutes lettres avant enregistrement, le sens inversé étant l'erreur que rien d'autre ne rattrape. |
| 2 | NFR12 sous-spécifiée | **Résolu.** Sauvegarde quotidienne, rétention de 30 jours minimum, destination sur une machine du réseau local distincte de l'hôte, restauration vérifiée par restauration réelle. |
| 3 | Concurrence non portée par une exigence | **Résolu.** NFR30 ajoutée : une écriture fondée sur un état obsolète est refusée et son auteur informé, jamais appliquée silencieusement. La section Scalabilité renvoie désormais à cette exigence. |
| 4 | FR31 fenêtre non spécifiée | **Résolu.** Réécrite d'après le comportement livré le 2026-09-07 : l'utilisateur choisit ce qu'il regarde — trimestre, année, ou historique complet — et le découpage de la série est toujours le mois. |
| 5 | Sort des relevés d'un membre retiré | **Tranché : hors périmètre**, déclaré explicitement avec sa justification et sa conséquence. L'export, qui conditionnerait un autre choix, est porté en Phase 3. |
| 6 | `documentCounts.briefs: 1` | **Corrigé** à `0`. |
| 7 | Document d'entrée introuvable | **Corrigé.** La référence est conservée pour mémoire, annotée comme introuvable au 2026-09-12. |
| 8 | Absence de clé `date:` | **Corrigé.** |
| — | FR53 et FR57 orphelines | **Déclarées** dans le PRD, au même titre que FR9, avec leur justification. |
| 9 | **NFR6 — promesse non tenue par le code** | **Non traité.** Hors du plan d'édition approuvé, et antérieur à la révision du foyer. Reste ouvert. |

### Effet sur les contrôles

| Contrôle | Avant | Après |
|---|---|---|
| Traçabilité | 3 FRs sans source non justifiée | **0** — FR58 tracée au Journey 7, FR53 et FR57 déclarées |
| Mesurabilité | 5 constats | **2** — NFR23 (non-exigence assumée) et FR1 (borne de dépôt, informatif) |
| Complétude | 3 écarts de métadonnées | **0** |
| Exigences | 62 FRs, 29 NFRs | 62 FRs, **30 NFRs**, 7 parcours |

### Reste ouvert

**NFR6.** Le PRD affirme que seuls la date, le libellé et le montant sont transmis au fournisseur LLM. `CLAUDE.md` documente que le modèle réalise l'extraction et reçoit donc les lignes brutes du relevé, et que le nom du titulaire figure de toute façon dans les libellés bancaires. L'exigence promet une garantie que le code n'applique pas.

Deux issues, toutes deux hors de cette passe : corriger le code pour qu'il tienne l'exigence, ou corriger l'exigence pour qu'elle décrive la réalité. La seconde est la plus honnête à court terme, la première la plus fidèle à l'intention d'origine. **À trancher avant la prochaine livraison touchant l'ingestion.**

---

**Mise à jour du 2026-09-12, fin de journée.** Le constat n° 9 de ce rapport — NFR6, promesse non
tenue par le code — est **clos**. Voir la section « Clôture de NFR6 » de
`validation-report-2026-09-12-agent.md`. L'arbitrage de l'utilisateur : les libellés bancaires ne
sont pas sensibles, les identifiants bancaires le sont. Les seconds étaient déjà coupés par le code ;
seule la description était fausse, et elle a été réécrite.

**Plus aucun constat ouvert dans ce rapport.**
