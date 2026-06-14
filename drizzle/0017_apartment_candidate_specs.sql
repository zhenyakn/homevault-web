-- Apartment candidates: capture the same technical details as real properties
-- (propertyType + floors + gardenSize) so a converted candidate carries them
-- onto the new property. Other spec columns (squareMeters, rooms, floor,
-- yearBuilt, parkingSpots, hasElevator, hasStorage) already exist from 0016.

ALTER TABLE `apartmentCandidates` ADD `propertyType` varchar(50) DEFAULT 'Apartment';
ALTER TABLE `apartmentCandidates` ADD `floors` int;
ALTER TABLE `apartmentCandidates` ADD `gardenSize` int;
