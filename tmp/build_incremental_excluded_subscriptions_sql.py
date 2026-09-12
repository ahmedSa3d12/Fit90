import datetime
import os
import re
import sys
import unicodedata
from decimal import Decimal, InvalidOperation
from openpyxl import load_workbook

ROOT = r'E:\final_projects\asmaa\23-8-2026\FIT90_19-8'
PACKAGE = os.path.join(ROOT, 'outputs', 'data-migration', 'final-upload-package-20260908')
SOURCE = os.path.join(PACKAGE, 'excluded_subscriptions_for_client.xlsx')
MEMBERS_SOURCE = os.path.join(PACKAGE, 'excluded_members_for_client.xlsx')
DEFAULT_OUTPUT = os.path.join(PACKAGE, 'add_excluded_subscriptions_repaired.sql')
EXPECTED_DB = sys.argv[1] if len(sys.argv) > 1 else 'metacodecx_fit90'
OUTPUT = sys.argv[2] if len(sys.argv) > 2 else DEFAULT_OUTPUT
DRY_RUN = len(sys.argv) > 3 and sys.argv[3] == '--dry-run'


def text(value):
    if value is None:
        return ''
    return unicodedata.normalize('NFKC', str(value)).replace('\u200b', '').replace('\ufeff', '').strip()


def normalized(value):
    return re.sub(r'\s+', ' ', text(value)).casefold()


def sql_text(value):
    value = text(value)
    if not value:
        return 'NULL'
    value = value.replace('\\', '\\\\').replace("'", "''").replace('\x00', '').replace('\r', '\\r').replace('\n', '\\n')
    return f"'{value}'"


def sql_number(value):
    result = Decimal(value)
    return format(result, 'f')


def money(value):
    try:
        result = Decimal(text(value) or '0')
    except InvalidOperation as error:
        raise ValueError(f'Invalid amount: {value!r}') from error
    return max(result, Decimal('0'))


def date_text(value):
    if isinstance(value, (datetime.date, datetime.datetime)):
        return value.strftime('%Y-%m-%d')
    return text(value)[:10]


def values_insert(table, columns, rows, batch_size=250):
    statements = []
    for start in range(0, len(rows), batch_size):
        values = ',\n'.join('(' + ','.join(row) + ')' for row in rows[start:start + batch_size])
        statements.append(f'INSERT INTO `{table}` ({", ".join(f"`{column}`" for column in columns)}) VALUES\n{values};')
    return '\n\n'.join(statements)


member_book = load_workbook(MEMBERS_SOURCE, read_only=True, data_only=True)
member_sheet = member_book.active
member_rows = list(member_sheet.iter_rows(min_row=4, values_only=True))
member_headers = list(member_rows[0])
member_index = {header: position for position, header in enumerate(member_headers)}
additional_member_ids = {
    text(row[member_index['ID']])
    for row in member_rows[1:]
    if 'رقم الهاتف مكرر' not in text(row[member_index['سبب الاستبعاد']])
}
if len(additional_member_ids) != 85:
    raise ValueError(f'Expected 85 prior additional members, found {len(additional_member_ids)}')

book = load_workbook(SOURCE, read_only=True, data_only=True)
sheet = book.active
source_rows = list(sheet.iter_rows(min_row=4, values_only=True))
headers = list(source_rows[0])
index = {header: position for position, header in enumerate(headers)}
required = {'سبب الاستبعاد', 'ID', 'Member ID', 'نوع الاشتراك', 'رقم العقد', 'تاريخ البداية', 'تاريخ الانتهاء', 'القيمة', 'الخصم', 'المدفوع', 'ملاحظات'}
missing = required - set(index)
if missing:
    raise ValueError(f'Missing expected columns: {sorted(missing)!r}')

