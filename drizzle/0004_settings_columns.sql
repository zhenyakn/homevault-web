-- Migration 0004: add propertyType + per-event notification toggles to properties
-- These are all nullable with defaults so safe to add to existing rows.

ALTER TABLE `properties`
  ADD COLUMN IF NOT EXISTS `propertyType`   varchar(50)  DEFAULT 'Apartment',
  ADD COLUMN IF NOT EXISTS `remindExpenses` boolean      DEFAULT true,
  ADD COLUMN IF NOT EXISTS `remindLoans`    boolean      DEFAULT true,
  ADD COLUMN IF NOT EXISTS `remindRepairs`  boolean      DEFAULT true,
  ADD COLUMN IF NOT EXISTS `remindCalendar` boolean      DEFAULT true;
