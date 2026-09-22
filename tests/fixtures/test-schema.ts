/**
 * DDL du schéma applicatif, pour les tests qui ouvrent une base SQLite temporaire.
 *
 * Extrait le 2026-09-05, au passage au référentiel à deux niveaux : le DDL était recopié à
 * l'identique dans dix fichiers de test. Ce n'est pas une gêne théorique — lors de la
 * suppression du périmètre forecast, un nettoyage en masse a modifié neuf copies et abîmé la
 * dixième, celle qui créait volontairement une colonne obsolète pour vérifier que le bootstrap
 * la refuse.
 *
 * Mis à jour le 2026-09-22 (story 27.1, D37-D40) : `profiles` apparaît, `category_groups` et
 * `category_items` prennent une clé de substitution entière, `transactions` et
 * `classification_rules` référencent le poste par `category_item_id`.
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
  CREATE TABLE profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    default_bank TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  );
  CREATE TABLE category_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id INTEGER NOT NULL REFERENCES profiles(id),
    code TEXT NOT NULL,
    label TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  );
  CREATE UNIQUE INDEX category_groups_profile_code_idx ON category_groups(profile_id, code);
  CREATE TABLE category_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id INTEGER NOT NULL REFERENCES profiles(id),
    code TEXT NOT NULL,
    group_id INTEGER NOT NULL REFERENCES category_groups(id) ON DELETE RESTRICT,
    label TEXT NOT NULL,
    nature TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  );
  CREATE UNIQUE INDEX category_items_profile_code_idx ON category_items(profile_id, code);
  CREATE INDEX category_items_group_idx ON category_items(group_id);
  CREATE TABLE bank_statements (
    hash_sha256 TEXT PRIMARY KEY,
    profile_id INTEGER NOT NULL REFERENCES profiles(id),
    bank TEXT NOT NULL,
    period_start TEXT NOT NULL,
    period_end TEXT NOT NULL,
    opening_balance_cents INTEGER NOT NULL,
    closing_balance_cents INTEGER NOT NULL,
    gap_accepted INTEGER NOT NULL DEFAULT 0,
    ingested_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  );
  CREATE TABLE settlement_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id INTEGER NOT NULL REFERENCES profiles(id),
    label TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  );
  CREATE TABLE transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    statement_hash TEXT NOT NULL REFERENCES bank_statements(hash_sha256) ON DELETE CASCADE,
    transaction_date TEXT NOT NULL,
    label TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    category_item_id INTEGER NOT NULL REFERENCES category_items(id) ON DELETE RESTRICT,
    is_manual INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    -- Epic 19. PAS de ON DELETE SET NULL : l'ALTER TABLE de SQLite ne sait pas porter
    -- d'action de cle etrangere, et la migration 0007 n'en pose donc aucune. Le declarer ici
    -- ferait passer les tests la ou la production echoue (recette du 2026-09-07).
    settlement_group_id INTEGER REFERENCES settlement_groups(id)
  );
  CREATE INDEX transactions_period_idx ON transactions(transaction_date);
  CREATE INDEX transactions_statement_idx ON transactions(statement_hash);
  CREATE INDEX transactions_item_idx ON transactions(category_item_id);
  CREATE INDEX transactions_settlement_idx ON transactions(settlement_group_id);
  CREATE TABLE classification_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id INTEGER NOT NULL REFERENCES profiles(id),
    pattern TEXT NOT NULL,
    category_item_id INTEGER NOT NULL REFERENCES category_items(id) ON DELETE RESTRICT,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  );
  CREATE UNIQUE INDEX classification_rules_profile_pattern_idx ON classification_rules(profile_id, pattern);
  CREATE INDEX classification_rules_item_idx ON classification_rules(category_item_id);
`

/**
 * Profil `marceau`, rubrique et postes minimaux, suffisants pour insérer des transactions.
 *
 * Les trois natures sont représentées : un test qui n'aurait que des postes de dépense ne
 * verrait jamais un mouvement interne mal compté.
 *
 * Story 27.1 : les `id` de `category_groups`/`category_items` sont auto-incrémentés par
 * SQLite dans l'ordre de cet `INSERT` — un test qui a besoin d'un id précis le relit plutôt que
 * de le supposer (`SELECT id FROM category_items WHERE code = …`).
 */
export const TEST_REFERENTIAL_DDL = `
  INSERT INTO profiles (id, name, default_bank) VALUES (1, 'marceau', 'boursorama');
  INSERT INTO category_groups (profile_id, code, label, position) VALUES
    (1, 'alimentation', 'Alimentation', 0),
    (1, 'transport', 'Transport', 1),
    (1, 'loisirs', 'Culture et loisirs', 2),
    (1, 'abonnements', 'Abonnements et prélèvements', 3),
    (1, 'style', 'Style', 4),
    (1, 'revenus', 'Revenus', 5),
    (1, 'internes', 'Mouvements internes', 6),
    (1, 'divers', 'Divers', 7),
    (1, 'compte-joint', 'Compte joint', 8);
  INSERT INTO category_items (profile_id, code, group_id, label, nature, position) VALUES
    (1, 'alimentation-courses', (SELECT id FROM category_groups WHERE code = 'alimentation' AND profile_id = 1), 'Courses', 'expense', 0),
    (1, 'alimentation-restaurant', (SELECT id FROM category_groups WHERE code = 'alimentation' AND profile_id = 1), 'Restaurant', 'expense', 1),
    (1, 'transport-carburant', (SELECT id FROM category_groups WHERE code = 'transport' AND profile_id = 1), 'Carburant', 'expense', 0),
    (1, 'loisirs-sport', (SELECT id FROM category_groups WHERE code = 'loisirs' AND profile_id = 1), 'Sport', 'expense', 0),
    (1, 'abonnements-streaming', (SELECT id FROM category_groups WHERE code = 'abonnements' AND profile_id = 1), 'Streaming', 'expense', 0),
    (1, 'style-habillement', (SELECT id FROM category_groups WHERE code = 'style' AND profile_id = 1), 'Habillement', 'expense', 0),
    (1, 'revenus-salaire', (SELECT id FROM category_groups WHERE code = 'revenus' AND profile_id = 1), 'Salaire', 'income', 0),
    (1, 'internes-virement-epargne', (SELECT id FROM category_groups WHERE code = 'internes' AND profile_id = 1), 'Virement épargne', 'internal_transfer', 0),
    (1, 'internes-ecart-accepte', (SELECT id FROM category_groups WHERE code = 'internes' AND profile_id = 1), 'Écart de réconciliation accepté', 'internal_transfer', 1),
    (1, 'divers-non-categorise', (SELECT id FROM category_groups WHERE code = 'divers' AND profile_id = 1), 'Non catégorisé', 'expense', 0),
    -- Story 21.1 : la coupe du compte joint émet un poste CALCULÉ. Le DDL de test doit dire la
    -- même chose que la migration 0009/0010, sinon les tests passeraient là où la production
    -- ignore silencieusement la moitié coupée (leçon de la migration 0007, epic 19).
    (1, 'internes-virement-joint', (SELECT id FROM category_groups WHERE code = 'internes' AND profile_id = 1), 'Virement du compte joint', 'internal_transfer', 2),
    (1, 'compte-joint-part-remboursee', (SELECT id FROM category_groups WHERE code = 'compte-joint' AND profile_id = 1), 'Part remboursée', 'expense', 0);
`
