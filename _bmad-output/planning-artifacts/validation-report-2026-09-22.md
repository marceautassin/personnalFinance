---
validationTarget: '_bmad-output/planning-artifacts/prd.md'
validationDate: '2026-09-22'
inputDocuments:
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/planning-artifacts/architecture.md (sections D30-D36, par recherche ciblée)
  - CLAUDE.md
  - relevé Crédit Mutuel d'exemple (hors dépôt, identifiants masqués à la lecture)
validationStepsCompleted: ['step-v-01-discovery', 'step-v-02-format-detection', 'step-v-03-density-validation', 'step-v-04-brief-coverage-validation', 'step-v-05-measurability-validation', 'step-v-06-traceability-validation', 'step-v-07-implementation-leakage-validation', 'step-v-08-domain-compliance-validation', 'step-v-09-project-type-validation', 'step-v-10-smart-validation', 'step-v-11-holistic-quality-validation', 'step-v-12-completeness-validation']
validationStatus: COMPLETE
holisticQualityRating: '4/5'
overallStatus: 'Pass (après corrections)'
---

# Rapport de validation du PRD

**PRD validé :** `_bmad-output/planning-artifacts/prd.md`
**Date :** 2026-09-22
**Portée :** amendement « Profils et banques » (FR73-FR81, NFR35-NFR36, Journey 9, amendements FR46, FR49, FR72, NFR6, NFR9, NFR24), et sa cohérence avec le reste du document.

## Documents d'entrée

