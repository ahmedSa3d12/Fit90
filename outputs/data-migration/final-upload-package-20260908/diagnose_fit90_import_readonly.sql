/*
  FIT90 migration diagnostic -- READ ONLY
  - Does NOT INSERT, UPDATE, DELETE, CREATE, DROP, or ALTER anything.
  - Run it from phpMyAdmin > select database metacodex_fit90 > SQL tab.
  - Do NOT use the Import tab: the SQL tab shows the diagnostic result table.
*/

SET @expected_database := 'metacodex_fit90';
SET @is_target := (DATABASE() = @expected_database);

/* Result 1: every row marked FAIL is a concrete issue to fix. */
SELECT check_name, result, details
FROM (
  SELECT
    '01 - selected database' AS check_name,
    IF(@is_target = 1, 'PASS', 'FAIL') AS result,
    CONCAT('Current=', COALESCE(DATABASE(), '(none)'), '; required=', @expected_database) AS details

  UNION ALL SELECT
    '02 - imported MIG members count',
    IF(@is_target = 1 AND (SELECT COUNT(*) FROM club_members WHERE branch_id=1 AND member_code LIKE 'MIG-%') = 2688, 'PASS', 'FAIL'),
    CONCAT('found=', IF(@is_target=1,(SELECT COUNT(*) FROM club_members WHERE branch_id=1 AND member_code LIKE 'MIG-%'),0), '; expected=2688')

  UNION ALL SELECT
    '03 - imported subscriptions count',
    IF(@is_target = 1 AND (SELECT COUNT(*) FROM club_subscriptions WHERE branch_id=1) = 4706, 'PASS', 'FAIL'),
    CONCAT('found=', IF(@is_target=1,(SELECT COUNT(*) FROM club_subscriptions WHERE branch_id=1),0), '; expected=4706')

  UNION ALL SELECT
    '04 - imported receipts count',
    IF(@is_target = 1 AND (SELECT COUNT(*) FROM club_receipts r INNER JOIN club_subscriptions s ON s.id=r.subscription_id WHERE s.branch_id=1) = 4677, 'PASS', 'FAIL'),
    CONCAT('found=', IF(@is_target=1,(SELECT COUNT(*) FROM club_receipts r INNER JOIN club_subscriptions s ON s.id=r.subscription_id WHERE s.branch_id=1),0), '; expected=4677')

  UNION ALL SELECT
    '05 - imported potential members count',
    IF(@is_target = 1 AND (SELECT COUNT(*) FROM club_leads WHERE branch_id=1) = 17424, 'PASS', 'FAIL'),
    CONCAT('found=', IF(@is_target=1,(SELECT COUNT(*) FROM club_leads WHERE branch_id=1),0), '; expected=17424')

  UNION ALL SELECT
    '06 - bad DateTime values (members)',
    IF(@is_target = 1 AND (SELECT COUNT(*) FROM club_members WHERE member_code LIKE 'MIG-%' AND (created_at < '2000-01-01' OR updated_at < '2000-01-01' OR created_at IS NULL OR updated_at IS NULL)) = 0, 'PASS', 'FAIL'),
    CONCAT('invalid rows=', IF(@is_target=1,(SELECT COUNT(*) FROM club_members WHERE member_code LIKE 'MIG-%' AND (created_at < '2000-01-01' OR updated_at < '2000-01-01' OR created_at IS NULL OR updated_at IS NULL)),0))

  UNION ALL SELECT
    '07 - bad DateTime values (subscriptions)',
    IF(@is_target = 1 AND (SELECT COUNT(*) FROM club_subscriptions WHERE branch_id=1 AND (created_at < '2000-01-01' OR updated_at < '2000-01-01' OR created_at IS NULL OR updated_at IS NULL)) = 0, 'PASS', 'FAIL'),
    CONCAT('invalid rows=', IF(@is_target=1,(SELECT COUNT(*) FROM club_subscriptions WHERE branch_id=1 AND (created_at < '2000-01-01' OR updated_at < '2000-01-01' OR created_at IS NULL OR updated_at IS NULL)),0))

  UNION ALL SELECT
    '08 - bad DateTime values (receipts)',
    IF(@is_target = 1 AND (SELECT COUNT(*) FROM club_receipts r INNER JOIN club_subscriptions s ON s.id=r.subscription_id WHERE s.branch_id=1 AND (r.created_at < '2000-01-01' OR r.updated_at < '2000-01-01' OR r.created_at IS NULL OR r.updated_at IS NULL)) = 0, 'PASS', 'FAIL'),
    CONCAT('invalid rows=', IF(@is_target=1,(SELECT COUNT(*) FROM club_receipts r INNER JOIN club_subscriptions s ON s.id=r.subscription_id WHERE s.branch_id=1 AND (r.created_at < '2000-01-01' OR r.updated_at < '2000-01-01' OR r.created_at IS NULL OR r.updated_at IS NULL)),0))

  UNION ALL SELECT
    '09 - bad DateTime values (potential members)',
    IF(@is_target = 1 AND (SELECT COUNT(*) FROM club_leads WHERE branch_id=1 AND (created_at < '2000-01-01' OR updated_at < '2000-01-01' OR created_at IS NULL OR updated_at IS NULL)) = 0, 'PASS', 'FAIL'),
    CONCAT('invalid rows=', IF(@is_target=1,(SELECT COUNT(*) FROM club_leads WHERE branch_id=1 AND (created_at < '2000-01-01' OR updated_at < '2000-01-01' OR created_at IS NULL OR updated_at IS NULL)),0))

  UNION ALL SELECT
    '10 - invalid member gender',
    IF(@is_target = 1 AND (SELECT COUNT(*) FROM club_members WHERE member_code LIKE 'MIG-%' AND gender NOT IN ('male','female')) = 0, 'PASS', 'FAIL'),
    CONCAT('invalid rows=', IF(@is_target=1,(SELECT COUNT(*) FROM club_members WHERE member_code LIKE 'MIG-%' AND gender NOT IN ('male','female')),0))

  UNION ALL SELECT
    '11 - invalid subscription gender',
    IF(@is_target = 1 AND (SELECT COUNT(*) FROM club_subscriptions WHERE branch_id=1 AND gender IS NOT NULL AND gender NOT IN ('male','female')) = 0, 'PASS', 'FAIL'),
    CONCAT('invalid rows=', IF(@is_target=1,(SELECT COUNT(*) FROM club_subscriptions WHERE branch_id=1 AND gender IS NOT NULL AND gender NOT IN ('male','female')),0))

  UNION ALL SELECT
    '12 - invalid subscription status',
    IF(@is_target = 1 AND (SELECT COUNT(*) FROM club_subscriptions WHERE branch_id=1 AND status NOT IN ('active','expired','upcoming','frozen')) = 0, 'PASS', 'FAIL'),
    CONCAT('invalid rows=', IF(@is_target=1,(SELECT COUNT(*) FROM club_subscriptions WHERE branch_id=1 AND status NOT IN ('active','expired','upcoming','frozen')),0))

  UNION ALL SELECT
    '13 - invalid payment method',
    IF(@is_target = 1 AND ((SELECT COUNT(*) FROM club_subscriptions WHERE branch_id=1 AND payment_method IS NOT NULL AND payment_method NOT IN ('cash','card','bank','online','visa','transfer','wallet')) + (SELECT COUNT(*) FROM club_receipts r INNER JOIN club_subscriptions s ON s.id=r.subscription_id WHERE s.branch_id=1 AND r.payment_method IS NOT NULL AND r.payment_method NOT IN ('cash','card','bank','online','visa','transfer','wallet'))) = 0, 'PASS', 'FAIL'),
    CONCAT('invalid rows=', IF(@is_target=1,((SELECT COUNT(*) FROM club_subscriptions WHERE branch_id=1 AND payment_method IS NOT NULL AND payment_method NOT IN ('cash','card','bank','online','visa','transfer','wallet')) + (SELECT COUNT(*) FROM club_receipts r INNER JOIN club_subscriptions s ON s.id=r.subscription_id WHERE s.branch_id=1 AND r.payment_method IS NOT NULL AND r.payment_method NOT IN ('cash','card','bank','online','visa','transfer','wallet'))),0))

  UNION ALL SELECT
    '14 - subscriptions without member/type',
    IF(@is_target = 1 AND (SELECT COUNT(*) FROM club_subscriptions s LEFT JOIN club_members m ON m.id=s.member_id LEFT JOIN club_subscription_types t ON t.id=s.subscription_type_id WHERE s.branch_id=1 AND (m.id IS NULL OR t.id IS NULL)) = 0, 'PASS', 'FAIL'),
    CONCAT('orphan rows=', IF(@is_target=1,(SELECT COUNT(*) FROM club_subscriptions s LEFT JOIN club_members m ON m.id=s.member_id LEFT JOIN club_subscription_types t ON t.id=s.subscription_type_id WHERE s.branch_id=1 AND (m.id IS NULL OR t.id IS NULL)),0))

  UNION ALL SELECT
    '15 - receipts without member/subscription',
    IF(@is_target = 1 AND (SELECT COUNT(*) FROM club_receipts r LEFT JOIN club_members m ON m.id=r.member_id LEFT JOIN club_subscriptions s ON s.id=r.subscription_id WHERE r.id IS NOT NULL AND (m.id IS NULL OR s.id IS NULL) AND COALESCE(s.branch_id,1)=1) = 0, 'PASS', 'FAIL'),
    CONCAT('orphan rows=', IF(@is_target=1,(SELECT COUNT(*) FROM club_receipts r LEFT JOIN club_members m ON m.id=r.member_id LEFT JOIN club_subscriptions s ON s.id=r.subscription_id WHERE r.id IS NOT NULL AND (m.id IS NULL OR s.id IS NULL) AND COALESCE(s.branch_id,1)=1),0))

  UNION ALL SELECT
    '16 - accounting balance mismatch',
    IF(@is_target = 1 AND (SELECT COUNT(*) FROM club_subscriptions WHERE branch_id=1 AND ABS(subscription_value - discount_value - paid_amount - remaining_amount) > 0.01) = 0, 'PASS', 'FAIL'),
    CONCAT('invalid rows=', IF(@is_target=1,(SELECT COUNT(*) FROM club_subscriptions WHERE branch_id=1 AND ABS(subscription_value - discount_value - paid_amount - remaining_amount) > 0.01),0))
) AS checks
ORDER BY check_name;

