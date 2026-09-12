/*
  DESTRUCTIVE: deletes all class/zumba, nutrition, personal-training, spa and InBody
  schedules, monthly plans, availability, bookings, invoices, and related service catalog records.
  Preserves: members, subscriptions, receipts, attendance, trainers, branches and users.
*/
USE `metacodecx_fit90`;
START TRANSACTION;

/* --- Modern scheduling: booking children first --- */
DELETE a
FROM `club_appt_booking_additional_services` AS a
INNER JOIN `club_bookings` AS b ON b.`id` = a.`booking_id`
INNER JOIN `club_services` AS s ON s.`id` = b.`service_id`
WHERE s.`category` IN ('class','zumba','nutrition','spa','personal_training','inbody');

DELETE b
FROM `club_bookings` AS b
INNER JOIN `club_services` AS s ON s.`id` = b.`service_id`
WHERE s.`category` IN ('class','zumba','nutrition','spa','personal_training','inbody');

/* --- Modern classes: monthly plans, slots, reservations, add-on services --- */
DELETE ba FROM `club_booking_additional_services` AS ba;
DELETE FROM `club_class_bookings`;
DELETE FROM `club_slot_additional_services`;
DELETE FROM `club_class_schedule_slots`;
DELETE FROM `club_class_monthly_schedules`;
DELETE FROM `club_class_additional_services`;

/* --- Old class module data --- */
DELETE FROM `club_class_enrollments`;
DELETE FROM `club_class_waitlist`;
DELETE FROM `club_classes`;
DELETE FROM `club_class_rooms`;

/* --- Nutrition/PT/SPA provider monthly plans and available appointments --- */
DELETE FROM `club_availability_slots`
WHERE `module_type` IN ('class','zumba','nutrition','spa','personal_training','inbody');

DELETE FROM `club_provider_monthly_availabilities`
WHERE `category` IN ('nutrition','spa','personal_training','inbody');

DELETE sc
FROM `club_schedules` AS sc
INNER JOIN `club_services` AS s ON s.`id` = sc.`service_id`
WHERE s.`category` IN ('class','zumba','nutrition','spa','personal_training','inbody');

DELETE FROM `club_service_monthly_schedules`
WHERE `category` IN ('class','zumba','nutrition','spa','personal_training','inbody');

/* --- Legacy SPA and InBody data --- */
DELETE FROM `club_spa_invoices`;
DELETE FROM `club_spa_bookings`;
DELETE FROM `club_inbody_invoices`;
DELETE FROM `club_inbody_bookings`;
DELETE FROM `club_inbody_records`;
DELETE FROM `club_inbody_measurements`;

/* Remove links before deleting selected service catalog records. */
DELETE l
FROM `club_service_additional_services` AS l
LEFT JOIN `club_services` AS parent_service ON parent_service.`id` = l.`parent_service_id`
LEFT JOIN `club_services` AS additional_service ON additional_service.`id` = l.`additional_service_id`
WHERE parent_service.`category` IN ('class','zumba','nutrition','spa','personal_training','inbody')
   OR additional_service.`category` IN ('class','zumba','nutrition','spa','personal_training','inbody');

DELETE FROM `club_services`
WHERE `category` IN ('class','zumba','nutrition','spa','personal_training','inbody');

/* Legacy SPA service catalog, after its booking/invoice data is gone. */
DELETE FROM `club_spa_services`;

COMMIT;

/* Expected result: all values should be 0. */
SELECT
  (SELECT COUNT(*) FROM `club_bookings` b INNER JOIN `club_services` s ON s.`id`=b.`service_id` WHERE s.`category` IN ('class','zumba','nutrition','spa','personal_training','inbody')) AS remaining_modern_bookings,
  (SELECT COUNT(*) FROM `club_schedules` sc INNER JOIN `club_services` s ON s.`id`=sc.`service_id` WHERE s.`category` IN ('class','zumba','nutrition','spa','personal_training','inbody')) AS remaining_modern_schedules,
  (SELECT COUNT(*) FROM `club_class_bookings`) AS remaining_class_bookings,
  (SELECT COUNT(*) FROM `club_availability_slots` WHERE `module_type` IN ('class','zumba','nutrition','spa','personal_training','inbody')) AS remaining_availability,
  (SELECT COUNT(*) FROM `club_spa_bookings`) AS remaining_spa_bookings,
  (SELECT COUNT(*) FROM `club_inbody_bookings`) AS remaining_inbody_bookings;
