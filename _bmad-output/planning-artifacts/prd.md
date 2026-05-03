---
stepsCompleted:
  - step-01-init
  - step-02-discovery
  - step-02b-vision
  - step-02c-executive-summary
  - step-03-success
  - step-04-journeys
  - step-05-domain
  - step-06-innovation
  - step-07-project-type
  - step-08-scoping
  - step-09-functional
  - step-10-nonfunctional
  - step-11-polish
  - step-12-complete
releaseMode: phased
inputDocuments: []
workflowType: 'prd'
documentCounts:
  briefs: 0
  research: 0
  brainstorming: 0
  projectDocs: 0
classification:
  projectType: web-application-nuxt
  domain: personal-finance
  complexity: medium
  projectContext: greenfield
  notes:
    - "V1 local-first, déploiement cloud envisagé ultérieurement"
    - "Mono-utilisateur (perso V1, scope pro envisagé V2)"
    - "Source de données: PDFs Boursorama (parser isolé pour extensibilité multi-banques)"
    - "Forecast mensuel linéaire, charges multi-fréquences (mensuelle/trimestrielle/annuelle/ponctuelle)"
---

# Product Requirements Document - personnalFinance

**Author:** Marceau
**Date:** 2026-04-30

## Executive Summary

**personnalFinance** est une web application local-first de pilotage financier personnel destinée à un utilisateur unique en transition de vie (chômage + lancement d'entreprise). Elle ingère automatiquement les relevés PDF Boursorama, catégorise les opérations via LLM, et produit un **forecast inverse multi-horizons (6/12/24 mois)** : à partir d'objectifs de trésorerie et d'un modèle de charges fixes/variables/annuelles, elle calcule le montant de dividendes à se verser et le nombre de jours de prestation à facturer pour les atteindre.

Le problème résolu n'est pas le suivi budgétaire moralisateur des outils grand public, mais le **pilotage actif d'un revenu non-salarié** : combien sortir de l'entreprise, et quand. Suivi rétrospectif (où est passé l'argent ce mois) et planification prospective (quoi facturer pour tenir) sont réconciliés dans un même outil.

### What Makes This Special

