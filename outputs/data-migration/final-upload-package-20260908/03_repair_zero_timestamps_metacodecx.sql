/*
  FIT90 urgent repair: fixes ONLY invalid zero/old timestamps.
  Target database: metacodecx_fit90
  It does not delete, insert, or alter records.
*/
USE `metacodecx_fit90`;
SET @repair_time := NOW(3);

/* Members imported to branch 1 */
UPDATE `club_members`
SET `created_at` = IF(`created_at` < '2000-01-01' OR `created_at` IS NULL, @repair_time, `created_at`),
    `updated_at` = IF(`updated_at` < '2000-01-01' OR `updated_at` IS NULL, @repair_time, `updated_at`)
WHERE `branch_id` = 1
  AND (`created_at` < '2000-01-01' OR `updated_at` < '2000-01-01' OR `created_at` IS NULL OR `updated_at` IS NULL);

/* Subscriptions imported to branch 1 */
UPDATE `club_subscriptions`
SET `created_at` = IF(`created_at` < '2000-01-01' OR `created_at` IS NULL, @repair_time, `created_at`),
    `updated_at` = IF(`updated_at` < '2000-01-01' OR `updated_at` IS NULL, @repair_time, `updated_at`)
WHERE `branch_id` = 1
  AND (`created_at` < '2000-01-01' OR `updated_at` < '2000-01-01' OR `created_at` IS NULL OR `updated_at` IS NULL);

/* Receipts linked to the imported branch-1 subscriptions */
UPDATE `club_receipts` AS r
INNER JOIN `club_subscriptions` AS s ON s.`id` = r.`subscription_id`
SET r.`created_at` = IF(r.`created_at` < '2000-01-01' OR r.`created_at` IS NULL, @repair_time, r.`created_at`),
    r.`updated_at` = IF(r.`updated_at` < '2000-01-01' OR r.`updated_at` IS NULL, @repair_time, r.`updated_at`)
WHERE s.`branch_id` = 1
  AND (r.`created_at` < '2000-01-01' OR r.`updated_at` < '2000-01-01' OR r.`created_at` IS NULL OR r.`updated_at` IS NULL);

/* Potential members imported to branch 1 */
UPDATE `club_leads`
SET `created_at` = IF(`created_at` < '2000-01-01' OR `created_at` IS NULL, @repair_time, `created_at`),
    `updated_at` = IF(`updated_at` < '2000-01-01' OR `updated_at` IS NULL, @repair_time, `updated_at`)
WHERE `branch_id` = 1
  AND (`created_at` < '2000-01-01' OR `updated_at` < '2000-01-01' OR `created_at` IS NULL OR `updated_at` IS NULL);

/* Must return four zeros after the repair. */
SELECT
  (SELECT COUNT(*) FROM `club_members` WHERE `branch_id`=1 AND (`created_at` < '2000-01-01' OR `updated_at` < '2000-01-01')) AS bad_member_datetime,
  (SELECT COUNT(*) FROM `club_subscriptions` WHERE `branch_id`=1 AND (`created_at` < '2000-01-01' OR `updated_at` < '2000-01-01')) AS bad_subscription_datetime,
  (SELECT COUNT(*) FROM `club_receipts` WHERE `created_at` < '2000-01-01' OR `updated_at` < '2000-01-01') AS bad_receipt_datetime,
  (SELECT COUNT(*) FROM `club_leads` WHERE `branch_id`=1 AND (`created_at` < '2000-01-01' OR `updated_at` < '2000-01-01')) AS bad_lead_datetime;
