---
stepsCompleted:
  - step-01-validate-prerequisites
  - step-02-design-epics
  - step-03-create-stories
  - step-04-final-validation
inputDocuments:
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/planning-artifacts/architecture.md
---

# personnalFinance - Epic Breakdown

## Overview

Découpage des 54 FRs / 18 NFRs / requirements additionnels architecture du PRD et du document d'architecture en epics et stories implémentables, organisés par valeur utilisateur incrémentale.

## Requirements Inventory

### Functional Requirements

**Ingestion & Deduplication des relevés**
- FR1 — L'utilisateur peut déposer un fichier PDF de relevé bancaire pour ingestion.
- FR2 — Le système rejette tout PDF dont le hash SHA-256 correspond à un PDF déjà ingéré, avec message explicite.
- FR3 — Le système détecte si la période couverte par un PDF chevauche celle d'un PDF déjà ingéré, et demande confirmation explicite (remplacer / annuler) avant de poursuivre.
- FR4 — Le système conserve le PDF source ingéré pour permettre la reconstruction de la base à partir des sources.
- FR5 — Le système extrait le texte structuré du PDF sans dépendre d'un service tiers (extraction locale).

**Catégorisation et structuration des transactions**
- FR6 — Le système transforme le texte extrait d'un PDF en transactions structurées (date, libellé, montant signé, catégorie) via un appel LLM avec sortie contrainte par schéma.
- FR7 — L'utilisateur peut consulter la liste des transactions d'une période donnée, triées par date.
- FR8 — L'utilisateur peut modifier la catégorie d'une transaction individuelle.
- FR9 — L'utilisateur peut marquer une transaction sortante comme "remboursement de dette" et la rattacher à une dette existante.
- FR10 — Le système recalcule automatiquement les agrégats et le forecast après toute modification de transaction.

**Réconciliation numérique**
- FR11 — Le système calcule la somme des transactions extraites d'un PDF et la compare au solde initial + final extraits du même PDF.
- FR12 — Le système signale toute divergence ≥ 1 centime entre transactions extraites et soldes du PDF.
- FR13 — L'utilisateur peut ouvrir une vue de réconciliation pour un PDF non réconcilié, voir l'écart, et ajouter manuellement des transactions manquantes jusqu'à atteindre l'équilibre.
- FR14 — L'utilisateur peut accepter un écart de réconciliation en l'attribuant à une transaction "divers/inconnu" ; le mois concerné est alors marqué "non fiable".
- FR15 — Le système empêche un mois marqué "non fiable" d'être traité comme source vérifiée dans le forecast (signalisation explicite).

**Modèle de charges personnelles**
- FR16 — L'utilisateur déclare des charges récurrentes uniquement pour les catégories fixes (engagements contractuels, abonnements). Les catégories variables ne sont pas déclarées : elles sont projetées par extrapolation.
- FR17 — Le système suggère automatiquement des charges récurrentes à partir des transactions ingérées (libellés et montants similaires détectés sur plusieurs mois).
- FR18 — L'utilisateur peut accepter, modifier ou rejeter une suggestion de charge récurrente.

**Modèle de revenus personnels**
- FR19 — L'utilisateur peut déclarer son ARE (montant mensuel + date de fin estimée).
- FR20 — L'utilisateur peut déclarer le loyer mensuel versé par sa SAS.
- FR21 — L'utilisateur peut déclarer une estimation moyenne de défraiements mensuels.
- FR22 — Le système identifie les défraiements comme revenus non-imposables, exclus de l'assiette fiscale.

**Modèle SAS (léger, déclaratif)**
- FR23 — L'utilisateur peut déclarer la date de clôture de l'exercice fiscal de sa SAS.
- FR24 — L'utilisateur peut déclarer une prévision de chiffre d'affaires sur l'exercice en cours, modifiable à tout moment.
- FR25 — L'utilisateur peut déclarer les charges SAS prévisionnelles (charges sociales, loyer versé au dirigeant, autres frais) globalement ou ligne par ligne.
- FR26 — L'utilisateur peut déclarer manuellement la trésorerie SAS actuelle.
- FR27 — L'utilisateur peut paramétrer le taux d'IS applicable à sa SAS.
- FR28 — Le système calcule la capacité dividendable estimée de la SAS (CA - charges - IS) à la prochaine clôture.

**Modèle Dettes**
- FR29 — L'utilisateur peut créer une fiche dette avec créancier, solde initial, et mode de remboursement (libre / mensualité fixe / lump sum à date donnée).
- FR30 — L'utilisateur peut basculer entre les trois modes de remboursement à tout moment.
- FR31 — L'utilisateur peut enregistrer manuellement une nouvelle avance reçue d'un créancier (incrémentation du solde dette).
- FR32 — Le système décrémente automatiquement le solde d'une dette quand une transaction est marquée comme remboursement de cette dette.
- FR33 — Le système intègre le solde d'une dette au forecast selon son mode (charge fixe mensuelle si mensualité, dépense ponctuelle planifiée si lump sum, hors forecast si libre).
- FR34 — Le système affiche l'impact marginal d'une dette sur le dividende cible.

**Paramètres fiscalité**
- FR35 — L'utilisateur peut paramétrer le taux d'imposition appliqué aux dividendes (flat tax 30% par défaut, modifiable).
- FR36 — L'utilisateur peut désigner le mode d'imposition (flat tax PFU ou option barème progressif IR — déclaratif sans simulation détaillée en V1).

**Tableau de bord narratif**
- FR37 — Le système affiche, pour le mois courant, le solde de fin de mois et la décomposition revenus/charges.
- FR38 — Le système identifie les 2 à 3 écarts les plus significatifs entre le mois courant et les mois précédents (catégorie, sens, amplitude).
- FR39 — Le système formule ces écarts en phrases explicatives.
- FR40 — L'utilisateur peut naviguer entre les mois ingérés et consulter la vue narrative de chacun.

**Projection des dépenses variables**
- FR41 — Le système calcule, pour chaque catégorie de dépenses variables, une moyenne mobile sur les N derniers mois ingérés (N paramétrable, défaut 3 mois).
- FR42 — Le système intègre ces projections par catégorie dans le forecast pour tous les mois futurs jusqu'à l'horizon choisi.
- FR43 — Le forecast distingue visuellement les quatre sources : charge fixe déclarée, charge variable extrapolée, charge ponctuelle planifiée, revenu.
- FR44 — L'utilisateur peut outrepasser, pour un mois futur donné et une catégorie variable donnée, le montant projeté par une valeur manuelle (override mois × catégorie).
- FR45 — Le système signale les catégories sans historique suffisant (moins de N mois ingérés) avec un indicateur de fiabilité réduit.

**Forecast inverse**
- FR46 — L'utilisateur peut consulter une projection de trésorerie personnelle mensuelle sur 6, 12 et 24 mois.
- FR47 — Le système signale la date à laquelle le solde personnel projeté passe en négatif si aucune action n'est entreprise.
- FR48 — Le système calcule le montant de dividende NET à verser à la prochaine AG de clôture pour maintenir le solde projeté positif sur l'horizon choisi.
- FR49 — Le système affiche le montant BRUT de dividende correspondant, calculé à partir du paramètre fiscalité.
- FR50 — Le système compare le dividende BRUT requis à la capacité dividendable estimée de la SAS et expose la marge.
- FR51 — Si le dividende requis dépasse la capacité dividendable, le système expose les leviers d'ajustement (réduire dépenses, augmenter CA, décaler objectifs).
- FR52 — Le système alerte l'utilisateur si la date prévue de versement du dividende coïncide avec une période où l'ARE est encore active.
- FR53 — Le système recalcule le forecast automatiquement après toute modification d'un modèle ou ingestion d'un nouveau PDF.

**Disclaimer & transparence**
- FR54 — Le système affiche un disclaimer indiquant que l'outil ne remplace pas un conseil fiscal/juridique professionnel, à la première utilisation et accessible en permanence.

### NonFunctional Requirements

**Performance**
- NFR1 — L'ingestion complète d'un PDF Boursorama mensuel (extraction → catégorisation LLM → réconciliation → persistance → restitution dashboard) doit s'achever en moins de 30 secondes sur la machine de l'utilisateur.
- NFR2 — Le recalcul du forecast inverse après modification d'un input doit s'achever en moins de 1 seconde.
- NFR3 — La navigation entre mois ingérés doit donner un ressenti instantané (cible non quantifiée — viser < 200 ms quand possible).

**Security**
- NFR4 — La clé API Anthropic est stockée exclusivement dans un fichier `.env` non versionné. Elle ne doit jamais apparaître en base, en logs, en réponse HTTP, ni dans le bundle client.
- NFR5 — Les PDFs sources et la base SQLite sont stockés exclusivement sur le système de fichiers local, dans des chemins gitignorés. Aucun upload de PDF brut vers un service tiers.
- NFR6 — Les données envoyées à l'API Anthropic se limitent au texte structuré des transactions (date, libellé, montant). Aucune donnée d'identification (nom complet, IBAN, RIB, adresse) ne quitte la machine.
- NFR7 — Aucune authentification utilisateur n'est implémentée en V1. L'app suppose un environnement local de confiance.

**Reliability & Data Integrity**
- NFR8 — Toutes les valeurs monétaires sont manipulées en interne sous forme d'entiers en centimes (`integer cents`).
- NFR9 — Toute fonction de calcul d'agrégat ou de projection est couverte par des tests unitaires, incluant cas limites (mois 28-31 jours, charges annuelles à cheval, dette à zéro, ARE qui se termine en milieu de mois, override de catégorie variable, historique vide).
- NFR10 — La réconciliation transactions ↔ solde PDF s'exécute systématiquement à l'ingestion. Une divergence ≥ 1 centime ne peut pas être ignorée silencieusement.
- NFR11 — La perte totale de la base SQLite est acceptable en V1. La base doit pouvoir être reconstruite intégralement à partir des PDFs sources conservés.

**Integration**
- NFR12 — Une seule intégration externe : API Anthropic Claude. Aucune autre dépendance réseau en runtime.
- NFR13 — En cas d'indisponibilité de l'API Claude, l'ingestion d'un nouveau PDF échoue avec message explicite. L'app reste utilisable pour la consultation de données déjà ingérées.
- NFR14 — Le client Claude utilise des structured outputs (sortie JSON contrainte par schéma). Toute sortie non conforme au schéma déclenche un échec d'ingestion explicite.