1. **Forecast inverse — killer feature.** Les outils existants (Bankin', Linxo, YNAB) modélisent un salarié à revenu subi. Ici la logique est renversée : *"voici l'objectif → voici la sortie nécessaire"*. Conçu pour un entrepreneur qui module activement sa rémunération.
2. **Friction d'ingestion minimale via LLM.** Catégorisation des libellés bancaires déléguée à un LLM avec apprentissage sur les corrections utilisateur — pas de regex fragiles, pas de saisie manuelle. Anti-Excel par construction.
3. **Signal narratif, pas tableau froid.** L'interface met en avant les écarts qui *expliquent* l'état du compte (*"courses +60% ce mois, voilà pourquoi"*) plutôt que des graphiques décoratifs.
4. **Local-first, propriété des données.** Pas d'agrégateur tiers, pas de credentials bancaires stockés, pas de dépendance DSP2. Déploiement cloud envisageable ultérieurement sans changement de modèle.
5. **Faisabilité solo construite sur la vague techno actuelle.** Maturité des LLMs + outillage Claude Code = périmètre auparavant réservé à une équipe produit, désormais réalisable par un CTO seul sur un produit calibré pour son propre usage.

## Project Classification

| Champ | Valeur |
|---|---|
| **Project Type** | Web application — Nuxt 3 (SPA, `ssr: false`) + Nitro backend, local-first → cloud-ready |
| **Domain** | Personal Finance / FinTech (mono-utilisateur, non-régulé) |
| **Complexity** | Moyenne — défis sur ingestion PDF + LLM, modèle de forecast multi-fréquences |
| **Project Context** | Greenfield |
| **Stack confirmée** | Nuxt 3 SPA · Nitro · SQLite + Drizzle · `unpdf` · Claude API (structured outputs) · CSS vanilla (SFC scoped + custom properties) · Reka UI (headless) ou hand-rolled · Vitest + Playwright |

## Success Criteria

### User Success

- **Moment "ça marche" :** au dépôt d'un relevé PDF, l'utilisateur **comprend en moins de 30 secondes pourquoi son compte est dans cet état** — pas un dashboard à explorer, mais un **signal narratif** mis en avant ("Tes courses ont bondi de +X% ce mois, voilà l'explication principale").
- **Fréquence d'usage cible :** mensuelle en V1 (rythme des relevés), évolution vers usage plus fréquent avec agrégation bancaire directe en V2+.
- **Tolérance friction :** la qualité de catégorisation LLM est un objectif **secondaire** — pas de barre stricte de précision. L'effort d'optimisation va sur le forecast inverse (killer feature), pas sur la perfection de la catégorisation.

### Business Success *(adapté contexte projet personnel)*

- **Délai de mise en service :** MVP utilisable au quotidien le plus rapidement possible — la viabilité du projet en dépend (contexte de transition de vie, risque side-project mort).
- **Validation principale :** l'outil remplace effectivement Excel comme support de pilotage des décisions financières (montant de dividendes à se verser, jours de presta à facturer).
- **Anti-objectif :** ne pas laisser le projet dériver sur des fonctionnalités qui ne servent pas le forecast inverse.

### Technical Success

- **Rigueur numérique : zéro tolérance d'erreur de calcul.** Tous les agrégats (soldes, totaux par catégorie, projections) doivent être exacts au centime. Implication : suite de tests numériques systématiques sur les fonctions de calcul, et réconciliation automatique entre la somme des transactions catégorisées et le solde du PDF source — toute divergence doit être détectée et signalée.
- **Données MVP jetables.** SQLite locale, pas de stratégie de backup ni d'export pour la V1. Les PDFs (en `_data/raw/`) sont la source de vérité ; la base est rejouable depuis les PDFs. Cela débloque la simplicité (pas de migrations, pas de schémas figés en V1).
- **Performance :** un PDF mensuel Boursorama doit être ingéré, extrait, catégorisé et restitué dans le dashboard en moins de 30 secondes (un seul appel LLM, sortie structurée).

### Measurable Outcomes

| Critère | Cible MVP |
|---|---|
| Temps d'ingestion PDF → dashboard | < 30 secondes |
| Précision arithmétique des agrégats | 100% (réconciliation auto vs solde PDF) |
| Délai V1 utilisable au quotidien | ASAP — minimisation absolue du scope |
| Forecast inverse opérationnel | Horizons 6/12/24 mois disponibles dès le MVP |

## User Journeys

### Persona unique — Marceau, dirigeant SAS au chômage

CTO en transition. Au chômage indemnisé (ARE jusqu'à une date prévue). Dirigeant unique d'une SAS qui facture ses prestations à des clients. La SAS lui verse un **loyer mensuel** + rembourse des **défraiements**. **Aucun salaire SAS, aucun dividende pour l'instant** (incompatible avec l'ARE). À la **clôture d'exercice annuelle**, il décide du **montant de dividende unique** à voter pour couvrir ses dépenses persos de l'année à venir, en optimisant la fiscalité (flat tax 30% par défaut, paramétrable). Il a également une dette envers sa conjointe (frais avancés en continu) qu'il devra solder.

### Journey 1 — Onboarding (premier usage)

1. **Drop des PDFs** Boursorama (jan/fév/mars) → extraction texte → catégorisation LLM → stockage SQLite.
2. **Vue narrative du dernier mois** — *"Sur mars, ARE de X €, loyer SAS de Y €, défraiements Z €. Charges fixes A €, courses B € (+12% vs février, principal écart). Solde fin de mois : C €."*
3. **Saisie du modèle de charges perso** — fixes mensuelles, variables, annuelles. L'app suggère des charges récurrentes détectées dans les PDFs.
4. **Saisie du modèle revenus perso** — ARE (montant + date de fin estimée), loyer SAS, défraiements.
5. **Saisie du modèle SAS (léger, déclaratif)** — date de clôture d'exercice, CA prévisionnel, charges SAS prévisionnelles, trésorerie SAS actuelle, taux IS, taux fiscalité dividende (flat tax 30% par défaut).
6. **Saisie des dettes** — entrée "Dette envers conjoint" avec solde initial, mode de remboursement (Libre par défaut, ou Mensualité fixe, ou Lump sum à date Y).
7. **Premier forecast inverse** — l'app calcule : trajectoire perso 24 mois, date de découvert si rien n'est fait, **dividende NET à voter à la prochaine AG** + BRUT correspondant, capacité dividendable estimée côté SAS, marge, alerte si versement dividende coïncide avec ARE active.

### Journey 2 — Cycle mensuel (régime de croisière)

1. **Drop du PDF** → ingestion + réconciliation auto silencieuse si tout colle.
2. **Vue "voilà pourquoi"** — top 2-3 écarts du mois vs précédents.
3. **Mise à jour des dettes** — saisie manuelle des nouvelles avances ; marquage "remboursement dette" sur les transactions sortantes concernées.
4. **Mise à jour du modèle SAS (optionnel)** — Marceau ajuste sa prévision de CA et la trésorerie SAS actuelle.
5. **Refresh forecast inverse** — recalcul automatique : dividende NET requis vs capacité dividendable, marge, leviers d'ajustement exposés (CA, dépenses, calendrier).
6. **Décision** — vision claire de la cible dividende et de la marge.

### Journey 3 — Edge case : catégorisation litigieuse

Marceau voit une transaction mal classée (ex: *"PRLV CARTE 0512"* en *"Divers"*). Il clique, sélectionne la bonne catégorie. Sauvegarde immédiate, recalcul des agrégats et du forecast. Pas d'apprentissage en V1.

### Journey 4 — Edge case : réconciliation échoue

Au moment de l'ingestion, alerte : *"Écart de 47€ entre transactions extraites et solde PDF."* Marceau ouvre la vue de réconciliation, ajoute manuellement les transactions manquantes. Une fois l'écart à zéro, le PDF est marqué "réconcilié". S'il préfère reporter, il peut accepter l'écart en *"divers/inconnu"* — le mois concerné est alors flagué comme **"non fiable"** dans le forecast.

### Journey 5 — Solder la dette via dividende (lump sum)

À l'approche de la clôture, Marceau bascule la fiche dette en mode *Lump sum* avec date *"prochain versement dividende"*. Le forecast recalcule le dividende NET requis incluant le solde de dette. L'app affiche **l'impact marginal** : *"+Z € de dividende requis pour solder la dette en plus du reste."* Il décide d'ajuster ou non.

### Journey Requirements Summary

| Capability | Journeys |
|---|---|
| Drop & ingestion PDF (single + batch) | 1, 2 |
| Extraction texte + appel LLM structuré | 1, 2 |
| Réconciliation automatique avec alerte | 2, 4 |
| Vue de réconciliation manuelle | 4 |
| Dashboard narratif (top écarts vs mois précédents) | 1, 2 |
| Édition manuelle d'une transaction (catégorie + marquage *"remboursement dette"*) | 2, 3 |
| Modèle de charges perso (4 fréquences, suggestions auto) | 1 |
| Modèle de revenus perso (ARE avec date de fin, loyer SAS, défraiements) | 1, 2 |
| Modèle SAS léger (date clôture, CA prévisionnel, charges, IS, tréso actuelle déclarative) | 1, 2 |
| Modèle Dettes (créancier, solde, mode libre/mensualité/lump sum, historique avances/remboursements) | 1, 2, 5 |
| Paramètres fiscalité dividende (flat tax 30% par défaut) | 1, 2 |
| Moteur de forecast inverse (trajectoire perso, dettes, capacité dividendable SAS, fiscalité) | 1, 2, 5 |
| Affichage impact marginal d'une obligation sur le dividende cible | 5 |
| Alerte incompatibilité ARE/dividende | 1, 2, 5 |
| Refresh incrémental sur nouvelle ingestion / maj modèle / maj dette | 2, 5 |
| Marquage fiabilité d'un mois | 4 |

## Domain-Specific Requirements

### Précision financière

- **Arithmétique en centimes entiers** — toutes les valeurs monétaires manipulées en interne en *integer cents* (jamais en `float`), conversion uniquement à l'affichage. Évite les classiques erreurs IEEE 754 sur les sommes.
- **Réconciliation systématique** — somme(transactions) + solde initial = solde final du PDF, vérifié à chaque ingestion. Toute divergence ≥ 1 centime déclenche une alerte.
- **Tests numériques** — fonctions de calcul (agrégats, projection, dividende cible, fiscalité) couvertes par des tests unitaires avec cas limites (mois à 28/29/30/31 jours, charges annuelles à cheval sur deux exercices, dette à zéro, ARE qui se termine en milieu de mois).
- **Déduplication des relevés ingérés** — chaque PDF est hashé (SHA-256 du contenu) à l'upload, le hash stocké en base. Un re-drop du même fichier est rejeté avec message explicite.
- **Détection de période déjà couverte** — au-delà du hash exact, l'app extrait la période du PDF. Si une période chevauche un PDF déjà ingéré, **alerte de confirmation** avec choix remplacer/annuler.

### Confidentialité des données

- **Données bancaires reste local** — PDFs stockés dans `_data/raw/` (gitignored), base SQLite locale. Aucun upload de PDF brut vers un service tiers.
- **Appels LLM (Claude API)** — seules les lignes de transaction extraites (date, libellé, montant) sortent de la machine, pour catégorisation. Pas de noms, pas de RIB, pas d'IBAN. À documenter explicitement dans le README/CLAUDE.md.
- **Clé API Anthropic** — stockée en variable d'environnement (`.env` gitignored), pas en dur, pas en base.
- **Pas d'authentification en V1** — l'app est mono-user, locale. Si déploiement cloud futur (Vision), l'auth devient bloquant.

### Spécificités françaises (modèle de domaine)

| Concept | Modélisation V1 |
|---|---|
| **SAS** | Seule structure juridique supportée. |
| **Exercice fiscal** | Date de clôture paramétrable. Un seul exercice actif modélisé en V1. |
| **Impôt sur les Sociétés (IS)** | Taux paramétrable. Note pédagogique : 15% jusqu'à 42 500€ de bénéfice (PME), 25% au-delà. Calcul déclaratif simplifié, pas de gestion des reports déficitaires en V1. |
| **Dividende SAS** | Versement annuel unique post-AG. Pas d'acomptes en V1. |
| **Flat Tax (PFU 30%)** | 12,8% IR + 17,2% prélèvements sociaux. Option barème progressif IR signalable mais non simulée en V1. |
| **ARE** | Modélisée comme revenu mensuel avec date de fin estimée. Règle d'incompatibilité avec dividende le mois concerné : alerte uniquement, pas de blocage. |
| **Loyer SAS → dirigeant** | Revenu mensuel côté perso, charge mensuelle côté SAS. |
| **Défraiements** | Revenus persos non-imposables. Catégorisables mais hors assiette fiscale. |

### Disclaimer non-conseil

L'app est un outil d'aide à la décision personnel, pas un conseil fiscal/juridique/financier réglementé. À surfacer dans l'UI :

> *"Cet outil est une aide à la simulation pour usage personnel. Les calculs fiscaux sont indicatifs et ne remplacent pas un conseil professionnel (expert-comptable, conseiller fiscal). En cas de doute sur une décision impliquant un montant significatif, consulter un professionnel."*

### Risques & Mitigations

| Risque | Mitigation V1 |
|---|---|
| Erreur d'arithmétique sur des montants | Integer cents partout + tests unitaires + réconciliation auto |
| Perte de la base SQLite | Acceptée (MVP jetable) — base reconstructible depuis les PDFs sources |
| Mauvaise catégorisation LLM | Édition manuelle 1-clic + pas de barre de précision stricte (acceptée) |
| Hallucination LLM (montants inventés) | Sortie structurée avec contraintes de schéma + réconciliation systématique vs solde PDF |
| Évolution règles fiscales (taux IS, flat tax…) | Tous les taux paramétrables, pas de constante en dur |
| Fuite de la clé API Anthropic | `.env` gitignored, doc explicite, jamais loggée |
| Double ingestion d'un même PDF | Hash SHA-256 systématique → rejet idempotent du même fichier |
| Re-export de la même période avec contenu différent | Détection de période chevauchante + confirmation utilisateur (remplacer/annuler) |

## Web Application Specific Requirements

### Project-Type Overview

Single Page Application (SPA) Nuxt 3 avec `ssr: false`, backend Nitro intégré. Pas de SEO, pas de temps réel, pas de mobile en V1. Application destinée à un usage desktop personnel.

### Browser Matrix

| Navigateur | Support V1 |
|---|---|
| Chrome / Chromium | 2 dernières versions stables — supporté |
| Firefox | 2 dernières versions stables — supporté |
| Safari | Non supporté en V1 |
| Edge | Non testé en V1 |

CSS modernes utilisables librement (nesting natif, `:has()`, container queries, `@layer`, color-mix). JavaScript moderne (ES2024+).

### Responsive Design

- **Desktop only en V1.** Pas de breakpoints mobile/tablette.
- Largeur viewport ciblée : ≥ 1280 px.
- Pas de touch interactions.

### Performance Targets

| Métrique | Cible V1 |
|---|---|
| Drop PDF → dashboard restitué | < 30 secondes |
| Affichage dashboard / changement de mois | Ressenti instantané quand possible (pas de cible dure) |
| Recalcul forecast après modification d'un input | Synchrone OK tant que < 1 s |
| Bundle initial JS | Pas de cible (mono-user local) |

Pas de budget perf strict en V1 — optimisation à la demande si gêne à l'usage.

### SEO Strategy

Aucune. App mono-user, locale, derrière l'écran. Pas de meta tags structurés, pas de sitemap, pas de SSR.

### Accessibility Level

V1 "best effort, mono-user" :
- Sémantique HTML correcte
- Navigation clavier sur les actions critiques
- Focus visible (`:focus-visible`)
- Contrastes WCAG AA visés (non audité formellement)

Hors V1 : audit WCAG complet, support lecteurs d'écran, ARIA avancé, modes accessibilité.

### Implementation Considerations

- **Pas de PWA** en V1.
- **Pas de stockage navigateur** (localStorage, IndexedDB) — persistance via backend Nitro → SQLite.
- **Routing** : file-based Nuxt, client-side. Pages probables : `/` (dashboard), `/import`, `/charges`, `/revenus`, `/sas`, `/dettes`, `/forecast`, `/transactions/:periode`.
- **State** : Pinia pour l'état partagé (mois courant, paramètres, modèles). `ref/reactive` pour le local.
- **API** : endpoints Nitro `/api/*`, validation payloads via Zod ou Valibot. REST classique. Pas de tRPC/GraphQL en V1.

## Project Scoping & Phased Development

### MVP Strategy & Philosophy

**Approche MVP :** *Problem-solving MVP* — le minimum viable n'est pas "le moins de features possible", mais "tout ce qu'il faut pour qu'un cycle décisionnel complet fonctionne de bout en bout" (drop PDF → réconciliation → dashboard narratif → forecast inverse → décision dividende).

**Critères d'inclusion MVP :**
- Sans cette capability, le cycle décisionnel est cassé (le forecast est faux ou impossible).
- Ne peut pas être remplacée temporairement par un workaround pratique.

**Ressources :** 1 dev (Marceau) + Claude Code. Scope verrouillé, aucune feature ajoutée en cours de route sans la déplacer en Growth.

### MVP Feature Set (Phase 1)

**Journeys couverts :** 1 (Onboarding), 2 (Cycle mensuel), 3 (Catégorisation litigieuse), 4 (Réconciliation échoue), 5 (Solder dette via dividende).

**Must-Have Capabilities (verrouillées) :**

1. **Ingestion PDF Boursorama** — drop fichier, extraction texte (`unpdf`), hash SHA-256 pour déduplication, détection de période chevauchante avec confirmation
2. **Catégorisation LLM** — un appel Claude API (structured outputs), contraintes de schéma strictes
3. **Réconciliation automatique** — somme(transactions) + solde initial = solde final PDF, alerte ≥ 1 centime, vue de réconciliation manuelle avec ajout de transaction
4. **Stockage SQLite + Drizzle** — montants en *integer cents*, schéma Drizzle pour transactions, catégories, modèles, dettes, paramètres
5. **Édition manuelle d'une transaction** — recatégorisation 1-clic, marquage "remboursement dette", recalcul réactif des agrégats et du forecast
6. **Dashboard mensuel narratif** — vue mois courant + 2-3 écarts les plus significatifs vs mois précédents, mis en forme en phrase explicative
7. **Modèle de charges perso** — 4 fréquences (mensuelle, trimestrielle, annuelle, ponctuelle), suggestions auto à partir des récurrents détectés
8. **Modèle de revenus perso** — ARE (montant + date de fin), loyer SAS, défraiements
9. **Modèle SAS léger (déclaratif)** — date de clôture, CA prévisionnel, charges SAS prévisionnelles, trésorerie SAS actuelle, taux IS, taux fiscalité dividende (flat tax 30% par défaut)
10. **Modèle Dettes** — créancier, solde courant, mode (libre / mensualité fixe / lump sum à date), historique des avances et remboursements
11. **Moteur de forecast inverse 6/12/24 mois** — input : trajectoire de charges + revenus + dettes + objectifs ponctuels ; output : dividende NET à voter à la prochaine AG, BRUT correspondant, capacité dividendable estimée, marge
12. **Alertes intégrées au forecast** — incompatibilité ARE/dividende, mois flagué "non fiable" si réconciliation incomplète, dépassement de la capacité dividendable
13. **Affichage impact marginal** — sur la fiche Dette, montrer combien la dette ajoute au dividende cible
14. **Gestion des catégories** — création, renommage, suppression contrôlée (interdite si la catégorie est référencée par des transactions, charges fixes ou overrides)

**Hors MVP — explicitement exclu :** authentification, multi-utilisateur, déploiement cloud, multi-banque, agrégation bancaire automatique, apprentissage des corrections, règles de catégorisation manuelles persistantes, multi-scénarios de forecast, alertes proactives, export comptable, sauvegarde/restauration, mobile/PWA/responsive, module pro/entreprise complet.

### Post-MVP Features

**Phase 2 — Growth :**
- Apprentissage des corrections de catégorisation (mémorisation par libellé/pattern)
- Règles de catégorisation manuelles persistantes
- Détection automatique des remboursements dette (pattern de libellé)
- Multi-scénarios de forecast (optimiste / réaliste / pessimiste)
- Sauvegarde/restauration de la base
- Export comptable (CSV, format expert-comptable)
- Multi-banques (parser pluggable)
- Alertes proactives sur anomalies

**Phase 3 — Vision :**
- Module pro entreprise complet (compta simplifiée, TVA, dividendes plus riches, ponts perso↔pro)
- Agrégation bancaire directe (Bridge / Powens)
- Simulateur Monte-Carlo (variance des revenus, distribution du dividende cible)
- Mode partagé avec un comptable / tiers
- Déploiement cloud multi-utilisateur (avec auth)

### Risk Mitigation Strategy

**Risques techniques :**

| Risque | Mitigation |
|---|---|
| Parser PDF Boursorama fragile sur edge cases | Test avec 3-5 PDFs réels en début de projet ; isoler le parser pour pivot facile (Python) si besoin |
| Hallucination LLM (montants inventés, transactions oubliées) | Sortie structurée + réconciliation systématique vs solde PDF + tests sur PDFs connus |
| Calculs financiers faux (float drift, edge cases dates) | Integer cents partout + tests unitaires avec cas limites + revue manuelle des chiffres au démarrage |
| Coût API Claude ingérable | Cache local par hash de PDF ; un seul appel par PDF |

**Risques projet (faisabilité solo) :**

| Risque | Mitigation |
|---|---|
| Side-project mort par dérive de scope | Liste MVP verrouillée ; toute feature non listée passe en Growth automatiquement |
| Lassitude / temps insuffisant | Découper en epics livrables indépendants : ingestion → réconciliation → dashboard → modèles → forecast |
| Mauvaise estimation du temps total | Démarrer par le slice vertical le plus court (ingestion PDF + dashboard basique). Signal d'alerte si > 3× l'estimation |

**Risques métier :**

| Risque | Mitigation |
|---|---|
| Forecast inverse donne des recos fausses (modèle SAS trop simpliste) | Disclaimer UI + paramètres déclaratifs (utilisateur responsable des entrées) ; consulter expert-comptable pour décisions importantes |
| Modèle fiscal qui évolue (loi de finances) | Tous les taux paramétrables, jamais en dur |

## Functional Requirements

> **Note :** acteur unique (utilisateur). Forme directe. Ces FRs constituent le contrat de capabilities du MVP — toute fonctionnalité non listée n'existera pas sans amendement explicite.

### Ingestion & Deduplication des relevés

- **FR1** — L'utilisateur peut déposer un fichier PDF de relevé bancaire pour ingestion.
- **FR2** — Le système rejette tout PDF dont le hash SHA-256 correspond à un PDF déjà ingéré, avec message explicite.
- **FR3** — Le système détecte si la période couverte par un PDF chevauche celle d'un PDF déjà ingéré, et demande confirmation explicite (remplacer / annuler) avant de poursuivre.
- **FR4** — Le système conserve le PDF source ingéré pour permettre la reconstruction de la base à partir des sources.
- **FR5** — Le système extrait le texte structuré du PDF sans dépendre d'un service tiers (extraction locale).

### Catégorisation et structuration des transactions

- **FR6** — Le système transforme le texte extrait d'un PDF en transactions structurées (date, libellé, montant signé, catégorie) via un appel LLM avec sortie contrainte par schéma.
- **FR7** — L'utilisateur peut consulter la liste des transactions d'une période donnée, triées par date.
- **FR8** — L'utilisateur peut modifier la catégorie d'une transaction individuelle.
- **FR9** — L'utilisateur peut marquer une transaction sortante comme "remboursement de dette" et la rattacher à une dette existante.
- **FR10** — Le système recalcule automatiquement les agrégats et le forecast après toute modification de transaction.

### Réconciliation numérique

- **FR11** — Le système calcule la somme des transactions extraites d'un PDF et la compare au solde initial + final extraits du même PDF.
- **FR12** — Le système signale toute divergence ≥ 1 centime entre transactions extraites et soldes du PDF.
- **FR13** — L'utilisateur peut ouvrir une vue de réconciliation pour un PDF non réconcilié, voir l'écart, et ajouter manuellement des transactions manquantes jusqu'à atteindre l'équilibre.
- **FR14** — L'utilisateur peut accepter un écart de réconciliation en l'attribuant à une transaction "divers/inconnu" ; le mois concerné est alors marqué "non fiable".
- **FR15** — Le système empêche un mois marqué "non fiable" d'être traité comme source vérifiée dans le forecast (signalisation explicite).

### Modèle de charges personnelles

- **FR16** — L'utilisateur déclare des charges récurrentes uniquement pour les catégories fixes (engagements contractuels, abonnements). Les catégories variables ne sont pas déclarées : elles sont projetées par extrapolation (cf. section dédiée).
- **FR17** — Le système suggère automatiquement des charges récurrentes à partir des transactions ingérées (libellés et montants similaires détectés sur plusieurs mois).
- **FR18** — L'utilisateur peut accepter, modifier ou rejeter une suggestion de charge récurrente.

### Modèle de revenus personnels

- **FR19** — L'utilisateur peut déclarer son ARE (montant mensuel + date de fin estimée).
- **FR20** — L'utilisateur peut déclarer le loyer mensuel versé par sa SAS.
- **FR21** — L'utilisateur peut déclarer une estimation moyenne de défraiements mensuels.
- **FR22** — Le système identifie les défraiements comme revenus non-imposables, exclus de l'assiette fiscale.

### Modèle SAS (léger, déclaratif)

- **FR23** — L'utilisateur peut déclarer la date de clôture de l'exercice fiscal de sa SAS.
- **FR24** — L'utilisateur peut déclarer une prévision de chiffre d'affaires sur l'exercice en cours, modifiable à tout moment.
- **FR25** — L'utilisateur peut déclarer les charges SAS prévisionnelles (charges sociales, loyer versé au dirigeant, autres frais) globalement ou ligne par ligne.
- **FR26** — L'utilisateur peut déclarer manuellement la trésorerie SAS actuelle.
- **FR27** — L'utilisateur peut paramétrer le taux d'IS applicable à sa SAS.
- **FR28** — Le système calcule la capacité dividendable estimée de la SAS (CA - charges - IS) à la prochaine clôture.

### Modèle Dettes

- **FR29** — L'utilisateur peut créer une fiche dette avec créancier, solde initial, et mode de remboursement (libre / mensualité fixe / lump sum à date donnée).
- **FR30** — L'utilisateur peut basculer entre les trois modes de remboursement à tout moment.
- **FR31** — L'utilisateur peut enregistrer manuellement une nouvelle avance reçue d'un créancier (incrémentation du solde dette).
- **FR32** — Le système décrémente automatiquement le solde d'une dette quand une transaction est marquée comme remboursement de cette dette.
- **FR33** — Le système intègre le solde d'une dette au forecast selon son mode (charge fixe mensuelle si mensualité, dépense ponctuelle planifiée si lump sum, hors forecast si libre).
- **FR34** — Le système affiche l'impact marginal d'une dette sur le dividende cible.

### Paramètres fiscalité

- **FR35** — L'utilisateur peut paramétrer le taux d'imposition appliqué aux dividendes (flat tax 30% par défaut, modifiable).
- **FR36** — L'utilisateur peut désigner le mode d'imposition (flat tax PFU ou option barème progressif IR — déclaratif sans simulation détaillée en V1).

### Tableau de bord narratif

- **FR37** — Le système affiche, pour le mois courant, le solde de fin de mois et la décomposition revenus/charges.
- **FR38** — Le système identifie les 2 à 3 écarts les plus significatifs entre le mois courant et les mois précédents (catégorie, sens, amplitude).
- **FR39** — Le système formule ces écarts en phrases explicatives.
- **FR40** — L'utilisateur peut naviguer entre les mois ingérés et consulter la vue narrative de chacun.

### Projection des dépenses variables

- **FR41** — Le système calcule, pour chaque catégorie de dépenses variables, une moyenne mobile sur les N derniers mois ingérés (N paramétrable, défaut 3 mois).
- **FR42** — Le système intègre ces projections par catégorie dans le forecast pour tous les mois futurs jusqu'à l'horizon choisi.
- **FR43** — Le forecast distingue visuellement les quatre sources : charge fixe déclarée, charge variable extrapolée, charge ponctuelle planifiée, revenu.
- **FR44** — L'utilisateur peut outrepasser, pour un mois futur donné et une catégorie variable donnée, le montant projeté par une valeur manuelle (override mois × catégorie).
- **FR45** — Le système signale les catégories sans historique suffisant (moins de N mois ingérés) avec un indicateur de fiabilité réduit.

### Forecast inverse

- **FR46** — L'utilisateur peut consulter une projection de trésorerie personnelle mensuelle sur 6, 12 et 24 mois.
- **FR47** — Le système signale la date à laquelle le solde personnel projeté passe en négatif si aucune action n'est entreprise.
- **FR48** — Le système calcule le montant de dividende NET à verser à la prochaine AG de clôture pour maintenir le solde projeté positif sur l'horizon choisi.
- **FR49** — Le système affiche le montant BRUT de dividende correspondant, calculé à partir du paramètre fiscalité.
- **FR50** — Le système compare le dividende BRUT requis à la capacité dividendable estimée de la SAS et expose la marge.
- **FR51** — Si le dividende requis dépasse la capacité dividendable, le système expose les leviers d'ajustement (réduire dépenses, augmenter CA, décaler objectifs).
- **FR52** — Le système alerte l'utilisateur si la date prévue de versement du dividende coïncide avec une période où l'ARE est encore active.
- **FR53** — Le système recalcule le forecast automatiquement après toute modification d'un modèle ou ingestion d'un nouveau PDF.

### Disclaimer & transparence

- **FR54** — Le système affiche un disclaimer indiquant que l'outil ne remplace pas un conseil fiscal/juridique professionnel, à la première utilisation et accessible en permanence.

### Gestion des catégories

- **FR55** — L'utilisateur peut créer une nouvelle catégorie de transaction en spécifiant un libellé et un type (variable ou fixe). La nouvelle catégorie est immédiatement disponible pour la catégorisation manuelle et pour les imports PDF suivants (la liste passée au LLM est lue dynamiquement depuis la base).
- **FR56** — L'utilisateur peut renommer le libellé d'une catégorie existante (par défaut ou créée). L'identifiant interne reste stable pour préserver l'intégrité référentielle des transactions, charges fixes et overrides mensuels.
- **FR57** — L'utilisateur peut supprimer une catégorie uniquement si elle n'est référencée par aucune transaction, charge fixe ou override mensuel. Toute tentative de suppression sur une catégorie référencée est refusée avec message explicite indiquant le nombre de références bloquantes.

## Non-Functional Requirements

> Catégories non pertinentes (skip explicite) : **Scalability** (mono-user, pas de croissance prévue), **Accessibility avancée** (déjà cadrée à minima dans la section Web Application).

### Performance

- **NFR1** — L'ingestion complète d'un PDF Boursorama mensuel (extraction → catégorisation LLM → réconciliation → persistance → restitution dashboard) doit s'achever en moins de 30 secondes sur la machine de l'utilisateur.
- **NFR2** — Le recalcul du forecast inverse après modification d'un input doit s'achever en moins de 1 seconde.
- **NFR3** — La navigation entre mois ingérés doit donner un ressenti instantané (cible non quantifiée — viser < 200 ms quand possible).

### Security

- **NFR4** — La clé API Anthropic est stockée exclusivement dans un fichier `.env` non versionné. Elle ne doit jamais apparaître en base, en logs, en réponse HTTP, ni dans le bundle client.
- **NFR5** — Les PDFs sources et la base SQLite sont stockés exclusivement sur le système de fichiers local, dans des chemins gitignorés. Aucun upload de PDF brut vers un service tiers.
- **NFR6** — Les données envoyées à l'API Anthropic se limitent au texte structuré des transactions (date, libellé, montant). Aucune donnée d'identification (nom complet, IBAN, RIB, adresse) ne quitte la machine.
- **NFR7** — Aucune authentification utilisateur n'est implémentée en V1. L'app suppose un environnement local de confiance.

### Reliability & Data Integrity

- **NFR8** — Toutes les valeurs monétaires sont manipulées en interne sous forme d'entiers en centimes (`integer cents`). Conversion vers Number/String uniquement à l'affichage. Aucune opération arithmétique sur des `float` représentant de l'argent.
- **NFR9** — Toute fonction de calcul d'agrégat ou de projection est couverte par des tests unitaires, incluant cas limites : mois à 28/29/30/31 jours, charges annuelles à cheval sur deux exercices, dette à zéro, ARE qui se termine en milieu de mois, override de catégorie variable, historique vide.
- **NFR10** — La réconciliation transactions ↔ solde PDF s'exécute systématiquement à l'ingestion. Une divergence ≥ 1 centime ne peut pas être ignorée silencieusement.
- **NFR11** — La perte totale de la base SQLite est acceptable en V1. La base doit pouvoir être reconstruite intégralement à partir des PDFs sources conservés.

### Integration

- **NFR12** — Une seule intégration externe : API Anthropic Claude. Aucune autre dépendance réseau en runtime.
- **NFR13** — En cas d'indisponibilité de l'API Claude, l'ingestion d'un nouveau PDF échoue avec message explicite. L'app reste utilisable pour la consultation de données déjà ingérées.
- **NFR14** — Le client Claude utilise des structured outputs (sortie JSON contrainte par schéma). Toute sortie non conforme au schéma déclenche un échec d'ingestion explicite.

### Maintainability (faisabilité solo)

- **NFR15** — Le code suit les principes KISS, SOLID, DRY, formalisés dans `CLAUDE.md` au démarrage du projet. Pas d'abstractions spéculatives, pas de feature flags pour fonctionnalités hypothétiques.
- **NFR16** — Le parser PDF (extraction texte) est isolé dans un module dédié avec une interface stable, pour permettre l'ajout d'autres formats bancaires en Growth sans refactor du reste du code.
- **NFR17** — Les règles fiscales et taux (IS, flat tax, taux d'imposition) sont définis dans une configuration paramétrable, jamais en dur dans le code.
- **NFR18** — Couverture de tests cible : 100% sur les fonctions de calcul financier ; best effort ailleurs.
