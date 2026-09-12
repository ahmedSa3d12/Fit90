-- FIT90: replace the employees table with the 26 supplied employees and their user accounts.
-- Run this file only after selecting database metacodecx_fit90 in phpMyAdmin.
-- The following employee-only dependent records are intentionally cleared: files, allowances/deductions, attendance, and branch assignments.
-- Employment contracts, schedules, bookings, invoices, and historical club records are intentionally preserved.
-- Every imported user is active; General Manager accounts (job code 1) start as system admins (level 1).
-- The initial password is 102030 stored as a hash and upgraded to bcrypt at first login.

START TRANSACTION;

-- Clear employee-only dependent records before deleting employees.
DELETE FROM emp_files;
DELETE FROM hr_finance_employes;
DELETE FROM hr_emp_dwam_details;
DELETE FROM hr_emp_dwam;
DELETE FROM employees_branches;
DELETE FROM employees;

INSERT INTO employees (emp_code, employee, branch_id_fk, phone, mosma_wazefy_code, mosma_wazefy_n, edara_id, emp_type, employee_type, employment_type, leave_emp, demo_card, shahadt_jaish, tamin_rkm, khedma_year)
VALUES
  (1001, 'dr.fadi elsewesy', 1, '1000008407', 1, 'مدير عام', 1, 1, 1, 'admin', 0, '0', 'no', 0, 0),
  (1002, 'mahmoud ossama', 1, '1004433293', 1, 'مدير عام', 1, 1, 1, 'admin', 0, '0', 'no', 0, 0),
  (1003, 'mostafa hegazy', 1, '1102009791', 17, 'مدير اللياقة البدنية', NULL, 1, 1, 'fitness manager', 0, '0', 'no', 0, 0),
  (1004, 'mohamed yasser', 1, '1007653349', 15, 'مدرب', NULL, 1, 1, 'personal trainer', 0, '0', 'no', 0, 0),
  (1005, 'fares hassan', 1, '1025123658', 15, 'مدرب', NULL, 1, 1, 'personal trainer', 0, '0', 'no', 0, 0),
  (1006, 'menna hassan', 1, '1080694454', 15, 'مدرب', NULL, 1, 1, 'personal trainer', 0, '0', 'no', 0, 0),
  (1007, 'raef ramadan', 1, '1068061170', 15, 'مدرب', NULL, 1, 1, 'personal trainer', 0, '0', 'no', 0, 0),
  (1008, 'breksam attia', 1, '1017148793', 15, 'مدرب', NULL, 1, 1, 'personal trainer', 0, '0', 'no', 0, 0),
  (1009, 'huda gamal', 1, '1094779688', 15, 'مدرب', NULL, 1, 1, 'personal trainer', 0, '0', 'no', 0, 0),
  (1010, 'mohamed bakr', 1, '1017436313', 15, 'مدرب', NULL, 1, 1, 'personal trainer', 0, '0', 'no', 0, 0),
  (1011, 'asmaa samir', 1, '1096629985', 15, 'مدرب', NULL, 1, 1, 'personal trainer', 0, '0', 'no', 0, 0),
  (1012, 'aly hesham', 1, '1025334772', 15, 'مدرب', NULL, 1, 1, 'personal trainer', 0, '0', 'no', 0, 0),
  (1013, 'ahmed farouq', 1, '1220313220', 15, 'مدرب', NULL, 1, 1, 'personal trainer', 0, '0', 'no', 0, 0),
  (1014, 'radwa sameh', 1, '1020390977', 15, 'مدرب', NULL, 1, 1, 'personal trainer', 0, '0', 'no', 0, 0),
  (1015, 'abdelrahman mansor', 1, '1066752855', 15, 'مدرب', NULL, 1, 1, 'personal trainer', 0, '0', 'no', 0, 0),
  (1016, 'amr khaled', 1, '1010982786', 15, 'مدرب', NULL, 1, 1, 'personal trainer', 0, '0', 'no', 0, 0),
  (1017, 'omar nabil', 1, '1011791477', 15, 'مدرب', NULL, 1, 1, 'personal trainer', 0, '0', 'no', 0, 0),
  (1018, 'retaj samy', 1, '1080454491', 15, 'مدرب', NULL, 1, 1, 'personal trainer', 0, '0', 'no', 0, 0),
  (1019, 'mostafa gamal', 1, '1005286947', 9, 'أخصائي تغذية', 1, 1, 1, 'nutritionist', 0, '0', 'no', 0, 0),
  (1020, 'mohamed ossama', 1, '1212501854', 6, 'أخصائي سبا', 6, 1, 1, 'masseur', 0, '0', 'no', 0, 0),
  (1021, 'nada elsayed', 1, '1027125851', 6, 'أخصائي سبا', 6, 1, 1, 'masseur', 0, '0', 'no', 0, 0),
  (1022, 'heba mohamed', 1, '1070909129', 18, 'مدير العمليات', NULL, 1, 1, 'operation manager', 0, '0', 'no', 0, 0),
  (1023, 'youssef mohamed', 1, '1113444772', 5, 'موظف استقبال', 5, 1, 1, 'receptionist', 0, '0', 'no', 0, 0),
  (1024, 'kholoud nasser', 1, '1275165680', 5, 'موظف استقبال', 5, 1, 1, 'receptionist', 0, '0', 'no', 0, 0),
  (1025, 'fares waleed', 1, '1070909130', 12, 'أخصائي مبيعات', 4, 1, 1, 'sales', 0, '0', 'no', 0, 0),
  (1026, 'ahmed hussen', 1, '1070909131', 12, 'أخصائي مبيعات', 4, 1, 1, 'sales', 0, '0', 'no', 0, 0);

