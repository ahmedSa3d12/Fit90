-- FIT90 subscription types for the customer-data import
-- Branch: Fit90 (branch_id = 1)
-- Safety: this file only ADDS missing package types. It does not delete or update any data.
-- New types are inactive with price 0.00 so they cannot accidentally be sold before pricing is configured.

START TRANSACTION;
SET @fit90_branch_id := 1;

-- Time-based memberships
INSERT INTO club_subscription_types
  (name, branch_id, price, days, is_special_offer, is_for_students, show_in_app, is_linked_to_sessions, sessions_count, is_linked_to_freeze, freeze_days, includes_spa, spa_count, is_active, created_at, updated_at)
SELECT '1 month', @fit90_branch_id, 0.00, 30, 0, 0, 0, 0, NULL, 0, NULL, 0, NULL, 0, NOW(3), NOW(3)
WHERE NOT EXISTS (SELECT 1 FROM club_subscription_types WHERE name = '1 month' AND branch_id = @fit90_branch_id);

INSERT INTO club_subscription_types
  (name, branch_id, price, days, is_special_offer, is_for_students, show_in_app, is_linked_to_sessions, sessions_count, is_linked_to_freeze, freeze_days, includes_spa, spa_count, is_active, created_at, updated_at)
SELECT '1 month premium', @fit90_branch_id, 0.00, 30, 0, 0, 0, 0, NULL, 0, NULL, 0, NULL, 0, NOW(3), NOW(3)
WHERE NOT EXISTS (SELECT 1 FROM club_subscription_types WHERE name = '1 month premium' AND branch_id = @fit90_branch_id);

INSERT INTO club_subscription_types
  (name, branch_id, price, days, is_special_offer, is_for_students, show_in_app, is_linked_to_sessions, sessions_count, is_linked_to_freeze, freeze_days, includes_spa, spa_count, is_active, created_at, updated_at)
SELECT 'golden month', @fit90_branch_id, 0.00, 30, 0, 0, 0, 0, NULL, 0, NULL, 0, NULL, 0, NOW(3), NOW(3)
WHERE NOT EXISTS (SELECT 1 FROM club_subscription_types WHERE name = 'golden month' AND branch_id = @fit90_branch_id);

INSERT INTO club_subscription_types
  (name, branch_id, price, days, is_special_offer, is_for_students, show_in_app, is_linked_to_sessions, sessions_count, is_linked_to_freeze, freeze_days, includes_spa, spa_count, is_active, created_at, updated_at)
SELECT '2 months', @fit90_branch_id, 0.00, 60, 0, 0, 0, 0, NULL, 0, NULL, 0, NULL, 0, NOW(3), NOW(3)
WHERE NOT EXISTS (SELECT 1 FROM club_subscription_types WHERE name = '2 months' AND branch_id = @fit90_branch_id);

INSERT INTO club_subscription_types
  (name, branch_id, price, days, is_special_offer, is_for_students, show_in_app, is_linked_to_sessions, sessions_count, is_linked_to_freeze, freeze_days, includes_spa, spa_count, is_active, created_at, updated_at)
SELECT '3 Months', @fit90_branch_id, 0.00, 90, 0, 0, 0, 0, NULL, 0, NULL, 0, NULL, 0, NOW(3), NOW(3)
WHERE NOT EXISTS (SELECT 1 FROM club_subscription_types WHERE name = '3 Months' AND branch_id = @fit90_branch_id);

INSERT INTO club_subscription_types
  (name, branch_id, price, days, is_special_offer, is_for_students, show_in_app, is_linked_to_sessions, sessions_count, is_linked_to_freeze, freeze_days, includes_spa, spa_count, is_active, created_at, updated_at)
SELECT '3 months premium', @fit90_branch_id, 0.00, 90, 0, 0, 0, 0, NULL, 0, NULL, 0, NULL, 0, NOW(3), NOW(3)
WHERE NOT EXISTS (SELECT 1 FROM club_subscription_types WHERE name = '3 months premium' AND branch_id = @fit90_branch_id);

INSERT INTO club_subscription_types
  (name, branch_id, price, days, is_special_offer, is_for_students, show_in_app, is_linked_to_sessions, sessions_count, is_linked_to_freeze, freeze_days, includes_spa, spa_count, is_active, created_at, updated_at)
SELECT '3 MONTHS SUMMER CHALLANGE', @fit90_branch_id, 0.00, 90, 1, 0, 0, 0, NULL, 0, NULL, 0, NULL, 0, NOW(3), NOW(3)
WHERE NOT EXISTS (SELECT 1 FROM club_subscription_types WHERE name = '3 MONTHS SUMMER CHALLANGE' AND branch_id = @fit90_branch_id);

INSERT INTO club_subscription_types
  (name, branch_id, price, days, is_special_offer, is_for_students, show_in_app, is_linked_to_sessions, sessions_count, is_linked_to_freeze, freeze_days, includes_spa, spa_count, is_active, created_at, updated_at)
SELECT '6 months', @fit90_branch_id, 0.00, 180, 0, 0, 0, 0, NULL, 0, NULL, 0, NULL, 0, NOW(3), NOW(3)
WHERE NOT EXISTS (SELECT 1 FROM club_subscription_types WHERE name = '6 months' AND branch_id = @fit90_branch_id);

