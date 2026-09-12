CREATE TABLE club_provider_monthly_availabilities (
  id INTEGER NOT NULL AUTO_INCREMENT,
  employee_id INTEGER NOT NULL,
  category ENUM('class', 'zumba', 'nutrition', 'spa', 'personal_training', 'inbody', 'additional') NOT NULL DEFAULT 'nutrition',
  month TINYINT NOT NULL,
  year SMALLINT NOT NULL,
  status ENUM('draft', 'published', 'archived') NOT NULL DEFAULT 'draft',
  published_at DATETIME(0) NULL,
  created_at DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  updated_at DATETIME(0) NOT NULL,
  UNIQUE INDEX provider_monthly_availability_unique (employee_id, category, month, year),
  INDEX club_provider_monthly_availabilities_category_status_idx (category, status),
  PRIMARY KEY (id)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE club_availability_slots
  ADD COLUMN monthly_availability_id INTEGER NULL,
  ADD COLUMN booking_start_at DATETIME(0) NULL,
  ADD COLUMN booking_end_at DATETIME(0) NULL,
  ADD COLUMN cancelled_at DATETIME(0) NULL,
  ADD COLUMN cancellation_reason VARCHAR(500) NULL,
  ADD INDEX club_availability_slots_monthly_availability_id_idx (monthly_availability_id);

ALTER TABLE club_bookings
  ADD COLUMN availability_slot_id INTEGER NULL,
  ADD INDEX club_bookings_availability_slot_id_idx (availability_slot_id);

ALTER TABLE club_availability_slots
  ADD CONSTRAINT club_availability_slots_monthly_availability_id_fkey
  FOREIGN KEY (monthly_availability_id) REFERENCES club_provider_monthly_availabilities(id)
  ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE club_bookings
  ADD CONSTRAINT club_bookings_availability_slot_id_fkey
  FOREIGN KEY (availability_slot_id) REFERENCES club_availability_slots(id)
  ON DELETE NO ACTION ON UPDATE NO ACTION;

CREATE TEMPORARY TABLE tmp_valid_nutrition_availability_slots (
  id INTEGER NOT NULL PRIMARY KEY,
  trainer_id INTEGER NOT NULL,
  slot_date VARCHAR(10) NOT NULL
);

INSERT INTO tmp_valid_nutrition_availability_slots (id, trainer_id, slot_date)
SELECT s.id, s.trainer_id, s.slot_date
FROM club_availability_slots s
JOIN club_trainers t ON t.id = s.trainer_id
WHERE s.module_type = 'nutrition'
  AND s.trainer_id IS NOT NULL
  AND s.service_id IS NULL
  AND s.is_deleted = 0
  AND t.is_active = 1
  AND t.is_deleted = 0
  AND (LOWER(COALESCE(t.specialization, '')) LIKE '%nutrition%' OR t.specialization LIKE '%تغذية%')
  AND STR_TO_DATE(s.slot_date, '%Y-%m-%d') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM club_availability_slots overlap_slot
    WHERE overlap_slot.id <> s.id
      AND overlap_slot.module_type = 'nutrition'
      AND overlap_slot.trainer_id = s.trainer_id
      AND overlap_slot.slot_date = s.slot_date
      AND overlap_slot.is_deleted = 0
      AND overlap_slot.start_time < s.end_time
      AND overlap_slot.end_time > s.start_time
  );

INSERT INTO club_provider_monthly_availabilities
  (employee_id, category, month, year, status, published_at, created_at, updated_at)
SELECT
  valid.trainer_id, 'nutrition', MONTH(STR_TO_DATE(valid.slot_date, '%Y-%m-%d')),
  YEAR(STR_TO_DATE(valid.slot_date, '%Y-%m-%d')), 'published', CURRENT_TIMESTAMP(0),
  MIN(s.created_at), CURRENT_TIMESTAMP(0)
FROM tmp_valid_nutrition_availability_slots valid
JOIN club_availability_slots s ON s.id = valid.id
GROUP BY valid.trainer_id, YEAR(STR_TO_DATE(valid.slot_date, '%Y-%m-%d')), MONTH(STR_TO_DATE(valid.slot_date, '%Y-%m-%d'));

UPDATE club_availability_slots s
JOIN tmp_valid_nutrition_availability_slots valid ON valid.id = s.id
JOIN club_provider_monthly_availabilities p
  ON p.employee_id = valid.trainer_id
 AND p.category = 'nutrition'
 AND p.year = YEAR(STR_TO_DATE(valid.slot_date, '%Y-%m-%d'))
 AND p.month = MONTH(STR_TO_DATE(valid.slot_date, '%Y-%m-%d'))
SET s.monthly_availability_id = p.id;

DROP TEMPORARY TABLE tmp_valid_nutrition_availability_slots;
UPDATE club_bookings b
JOIN club_schedules sc ON sc.id = b.schedule_id
JOIN club_availability_slots a
  ON a.module_type = 'nutrition'
 AND a.trainer_id = b.employee_id
 AND a.slot_date = b.booking_date
 AND sc.start_time >= a.start_time
 AND sc.end_time <= a.end_time
SET b.availability_slot_id = a.id
WHERE b.is_deleted = 0
  AND sc.notes LIKE 'nutrition-availability:%';