- PRD — chargé
- Architecture — sections D30 à D36 consultées (le document fait foi pour les décisions techniques)
- `CLAUDE.md` — chargé
- `prd-v1-forecast.md` — archivé, écarté (le projet interdit de s'en servir comme référence)
- Tableur `Dépenses 2022(1).xlsx` — introuvable, déjà signalé au 2026-09-12
- Relevé Crédit Mutuel d'exemple — lu, fonde FR79, FR80 et NFR36 ; aucun identifiant reporté

## Synthèse

**Statut global : Avertissement** — PRD utilisable, aucun constat bloquant, cinq points à corriger avant le découpage en epics.

| Contrôle | Résultat |
|---|---|
| Format | BMAD Standard, 6/6 |
| Densité | Réussi |
| Mesurabilité | Avertissement (FR80 ×2, NFR36) |
| Traçabilité | Avertissement (FR78 orphelin, critère de succès manquant) |
| Fuite d'implémentation | Réussi |
| Domaine | Réussi |
| Type de projet | 100 % |
| SMART | 89 % sans note < 3, moyenne 4,7 |
| Qualité d'ensemble | 4/5 |
| Complétude | 83 % |

**Constats bloquants :** aucun.

**Avertissements, à corriger avant les epics :**
1. FR80 — date qui range un achat du détail carte (achat ou débit) non tranchée.
2. FR80 — agrégat carte sans détail : comportement non dit.
3. NFR36 — « hors libellés » exempte à tort les numéros de compte glissés dans les libellés.
4. FR78 — orphelin non déclaré.
5. Pas de critère de succès d'usage pour le chantier.

**Observations :** dualité profil / membre non définie · Journey 6 ne montre plus le cas le plus probable · justifications « mono-utilisateur » périmées (Accessibilité, NFR34) · poids des notes historiques.

## Détection du format

**Sections de niveau 2 :** Executive Summary · Project Classification · Success Criteria · User Journeys · Domain-Specific Requirements · Web Application Specific Requirements · Project Scoping & Phased Development · Dépendance LLM · Functional Requirements · Non-Functional Requirements

**Sections BMAD présentes :** Executive Summary ✓ · Success Criteria ✓ · Product Scope ✓ (« Project Scoping & Phased Development ») · User Journeys ✓ · Functional Requirements ✓ · Non-Functional Requirements ✓

**Classification :** BMAD Standard — 6/6

## Densité d'information

Motifs recherchés dans leur forme française (document rédigé en français) : « il est important de », « le système permettra », « afin de », « dans le but de », « en raison du fait que », « à l'heure actuelle », redondances.

**Remplissage conversationnel :** 0 · **Tournures verbeuses :** 0 · **Redondances :** 0

**Sévérité :** Réussi

**Observation hors grille.** Le document est dense phrase à phrase, mais **long** : les notes historiques en italique (« Rédaction précédente : … ») s'accumulent à chaque révision. L'amendement du 2026-09-22 en ajoute plusieurs. Ce n'est pas du remplissage — c'est la trace des décisions — mais le ratio exigence / historique baisse. À surveiller : une passe de condensation dans un document d'historique séparé deviendra rentable.

## Couverture du Product Brief

**Statut :** sans objet — aucun Product Brief en entrée.

## Mesurabilité

*Portée : les exigences ajoutées ou amendées le 2026-09-22. Le reste a été validé le 2026-09-12 et n'a pas changé.*

### Exigences fonctionnelles — FR73 à FR81, FR46, FR49, FR72 (12 analysées)

**Format « acteur peut capacité » :** conforme. FR75, FR76, FR79, FR80, FR81 sont des énoncés de comportement système — forme déjà admise dans ce PRD (FR5, FR10, FR55).
**Adjectifs subjectifs :** 0 · **Quantificateurs vagues :** 0
**Fuite d'implémentation :** 0 bloquante. « endpoint » (FR76) est déjà employé par NFR24 et NFR32 : vocabulaire du document, admis.

**Constats :**

- ⚠️ **FR80 — date d'un achat du détail carte non spécifiée.** Sur le relevé d'exemple, le détail couvre des achats **antérieurs** à la période du relevé (achat au 31/01 pour un relevé ouvert au 04/02). Selon que l'analyse retient la date d'achat ou la date de débit, la dépense tombe dans l'un ou l'autre mois — et, avec la date d'achat, dans une période déjà couverte par le relevé précédent. C'est une **décision produit** (quel mois porte la dépense), pas un détail d'implémentation. Non tranchée.
- ⚠️ **FR80 — cas « agrégat sans détail » non couvert.** L'énoncé traite l'agrégat accompagné de son détail. Si le détail manque (mise en page différente, page absente), le comportement attendu n'est pas dit : garder l'agrégat ? marquer non fiable ?
- ℹ️ **FR78 — « ne correspond pas à la banque choisie ».** Testable (déposer un relevé Boursorama sous Crédit Mutuel → refus), mais le critère de reconnaissance n'est pas nommé. Acceptable au niveau PRD, à fixer en architecture.

**Violations FR :** 0 de forme · 2 avertissements de complétude

### Exigences non fonctionnelles — NFR35, NFR36, NFR6, NFR9, NFR24 (5 analysées)

- ✅ **NFR35** — critère, métrique et méthode présents (tentative de connexion depuis l'extérieur, refusée).
- ⚠️ **NFR36 — portée ambiguë de « hors libellés d'opération ».** La phrase se lit comme exemptant **tous** les identifiants listés lorsqu'ils figurent dans un libellé. Or la ligne de risque « Identifiants bancaires propres au Crédit Mutuel » et NFR6 (« aucun identifiant bancaire ne quitte la machine ») exigent de couper les **numéros de compte** glissés dans les libellés (virement vers un plan d'épargne). Seuls le **nom** et l'**adresse** du titulaire sont un résidu admis dans les libellés. Correction proposée : « aucun IBAN, numéro de compte ni numéro de carte, **y compris dans les libellés** ; aucun nom ni adresse du titulaire **hors libellés** ».
- ✅ NFR6 (paragraphe « Par banque »), NFR9, NFR24 — précisions de portée, sans perte de mesurabilité.

**Violations NFR :** 1 avertissement

**Sévérité :** Avertissement (3 constats, aucun bloquant)

## Traçabilité

### Chaînes

- **Résumé exécutif → critères de succès** : ⚠️ partielle. Le résumé annonce le cloisonnement par profil et Crédit Mutuel ; les **indicateurs mesurables** suivent (migration sans perte, 0 identifiant transmis, 100 % de relevés Crédit Mutuel réconciliés). En revanche, la section **User Success** n'a pas de « critère qui tranche » pour ce chantier, alors que chacun des trois autres en a un (tableur non rouvert, outil tiers non ouvert, écran évité). Rien ne dit à quel moment le chantier est **réussi à l'usage**, et pas seulement livré.
- **Critères → parcours** : ✅ les trois indicateurs ajoutés se vérifient dans le Journey 9.
- **Parcours → FR** : ✅ le Journey 9 s'appuie sur FR73 à FR80.
- **Périmètre → FR** : ✅ le tableau « Ordre des chantiers » renvoie à FR73-FR81. ℹ️ Contrairement à la Phase 1 bis, aucun bloc « capacités indispensables » et aucun séquencement interne au chantier. Acceptable pour 9 FR ; l'ordre migration → cloisonnement → banque → Crédit Mutuel est implicite.

### Matrice

| FR | Source |
|---|---|
| FR73, FR74 | Journey 9 (création, bascule) |
| FR75 | Journey 9 (historique intact) |
| FR76 | Journey 9 (« ne voit que ses propres données ») · NFR24 |
| FR77 | Journey 9 (« la banque est déjà proposée ») |
| FR78 | ⚠️ **aucun parcours** — capacité de rattrapage, au même titre que FR9, FR53, FR57, FR71, qui sont déclarées orphelines par une note. FR78 ne l'est pas. |
| FR79, FR80 | Journey 9 (climax) |
| FR81 | ℹ️ implicite dans le Journey 9 (deux profils, deux historiques), jamais montré |

### Orphelins

- **FR orphelines non déclarées :** 1 — FR78.
- **Critères sans parcours :** 0.
- **Parcours sans FR :** 0.

ℹ️ **Journey 6 non retouché.** Il décrit une personne qui arrive « sur une application vide » par invitation. Depuis FR46 amendée, une personne déjà dotée d'un profil y est **rattachée** à la connexion. Le parcours reste juste pour une personne nouvelle ; il ne montre plus le cas le plus probable.

**Sévérité :** Avertissement (1 orphelin non déclaré, 1 critère de succès manquant)

## Fuite d'implémentation

*Portée : texte ajouté le 2026-09-22.*

- Aucune technologie, bibliothèque, structure de données ni table nommée dans FR73-FR81, NFR35, NFR36.
- « endpoint » (FR76) : vocabulaire déjà employé par NFR24 et NFR32 — pertinent pour la capacité (le cloisonnement se prouve à la requête, pas à l'écran).
- `marceau` (FR75) : identifiant de **donnée**, pas de code — il est vérifiable par l'utilisateur.
- ℹ️ Préexistant, hors amendement : NFR6 nomme `pdf-extractor`, NFR34 cite `zai-glm-5-2`. Admis au 2026-09-12 comme ancrage de garanties décrites telles que le code les applique.

**Violations :** 0 · **Sévérité :** Réussi

## Conformité au domaine

**Domaine :** `general` (faible complexité selon la table BMAD) — classement argumenté dans le PRD, reconduit.

Aucune section réglementaire exigée. La section « Domain-Specific Requirements » traite déjà les contraintes réelles (justesse, confidentialité).

ℹ️ **Nouveauté du 2026-09-22 à connaître, sans exigence à ajouter.** L'application traitera désormais les relevés d'une **autre personne**, déposés et administrés par Marceau sur sa machine. L'usage reste strictement domestique, donc hors de toute obligation formelle. Mais c'est la première fois que le produit détient des données financières d'un tiers, et NFR35 est la seule barrière entre ce tiers et quiconque ouvre l'application. Le PRD le dit (Journey 9, « Ce que ce parcours ne protège pas »). Constat conforme.

**Sévérité :** Réussi

## Conformité au type de projet

**Type :** `web_app`

| Section exigée | État |
|---|---|
| browser_matrix | ✅ présente |
| responsive_design | ✅ présente |
| performance_targets | ✅ présente (absence de cible, argumentée) |
| seo_strategy | ✅ déclarée sans objet, argumentée |
| accessibility_level | ✅ présente |

Sections exclues (`native_features`, `cli_commands`) : absentes ✅.

ℹ️ **Justifications devenues fausses.** La section Accessibilité écarte WCAG AA au motif d'une « application mono-utilisateur locale » et de son « unique utilisateur » ; la note de NFR34 parle d'une « application mono-machine administrée par son utilisateur ». Depuis le 2026-09-12 — et concrètement depuis le chantier de rang 1 — deux personnes l'utilisent. La **décision** peut rester la même ; sa **justification** ne tient plus. Préexistant à l'amendement, rendu visible par lui.

**Conformité :** 100 % · **Sévérité :** Réussi (1 observation)

## Qualité SMART des exigences fonctionnelles

*Portée : FR73 à FR81 (9 FR). Les 72 autres ont été notées le 2026-09-12.*

| FR | S | M | A | R | T | Moy. | Note |
|---|---|---|---|---|---|---|---|
| FR73 | 5 | 5 | 5 | 5 | 5 | 5,0 | |
| FR74 | 5 | 5 | 5 | 5 | 5 | 5,0 | |
| FR75 | 5 | 5 | 4 | 5 | 5 | 4,8 | A=4 : rebuild de cinq tables à clé textuelle (D30), réalisable mais délicat |
| FR76 | 5 | 5 | 5 | 5 | 5 | 5,0 | |
| FR77 | 5 | 5 | 5 | 5 | 5 | 5,0 | |
| FR78 | 3 | 4 | 4 | 5 | 2 | 3,6 | ⚠️ critère de « non-correspondance » non nommé ; orphelin non déclaré |
| FR79 | 5 | 5 | 4 | 5 | 5 | 4,8 | A=4 : les sections se distinguent par leur en-tête, repérable sur l'exemple |
| FR80 | 3 | 5 | 4 | 5 | 5 | 4,4 | ⚠️ date de rattachement de l'achat et cas « agrégat sans détail » non dits |
| FR81 | 5 | 5 | 5 | 5 | 4 | 4,8 | |

**FR avec une note < 3 :** 1 (FR78, traçabilité) · **Toutes notes ≥ 3 :** 89 % · **Moyenne :** 4,7 / 5

**Suggestions**
- **FR78** — ajouter une note d'orphelin déclaré (capacité de rattrapage, comme FR9) ; laisser le critère de reconnaissance à l'architecture.
- **FR80** — trancher la date qui range un achat du détail (date d'achat ou date de débit de l'agrégat), et le comportement si l'agrégat arrive sans détail.

**Sévérité :** Avertissement (< 10 % de FR sous 3 dans un critère, mais une FR critique pour la justesse — FR80 — encore incomplète)

## Qualité d'ensemble

### Fil et cohérence — Bon

**Forces**
- L'amendement **dit ce qu'il ne protège pas** (Journey 9, NFR35, risque « profil choisi par la mauvaise personne »). Report assumé plutôt que promesse implicite : même discipline que la réécriture de NFR6.
- La migration unique est préservée : le foyer n'en refait pas une (note sous la séquence Phase 1 bis). Aucune contradiction de séquence introduite.
- Les exigences Crédit Mutuel viennent d'un **relevé réel**, pas d'une supposition : les deux pièges du format (plusieurs comptes, débit différé) sont nommés avant le code.

**Faiblesses**
- **Deux mots pour le propriétaire des données : « profil » et « membre ».** Leur relation n'est dite qu'en creux (note de cadrage des parcours, FR46 amendée, FR49 précisée). En aval, l'architecture et les stories risquent d'en faire deux entités. Il manque une phrase de définition au modèle de domaine : *un profil est l'espace qui possède les données ; un membre est un profil auquel une identité vérifiée est rattachée.*
- Accumulation de notes historiques : lisible pour un humain qui suit le projet, coûteuse pour un lecteur neuf ou un LLM en aval.

### Double audience — 4/5

- **Humains** : le « pourquoi » de chaque arbitrage est présent ; un tiers comprend le report de l'authentification et son prix.
- **LLM en aval** : FR numérotées, sections `##` stables. Le découpage en epics est direct (un epic « Profils », un epic « Banques / Crédit Mutuel »). Frein : la dualité profil / membre ci-dessus.

### Principes BMAD

| Principe | État |
|---|---|
| Densité | Partiel — dense phrase à phrase, alourdi par l'historique |
| Mesurabilité | Partiel — FR80 et NFR36 à préciser |
| Traçabilité | Partiel — FR78 orphelin non déclaré, critère de succès du chantier absent |
| Conscience du domaine | Conforme |
| Zéro anti-pattern | Conforme |
| Double audience | Conforme |
| Markdown | Conforme |

### Note globale : **4/5 — Bon**

### Trois améliorations prioritaires

1. **Trancher FR80** : quelle date range un achat du détail carte, et que faire d'un agrégat sans détail. C'est la seule question ouverte qui touche la **justesse** d'un montant.
2. **Définir profil et membre** en une phrase au modèle de domaine, avant que l'architecture ne les modélise.
3. **Donner au chantier son critère qui tranche** (User Success), et **lever l'ambiguïté de NFR36** sur les numéros de compte présents dans les libellés.

## Complétude

**Variables de gabarit restantes :** 0 ✓

| Section | État |
|---|---|
| Executive Summary | Complète |
| Success Criteria | Incomplète — pas de critère d'usage pour le chantier « Profils et banques » |
| Product Scope | Complète |
| User Journeys | Complète — Journey 9 ajouté |
| Functional Requirements | Complète — FR80 à préciser |
| Non-Functional Requirements | Complète — NFR36 à préciser |

- **Mesurabilité des critères de succès :** tous mesurables.
- **Couverture des types d'utilisateurs :** oui — la « seconde personne » est couverte par le Journey 9 ; pas de persona dédiée, ce qui est cohérent avec la note de cadrage (les rôles naissent avec FR44).
- **FR couvrant le périmètre du chantier :** oui.
- **NFR à critères précis :** toutes, sous réserve de NFR36.

**Frontmatter :** `classification` ✓ · `inputDocuments` ✓ · `lastEdited` 2026-09-22 ✓ · `editHistory` ✓ · `stepsCompleted` ✓

**Complétude globale :** 10/12 éléments complets (83 %)

**Sévérité :** Avertissement

## Corrections appliquées le 2026-09-22

| Constat | Correction | Décision |
|---|---|---|
| FR80 — date d'achat | Achat daté du jour d'achat ; conséquence sur les périodes écrite | Marceau |
| FR80 — agrégat sans détail | Agrégat conservé, relevé « non fiable » avec cause | Marceau |
| NFR36 — ambiguïté | IBAN, numéros de compte et de carte coupés **y compris dans les libellés** ; seuls nom et adresse admis dans les libellés | cohérence NFR6 |
| FR78 — orphelin | Note d'orphelin déclaré | convention du PRD |
| Critère de succès manquant | « La seconde personne se débrouille seule » + indicateur (0 intervention sur 3 mois) | Marceau |
| Profil / membre | Définition au modèle de domaine | top 3 |

**Restent ouverts (observations, sans décision prise) :** justifications « mono-utilisateur » de la section Accessibilité et de la note de NFR34 · Journey 6 à réécrire pour le cas « profil existant » · poids des notes historiques.

**Statut après corrections : Réussi, avec observations.**