**Maintainability**
- NFR15 — Le code suit les principes KISS, SOLID, DRY, formalisés dans `CLAUDE.md`. Pas d'abstractions spéculatives, pas de feature flags pour fonctionnalités hypothétiques.
- NFR16 — Le parser PDF (extraction texte) est isolé dans un module dédié avec une interface stable, pour permettre l'ajout d'autres formats bancaires en Growth sans refactor du reste du code.
- NFR17 — Les règles fiscales et taux (IS, flat tax, taux d'imposition) sont définis dans une configuration paramétrable, jamais en dur dans le code.
- NFR18 — Couverture de tests cible : 100% sur les fonctions de calcul financier ; best effort ailleurs.

### Additional Requirements

**Bootstrap projet (depuis Architecture §Starter Template) :**
- Initialisation Nuxt 4 vanilla via `npx nuxi@latest init` (Yarn Classic).
- Configuration `nuxt.config.ts` avec `ssr: false`, `modules: ['@pinia/nuxt']`.
- Installation des add-ons : `@pinia/nuxt`, `pinia`, `drizzle-orm`, `better-sqlite3`, `drizzle-kit`, `unpdf`, `@anthropic-ai/sdk`, `zod`, `reka-ui` (optionnel), `vitest`, `@vitest/ui`, `happy-dom`, `@playwright/test`, `@nuxt/eslint`, `eslint`.
- Création des fichiers de config : `tsconfig.json` strict, `drizzle.config.ts`, `vitest.config.ts`, `playwright.config.ts`, `eslint.config.mjs`.
- Création de `.env.example` (template clé `ANTHROPIC_API_KEY`).
- Création de `.gitignore` avec entrées : `_data/`, `.env`, `.output/`, `.nuxt/`, `node_modules/`.
- Scripts `package.json` : `dev`, `build`, `start`, `db:push`, `db:generate`, `apply-migration`, `db:studio`, `test`, `test:run`, `test:e2e`, `lint`, `lint:fix`, `typecheck`.
- Rédaction `CLAUDE.md` initial (déjà rédigé en amont — à valider/intégrer).

**Décisions techniques transversales (Architecture D1-D10) :**
- D1 — Branded type `Cents` dans `shared/types/money.ts` + helpers (`eurosToCents`, `centsToEuros`, `formatEuros`). À poser **avant tout code métier**.
- D2 — Dates métier en `YYYY-MM-DD` (text), timestamps techniques en epoch secondes (integer).
- D3 — Stockage des PDFs : `_data/raw/{sha256}.pdf` (le hash *est* le chemin).
- D4 — Migrations : `drizzle-kit push` par défaut V1, `drizzle-kit generate` + `apply-migration` disponibles dès le départ.
- D5 — Endpoints REST classiques Nitro (cf. structure complète dans Architecture §Project Structure).
- D6 — Erreurs API normalisées via `createError()` Nitro (`statusMessage` = code stable snake_case, `data` = détails).
- D7 — Schémas Zod partagés client/serveur dans `shared/schemas/`.
- D8 — Split server-state (`useFetch`/`$fetch`) / UI-state (Pinia minimal).
- D9 — Forecast = endpoint pur, pas d'état persisté ; recalcul à la demande.
- D10 — 3 modes de lancement local : `yarn dev`, `yarn build && yarn start`, tests Vitest/Playwright.

**Boundaries imperméables (Architecture §Architectural Boundaries) :**
- `unpdf` consommé exclusivement depuis `server/services/pdf-extractor.ts`.
- `@anthropic-ai/sdk` consommé exclusivement depuis `server/services/llm-categorizer.ts`.
- DB SQLite accédée via instance unique `server/db/client.ts`.
- Composants Vue ne font jamais `$fetch`/`useFetch` direct — toujours via composable.

**Gaps à résoudre dans les stories (Architecture §Validation) :**
- G1 — Persistance du flag "disclaimer vu" via `localStorage` (state UI pur).
- G2 — Bootstrap base de données : middleware Nitro `server/middleware/0.bootstrap.ts` qui crée `_data/`, ouvre la DB, push schéma programmatique, seed catégories par défaut au premier lancement.
- G3 — Extraction de période depuis le PDF : tenter depuis le texte du relevé en premier, fallback via dates min/max des transactions extraites.
- G4 — Tests coverage enforcement manuel en V1 (à formaliser plus tard).
- G5 — Snapshots forecast reproductibles dans `tests/fixtures/snapshots/`, à instaurer dès la première story qui touche `forecast-engine.ts`.

### UX Design Requirements

_(Aucun document UX Design en V1 — décision PRD : périmètre desktop perso, UX au fil de l'eau pendant l'implémentation. Les conventions visuelles sont posées dans CLAUDE.md/Architecture : CSS vanilla, custom properties, navigation clavier, focus visible, contrastes WCAG AA, ≥ 1280 px, Chrome/Firefox seulement.)_

### FR Coverage Map

| FR | Epic | Description courte |
|---|---|---|
| FR1-FR8, FR10-FR12, FR54 | Epic 2 | Ingestion, catégorisation, édition catégorie, réconciliation auto, disclaimer |
| FR9 | Epic 6 | Marquage transaction = remboursement dette |
| FR13-FR15 | Epic 3 | Réconciliation manuelle |
| FR16-FR28, FR35-FR36, FR55-FR57 | Epic 5 | Charges, revenus, SAS, fiscalité, gestion catégories |
| FR29-FR34 | Epic 6 | Dettes |
| FR37-FR40 | Epic 4 | Dashboard narratif |
| FR41-FR53 | Epic 7 | Forecast inverse complet |
| FR58-FR61 | Epic 8 | Fondation multi-profils/comptes |
| FR62-FR64 | Epic 9 | Comptes en gestion (mode suivi) |
| FR65-FR68 | Epic 10 | Dépenses communes (split conjoint) |
| FR69-FR71 | Epic 11 | Extraction PDF par banque |

**71/71 FRs mappés** (57 V1 + 14 Phase 1.x). NFRs et Additional Requirements traversent tous les epics (rappels dans les stories concernées via les invariants `Cents`, réconciliation, parser/LLM boundaries, etc.).

## Epic List

### Epic 1 : Foundation & primitives financières
*L'app démarre proprement, les fondations partagées sont posées.*

À la fin : `yarn dev` lance l'app, une home page minimaliste s'affiche, la base SQLite est créée au premier démarrage avec les catégories par défaut, le branded type `Cents` et les helpers monétaires sont disponibles partout, le pattern d'erreurs API et la validation Zod sont opérationnels. Pas de feature métier, mais Story 2.1 et au-delà peuvent partir d'une base saine.

**FRs couverts :** —
**Architecture additional requirements :** Bootstrap projet, D1 (Cents), D2 (dates), D6 (erreurs), D7 (Zod), D10 (lancement), G2 (bootstrap base de données)

### Epic 2 : Ingestion & catégorisation des relevés
*L'utilisateur dépose un PDF Boursorama et voit ses transactions catégorisées.*

Premier slice vertical complet. Pipeline complet : drop PDF → hash dédup → extraction texte → catégorisation LLM → réconciliation automatique silencieuse → persistance → liste des transactions consultable et catégorie éditable. Disclaimer affiché à la première utilisation.

**FRs couverts :** FR1, FR2, FR3, FR4, FR5, FR6, FR7, FR8, FR10, FR11, FR12, FR54
**Notes :** FR9 (marquage "remboursement dette") reporté à Epic 6 (Dettes), car il dépend de l'entité Debt. Cas heureux uniquement de la réconciliation (résolution manuelle dans Epic 3).

### Epic 3 : Réconciliation manuelle des écarts
*L'utilisateur peut résoudre une réconciliation qui échoue.*

Vue de réconciliation explicite, ajout manuel de transactions manquantes, possibilité d'accepter un écart en marquant le mois "non fiable" et propagation de cet état vers les futurs calculs.

**FRs couverts :** FR13, FR14, FR15

### Epic 4 : Dashboard mensuel narratif
*L'utilisateur ouvre l'app et comprend en < 30 sec pourquoi son compte est dans cet état.*

Vue narrative du mois courant avec top 2-3 écarts vs mois précédents, navigation entre mois ingérés. Dépend uniquement d'avoir des transactions catégorisées (Epics 2-3).

**FRs couverts :** FR37, FR38, FR39, FR40

### Epic 5 : Modèles financiers (charges, revenus, SAS, fiscalité)
*L'utilisateur déclare ses charges fixes, ses revenus, sa SAS et ses préférences fiscales.*

Tous les modèles déclaratifs nécessaires au forecast. Inclut les suggestions automatiques de charges récurrentes (FR17-18), la capacité dividendable estimée (FR28), et la configuration fiscalité (FR35-36).

**FRs couverts :** FR16, FR17, FR18, FR19, FR20, FR21, FR22, FR23, FR24, FR25, FR26, FR27, FR28, FR35, FR36, FR55, FR56, FR57

### Epic 6 : Dettes
*L'utilisateur tracke ses dettes (avances reçues + remboursements) et voit leur impact financier.*

Modèle Dette avec les 3 modes (libre / mensualité / lump sum), historique des avances et remboursements, marquage des transactions comme remboursement (FR9 ici), et impact marginal d'une dette sur le dividende cible.

**FRs couverts :** FR9, FR29, FR30, FR31, FR32, FR33, FR34

### Epic 7 : Forecast inverse
*Killer feature — l'utilisateur voit le dividende NET à voter en AG, la marge vs capacité dividendable, et les leviers d'ajustement.*

Tout le moteur de forecast intégré : projection des dépenses variables (moyennes mobiles), trajectoire mensuelle 6/12/24 mois, calcul dividende NET requis, conversion BRUT via fiscalité, comparaison vs capacité dividendable, alertes (ARE, mois non fiable, dépassement capacité), exposition des leviers d'ajustement, override mois×catégorie. Recalcul automatique sur toute mutation amont.

**FRs couverts :** FR41, FR42, FR43, FR44, FR45, FR46, FR47, FR48, FR49, FR50, FR51, FR52, FR53

---

## Phase 1.x — Multi-profils / multi-comptes *(amendement Sprint Change Proposal 2026-07-12)*

> Attaqués **après clôture des epics 5/6/7 (V1 mono-user livré)**. Epic 8 = socle bloquant des epics 9-11. Voir `sprint-change-proposal-2026-07-12.md` et FR58-FR71. Décisions architecture D11-D14 + 3 open questions à trancher par l'architecte avant dev.

### Epic 8 : Fondation multi-profils / multi-comptes
*Socle. Le modèle de données, les endpoints et l'UI supportent plusieurs profils et comptes ; tout le code V1 est re-scopé sur le compte/profil actif.*

**FRs couverts :** FR58, FR59, FR60, FR61

### Epic 9 : Comptes en gestion (mode suivi)
*Un profil `managed` (parents, conjoint) permet ingestion/catégo/réconciliation/dashboard, sans forecast ni dividende.*

**FRs couverts :** FR62, FR63, FR64

### Epic 10 : Dépenses communes (split conjoint)
*Une transaction flaggée « commune » alimente le compte-courant de dette entre l'utilisateur et son conjoint (réutilise le modèle Dettes de l'epic 6).*

**FRs couverts :** FR65, FR66, FR67, FR68

### Epic 11 : Extraction PDF paramétrée par banque
*`pdf-extractor` route vers une stratégie d'extraction selon la banque du compte ; Boursorama = première stratégie.*

**FRs couverts :** FR69, FR70, FR71

### Dépendances inter-epics

