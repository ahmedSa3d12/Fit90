-- Remove only the obsolete nutrition scheduling data. Other departments share these tables.
DELETE b
FROM `club_bookings` b
JOIN `club_services` s ON s.id = b.service_id
WHERE s.category = 'nutrition';

DELETE sch
FROM `club_schedules` sch
JOIN `club_services` s ON s.id = sch.service_id
WHERE s.category = 'nutrition';

DELETE FROM `club_service_monthly_schedules`
WHERE category = 'nutrition';

-- Nutrition services declare which subscription benefit they consume.
ALTER TABLE `club_services`
  ADD COLUMN `entitlement_key` VARCHAR(50) NULL AFTER `description`;

-- Existing InBody services consume the InBody allowance; other nutrition services
-- consume the nutrition-session allowance. Admins can change this per service later.
UPDATE `club_services`
SET `entitlement_key` = CASE
  WHEN LOWER(REPLACE(`name`, ' ', '')) LIKE '%inbody%' THEN 'inbody'
  ELSE 'nutrition_session'
END
WHERE `category` = 'nutrition' AND `is_deleted` = 0;

-- A booking snapshots commercial rules so later service edits do not rewrite history.
ALTER TABLE `club_bookings`
  ADD COLUMN `duration_min_snapshot` INT NULL AFTER `notes`,
  ADD COLUMN `price_snapshot` DECIMAL(10,2) NULL AFTER `duration_min_snapshot`,
  ADD COLUMN `coverage_type` VARCHAR(30) NULL AFTER `price_snapshot`,
  ADD COLUMN `entitlement_key_snapshot` VARCHAR(50) NULL AFTER `coverage_type`,
  ADD COLUMN `payment_status` VARCHAR(30) NULL AFTER `entitlement_key_snapshot`,
  ADD COLUMN `entitlement_restored_at` DATETIME NULL AFTER `payment_status`,
  ADD COLUMN `entitlement_restored_by` INT NULL AFTER `entitlement_restored_at`,
  ADD COLUMN `entitlement_restore_reason` VARCHAR(500) NULL AFTER `entitlement_restored_by`;

CREATE INDEX `club_bookings_member_coverage_idx`
  ON `club_bookings` (`member_id`, `coverage_type`, `status`);
