--> WIPE (D18) : les transactions ne sont pas migrées vers le nouveau référentiel, elles sont
--> ré-ingérées depuis les PDF conservés dans `_data/raw/` (NFR12). Une table de correspondance
--> 19 catégories plates → 48 postes hiérarchisés aurait coûté du code jetable pour un résultat
--> moins informatif : la ré-ingestion produit au passage la première mesure du taux de
--> correction sur le nouveau référentiel.
--> Ces deux suppressions ouvrent la migration, et pas l'inverse : `category_definitions` est
--> encore référencée par les 207 transactions existantes, et son DROP échoue tant qu'elles
--> sont là (SQLITE_CONSTRAINT_TRIGGER).
DELETE FROM `transactions`;--> statement-breakpoint
DELETE FROM `bank_statements`;--> statement-breakpoint
CREATE TABLE `category_groups` (
	`code` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `category_items` (
	`code` text PRIMARY KEY NOT NULL,
	`group_code` text NOT NULL,
	`label` text NOT NULL,
	`nature` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`group_code`) REFERENCES `category_groups`(`code`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `category_items_group_idx` ON `category_items` (`group_code`);--> statement-breakpoint
DROP TABLE `category_definitions`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`statement_hash` text NOT NULL,
	`transaction_date` text NOT NULL,
	`label` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`category_item_code` text NOT NULL,
	`is_manual` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`statement_hash`) REFERENCES `bank_statements`(`hash_sha256`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_item_code`) REFERENCES `category_items`(`code`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
--> Le `INSERT ... SELECT` généré par drizzle-kit a été retiré à la main : il lisait
--> `category_item_code` sur l'ancienne table, qui ne porte que `category_code` — il aurait
--> échoué à l'exécution. Le wipe ci-dessus le rend de toute façon sans objet.
DROP TABLE `transactions`;--> statement-breakpoint
ALTER TABLE `__new_transactions` RENAME TO `transactions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `transactions_period_idx` ON `transactions` (`transaction_date`);--> statement-breakpoint
CREATE INDEX `transactions_statement_idx` ON `transactions` (`statement_hash`);