SET @initial_password_hash = SHA1(MD5('102030'));

-- Keep an existing account only when it already uses one of the supplied usernames; update its link and password.
UPDATE users
SET emp_code = (SELECT id FROM employees WHERE emp_code = 1001),
    name = 'dr.fadi elsewesy',
    password = @initial_password_hash,
    level = 1,
    branch_id_fk = 1,
    approved = 1,
    app_pass = NULL,
    user_pass = NULL,
    x_y_z = NULL,
    pass_demo = NULL,
    must_change_password = 0
WHERE username = 'dr.fadi elsewesy';

UPDATE users
SET emp_code = (SELECT id FROM employees WHERE emp_code = 1002),
    name = 'mahmoud ossama',
    password = @initial_password_hash,
    level = 1,
    branch_id_fk = 1,
    approved = 1,
    app_pass = NULL,
    user_pass = NULL,
    x_y_z = NULL,
    pass_demo = NULL,
    must_change_password = 0
WHERE username = 'mahmoud ossama';

UPDATE users
SET emp_code = (SELECT id FROM employees WHERE emp_code = 1003),
    name = 'mostafa hegazy',
    password = @initial_password_hash,
    level = 2,
    branch_id_fk = 1,
    approved = 1,
    app_pass = NULL,
    user_pass = NULL,
    x_y_z = NULL,
    pass_demo = NULL,
    must_change_password = 0
WHERE username = 'mostafa hegazy';

UPDATE users
SET emp_code = (SELECT id FROM employees WHERE emp_code = 1004),
    name = 'mohamed yasser',
    password = @initial_password_hash,
    level = 2,
    branch_id_fk = 1,
    approved = 1,
    app_pass = NULL,
    user_pass = NULL,
    x_y_z = NULL,
    pass_demo = NULL,
    must_change_password = 0
WHERE username = 'mohamed yasser';

UPDATE users
SET emp_code = (SELECT id FROM employees WHERE emp_code = 1005),
    name = 'fares hassan',
    password = @initial_password_hash,
    level = 2,
    branch_id_fk = 1,
    approved = 1,
    app_pass = NULL,
    user_pass = NULL,
    x_y_z = NULL,
    pass_demo = NULL,
    must_change_password = 0
WHERE username = 'fares hassan';

UPDATE users
SET emp_code = (SELECT id FROM employees WHERE emp_code = 1006),
    name = 'menna hassan',
    password = @initial_password_hash,
    level = 2,
    branch_id_fk = 1,
    approved = 1,
    app_pass = NULL,
    user_pass = NULL,
    x_y_z = NULL,
    pass_demo = NULL,
    must_change_password = 0
WHERE username = 'menna hassan';

