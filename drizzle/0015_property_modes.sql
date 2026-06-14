-- Property "tenure" modes + rental terms. Lets a property be modelled as
-- bought-and-rented-out (landlord), bought-for-personal-use, or rented (tenant),
-- and carries the lease/rent fields the rental modes need. Existing rows default
-- to `owned_personal`. Boot-time migration is handled by apply-migration-addon.mjs;
-- this file mirrors it for drizzle history parity.
ALTER TABLE `properties` ADD `propertyMode` enum('owned_rented','owned_personal','rented') DEFAULT 'owned_personal';
ALTER TABLE `properties` ADD `monthlyRent` int;
ALTER TABLE `properties` ADD `leaseStart` varchar(20);
ALTER TABLE `properties` ADD `leaseEnd` varchar(20);
ALTER TABLE `properties` ADD `deposit` int;
ALTER TABLE `properties` ADD `landlord` varchar(200);
