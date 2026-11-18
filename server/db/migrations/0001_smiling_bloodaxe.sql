DROP TABLE `debt_events`;--> statement-breakpoint
DROP TABLE `debts`;--> statement-breakpoint
DROP TABLE `fixed_charges`;--> statement-breakpoint
DROP TABLE `monthly_overrides`;--> statement-breakpoint
DROP TABLE `revenue_models`;--> statement-breakpoint
DROP TABLE `sas_config`;--> statement-breakpoint
DROP TABLE `tax_settings`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`statement_hash` text NOT NULL,
	`transaction_date` text NOT NULL,
	`label` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`category_code` text NOT NULL,
	`is_manual` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`statement_hash`) REFERENCES `bank_statements`(`hash_sha256`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_code`) REFERENCES `category_definitions`(`code`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
INSERT INTO `__new_transactions`("id", "statement_hash", "transaction_date", "label", "amount_cents", "category_code", "is_manual", "created_at") SELECT "id", "statement_hash", "transaction_date", "label", "amount_cents", "category_code", "is_manual", "created_at" FROM `transactions`;--> statement-breakpoint
DROP TABLE `transactions`;--> statement-breakpoint
ALTER TABLE `__new_transactions` RENAME TO `transactions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `transactions_period_idx` ON `transactions` (`transaction_date`);--> statement-breakpoint
CREATE INDEX `transactions_statement_idx` ON `transactions` (`statement_hash`);