import csv, os, sys

ROOT = r'E:\final_projects\asmaa\23-8-2026\FIT90_19-8\outputs\data-migration\final-upload-package-20260908'
EXPECTED_DB = sys.argv[1] if len(sys.argv) > 1 else 'metacodex_fit90'
OUTPUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, 'fit90_production_import.sql')

def read(name):
    with open(os.path.join(ROOT, name), encoding='utf-8-sig', newline='') as f:
        return list(csv.DictReader(f))

def sql_text(value):
    if value is None or value == '':
        return 'NULL'
    value = str(value).replace('\\', '\\\\').replace("'", "''").replace('\x00', '').replace('\r', '\\r').replace('\n', '\\n')
    return f"'{value}'"

def sql_number(value):
    value = (value or '0').strip()
    if not value.replace('.', '', 1).isdigit():
        raise ValueError(f'Invalid numeric value: {value!r}')
    return value

def insert_rows(table, columns, rows, batch_size=250):
    lines = []
    for start in range(0, len(rows), batch_size):
        batch = rows[start:start + batch_size]
        values = ',\n'.join('(' + ','.join(row) + ')' for row in batch)
        lines.append(f'INSERT INTO `{table}` ({", ".join(f"`{column}`" for column in columns)}) VALUES\n{values};')
    return '\n\n'.join(lines)

members = read('members_final.csv')
subscriptions = read('subscriptions_final.csv')
leads = read('potential_members_final.csv')

member_rows = [[
    sql_text(row['legacy_member_id']), sql_text(row['name']), sql_text(row['phone']),
    sql_text(row['email']), sql_text(row['gender']), sql_text(row['national_id']),
    sql_text(row['date_of_birth']), sql_text(row['address']), sql_text(row['job_title']), sql_text(row['notes'])
] for row in members]

subscription_rows = [[
    sql_text(row['legacy_member_id']), sql_text(row['subscription_number']), sql_number(row['subscription_type_id']),
    sql_text(row['subscription_type_name']), sql_text(row['registration_date']), sql_text(row['subscription_start_date']),
    sql_text(row['subscription_end_date']), sql_number(row['subscription_value']), sql_number(row['discount_value']),
    sql_number(row['paid_amount']), sql_number(row['remaining_amount'])
] for row in subscriptions]

lead_rows = [[
    sql_text(row['name']), sql_text(row['phone']), sql_text(row['email']), sql_text(row['gender']),
    sql_text(row['follow_up_at']), sql_text(row['notes'])
] for row in leads]