INSERT INTO club_subscription_types
  (name, branch_id, price, days, is_special_offer, is_for_students, show_in_app, is_linked_to_sessions, sessions_count, is_linked_to_freeze, freeze_days, includes_spa, spa_count, is_active, created_at, updated_at)
SELECT '6 months premium', @fit90_branch_id, 0.00, 180, 0, 0, 0, 0, NULL, 0, NULL, 0, NULL, 0, NOW(3), NOW(3)
WHERE NOT EXISTS (SELECT 1 FROM club_subscription_types WHERE name = '6 months premium' AND branch_id = @fit90_branch_id);

INSERT INTO club_subscription_types
  (name, branch_id, price, days, is_special_offer, is_for_students, show_in_app, is_linked_to_sessions, sessions_count, is_linked_to_freeze, freeze_days, includes_spa, spa_count, is_active, created_at, updated_at)
SELECT 'annual membership', @fit90_branch_id, 0.00, 365, 0, 0, 0, 0, NULL, 0, NULL, 0, NULL, 0, NOW(3), NOW(3)
WHERE NOT EXISTS (SELECT 1 FROM club_subscription_types WHERE name = 'annual membership' AND branch_id = @fit90_branch_id);

INSERT INTO club_subscription_types
  (name, branch_id, price, days, is_special_offer, is_for_students, show_in_app, is_linked_to_sessions, sessions_count, is_linked_to_freeze, freeze_days, includes_spa, spa_count, is_active, created_at, updated_at)
SELECT 'Annual family membership', @fit90_branch_id, 0.00, 365, 0, 0, 0, 0, NULL, 0, NULL, 0, NULL, 0, NOW(3), NOW(3)
WHERE NOT EXISTS (SELECT 1 FROM club_subscription_types WHERE name = 'Annual family membership' AND branch_id = @fit90_branch_id);

INSERT INTO club_subscription_types
  (name, branch_id, price, days, is_special_offer, is_for_students, show_in_app, is_linked_to_sessions, sessions_count, is_linked_to_freeze, freeze_days, includes_spa, spa_count, is_active, created_at, updated_at)
SELECT 'Morning Annual Membership', @fit90_branch_id, 0.00, 365, 0, 0, 0, 0, NULL, 0, NULL, 0, NULL, 0, NOW(3), NOW(3)
WHERE NOT EXISTS (SELECT 1 FROM club_subscription_types WHERE name = 'Morning Annual Membership' AND branch_id = @fit90_branch_id);

INSERT INTO club_subscription_types
  (name, branch_id, price, days, is_special_offer, is_for_students, show_in_app, is_linked_to_sessions, sessions_count, is_linked_to_freeze, freeze_days, includes_spa, spa_count, is_active, created_at, updated_at)
SELECT 'Morning membership 6am - 1 pm', @fit90_branch_id, 0.00, 365, 0, 0, 0, 0, NULL, 0, NULL, 0, NULL, 0, NOW(3), NOW(3)
WHERE NOT EXISTS (SELECT 1 FROM club_subscription_types WHERE name = 'Morning membership 6am - 1 pm' AND branch_id = @fit90_branch_id);

INSERT INTO club_subscription_types
  (name, branch_id, price, days, is_special_offer, is_for_students, show_in_app, is_linked_to_sessions, sessions_count, is_linked_to_freeze, freeze_days, includes_spa, spa_count, is_active, created_at, updated_at)
SELECT 'pre sale', @fit90_branch_id, 0.00, 365, 1, 0, 0, 0, NULL, 0, NULL, 0, NULL, 0, NOW(3), NOW(3)
WHERE NOT EXISTS (SELECT 1 FROM club_subscription_types WHERE name = 'pre sale' AND branch_id = @fit90_branch_id);

INSERT INTO club_subscription_types
  (name, branch_id, price, days, is_special_offer, is_for_students, show_in_app, is_linked_to_sessions, sessions_count, is_linked_to_freeze, freeze_days, includes_spa, spa_count, is_active, created_at, updated_at)
SELECT 'annual monglish offer', @fit90_branch_id, 0.00, 365, 1, 0, 0, 0, NULL, 0, NULL, 0, NULL, 0, NOW(3), NOW(3)
WHERE NOT EXISTS (SELECT 1 FROM club_subscription_types WHERE name = 'annual monglish offer' AND branch_id = @fit90_branch_id);

INSERT INTO club_subscription_types
  (name, branch_id, price, days, is_special_offer, is_for_students, show_in_app, is_linked_to_sessions, sessions_count, is_linked_to_freeze, freeze_days, includes_spa, spa_count, is_active, created_at, updated_at)
SELECT 'students offer', @fit90_branch_id, 0.00, 365, 1, 1, 0, 0, NULL, 0, NULL, 0, NULL, 0, NOW(3), NOW(3)
WHERE NOT EXISTS (SELECT 1 FROM club_subscription_types WHERE name = 'students offer' AND branch_id = @fit90_branch_id);

