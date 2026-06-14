-- Apartment Search ("hunting") mode.
--
-- A standalone workspace for tracking the apartment-picking process before a
-- place is actually owned or rented. Rows are scoped to the user account
-- (userId), NOT to an active property — a candidate is not a property yet. A
-- winning candidate can later be converted into a real `properties` row; the
-- link is recorded in `apartmentCandidates.convertedPropertyId`.

CREATE TABLE IF NOT EXISTS `apartmentSearches` (
	`id` varchar(36) NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(200) NOT NULL,
	`searchType` enum('rent','buy') NOT NULL,
	`targetBudget` int,
	`currencyCode` varchar(10) DEFAULT 'ILS',
	`status` enum('active','completed','archived') DEFAULT 'active',
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `apartmentSearches_id` PRIMARY KEY(`id`)
);

CREATE INDEX `aptsearch_user_idx` ON `apartmentSearches` (`userId`);

CREATE TABLE IF NOT EXISTS `apartmentCandidates` (
	`id` varchar(36) NOT NULL,
	`searchId` varchar(36) NOT NULL,
	`userId` int NOT NULL,
	`title` varchar(200) NOT NULL,
	`address` text,
	`latitude` decimal(10,8),
	`longitude` decimal(11,8),
	`listingUrl` text,
	`price` int,
	`deposit` int,
	`squareMeters` int,
	`rooms` int,
	`floor` int,
	`yearBuilt` int,
	`parkingSpots` int,
	`hasElevator` tinyint(1) DEFAULT 0,
	`hasStorage` tinyint(1) DEFAULT 0,
	`availableDate` varchar(20),
	`agentName` varchar(200),
	`agentContact` varchar(200),
	`rating` int,
	`stage` enum('saved','viewing_scheduled','viewed','applied','accepted','rejected') NOT NULL DEFAULT 'saved',
	`pros` json,
	`cons` json,
	`notes` text,
	`attachments` json,
	`isFavorite` tinyint(1) DEFAULT 0,
	`convertedPropertyId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `apartmentCandidates_id` PRIMARY KEY(`id`),
	CONSTRAINT `aptcand_search_fk` FOREIGN KEY (`searchId`) REFERENCES `apartmentSearches`(`id`) ON DELETE CASCADE
);

CREATE INDEX `aptcand_search_idx` ON `apartmentCandidates` (`searchId`);
CREATE INDEX `aptcand_user_idx` ON `apartmentCandidates` (`userId`);
