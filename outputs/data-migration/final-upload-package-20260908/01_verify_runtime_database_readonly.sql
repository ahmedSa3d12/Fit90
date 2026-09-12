/* READ ONLY -- run from phpMyAdmin > SQL tab, in either database. */
SELECT
  t.table_schema AS database_name,
  MAX(CASE WHEN t.table_name = 'club_members' THEN t.table_rows END) AS approx_members_rows,
  MAX(CASE WHEN t.table_name = 'club_subscriptions' THEN t.table_rows END) AS approx_subscriptions_rows,
  MAX(CASE WHEN t.table_name = 'club_receipts' THEN t.table_rows END) AS approx_receipts_rows,
  MAX(CASE WHEN t.table_name = 'club_leads' THEN t.table_rows END) AS approx_potential_members_rows,
  GROUP_CONCAT(t.table_name ORDER BY t.table_name SEPARATOR ', ') AS required_tables_found
FROM information_schema.tables t
WHERE t.table_schema IN ('metacodex_fit90', 'metacodecx_fit90')
  AND t.table_name IN ('club_members','club_subscriptions','club_receipts','club_leads')
GROUP BY t.table_schema
ORDER BY t.table_schema;

/* Exact import evidence in the database selected in phpMyAdmin. */
SELECT
  DATABASE() AS selected_database,
  (SELECT COUNT(*) FROM club_members WHERE branch_id=1 AND member_code LIKE 'MIG-%') AS migrated_members,
  (SELECT COUNT(*) FROM club_subscriptions WHERE branch_id=1) AS migrated_subscriptions,
  (SELECT COUNT(*) FROM club_receipts r INNER JOIN club_subscriptions s ON s.id=r.subscription_id WHERE s.branch_id=1) AS migrated_receipts,
  (SELECT COUNT(*) FROM club_leads WHERE branch_id=1) AS migrated_potential_members;
