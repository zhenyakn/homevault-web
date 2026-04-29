ALTER TABLE `properties` ADD `propertyType` varchar(50) DEFAULT 'Apartment';--> statement-breakpoint
ALTER TABLE `properties` ADD `remindExpenses` boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE `properties` ADD `remindLoans` boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE `properties` ADD `remindRepairs` boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE `properties` ADD `remindCalendar` boolean DEFAULT true;