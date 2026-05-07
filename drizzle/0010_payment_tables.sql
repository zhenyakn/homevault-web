-- ── Create relational payment tables ─────────────────────────────────────────
-- Replaces JSON arrays in loans.repayments, repairQuotes.payments,
-- upgradeOptions.payments with proper FK-linked tables.

CREATE TABLE IF NOT EXISTS `loanRepayments` (
  `id`        varchar(36)  NOT NULL PRIMARY KEY,
  `loanId`    varchar(36)  NOT NULL,
  `amount`    int          NOT NULL,
  `date`      varchar(20)  NOT NULL,
  `notes`     text,
  `createdAt` timestamp    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `lrep_loan_fk` FOREIGN KEY (`loanId`) REFERENCES `loans` (`id`) ON DELETE CASCADE,
  INDEX `lrep_loan_idx` (`loanId`)
)

--> statement-breakpoint

-- loanRepayments was first created by 0005 with ownerId NOT NULL (old schema).
-- Drop the FK and column so the table matches the current schema.ts definition.
ALTER TABLE `loanRepayments` DROP FOREIGN KEY `loanRepayments_ownerId_users_id_fk`

--> statement-breakpoint

ALTER TABLE `loanRepayments` DROP COLUMN `ownerId`

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `repairQuotePayments` (
  `id`        varchar(36)  NOT NULL PRIMARY KEY,
  `quoteId`   varchar(36)  NOT NULL,
  `amount`    int          NOT NULL,
  `date`      varchar(20)  NOT NULL,
  `notes`     text,
  `receipt`   text,
  `createdAt` timestamp    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `rqpay_quote_fk` FOREIGN KEY (`quoteId`) REFERENCES `repairQuotes` (`id`) ON DELETE CASCADE,
  INDEX `rqpay_quote_idx` (`quoteId`)
)

--> statement-breakpoint

-- Normalize upgradeOptions.id collation to match all other tables (0900_ai_ci → unicode_ci)
-- so the FK below is compatible. No existing FK references upgradeOptions.id yet.
ALTER TABLE `upgradeOptions`
  MODIFY COLUMN `id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `upgradeOptionPayments` (
  `id`        varchar(36)  NOT NULL PRIMARY KEY,
  `optionId`  varchar(36)  NOT NULL,
  `amount`    int          NOT NULL,
  `date`      varchar(20)  NOT NULL,
  `notes`     text,
  `receipt`   text,
  `createdAt` timestamp    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `uopay_option_fk` FOREIGN KEY (`optionId`) REFERENCES `upgradeOptions` (`id`) ON DELETE CASCADE,
  INDEX `uopay_option_idx` (`optionId`)
)

--> statement-breakpoint

-- ── Migrate existing JSON data into the new tables ────────────────────────────
-- Uses JSON_TABLE (MySQL 8+). Skips null/empty arrays automatically.

INSERT IGNORE INTO `loanRepayments` (`id`, `loanId`, `amount`, `date`, `notes`, `createdAt`)
SELECT
  UUID(),
  l.`id`,
  CAST(jt.`amount` AS SIGNED),
  COALESCE(jt.`date`, DATE_FORMAT(NOW(), '%Y-%m-%d')),
  jt.`notes`,
  NOW()
FROM `loans` l,
JSON_TABLE(
  COALESCE(l.`repayments`, '[]'),
  '$[*]' COLUMNS (
    `amount` INT       PATH '$.amount',
    `date`   VARCHAR(20) PATH '$.date',
    `notes`  TEXT      PATH '$.notes'
  )
) AS jt
WHERE JSON_LENGTH(COALESCE(l.`repayments`, '[]')) > 0
  AND jt.`amount` IS NOT NULL

--> statement-breakpoint

INSERT IGNORE INTO `repairQuotePayments` (`id`, `quoteId`, `amount`, `date`, `notes`, `receipt`, `createdAt`)
SELECT
  UUID(),
  rq.`id`,
  CAST(jt.`amount` AS SIGNED),
  COALESCE(jt.`date`, DATE_FORMAT(NOW(), '%Y-%m-%d')),
  jt.`notes`,
  jt.`receipt`,
  NOW()
FROM `repairQuotes` rq,
JSON_TABLE(
  COALESCE(rq.`payments`, '[]'),
  '$[*]' COLUMNS (
    `amount`  INT        PATH '$.amount',
    `date`    VARCHAR(20) PATH '$.date',
    `notes`   TEXT       PATH '$.notes',
    `receipt` TEXT       PATH '$.receipt'
  )
) AS jt
WHERE JSON_LENGTH(COALESCE(rq.`payments`, '[]')) > 0
  AND jt.`amount` IS NOT NULL

--> statement-breakpoint

INSERT IGNORE INTO `upgradeOptionPayments` (`id`, `optionId`, `amount`, `date`, `notes`, `receipt`, `createdAt`)
SELECT
  UUID(),
  uo.`id`,
  CAST(jt.`amount` AS SIGNED),
  COALESCE(jt.`date`, DATE_FORMAT(NOW(), '%Y-%m-%d')),
  jt.`notes`,
  jt.`receipt`,
  NOW()
FROM `upgradeOptions` uo,
JSON_TABLE(
  COALESCE(uo.`payments`, '[]'),
  '$[*]' COLUMNS (
    `amount`  INT        PATH '$.amount',
    `date`    VARCHAR(20) PATH '$.date',
    `notes`   TEXT       PATH '$.notes',
    `receipt` TEXT       PATH '$.receipt'
  )
) AS jt
WHERE JSON_LENGTH(COALESCE(uo.`payments`, '[]')) > 0
  AND jt.`amount` IS NOT NULL

--> statement-breakpoint

-- ── Drop the now-redundant JSON columns ───────────────────────────────────────

ALTER TABLE `loans`          DROP COLUMN `repayments`

--> statement-breakpoint

ALTER TABLE `repairQuotes`   DROP COLUMN `payments`

--> statement-breakpoint

ALTER TABLE `upgradeOptions` DROP COLUMN `payments`
