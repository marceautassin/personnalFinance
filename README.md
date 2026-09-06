# personnalFinance

App d'**analyse de dépenses personnelles**, locale et mono-utilisateur. Ingère des relevés PDF
Boursorama/Boursobank, catégorise chaque ligne via un modèle de langage, et restitue **où part
l'argent** — par rubrique et par poste, sur une période choisie, avec l'évolution dans le temps.

> Le cadrage initial (forecast inverse, dividende SAS, dettes, fiscalité) a été invalidé par
> l'usage réel le 2026-09-04 et retiré du code. Les documents de l'ancien périmètre sont
> archivés en `prd-v1-forecast.md` et `epics-v1-forecast.md` : ne pas s'en servir comme
> référence.

Specs complètes : `_bmad-output/planning-artifacts/{prd,architecture,epics}.md` et `CLAUDE.md`.

## Stack

Nuxt 4 (SPA) · Nitro · SQLite + Drizzle · `unpdf` · **Mistral** (modèle `zai-glm-5-2`,
inférence Europe) · CSS vanilla · Pinia · Zod · Vitest + Playwright · **Yarn Classic**.

## Prérequis

- **Node** ≥ 20.11
- **Yarn Classic** (1.22.x) — pas npm, pas pnpm, pas Yarn Berry
- Une clé API Mistral ([console.mistral.ai](https://console.mistral.ai/))

## Setup

```bash
yarn install
cp .env.example .env
# Éditer .env et y mettre la vraie MISTRAL_API_KEY
```

## Développement

```bash
yarn dev                  # Nuxt + Nitro hot reload sur http://localhost:3000
yarn db:generate          # Génère un fichier de migration Drizzle
yarn apply-migration      # Applique les migrations pending
yarn db:backup            # Sauvegarde la base + exporte les corrections (voir plus bas)
yarn db:studio            # Drizzle Studio (explorer la base)
yarn test                 # Vitest watch
yarn test:run             # Vitest one-shot
yarn test:e2e             # Playwright (Chromium)
yarn lint                 # ESLint
yarn lint:fix             # ESLint + autofix
yarn typecheck            # Type checking via nuxt typecheck
```

`yarn db:push` existe encore mais **ne doit pas servir** : D21 impose des migrations
versionnées, et le bootstrap Nitro vérifie que le schéma est à jour au démarrage.

## Production locale

```bash
yarn build
yarn start                # Nitro sert le SPA statique + endpoints /api/*
```

## Conventions

Toutes les conventions sont codifiées dans `CLAUDE.md`. Quelques rappels critiques :

- **Yarn Classic uniquement** (pas npm/pnpm)
- **CSS vanilla** uniquement (pas de Tailwind)
- **`Cents` branded type** pour toute valeur monétaire (pas de `float`)
- **Boundaries imperméables** : `unpdf` via `pdf-extractor`, le SDK Mistral via
  `llm-categorizer`, DB via Drizzle uniquement
- **`.env`** ne quitte JAMAIS la machine (gitignored, jamais en log/réponse/bundle)

## Ce qui part au fournisseur de modèle

Seul le **tableau d'opérations** du relevé est transmis. Le bloc d'identité — IBAN, numéro de
compte, nom et adresse — est coupé géométriquement par `pdf-extractor`, et une passe
d'expurgation neutralise tout IBAN ou BIC résiduel (NFR6, story 17.1). Le nom du titulaire
reste présent **dans les libellés bancaires eux-mêmes** (`VIR SEPA … charges`) : il est
indissociable de la donnée métier.

## Stockage des données

- `_data/raw/{sha256}.pdf` — relevés PDF sources (gitignored)
- `_data/inbox/` — dépôt de travail pour les PDF à ingérer (gitignored)
- `_data/personnalfinance.db` — base SQLite (gitignored)
- `_data/backups/` — sauvegardes produites par `yarn db:backup` (gitignored)

## Sauvegarde

`yarn db:backup` écrit deux artefacts horodatés dans `_data/backups/` : une copie binaire
cohérente de la base, et un export JSON des **corrections** — règles de classement,
reclassements manuels, écarts assumés, référentiel. Les PDF suffisent à reconstruire les
montants ; ils ne reconstruisent pas le rangement, qui est le seul travail que la machine ne
refait pas.
