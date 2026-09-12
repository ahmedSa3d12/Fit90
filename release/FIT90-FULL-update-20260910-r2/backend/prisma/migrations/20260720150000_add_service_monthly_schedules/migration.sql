CREATE TABLE `club_service_monthly_schedules` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `service_id` INTEGER NOT NULL,
  `employee_id` INTEGER NOT NULL,
  `category` ENUM('class', 'zumba', 'nutrition', 'spa', 'personal_training', 'inbody', 'additional') NOT NULL,
  `month` TINYINT NOT NULL,
  `year` SMALLINT NOT NULL,
  `status` ENUM('draft', 'published', 'archived') NOT NULL DEFAULT 'draft',
  `published_at` DATETIME(0) NULL,
  `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  `updated_at` DATETIME(0) NOT NULL,
  UNIQUE INDEX `service_monthly_unique` (`service_id`, `employee_id`, `month`, `year`),
  INDEX `club_service_monthly_schedules_category_status_idx` (`category`, `status`),
  PRIMARY KEY (`id`),
  CONSTRAINT `club_service_monthly_schedules_service_id_fkey`
    FOREIGN KEY (`service_id`) REFERENCES `club_services` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `club_schedules`
  ADD COLUMN `monthly_schedule_id` INTEGER NULL,
  ADD INDEX `club_schedules_monthly_schedule_id_idx` (`monthly_schedule_id`),
  ADD CONSTRAINT `club_schedules_monthly_schedule_id_fkey`
    FOREIGN KEY (`monthly_schedule_id`) REFERENCES `club_service_monthly_schedules` (`id`) ON DELETE SET NULL ON UPDATE NO ACTION;