- Epic 2 dépend d'Epic 1 (foundation)
- Epic 3 dépend d'Epic 2 (pipeline d'ingestion)
- Epic 4 dépend d'Epic 2 (transactions disponibles)
- Epic 5 dépend d'Epic 1 (foundation seulement)
- Epic 6 dépend d'Epic 5 (modèle SAS pour impact dividende) et d'Epic 2 (pour FR9)
- Epic 7 dépend d'Epics 4-6 (intègre tous les modèles)
- **Epic 8 dépend d'Epics 1-7 (re-scope le code V1 existant) ; à démarrer après clôture 5/6/7**
- **Epic 9 dépend d'Epic 8 (kind de profil)**
- **Epic 10 dépend d'Epic 8 (scoping) + Epic 6 (Dettes)**
- **Epic 11 dépend d'Epic 8 (`accounts.bank`)**

Pas de dépendance circulaire. Chaque epic livre une valeur indépendante.

---

## Epic 1: Foundation & primitives financières

L'app démarre proprement, les fondations partagées (Cents, DB, error handling, bootstrap, home page) sont posées. Pas de feature métier, mais Story 2.1 et au-delà partent d'une base saine.

### Story 1.1: Initialiser le projet Nuxt 4 et installer les dépendances

As a dev,
I want to bootstrap the Nuxt 4 project with all required dependencies,
So that the development environment is ready for feature work.

**Acceptance Criteria:**

**Given** un répertoire de projet vide (ou contenant uniquement les docs de planning),
**When** j'exécute `npx nuxi@latest init .` puis `yarn install`,
**Then** un projet Nuxt 4 est initialisé avec la structure `app/`, `server/`, `nuxt.config.ts`, `tsconfig.json`,
**And** `yarn dev` lance Nuxt sans erreur sur `http://localhost:3000`.

**Given** un projet Nuxt initialisé,
**When** j'exécute les commandes `yarn add` listées dans `_bmad-output/planning-artifacts/architecture.md` (Pinia, Drizzle, better-sqlite3, drizzle-kit, unpdf, @anthropic-ai/sdk, zod, vitest, @playwright/test, @nuxt/eslint, eslint),
**Then** toutes les dépendances sont installées sans conflit dans `package.json` et `yarn.lock`,
**And** `yarn dev` redémarre sans erreur.

**Given** les dépendances installées,
**When** je modifie `nuxt.config.ts` avec `ssr: false`, `devtools: { enabled: true }`, `modules: ['@pinia/nuxt']`, `css: []`,
**Then** la configuration est appliquée au prochain `yarn dev`.

**Given** le projet configuré,
**When** je crée `.env.example` (avec `ANTHROPIC_API_KEY=`) et `.gitignore` (incluant `_data/`, `.env`, `.output/`, `.nuxt/`, `node_modules/`),
**Then** ces fichiers sont présents et conformes aux règles du `CLAUDE.md`.

**And** je crée les scripts npm dans `package.json` selon la liste de l'architecture (`dev`, `build`, `start`, `db:push`, `db:generate`, `apply-migration`, `db:studio`, `test`, `test:run`, `test:e2e`, `lint`, `lint:fix`, `typecheck`).

### Story 1.2: Configurer TypeScript strict, ESLint et tests

As a dev,
I want strict TypeScript, linting and a working test runner,
So that all subsequent code respects the conventions documented in CLAUDE.md.

**Acceptance Criteria:**

**Given** un `tsconfig.json` initial,
**When** j'active `"strict": true`, `"noUncheckedIndexedAccess": true`, `"noImplicitOverride": true`,
**Then** `yarn typecheck` (`nuxt typecheck`) passe sur le projet vide.

**Given** ESLint installé,
**When** je crée `eslint.config.mjs` basé sur `@nuxt/eslint`,
**Then** `yarn lint` passe sur le projet vide sans erreurs.

**Given** Vitest installé,
**When** je crée `vitest.config.ts` avec environnement `happy-dom` et `globals: true`,
**Then** `yarn test:run` exécute zéro test sans erreur.

**Given** Playwright installé,
**When** je crée `playwright.config.ts` ciblant Chrome et Firefox sur `http://localhost:3000`,
**Then** `yarn test:e2e` ne plante pas (zero spec OK).

### Story 1.3: Implémenter le branded type `Cents` et les helpers monétaires

As a dev,
I want a Cents branded type with safe conversion helpers,
So that no financial calculation can mix raw numbers with monetary values.

**Acceptance Criteria:**

**Given** la structure `shared/types/`,
**When** je crée `shared/types/money.ts` exposant le type `Cents = number & { readonly __brand: 'Cents' }` et les fonctions `cents`, `eurosToCents`, `centsToEuros`, `formatEuros`, `addCents`, `subCents`, `mulCents` (multiplication par un scalaire entier ou ratio rationnel sécurisé),
**Then** un `number` brut ne peut pas être assigné à un paramètre `Cents` sans passer par un helper (vérifié par compilation).

**Given** les helpers implémentés,
**When** j'écris un test unitaire `shared/types/money.test.ts`,
**Then** le test couvre : conversion 12.34 € → 1234 cents (sans float drift), 0.1 + 0.2 sur Cents → 30 cents (pas 0.30000000004), formatage `1234 cents → "12,34 €"` (locale fr-FR), arrondi correct sur eurosToCents (`12.345 → 1235`).

**Given** la fonction `formatEuros`,
**When** elle reçoit un montant négatif,
**Then** elle retourne le format français standard avec signe (`"-12,34 €"`).

### Story 1.4: Configurer Drizzle, créer le client DB et un schéma initial vide

As a dev,
I want a Drizzle client connected to a local SQLite database,
So that future stories can declare tables and run migrations.

**Acceptance Criteria:**

**Given** Drizzle et better-sqlite3 installés,
**When** je crée `drizzle.config.ts` pointant vers `_data/personnalfinance.db` et `server/db/schema.ts`,
**Then** `yarn db:studio` peut se lancer (sur une DB vide).

**Given** la config Drizzle,
**When** je crée `server/db/client.ts` exposant une instance unique `db` créée via `drizzle(better-sqlite3(...))`,
**Then** un import depuis n'importe quel endroit du serveur retourne le même singleton.

**Given** le client DB,
**When** je crée `server/db/schema.ts` avec une seule table technique `category_definitions` (`id` integer PK, `code` text unique, `label` text, `is_variable` integer boolean, `created_at` integer),
**Then** `yarn db:push` crée la table sans erreur sur la base locale.

**And** la convention de nommage `snake_case` pluriel pour les tables et `_cents` / `_date` suffixes pour les colonnes futures est documentée en commentaire d'en-tête de `schema.ts`.

### Story 1.5: Bootstrap middleware (création `_data/`, ouverture DB, seed catégories)

As a user lançant l'app pour la première fois,
I want the database and folders to be created automatically,
So that I don't have to run setup scripts manually.

**Acceptance Criteria:**

**Given** un environnement neuf (pas de `_data/`),
**When** je lance `yarn dev`,
**Then** le middleware `server/middleware/0.bootstrap.ts` s'exécute une fois et crée `_data/`, `_data/raw/` (mkdir récursif idempotent),
**And** ouvre/crée `_data/personnalfinance.db`,
**And** exécute un push programmatique du schéma (ou vérifie que les tables existent),
**And** seed la table `category_definitions` avec la liste par défaut depuis `shared/constants/default-categories.ts` (ex: courses, restaurants, transports, abonnements, santé, loisirs, divers… liste à figer).

**Given** un environnement déjà initialisé,
**When** je relance `yarn dev`,
**Then** le bootstrap détecte que la base existe et ne réexécute pas le seed (idempotent).

**Given** le bootstrap exécuté,
**When** je consulte la base via `yarn db:studio`,
**Then** la table `category_definitions` contient la liste des catégories par défaut avec `is_variable` correctement positionné (true pour courses/restos/transports, false pour abonnements/loyer/etc.).

### Story 1.6: Helpers d'erreurs API et validation Zod

As a dev,
I want centralised error helpers and a Zod validation utility,
So that all subsequent endpoints follow the same patterns.

**Acceptance Criteria:**

**Given** la convention de format d'erreur (statusMessage = code stable snake_case),
**When** je crée `server/utils/errors.ts` exposant des helpers (`badRequest(code, data)`, `validationError(zodErr)`, `notFound(code, data)`, `domainError(code, data)`),
**Then** chaque helper retourne un `createError()` Nitro avec la forme normalisée documentée dans l'architecture.

**Given** le pattern de validation,
**When** je crée `server/utils/validation.ts` avec une fonction `validateBody<T>(event, schema)` qui appelle `readValidatedBody` et lève `validationError` en cas d'échec,
**Then** un endpoint peut consommer une payload typée en une ligne.

**Given** la liste de codes d'erreur stable,
**When** je crée `shared/schemas/api-errors.ts`,
**Then** le fichier exporte un enum/const `ApiErrorCode` listant les codes initiaux (`validation_failed`, `not_found`, `reconciliation_failed`, `pdf_already_ingested`, `period_overlap`, `llm_extraction_failed`, `llm_unavailable`).

**Given** les erreurs typées,
**When** je crée `app/composables/useApiError.ts`,
**Then** le composable expose `mapError(err): string` qui retourne un message FR correspondant au code (mapping initial pour les codes ci-dessus).

### Story 1.7: Home page minimaliste + AppHeader/AppNav + tokens CSS

As a user,
I want to land on a minimal home page when launching the app,
So that I can verify the foundation is operational before any feature lands.

**Acceptance Criteria:**

**Given** `app/app.vue` initialisé,
**When** je crée `app/assets/styles/tokens.css` (custom properties : couleurs neutres, spacing scale, typo) et `reset.css` (normalize moderne minimal) et `global.css`,
**Then** ils sont importés via `nuxt.config.ts` ou `app.vue` et appliqués globalement.

**Given** la base de styles,
**When** je crée `app/components/shared/AppHeader.vue` (titre app + version) et `app/components/shared/AppNav.vue` (placeholders pour les pages futures, sans liens cassés),
**Then** ils s'affichent correctement.

**Given** la home,
**When** je crée `app/pages/index.vue`,
**Then** elle affiche un message d'accueil minimal ("personnalFinance — aucun relevé pour l'instant. Importe ton premier PDF pour commencer.") et le AppDisclaimer (composant créé même si masquable, FR54 sera complétée en Epic 2).

**And** `yarn dev` permet d'accéder à `http://localhost:3000` sans erreur console côté client ni serveur.

---

## Epic 2: Ingestion & catégorisation des relevés

L'utilisateur dépose un PDF Boursorama et voit ses transactions catégorisées. Pipeline complet : drop → hash dédup → extraction → catégorisation LLM → réconciliation auto → persistance → UI.

### Story 2.1: Schéma DB pour `bank_statements` et `transactions`

As a dev,
I want the bank statement and transaction tables defined,
So that the ingestion pipeline can persist its results.

**Acceptance Criteria:**

**Given** `server/db/schema.ts`,
**When** j'ajoute la table `bank_statements` (`hash_sha256` PK text, `period_start` text YYYY-MM-DD, `period_end` text YYYY-MM-DD, `opening_balance_cents` integer, `closing_balance_cents` integer, `reliability` text 'reliable'|'unreliable', `ingested_at` integer epoch),
**And** la table `transactions` (`id` integer PK auto, `statement_hash` FK → bank_statements.hash_sha256, `transaction_date` text YYYY-MM-DD, `label` text, `amount_cents` integer signed, `category_code` FK → category_definitions.code, `is_manual` integer boolean default 0, `is_debt_repayment` integer boolean default 0, `debt_id` FK nullable, `created_at` integer),
**Then** `yarn db:push` synchronise sans erreur.

