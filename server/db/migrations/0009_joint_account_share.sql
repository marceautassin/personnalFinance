-- Story 21.1 — le compte joint : ne compter que sa moitié.
--
-- Le référentiel n'est semé qu'à l'initialisation : sur une base déjà peuplée, le seed est
-- sauté, et ces deux postes n'y arriveraient jamais. D'où cette migration.
--
-- ⚠️ Chaque insertion est conditionnée à l'EXISTENCE de sa rubrique parente. Sur une base
-- NEUVE — celle des tests E2E, construite en rejouant les migrations — le référentiel est
-- encore vide : insérer ici y créerait une rubrique isolée, et le bootstrap, qui saute le seed
-- dès qu'une rubrique existe, laisserait la base avec ce seul fragment. Sans la condition, la
-- migration réparait les bases anciennes en cassant les neuves.
-- `OR IGNORE` la rend par ailleurs rejouable.

INSERT OR IGNORE INTO `category_groups` (`code`, `label`, `position`, `created_at`)
SELECT 'compte-joint', 'Compte joint', (SELECT COALESCE(MAX(`position`), 0) + 1 FROM `category_groups`), strftime('%s','now')
WHERE EXISTS (SELECT 1 FROM `category_groups`);
--> statement-breakpoint
INSERT OR IGNORE INTO `category_items` (`code`, `group_code`, `label`, `nature`, `position`, `created_at`)
SELECT 'compte-joint-part-remboursee', 'compte-joint', 'Part remboursée', 'expense', 0, strftime('%s','now')
WHERE EXISTS (SELECT 1 FROM `category_groups` WHERE `code` = 'compte-joint');
--> statement-breakpoint
INSERT OR IGNORE INTO `category_items` (`code`, `group_code`, `label`, `nature`, `position`, `created_at`)
SELECT 'internes-virement-joint', 'internes', 'Virement du compte joint', 'internal_transfer', (SELECT COALESCE(MAX(`position`), 0) + 1 FROM `category_items` WHERE `group_code` = 'internes'), strftime('%s','now')
WHERE EXISTS (SELECT 1 FROM `category_groups` WHERE `code` = 'internes');
--> statement-breakpoint

-- ⚠️ Cette migration ne DÉPLACE aucun virement du joint sur le nouveau poste. C'est un choix :
-- ranger une ligne est un geste de l'utilisateur — une règle de classement le fait pour les 33
-- d'un coup — et non une migration de données. Tant qu'il ne l'a pas fait, la coupe ne s'applique
-- à rien et l'analyse est inchangée.

-- Trois virements de charges VERS le joint étaient rangés en « Virement entre comptes », alors
-- que leurs douze jumelles sont en dépense. Ils manquaient donc aux dépenses, pour 2 005 €.
-- Le ciblage est étroit — poste actuel, libellé, montant, date exacte — donc sans effet sur une autre
-- base, et idempotent : une seconde exécution ne trouve plus rien à corriger. Chaque UPDATE
-- vérifie que son poste de destination existe : `foreign_keys = ON`, et sur une base où
-- l'utilisateur l'aurait supprimé la migration échouerait, ne serait jamais enregistrée, et
-- bloquerait le démarrage en boucle (revue du 2026-09-08).
UPDATE `transactions` SET `category_item_code` = 'logement-charges'
WHERE `category_item_code` = 'internes-virement-comptes'
  AND `transaction_date` = '2025-05-06' AND `amount_cents` = -29850
  AND `label` LIKE '%charges%'
  AND EXISTS (SELECT 1 FROM `category_items` WHERE `code` = 'logement-charges');
--> statement-breakpoint
UPDATE `transactions` SET `category_item_code` = 'enfants-ecole-cantine'
WHERE `category_item_code` = 'internes-virement-comptes'
  AND `transaction_date` = '2025-05-06' AND `amount_cents` = -28650
  AND `label` LIKE '%charges%'
  AND EXISTS (SELECT 1 FROM `category_items` WHERE `code` = 'enfants-ecole-cantine');
--> statement-breakpoint
-- Le crédit d'impôt reversé au joint au titre des charges : une dépense, comme les autres.
UPDATE `transactions` SET `category_item_code` = 'logement-charges'
WHERE `category_item_code` = 'internes-virement-comptes'
  AND `transaction_date` = '2025-01-28' AND `amount_cents` = -142000
  AND `label` LIKE '%charges%'
  AND EXISTS (SELECT 1 FROM `category_items` WHERE `code` = 'logement-charges');