sql = f'''-- FIT90 data migration: tested locally on 2026-09-08.
-- This script is destructive only for branch_id 1 and only when DATABASE() is {EXPECTED_DB!r}.
-- Before importing in phpMyAdmin, export a full SQL backup of the selected database.
SET NAMES utf8mb4;
SET SESSION sql_mode = REPLACE(@@SESSION.sql_mode, 'NO_BACKSLASH_ESCAPES', '');
SET @target_branch_id := 1;
SET @expected_database := {sql_text(EXPECTED_DB)};

CREATE TEMPORARY TABLE `_fit90_member_import` (
  `legacy_member_id` VARCHAR(30) NOT NULL,
  `name` VARCHAR(200) NOT NULL,
  `phone` VARCHAR(20) NOT NULL,
  `email` VARCHAR(150) NULL,
  `gender` VARCHAR(10) NOT NULL,
  `card_number` VARCHAR(30) NULL,
  `date_of_birth` VARCHAR(10) NULL,
  `address` TEXT NULL,
  `job_title` VARCHAR(120) NULL,
  `notes` TEXT NULL,
  PRIMARY KEY (`legacy_member_id`),
  UNIQUE KEY `uq_migration_phone` (`phone`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

{insert_rows('_fit90_member_import', ['legacy_member_id', 'name', 'phone', 'email', 'gender', 'card_number', 'date_of_birth', 'address', 'job_title', 'notes'], member_rows)}

CREATE TEMPORARY TABLE `_fit90_subscription_import` (
  `legacy_member_id` VARCHAR(30) NOT NULL,
  `subscription_number` VARCHAR(30) NOT NULL,
  `subscription_type` VARCHAR(150) NOT NULL,
  `registration_date` VARCHAR(10) NULL,
  `start_date` VARCHAR(10) NOT NULL,
  `end_date` VARCHAR(10) NOT NULL,
  `subscription_value` DECIMAL(10,2) NOT NULL,
  `discount_value` DECIMAL(10,2) NOT NULL,
  `paid_amount` DECIMAL(10,2) NOT NULL,
  `remaining_amount` DECIMAL(10,2) NOT NULL,
  PRIMARY KEY (`subscription_number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

{insert_rows('_fit90_subscription_import', ['legacy_member_id', 'subscription_number', 'subscription_type', 'registration_date', 'start_date', 'end_date', 'subscription_value', 'discount_value', 'paid_amount', 'remaining_amount'], [row[:2] + row[3:] for row in subscription_rows])}

CREATE TEMPORARY TABLE `_fit90_lead_import` (
  `name` VARCHAR(200) NOT NULL,
  `phone` VARCHAR(30) NULL,
  `email` VARCHAR(120) NULL,
  `gender` VARCHAR(10) NULL,
  `follow_up_at` VARCHAR(20) NULL,
  `notes` TEXT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

{insert_rows('_fit90_lead_import', ['name', 'phone', 'email', 'gender', 'follow_up_at', 'notes'], lead_rows)}

-- The safety check gates every permanent write. A failed check performs no deletion or insertion.
SELECT (BINARY DATABASE() = BINARY @expected_database) INTO @database_ok;
SELECT EXISTS(SELECT 1 FROM `tbl_branches` WHERE `branch_id` = @target_branch_id AND BINARY LOWER(TRIM(`branch_name`)) = BINARY 'fit90') INTO @branch_ok;
SELECT NOT EXISTS (
  SELECT 1 FROM `_fit90_subscription_import` `i`
  LEFT JOIN `club_subscription_types` `t` ON BINARY LOWER(TRIM(`t`.`name`)) = BINARY LOWER(TRIM(`i`.`subscription_type`))
  WHERE `t`.`id` IS NULL
) INTO @types_ok;
SELECT NOT EXISTS (
  SELECT 1 FROM `_fit90_member_import` `i`
  INNER JOIN `club_members` `m` ON BINARY `m`.`phone` = BINARY `i`.`phone`
  WHERE `m`.`branch_id` <> @target_branch_id
) INTO @member_keys_ok;
SELECT NOT EXISTS (
  SELECT 1 FROM `_fit90_subscription_import` `i`
  INNER JOIN `club_subscriptions` `s` ON BINARY `s`.`subscription_number` = BINARY `i`.`subscription_number`
  WHERE `s`.`branch_id` <> @target_branch_id
) INTO @subscription_keys_ok;
SET @is_safe := @database_ok AND @branch_ok AND @types_ok AND @member_keys_ok AND @subscription_keys_ok;
SELECT @is_safe AS `precheck_passed`, @database_ok AS `database_ok`, @branch_ok AS `branch_ok`, @types_ok AS `types_ok`, @member_keys_ok AS `member_keys_ok`, @subscription_keys_ok AS `subscription_keys_ok`;

START TRANSACTION;

-- Delete only data tied to the approved Fit90 branch. Foreign-key dependent rows go first.
DELETE `bas`
FROM `club_booking_additional_services` `bas`
INNER JOIN `club_class_bookings` `b` ON `b`.`id` = `bas`.`booking_id`
INNER JOIN `club_members` `m` ON `m`.`id` = `b`.`member_id`
WHERE `m`.`branch_id` = @target_branch_id AND @is_safe = 1;
DELETE `b` FROM `club_class_bookings` `b`
INNER JOIN `club_members` `m` ON `m`.`id` = `b`.`member_id`
WHERE `m`.`branch_id` = @target_branch_id AND @is_safe = 1;
DELETE `p` FROM `club_member_points_transactions` `p`
LEFT JOIN `club_subscriptions` `s` ON `s`.`id` = `p`.`subscription_id`
LEFT JOIN `club_members` `m` ON `m`.`id` = `p`.`member_id`
WHERE (`s`.`branch_id` = @target_branch_id OR `m`.`branch_id` = @target_branch_id) AND @is_safe = 1;
DELETE `r` FROM `club_subscription_refunds` `r`
INNER JOIN `club_subscriptions` `s` ON `s`.`id` = `r`.`subscription_id`
WHERE `s`.`branch_id` = @target_branch_id AND @is_safe = 1;
DELETE `t` FROM `club_subscription_transfers` `t`
INNER JOIN `club_subscriptions` `s` ON `s`.`id` = `t`.`subscription_id`
WHERE `s`.`branch_id` = @target_branch_id AND @is_safe = 1;
DELETE `f` FROM `club_subscription_freezes` `f`
INNER JOIN `club_subscriptions` `s` ON `s`.`id` = `f`.`subscription_id`
WHERE `s`.`branch_id` = @target_branch_id AND @is_safe = 1;
DELETE `r` FROM `club_receipts` `r`
LEFT JOIN `club_subscriptions` `s` ON `s`.`id` = `r`.`subscription_id`
LEFT JOIN `club_members` `m` ON `m`.`id` = `r`.`member_id`
WHERE (`s`.`branch_id` = @target_branch_id OR `m`.`branch_id` = @target_branch_id) AND @is_safe = 1;
DELETE FROM `club_attendance` WHERE `branch_id` = @target_branch_id AND @is_safe = 1;
DELETE FROM `club_subscriptions` WHERE `branch_id` = @target_branch_id AND @is_safe = 1;
DELETE FROM `club_members` WHERE `branch_id` = @target_branch_id AND @is_safe = 1;
DELETE FROM `club_leads` WHERE `branch_id` = @target_branch_id AND @is_safe = 1;

INSERT INTO `club_members` (`member_code`, `name`, `phone`, `email`, `gender`, `card_number`, `date_of_birth`, `address`, `job_title`, `notes`, `branch_id`, `is_active`, `is_deleted`, `created_at`, `updated_at`)
SELECT CONCAT('MIG-', `legacy_member_id`), `name`, `phone`, `email`, `gender`, `card_number`, `date_of_birth`, `address`, `job_title`, `notes`, @target_branch_id, 1, 0, NOW(3), NOW(3)
FROM `_fit90_member_import` WHERE @is_safe = 1;

INSERT INTO `club_subscriptions` (`subscription_number`, `registration_date`, `branch_id`, `member_id`, `customer_name`, `subscription_type_id`, `subscription_type`, `subscription_start_date`, `subscription_end_date`, `subscription_value`, `discount_enabled`, `discount_value`, `paid_amount`, `remaining_amount`, `status`, `is_special`, `is_linked_to_sessions`, `sessions_used`, `allow_multiple_daily_entries`, `is_time_based`, `benefits`, `created_at`, `updated_at`)
SELECT `i`.`subscription_number`, COALESCE(NULLIF(`i`.`registration_date`, ''), `i`.`start_date`), @target_branch_id, `m`.`id`, `m`.`name`, `t`.`id`, `t`.`name`, `i`.`start_date`, `i`.`end_date`, `i`.`subscription_value`, (`i`.`discount_value` > 0), `i`.`discount_value`, `i`.`paid_amount`, `i`.`remaining_amount`,
  CASE WHEN `i`.`start_date` > CURDATE() THEN 'upcoming' WHEN `i`.`end_date` < CURDATE() THEN 'expired' ELSE 'active' END,
  0, 0, 0, 0, 0, JSON_OBJECT(), NOW(3), NOW(3)
FROM `_fit90_subscription_import` `i`
INNER JOIN `club_members` `m` ON BINARY `m`.`member_code` = BINARY CONCAT('MIG-', `i`.`legacy_member_id`) AND `m`.`branch_id` = @target_branch_id
INNER JOIN `club_subscription_types` `t` ON BINARY LOWER(TRIM(`t`.`name`)) = BINARY LOWER(TRIM(`i`.`subscription_type`))
WHERE @is_safe = 1;

INSERT INTO `club_receipts` (`receipt_number`, `subscription_id`, `member_id`, `member_name`, `amount`, `type`, `receipt_date`, `status`, `description`, `created_at`, `updated_at`)
SELECT CONCAT('MIG-R-', `s`.`id`), `s`.`id`, `s`.`member_id`, `s`.`customer_name`, `s`.`paid_amount`, LEFT(`s`.`subscription_type`, 50), `s`.`registration_date`, 'مدفوعة', 'Legacy migration opening payment', NOW(3), NOW(3)
FROM `club_subscriptions` `s`
INNER JOIN `_fit90_subscription_import` `i` ON BINARY `i`.`subscription_number` = BINARY `s`.`subscription_number`
WHERE `s`.`branch_id` = @target_branch_id AND `s`.`paid_amount` > 0 AND @is_safe = 1;

INSERT INTO `club_leads` (`name`, `phone`, `email`, `gender`, `branch_id`, `status`, `follow_up_at`, `notes`, `is_deleted`, `created_at`, `updated_at`)
SELECT `name`, `phone`, `email`, `gender`, @target_branch_id, 'new', `follow_up_at`, `notes`, 0, NOW(3), NOW(3)
FROM `_fit90_lead_import` WHERE @is_safe = 1;

COMMIT;

SELECT
  (SELECT COUNT(*) FROM `club_members` WHERE `branch_id` = @target_branch_id AND `member_code` LIKE 'MIG-%') AS `members_imported`,
  (SELECT COUNT(*) FROM `club_subscriptions` `s` INNER JOIN `_fit90_subscription_import` `i` ON `i`.`subscription_number` = `s`.`subscription_number` WHERE `s`.`branch_id` = @target_branch_id) AS `subscriptions_imported`,
  (SELECT COUNT(*) FROM `club_receipts` `r` INNER JOIN `club_subscriptions` `s` ON `s`.`id` = `r`.`subscription_id` WHERE `s`.`branch_id` = @target_branch_id AND `r`.`receipt_number` LIKE 'MIG-R-%') AS `receipts_imported`,
  (SELECT COUNT(*) FROM `club_leads` WHERE `branch_id` = @target_branch_id) AS `potential_members_imported`;

DROP TEMPORARY TABLE `_fit90_lead_import`;
DROP TEMPORARY TABLE `_fit90_subscription_import`;
DROP TEMPORARY TABLE `_fit90_member_import`;
'''

with open(OUTPUT, 'w', encoding='utf-8') as f:
    f.write(sql)
print({'output': OUTPUT, 'members': len(members), 'subscriptions': len(subscriptions), 'leads': len(leads)})