INSERT INTO club_subscription_types
  (name, branch_id, price, days, is_special_offer, is_for_students, show_in_app, is_linked_to_sessions, sessions_count, is_linked_to_freeze, freeze_days, includes_spa, spa_count, is_active, created_at, updated_at)
SELECT 'students offer moharem bek', @fit90_branch_id, 0.00, 365, 1, 1, 0, 0, NULL, 0, NULL, 0, NULL, 0, NOW(3), NOW(3)
WHERE NOT EXISTS (SELECT 1 FROM club_subscription_types WHERE name = 'students offer moharem bek' AND branch_id = @fit90_branch_id);

INSERT INTO club_subscription_types
  (name, branch_id, price, days, is_special_offer, is_for_students, show_in_app, is_linked_to_sessions, sessions_count, is_linked_to_freeze, freeze_days, includes_spa, spa_count, is_active, created_at, updated_at)
SELECT 'Fit90 program', @fit90_branch_id, 0.00, 90, 0, 0, 0, 0, NULL, 0, NULL, 0, NULL, 0, NOW(3), NOW(3)
WHERE NOT EXISTS (SELECT 1 FROM club_subscription_types WHERE name = 'Fit90 program' AND branch_id = @fit90_branch_id);

INSERT INTO club_subscription_types
  (name, branch_id, price, days, is_special_offer, is_for_students, show_in_app, is_linked_to_sessions, sessions_count, is_linked_to_freeze, freeze_days, includes_spa, spa_count, is_active, created_at, updated_at)
SELECT 'Marines', @fit90_branch_id, 0.00, 180, 0, 0, 0, 0, NULL, 0, NULL, 0, NULL, 0, NOW(3), NOW(3)
WHERE NOT EXISTS (SELECT 1 FROM club_subscription_types WHERE name = 'Marines' AND branch_id = @fit90_branch_id);

-- Session packages (default validity is 90 days; configure prices and validity before activating them)
INSERT INTO club_subscription_types
  (name, branch_id, price, days, is_special_offer, is_for_students, show_in_app, is_linked_to_sessions, sessions_count, is_linked_to_freeze, freeze_days, includes_spa, spa_count, is_active, created_at, updated_at)
SELECT p.name, @fit90_branch_id, 0.00, 90, 0, 0, 0, 1, p.sessions, 0, NULL, 0, NULL, 0, NOW(3), NOW(3)
FROM (
  SELECT '1 session' AS name, 1 AS sessions UNION ALL
  SELECT '4 sessions', 4 UNION ALL
  SELECT '8 sessions', 8 UNION ALL
  SELECT '12 sessions', 12 UNION ALL
  SELECT '16 sessions', 16 UNION ALL
  SELECT '20 sessions', 20 UNION ALL
  SELECT '40 sessions', 40 UNION ALL
  SELECT 'head coach 8 sessions', 8 UNION ALL
  SELECT 'head coach12 sessions', 12 UNION ALL
  SELECT 'head coach 20 sessions', 20 UNION ALL
  SELECT 'head coach 40 sessions', 40 UNION ALL
  SELECT 'youth program 10 sessions', 10 UNION ALL
  SELECT 'youth program 20 sessions', 20 UNION ALL
  SELECT '8 sessions youth program head coach', 8 UNION ALL
  SELECT '20 sessions youth program head coach', 20
) AS p
WHERE NOT EXISTS (SELECT 1 FROM club_subscription_types t WHERE t.name = p.name AND t.branch_id = @fit90_branch_id);

-- Nutrition and classes packages
INSERT INTO club_subscription_types
  (name, branch_id, price, days, is_special_offer, is_for_students, show_in_app, is_linked_to_sessions, sessions_count, is_linked_to_freeze, freeze_days, includes_spa, spa_count, is_active, created_at, updated_at)
SELECT p.name, @fit90_branch_id, 0.00, p.days, 0, 0, 0, p.is_sessions, p.sessions, 0, NULL, 0, NULL, 0, NOW(3), NOW(3)
FROM (
  SELECT 'Nutrition 1 session' AS name, 90 AS days, 1 AS is_sessions, 1 AS sessions UNION ALL
  SELECT 'Nutrition 4 sessions', 90, 1, 4 UNION ALL
  SELECT 'Nutrition 8 sessions', 90, 1, 8 UNION ALL
  SELECT 'Nutrition 12 sessions', 90, 1, 12 UNION ALL
  SELECT '4 sessions classes', 90, 1, 4 UNION ALL
  SELECT '8 sessions classes', 90, 1, 8 UNION ALL
  SELECT '12 sessions classes', 90, 1, 12 UNION ALL
  SELECT '1 month full classes', 30, 0, NULL
) AS p
WHERE NOT EXISTS (SELECT 1 FROM club_subscription_types t WHERE t.name = p.name AND t.branch_id = @fit90_branch_id);

COMMIT;

-- Check what was added. Configure the price, duration and activate only the packages you will sell.
SELECT id, name, branch_id, price, days, is_linked_to_sessions, sessions_count, is_active
FROM club_subscription_types
WHERE branch_id = @fit90_branch_id
ORDER BY id;
