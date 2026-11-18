PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`statement_hash` text NOT NULL,
	`transaction_date` text NOT NULL,
	`label` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`category_item_code` text NOT NULL,
	`is_manual` integer DEFAULT false NOT NULL,
	`settlement_group_id` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`statement_hash`) REFERENCES `bank_statements`(`hash_sha256`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_item_code`) REFERENCES `category_items`(`code`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`settlement_group_id`) REFERENCES `settlement_groups`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_transactions`("id", "statement_hash", "transaction_date", "label", "amount_cents", "category_item_code", "is_manual", "settlement_group_id", "created_at") SELECT "id", "statement_hash", "transaction_date", "label", "amount_cents", "category_item_code", "is_manual", "settlement_group_id", "created_at" FROM `transactions`;--> statement-breakpoint
DROP TABLE `transactions`;--> statement-breakpoint
ALTER TABLE `__new_transactions` RENAME TO `transactions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `transactions_period_idx` ON `transactions` (`transaction_date`);--> statement-breakpoint
CREATE INDEX `transactions_statement_idx` ON `transactions` (`statement_hash`);--> statement-breakpoint
CREATE INDEX `transactions_item_idx` ON `transactions` (`category_item_code`);--> statement-breakpoint
CREATE INDEX `transactions_settlement_idx` ON `transactions` (`settlement_group_id`);