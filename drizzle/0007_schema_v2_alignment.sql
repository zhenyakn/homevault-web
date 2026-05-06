ALTER TABLE `upgradeItems` DROP FOREIGN KEY `upgradeItems_upgradeId_upgrades_id_fk`;
--> statement-breakpoint
ALTER TABLE `upgradeOptions` DROP FOREIGN KEY `upgradeOptions_upgradeId_upgrades_id_fk`;
--> statement-breakpoint
ALTER TABLE `upgrades` MODIFY COLUMN `id` varchar(36) NOT NULL;
--> statement-breakpoint
ALTER TABLE `upgradeItems` ADD CONSTRAINT `upgradeItems_upgradeId_upgrades_id_fk` FOREIGN KEY (`upgradeId`) REFERENCES `upgrades`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;
--> statement-breakpoint
ALTER TABLE `upgradeOptions` ADD CONSTRAINT `upgradeOptions_upgradeId_upgrades_id_fk` FOREIGN KEY (`upgradeId`) REFERENCES `upgrades`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;
--> statement-breakpoint
ALTER TABLE `calendarEvents` ADD COLUMN `ownerId` int NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `calendarEvents` ADD COLUMN `description` text;
--> statement-breakpoint
ALTER TABLE `calendarEvents` ADD COLUMN `endDate` varchar(20);
--> statement-breakpoint
ALTER TABLE `calendarEvents` ADD COLUMN `category` enum('Maintenance','Payment','Inspection','Renovation','Legal','Other');
--> statement-breakpoint
ALTER TABLE `calendarEvents` ADD COLUMN `isRecurring` boolean DEFAULT false;
--> statement-breakpoint
ALTER TABLE `calendarEvents` ADD COLUMN `recurringInterval` enum('monthly','quarterly','yearly');
--> statement-breakpoint
ALTER TABLE `calendarEvents` ADD COLUMN `reminderDaysBefore` int;
--> statement-breakpoint
ALTER TABLE `calendarEvents` ADD COLUMN `externalCalendarId` varchar(200);
--> statement-breakpoint
ALTER TABLE `calendarEvents` ADD CONSTRAINT `calendarEvents_ownerId_users_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
--> statement-breakpoint
CREATE INDEX `calendar_owner_idx` ON `calendarEvents` (`ownerId`);
--> statement-breakpoint
ALTER TABLE `expenses` ADD COLUMN `name` varchar(200);
--> statement-breakpoint
ALTER TABLE `expenses` ADD COLUMN `nextDueDate` varchar(20);
--> statement-breakpoint
ALTER TABLE `expenses` ADD COLUMN `recurringInterval` enum('monthly','quarterly','yearly');
--> statement-breakpoint
ALTER TABLE `expenses` ADD COLUMN `attachments` json;
--> statement-breakpoint
UPDATE `expenses` SET `name` = `label` WHERE `name` IS NULL AND `label` IS NOT NULL;
--> statement-breakpoint
ALTER TABLE `repairs` ADD COLUMN `title` varchar(200);
--> statement-breakpoint
ALTER TABLE `repairs` ADD COLUMN `category` enum('Plumbing','Electrical','HVAC','Structural','Appliance','Cosmetic','Other');
--> statement-breakpoint
ALTER TABLE `repairs` ADD COLUMN `reportedDate` varchar(20);
--> statement-breakpoint
ALTER TABLE `repairs` ADD COLUMN `completedDate` varchar(20);
--> statement-breakpoint
ALTER TABLE `repairs` ADD COLUMN `cost` int;
--> statement-breakpoint
UPDATE `repairs` SET `title` = `label` WHERE `title` IS NULL AND `label` IS NOT NULL;
--> statement-breakpoint
ALTER TABLE `repairQuotes` ADD COLUMN `contractor` varchar(200);
--> statement-breakpoint
ALTER TABLE `repairQuotes` ADD COLUMN `amount` int;
--> statement-breakpoint
ALTER TABLE `repairQuotes` ADD COLUMN `date` varchar(20);
--> statement-breakpoint
ALTER TABLE `repairQuotes` ADD COLUMN `selected` boolean DEFAULT false;
--> statement-breakpoint
UPDATE `repairQuotes` SET `contractor` = `contractorName`, `amount` = `quotedPrice`, `selected` = `isSelected` WHERE `contractor` IS NULL AND `contractorName` IS NOT NULL;
--> statement-breakpoint
ALTER TABLE `upgrades` ADD COLUMN `title` varchar(200);
--> statement-breakpoint
ALTER TABLE `upgrades` ADD COLUMN `category` enum('Kitchen','Bathroom','Bedroom','Living Room','Outdoor','Structural','Technology','Other');
--> statement-breakpoint
ALTER TABLE `upgrades` ADD COLUMN `priority` enum('low','medium','high') DEFAULT 'medium';
--> statement-breakpoint
ALTER TABLE `upgrades` ADD COLUMN `estimatedCost` int;
--> statement-breakpoint
ALTER TABLE `upgrades` ADD COLUMN `actualCost` int;
--> statement-breakpoint
ALTER TABLE `upgrades` ADD COLUMN `startDate` varchar(20);
--> statement-breakpoint
ALTER TABLE `upgrades` ADD COLUMN `completedDate` varchar(20);
--> statement-breakpoint
ALTER TABLE `upgrades` ADD COLUMN `contractor` varchar(200);
--> statement-breakpoint
ALTER TABLE `upgrades` ADD COLUMN `roiEstimate` int;
--> statement-breakpoint
UPDATE `upgrades` SET `title` = `label` WHERE `title` IS NULL AND `label` IS NOT NULL;
--> statement-breakpoint
ALTER TABLE `upgradeOptions` ADD COLUMN `title` varchar(200);
--> statement-breakpoint
ALTER TABLE `upgradeOptions` ADD COLUMN `description` text;
--> statement-breakpoint
ALTER TABLE `upgradeOptions` ADD COLUMN `estimatedCost` int;
--> statement-breakpoint
ALTER TABLE `upgradeOptions` ADD COLUMN `pros` json;
--> statement-breakpoint
ALTER TABLE `upgradeOptions` ADD COLUMN `cons` json;
--> statement-breakpoint
ALTER TABLE `upgradeOptions` ADD COLUMN `selected` boolean DEFAULT false;
--> statement-breakpoint
UPDATE `upgradeOptions` SET `title` = `name`, `estimatedCost` = `totalPrice`, `selected` = `isSelected` WHERE `title` IS NULL AND `name` IS NOT NULL;
--> statement-breakpoint
ALTER TABLE `loans` ADD COLUMN `name` varchar(200);
--> statement-breakpoint
ALTER TABLE `loans` ADD COLUMN `originalAmount` int;
--> statement-breakpoint
ALTER TABLE `loans` ADD COLUMN `currentBalance` int;
--> statement-breakpoint
ALTER TABLE `loans` ADD COLUMN `monthlyPayment` int;
--> statement-breakpoint
ALTER TABLE `loans` ADD COLUMN `endDate` varchar(20);
--> statement-breakpoint
ALTER TABLE `loans` ADD COLUMN `nextPaymentDate` varchar(20);
--> statement-breakpoint
UPDATE `loans` SET `name` = `lender`, `originalAmount` = `totalAmount`, `currentBalance` = `totalAmount` WHERE `name` IS NULL AND `lender` IS NOT NULL;
--> statement-breakpoint
ALTER TABLE `wishlistItems` ADD COLUMN `name` varchar(200);
--> statement-breakpoint
ALTER TABLE `wishlistItems` ADD COLUMN `category` enum('Furniture','Appliance','Electronics','Decor','Renovation','Other');
--> statement-breakpoint
ALTER TABLE `wishlistItems` ADD COLUMN `estimatedPrice` int;
--> statement-breakpoint
ALTER TABLE `wishlistItems` ADD COLUMN `status` enum('wanted','saved','purchased') DEFAULT 'wanted';
--> statement-breakpoint
ALTER TABLE `wishlistItems` ADD COLUMN `url` text;
--> statement-breakpoint
UPDATE `wishlistItems` SET `name` = `label`, `estimatedPrice` = `estimatedCost` WHERE `name` IS NULL AND `label` IS NOT NULL;
--> statement-breakpoint
ALTER TABLE `purchaseCosts` ADD COLUMN `name` varchar(200);
--> statement-breakpoint
UPDATE `purchaseCosts` SET `name` = `label` WHERE `name` IS NULL AND `label` IS NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `inventoryItems` (`id` varchar(36) NOT NULL, `propertyId` int NOT NULL, `ownerId` int NOT NULL, `name` varchar(200) NOT NULL, `sku` varchar(100), `category` enum('Appliance','Furniture','Electronics','Consumable','Tool','Valuable','Other') DEFAULT 'Other', `room` varchar(100), `quantity` int NOT NULL DEFAULT 1, `minQuantity` int DEFAULT 0, `unit` varchar(50), `purchasePrice` int, `purchaseDate` varchar(20), `brand` varchar(200), `store` varchar(200), `warrantyExpiry` varchar(20), `condition` enum('New','Good','Fair','Poor') DEFAULT 'Good', `notes` text, `tags` json, `photoUrl` text, `serialNumber` varchar(200), `createdAt` timestamp NOT NULL DEFAULT (now()), `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP, CONSTRAINT `inventoryItems_id` PRIMARY KEY (`id`));
--> statement-breakpoint
ALTER TABLE `inventoryItems` ADD CONSTRAINT `inventoryItems_propertyId_fk` FOREIGN KEY (`propertyId`) REFERENCES `properties`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
--> statement-breakpoint
ALTER TABLE `inventoryItems` ADD CONSTRAINT `inventoryItems_ownerId_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
--> statement-breakpoint
CREATE INDEX `inventoryItem_property_idx` ON `inventoryItems` (`propertyId`);
--> statement-breakpoint
CREATE INDEX `inventoryItem_owner_idx` ON `inventoryItems` (`ownerId`);
--> statement-breakpoint
CREATE INDEX `inventoryItem_category_idx` ON `inventoryItems` (`category`);
--> statement-breakpoint
CREATE INDEX `inventoryItem_room_idx` ON `inventoryItems` (`room`);
