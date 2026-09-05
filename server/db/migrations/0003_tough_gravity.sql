ALTER TABLE `bank_statements` ADD `gap_accepted` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `bank_statements` DROP COLUMN `reliability`;