UPDATE users
SET emp_code = (SELECT id FROM employees WHERE emp_code = 1007),
    name = 'raef ramadan',
    password = @initial_password_hash,
    level = 2,
    branch_id_fk = 1,
    approved = 1,
    app_pass = NULL,
    user_pass = NULL,
    x_y_z = NULL,
    pass_demo = NULL,
    must_change_password = 0
WHERE username = 'raef ramadan';

UPDATE users
SET emp_code = (SELECT id FROM employees WHERE emp_code = 1008),
    name = 'breksam attia',
    password = @initial_password_hash,
    level = 2,
    branch_id_fk = 1,
    approved = 1,
    app_pass = NULL,
    user_pass = NULL,
    x_y_z = NULL,
    pass_demo = NULL,
    must_change_password = 0
WHERE username = 'breksam attia';

UPDATE users
SET emp_code = (SELECT id FROM employees WHERE emp_code = 1009),
    name = 'huda gamal',
    password = @initial_password_hash,
    level = 2,
    branch_id_fk = 1,
    approved = 1,
    app_pass = NULL,
    user_pass = NULL,
    x_y_z = NULL,
    pass_demo = NULL,
    must_change_password = 0
WHERE username = 'huda gamal';

UPDATE users
SET emp_code = (SELECT id FROM employees WHERE emp_code = 1010),
    name = 'mohamed bakr',
    password = @initial_password_hash,
    level = 2,
    branch_id_fk = 1,
    approved = 1,
    app_pass = NULL,
    user_pass = NULL,
    x_y_z = NULL,
    pass_demo = NULL,
    must_change_password = 0
WHERE username = 'mohamed bakr';

UPDATE users
SET emp_code = (SELECT id FROM employees WHERE emp_code = 1011),
    name = 'asmaa samir',
    password = @initial_password_hash,
    level = 2,
    branch_id_fk = 1,
    approved = 1,
    app_pass = NULL,
    user_pass = NULL,
    x_y_z = NULL,
    pass_demo = NULL,
    must_change_password = 0
WHERE username = 'asmaa samir';

UPDATE users
SET emp_code = (SELECT id FROM employees WHERE emp_code = 1012),
    name = 'aly hesham',
    password = @initial_password_hash,
    level = 2,
    branch_id_fk = 1,
    approved = 1,
    app_pass = NULL,
    user_pass = NULL,
    x_y_z = NULL,
    pass_demo = NULL,
    must_change_password = 0
WHERE username = 'aly hesham';

UPDATE users
SET emp_code = (SELECT id FROM employees WHERE emp_code = 1013),
    name = 'ahmed farouq',
    password = @initial_password_hash,
    level = 2,
    branch_id_fk = 1,
    approved = 1,
    app_pass = NULL,
    user_pass = NULL,
    x_y_z = NULL,
    pass_demo = NULL,
    must_change_password = 0
WHERE username = 'ahmed farouq';

UPDATE users
SET emp_code = (SELECT id FROM employees WHERE emp_code = 1014),
    name = 'radwa sameh',
    password = @initial_password_hash,
    level = 2,
    branch_id_fk = 1,
    approved = 1,
    app_pass = NULL,
    user_pass = NULL,
    x_y_z = NULL,
    pass_demo = NULL,
    must_change_password = 0
WHERE username = 'radwa sameh';

UPDATE users
SET emp_code = (SELECT id FROM employees WHERE emp_code = 1015),
    name = 'abdelrahman mansor',
    password = @initial_password_hash,
    level = 2,
    branch_id_fk = 1,
    approved = 1,
    app_pass = NULL,
    user_pass = NULL,
    x_y_z = NULL,
    pass_demo = NULL,
    must_change_password = 0
WHERE username = 'abdelrahman mansor';

UPDATE users
SET emp_code = (SELECT id FROM employees WHERE emp_code = 1016),
    name = 'amr khaled',
    password = @initial_password_hash,
    level = 2,
    branch_id_fk = 1,
    approved = 1,
    app_pass = NULL,
    user_pass = NULL,
    x_y_z = NULL,
    pass_demo = NULL,
    must_change_password = 0
WHERE username = 'amr khaled';

UPDATE users
SET emp_code = (SELECT id FROM employees WHERE emp_code = 1017),
    name = 'omar nabil',
    password = @initial_password_hash,
    level = 2,
    branch_id_fk = 1,
    approved = 1,
    app_pass = NULL,
    user_pass = NULL,
    x_y_z = NULL,
    pass_demo = NULL,
    must_change_password = 0
