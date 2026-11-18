---
validationTarget: '_bmad-output/planning-artifacts/prd.md'
validationDate: '2026-09-12'
scope: >-
  Troisième et quatrième passes du 2026-09-12 : périmètre « agent conversationnel »
  (FR65-FR72, NFR31-NFR34, Journey 8, FR37 absorbée, NFR17 étendue, section
  « Ordre des chantiers ») et constats nés du découpage (FR63, FR64, doctrine
  flux/stock, FR49/FR50/NFR24 amendées).
predecessor: '_bmad-output/planning-artifacts/validation-report-2026-09-12.md'
inputDocuments:
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/planning-artifacts/epics.md
  - _bmad-output/planning-artifacts/architecture.md
  - CLAUDE.md
  - server/services/llm-categorizer.ts
validationStepsCompleted:
  - step-v-01-discovery
  - step-v-02-format-detection
  - step-v-03-density-validation
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
holisticQualityRating: '4.5/5'
overallStatus: 'Warning — 3 incohérences internes à corriger, aucune bloquante'
---

# Rapport de validation — périmètre agent conversationnel

**Second rapport du 2026-09-12.** Le premier, `validation-report-2026-09-12.md`, couvrait la
révision « foyer ». Il n'est pas écrasé : celui-ci porte les passes 3 et 4.

## Résultats mécaniques

| Contrôle | Résultat |
|---|---|
| Format | **BMAD Standard**, 6 sections cœur sur 6, aucun en-tête de niveau 2 ajouté |
| Densité d'information | **PASS** — 0 remplissage, motifs français et anglais |
| Adjectifs subjectifs dans les exigences | **PASS** — 0 |
| Quantificateurs vagues | **PASS** — la seule occurrence est une **citation** de la rédaction antérieure de FR31 |
| Fuite d'implémentation | **PASS** — 0 |
| Numérotation | **PASS** — FR1 à FR72 et NFR1 à NFR34, sans trou ni doublon |

**La fuite d'implémentation était le risque principal de cet amendement, et il est évité.** Aucune
occurrence de `glm`, `zai`, `mistral`, `google`, `oauth`, `openid`, `jwt`, ni d'aucun nom de
framework, dans les 106 exigences. Le nom du modèle n'apparaît que dans une note explicative sous
NFR34 et dans la section `Dépendance LLM`, toutes deux hors du contrat de capacités. NFR34 dit « la
configuration d'environnement », jamais un identifiant.

## Incohérences internes — les trois constats qui comptent

L'amendement a déplacé l'ordre des chantiers sans mettre à jour trois passages qui décrivaient
l'ancien.

| # | Constat | Sévérité |
|---|---|---|
| **1** | **« Phase 1 bis — Le foyer » dit : « Elle suit la Phase 1 […] et précède les phases 2 et 3. »** C'est faux depuis l'amendement : l'agent passe devant. La section « Ordre des chantiers », ajoutée en tête du périmètre, dit l'inverse. **Deux passages du même document se contredisent** sur la seule chose qu'un lecteur pressé va chercher : par quoi commencer. | ⚠️ **Modéré, à corriger** |
| **2** | **« Phase 2 — Croissance » liste toujours « Analyse narrative par LLM ».** Or FR37 a été absorbée par l'agent, qui est le premier chantier. La capacité figure donc à la fois comme livrée en premier et comme croissance ultérieure. | ⚠️ **Modéré, à corriger** |
| **3** | **« Phase 1 bis » ne cite que les Journeys 5 et 6.** Le Journey 7, ajouté en deuxième passe le même jour pour combler l'orpheline FR58, n'a jamais été ajouté à cette liste. Le parcours existe, il n'est rattaché à aucune phase. | ⚠️ **Modéré, à corriger** |

**Cause commune.** Quatre passes d'amendement en une journée sur un document de 942 lignes. Chaque
passe a mis à jour ce qu'elle touchait, aucune n'a relu les listes récapitulatives que d'autres
sections tiennent en parallèle. C'est le coût de la duplication : le périmètre est décrit deux fois,
une fois par phase et une fois par chantier.

## Mesurabilité

**106 exigences. 3 constats.**

| Réf. | Sévérité | Constat |
|---|---|---|
| **Coût** | ⚠️ **Modéré** | Le PRD dit « Pas de plafond de coût LLM : contrainte écartée explicitement par l'utilisateur ». **Cette décision a été prise quand le fournisseur n'était appelé qu'à l'ingestion, un geste mensuel.** L'agent en fait une consultation quotidienne et multi-tours. La prémisse a changé, la conclusion n'a pas été réexaminée. Elle reste peut-être juste, mais elle n'est plus la même décision. |
| **Latence** | ⚠️ **Modéré** | NFR23 écarte toute cible de performance. C'était défendable pour un traitement par lot déclenché à la main. **L'agent est la première surface interactive du produit** : une réponse à quarante secondes y est vécue comme une panne, là où une ingestion à quarante secondes est normale. Aucune exigence ne couvre ce cas. |
| FR66 ↔ NFR31 | ℹ️ Informatif | Les deux énoncent la même règle — aucun montant non reçu. La redondance n'est pas fausse, mais une règle inscrite à deux endroits diverge au premier amendement. NFR31 est la formulation la plus précise et devrait faire autorité. |

