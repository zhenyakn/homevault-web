-- ── Files registry + App settings ────────────────────────────────────────────
-- Adds a dedicated `files` table that catalogues every upload, regardless of
-- backend (S3 or Google Drive), plus a generic key/value `app_settings`
-- table used to persist the Google Drive refresh-token and the cached Drive
-- folder IDs (root + per-user "uploads/<uid>").

CREATE TABLE IF NOT EXISTS `app_settings` (
  `key`       varchar(64)  NOT NULL PRIMARY KEY,
  `value`     text         NOT NULL,
  `updatedAt` timestamp    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
)

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `files` (
  `id`           varchar(36)  NOT NULL PRIMARY KEY,
  `backend`      varchar(16)  NOT NULL,
  `externalId`   text         NOT NULL,
  `originalName` varchar(255) NOT NULL,
  `mimeType`     varchar(150) NOT NULL,
  `size`         int          NOT NULL DEFAULT 0,
  `ownerUserId`  int          NOT NULL,
  `createdAt`    timestamp    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `deletedAt`    timestamp    NULL,
  CONSTRAINT `files_owner_fk` FOREIGN KEY (`ownerUserId`) REFERENCES `users` (`id`),
  INDEX `files_owner_idx` (`ownerUserId`),
  INDEX `files_backend_idx` (`backend`)
)