/* Result 2: database column definitions used by the four failing pages. */
SELECT table_name, column_name, column_type, is_nullable, column_default, extra
FROM information_schema.columns
WHERE table_schema = DATABASE()
  AND table_name IN ('club_members','club_subscriptions','club_receipts','club_leads')
  AND column_name IN ('id','member_code','subscription_number','receipt_number','branch_id','gender','status','payment_method','is_deleted','created_at','updated_at')
ORDER BY table_name, ordinal_position;

/* Result 3: if any count above is non-zero, these are the first exact bad rows. */
SELECT 'members_bad_datetime' AS issue, id AS record_id, member_code AS reference, created_at, updated_at
FROM club_members WHERE @is_target=1 AND member_code LIKE 'MIG-%' AND (created_at < '2000-01-01' OR updated_at < '2000-01-01' OR created_at IS NULL OR updated_at IS NULL)
UNION ALL
SELECT 'subscriptions_bad_datetime', id, subscription_number, created_at, updated_at
FROM club_subscriptions WHERE @is_target=1 AND branch_id=1 AND (created_at < '2000-01-01' OR updated_at < '2000-01-01' OR created_at IS NULL OR updated_at IS NULL)
UNION ALL
SELECT 'receipts_bad_datetime', r.id, r.receipt_number, r.created_at, r.updated_at
FROM club_receipts r INNER JOIN club_subscriptions s ON s.id=r.subscription_id WHERE @is_target=1 AND s.branch_id=1 AND (r.created_at < '2000-01-01' OR r.updated_at < '2000-01-01' OR r.created_at IS NULL OR r.updated_at IS NULL)
UNION ALL
SELECT 'leads_bad_datetime', id, CAST(id AS CHAR), created_at, updated_at
FROM club_leads WHERE @is_target=1 AND branch_id=1 AND (created_at < '2000-01-01' OR updated_at < '2000-01-01' OR created_at IS NULL OR updated_at IS NULL)
LIMIT 50;

/* Result 4: safe native table consistency check (no repair is performed). */
CHECK TABLE club_members, club_subscriptions, club_receipts, club_leads;