**Les quatre NFRs ajoutées sont toutes testables**, et NFR31 est la meilleure exigence de
l'amendement : elle rend vérifiable ce que NFR15 énonçait sans qu'aucun test ne puisse le constater.

| Réf. | Comment la vérifier |
|---|---|
| NFR31 | comparer chaque nombre d'une réponse à l'ensemble des nombres reçus du moteur |
| NFR32 | contrôle statique : aucun import du client de base depuis les modules de l'agent |
| NFR33 | toute réponse portant un montant expose sa période, son filtre et son lien |
| NFR34 | aucun identifiant de modèle en dur ; valeurs distinctes par usage |

## Traçabilité

| FR | Source | Statut |
|---|---|---|
| FR65 à FR70 | Journey 8 | **tracées** |
| **FR71** — supprimer une conversation | aucune | ⚠️ **orpheline non déclarée** — capacité de rattrapage, même statut que FR9, FR53 et FR57, mais sans la note qui l'assume |
| **FR72** — l'agent n'interroge que ses données et les communes | FR64, NFR24 | tracée vers une **contrainte**, pas vers un parcours. Correct, mais à dire |

**Le Journey 8 couvre 6 FRs sur 8.** Aucune exigence n'est intestable, aucune n'est fausse ; il
manque deux notes de déclaration, exactement comme pour FR53 et FR57 en deuxième passe.

**Lacune de couverture.** Rien n'encadre la **croissance des conversations**. Elles s'accumulent
sans borne, et NFR12 les sauvegarde quotidiennement. Ni rétention, ni volume, ni purge. Mineur
aujourd'hui, structurant dans deux ans.

## Conformité

| Contrôle | Résultat |
|---|---|
| Domaine | `general` **maintenu à raison** — l'agent lit et décrit, il ne conseille pas et n'exécute aucun mouvement de fonds |
| Type de projet | `web_app`, **100 %** — un écran de conversation ne change ni les sections requises ni les sections proscrites |
| Complétude | **PASS** — 0 variable de gabarit, 6 sections cœur sur 6, frontmatter complet avec 4 entrées d'historique |

**Un point de doctrine bien tenu.** Le hors-périmètre inscrit explicitement l'**agent capable
d'agir** : il ne reclasse rien, ne crée aucune règle, ne marque aucune dépense. La justification est
écrite — faire confiance à un modèle pour décrire un tableau et lui faire confiance pour modifier
des données sont deux questions distinctes. C'est le genre de frontière qui s'érode si elle n'est
pas énoncée.

## Qualité d'ensemble

**4,5 sur 5. Six principes BMad sur sept.** La traçabilité reste le principe partiellement tenu,
pour deux orphelines non déclarées.

**Ce que l'amendement réussit.**

- **NFR31 transforme une intention en garde-fou.** « Le LLM ne calcule pas » était invérifiable ;
  « aucun nombre qui ne figure tel quel dans ce qui a été reçu » se teste. Le tableau des quatre cas
  de bord, dans le modèle de domaine, tranche les cas ambigus sans laisser de zone grise.
- **FR69 fait du « je ne sais pas » une fonctionnalité.** Le PRD explique pourquoi : un agent qui
  bricole une réponse hors de portée du moteur rend toutes ses réponses suspectes, y compris les
  justes.
- **La frontière produit / architecture est tenue une seconde fois.** Après « fournisseur d'identité
  externe » plutôt que Google, c'est « configuration d'environnement » plutôt que `zai-glm-5-2`.
- **Le risque technique est nommé avant d'avoir coûté.** L'agent choisit une période via le même
  mécanisme dont D20 a établi qu'il est injecté dans le prompt et non contraint au décodage. La
  parade — requête structurée validée par l'application — est inscrite, et elle tient même avec un
  modèle médiocre sur ce point.
- **L'absence d'écran de paramétrage est justifiée, pas subie.** « Changer de modèle n'est pas un
  réglage, c'est un jalon » : le seuil de 10 % de corrections doit être re-mesuré. Sans cette phrase,
  l'onglet réapparaîtra dans six mois.

**Ce qui l'empêche d'atteindre 5.** Les trois incohérences internes, qui ne sont pas des erreurs de
conception mais des oublis de mise à jour, et deux prémisses devenues fausses sans être réexaminées,
le coût et la latence.

## Les cinq corrections à faire