subscription_rows = []
repaired_discount = 0
raised_value = 0
included_member_after_add = 0
excluded_other_issues = 0
generated_contract_numbers = 0
for excel_row, source in enumerate(source_rows[1:], start=5):
    reason = text(source[index['سبب الاستبعاد']])
    legacy_subscription_id = text(source[index['ID']])
    legacy_member_id = text(source[index['Member ID']])
    paid_issue = 'المبلغ المدفوع أكبر من قيمة الاشتراك بعد الخصم' in reason
    member_issue = 'العضو غير موجود ضمن الأعضاء المقبولين للاستيراد' in reason
    contract_issue = 'رقم العقد مفقود' in reason
    original_package_name = text(source[index['نوع الاشتراك']])
    resolved_annual_type_issue = 'نوع الاشتراك غير مطابق' in reason and normalized(original_package_name) == 'annual'
    unresolved_type_issue = 'نوع الاشتراك غير مطابق' in reason and normalized(original_package_name) != 'annual'
    other_issue = unresolved_type_issue or 'تاريخ' in reason

    if other_issue or not (paid_issue or member_issue or contract_issue or resolved_annual_type_issue):
        excluded_other_issues += 1
        continue
    if member_issue and legacy_member_id not in additional_member_ids:
        excluded_other_issues += 1
        continue

    contract = text(source[index['رقم العقد']])
    package_name = 'annual membership' if normalized(original_package_name) == 'annual' else original_package_name
    start_date = date_text(source[index['تاريخ البداية']])
    end_date = date_text(source[index['تاريخ الانتهاء']])
    if not legacy_subscription_id or not legacy_member_id or not package_name or not start_date or not end_date:
        raise ValueError(f'Cannot safely import Excel row {excel_row}: required subscription data is missing')
    if not contract:
        generated_contract_numbers += 1

    value = money(source[index['القيمة']])
    discount = money(source[index['الخصم']])
    paid = money(source[index['المدفوع']])
    if paid_issue:
        if paid <= value:
            discount = max(Decimal('0'), value - paid)
            repaired_discount += 1
        else:
            value = paid
            discount = Decimal('0')
            raised_value += 1
    remaining = value - discount - paid
    if remaining < 0:
        raise ValueError(f'Cannot reconcile Excel row {excel_row}')

    notes = text(source[index['ملاحظات']])
    if paid_issue:
        adjustment = 'تمت تسوية الاستيراد: تم تعديل الخصم أو قيمة الاشتراك لتساوي الدفعة المسجلة.'
        notes = (notes + '\n' if notes else '') + adjustment
    if member_issue:
        included_member_after_add += 1

    subscription_rows.append([
        sql_text(legacy_subscription_id), sql_text(legacy_member_id), sql_text(f'LEG-{legacy_subscription_id}'),
        sql_text(package_name), sql_text(start_date), sql_text(start_date), sql_text(end_date),
        sql_number(value), sql_number(discount), sql_number(paid), sql_number(remaining), sql_text(notes),
    ])

if not subscription_rows:
    raise ValueError('No subscriptions qualified for this incremental upload.')

columns = [
    'legacy_subscription_id', 'legacy_member_id', 'subscription_number', 'subscription_type',
    'registration_date', 'start_date', 'end_date', 'subscription_value', 'discount_value',
    'paid_amount', 'remaining_amount', 'notes',
]

