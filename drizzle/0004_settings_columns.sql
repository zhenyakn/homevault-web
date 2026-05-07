-- Migration 0004: add propertyType + per-event notification toggles to properties
-- These are all nullable with defaults so safe to add to existing rows.

ALTER TABLE `properties` ADD COLUMN `propertyType`   varchar(50)  DEFAULT 'Apartment';--> statement-breakpoint
ALTER TABLE `properties` ADD COLUMN `remindExpenses` boolean      DEFAULT true;--> statement-breakpoint
ALTER TABLE `properties` ADD COLUMN `remindLoans`    boolean      DEFAULT true;--> statement-breakpoint
ALTER TABLE `properties` ADD COLUMN `remindRepairs`  boolean      DEFAULT true;--> statement-breakpoint
ALTER TABLE `properties` ADD COLUMN `remindCalendar` boolean      DEFAULT true;
