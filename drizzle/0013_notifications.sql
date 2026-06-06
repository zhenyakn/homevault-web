-- Notifications: channel destinations on users + prefs/log/webpush/link tables.
-- The runner (scripts/migrate.ts) ignores duplicate-column / duplicate-index
-- errors, so plain DDL is used here and re-running stays safe.

ALTER TABLE `users` ADD COLUMN `telegramChatId` varchar(64);
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `whatsappPhone` varchar(32);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `notification_prefs` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `userId` int NOT NULL,
  `channel` enum('inapp','push','email','webpush','telegram','whatsapp') NOT NULL,
  `enabled` tinyint(1) NOT NULL DEFAULT 1,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX `notif_prefs_user_channel_idx` ON `notification_prefs` (`userId`, `channel`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `notification_log` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `userId` int NOT NULL,
  `channel` enum('inapp','push','email','webpush','telegram','whatsapp') NOT NULL,
  `category` enum('expense','loan','repair','warranty','calendar','system') NOT NULL,
  `title` varchar(300) NOT NULL,
  `body` text NOT NULL,
  `url` varchar(500),
  `dedupeKey` varchar(200) NOT NULL,
  `status` enum('sent','failed','skipped') NOT NULL,
  `reason` varchar(300),
  `readAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX `notif_log_user_idx` ON `notification_log` (`userId`);
--> statement-breakpoint
CREATE INDEX `notif_log_dedupe_idx` ON `notification_log` (`userId`, `dedupeKey`, `channel`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `web_push_subscriptions` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `userId` int NOT NULL,
  `endpoint` varchar(512) NOT NULL UNIQUE,
  `p256dh` varchar(255) NOT NULL,
  `auth` varchar(255) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX `web_push_user_idx` ON `web_push_subscriptions` (`userId`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `bot_link_codes` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `userId` int NOT NULL,
  `code` varchar(32) NOT NULL UNIQUE,
  `expiresAt` timestamp NOT NULL,
  `consumedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX `bot_link_code_idx` ON `bot_link_codes` (`code`);
