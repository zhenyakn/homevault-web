-- Scope the in-app notification feed to a property. `propertyId` is nullable:
-- NULL means "global" (system/test sends, or legacy rows logged before scoping)
-- and shows under every property; a set value scopes the row to one property so
-- the demo / mock property's reminders don't leak into a real property's feed.
-- The convergence runner ignores duplicate-column / duplicate-index errors, so
-- plain DDL is used here and re-running stays safe.

ALTER TABLE `notification_log` ADD COLUMN `propertyId` int;
--> statement-breakpoint
CREATE INDEX `notif_log_property_idx` ON `notification_log` (`propertyId`);
