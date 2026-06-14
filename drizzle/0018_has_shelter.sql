-- Add a "shelter" (protected space / safe room — ממ״ד) boolean, mirroring the
-- existing storage flag, on both real properties and apartment-search candidates.

ALTER TABLE `properties` ADD `hasShelter` tinyint(1) DEFAULT 0;
ALTER TABLE `apartmentCandidates` ADD `hasShelter` tinyint(1) DEFAULT 0;
