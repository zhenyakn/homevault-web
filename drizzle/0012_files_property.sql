-- ── files.propertyId ─────────────────────────────────────────────────────────
-- Adds an optional property scope to the files registry. Lets the file-browser
-- UI filter by property, lets `deleteAllFilesForProperty` reap exactly the
-- right rows, and lets new Drive uploads sort into per-property subfolders.
--
-- Legacy rows (created before this column existed) stay NULL — they are still
-- reachable via the proxy URL, just not property-scoped in the browser.
ALTER TABLE `files` ADD COLUMN `propertyId` int DEFAULT NULL

--> statement-breakpoint

CREATE INDEX `files_property_idx` ON `files` (`propertyId`)