sql = f'''-- Adds only subscriptions eligible after the approved member add-on.
-- It does not delete or update existing members, subscriptions, receipts, or leads.
-- Missing contract numbers receive the unique migration number LEG-<legacy subscription ID>.
-- Rows with unmatched subscription types remain excluded.
-- Intended additional subscriptions: {len(subscription_rows)} rows.
-- Repaired by reducing discount: {repaired_discount} rows.
-- Repaired by setting value equal to paid amount: {raised_value} rows.
-- Rows included because their member is in the 85-member add-on: {included_member_after_add} rows.
-- Generated migration numbers for missing contracts: {generated_contract_numbers} rows.
SET NAMES utf8mb4;
SET @target_branch_id := 1;
SET @expected_database := {sql_text(EXPECTED_DB)};

CREATE TEMPORARY TABLE `_fit90_additional_subscription_import` (
  `legacy_subscription_id` VARCHAR(30) NOT NULL,
  `legacy_member_id` VARCHAR(30) NOT NULL,
  `subscription_number` VARCHAR(30) NOT NULL,
  `subscription_type` VARCHAR(150) NOT NULL,
  `registration_date` VARCHAR(10) NOT NULL,
  `start_date` VARCHAR(10) NOT NULL,
  `end_date` VARCHAR(10) NOT NULL,
  `subscription_value` DECIMAL(10,2) NOT NULL,
  `discount_value` DECIMAL(10,2) NOT NULL,
  `paid_amount` DECIMAL(10,2) NOT NULL,
  `remaining_amount` DECIMAL(10,2) NOT NULL,
  `notes` TEXT NULL,
  PRIMARY KEY (`legacy_subscription_id`),
  UNIQUE KEY `uq_subscription_number` (`subscription_number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

{values_insert('_fit90_additional_subscription_import', columns, subscription_rows)}

SELECT (BINARY DATABASE() = BINARY @expected_database) INTO @database_ok;
SELECT EXISTS(
  SELECT 1 FROM `tbl_branches`
  WHERE `branch_id` = @target_branch_id
    AND BINARY LOWER(TRIM(`branch_name`)) = BINARY 'fit90'
) INTO @branch_ok;
SELECT NOT EXISTS(
  SELECT 1
  FROM `_fit90_additional_subscription_import` `i`
  LEFT JOIN `club_members` `m`
    ON BINARY `m`.`member_code` = BINARY CONCAT('MIG-', `i`.`legacy_member_id`)
   AND `m`.`branch_id` = @target_branch_id
  WHERE `m`.`id` IS NULL
) INTO @members_ok;
SELECT NOT EXISTS(
  SELECT 1
  FROM `_fit90_additional_subscription_import` `i`
  LEFT JOIN `club_subscription_types` `t`
    ON BINARY LOWER(TRIM(`t`.`name`)) = BINARY LOWER(TRIM(`i`.`subscription_type`))
  WHERE `t`.`id` IS NULL
) INTO @types_ok;
SET @is_safe := @database_ok AND @branch_ok AND @members_ok AND @types_ok;
SELECT @is_safe AS `precheck_passed`, @database_ok AS `database_ok`, @branch_ok AS `branch_ok`, @members_ok AS `members_ok`, @types_ok AS `types_ok`;

START TRANSACTION;

INSERT INTO `club_subscriptions` (
  `subscription_number`, `registration_date`, `branch_id`, `member_id`, `customer_name`,
  `subscription_type_id`, `subscription_type`, `subscription_start_date`, `subscription_end_date`,
  `subscription_value`, `discount_enabled`, `discount_value`, `paid_amount`, `remaining_amount`,
  `status`, `is_special`, `is_linked_to_sessions`, `sessions_used`, `allow_multiple_daily_entries`,
  `is_time_based`, `benefits`, `created_at`, `updated_at`
)
SELECT
  `i`.`subscription_number`, `i`.`registration_date`, @target_branch_id, `m`.`id`, `m`.`name`,
  `t`.`id`, `t`.`name`, `i`.`start_date`, `i`.`end_date`, `i`.`subscription_value`,
  (`i`.`discount_value` > 0), `i`.`discount_value`, `i`.`paid_amount`, `i`.`remaining_amount`,
  CASE WHEN `i`.`start_date` > CURDATE() THEN 'upcoming' WHEN `i`.`end_date` < CURDATE() THEN 'expired' ELSE 'active' END,
  0, 0, 0, 0, 0, JSON_OBJECT(), NOW(3), NOW(3)
FROM `_fit90_additional_subscription_import` `i`
INNER JOIN `club_members` `m`
  ON BINARY `m`.`member_code` = BINARY CONCAT('MIG-', `i`.`legacy_member_id`) AND `m`.`branch_id` = @target_branch_id
INNER JOIN `club_subscription_types` `t`
  ON BINARY LOWER(TRIM(`t`.`name`)) = BINARY LOWER(TRIM(`i`.`subscription_type`))
LEFT JOIN `club_subscriptions` `existing`
  ON BINARY `existing`.`subscription_number` = BINARY `i`.`subscription_number`
WHERE @is_safe = 1 AND `existing`.`id` IS NULL;

SELECT ROW_COUNT() AS `additional_subscriptions_inserted`;

INSERT INTO `club_receipts` (
  `receipt_number`, `subscription_id`, `member_id`, `member_name`, `amount`, `type`,
  `receipt_date`, `status`, `description`, `created_at`, `updated_at`
)
SELECT
  CONCAT('MIG-R-', `s`.`id`), `s`.`id`, `s`.`member_id`, `s`.`customer_name`, `s`.`paid_amount`,
  LEFT(`s`.`subscription_type`, 50), `s`.`registration_date`, 'مدفوعة',
  'Legacy migration opening payment', NOW(3), NOW(3)
FROM `club_subscriptions` `s`
INNER JOIN `_fit90_additional_subscription_import` `i`
  ON BINARY `i`.`subscription_number` = BINARY `s`.`subscription_number`
LEFT JOIN `club_receipts` `existing_receipt`
  ON BINARY `existing_receipt`.`receipt_number` = BINARY CONCAT('MIG-R-', `s`.`id`)
WHERE `s`.`branch_id` = @target_branch_id AND `s`.`paid_amount` > 0 AND @is_safe = 1
  AND `existing_receipt`.`id` IS NULL;

SELECT ROW_COUNT() AS `additional_receipts_inserted`;
{('ROLLBACK;' if DRY_RUN else 'COMMIT;')}

SELECT
  {len(subscription_rows)} AS `source_subscriptions_requested`,
  {repaired_discount} AS `discounts_repaired`,
  {raised_value} AS `values_raised_to_paid`,
  {included_member_after_add} AS `subscriptions_for_added_members`,
  {generated_contract_numbers} AS `generated_contract_numbers`;

DROP TEMPORARY TABLE `_fit90_additional_subscription_import`;
'''

with open(OUTPUT, 'w', encoding='utf-8', newline='\n') as file:
    file.write(sql)

print({
    'output': OUTPUT,
    'subscriptions_to_add': len(subscription_rows),
    'discounts_repaired': repaired_discount,
    'values_raised_to_paid': raised_value,
    'subscriptions_for_added_members': included_member_after_add,
    'generated_contract_numbers': generated_contract_numbers,
    'excluded_other_issues': excluded_other_issues,
    'dry_run': DRY_RUN,
})
