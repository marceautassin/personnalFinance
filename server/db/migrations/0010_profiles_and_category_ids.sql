-- Story 27.1 (D37-D40) : le profil devient le propriétaire de chaque donnée possédée.
--
-- Rebuild de six tables (category_groups, category_items, bank_statements, transactions,
-- classification_rules, settlement_groups). Recette qui NE DÉPEND PAS de
-- `PRAGMA foreign_keys=OFF` (Piège n°1, Dev Notes de la story) : `drizzle-kit migrate` exécute
-- cette migration dans une transaction, où SQLite ignore ce PRAGMA. Les tables `__new_*` sont
-- donc créées et peuplées AVANT que les anciennes ne soient supprimées, foreign_keys=ON de
-- bout en bout.
--
-- ATTENTION : ce commentaire d'en-tête ne doit PAS être suivi d'un marqueur de segment isolé
-- (celui que drizzle-kit insère entre deux instructions) : le migrateur drizzle-orm prépare
-- CHAQUE segment séparé par ce marqueur comme une instruction SQL individuelle, et un segment
-- qui ne contient QUE des commentaires produit « the supplied SQL string contains no
-- statements » (constaté le 2026-09-22, ce fichier). Le premier CREATE TABLE doit rester dans
-- le MÊME segment que cet en-tête — et aucun commentaire de ce fichier ne doit citer le
-- marqueur littéralement, sous peine d'y introduire une coupure involontaire.
CREATE TABLE `profiles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`default_bank` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `profiles_name_unique` ON `profiles` (`name`);--> statement-breakpoint
-- Seed inconditionnel : sur une base neuve (E2E, AC 7) comme sur une base existante (AC 1).
INSERT INTO `profiles` (`id`, `name`, `default_bank`, `created_at`) VALUES (1, 'marceau', 'boursorama', strftime('%s','now'));
--> statement-breakpoint

-- 1. Parents du rebuild : ne dépendent que de `profiles`, déjà en place.
CREATE TABLE `__new_category_groups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`profile_id` integer NOT NULL,
	`code` text NOT NULL,
	`label` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `__new_bank_statements` (
	`hash_sha256` text PRIMARY KEY NOT NULL,
	`profile_id` integer NOT NULL,
	`bank` text NOT NULL,
	`period_start` text NOT NULL,
	`period_end` text NOT NULL,
	`opening_balance_cents` integer NOT NULL,
	`closing_balance_cents` integer NOT NULL,
	`gap_accepted` integer DEFAULT false NOT NULL,
	`ingested_at` integer NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `__new_settlement_groups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`profile_id` integer NOT NULL,
	`label` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint

-- 2. Enfant de category_groups.
CREATE TABLE `__new_category_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`profile_id` integer NOT NULL,
	`code` text NOT NULL,
	`group_id` integer NOT NULL,
	`label` text NOT NULL,
	`nature` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`group_id`) REFERENCES `__new_category_groups`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint

-- 3. Enfants de bank_statements / category_items / settlement_groups.
CREATE TABLE `__new_transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`statement_hash` text NOT NULL,
	`transaction_date` text NOT NULL,
	`label` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`category_item_id` integer NOT NULL,
	`is_manual` integer DEFAULT false NOT NULL,
	`settlement_group_id` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`statement_hash`) REFERENCES `__new_bank_statements`(`hash_sha256`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_item_id`) REFERENCES `__new_category_items`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`settlement_group_id`) REFERENCES `__new_settlement_groups`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `__new_classification_rules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`profile_id` integer NOT NULL,
	`pattern` text NOT NULL,
	`category_item_id` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_item_id`) REFERENCES `__new_category_items`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint

-- 4. Copies. `profile_id = 1` partout (AC 1) ; `bank = 'boursorama'` en dur (hors périmètre,
--    28.1 en changera la source). Les `id` de transactions, classification_rules et
--    settlement_groups sont PRÉSERVÉS (URLs, groupes, export). Les rubriques et postes
--    reçoivent de nouveaux `id` : rien ne les référence encore ailleurs que par leur `code`.
INSERT INTO `__new_category_groups` (`profile_id`, `code`, `label`, `position`, `created_at`)
  SELECT 1, `code`, `label`, `position`, `created_at` FROM `category_groups`;
--> statement-breakpoint
INSERT INTO `__new_bank_statements` (`hash_sha256`, `profile_id`, `bank`, `period_start`, `period_end`, `opening_balance_cents`, `closing_balance_cents`, `gap_accepted`, `ingested_at`)
  SELECT `hash_sha256`, 1, 'boursorama', `period_start`, `period_end`, `opening_balance_cents`, `closing_balance_cents`, `gap_accepted`, `ingested_at` FROM `bank_statements`;
--> statement-breakpoint
INSERT INTO `__new_settlement_groups` (`id`, `profile_id`, `label`, `created_at`)
  SELECT `id`, 1, `label`, `created_at` FROM `settlement_groups`;
