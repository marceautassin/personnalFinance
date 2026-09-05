CREATE TABLE `classification_rules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`pattern` text NOT NULL,
	`category_item_code` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`category_item_code`) REFERENCES `category_items`(`code`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `classification_rules_pattern_unique` ON `classification_rules` (`pattern`);--> statement-breakpoint
CREATE INDEX `classification_rules_item_idx` ON `classification_rules` (`category_item_code`);