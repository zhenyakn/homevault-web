-- Migration 0005
-- Idempotency is handled by the migrate.ts runner (ER_DUP_FIELDNAME is ignored).

-- 1. Add propertyId to wishlistItems
ALTER TABLE `wishlistItems` ADD COLUMN `propertyId` int NOT NULL DEFAULT 1;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS `wishlist_property_idx` ON `wishlistItems` (`propertyId`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `wishlist_owner_idx`    ON `wishlistItems` (`ownerId`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `wishlist_priority_idx` ON `wishlistItems` (`priority`);--> statement-breakpoint

-- 2. Create loanRepayments table
CREATE TABLE IF NOT EXISTS `loanRepayments` (
  `id`        varchar(36)  NOT NULL,
  `loanId`    varchar(36)  NOT NULL,
  `ownerId`   int          NOT NULL,
  `amount`    int          NOT NULL,
  `date`      varchar(20)  NOT NULL,
  `notes`     text,
  `receipt`   varchar(500),
  `createdAt` timestamp    NOT NULL DEFAULT (now()),
  CONSTRAINT `loanRepayments_id` PRIMARY KEY(`id`),
  CONSTRAINT `loanRepayments_loanId_loans_id_fk`
    FOREIGN KEY (`loanId`) REFERENCES `loans`(`id`) ON DELETE CASCADE,
  CONSTRAINT `loanRepayments_ownerId_users_id_fk`
    FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`)
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS `loanRepayment_loanId_idx` ON `loanRepayments` (`loanId`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `loanRepayment_owner_idx`  ON `loanRepayments` (`ownerId`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `loanRepayment_date_idx`   ON `loanRepayments` (`date`);
