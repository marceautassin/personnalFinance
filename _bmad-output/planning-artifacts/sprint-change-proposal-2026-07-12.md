---
type: sprint-change-proposal
date: 2026-07-12
author: John (PM) + Marceau
trigger: Ajout de 4 capacités structurelles hors scope V1 (multi-profils/comptes)
scope_classification: Major
status: approved
approved_by: Marceau
approved_on: 2026-07-12
---

# Sprint Change Proposal — Multi-profils, multi-comptes, dépenses communes & extraction multi-banques

## Section 1 — Issue Summary

**Déclencheur.** En fin de MVP (epics 1-4 `done`, 5/6/7 en `review`), Marceau exprime 4 nouvelles capacités non prévues au PRD V1 :

1. **Multi-profils / multi-comptes** — hiérarchie `Profil (personne) → N Comptes (bancaires) → Transactions`. Marceau, sa femme, ses parents sont des profils ; chacun détient un ou plusieurs comptes.
2. **Comptes en gestion (mode suivi)** — les comptes des parents (et de la femme) sont ingérés/catégorisés/réconciliés mais **sans** forecast inverse ni dividende SAS (ça n'a de sens que pour Marceau).
3. **Split dépenses communes (Tricount conjoint)** — une transaction flaggée « commune » payée par l'un alimente le compte-courant de dette entre Marceau et sa femme (s'appuie sur l'epic 6 Dettes existant).
4. **Extraction PDF paramétrée par banque** — chaque compte porte une banque ; `pdf-extractor` devient multi-format (stratégie par banque) au lieu du Boursorama-only actuel.

**Catégorie du changement.** Nouvelle exigence stakeholder (pas une limite technique ni un malentendu). Découverte tardive, en toute fin de MVP.

**Preuve d'impact structurel.** Le schéma actuel (`server/db/schema.ts`) est fondamentalement **mono-contexte** :
- `revenue_models`, `sas_config`, `tax_settings` sont des **singletons `id = 1`**.
- `bank_statements` a `hash_sha256` en PK, sans `account_id`.
- `transactions`, `fixed_charges`, `debts`, `monthly_overrides` n'ont **aucun** scoping profil/compte.
- Tous les endpoints, `forecast-engine.ts`, `reconciler.ts` et les composables supposent un contexte unique implicite.

Introduire multi-profils/comptes lève l'invariant **« mono-utilisateur »** posé dans le PRD (Executive Summary, NFR7, Project Classification) et l'invariant architecture **« Multi-tenant : Non »**.

## Section 2 — Impact Analysis

### Impact Epic

| Epic | État | Impact |
|---|---|---|
| 1-4 | `done` | ✅ Aucune régression si livrés tels quels. Rétro-touchés seulement si on scope maintenant. |
| 5-6-7 | `review` | ✅ Livrables en l'état (mono-compte). ⚠️ Fort rétro-impact si on introduit le scoping avant de les clôturer (refonte schéma singleton + endpoints + forecast/reconciler + UI déjà écrits). |
| **8-11 (nouveaux)** | à créer | 4 nouveaux epics — voir Section 4. |

### Conflits artefacts

**PRD** (`planning-artifacts/prd.md`) :
- Executive Summary : « destinée à un utilisateur unique » → à amender.
- Project Classification : « Mono-utilisateur (perso V1) », « Source de données: PDFs Boursorama » → à amender.
- NFR7 : « Aucune authentification… mono-user » → à nuancer (multi-profils ≠ multi-utilisateurs authentifiés ; reste local sans auth).
- Scope : *multi-banque* et *multi-profil* étaient explicitement « Hors MVP » / Phase 2-3 → promus en V1.x.

**Architecture** (`planning-artifacts/architecture.md`) :
- Table des décisions : « Multi-tenant : Non » → « Oui, local (profils/comptes, sans auth) ».
- Pattern singleton des modèles (revenue/sas/tax) → passe à N-par-scope.
- D9 (forecast fonction pure) : `computeForecast` prend désormais un `accountId`/scope en entrée.
- NFR16 (parser isolé, interface stable) : **déjà prévu pour ça** 🎯 — `pdf-extractor` se généralise en dispatcher par banque sans refactor du reste.
- Migration schéma (D4, `drizzle-kit push`).

**Atout décisif — NFR11.** La base est **jetable et reconstructible depuis les PDFs sources**. La migration multi-comptes n'a **aucune donnée précieuse à préserver** : on peut refondre le schéma librement (wipe + re-seed + ré-ingestion des PDFs par compte). Le risque de migration est donc **faible**.

**UI/UX :**
- Nouveau **sélecteur de contexte** global (profil actif + compte actif) dans `AppHeader`/`AppNav`.
- Pages `forecast`, `sas`, `parametres` (fiscalité), dividende : **masquées/désactivées** pour un profil en mode « suivi ».
- Nouveau paramétrage compte (nom, banque) et gestion des profils.
- Flag « commune » + part sur les lignes de transaction.

**Tests :**
- Snapshots forecast (G5) : à re-générer par compte (le format inclut désormais le scope).
- Nouveaux tests calcul : split commune (100% NFR18), extraction par banque (fixtures par format).

## Section 3 — Recommended Approach

**Option retenue : Hybrid (finir V1 mono-user, puis Phase 2 en 4 epics).**

Écartées :
- *Rollback* — inutile : le MVP mono-user marche et livre de la valeur immédiate (le forecast/dividende dont Marceau a besoin maintenant).
- *Direct Adjustment seul* — insuffisant : ça touche le cœur du modèle de données, pas juste quelques stories.

**Plan :**
1. **Clôturer V1 mono-user** — passer epics 5/6/7 de `review` à `done`. Marceau obtient son forecast + dividende tout de suite.
2. **Phase 2 = 4 nouveaux epics** (8→11), la fondation (epic 8) étant le **socle bloquant** des 3 autres.
3. **Amendement PRD** documentant la levée de l'invariant mono-user et la promotion multi-banque en V1.x.

**Justification :** valeur immédiate préservée, aucun refactor à chaud du code en review, risque de migration neutralisé par NFR11, et séquencement propre (socle → dérivés).

**Classification : Major** → handoff PM (amendement PRD) + Architect (Winston, refonte schéma & scoping) avant dev.

## Section 4 — Detailed Change Proposals

### 4.1 — Amendement PRD (before / after)

**A. Executive Summary**

> OLD : « …web application local-first de pilotage financier personnel destinée à un utilisateur unique en transition de vie… »
>
> NEW : « …web application local-first de pilotage financier personnel **multi-profils**. Le profil principal (Marceau) pilote son forecast inverse et son dividende SAS ; des **profils secondaires en mode suivi** (conjoint, parents) permettent d'ingérer et suivre d'autres comptes bancaires sans forecast. Chaque profil détient un ou plusieurs **comptes**, potentiellement de banques différentes. »

**B. Project Classification — notes**

> OLD : « Mono-utilisateur (perso V1, scope pro envisagé V2) » · « Source de données: PDFs Boursorama (parser isolé pour extensibilité multi-banques) »
>
> NEW : « **Multi-profils local, sans authentification** (environnement local de confiance, mono-machine). Un profil `owner` (forecast+dividende) + N profils `managed` (suivi seul). » · « Source de données: PDFs **multi-banques** (parser dispatché par banque ; Boursorama = première stratégie). »

**C. NFR7 (nuance, pas suppression)**

> NEW : « Aucune **authentification** utilisateur en V1.x. Le multi-profils est un **partitionnement de données local** (pas de comptes protégés) : l'app suppose toujours un environnement local de confiance mono-machine. L'auth reste un blocker uniquement pour un futur déploiement cloud. »

**D. Scope — déplacements**

> Retirer de « Hors MVP » et de Phase 2/3 : *multi-utilisateur (profils)*, *multi-banque (parser pluggable)*. Les inscrire en **Phase 1.x (post-MVP immédiat)**.
> Restent Vision : agrégation bancaire directe, cloud **avec auth**, module pro complet.

**E. Nouveaux FRs (FR58 → FR71)** — voir tableau en annexe 4.5.

### 4.2 — Amendement Architecture (résumé des décisions à acter par Winston)

- **D11 — Modèle multi-profils/comptes.** Nouvelles tables `profiles (id, name, kind: owner|managed, created_at)` et `accounts (id, profile_id FK, name, bank, created_at)`.
- **D12 — Scoping.** `bank_statements.account_id` (FK). `fixed_charges`, `monthly_overrides`, `revenue_models` → **par compte** (`account_id`, fin du singleton). `sas_config`, `tax_settings`, `debts` → **par profil** (`profile_id`). `transactions` héritent le scope via `statement_hash → account_id` (pas de dénormalisation, invariant « aucun état dérivé »).
- **D13 — Forecast/reconciler scopés.** `computeForecast({ accountId, ... })`, `reconcile` inchangé (déjà par statement). Forecast/dividende **actifs seulement si `profile.kind === 'owner'`**.
- **D14 — Extraction dispatchée.** `extractStatement(buffer, bank)` route vers une stratégie (`boursorama`, …). Chaque stratégie encapsule le parsing texte/période/soldes (G3 par format).
- **⚠️ Points à trancher avec l'architecte** (open questions) :
  - Grain de scoping des `fixed_charges`/`revenue_models` : par **compte** (retenu) vs par **profil** — à confirmer si un profil owner à plusieurs comptes veut un forecast consolidé ou par compte.
  - Mécanique exacte du **compte-courant conjoint** (epic 10) : réutiliser `debts` + `debt_advances` avec un solde net signé, vs table dédiée `shared_ledger`. Cf. dette pré-existante « envers conjoint » du PRD.
  - Migration : **wipe & re-seed** (profitant de NFR11) vs migration additive avec back-fill d'un profil/compte « Marceau » par défaut.

### 4.3 — Nouveaux epics (découpage en stories)

#### Epic 8 — Fondation multi-profils / multi-comptes *(socle bloquant)*
*Le modèle de données, les endpoints et l'UI supportent plusieurs profils et comptes ; tout le code V1 est re-scopé sur le compte actif.*

- **8.1** — Schéma `profiles` + `accounts` + migration de scoping (`account_id`/`profile_id` sur bank_statements, fixed_charges, monthly_overrides, revenue_models, sas_config, tax_settings, debts). Seed d'un profil `owner` « Marceau » + un compte Boursorama par défaut. *(décision wipe vs back-fill actée en 4.2)*
- **8.2** — Endpoints CRUD `GET|POST|PUT|DELETE /api/profiles` + `/api/accounts` (avec `bank`). Schémas Zod `profile.schema.ts`, `account.schema.ts`.
- **8.3** — Re-scoping des endpoints existants : tous les `GET/POST/...` de statements, transactions, dashboard, charges, revenues, overrides, forecast acceptent/filtrent par `accountId` (query ou contexte). sas-config, tax-settings, debts par `profileId`.
- **8.4** — Re-scoping services calcul : `forecast-engine`, `variable-projection`, `dividend-calculator` prennent le scope en entrée. Snapshots (G5) régénérés. Tests 100% (NFR18).
- **8.5** — Store Pinia `useContext` (profil actif + compte actif) + sélecteur global dans `AppHeader`/`AppNav`. Persistance du dernier contexte (localStorage, state UI pur).
- **8.6** — Adaptation composables (`useTransactions`, `useForecast`, `useDebts`, …) pour propager le scope actif + invalidation (`useInvalidate`) par scope.

**FRs :** FR58-FR61 (voir 4.5).

#### Epic 9 — Comptes en gestion (mode suivi) *(dépend d'epic 8)*
*Un profil `managed` permet ingestion/catégo/réconciliation/dashboard, sans forecast ni dividende.*

- **9.1** — Logique `kind` : en mode `managed`, les endpoints forecast/sas-config/tax-settings retournent `403 profile_not_owner` (ou masqués). Garde-fou serveur.
- **9.2** — UI adaptative : navigation et pages (`forecast`, `sas`, `parametres`, dividende) masquées/désactivées quand le profil actif est `managed`. Badge « Mode suivi » visible.
- **9.3** — Parcours création profil `managed` + ses comptes, ré-ingestion des PDFs. Test E2E : profil parent → ingestion → dashboard OK, forecast absent.

**FRs :** FR62-FR64.

#### Epic 10 — Split dépenses communes (Tricount conjoint) *(dépend d'epics 6 + 8)*
*Une transaction flaggée « commune » alimente le compte-courant de dette entre Marceau et son conjoint.*

- **10.1** — Modèle : flag `is_shared` + `shared_ratio` (défaut 50/50) sur `transactions` (ou table de liaison), et lien vers l'entité conjoint (réutilise `debts`/`debt_advances` — mécanique actée en 4.2).
- **10.2** — Service `shared-expense` : une transaction commune de montant M et part P génère un mouvement de M×(1−P) sur le solde conjoint (sens à confirmer avec la dette pré-existante). 100% tests (NFR18) : 50/50, ratio custom, retrait du flag, montant nul.
- **10.3** — Endpoint `PATCH /api/transactions/[id]` étendu (`isShared`, `sharedRatio`) + recalcul du solde conjoint. Décrément/incrément idempotent au retrait.
- **10.4** — UI : marqueur « Commune » + part sur `TransactionRow`, et affichage du solde net conjoint sur la fiche dette du conjoint.
- **10.5** — Test E2E : dépense commune payée par Marceau → solde conjoint mis à jour.

**FRs :** FR65-FR68.

#### Epic 11 — Extraction PDF paramétrée par banque *(dépend d'epic 8 pour `accounts.bank`)*
*`pdf-extractor` route vers une stratégie d'extraction selon la banque du compte.*

- **11.1** — Refactor `pdf-extractor.ts` en dispatcher `extractStatement(buffer, bank)` ; extraction Boursorama actuelle isolée en stratégie `boursorama`. Interface stable conservée (NFR16). Aucun import `unpdf` hors du module.
- **11.2** — Ajout d'au moins une 2e stratégie banque (à préciser : banque des parents/conjoint) avec parsing période/soldes (G3) + fixtures PDF réelles + tests.
- **11.3** — Le pipeline `POST /api/statements` lit `account.bank` et passe la banque à l'extracteur. Erreur explicite `unsupported_bank` si stratégie absente.
- **11.4** — UI paramétrage compte : sélection de la banque (liste des stratégies supportées).

**FRs :** FR69-FR71.

### 4.4 — Dépendances & séquencement Phase 2

```
Epic 8 (fondation) ──┬── Epic 9 (mode suivi)
                     ├── Epic 10 (split conjoint)   [+ dépend Epic 6]
                     └── Epic 11 (extraction banque)
```
Epic 8 d'abord (bloquant). 9/10/11 ensuite, parallélisables.

### 4.5 — Annexe : nouveaux FRs proposés

| FR | Énoncé |
|---|---|
| FR58 | L'utilisateur peut créer/renommer/supprimer des **profils** (personne), chacun de type `owner` ou `managed`. |
| FR59 | L'utilisateur peut créer/éditer/supprimer des **comptes** rattachés à un profil, chacun avec un nom et une banque. |
| FR60 | Le système partitionne toutes les données (relevés, transactions, charges, revenus, overrides, dettes, config SAS/fiscalité) par profil/compte. |
| FR61 | L'utilisateur peut basculer le **contexte actif** (profil + compte) ; l'app reflète les données du contexte. |
| FR62 | Un profil `managed` autorise ingestion, catégorisation, réconciliation et dashboard, mais **pas** le forecast ni le dividende SAS. |
| FR63 | Le système empêche (serveur + UI) l'accès forecast/SAS/fiscalité pour un profil `managed`. |
| FR64 | L'UI indique visuellement le mode « suivi » d'un profil `managed`. |
| FR65 | L'utilisateur peut marquer une transaction comme **dépense commune** avec une part (défaut 50/50). |
| FR66 | Une dépense commune met à jour le **solde de compte-courant** entre l'utilisateur et son conjoint. |
| FR67 | Le retrait du marquage « commune » annule proprement le mouvement correspondant (idempotent). |
| FR68 | Le système affiche le solde net conjoint (créance/dette) intégrant les dépenses communes. |
| FR69 | Le système extrait les relevés selon une **stratégie d'extraction dépendant de la banque** du compte. |
| FR70 | Le système supporte au moins deux banques ; l'ajout d'une banque = ajout d'une stratégie sans refactor du pipeline. |
| FR71 | Le système signale explicitement une banque non supportée (`unsupported_bank`). |

## Section 5 — Implementation Handoff

**Classification : Major.**

| Rôle | Responsabilité | Livrable |
|---|---|---|
| **PM (John)** | Amendement PRD (4.1) + création des epics 8-11 dans `epics.md` + FR58-71 | PRD amendé, epics écrits |
| **Architect (Winston)** | Décisions D11-D14, trancher les 3 open questions (4.2), design migration | Architecture amendée |
| **PO / Dev** | Sprint planning Phase 2, création des stories, mise à jour `sprint-status.yaml` | Backlog Phase 2 |
| **Dev (Amelia)** | Implémentation epic 8 (socle) puis 9/10/11 | Code + tests |

**Pré-requis avant dev Phase 2 :** clôture des epics 5/6/7 (`review → done`).

**Critères de succès :**
- V1 mono-user livré et fonctionnel (forecast + dividende).
- Fondation multi-comptes : tout le code V1 re-scopé, tests 100% calculs (NFR18), snapshots régénérés.
- Profil `managed` sans fuite forecast (garde-fou serveur testé).
- Split conjoint exact au centime (NFR18).
- ≥ 2 banques extractibles.

**Prochaines étapes proposées :**
1. Approuver cette proposition.
2. J'applique l'amendement PRD + j'écris les epics 8-11 dans `epics.md`.
3. Passer la main à Winston (architecte) pour D11-D14 + open questions.
4. Sprint planning Phase 2 (après clôture 5/6/7).