WHERE username = 'omar nabil';

UPDATE users
SET emp_code = (SELECT id FROM employees WHERE emp_code = 1018),
    name = 'retaj samy',
    password = @initial_password_hash,
    level = 2,
    branch_id_fk = 1,
    approved = 1,
    app_pass = NULL,
    user_pass = NULL,
    x_y_z = NULL,
    pass_demo = NULL,
    must_change_password = 0
WHERE username = 'retaj samy';

UPDATE users
SET emp_code = (SELECT id FROM employees WHERE emp_code = 1019),
    name = 'mostafa gamal',
    password = @initial_password_hash,
    level = 2,
    branch_id_fk = 1,
    approved = 1,
    app_pass = NULL,
    user_pass = NULL,
    x_y_z = NULL,
    pass_demo = NULL,
    must_change_password = 0
WHERE username = 'mostafa gamal';

UPDATE users
SET emp_code = (SELECT id FROM employees WHERE emp_code = 1020),
    name = 'mohamed ossama',
    password = @initial_password_hash,
    level = 2,
    branch_id_fk = 1,
    approved = 1,
    app_pass = NULL,
    user_pass = NULL,
    x_y_z = NULL,
    pass_demo = NULL,
    must_change_password = 0
WHERE username = 'mohamed ossama';

UPDATE users
SET emp_code = (SELECT id FROM employees WHERE emp_code = 1021),
    name = 'nada elsayed',
    password = @initial_password_hash,
    level = 2,
    branch_id_fk = 1,
    approved = 1,
    app_pass = NULL,
    user_pass = NULL,
    x_y_z = NULL,
    pass_demo = NULL,
    must_change_password = 0
WHERE username = 'nada elsayed';

UPDATE users
SET emp_code = (SELECT id FROM employees WHERE emp_code = 1022),
    name = 'heba mohamed',
    password = @initial_password_hash,
    level = 2,
    branch_id_fk = 1,
    approved = 1,
    app_pass = NULL,
    user_pass = NULL,
    x_y_z = NULL,
    pass_demo = NULL,
    must_change_password = 0
WHERE username = 'heba mohamed';

UPDATE users
SET emp_code = (SELECT id FROM employees WHERE emp_code = 1023),
    name = 'youssef mohamed',
    password = @initial_password_hash,
    level = 2,
    branch_id_fk = 1,
    approved = 1,
    app_pass = NULL,
    user_pass = NULL,
    x_y_z = NULL,
    pass_demo = NULL,
    must_change_password = 0
WHERE username = 'youssef mohamed';

UPDATE users
SET emp_code = (SELECT id FROM employees WHERE emp_code = 1024),
    name = 'kholoud nasser',
    password = @initial_password_hash,
    level = 2,
    branch_id_fk = 1,
    approved = 1,
    app_pass = NULL,
    user_pass = NULL,
    x_y_z = NULL,
    pass_demo = NULL,
    must_change_password = 0
WHERE username = 'kholoud nasser';

UPDATE users
SET emp_code = (SELECT id FROM employees WHERE emp_code = 1025),
    name = 'fares waleed',
    password = @initial_password_hash,
    level = 2,
    branch_id_fk = 1,
    approved = 1,
    app_pass = NULL,
    user_pass = NULL,
    x_y_z = NULL,
    pass_demo = NULL,
    must_change_password = 0
WHERE username = 'fares waleed';

UPDATE users
SET emp_code = (SELECT id FROM employees WHERE emp_code = 1026),
    name = 'ahmed hussen',
    password = @initial_password_hash,
    level = 2,
    branch_id_fk = 1,
    approved = 1,
    app_pass = NULL,
    user_pass = NULL,
    x_y_z = NULL,
    pass_demo = NULL,
    must_change_password = 0
WHERE username = 'ahmed hussen';

-- Create any accounts that do not already exist.
INSERT INTO users (emp_code, username, password, name, level, branch_id_fk, approved, device_token, must_change_password)
SELECT e.id, 'dr.fadi elsewesy', @initial_password_hash, 'dr.fadi elsewesy', 1, e.branch_id_fk, 1, '', 0
FROM employees e
WHERE e.emp_code = 1001
  AND NOT EXISTS (SELECT 1 FROM users u WHERE u.username = 'dr.fadi elsewesy')
