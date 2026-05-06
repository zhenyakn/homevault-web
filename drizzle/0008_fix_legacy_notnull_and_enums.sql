-- Migration 0008: Fix legacy NOT NULL constraints, enum values, and missing columns
--
-- Background: migration 0007 added new columns additively without:
--   a) removing NOT NULL from old columns (so new inserts omitting them fail)
--   b) expanding old enum columns to accept new values (so inserts with new enum values fail)
--   c) adding all new columns that the updated schema.ts expects (upgradeItems)
-- This migration corrects all three issues.

-- ── calendarEvents ────────────────────────────────────────────────────────────
-- createdById was NOT NULL — make nullable so rows can be inserted with only ownerId
ALTER TABLE `calendarEvents` MODIFY COLUMN `createdById` int DEFAULT NULL;
--> statement-breakpoint
-- eventType was NOT NULL — make nullable
ALTER TABLE `calendarEvents` MODIFY COLUMN `eventType` enum('Expense','Repair','Upgrade','Loan','Other') DEFAULT NULL;
--> statement-breakpoint

-- ── expenses ─────────────────────────────────────────────────────────────────
-- label was NOT NULL — make nullable
ALTER TABLE `expenses` MODIFY COLUMN `label` varchar(200) DEFAULT NULL;
--> statement-breakpoint
-- category was NOT NULL with old enum values — expand enum to include new values, make nullable
ALTER TABLE `expenses` MODIFY COLUMN `category` enum('Maintenance','Utilities','Insurance','Tax','Management','Renovation','Other','Mortgage','Utility') DEFAULT NULL;
--> statement-breakpoint
-- Migrate old category values to new ones
UPDATE `expenses` SET `category` = 'Other'     WHERE `category` = 'Mortgage';
--> statement-breakpoint
UPDATE `expenses` SET `category` = 'Utilities' WHERE `category` = 'Utility';
--> statement-breakpoint

-- ── repairs ──────────────────────────────────────────────────────────────────
-- label was NOT NULL — make nullable
ALTER TABLE `repairs` MODIFY COLUMN `label` varchar(200) DEFAULT NULL;
--> statement-breakpoint
-- dateLogged was NOT NULL — make nullable
ALTER TABLE `repairs` MODIFY COLUMN `dateLogged` varchar(20) DEFAULT NULL;
--> statement-breakpoint
-- priority had old enum values AND was NOT NULL — expand + add default
ALTER TABLE `repairs` MODIFY COLUMN `priority` enum('low','medium','high','urgent','Low','Medium','High','Critical') DEFAULT 'medium';
--> statement-breakpoint
-- status had old enum values AND was NOT NULL — expand + add default
ALTER TABLE `repairs` MODIFY COLUMN `status` enum('open','in_progress','waiting_for_parts','waiting_for_contractor','completed','cancelled','Pending','In Progress','Resolved') DEFAULT 'open';
--> statement-breakpoint
-- Migrate old status values
UPDATE `repairs` SET `status` = 'open'        WHERE `status` = 'Pending';
--> statement-breakpoint
UPDATE `repairs` SET `status` = 'in_progress' WHERE `status` = 'In Progress';
--> statement-breakpoint
UPDATE `repairs` SET `status` = 'completed'   WHERE `status` = 'Resolved';
--> statement-breakpoint
-- Migrate old priority values
UPDATE `repairs` SET `priority` = 'urgent' WHERE `priority` = 'Critical';
--> statement-breakpoint
UPDATE `repairs` SET `priority` = 'high'   WHERE `priority` = 'High';
--> statement-breakpoint
UPDATE `repairs` SET `priority` = 'medium' WHERE `priority` = 'Medium';
--> statement-breakpoint
UPDATE `repairs` SET `priority` = 'low'    WHERE `priority` = 'Low';
--> statement-breakpoint

-- ── repairQuotes ─────────────────────────────────────────────────────────────
-- contractorName was NOT NULL — make nullable (new schema uses `contractor` column)
ALTER TABLE `repairQuotes` MODIFY COLUMN `contractorName` varchar(200) DEFAULT NULL;
--> statement-breakpoint

