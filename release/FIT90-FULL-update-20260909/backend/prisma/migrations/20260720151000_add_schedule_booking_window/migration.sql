ALTER TABLE `club_schedules`
  ADD COLUMN `booking_start_at` DATETIME(0) NULL AFTER `end_time`,
  ADD COLUMN `booking_end_at` DATETIME(0) NULL AFTER `booking_start_at`;
