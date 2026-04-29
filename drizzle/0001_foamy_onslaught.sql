CREATE TABLE `calendarEvents` (
	`id` varchar(36) NOT NULL,
	`title` varchar(200) NOT NULL,
	`date` varchar(20) NOT NULL,
	`time` varchar(20),
	`eventType` enum('Expense','Repair','Upgrade','Loan','Other') NOT NULL,
	`createdById` int NOT NULL,
	`linkedEntityId` varchar(36),
	`linkedEntityType` enum('Expense','Repair','Upgrade','Loan','PurchaseCost'),
	`synced` boolean DEFAULT false,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `calendarEvents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `expenses` (
	`id` varchar(36) NOT NULL,
	`label` varchar(200) NOT NULL,
	`amount` int NOT NULL,
	`date` varchar(20) NOT NULL,
	`category` enum('Mortgage','Utility','Insurance','Tax','Maintenance','Other') NOT NULL,
	`ownerId` int NOT NULL,
	`isRecurring` boolean DEFAULT false,
	`recurringFrequency` enum('Monthly','Quarterly','Annual'),
	`isPaid` boolean DEFAULT false,
	`paidDate` varchar(20),
	`attachments` json,
	`notes` text,
	`calendarEventId` varchar(36),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `expenses_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `loans` (
	`id` varchar(36) NOT NULL,
	`lender` varchar(200) NOT NULL,
	`totalAmount` int NOT NULL,
	`loanType` enum('Family','Bank','Friend','Other') NOT NULL,
	`interestRate` decimal(5,2) DEFAULT '0',
	`startDate` varchar(20) NOT NULL,
	`dueDate` varchar(20),
	`ownerId` int NOT NULL,
	`repayments` json,
	`notes` text,
	`calendarEventId` varchar(36),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `loans_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `properties` (
	`id` int NOT NULL DEFAULT 1,
	`houseName` varchar(200) DEFAULT 'My Home',
	`houseNickname` varchar(200),
	`address` text,
	`latitude` decimal(10,8),
	`longitude` decimal(11,8),
	`purchaseDate` varchar(20),
	`purchasePrice` int,
	`squareMeters` int,
	`rooms` int,
	`yearBuilt` int,
	`floor` int,
	`parkingSpots` int,
	`hasStorage` boolean DEFAULT false,
	`currency` varchar(10) DEFAULT '₪',
	`currencyCode` varchar(10) DEFAULT 'ILS',
	`timezone` varchar(50) DEFAULT 'Asia/Jerusalem',
	`startOfWeek` varchar(20) DEFAULT 'Sunday',
	`reminderDaysBefore` int DEFAULT 3,
	`calendarSyncEnabled` boolean DEFAULT false,
	`mapsProvider` varchar(20) DEFAULT 'google',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `properties_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `purchaseCosts` (
	`id` varchar(36) NOT NULL,
	`label` varchar(200) NOT NULL,
	`amount` int NOT NULL,
	`date` varchar(20) NOT NULL,
	`category` varchar(100),
	`ownerId` int NOT NULL,
	`attachments` json,
	`notes` text,
	`calendarEventId` varchar(36),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `purchaseCosts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `repairs` (
	`id` varchar(36) NOT NULL,
	`label` varchar(200) NOT NULL,
	`description` text,
	`priority` enum('Low','Medium','High','Critical') NOT NULL,
	`status` enum('Pending','In Progress','Resolved') NOT NULL,
	`dateLogged` varchar(20) NOT NULL,
	`contractor` varchar(200),
	`contractorPhone` varchar(20),
	`estimatedCost` int,
	`actualCost` int,
	`ownerId` int NOT NULL,
	`attachments` json,
	`notes` text,
	`calendarEventId` varchar(36),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `repairs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `upgrades` (
	`id` varchar(36) NOT NULL,
	`label` varchar(200) NOT NULL,
	`description` text,
	`status` enum('Planned','In Progress','Done') NOT NULL,
	`budget` int NOT NULL,
	`spent` int DEFAULT 0,
	`ownerId` int NOT NULL,
	`attachments` json,
	`notes` text,
	`calendarEventId` varchar(36),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `upgrades_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `wishlistItems` (
	`id` varchar(36) NOT NULL,
	`label` varchar(200) NOT NULL,
	`description` text,
	`estimatedCost` int NOT NULL,
	`priority` enum('Low','Medium','High') NOT NULL,
	`ownerId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `wishlistItems_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `calendarEvents` ADD CONSTRAINT `calendarEvents_createdById_users_id_fk` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `expenses` ADD CONSTRAINT `expenses_ownerId_users_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `loans` ADD CONSTRAINT `loans_ownerId_users_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `purchaseCosts` ADD CONSTRAINT `purchaseCosts_ownerId_users_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `repairs` ADD CONSTRAINT `repairs_ownerId_users_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `upgrades` ADD CONSTRAINT `upgrades_ownerId_users_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `wishlistItems` ADD CONSTRAINT `wishlistItems_ownerId_users_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `calendar_date_idx` ON `calendarEvents` (`date`);--> statement-breakpoint
CREATE INDEX `calendar_created_by_idx` ON `calendarEvents` (`createdById`);--> statement-breakpoint
CREATE INDEX `expense_date_idx` ON `expenses` (`date`);--> statement-breakpoint
CREATE INDEX `expense_owner_idx` ON `expenses` (`ownerId`);--> statement-breakpoint
CREATE INDEX `expense_category_idx` ON `expenses` (`category`);--> statement-breakpoint
CREATE INDEX `loan_owner_idx` ON `loans` (`ownerId`);--> statement-breakpoint
CREATE INDEX `purchase_cost_date_idx` ON `purchaseCosts` (`date`);--> statement-breakpoint
CREATE INDEX `purchase_cost_owner_idx` ON `purchaseCosts` (`ownerId`);--> statement-breakpoint
CREATE INDEX `repair_status_idx` ON `repairs` (`status`);--> statement-breakpoint
CREATE INDEX `repair_priority_idx` ON `repairs` (`priority`);--> statement-breakpoint
CREATE INDEX `repair_owner_idx` ON `repairs` (`ownerId`);--> statement-breakpoint
CREATE INDEX `upgrade_status_idx` ON `upgrades` (`status`);--> statement-breakpoint
CREATE INDEX `upgrade_owner_idx` ON `upgrades` (`ownerId`);--> statement-breakpoint
CREATE INDEX `wishlist_priority_idx` ON `wishlistItems` (`priority`);--> statement-breakpoint
CREATE INDEX `wishlist_owner_idx` ON `wishlistItems` (`ownerId`);--> statement-breakpoint
