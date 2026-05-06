ALTER TABLE `calendarEvents` MODIFY COLUMN `createdById` int DEFAULT NULL;
--> statement-breakpoint
ALTER TABLE `calendarEvents` MODIFY COLUMN `eventType` enum('Expense','Repair','Upgrade','Loan','Other') DEFAULT NULL;
--> statement-breakpoint
ALTER TABLE `expenses` MODIFY COLUMN `label` varchar(200) DEFAULT NULL;
--> statement-breakpoint
ALTER TABLE `expenses` MODIFY COLUMN `category` enum('Maintenance','Utilities','Insurance','Tax','Management','Renovation','Other','Mortgage','Utility') DEFAULT NULL;
--> statement-breakpoint
UPDATE `expenses` SET `category` = 'Other' WHERE `category` = 'Mortgage';
--> statement-breakpoint
UPDATE `expenses` SET `category` = 'Utilities' WHERE `category` = 'Utility';
--> statement-breakpoint
ALTER TABLE `repairs` MODIFY COLUMN `label` varchar(200) DEFAULT NULL;
--> statement-breakpoint
ALTER TABLE `repairs` MODIFY COLUMN `dateLogged` varchar(20) DEFAULT NULL;
--> statement-breakpoint
ALTER TABLE `repairs` MODIFY COLUMN `priority` enum('low','medium','high','urgent') DEFAULT 'medium';
--> statement-breakpoint
ALTER TABLE `repairs` MODIFY COLUMN `status` enum('open','in_progress','waiting_for_parts','waiting_for_contractor','completed','cancelled','Pending','In Progress','Resolved') DEFAULT 'open';
--> statement-breakpoint
UPDATE `repairs` SET `status` = 'open' WHERE `status` = 'Pending';
--> statement-breakpoint
UPDATE `repairs` SET `status` = 'in_progress' WHERE `status` = 'In Progress';
--> statement-breakpoint
UPDATE `repairs` SET `status` = 'completed' WHERE `status` = 'Resolved';
--> statement-breakpoint
UPDATE `repairs` SET `priority` = 'urgent' WHERE `priority` = 'Critical';
--> statement-breakpoint
UPDATE `repairs` SET `priority` = 'high' WHERE `priority` = 'High';
--> statement-breakpoint
UPDATE `repairs` SET `priority` = 'medium' WHERE `priority` = 'Medium';
--> statement-breakpoint
UPDATE `repairs` SET `priority` = 'low' WHERE `priority` = 'Low';
--> statement-breakpoint
ALTER TABLE `repairQuotes` MODIFY COLUMN `contractorName` varchar(200) DEFAULT NULL;
--> statement-breakpoint
ALTER TABLE `upgrades` MODIFY COLUMN `label` varchar(200) DEFAULT NULL;
--> statement-breakpoint
ALTER TABLE `upgrades` MODIFY COLUMN `budget` int DEFAULT NULL;
--> statement-breakpoint
ALTER TABLE `upgrades` MODIFY COLUMN `status` enum('idea','planning','in_progress','completed','cancelled','Planned','In Progress','Done') DEFAULT 'idea';
--> statement-breakpoint
UPDATE `upgrades` SET `status` = 'planning' WHERE `status` = 'Planned';
--> statement-breakpoint
UPDATE `upgrades` SET `status` = 'in_progress' WHERE `status` = 'In Progress';
--> statement-breakpoint
UPDATE `upgrades` SET `status` = 'completed' WHERE `status` = 'Done';
--> statement-breakpoint
ALTER TABLE `upgradeOptions` MODIFY COLUMN `name` varchar(200) DEFAULT NULL;
--> statement-breakpoint
ALTER TABLE `upgradeItems` MODIFY COLUMN `propertyId` int DEFAULT NULL;
--> statement-breakpoint
ALTER TABLE `upgradeItems` MODIFY COLUMN `ownerId` int DEFAULT NULL;
--> statement-breakpoint
ALTER TABLE `upgradeItems` ADD COLUMN `purchased` boolean DEFAULT false;
--> statement-breakpoint
ALTER TABLE `upgradeItems` ADD COLUMN `quantity` int DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `upgradeItems` ADD COLUMN `unit` varchar(50);
--> statement-breakpoint
ALTER TABLE `upgradeItems` ADD COLUMN `store` varchar(200);
--> statement-breakpoint
ALTER TABLE `loans` MODIFY COLUMN `lender` varchar(200) DEFAULT NULL;
--> statement-breakpoint
ALTER TABLE `loans` MODIFY COLUMN `totalAmount` int DEFAULT NULL;
--> statement-breakpoint
ALTER TABLE `loans` MODIFY COLUMN `startDate` varchar(20) DEFAULT NULL;
--> statement-breakpoint
ALTER TABLE `loans` MODIFY COLUMN `loanType` enum('mortgage','heloc','personal','construction','other','Family','Bank','Friend') DEFAULT NULL;
--> statement-breakpoint
UPDATE `loans` SET `loanType` = 'other' WHERE `loanType` IN ('Family','Friend','Other');
--> statement-breakpoint
UPDATE `loans` SET `loanType` = 'mortgage' WHERE `loanType` = 'Bank';
--> statement-breakpoint
ALTER TABLE `wishlistItems` MODIFY COLUMN `label` varchar(200) DEFAULT NULL;
--> statement-breakpoint
ALTER TABLE `wishlistItems` MODIFY COLUMN `estimatedCost` int DEFAULT NULL;
--> statement-breakpoint
ALTER TABLE `wishlistItems` MODIFY COLUMN `priority` enum('low','medium','high') DEFAULT 'medium';
--> statement-breakpoint
UPDATE `wishlistItems` SET `priority` = 'high' WHERE `priority` = 'High';
--> statement-breakpoint
UPDATE `wishlistItems` SET `priority` = 'medium' WHERE `priority` = 'Medium';
--> statement-breakpoint
UPDATE `wishlistItems` SET `priority` = 'low' WHERE `priority` = 'Low';
--> statement-breakpoint
ALTER TABLE `purchaseCosts` MODIFY COLUMN `label` varchar(200) DEFAULT NULL;
--> statement-breakpoint
ALTER TABLE `purchaseCosts` MODIFY COLUMN `date` varchar(20) DEFAULT NULL;