UNION ALL
SELECT e.id, 'mahmoud ossama', @initial_password_hash, 'mahmoud ossama', 1, e.branch_id_fk, 1, '', 0
FROM employees e
WHERE e.emp_code = 1002
  AND NOT EXISTS (SELECT 1 FROM users u WHERE u.username = 'mahmoud ossama')
UNION ALL
SELECT e.id, 'mostafa hegazy', @initial_password_hash, 'mostafa hegazy', 2, e.branch_id_fk, 1, '', 0
FROM employees e
WHERE e.emp_code = 1003
  AND NOT EXISTS (SELECT 1 FROM users u WHERE u.username = 'mostafa hegazy')
UNION ALL
SELECT e.id, 'mohamed yasser', @initial_password_hash, 'mohamed yasser', 2, e.branch_id_fk, 1, '', 0
FROM employees e
WHERE e.emp_code = 1004
  AND NOT EXISTS (SELECT 1 FROM users u WHERE u.username = 'mohamed yasser')
UNION ALL
SELECT e.id, 'fares hassan', @initial_password_hash, 'fares hassan', 2, e.branch_id_fk, 1, '', 0
FROM employees e
WHERE e.emp_code = 1005
  AND NOT EXISTS (SELECT 1 FROM users u WHERE u.username = 'fares hassan')
UNION ALL
SELECT e.id, 'menna hassan', @initial_password_hash, 'menna hassan', 2, e.branch_id_fk, 1, '', 0
FROM employees e
WHERE e.emp_code = 1006
  AND NOT EXISTS (SELECT 1 FROM users u WHERE u.username = 'menna hassan')
UNION ALL
SELECT e.id, 'raef ramadan', @initial_password_hash, 'raef ramadan', 2, e.branch_id_fk, 1, '', 0
FROM employees e
WHERE e.emp_code = 1007
  AND NOT EXISTS (SELECT 1 FROM users u WHERE u.username = 'raef ramadan')
UNION ALL
SELECT e.id, 'breksam attia', @initial_password_hash, 'breksam attia', 2, e.branch_id_fk, 1, '', 0
FROM employees e
WHERE e.emp_code = 1008
  AND NOT EXISTS (SELECT 1 FROM users u WHERE u.username = 'breksam attia')
UNION ALL
SELECT e.id, 'huda gamal', @initial_password_hash, 'huda gamal', 2, e.branch_id_fk, 1, '', 0
FROM employees e
WHERE e.emp_code = 1009
  AND NOT EXISTS (SELECT 1 FROM users u WHERE u.username = 'huda gamal')
UNION ALL
SELECT e.id, 'mohamed bakr', @initial_password_hash, 'mohamed bakr', 2, e.branch_id_fk, 1, '', 0
FROM employees e
WHERE e.emp_code = 1010
  AND NOT EXISTS (SELECT 1 FROM users u WHERE u.username = 'mohamed bakr')
UNION ALL
SELECT e.id, 'asmaa samir', @initial_password_hash, 'asmaa samir', 2, e.branch_id_fk, 1, '', 0
FROM employees e
WHERE e.emp_code = 1011
  AND NOT EXISTS (SELECT 1 FROM users u WHERE u.username = 'asmaa samir')
UNION ALL
SELECT e.id, 'aly hesham', @initial_password_hash, 'aly hesham', 2, e.branch_id_fk, 1, '', 0
FROM employees e
WHERE e.emp_code = 1012
  AND NOT EXISTS (SELECT 1 FROM users u WHERE u.username = 'aly hesham')
UNION ALL
SELECT e.id, 'ahmed farouq', @initial_password_hash, 'ahmed farouq', 2, e.branch_id_fk, 1, '', 0
FROM employees e
WHERE e.emp_code = 1013
  AND NOT EXISTS (SELECT 1 FROM users u WHERE u.username = 'ahmed farouq')
UNION ALL
SELECT e.id, 'radwa sameh', @initial_password_hash, 'radwa sameh', 2, e.branch_id_fk, 1, '', 0
FROM employees e
WHERE e.emp_code = 1014
  AND NOT EXISTS (SELECT 1 FROM users u WHERE u.username = 'radwa sameh')