--> statement-breakpoint
-- ⚠️ LEFT JOIN, PAS JOIN (revue PR — bug réel : un INNER JOIN sur un code orphelin ne matche
-- simplement rien, la ligne disparaît en SILENCE et la migration « réussit » avec moins de
-- lignes qu'avant. Le LEFT JOIN laisse `ng.id`/`ni.id` à NULL sur une ligne orpheline, et la
-- colonne cible est NOT NULL : l'INSERT échoue, toute la transaction de migration est annulée
-- (rollback), et l'écart remonte comme une ERREUR plutôt que comme une perte silencieuse. C'est
-- le comportement voulu par AC 3 : « tout écart fait échouer la procédure ».
INSERT INTO `__new_category_items` (`profile_id`, `code`, `group_id`, `label`, `nature`, `position`, `created_at`)
  SELECT 1, `ci`.`code`, `ng`.`id`, `ci`.`label`, `ci`.`nature`, `ci`.`position`, `ci`.`created_at`
  FROM `category_items` `ci`
  LEFT JOIN `__new_category_groups` `ng` ON `ng`.`code` = `ci`.`group_code` AND `ng`.`profile_id` = 1;
--> statement-breakpoint
INSERT INTO `__new_transactions` (`id`, `statement_hash`, `transaction_date`, `label`, `amount_cents`, `category_item_id`, `is_manual`, `settlement_group_id`, `created_at`)
  SELECT `t`.`id`, `t`.`statement_hash`, `t`.`transaction_date`, `t`.`label`, `t`.`amount_cents`, `ni`.`id`, `t`.`is_manual`, `t`.`settlement_group_id`, `t`.`created_at`
  FROM `transactions` `t`
  LEFT JOIN `__new_category_items` `ni` ON `ni`.`code` = `t`.`category_item_code` AND `ni`.`profile_id` = 1;
--> statement-breakpoint
INSERT INTO `__new_classification_rules` (`id`, `profile_id`, `pattern`, `category_item_id`, `created_at`)
  SELECT `cr`.`id`, 1, `cr`.`pattern`, `ni`.`id`, `cr`.`created_at`
  FROM `classification_rules` `cr`
  LEFT JOIN `__new_category_items` `ni` ON `ni`.`code` = `cr`.`category_item_code` AND `ni`.`profile_id` = 1;
--> statement-breakpoint

-- 5. Suppression des anciennes tables, ENFANTS d'abord : plus aucune ligne ne les référence,
--    le DELETE implicite du DROP ne viole rien.
DROP TABLE `transactions`;
--> statement-breakpoint
DROP TABLE `classification_rules`;
--> statement-breakpoint
DROP TABLE `category_items`;
--> statement-breakpoint
DROP TABLE `category_groups`;
--> statement-breakpoint
DROP TABLE `bank_statements`;
--> statement-breakpoint
DROP TABLE `settlement_groups`;
--> statement-breakpoint

-- 6. Renommage : avec legacy_alter_table=OFF (défaut), SQLite réécrit les clés étrangères des
--    autres tables `__new_*` qui pointent vers celle qu'on renomme.
ALTER TABLE `__new_category_groups` RENAME TO `category_groups`;
--> statement-breakpoint
ALTER TABLE `__new_category_items` RENAME TO `category_items`;
--> statement-breakpoint
ALTER TABLE `__new_bank_statements` RENAME TO `bank_statements`;
--> statement-breakpoint
ALTER TABLE `__new_settlement_groups` RENAME TO `settlement_groups`;
--> statement-breakpoint
ALTER TABLE `__new_transactions` RENAME TO `transactions`;
--> statement-breakpoint
ALTER TABLE `__new_classification_rules` RENAME TO `classification_rules`;
--> statement-breakpoint

-- 7. Index perdus par le rebuild.
CREATE UNIQUE INDEX `category_groups_profile_code_idx` ON `category_groups` (`profile_id`,`code`);
--> statement-breakpoint
CREATE UNIQUE INDEX `category_items_profile_code_idx` ON `category_items` (`profile_id`,`code`);
--> statement-breakpoint
CREATE INDEX `category_items_group_idx` ON `category_items` (`group_id`);
--> statement-breakpoint
CREATE INDEX `transactions_period_idx` ON `transactions` (`transaction_date`);
--> statement-breakpoint
CREATE INDEX `transactions_statement_idx` ON `transactions` (`statement_hash`);
--> statement-breakpoint
CREATE INDEX `transactions_item_idx` ON `transactions` (`category_item_id`);
--> statement-breakpoint
CREATE INDEX `transactions_settlement_idx` ON `transactions` (`settlement_group_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `classification_rules_profile_pattern_idx` ON `classification_rules` (`profile_id`,`pattern`);
--> statement-breakpoint
CREATE INDEX `classification_rules_item_idx` ON `classification_rules` (`category_item_id`);
