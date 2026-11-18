ALTER TABLE `bank_statements` ADD `source` text DEFAULT 'pdf' NOT NULL;--> statement-breakpoint
ALTER TABLE `bank_statements` ADD `continuity_gap_cents` integer;--> statement-breakpoint
ALTER TABLE `bank_statements` ADD `card_detail_missing` integer DEFAULT false NOT NULL;
--> statement-breakpoint
-- Story 28.4 (FR84, D44) — poste « Carte (non détaillée) » sur chaque profil DÉJÀ peuplé.
-- Conditionné à l'existence de la rubrique `divers` : sur une base neuve (E2E), rien n'est
-- inséré et le seed porte le poste depuis DEFAULT_REFERENTIAL (cf. 0009). OR IGNORE + index
-- unique (profile_id, code) : rejouable.
INSERT OR IGNORE INTO `category_items` (`profile_id`, `code`, `group_id`, `label`, `nature`, `position`, `created_at`)
SELECT g.`profile_id`, 'divers-carte-non-detaillee', g.`id`, 'Carte (non détaillée)', 'expense',
  (SELECT COALESCE(MAX(i.`position`), -1) + 1 FROM `category_items` i WHERE i.`group_id` = g.`id`),
  strftime('%s','now')
FROM `category_groups` g WHERE g.`code` = 'divers';