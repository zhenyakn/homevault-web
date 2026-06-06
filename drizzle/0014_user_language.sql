-- Preferred UI language per user; also drives the language of outbound
-- notifications (reminders, test sends) delivered by the server.
ALTER TABLE `users` ADD `language` varchar(8) DEFAULT 'en';