1. **Corriger la phrase de « Phase 1 bis »** qui prétend précéder les phases 2 et 3.
2. **Retirer « analyse narrative » de la Phase 2**, absorbée par l'agent.
3. **Ajouter le Journey 7** aux parcours de la Phase 1 bis.
4. **Déclarer FR71 et FR72** comme FR53 et FR57 l'ont été.
5. **Réexaminer deux prémisses** : le coût, décidé quand l'usage était mensuel ; la latence, écartée
   quand rien n'était interactif.

Aucune n'est bloquante. Les trois premières sont mécaniques. Les deux dernières demandent une
décision, pas une rédaction.

---

## Suite donnée — passe du 2026-09-12

| # | Constat | Suite |
|---|---|---|
| 1 | « Phase 1 bis » prétendait précéder les phases 2 et 3 | **Corrigé.** L'étiquette est déclarée historique et non chronologique, avec renvoi à « Ordre des chantiers ». Rédaction précédente citée sur place. |
| 2 | « Analyse narrative » encore listée en Phase 2 | **Corrigé.** Retirée, avec la mention qu'elle est absorbée par l'agent et livrée au premier chantier. |
| 3 | Journey 7 rattaché à aucune phase | **Corrigé.** Ajouté aux parcours de la Phase 1 bis. |
| 4 | FR71 orpheline non déclarée, FR72 tracée vers une contrainte | **Corrigé.** Les deux sont déclarées avec leur justification, au même titre que FR9, FR53 et FR57. |
| 5a | Absence de plafond de coût, décidée sur une prémisse périmée | **Réexaminée, décision reconduite.** Le PRD dit désormais que la prémisse a changé et que la décision est prise en connaissance de cause. |
| 5b | Latence de l'agent, première surface interactive | **Tranchée : pas de cible a priori, jugement à l'usage.** Inscrite en point de vigilance sous NFR23, avec la raison pour laquelle ce cas diffère des autres. |
| — | Croissance non bornée des conversations | **Signalée, non traitée.** Troisième point de vigilance sous NFR23, sans exigence à ce stade. |
| — | Redondance FR66 ↔ NFR31 | **Non traitée.** Informative. NFR31 fait autorité. |

### Effet sur les contrôles

| Contrôle | Avant | Après |
|---|---|---|
| Cohérence interne | 3 contradictions | **0** |
| Traçabilité | 2 orphelines non déclarées | **0** |
| Mesurabilité | 2 prémisses non réexaminées | **0** — les deux sont tranchées et datées |

### Reste ouvert

**NFR6**, hérité du premier rapport et toujours non traité : le PRD promet que seuls la date, le
libellé et le montant sont transmis au fournisseur, ce que `CLAUDE.md` documente comme inexact.
L'agent élargit le sujet sans le créer — il transmet des agrégats, moins exposés que des lignes
brutes, mais une question portant sur des transactions précises fera repartir les libellés bancaires.
**À trancher avant la prochaine livraison touchant l'ingestion ou avant celle de l'agent**, la
première des deux qui arrive.

## Clôture de NFR6 — 2026-09-12

Le dernier constat ouvert des deux rapports est **clos**.

**Arbitrage de l'utilisateur :** « les libellés bancaires ce n'est pas grave ; ce qui l'est c'est les
informations perso comme l'IBAN, mon nom et prénom ».

**Vérification faite dans le code** avant réécriture, et non sur la foi des documents :
`server/services/pdf-extractor.ts` applique `redactIdentity()` par-dessus l'extraction positionnelle,
avec un repli sur `cutBeforeOperations()`. Le motif IBAN est expurgé et remplacé par `[IBAN]`. La
coupe du bloc d'identité est donc **réellement en place**.

**Ce qui était faux** n'était pas la protection, c'était sa description. Le PRD annonçait en trois
endroits — dont le résumé exécutif, au cœur de l'argument de souveraineté — que « seules trois
colonnes anonymes » étaient transmises. Le modèle réalisant l'extraction, ce sont les **lignes brutes
du tableau d'opérations** qui partent.

**Réécriture appliquée.** NFR6 énonce désormais trois choses distinctes : ce qui est coupé, ce qui est
transmis, et le résidu assumé — le nom du titulaire, présent à l'intérieur des libellés, indissociable
de la donnée métier et dont l'expurgation casserait la catégorisation. Le résumé exécutif et la
section domaine sont alignés.

**Effet sur l'argument produit.** Il passe de « seules trois colonnes anonymes sortent » à « aucun
identifiant bancaire ne sort, et ce qui sort reste sous régime européen ». Moins spectaculaire, et
vrai. Une promesse que le code ne tient pas est le pire des deux.

**Portée pour l'agent :** couverte par le même arbitrage, aucune exigence supplémentaire.

**Statut des constats des deux rapports : tous clos.**
