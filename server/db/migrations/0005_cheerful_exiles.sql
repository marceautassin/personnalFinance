CREATE INDEX `transactions_item_idx` ON `transactions` (`category_item_code`);--> statement-breakpoint
-- Story 17.3 — poste dédié aux écarts de réconciliation acceptés.
--
-- Les écarts assumés étaient rangés sur `divers-non-categorise`, de nature `expense` : un
-- écart POSITIF venait donc DIMINUER les dépenses de la période, et la ligne comptait dans le
-- taux de correction manuelle du jalon 14.4. Un écart est une différence inexpliquée : ni
-- recette, ni dépense. La nature `internal_transfer` l'exclut du résultat et le conserve dans
-- le solde bancaire (NFR4), ce qui est exactement sa signification.
--
-- DML assumée dans une migration générée : le snapshot Drizzle ne porte que le schéma, et ce
-- déplacement doit voyager avec l'index pour qu'une base existante reste cohérente.
INSERT INTO `category_items` (`code`, `group_code`, `label`, `nature`, `position`, `created_at`)
SELECT 'internes-ecart-accepte', 'internes', 'Écart de réconciliation accepté', 'internal_transfer',
       COALESCE((SELECT MAX(`position`) + 1 FROM `category_items` WHERE `group_code` = 'internes'), 0),
       CAST(strftime('%s', 'now') AS INTEGER)
WHERE EXISTS (SELECT 1 FROM `category_groups` WHERE `code` = 'internes')
  AND NOT EXISTS (SELECT 1 FROM `category_items` WHERE `code` = 'internes-ecart-accepte');
--> statement-breakpoint
-- Déplacement des écarts déjà acceptés, identifiés par leur libellé système et le relevé qui
-- porte la décision. Un reclassement manuel de l'utilisateur vers le repli n'est pas touché.
UPDATE `transactions`
SET `category_item_code` = 'internes-ecart-accepte'
WHERE `category_item_code` = 'divers-non-categorise'
  AND `label` = 'Écart accepté (réconciliation)'
  AND `statement_hash` IN (SELECT `hash_sha256` FROM `bank_statements` WHERE `gap_accepted` = 1);