UNION ALL
SELECT e.id, 'abdelrahman mansor', @initial_password_hash, 'abdelrahman mansor', 2, e.branch_id_fk, 1, '', 0
FROM employees e
WHERE e.emp_code = 1015
  AND NOT EXISTS (SELECT 1 FROM users u WHERE u.username = 'abdelrahman mansor')
UNION ALL
SELECT e.id, 'amr khaled', @initial_password_hash, 'amr khaled', 2, e.branch_id_fk, 1, '', 0
FROM employees e
WHERE e.emp_code = 1016
  AND NOT EXISTS (SELECT 1 FROM users u WHERE u.username = 'amr khaled')
UNION ALL
SELECT e.id, 'omar nabil', @initial_password_hash, 'omar nabil', 2, e.branch_id_fk, 1, '', 0
FROM employees e
WHERE e.emp_code = 1017
  AND NOT EXISTS (SELECT 1 FROM users u WHERE u.username = 'omar nabil')
UNION ALL
SELECT e.id, 'retaj samy', @initial_password_hash, 'retaj samy', 2, e.branch_id_fk, 1, '', 0
FROM employees e
WHERE e.emp_code = 1018
  AND NOT EXISTS (SELECT 1 FROM users u WHERE u.username = 'retaj samy')
UNION ALL
SELECT e.id, 'mostafa gamal', @initial_password_hash, 'mostafa gamal', 2, e.branch_id_fk, 1, '', 0
FROM employees e
WHERE e.emp_code = 1019
  AND NOT EXISTS (SELECT 1 FROM users u WHERE u.username = 'mostafa gamal')
UNION ALL
SELECT e.id, 'mohamed ossama', @initial_password_hash, 'mohamed ossama', 2, e.branch_id_fk, 1, '', 0
FROM employees e
WHERE e.emp_code = 1020
  AND NOT EXISTS (SELECT 1 FROM users u WHERE u.username = 'mohamed ossama')
UNION ALL
SELECT e.id, 'nada elsayed', @initial_password_hash, 'nada elsayed', 2, e.branch_id_fk, 1, '', 0
FROM employees e
WHERE e.emp_code = 1021
  AND NOT EXISTS (SELECT 1 FROM users u WHERE u.username = 'nada elsayed')
UNION ALL
SELECT e.id, 'heba mohamed', @initial_password_hash, 'heba mohamed', 2, e.branch_id_fk, 1, '', 0
FROM employees e
WHERE e.emp_code = 1022
  AND NOT EXISTS (SELECT 1 FROM users u WHERE u.username = 'heba mohamed')
UNION ALL
SELECT e.id, 'youssef mohamed', @initial_password_hash, 'youssef mohamed', 2, e.branch_id_fk, 1, '', 0
FROM employees e
WHERE e.emp_code = 1023
  AND NOT EXISTS (SELECT 1 FROM users u WHERE u.username = 'youssef mohamed')
UNION ALL
SELECT e.id, 'kholoud nasser', @initial_password_hash, 'kholoud nasser', 2, e.branch_id_fk, 1, '', 0
FROM employees e
WHERE e.emp_code = 1024
  AND NOT EXISTS (SELECT 1 FROM users u WHERE u.username = 'kholoud nasser')
UNION ALL
SELECT e.id, 'fares waleed', @initial_password_hash, 'fares waleed', 2, e.branch_id_fk, 1, '', 0
FROM employees e
WHERE e.emp_code = 1025
  AND NOT EXISTS (SELECT 1 FROM users u WHERE u.username = 'fares waleed')
UNION ALL
SELECT e.id, 'ahmed hussen', @initial_password_hash, 'ahmed hussen', 2, e.branch_id_fk, 1, '', 0
FROM employees e
WHERE e.emp_code = 1026
  AND NOT EXISTS (SELECT 1 FROM users u WHERE u.username = 'ahmed hussen');

COMMIT;

SELECT COUNT(*) AS imported_employees FROM employees;
SELECT COUNT(*) AS imported_users FROM users WHERE emp_code IN (SELECT id FROM employees WHERE emp_code BETWEEN 1001 AND 1026);
