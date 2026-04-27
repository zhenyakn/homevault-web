ALTER TABLE `expenses` MODIFY COLUMN `attachments` json;--> statement-breakpoint
ALTER TABLE `loans` MODIFY COLUMN `repayments` json;--> statement-breakpoint
ALTER TABLE `purchaseCosts` MODIFY COLUMN `attachments` json;--> statement-breakpoint
ALTER TABLE `repairs` MODIFY COLUMN `attachments` json;--> statement-breakpoint
ALTER TABLE `upgrades` MODIFY COLUMN `attachments` json;