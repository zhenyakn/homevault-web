CREATE TABLE `loanRepayments` (
	`id` varchar(36) NOT NULL,
	`loanId` varchar(36) NOT NULL,
	`ownerId` int NOT NULL,
	`amount` int NOT NULL,
	`date` varchar(20) NOT NULL,
	`notes` text,
	`receipt` varchar(500),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `loanRepayments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `repairQuotes` (
	`id` varchar(36) NOT NULL,
	`repairId` varchar(36) NOT NULL,
	`contractorName` varchar(200) NOT NULL,
	`contractorPhone` varchar(30),
	`quotedPrice` int,
	`timeline` varchar(100),
	`guarantee` varchar(100),
	`scope` text,
	`isSelected` boolean DEFAULT false,
	`notes` text,
	`payments` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `repairQuotes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `upgradeItems` (
	`id` varchar(36) NOT NULL,
	`upgradeId` varchar(36) NOT NULL,
	`propertyId` int NOT NULL,
	`ownerId` int NOT NULL,
	`name` varchar(200) NOT NULL,
	`vendorName` varchar(200),
	`estimatedCost` int,
	`actualCost` int,
	`status` enum('Need to find','Researching','Quoted','Ordered','Delivered','Installed') DEFAULT 'Need to find',
	`eta` varchar(20),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `upgradeItems_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `upgradeOptions` (
	`id` varchar(36) NOT NULL,
	`upgradeId` varchar(36) NOT NULL,
	`name` varchar(200) NOT NULL,
	`vendorPhone` varchar(30),
	`totalPrice` int,
	`timeline` varchar(100),
	`warranty` varchar(100),
	`scope` text,
	`isSelected` boolean DEFAULT false,
	`notes` text,
	`payments` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `upgradeOptions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `properties` MODIFY COLUMN `id` int AUTO_INCREMENT NOT NULL;--> statement-breakpoint
ALTER TABLE `calendarEvents` ADD `propertyId` int NOT NULL;--> statement-breakpoint
ALTER TABLE `expenses` ADD `propertyId` int NOT NULL;--> statement-breakpoint
ALTER TABLE `loans` ADD `propertyId` int NOT NULL;--> statement-breakpoint
ALTER TABLE `properties` ADD `userId` int NOT NULL;--> statement-breakpoint
ALTER TABLE `purchaseCosts` ADD `propertyId` int NOT NULL;--> statement-breakpoint
ALTER TABLE `repairs` ADD `phase` enum('Assessment','Quoting','Scheduled','In Progress','Resolved') DEFAULT 'Assessment';--> statement-breakpoint
ALTER TABLE `repairs` ADD `propertyId` int NOT NULL;--> statement-breakpoint
ALTER TABLE `upgrades` ADD `phase` enum('Planning','Sourcing','Building','Done') DEFAULT 'Planning';--> statement-breakpoint
ALTER TABLE `upgrades` ADD `propertyId` int NOT NULL;--> statement-breakpoint
ALTER TABLE `wishlistItems` ADD `propertyId` int NOT NULL;--> statement-breakpoint
ALTER TABLE `wishlistItems` ADD `attachments` json;--> statement-breakpoint
ALTER TABLE `loanRepayments` ADD CONSTRAINT `loanRepayments_loanId_loans_id_fk` FOREIGN KEY (`loanId`) REFERENCES `loans`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `loanRepayments` ADD CONSTRAINT `loanRepayments_ownerId_users_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `repairQuotes` ADD CONSTRAINT `repairQuotes_repairId_repairs_id_fk` FOREIGN KEY (`repairId`) REFERENCES `repairs`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `upgradeItems` ADD CONSTRAINT `upgradeItems_upgradeId_upgrades_id_fk` FOREIGN KEY (`upgradeId`) REFERENCES `upgrades`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `upgradeItems` ADD CONSTRAINT `upgradeItems_propertyId_properties_id_fk` FOREIGN KEY (`propertyId`) REFERENCES `properties`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `upgradeItems` ADD CONSTRAINT `upgradeItems_ownerId_users_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `upgradeOptions` ADD CONSTRAINT `upgradeOptions_upgradeId_upgrades_id_fk` FOREIGN KEY (`upgradeId`) REFERENCES `upgrades`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `loanRepayment_loanId_idx` ON `loanRepayments` (`loanId`);--> statement-breakpoint
CREATE INDEX `loanRepayment_owner_idx` ON `loanRepayments` (`ownerId`);--> statement-breakpoint
CREATE INDEX `loanRepayment_date_idx` ON `loanRepayments` (`date`);--> statement-breakpoint
CREATE INDEX `repairQuote_repairId_idx` ON `repairQuotes` (`repairId`);--> statement-breakpoint
CREATE INDEX `upgradeItem_upgradeId_idx` ON `upgradeItems` (`upgradeId`);--> statement-breakpoint
CREATE INDEX `upgradeItem_propertyId_idx` ON `upgradeItems` (`propertyId`);--> statement-breakpoint
CREATE INDEX `upgradeItem_owner_idx` ON `upgradeItems` (`ownerId`);--> statement-breakpoint
CREATE INDEX `upgradeOption_upgradeId_idx` ON `upgradeOptions` (`upgradeId`);--> statement-breakpoint
ALTER TABLE `calendarEvents` ADD CONSTRAINT `calendarEvents_propertyId_properties_id_fk` FOREIGN KEY (`propertyId`) REFERENCES `properties`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `expenses` ADD CONSTRAINT `expenses_propertyId_properties_id_fk` FOREIGN KEY (`propertyId`) REFERENCES `properties`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `loans` ADD CONSTRAINT `loans_propertyId_properties_id_fk` FOREIGN KEY (`propertyId`) REFERENCES `properties`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `properties` ADD CONSTRAINT `properties_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `purchaseCosts` ADD CONSTRAINT `purchaseCosts_propertyId_properties_id_fk` FOREIGN KEY (`propertyId`) REFERENCES `properties`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `repairs` ADD CONSTRAINT `repairs_propertyId_properties_id_fk` FOREIGN KEY (`propertyId`) REFERENCES `properties`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `upgrades` ADD CONSTRAINT `upgrades_propertyId_properties_id_fk` FOREIGN KEY (`propertyId`) REFERENCES `properties`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `wishlistItems` ADD CONSTRAINT `wishlistItems_propertyId_properties_id_fk` FOREIGN KEY (`propertyId`) REFERENCES `properties`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `calendar_property_idx` ON `calendarEvents` (`propertyId`);--> statement-breakpoint
CREATE INDEX `expense_property_idx` ON `expenses` (`propertyId`);--> statement-breakpoint
CREATE INDEX `loan_property_idx` ON `loans` (`propertyId`);--> statement-breakpoint
CREATE INDEX `purchase_cost_property_idx` ON `purchaseCosts` (`propertyId`);--> statement-breakpoint
CREATE INDEX `repair_property_idx` ON `repairs` (`propertyId`);--> statement-breakpoint
CREATE INDEX `upgrade_property_idx` ON `upgrades` (`propertyId`);--> statement-breakpoint
CREATE INDEX `wishlist_property_idx` ON `wishlistItems` (`propertyId`);