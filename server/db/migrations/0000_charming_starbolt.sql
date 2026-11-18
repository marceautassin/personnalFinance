CREATE TABLE `bank_statements` (
	`hash_sha256` text PRIMARY KEY NOT NULL,
	`period_start` text NOT NULL,
	`period_end` text NOT NULL,
	`opening_balance_cents` integer NOT NULL,
	`closing_balance_cents` integer NOT NULL,
	`reliability` text DEFAULT 'reliable' NOT NULL,
	`ingested_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `category_definitions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`label` text NOT NULL,
	`is_variable` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `category_definitions_code_unique` ON `category_definitions` (`code`);--> statement-breakpoint
CREATE TABLE `debt_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`debt_id` integer NOT NULL,
	`amount_cents` integer NOT NULL,
	`event_date` text NOT NULL,
	`kind` text DEFAULT 'advance' NOT NULL,
	`source_transaction_id` integer,
	`note` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`debt_id`) REFERENCES `debts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `debt_events_debt_idx` ON `debt_events` (`debt_id`);--> statement-breakpoint
CREATE TABLE `debts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`creditor` text NOT NULL,
	`initial_balance_cents` integer NOT NULL,
	`repayment_mode` text DEFAULT 'free' NOT NULL,
	`monthly_amount_cents` integer,
	`lump_sum_date` text,
	`created_at` integer NOT NULL,
	CONSTRAINT "debts_mode_check" CHECK("debts"."repayment_mode" IN ('free', 'monthly', 'lump_sum'))
);
--> statement-breakpoint
CREATE TABLE `dismissed_suggestions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`normalized_label` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dismissed_suggestions_normalized_label_unique` ON `dismissed_suggestions` (`normalized_label`);--> statement-breakpoint
CREATE TABLE `fixed_charges` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`label` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`category_code` text NOT NULL,
	`frequency` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`category_code`) REFERENCES `category_definitions`(`code`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `fixed_charges_category_idx` ON `fixed_charges` (`category_code`);--> statement-breakpoint
CREATE TABLE `monthly_overrides` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`month` text NOT NULL,
	`category_code` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`category_code`) REFERENCES `category_definitions`(`code`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "monthly_overrides_amount_positive" CHECK("monthly_overrides"."amount_cents" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `monthly_overrides_month_cat_idx` ON `monthly_overrides` (`month`,`category_code`);--> statement-breakpoint
CREATE TABLE `revenue_models` (
	`id` integer PRIMARY KEY NOT NULL,
	`unemployment_benefit_monthly_cents` integer DEFAULT 0 NOT NULL,
	`unemployment_benefit_end_date` text,
	`sas_monthly_rent_cents` integer DEFAULT 0 NOT NULL,
	`expense_reimbursements_monthly_cents` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sas_config` (
	`id` integer PRIMARY KEY NOT NULL,
	`fiscal_year_end_date` text DEFAULT '12-31' NOT NULL,
	`revenue_forecast_cents` integer DEFAULT 0 NOT NULL,
	`expenses_forecast_cents` integer DEFAULT 0 NOT NULL,
	`current_treasury_cents` integer DEFAULT 0 NOT NULL,
	`is_rate_pct` integer DEFAULT 1500 NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tax_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`dividend_tax_rate_pct` integer DEFAULT 3000 NOT NULL,
	`dividend_tax_mode` text DEFAULT 'flat_tax' NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "tax_settings_mode_check" CHECK("tax_settings"."dividend_tax_mode" IN ('flat_tax', 'progressive'))
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`statement_hash` text NOT NULL,
	`transaction_date` text NOT NULL,
	`label` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`category_code` text NOT NULL,
	`is_manual` integer DEFAULT false NOT NULL,
	`is_debt_repayment` integer DEFAULT false NOT NULL,
	`debt_id` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`statement_hash`) REFERENCES `bank_statements`(`hash_sha256`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_code`) REFERENCES `category_definitions`(`code`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`debt_id`) REFERENCES `debts`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "transactions_debt_coherence_check" CHECK(("transactions"."debt_id" IS NULL) = ("transactions"."is_debt_repayment" = 0))
);
--> statement-breakpoint
CREATE INDEX `transactions_period_idx` ON `transactions` (`transaction_date`);--> statement-breakpoint
CREATE INDEX `transactions_statement_idx` ON `transactions` (`statement_hash`);