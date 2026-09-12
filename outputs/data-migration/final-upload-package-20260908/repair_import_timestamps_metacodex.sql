-- Repair only invalid/zero timestamps created by the first raw SQL import.
-- This file does not delete or reinsert any record.
SET @expected_database := 'metacodex_fit90';
SET @target_branch_id := 1;
SET @is_target := (BINARY DATABASE() = BINARY @expected_database);

START TRANSACTION;

UPDATE `club_members`
SET `created_at` = IF(`created_at` < '2000-01-01', NOW(3), `created_at`),
    `updated_at` = IF(`updated_at` < '2000-01-01', NOW(3), `updated_at`)
WHERE @is_target = 1
  AND `branch_id` = @target_branch_id
  AND `member_code` LIKE 'MIG-%'
  AND (`created_at` < '2000-01-01' OR `updated_at` < '2000-01-01');

UPDATE `club_subscriptions`
SET `created_at` = IF(`created_at` < '2000-01-01', NOW(3), `created_at`),
    `updated_at` = IF(`updated_at` < '2000-01-01', NOW(3), `updated_at`)
WHERE @is_target = 1
  AND `branch_id` = @target_branch_id
  AND (`created_at` < '2000-01-01' OR `updated_at` < '2000-01-01');

UPDATE `club_receipts`
SET `created_at` = IF(`created_at` < '2000-01-01', NOW(3), `created_at`),
    `updated_at` = IF(`updated_at` < '2000-01-01', NOW(3), `updated_at`)
WHERE @is_target = 1
  AND `receipt_number` LIKE 'MIG-R-%'
  AND (`created_at` < '2000-01-01' OR `updated_at` < '2000-01-01');

UPDATE `club_leads`
SET `created_at` = IF(`created_at` < '2000-01-01', NOW(3), `created_at`),
    `updated_at` = IF(`updated_at` < '2000-01-01', NOW(3), `updated_at`)
WHERE @is_target = 1
  AND `branch_id` = @target_branch_id
  AND (`created_at` < '2000-01-01' OR `updated_at` < '2000-01-01');

COMMIT;

SELECT
  @is_target AS `correct_database_selected`,
  (SELECT COUNT(*) FROM `club_members` WHERE `branch_id` = @target_branch_id AND `member_code` LIKE 'MIG-%' AND (`created_at` < '2000-01-01' OR `updated_at` < '2000-01-01')) AS `invalid_member_timestamps`,
  (SELECT COUNT(*) FROM `club_subscriptions` WHERE `branch_id` = @target_branch_id AND (`created_at` < '2000-01-01' OR `updated_at` < '2000-01-01')) AS `invalid_subscription_timestamps`,
  (SELECT COUNT(*) FROM `club_receipts` WHERE `receipt_number` LIKE 'MIG-R-%' AND (`created_at` < '2000-01-01' OR `updated_at` < '2000-01-01')) AS `invalid_receipt_timestamps`,
  (SELECT COUNT(*) FROM `club_leads` WHERE `branch_id` = @target_branch_id AND (`created_at` < '2000-01-01' OR `updated_at` < '2000-01-01')) AS `invalid_lead_timestamps`;