-- ── upgrades ─────────────────────────────────────────────────────────────────
-- label was NOT NULL — make nullable
ALTER TABLE `upgrades` MODIFY COLUMN `label` varchar(200) DEFAULT NULL;
--> statement-breakpoint
-- budget was NOT NULL — make nullable
ALTER TABLE `upgrades` MODIFY COLUMN `budget` int DEFAULT NULL;
--> statement-breakpoint
-- status had old enum values AND was NOT NULL — expand + add default
ALTER TABLE `upgrades` MODIFY COLUMN `status` enum('idea','planning','in_progress','completed','cancelled','Planned','In Progress','Done') DEFAULT 'idea';
--> statement-breakpoint
-- Migrate old status values
UPDATE `upgrades` SET `status` = 'planning'    WHERE `status` = 'Planned';
--> statement-breakpoint
UPDATE `upgrades` SET `status` = 'in_progress' WHERE `status` = 'In Progress';
--> statement-breakpoint
UPDATE `upgrades` SET `status` = 'completed'   WHERE `status` = 'Done';
--> statement-breakpoint

-- ── upgradeOptions ───────────────────────────────────────────────────────────
-- name was NOT NULL — make nullable (new schema uses `title` column)
ALTER TABLE `upgradeOptions` MODIFY COLUMN `name` varchar(200) DEFAULT NULL;
--> statement-breakpoint

-- ── upgradeItems ─────────────────────────────────────────────────────────────
-- propertyId was NOT NULL — make nullable (new schema omits this column)
ALTER TABLE `upgradeItems` MODIFY COLUMN `propertyId` int DEFAULT NULL;
--> statement-breakpoint
-- ownerId was NOT NULL — make nullable (new schema omits this column)
ALTER TABLE `upgradeItems` MODIFY COLUMN `ownerId` int DEFAULT NULL;
--> statement-breakpoint
-- Add columns that schema.ts expects but were never added by migration 0007
ALTER TABLE `upgradeItems` ADD COLUMN `purchased` boolean DEFAULT false;
--> statement-breakpoint
ALTER TABLE `upgradeItems` ADD COLUMN `quantity` int DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `upgradeItems` ADD COLUMN `unit` varchar(50);
--> statement-breakpoint
ALTER TABLE `upgradeItems` ADD COLUMN `store` varchar(200);
--> statement-breakpoint

-- ── loans ─────────────────────────────────────────────────────────────────────
-- lender was NOT NULL — make nullable
ALTER TABLE `loans` MODIFY COLUMN `lender` varchar(200) DEFAULT NULL;
--> statement-breakpoint
-- totalAmount was NOT NULL — make nullable
ALTER TABLE `loans` MODIFY COLUMN `totalAmount` int DEFAULT NULL;
--> statement-breakpoint
-- startDate was NOT NULL — make nullable
ALTER TABLE `loans` MODIFY COLUMN `startDate` varchar(20) DEFAULT NULL;
--> statement-breakpoint
-- loanType had old enum values AND was NOT NULL — expand enum + make nullable
ALTER TABLE `loans` MODIFY COLUMN `loanType` enum('mortgage','heloc','personal','construction','other','Family','Bank','Friend','Other') DEFAULT NULL;
--> statement-breakpoint
-- Migrate old loanType values
UPDATE `loans` SET `loanType` = 'other'    WHERE `loanType` IN ('Family','Friend','Other');
--> statement-breakpoint
UPDATE `loans` SET `loanType` = 'mortgage' WHERE `loanType` = 'Bank';
--> statement-breakpoint

-- ── wishlistItems ─────────────────────────────────────────────────────────────
-- label was NOT NULL — make nullable
ALTER TABLE `wishlistItems` MODIFY COLUMN `label` varchar(200) DEFAULT NULL;
--> statement-breakpoint
-- estimatedCost was NOT NULL — make nullable
ALTER TABLE `wishlistItems` MODIFY COLUMN `estimatedCost` int DEFAULT NULL;
--> statement-breakpoint
-- priority had old enum values AND was NOT NULL — expand + add default
ALTER TABLE `wishlistItems` MODIFY COLUMN `priority` enum('low','medium','high','Low','Medium','High') DEFAULT 'medium';
--> statement-breakpoint
-- Migrate old priority values
UPDATE `wishlistItems` SET `priority` = 'high'   WHERE `priority` = 'High';
--> statement-breakpoint
UPDATE `wishlistItems` SET `priority` = 'medium' WHERE `priority` = 'Medium';
--> statement-breakpoint
UPDATE `wishlistItems` SET `priority` = 'low'    WHERE `priority` = 'Low';
--> statement-breakpoint

-- ── purchaseCosts ─────────────────────────────────────────────────────────────
-- label was NOT NULL — make nullable
ALTER TABLE `purchaseCosts` MODIFY COLUMN `label` varchar(200) DEFAULT NULL;
--> statement-breakpoint
-- date was NOT NULL — make nullable
ALTER TABLE `purchaseCosts` MODIFY COLUMN `date` varchar(20) DEFAULT NULL;
--> statement-breakpoint
