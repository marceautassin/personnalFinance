CREATE TABLE `settlement_groups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`label` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `transactions` ADD `settlement_group_id` integer REFERENCES settlement_groups(id);--> statement-breakpoint
CREATE INDEX `transactions_settlement_idx` ON `transactions` (`settlement_group_id`);