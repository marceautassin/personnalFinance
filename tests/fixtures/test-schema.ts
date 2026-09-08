/**
 * DDL du schéma applicatif, pour les tests qui ouvrent une base SQLite temporaire.
 *
 * Extrait le 2026-09-05, au passage au référentiel à deux niveaux : le DDL était recopié à
 * l'identique dans dix fichiers de test. Ce n'est pas une gêne théorique — lors de la
 * suppression du périmètre forecast, un nettoyage en masse a modifié neuf copies et abîmé la
 * dixième, celle qui créait volontairement une colonne obsolète pour vérifier que le bootstrap
 * la refuse.
 *
 * ⚠️ Ce DDL doit rester le miroir de `server/db/schema.ts`. Il ne le remplace pas : les tests
 * unitaires n'appliquent pas les migrations, ils construisent une base minimale en mémoire.
 * Toute évolution du schéma se répercute ICI, à un seul endroit.
 *
 * Un écart assumé : les `created_at` portent ici un `DEFAULT (strftime('%s','now'))` que le
 * schéma réel n'a pas — en production la valeur vient du `$defaultFn` de Drizzle. Les tests
 * sont donc plus permissifs qu'elle sur un `INSERT` SQL brut qui omettrait la colonne. Sans
 * ce défaut, ces mêmes `INSERT` échoueraient sur `NOT NULL` alors que le code applicatif,
 * lui, passe toujours par Drizzle.
 */
export const TEST_SCHEMA_DDL = `
  CREATE TABLE category_groups (
    code TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  );
  CREATE TABLE category_items (
    code TEXT PRIMARY KEY,
    group_code TEXT NOT NULL REFERENCES category_groups(code) ON DELETE RESTRICT,
    label TEXT NOT NULL,
    nature TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  );
  CREATE INDEX category_items_group_idx ON category_items(group_code);
  CREATE TABLE bank_statements (
    hash_sha256 TEXT PRIMARY KEY,
    period_start TEXT NOT NULL,
    period_end TEXT NOT NULL,
    opening_balance_cents INTEGER NOT NULL,
    closing_balance_cents INTEGER NOT NULL,
    gap_accepted INTEGER NOT NULL DEFAULT 0,
    ingested_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  );
  CREATE TABLE settlement_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    label TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  );
  CREATE TABLE transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    statement_hash TEXT NOT NULL REFERENCES bank_statements(hash_sha256) ON DELETE CASCADE,
    transaction_date TEXT NOT NULL,
    label TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    category_item_code TEXT NOT NULL REFERENCES category_items(code) ON DELETE RESTRICT,
    is_manual INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    -- Epic 19. PAS de ON DELETE SET NULL : l'ALTER TABLE de SQLite ne sait pas porter
    -- d'action de cle etrangere, et la migration 0007 n'en pose donc aucune. Le declarer ici
    -- ferait passer les tests la ou la production echoue (recette du 2026-09-07).
    settlement_group_id INTEGER REFERENCES settlement_groups(id)
  );
  CREATE INDEX transactions_period_idx ON transactions(transaction_date);
  CREATE INDEX transactions_statement_idx ON transactions(statement_hash);
  CREATE INDEX transactions_settlement_idx ON transactions(settlement_group_id);
  CREATE TABLE classification_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pattern TEXT NOT NULL UNIQUE,
    category_item_code TEXT NOT NULL REFERENCES category_items(code) ON DELETE RESTRICT,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  );
  CREATE INDEX classification_rules_item_idx ON classification_rules(category_item_code);
`

/**
 * Rubrique et postes minimaux, suffisants pour insérer des transactions.
 *
 * Les trois natures sont représentées : un test qui n'aurait que des postes de dépense ne
 * verrait jamais un mouvement interne mal compté.
 */
export const TEST_REFERENTIAL_DDL = `
  INSERT INTO category_groups (code, label, position) VALUES
    ('alimentation', 'Alimentation', 0),
    ('transport', 'Transport', 1),
    ('loisirs', 'Culture et loisirs', 2),
    ('abonnements', 'Abonnements et prélèvements', 3),
    ('style', 'Style', 4),
    ('revenus', 'Revenus', 5),
    ('internes', 'Mouvements internes', 6),
    ('divers', 'Divers', 7),
    ('compte-joint', 'Compte joint', 8);
  INSERT INTO category_items (code, group_code, label, nature, position) VALUES
    ('alimentation-courses', 'alimentation', 'Courses', 'expense', 0),
    ('alimentation-restaurant', 'alimentation', 'Restaurant', 'expense', 1),
    ('transport-carburant', 'transport', 'Carburant', 'expense', 0),
    ('loisirs-sport', 'loisirs', 'Sport', 'expense', 0),
    ('abonnements-streaming', 'abonnements', 'Streaming', 'expense', 0),
    ('style-habillement', 'style', 'Habillement', 'expense', 0),
    ('revenus-salaire', 'revenus', 'Salaire', 'income', 0),
    ('internes-virement-epargne', 'internes', 'Virement épargne', 'internal_transfer', 0),
    ('internes-ecart-accepte', 'internes', 'Écart de réconciliation accepté', 'internal_transfer', 1),
    ('divers-non-categorise', 'divers', 'Non catégorisé', 'expense', 0),
    -- Story 21.1 : la coupe du compte joint émet un poste CALCULÉ. Le DDL de test doit dire la
    -- même chose que la migration 0009, sinon les tests passeraient là où la production ignore
    -- silencieusement la moitié coupée (leçon de la migration 0007, epic 19).
    ('internes-virement-joint', 'internes', 'Virement du compte joint', 'internal_transfer', 2),
    ('compte-joint-part-remboursee', 'compte-joint', 'Part remboursée', 'expense', 0);
`
