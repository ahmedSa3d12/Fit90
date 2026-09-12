/*
  DESTRUCTIVE -- transactions only.
  Deletes monthly plans, appointment slots and bookings for Classes, Nutrition,
  Personal Training, SPA and InBody. Keeps all service/type/setup tables intact.

  Kept: club_services, club_spa_services, club_class_additional_services,
  club_service_additional_services, club_class_rooms, trainers, members,
  subscriptions, receipts, tasks, member attendance, invoices and measurements.
*/
USE `metacodecx_fit90`;
START TRANSACTION;

/* Generic appointment-booking child rows, then their parent bookings. */
DELETE a
FROM `club_appt_booking_additional_services` AS a
INNER JOIN `club_bookings` AS b ON b.`id` = a.`booking_id`
INNER JOIN `club_services` AS s ON s.`id` = b.`service_id`
WHERE s.`category` IN ('class','zumba','nutrition','spa','personal_training','inbody');

DELETE b
FROM `club_bookings` AS b
INNER JOIN `club_services` AS s ON s.`id` = b.`service_id`
WHERE s.`category` IN ('class','zumba','nutrition','spa','personal_training','inbody');

/* Class booking child rows, reservations and monthly class slots/plans. */
DELETE FROM `club_booking_additional_services`;
DELETE FROM `club_class_bookings`;
DELETE FROM `club_slot_additional_services`;
DELETE FROM `club_class_schedule_slots`;
DELETE FROM `club_class_monthly_schedules`;

/* Previous class appointment records and their attendee/waiting records. */
DELETE FROM `club_class_enrollments`;
DELETE FROM `club_class_waitlist`;
DELETE FROM `club_classes`;

/* Nutrition / personal-training / SPA / InBody monthly availability and appointments. */
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

/* Older SPA / InBody booking screens only; invoices and measurements are preserved. */
DELETE FROM `club_spa_bookings`;
DELETE FROM `club_inbody_bookings`;

COMMIT;
