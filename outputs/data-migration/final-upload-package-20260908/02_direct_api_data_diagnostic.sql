/*
  READ ONLY. Safe to run with phpMyAdmin Import or SQL.
  Uses the exact lower-case table names. No INFORMATION_SCHEMA query.
*/
USE `metacodecx_fit90`;

/* A. This is the same basic read made by the Members page. */
SELECT `id`, `member_code`, `name`, `gender`, `branch_id`, `is_deleted`, `created_at`, `updated_at`
FROM `club_members`
WHERE `branch_id` = 1 AND `is_deleted` = 0
ORDER BY `id` DESC
LIMIT 10;

/* B. This is the basic read made by Subscriptions and Receipts pages. */
SELECT `id`, `subscription_number`, `member_id`, `subscription_type_id`, `status`, `payment_method`, `created_at`, `updated_at`
FROM `club_subscriptions`
WHERE `branch_id` = 1
ORDER BY `id` DESC
LIMIT 10;

SELECT `id`, `receipt_number`, `subscription_id`, `member_id`, `amount`, `payment_method`, `created_at`, `updated_at`
FROM `club_receipts`
ORDER BY `id` DESC
LIMIT 10;

/* C. Exact data issues that make Prisma/Node fail while reading DateTime. */
SELECT
  (SELECT COUNT(*) FROM `club_members` WHERE `branch_id`=1 AND (`created_at` < '2000-01-01' OR `updated_at` < '2000-01-01')) AS bad_member_datetime,
  (SELECT COUNT(*) FROM `club_subscriptions` WHERE `branch_id`=1 AND (`created_at` < '2000-01-01' OR `updated_at` < '2000-01-01')) AS bad_subscription_datetime,
  (SELECT COUNT(*) FROM `club_receipts` WHERE `created_at` < '2000-01-01' OR `updated_at` < '2000-01-01') AS bad_receipt_datetime,
  (SELECT COUNT(*) FROM `club_leads` WHERE `branch_id`=1 AND (`created_at` < '2000-01-01' OR `updated_at` < '2000-01-01')) AS bad_lead_datetime,
  (SELECT COUNT(*) FROM `club_members` WHERE `branch_id`=1 AND `gender` NOT IN ('male','female')) AS bad_member_gender,
  (SELECT COUNT(*) FROM `club_subscriptions` WHERE `branch_id`=1 AND `gender` IS NOT NULL AND `gender` NOT IN ('male','female')) AS bad_subscription_gender,
  (SELECT COUNT(*) FROM `club_subscriptions` WHERE `branch_id`=1 AND `status` NOT IN ('active','expired','upcoming','frozen')) AS bad_subscription_status;

/* D. The potential-members page query. */
SELECT `id`, `name`, `phone`, `gender`, `status`, `branch_id`, `is_deleted`, `created_at`, `updated_at`
FROM `club_leads`
WHERE `branch_id` = 1 AND `is_deleted` = 0
ORDER BY `id` DESC
LIMIT 10;