**Given** les tables créées,
**When** j'ajoute des index : `transactions_period_idx` sur `transaction_date`, `transactions_statement_idx` sur `statement_hash`,
**Then** ils sont créés.

**And** les schémas Zod correspondants sont créés dans `shared/schemas/statement.schema.ts` et `shared/schemas/transaction.schema.ts` avec `z.infer<>` pour les types TS.

### Story 2.2: Service `pdf-extractor` (wrapper `unpdf`)

As a dev,
I want a stable interface for PDF text extraction,
So that the ingestion pipeline does not depend directly on `unpdf`.

**Acceptance Criteria:**

**Given** `server/services/pdf-extractor.ts`,
**When** j'expose une fonction `extractStatement(pdfBuffer: Buffer): Promise<RawStatement>` qui utilise `unpdf` en interne,
**Then** `RawStatement` contient `{ rawText: string, periodStart: string | null, periodEnd: string | null, openingBalanceCents: Cents | null, closingBalanceCents: Cents | null }`,
**And** la période et les soldes sont extraits depuis le texte du relevé via parsing regex (G3 — fallback sur dates min/max des transactions sera fait dans la story d'orchestration).

**Given** un PDF Boursorama de fixture (`tests/fixtures/pdfs/statement-jan-2026.pdf` à fournir manuellement par l'utilisateur),
**When** j'écris un test `pdf-extractor.test.ts`,
**Then** le test extrait du texte non vide et trouve une période et des soldes plausibles.

**And** aucun import de `unpdf` n'existe ailleurs dans le code (vérifiable par grep).

### Story 2.3: Helpers `hash` (SHA-256), `period` (YYYY-MM intervals), `file-storage`

As a dev,
I want utility helpers for hashing PDFs, manipulating periods and storing files,
So that the ingestion endpoint can compose them simply.

**Acceptance Criteria:**

**Given** `server/utils/hash.ts`,
**When** j'expose `sha256(buf: Buffer | Uint8Array): string`,
**Then** la fonction retourne un hex string de 64 caractères, et un test couvre la stabilité du hash sur un buffer connu.

**Given** `server/utils/period.ts`,
**When** j'expose des helpers `parsePeriod(text)`, `monthOf(dateIso)`, `monthsOverlap(start1, end1, start2, end2): boolean`, `nextMonths(fromMonth, n): string[]`,
**Then** des tests couvrent les cas limites (mois 28-31 jours, années bissextiles, intervalles à cheval).

**Given** `server/utils/file-storage.ts`,
**When** j'expose `savePdfByHash(buf, hash)` (écrit dans `_data/raw/{hash}.pdf`) et `pdfExists(hash): boolean` et `loadPdfByHash(hash): Buffer`,
**Then** les fonctions sont idempotentes (réécrire le même hash ne déclenche pas d'erreur), et un test couvre le round-trip.

### Story 2.4: Service `llm-categorizer` (Claude API + structured outputs)

As a dev,
I want a categorization service that turns raw statement text into typed transactions,
So that ingestion produces clean structured data.

**Acceptance Criteria:**

**Given** `shared/constants/bank-statement-llm-prompt.ts` contenant le prompt système figé V1,
**And** `shared/schemas/transaction.schema.ts` exposant le schéma JSON attendu (date, label, amountCents signed, categoryCode parmi la liste des `category_definitions`),
**When** je crée `server/services/llm-categorizer.ts` exposant `categorizeStatement(rawText, availableCategories): Promise<CategorizedTransaction[]>`,
**Then** le service appelle Claude avec structured outputs, valide la réponse via Zod, et lève `domainError('llm_extraction_failed', { reason })` si la sortie ne valide pas le schéma.

**Given** l'API Claude indisponible,
**When** je tente une catégorisation,
**Then** le service propage `domainError('llm_unavailable', {...})` (NFR13).

**Given** la clé API non configurée,
**When** je tente une catégorisation,
**Then** une erreur explicite est levée au démarrage du service (`Missing ANTHROPIC_API_KEY`).

**And** un test `llm-categorizer.test.ts` mocke le SDK Anthropic et vérifie : (a) cas heureux avec sortie valide, (b) sortie invalide → `llm_extraction_failed`, (c) erreur réseau → `llm_unavailable`.

**And** aucun import de `@anthropic-ai/sdk` n'existe ailleurs.

### Story 2.5: Service `reconciler` (vérification somme transactions vs solde PDF)

As a dev,
I want an automatic reconciliation check after categorization,
So that monetary divergence ≥ 1 cent never goes unnoticed.

**Acceptance Criteria:**

**Given** `server/services/reconciler.ts`,
**When** j'expose `reconcile({ openingCents, closingCents, transactions }): { isBalanced: boolean, gapCents: Cents }`,
**Then** la fonction retourne `isBalanced: true` si `closingCents - openingCents - sum(amountCents) === 0`, sinon `false` avec le gap.

**Given** des cas connus,
**When** j'écris `reconciler.test.ts`,
**Then** le test couvre : (a) cas équilibré exact, (b) écart de 1 centime → unbalanced, (c) écart de 0 sur transactions vides, (d) montants signés mixtes (entrants + sortants).

### Story 2.6: Endpoint `POST /api/statements` orchestrant le pipeline complet

As a user,
I want to drop a PDF and get my categorized transactions persisted,
So that I can start using the app on real data.

**Acceptance Criteria:**

**Given** un endpoint `server/api/statements/index.post.ts` qui accepte un `multipart/form-data` avec un champ `file` (PDF),
**When** un PDF est uploadé,
**Then** le pipeline exécute en séquence : (1) `sha256(buffer)`, (2) check si hash déjà en base → `domainError('pdf_already_ingested', { hash })`, (3) `extractStatement` (texte + période + soldes), (4) check chevauchement de période avec un autre PDF déjà ingéré → `domainError('period_overlap', { existingHash, periodStart, periodEnd })` *si pas de header `X-Confirm-Replace: true`*, (5) `savePdfByHash`, (6) `categorizeStatement`, (7) `reconcile`, (8) INSERT statement + transactions dans une transaction Drizzle, (9) retour `{ hash, periodStart, periodEnd, transactionCount, isBalanced, gapCents }`.

**Given** une réingestion avec `X-Confirm-Replace: true`,
**When** le hash diffère mais la période chevauche,
**Then** les transactions du précédent statement de la période sont supprimées et remplacées (suppression CASCADE OK).

**Given** la fallback G3 sur extraction de période,
**When** `extractStatement` ne trouve pas de période dans le texte,
**Then** l'endpoint déduit `periodStart`/`periodEnd` depuis min/max des `transaction_date` extraits.

**And** un test E2E Playwright `tests/e2e/ingestion.spec.ts` couvre le drop d'un PDF de fixture et vérifie que le dashboard (placeholder en Epic 2) affiche au moins le compteur de transactions.

### Story 2.7: Endpoint `GET /api/transactions` + composable `useTransactions`

As a user,
I want to consult the transactions of a given month,
So that I can review what was ingested.

**Acceptance Criteria:**

**Given** un endpoint `server/api/transactions/index.get.ts` qui accepte un query `?month=YYYY-MM`,
**When** la query est valide,
**Then** l'endpoint retourne un array de transactions du mois trié par `transaction_date` ascendant, chaque item incluant `id`, `transactionDate`, `label`, `amountCents`, `categoryCode`, `isManual`, `isDebtRepayment`, `debtId` (null V1).

**Given** une query invalide (mois mal formé),
**When** l'endpoint est appelé,
**Then** il retourne `validation_failed`.

**Given** le composable `app/composables/useTransactions.ts`,
**When** un composant l'appelle avec un mois,
**Then** il expose `data`, `pending`, `error`, `refresh` et utilise `useFetch` avec une `key` explicite (`transactions-${month}`).

### Story 2.8: Endpoint `PATCH /api/transactions/[id]` + recalcul réactif

As a user,
I want to fix a wrongly categorised transaction,
So that subsequent computations use the correct data.

**Acceptance Criteria:**

**Given** un endpoint `server/api/transactions/[id].patch.ts` validé par Zod,
**When** je PATCH `{ categoryCode: 'restos' }` sur une transaction existante,
**Then** la transaction est mise à jour et `is_manual` passe à `true`.

**Given** une category_code inconnue,
**When** je PATCH,
**Then** l'endpoint retourne `validation_failed` avec détail.

**Given** un PATCH réussi,
**When** le composable `useTransactions` détecte la mutation,
**Then** il invalide `useFetch('forecast-*')` et `useFetch('dashboard-*')` (clés à définir, refresh).

### Story 2.9: UI — `PdfDropZone`, `IngestionProgress`, `PeriodOverlapDialog`, page `/import`

As a user,
I want a clear UI for dropping a PDF and seeing the ingestion progress,
So that the app feels responsive and trustworthy.

**Acceptance Criteria:**

**Given** la page `app/pages/import.vue`,
**When** je glisse-dépose un PDF sur le `PdfDropZone`,
**Then** une barre de progression apparaît avec les étapes (extraction, catégorisation, réconciliation, sauvegarde).

**Given** une réponse `period_overlap`,
**When** elle est reçue,
**Then** un `PeriodOverlapDialog` s'ouvre proposant *Remplacer* (renvoie avec `X-Confirm-Replace: true`) ou *Annuler*.

**Given** une ingestion réussie,
**When** elle se termine,
**Then** un message confirme avec le nombre de transactions ingérées et un lien vers `/transactions/{period}`.

**Given** une erreur `llm_unavailable` ou `pdf_already_ingested`,
**When** elle remonte,
**Then** un message FR clair s'affiche via `useApiError`.

### Story 2.10: UI — `TransactionList`, `CategoryEditor`, page `/transactions/[period]`

As a user,
I want to browse and edit transactions of a month,
So that I can correct categorisation mistakes.

**Acceptance Criteria:**

**Given** la page `app/pages/transactions/[period].vue`,
**When** elle se charge,
**Then** elle affiche la liste des transactions du mois (date, libellé, montant formaté en euros, catégorie).

**Given** un `CategoryEditor` (dropdown ou popover avec liste de catégories),
**When** je change la catégorie d'une transaction,
**Then** un PATCH est émis, l'item se met à jour optimistiquement et un toast confirme.

**Given** un `AppDisclaimer`,
**When** je lance l'app pour la première fois (flag `localStorage` non posé — G1),
**Then** un bandeau ou modal s'affiche avec le texte de disclaimer (FR54) et un bouton *J'ai compris* qui pose le flag.

---

## Epic 3: Réconciliation manuelle des écarts

### Story 3.1: Endpoint `POST /api/reconciliation/[hash]` (ajout transaction manuelle, accept gap)

As a user,
I want to manually fix a reconciliation gap,
So that my month's data becomes trustworthy or is explicitly marked unreliable.

**Acceptance Criteria:**

**Given** un endpoint `server/api/reconciliation/[hash].post.ts` validé par Zod,
**When** je POST `{ action: 'add_transaction', transaction: {...} }`,
**Then** une transaction avec `is_manual: true` est insérée dans le statement, le reconciler recalcule et retourne `{ isBalanced, gapCents }`.

**Given** un POST `{ action: 'accept_gap' }`,
**When** un gap résiduel est non nul,
**Then** une transaction "divers/inconnu" du montant du gap est insérée (`is_manual: true`, `category_code: 'divers'`), `bank_statements.reliability` passe à `'unreliable'`, et le mois est désormais flagué pour le forecast.

**Given** un POST `{ action: 'add_transaction' }` qui ramène le gap à zéro,
**When** la transaction insérée équilibre exactement,
**Then** `bank_statements.reliability` reste `'reliable'`.

### Story 3.2: UI — `ReconciliationGap`, `AddManualTransaction`, accès depuis page d'import et liste des relevés

As a user,
I want a clear gap view with the ability to add missing transactions,
So that I can resolve any discrepancy after ingestion.

**Acceptance Criteria:**

**Given** une réponse d'ingestion avec `isBalanced: false`,
**When** elle s'affiche,
**Then** un bouton "Résoudre l'écart" mène à la vue de réconciliation pour ce hash.

**Given** la vue de réconciliation,
**When** elle se charge,
**Then** elle affiche le `gapCents` formaté, les soldes attendu et trouvé, et un bouton *Ajouter une transaction*.

**Given** le `AddManualTransaction` form (date, libellé, montant signé, catégorie),
**When** je soumets,
**Then** un POST `add_transaction` est émis et le gap est recalculé/affiché à nouveau.

**Given** un gap résiduel,
**When** je clique sur *Accepter l'écart (mois non fiable)*,
**Then** un `ConfirmDialog` apparaît, et après confirmation un POST `accept_gap` est émis et la vue ferme.

### Story 3.3: `ReliabilityBadge` + propagation de la fiabilité dans la liste des relevés et dashboard

As a user,
I want to see at a glance which months are reliable,
So that I know which figures to trust.

**Acceptance Criteria:**

**Given** une page `/import` listant les statements ingérés (ajout dans cette story si pas déjà en 2.x),
**When** un statement a `reliability: 'unreliable'`,
**Then** un `ReliabilityBadge` rouge "Mois non fiable" s'affiche à côté de la période.

**Given** la page `/transactions/[period]`,
**When** le mois est non fiable,
**Then** un bandeau d'alerte s'affiche en haut de la liste.

**And** un test E2E couvre : ingestion d'un PDF avec gap (fixture `statement-with-gap.pdf`) → vue de gap → ajout manuel → réconcilié ; et un autre flow → accept_gap → mois marqué non fiable.

---

## Epic 4: Dashboard mensuel narratif

### Story 4.1: Endpoint `GET /api/dashboard?month=YYYY-MM` (agrégats + comparaison vs mois précédents)

As a dev,
I want a single endpoint that returns all dashboard data for a month,
So that the UI page is simple to render.

**Acceptance Criteria:**

**Given** un endpoint `server/api/dashboard.get.ts` validé par Zod,
**When** appelé avec `?month=2026-04`,
**Then** il retourne `{ month, balanceCents, totals: { incomeCents, expenseCents, byCategory: { [code]: cents } }, deltasVsPriorMonths: [...top 2-3 categories with diff cents and pct] }`.

**Given** un mois sans transactions,
**When** appelé,
**Then** il retourne tous les champs à zéro et `deltasVsPriorMonths: []`.

**Given** un mois flagué `unreliable`,
**When** appelé,
**Then** un champ `reliability: 'unreliable'` est inclus.

**And** un test couvre les agrégats sur des transactions de fixture.

### Story 4.2: Service `narrative-generator` (top écarts + génération de phrases FR)

As a dev,
I want a deterministic algorithm that selects and phrases the most significant deltas,
So that the dashboard tells a clear story.

**Acceptance Criteria:**

**Given** `server/services/narrative-generator.ts`,
**When** j'expose `pickTopDeltas(currentTotals, priorMonthsTotals): Delta[]` qui retourne les 2-3 écarts les plus significatifs (par |cents| et |pct|),
**Then** la sélection est déterministe (aucun appel LLM) et exposable.

**Given** des Deltas,
**When** j'expose `formatDelta(d): string`,
**Then** la fonction retourne une phrase FR (ex: *"Tes courses ont augmenté de 280 € (+62%) ce mois, principal facteur du delta de solde."*).

**And** des tests couvrent : un mois avec hausse marquée d'une catégorie, un mois quasi identique au précédent (deltas négligeables → array vide), un mois avec apparition d'une charge ponctuelle.

### Story 4.3: Frontend — `MonthlyNarrative`, `BalanceSummary`, `MonthSelector`, page `/`

As a user,
I want the home page to show me why my account is in its current state,
So that I understand my situation in under 30 seconds.

**Acceptance Criteria:**

**Given** la home `app/pages/index.vue` reliée à `useCurrentMonthDashboard`,
**When** elle se charge,
**Then** elle affiche `BalanceSummary` (solde fin de mois, total revenus, total charges) et `MonthlyNarrative` (2-3 phrases d'explication).

**Given** des mois ingérés,
**When** je clique sur le `MonthSelector`,
**Then** je peux naviguer entre les mois et la vue se rafraîchit (URL met à jour le mois).

**Given** un mois flagué non fiable,
**When** il s'affiche,
**Then** un badge ou bandeau d'alerte est visible.

**Given** aucun PDF ingéré,
**When** la home se charge,
**Then** elle affiche un état vide invitant à importer un premier relevé (lien vers `/import`).

---

## Epic 5: Modèles financiers (charges, revenus, SAS, fiscalité)

### Story 5.1: Schéma `fixed_charges` + CRUD endpoints + UI

As a user,
I want to declare my fixed monthly/quarterly/annual/punctual charges,
So that the forecast can include them.

**Acceptance Criteria:**

**Given** la table `fixed_charges` (`id` PK, `label` text, `amount_cents` integer, `category_code` FK, `frequency` text 'monthly'|'quarterly'|'annual'|'punctual', `start_date` text YYYY-MM-DD, `end_date` text nullable, `created_at`),
**And** schéma Zod `shared/schemas/fixed-charge.schema.ts`,
**When** j'expose les endpoints `GET /api/fixed-charges`, `POST`, `PUT [id]`, `DELETE [id]`,
**Then** chacun valide la payload et retourne ou met à jour les enregistrements correctement.

**Given** la page `app/pages/charges.vue`,
**When** elle se charge,
**Then** elle affiche `FixedChargeList` et un `FixedChargeForm` pour ajouter une charge avec sélection de fréquence.

**And** un test couvre : POST → GET → PUT → DELETE round-trip.

### Story 5.2: Service `charge-suggester` + endpoint `GET /api/fixed-charges/suggestions` + UI

As a user,
I want suggestions for recurring charges based on my history,
So that I don't have to declare them all manually.

**Acceptance Criteria:**

**Given** `server/services/charge-suggester.ts`,
**When** j'expose `suggestRecurringCharges(db): Suggestion[]`,
**Then** la fonction détecte des libellés similaires (par regex/normalisation) avec montants proches sur ≥ 3 mois consécutifs et retourne `{ label, averageAmountCents, occurrences, suggestedFrequency }`.

**Given** l'endpoint `GET /api/fixed-charges/suggestions`,
**When** appelé,
**Then** il retourne les suggestions filtrées (exclusion de celles déjà transformées en `fixed_charges`).

**Given** la page charges,
**When** des suggestions existent,
**Then** un panneau `SuggestedChargesPanel` les affiche avec boutons *Accepter*, *Modifier*, *Rejeter* (rejet persisté pour ne pas re-suggérer).

**And** un test couvre la détection sur des transactions de fixture (3 mois de "NETFLIX 12.99").

### Story 5.3: Schéma `revenue_models` + endpoints + UI (ARE, loyer SAS, défraiements)

As a user,
I want to declare my income sources (ARE, SAS rent, expense reimbursements),
So that the forecast knows my recurring incomes.

**Acceptance Criteria:**

**Given** la table `revenue_models` (singleton mono-user — une seule ligne — colonnes `unemployment_benefit_monthly_cents`, `unemployment_benefit_end_date` text nullable, `sas_monthly_rent_cents`, `expense_reimbursements_monthly_cents`, `updated_at`),
**And** schéma Zod,
**When** j'expose `GET /api/revenues` et `PUT /api/revenues`,
**Then** GET retourne le singleton (créé au seed avec valeurs zéro si absent) et PUT met à jour atomiquement.

**Given** la page `app/pages/revenus.vue`,
**When** elle se charge,
**Then** elle affiche `ArePanel` (montant + date fin), `SasRentPanel` (montant), `ReimbursementsPanel` (montant moyen), tous éditables avec save explicite.

**Given** la note FR22 (défraiements non-imposables),
**When** je consulte le détail d'une catégorie de revenu,
**Then** un indicateur visuel marque les défraiements comme *non imposables* (informatif).

### Story 5.4: Schéma `sas_config` + endpoints + service `dividend-calculator` (capacité) + UI

As a user,
I want to declare my SAS fiscal data and see the dividend capacity,
So that I have the inputs ready for the forecast.

**Acceptance Criteria:**

**Given** la table `sas_config` (singleton — `fiscal_year_end_date` text MM-DD, `revenue_forecast_cents`, `expenses_forecast_cents`, `current_treasury_cents`, `is_rate_pct` integer (1500 = 15%, 2500 = 25%, stocké en pct × 100), `updated_at`),
**And** schéma Zod,
**When** j'expose `GET /api/sas-config` et `PUT /api/sas-config`,
**Then** ils fonctionnent comme pour revenue_models.

**Given** `server/services/dividend-calculator.ts`,
**When** j'expose `computeDividendCapacity(sasConfig): { profitBeforeTaxCents, taxCents, dividendableCapacityCents }`,
**Then** la fonction calcule profit = revenue - expenses, taxe = profit * is_rate, capacité = (profit - tax) + current_treasury — *à valider avec utilisateur* (note : cette formule simplifiée doit être confirmée vs reports possibles ; documenté dans le code comme V1 simplifié).

**Given** la page `app/pages/sas.vue`,
**When** elle se charge,
**Then** elle affiche `SasConfigForm` (tous les champs) + `FiscalYearForm` + `DividendCapacityCard` (live recalcul à chaque modification).

**And** des tests unitaires sur `dividend-calculator` couvrent : taux 15%, taux 25%, expenses > revenue (résultat négatif → capacité = treasury), edge cases.

### Story 5.5: Schéma `tax_settings` + endpoints + UI (flat tax, mode imposition)

As a user,
I want to configure how dividends are taxed,
So that the forecast can compute net amounts correctly.

**Acceptance Criteria:**

**Given** la table `tax_settings` (singleton — `dividend_tax_rate_pct` integer (3000 = 30%), `dividend_tax_mode` text 'flat_tax'|'progressive', `updated_at`),
**And** seed initial avec flat tax 30% (`dividend_tax_rate_pct: 3000`, `dividend_tax_mode: 'flat_tax'`),
**When** j'expose `GET /api/tax-settings` et `PUT`,
**Then** ils respectent le pattern singleton.

**Given** la page `app/pages/parametres.vue`,
**When** elle se charge,
**Then** elle affiche `TaxSettingsForm` avec slider/input pour le taux et un select pour le mode.

**Given** `shared/constants/fiscal-defaults.ts`,
**When** consulté,
**Then** il expose les défauts (`FLAT_TAX_DEFAULT_PCT: 3000`, `IS_RATE_REDUCED: 1500`, `IS_RATE_NORMAL: 2500`, `IS_REDUCED_THRESHOLD_CENTS: 4250000`).

### Story 5.6: Gestion des catégories — endpoints CRUD + UI `/categories`

As a user,
I want to create new categories, rename existing ones, and delete unused categories,
So that the taxonomy fits my actual spending without polluting the LLM with stale entries.

**Acceptance Criteria:**

**Given** la table `category_definitions` déjà créée en Story 2.1 (colonnes `id`, `code`, `label`, `is_variable`, `created_at`),
**And** schéma Zod `shared/schemas/category.schema.ts` (`code` text kebab-case ≤ 32 chars regex `^[a-z0-9-]+$`, `label` text 1-50 chars, `isVariable` boolean),
**When** j'expose `GET /api/categories` (déjà existant pour la lecture),
**Then** la réponse inclut pour chaque catégorie un compteur `referenceCount` (somme des références depuis `transactions.category_code`, `fixed_charges.category_code`, `monthly_overrides.category_code`) calculé via une requête agrégée unique.

**Given** l'endpoint `POST /api/categories`,
**When** je poste `{ label: 'Carburant', isVariable: true }`,
**Then** le service génère le `code` automatiquement par slugification du `label` (kebab-case ASCII), gère les collisions par suffixage `-2`, `-3`, etc., insère la ligne et retourne la catégorie complète. Si `label` viole le schéma → `domainError('validation_failed', ...)` 422.

**Given** l'endpoint `PATCH /api/categories/[code]`,
**When** je patch `{ label: 'Bouffe' }` sur la catégorie `restos`,
**Then** seul le `label` est mis à jour ; le `code` reste immuable (FK préservées). Tentative de modifier `code` ou `isVariable` → 422 `validation_failed` (champs en lecture seule via Zod `.strict()` sur le schéma de patch).

**Given** l'endpoint `DELETE /api/categories/[code]`,
**When** je supprime `restos` et qu'aucune référence n'existe,
**Then** la ligne est supprimée et l'endpoint retourne 204.

**Given** une catégorie `restos` référencée par ≥ 1 transaction, charge fixe ou override,
**When** je tente `DELETE /api/categories/restos`,
**Then** l'endpoint retourne `domainError('category_in_use', { transactionCount, fixedChargeCount, monthlyOverrideCount })` 409. Aucune mutation effectuée.

**Given** la catégorie spéciale `divers` (utilisée comme fallback par la réconciliation manuelle, cf. Epic 3),
**When** je tente `DELETE /api/categories/divers`,
**Then** l'endpoint retourne `domainError('category_protected', { code: 'divers' })` 409, indépendamment du `referenceCount`. Le rename reste autorisé.

**Given** la page `app/pages/categories.vue`,
**When** elle se charge,
**Then** elle affiche `CategoryList` (tableau avec libellé, type variable/fixe, compteur de références) + `CategoryForm` pour ajouter, avec édition inline du libellé et bouton supprimer désactivé+grisé si `referenceCount > 0` ou si `code === 'divers'`. Tooltip explique la raison du blocage.

**Given** la liste de catégories utilisée par `categorizeStatement()` dans `server/services/llm-categorizer.ts`,
**When** un PDF est ingéré après création d'une nouvelle catégorie,
**Then** la liste passée au LLM est lue depuis `db.select().from(category_definitions)` (et non depuis `DEFAULT_CATEGORIES` en dur). `DEFAULT_CATEGORIES` ne sert plus que pour le seed initial.

**And** un test couvre : POST → GET (avec referenceCount) → PATCH label → DELETE (succès si non référencée, échec 409 si référencée, échec 409 si `divers`).

**And** un test E2E couvre : création d'une catégorie depuis `/categories`, ré-import d'un PDF fixture, observation que la nouvelle catégorie est utilisable dans `CategoryEditor`.

---

## Epic 6: Dettes

### Story 6.1: Schémas `debts`, `debt_advances`, `debt_repayments` + CRUD endpoints

As a user,
I want a debt model to track money owed to a third party,
So that I can plan its repayment.

**Acceptance Criteria:**

**Given** les tables `debts` (`id` PK, `creditor_name` text, `repayment_mode` text 'free'|'monthly'|'lump_sum', `monthly_amount_cents` nullable, `lump_sum_target_event` text nullable 'next_dividend'|'fixed_date', `lump_sum_target_date` text nullable, `created_at`), `debt_advances` (`id`, `debt_id` FK, `amount_cents`, `occurred_on` text date, `note` text nullable, `created_at`), `debt_repayments` (`id`, `debt_id` FK, `transaction_id` FK nullable, `amount_cents`, `occurred_on`, `created_at`),
**And** schémas Zod correspondants,
**When** j'expose `GET /api/debts`, `POST`, `PUT [id]`, `DELETE [id]`,
**Then** chacun fonctionne et retourne le solde courant calculé (`initial_advances - sum(repayments)`) en tant que `currentBalanceCents`.

**And** un endpoint `POST /api/debts/[id]/advances` permet d'enregistrer une nouvelle avance.

**And** des tests couvrent : création, ajout d'avance, calcul de solde courant, suppression CASCADE.

### Story 6.2: UI — `DebtCard`, `DebtForm`, `DebtRepaymentMode`, `DebtAdvanceForm`, page `/dettes`

As a user,
I want a UI to manage my debts and record new advances,
So that the data stays up to date as my spouse keeps advancing money.

**Acceptance Criteria:**

**Given** la page `app/pages/dettes.vue`,
**When** elle se charge,
**Then** elle affiche la liste des dettes (`DebtCard` chacune) avec créancier, solde courant, mode de remboursement.

**Given** un `DebtForm` (création / édition),
**When** je crée une dette,
**Then** je peux choisir le mode (`DebtRepaymentMode`) parmi *Libre*, *Mensualité fixe* (montant), *Lump sum* (date ou "next_dividend").

**Given** un `DebtAdvanceForm` accessible depuis une `DebtCard`,
**When** je saisis une nouvelle avance,
**Then** elle est persistée et le solde courant se met à jour.

### Story 6.3: Marquage transaction comme remboursement (FR9) + UI `DebtRepaymentMarker` + décrément automatique

As a user,
I want to mark an outgoing transaction as a debt repayment,
So that the debt balance decreases without manual entry.

**Acceptance Criteria:**

**Given** l'endpoint `PATCH /api/transactions/[id]` (déjà existant en Epic 2),
**When** je PATCH `{ isDebtRepayment: true, debtId: 42 }`,
**Then** la transaction est mise à jour et un enregistrement `debt_repayments` est créé automatiquement (montant = |amountCents|),
**And** le solde courant de la dette est recalculé.

**Given** un PATCH qui *retire* le marquage,
**When** je PATCH `{ isDebtRepayment: false, debtId: null }`,
**Then** le `debt_repayments` correspondant est supprimé et le solde recalculé.

**Given** une `TransactionRow` dans la liste,
**When** elle est sortante,
**Then** un bouton/menu `DebtRepaymentMarker` permet de la rattacher à une dette (sélection parmi les dettes existantes).

**And** un test E2E couvre le flow : création dette → ingestion d'un PDF avec une sortie correspondant au remboursement → marquage dans la liste → solde décrémenté.

### Story 6.4: Service `debt-projection` + endpoint `GET /api/debts/[id]/impact` + UI `DebtImpactOnDividend`

As a user,
I want to see how much extra dividend is needed to settle a debt,
So that I can decide whether to settle it via the next AG.

**Acceptance Criteria:**

**Given** `server/services/debt-projection.ts`,
**When** j'expose `projectDebtIntoForecast(debt, horizon): { addedExpensesByMonth: Record<YYYY-MM, Cents>, totalImpactCents }`,
**Then** la fonction retourne : pour mode *libre* → tout à zéro ; pour mode *mensuel* → le montant mensuel sur les mois futurs jusqu'à ce que le solde soit éteint ; pour mode *lump sum* → un montant unique au mois ciblé.

**Given** l'endpoint `GET /api/debts/[id]/impact?horizon=12`,
**When** appelé,
**Then** il retourne `{ totalImpactCents, addedDividendNeededCents }` (différentiel sur le dividende cible — calcul simplifié = `totalImpactCents` divisé par `(1 - dividendTaxRate)`).

**Given** une `DebtCard`,
**When** elle s'affiche,
**Then** un composant `DebtImpactOnDividend` montre l'impact pour les horizons 6/12/24 mois.

**And** des tests couvrent les 3 modes (libre, mensuel, lump sum à date, lump sum next_dividend), incluant cas dette à zéro.

---

### Stories de remédiation *(ajoutées le 2026-09-04 — revue de l'epic 6)*

> L'epic 6 a été implémenté le 2026-07-08 et reviewé pour la première fois le 2026-09-04.
> Verdict **CHANGEMENTS REQUIS** : l'implémentation est propre et conforme aux invariants
> monétaires du projet, mais **la modélisation ne supporte pas FR66-FR68** (décision D16) et
> **deux biais faussent le chiffre du dividende**. Ces 4 stories closent l'epic.
>
> Arbitrages tranchés le 2026-09-04 : suppression d'une dette → **SET NULL avec avertissement
> chiffré** (AC#8 de 6.1, resté ouvert) ; couplage `debt_id`/`is_debt_repayment` → **contrainte
> `CHECK`** plutôt que suppression du flag dérivé (1 fichier contre 28).

### Story 6.5: Ledger d'événements signés (D16) — prérequis de l'epic 10

As a user,
I want a debt to carry signed events so a balance can go either way,
So that a spouse current account (créance ou dette) is expressible.

**Acceptance Criteria:**

**Given** la table `debt_events` (`id`, `debt_id` FK, `event_date`, `amount_cents` **signé**, `kind`, `source_transaction_id` nullable) remplaçant `debt_advances`,
**And** `debts.initial_balance_cents` rendu **signé**,
**When** un solde est calculé,
**Then** il peut être négatif (créance) sans traitement particulier, et `debt-balance.ts` est typé en `Cents`.

**And** `GET` et `DELETE` des événements existent (une saisie erronée est corrigeable — trou de FR31).

**And** `PATCH /api/transactions/[id]` accepte une transaction **entrante** comme événement (levée de la garde `amountCents >= 0`), condition de FR66/FR67.

### Story 6.6: Corriger les deux biais sur le dividende

As a user,
I want debt projections not to double-count,
So that the dividend to vote is right.

**Acceptance Criteria:**

**Given** une dette `monthly` dont la mensualité du mois courant est déjà payée et marquée,
**When** l'impact est projeté,
**Then** ce mois n'est pas recompté (`impact.get.ts` et `forecast-engine.ts` partagent l'ancrage corrigé).

**Given** une transaction marquée remboursement mais laissée dans une catégorie variable,
**When** la projection variable est construite,
**Then** elle est exclue de `buildVariableHistory` — sinon elle est comptée par la moyenne mobile **et** reprojetée par `projectDebt`.

**And** les snapshots forecast (G5) sont régénérés et les écarts justifiés.

### Story 6.7: Sûreté des données de dette

As a user,
I want to be warned before losing repayment markings,
So that a deletion is never a silent data loss.

**Acceptance Criteria:**

**Given** une contrainte `CHECK((debt_id IS NULL) = (is_debt_repayment = 0))` + back-fill des lignes historiques,
**When** une transaction est écrite,
**Then** l'état incohérent `debt_id` seul (produit par le PATCH antérieur à 6.3) devient impossible.

**Given** la suppression d'une dette rattachée à N transactions,
**When** la confirmation s'affiche,
**Then** elle annonce le nombre exact de transactions qui perdront leur marquage (**SET NULL**, arbitrage du 2026-09-04), et le déliage + la suppression sont dans une même transaction SQL.

**And** `transactions.debt_id` reçoit une FK `ON DELETE SET NULL`, et `deleteDebt` invalide les clés `transactions-<mois>`.

### Story 6.8: Couverture NFR18 et honnêteté des specs

As a dev,
I want the debt balance covered and the specs to match the code,
So that a regression is caught and the docs stop lying.

**Acceptance Criteria:**

**Given** `server/utils/debt-balance.ts` — fonction de calcul financier sans fichier de test dédié,
**When** `debt-balance.test.ts` est écrit,
**Then** il couvre : plusieurs dettes (le chemin `balanceSumsByDebt` de `GET /api/debts`, jamais exercé au-delà d'une dette), dette sans événement, transaction `debt_id` non marquée ignorée, solde négatif.

**And** le mode `lump_sum` est testé au niveau endpoint (seul mode dépendant du mois courant serveur).

**And** l'AC#4 de la story 6.4 est amendée (une échéance `lump_sum` **passée** est imputée au mois 0, ce que la spec contredit), et la mention des cas limites « mois 28/29/30/31 » est retirée comme **non applicable** — `projectDebt` raisonne en `YYYY-MM`.

**And** `DebtImpactOnDividend.vue` est renommé `DebtProjectedExpense.vue` (il n'affiche pas de dividende), et `isManual` n'est plus posé que si `categoryCode` est présent dans le patch.

---

## Epic 7: Forecast inverse

### Story 7.1: Service `variable-projection` (moyenne mobile par catégorie) + tests

As a dev,
I want a function that projects variable expenses into the future,
So that the forecast can rely on it.

**Acceptance Criteria:**

**Given** `server/services/variable-projection.ts`,
**When** j'expose `projectVariableExpenses(transactions, params: { lookbackMonths: number, futureMonths: string[] }): Record<YYYY-MM, Record<categoryCode, Cents>>`,
**Then** la fonction calcule par catégorie variable (depuis `category_definitions.is_variable`) la moyenne mobile sur les `lookbackMonths` derniers mois ingérés, et l'applique uniformément à chaque mois futur.

**Given** un mois flagué `unreliable`,
**When** il fait partie du lookback,
**Then** il est exclu du calcul de moyenne (ne corrompt pas l'historique).

**Given** une catégorie avec moins de `lookbackMonths` mois d'historique,
**When** elle est projetée,
**Then** la projection est calculée sur les mois disponibles et un flag `lowConfidence: true` est retourné pour cette catégorie.

**And** des tests couvrent : 3 mois d'historique stable, 1 mois seulement (lowConfidence), aucun historique (zéro), exclusion d'un mois unreliable.

### Story 7.2: Schéma `monthly_overrides` + endpoints `GET|POST /api/overrides`, `DELETE [id]`

As a user,
I want to override a category projection for a specific future month,
So that I can model planned changes.

**Acceptance Criteria:**

**Given** la table `monthly_overrides` (`id` PK, `month` text YYYY-MM, `category_code` FK, `override_amount_cents` integer, `created_at`, unique constraint on `(month, category_code)`),
**When** j'expose `GET /api/overrides`, `POST` (création/upsert), `DELETE [id]`,
**Then** chacun fonctionne et le POST en upsert remplace silencieusement un override existant pour la même paire.

### Story 7.3: Service `forecast-engine` v1 (trajectoire mensuelle simple) + snapshots

As a dev,
I want a deterministic forecast computation,
So that the user gets reliable trajectory figures.

**Acceptance Criteria:**

**Given** `server/services/forecast-engine.ts`,
**When** j'expose `computeForecast({ horizon, models }): ForecastResult` où `models` agrège : `currentBalance`, `fixedCharges`, `revenues`, `variableProjections`, `overrides`, `debtProjections`, `transactions historiques`,
**Then** la fonction retourne `{ months: [{ month, openingBalanceCents, closingBalanceCents, sources: { fixedDeclaredCents, variableProjectedCents, punctualPlannedCents, revenueCents, debtRepaymentCents }, isReliable: boolean }] }`.

**Given** un override mois×catégorie,
**When** il existe pour le mois `m` et la catégorie `c`,
**Then** il remplace la valeur projetée pour cette paire dans `m`.

**Given** des fixtures connues (`tests/fixtures/snapshots/forecast-baseline.json`),
**When** j'exécute le test,
**Then** le résultat correspond exactement au snapshot (déterminisme garanti).

**And** des tests couvrent les cas limites : aucun PDF ingéré, charges annuelles à cheval (mai 2026 → mai 2027), ARE qui se termine en milieu de mois, override d'une catégorie, dette en lump sum.

### Story 7.4: Service `dividend-calculator` (NET/BRUT, comparaison capacité, marge) + tests

As a dev,
I want to compute the dividend amount required to keep the forecast positive,
So that the killer feature can be exposed.

**Acceptance Criteria:**

**Given** `server/services/dividend-calculator.ts` (déjà existant en Story 5.4 pour la capacité),
**When** j'ajoute `computeRequiredDividend({ forecastTrajectory, horizon, taxSettings, sasConfig }): { dividendNetCents, dividendGrossCents, dividendableCapacityCents, marginCents, levers: Lever[] }`,
**Then** la fonction calcule le dividende NET nécessaire pour que le solde projeté reste ≥ 0 sur tout l'horizon (intégré au mois prévu de versement = `sasConfig.fiscal_year_end_date`),
**And** convertit NET → BRUT via `dividendNet / (1 - taxRate)`,
**And** compare au `dividendableCapacityCents` et expose la marge,
**And** si BRUT > capacité, retourne une liste `levers` avec leviers identifiés (réduire dépense X, augmenter CA, décaler objectif Y) — détection simple basée sur les charges et objectifs ponctuels de l'horizon.

**And** des tests couvrent : marge positive, marge négative avec leviers, dividende nul nécessaire (déjà excédentaire), horizon ne contenant pas de date de versement (alerte).

### Story 7.5: Endpoint `GET /api/forecast?horizon=6|12|24` + alertes intégrées

As a user,
I want a single API call that returns my full forecast view,
So that the UI can render in one shot.

**Acceptance Criteria:**

**Given** un endpoint `server/api/forecast.get.ts`,
**When** appelé avec `?horizon=12`,
**Then** il agrège tous les modèles depuis la DB, appelle `forecast-engine` puis `dividend-calculator`, et retourne `{ horizon, trajectory, dividend: { netCents, grossCents, capacityCents, marginCents, levers }, alerts: { areConflict: boolean, areConflictDetails?, unreliableMonths: string[], capacityExceeded: boolean }, recomputedAt }`.

**Given** une date de versement de dividende qui tombe pendant la période ARE active,
**When** détecté,
**Then** `alerts.areConflict: true` avec détails (mois concerné, montant ARE perdu).

**And** la perf est < 1 seconde sur volume mono-user (NFR2) — vérifiée par un test bench simple.

### Story 7.6: Frontend — page `/forecast`, `ForecastChart`, `DividendTargetCard`, `HorizonSelector`, `ForecastSourceLegend`

As a user,
I want to see my forecast trajectory and dividend target,
So that I know how much to vote at the next AG.

**Acceptance Criteria:**

**Given** la page `app/pages/forecast.vue` reliée à `useForecast`,
**When** elle se charge,
**Then** elle affiche `HorizonSelector` (6/12/24), un `ForecastChart` (trajectoire avec les 4 sources empilées visuellement distinctes), et `DividendTargetCard` (NET, BRUT, capacité, marge en couleur signalétique).

**Given** la `ForecastSourceLegend`,
**When** affichée,
**Then** elle distingue : *Charges fixes déclarées*, *Charges variables extrapolées*, *Charges ponctuelles planifiées*, *Revenus* (FR43).

**Given** le horizon change,
**When** je clique 6/12/24,
**Then** `useFetch` re-fetch avec la nouvelle key et la vue se met à jour.

### Story 7.7: Frontend — `AreCompatibilityWarning`, `LeversPanel`, `VariableOverrideDialog`

As a user,
I want to see warnings, levers and adjust projections,
So that I can react to forecast issues.

**Acceptance Criteria:**

**Given** `alerts.areConflict: true` dans la réponse forecast,
**When** la page se charge,
**Then** un `AreCompatibilityWarning` s'affiche en haut avec détails (FR52).

**Given** `dividend.marginCents < 0`,
**When** la page se charge,
**Then** un `LeversPanel` affiche les leviers retournés par l'API (réduire X, augmenter CA, décaler Y) avec actions cliquables (lien vers la page concernée).

**Given** un `VariableOverrideDialog` ouvert depuis un mois × catégorie du chart,
**When** je saisis un montant,
**Then** un POST `/api/overrides` est émis et le forecast se rafraîchit (refetch automatique).

**And** un test E2E couvre : ingestion + saisie modèles → consultation forecast → modification d'un override → recalcul visible.

### Story 7.8: Recalcul réactif global — invalidation des `useFetch` forecast/dashboard sur toute mutation amont

As a user,
I want the forecast and dashboard to update automatically when I change any input,
So that I never see stale figures.

**Acceptance Criteria:**

**Given** un composable utilitaire `app/composables/useInvalidate.ts`,
**When** une mutation a lieu sur transactions, fixed_charges, revenues, sas_config, tax_settings, debts, debt_advances, debt_repayments, monthly_overrides,
**Then** le composable invalide les `useFetch` clés `forecast-*` et `dashboard-*`, déclenchant leur refresh.

**Given** que cette invalidation est appelée depuis tous les composables de mutation (`useTransactions`, `useFixedCharges`, `useDebts`, etc.),
**When** je modifie quoi que ce soit,
**Then** la home page et la page `/forecast` (si ouvertes ou prochainement consultées) reflètent les nouvelles valeurs.

**And** un test E2E couvre : ouvrir la home → modifier ARE depuis `/revenus` → revenir à la home et voir le `BalanceSummary` mis à jour.

---

## Epic 8: Fondation multi-profils / multi-comptes

*Socle Phase 1.x. Introduit `profiles`/`accounts`, re-scope tout le schéma et le code V1 sur le contexte actif (profil + compte). Prérequis : epics 5/6/7 `done`. Décisions D11-D14 + open questions tranchées par l'architecte avant dev.*

### Story 8.1: Schéma `profiles` + `accounts` + migration de scoping

As a dev,
I want profile/account tables and every existing table scoped to a profile/account,
So that data can be partitioned per person and per bank account.

**Acceptance Criteria:**

**Given** `server/db/schema.ts`,
**When** j'ajoute `profiles` (`id` PK, `name` text, `kind` text 'owner'|'managed' CHECK, `created_at`) et `accounts` (`id` PK, `profile_id` FK → profiles.id cascade, `name` text, `bank` text, `created_at`),
**Then** `yarn db:push` synchronise sans erreur.

**Given** les tables de scope créées,
**When** j'ajoute `account_id` FK sur `bank_statements`, `fixed_charges`, `monthly_overrides`, et je transforme `revenue_models` en 1-ligne-par-compte (FK `account_id`, fin du singleton),
**And** j'ajoute `profile_id` FK sur `sas_config`, `tax_settings`, `debts`,
**Then** le scoping est cohérent (transactions héritent via `statement_hash → account_id`, pas de dénormalisation).

**Given** la stratégie de migration retenue (wipe & re-seed, cf. NFR11 — à confirmer archi),
**When** le bootstrap s'exécute,
**Then** un profil `owner` « Marceau » + un compte Boursorama par défaut sont seedés, et les singletons existants (revenue/sas/tax) sont rattachés à ce scope.

**And** schémas Zod `shared/schemas/profile.schema.ts` et `account.schema.ts` avec `z.infer<>`.

### Story 8.2: Endpoints CRUD `/api/profiles` et `/api/accounts`

As a user,
I want to manage my profiles and accounts,
So that I can add my spouse, my parents and their bank accounts.

**Acceptance Criteria:**

**Given** `server/api/profiles/` et `server/api/accounts/`,
**When** j'expose `GET|POST|PUT|DELETE` sur chacun (validation Zod),
**Then** un profil peut être créé avec son `kind`, un compte avec sa `bank` et son `profile_id`.

**Given** la suppression d'un profil/compte,
**When** elle est demandée,
**Then** la cascade supprime les comptes/relevés/transactions liés (ou refuse avec message si contexte actif) — comportement à acter.

**And** un test couvre le round-trip CRUD + cascade.

### Story 8.3: Re-scoping des endpoints existants sur le contexte actif

As a dev,
I want every existing endpoint to filter by the active account/profile,
So that each context only sees its own data.

**Acceptance Criteria:**

**Given** les endpoints statements, transactions, dashboard, fixed-charges, revenues, overrides, forecast,
**When** ils sont appelés,
**Then** ils acceptent/filtrent par `accountId` (query param ou header de contexte).

**Given** les endpoints sas-config, tax-settings, debts,
**When** ils sont appelés,
**Then** ils filtrent par `profileId`.

**And** les tests d'endpoints existants sont adaptés au scoping (aucune fuite inter-comptes).

### Story 8.4: Re-scoping des services de calcul + régénération snapshots

As a dev,
I want forecast/projection/dividend services to take the scope as input,
So that computations are correct per account.

**Acceptance Criteria:**

**Given** `forecast-engine.ts`, `variable-projection.ts`, `dividend-calculator.ts`,
**When** ils reçoivent le scope (accountId/profileId) et les modèles filtrés,
**Then** le calcul est isolé au contexte.

**Given** les snapshots forecast (G5),
**When** je re-génère `tests/fixtures/snapshots/`,
**Then** ils intègrent le scope et restent déterministes.

**And** couverture 100% des fonctions de calcul (NFR18) préservée après re-scoping.

### Story 8.5: Store `useContext` + sélecteur de contexte global

As a user,
I want to switch the active profile/account from anywhere,
So that I control which data I'm looking at.

**Acceptance Criteria:**

**Given** un store Pinia `app/stores/context.ts` (profil actif + compte actif, state UI pur),
**When** je change de contexte,
**Then** le choix est persisté (localStorage) et rétabli au rechargement.

**Given** un sélecteur dans `AppHeader`/`AppNav`,
**When** il s'affiche,
**Then** il liste les profils et leurs comptes et permet la bascule.

### Story 8.6: Propagation du contexte dans les composables + invalidation par scope

As a user,
I want all views to react to the active context,
So that switching context refreshes everything consistently.

**Acceptance Criteria:**

**Given** les composables (`useTransactions`, `useForecast`, `useDebts`, `useFixedCharges`, …),
**When** le contexte actif change,
**Then** ils propagent `accountId`/`profileId` dans les `useFetch` (keys incluant le scope) et refetch.

**Given** `useInvalidate`,
**When** une mutation a lieu,
**Then** l'invalidation cible les clés du scope courant (`forecast-{accountId}-*`, `dashboard-{accountId}-*`).

---

## Epic 9: Comptes en gestion (mode suivi)

*Un profil `managed` (parents, conjoint) : ingestion/catégo/réconciliation/dashboard, sans forecast ni dividende.*

### Story 9.1: Garde-fou serveur `profile_not_owner`

As a dev,
I want the server to block forecast/SAS/tax endpoints for managed profiles,
So that the "suivi seul" mode is enforced beyond the UI.

**Acceptance Criteria:**

**Given** les endpoints forecast, sas-config, tax-settings, dividende,
**When** ils sont appelés avec un `profileId` de `kind = 'managed'`,
**Then** ils retournent `domainError('profile_not_owner', { profileId })` (403).

**Given** un profil `owner`,
**When** les mêmes endpoints sont appelés,
**Then** ils fonctionnent normalement.

**And** un test couvre les deux cas.

### Story 9.2: UI adaptative selon `kind`

As a user,
I want the UI to hide forecast/SAS/tax features for a managed profile,
So that the interface matches what the profile can do.

**Acceptance Criteria:**

**Given** un profil actif `managed`,
**When** je navigue,
**Then** les entrées `forecast`, `sas`, `parametres` (fiscalité) sont masquées/désactivées et un badge « Mode suivi » est visible.

**Given** un profil actif `owner`,
**When** je navigue,
**Then** toutes les fonctions sont disponibles.

### Story 9.3: Parcours création profil `managed` + E2E

As a user,
I want to create a managed profile with its accounts and ingest their statements,
So that I can track my parents' accounts.

**Acceptance Criteria:**

**Given** la création d'un profil `managed` + un compte,
**When** j'ingère un PDF sur ce compte,
**Then** transactions/dashboard fonctionnent, forecast absent.

**And** un test E2E couvre : créer profil parent → ingestion → dashboard OK → forecast inaccessible.

---

## Epic 10: Dépenses communes (split conjoint)

*Une transaction « commune » alimente le compte-courant de dette entre l'utilisateur et son conjoint. Réutilise le modèle Dettes (epic 6). Mécanique exacte du compte-courant à acter par l'architecte (open question).*

### Story 10.1: Modèle de flag « commune » + lien conjoint

As a dev,
I want a shared-expense flag on transactions linked to the spouse ledger,
So that common expenses can feed the couple's balance.

**Acceptance Criteria:**

**Given** `server/db/schema.ts`,
**When** j'ajoute `is_shared` (boolean default false) + `shared_ratio` (integer pct×100, default 5000 = 50%) sur `transactions`, et le rattachement à l'entité conjoint (via `debts`/`debt_advances`),
**Then** `yarn db:push` synchronise et le schéma Zod transaction est étendu.

### Story 10.2: Service `shared-expense` (calcul du mouvement)

As a dev,
I want a deterministic function computing the ledger movement of a shared expense,
So that the couple's balance stays exact.

**Acceptance Criteria:**

**Given** `server/services/shared-expense.ts`,
**When** j'expose une fonction `(amountCents, ratio) → movementCents` (part de l'autre = `amount × (1 − ratio)`),
**Then** le sens du mouvement est cohérent avec la dette pré-existante « envers conjoint ».

**And** des tests couvrent (NFR18) : 50/50, ratio custom, retrait du flag (annulation), montant nul.

### Story 10.3: `PATCH /api/transactions/[id]` étendu + recalcul solde

As a user,
I want marking a transaction as shared to update the couple's balance,
So that the debt reflects reality automatically.

**Acceptance Criteria:**

**Given** le PATCH transaction étendu (`isShared`, `sharedRatio`),
**When** je marque une transaction commune,
**Then** un mouvement est écrit sur le solde conjoint (idempotent : le retrait annule proprement).

**And** un test couvre marquage puis démarquage (solde revenu à l'identique).

### Story 10.4: UI marqueur « Commune » + solde net conjoint

As a user,
I want to flag shared expenses and see the couple's net balance,
So that I know who owes whom.

**Acceptance Criteria:**

**Given** `TransactionRow`,
**When** elle s'affiche,
**Then** un marqueur « Commune » + saisie de part sont disponibles.

**Given** la fiche dette du conjoint,
**When** elle s'affiche,
**Then** le solde net (créance/dette) intègre les dépenses communes.

### Story 10.5: Test E2E split conjoint

**Given** un conjoint et une dépense commune payée par l'utilisateur,
**When** je la marque commune,
**Then** le solde conjoint est mis à jour du bon montant, et le démarquage le rétablit.

---

## Epic 11: Extraction PDF paramétrée par banque

*`pdf-extractor` route vers une stratégie selon `account.bank`. Boursorama = première stratégie. Interface stable conservée (NFR16).*

### Story 11.1: Refactor `pdf-extractor` en dispatcher par banque

As a dev,
I want a bank-dispatched extraction service,
So that multiple statement formats are supported without touching the pipeline.

**Acceptance Criteria:**

**Given** `server/services/pdf-extractor.ts`,
**When** j'expose `extractStatement(buffer, bank): Promise<RawStatement>` qui route vers une stratégie (`boursorama`, …),
**Then** l'extraction Boursorama actuelle est isolée en stratégie `boursorama` et l'interface `RawStatement` est inchangée.

**And** aucun import `unpdf` n'existe hors du module (grep).

### Story 11.2: Deuxième stratégie banque + fixtures

As a dev,
I want a second bank extraction strategy,
So that another account's statements can be ingested.

**Acceptance Criteria:**

**Given** la banque des parents/conjoint (à préciser),
**When** j'implémente sa stratégie (parsing texte/période/soldes, G3 par format),
**Then** des fixtures PDF réelles + tests couvrent l'extraction (texte non vide, période et soldes plausibles).

### Story 11.3: Pipeline d'ingestion branché sur `account.bank`

As a user,
I want ingestion to use the right extractor for my account's bank,
So that any supported account can be imported.

**Acceptance Criteria:**

**Given** `POST /api/statements`,
**When** un PDF est déposé sur un compte,
**Then** le pipeline lit `account.bank` et le passe à `extractStatement`.

**Given** une banque sans stratégie,
**When** l'ingestion est tentée,
**Then** l'endpoint retourne `domainError('unsupported_bank', { bank })`.

### Story 11.4: UI paramétrage compte — sélection de la banque

As a user,
I want to choose the bank when configuring an account,
So that its statements are parsed correctly.

**Acceptance Criteria:**

**Given** le formulaire de compte (création/édition),
**When** il s'affiche,
**Then** un select liste les banques supportées (stratégies disponibles) et la valeur est persistée sur `accounts.bank`.

