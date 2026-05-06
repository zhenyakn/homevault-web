ALTER TABLE `expenses` ADD COLUMN `isPaid` boolean DEFAULT false;
--> statement-breakpoint
ALTER TABLE `expenses` ADD COLUMN `paidDate` varchar(20);
