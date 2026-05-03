# personnalFinance

App de pilotage financier personnel local-first. Ingère des relevés PDF Boursorama, catégorise les transactions via Claude API, et calcule via un **forecast inverse** la rémunération pour couvrir les dépenses futures.

Specs complètes : voir `_bmad-output/planning-artifacts/{prd,architecture,epics}.md` et `CLAUDE.md` à la racine.

## Stack

Nuxt 4 (SPA) · Nitro · SQLite + Drizzle · `unpdf` · Claude API · CSS vanilla · Pinia · Zod · Vitest + Playwright · **Yarn Classic**.

## Prérequis

- **Node** ≥ 20.11
- **Yarn Classic** (1.22.x) — pas npm, pas pnpm, pas Yarn Berry
- Une clé API Anthropic ([console.anthropic.com](https://console.anthropic.com/))

## Setup

```bash
yarn install
cp .env.example .env
# Éditer .env et y mettre la vraie ANTHROPIC_API_KEY
```

## Développement

```bash
yarn dev                  # Nuxt + Nitro hot reload sur http://localhost:3000
yarn db:push              # Sync rapide du schéma SQLite (itération dev)
yarn db:generate          # Génère un fichier de migration Drizzle
yarn apply-migration      # Applique les migrations pending
yarn db:studio            # Drizzle Studio (explorer la base)
yarn test                 # Vitest watch
yarn test:run             # Vitest one-shot
yarn test:e2e             # Playwright (Chrome + Firefox)
yarn lint                 # ESLint
yarn lint:fix             # ESLint + autofix
yarn typecheck            # Type checking via nuxt typecheck
```

## Production locale

```bash
yarn build
yarn start                # Nitro sert le SPA statique + endpoints /api/*
```

## Conventions

Toutes les conventions sont codifiées dans `CLAUDE.md` à la racine. Quelques rappels critiques :

- **Yarn Classic uniquement** (pas npm/pnpm)
- **CSS vanilla** uniquement (pas de Tailwind)
- **`Cents` branded type** pour toute valeur monétaire (pas de `float`)
- **Boundaries imperméables** : `unpdf` via `pdf-extractor`, `@anthropic-ai/sdk` via `llm-categorizer`, DB via Drizzle uniquement
- **`.env`** ne quitte JAMAIS la machine (gitignored, jamais en log/réponse/bundle)

## Stockage des données

- `_data/raw/{sha256}.pdf` — relevés PDF sources (gitignored)
- `_data/personnalfinance.db` — base SQLite (gitignored)
