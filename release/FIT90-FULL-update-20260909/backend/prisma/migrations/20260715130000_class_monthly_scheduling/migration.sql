CREATE TABLE IF NOT EXISTS `club_class_monthly_schedules` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `class_id` INTEGER NOT NULL,
  `trainer_id` INTEGER NOT NULL,
  `month` TINYINT NOT NULL,
  `year` SMALLINT NOT NULL,
  `status` ENUM('draft', 'published', 'archived') NOT NULL DEFAULT 'draft',
  `published_at` DATETIME(0) NULL,
  `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  `updated_at` DATETIME(0) NOT NULL,

  UNIQUE INDEX `club_class_monthly_schedules_class_id_trainer_id_month_year_key` (`class_id`, `trainer_id`, `month`, `year`),
  INDEX `club_class_monthly_schedules_status_idx` (`status`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS `club_class_schedule_slots` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `monthly_schedule_id` INTEGER NOT NULL,
  `start_at` DATETIME(0) NOT NULL,
  `end_at` DATETIME(0) NOT NULL,
  `booking_start_at` DATETIME(0) NULL,
  `booking_end_at` DATETIME(0) NULL,
  `capacity` INTEGER NOT NULL,
  `status` ENUM('available', 'unavailable', 'cancelled') NOT NULL DEFAULT 'available',
  `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  `updated_at` DATETIME(0) NOT NULL,

  INDEX `club_class_schedule_slots_monthly_schedule_id_idx` (`monthly_schedule_id`),
  INDEX `club_class_schedule_slots_start_at_idx` (`start_at`),
  INDEX `club_class_schedule_slots_status_idx` (`status`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS `club_class_additional_services` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `class_id` INTEGER NOT NULL,
  `service_id` INTEGER NOT NULL,
  `is_required` BOOLEAN NOT NULL DEFAULT false,
  `is_active` BOOLEAN NOT NULL DEFAULT true,
  `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  `updated_at` DATETIME(0) NOT NULL,

  UNIQUE INDEX `club_class_additional_services_class_id_service_id_key` (`class_id`, `service_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS `club_slot_additional_services` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `slot_id` INTEGER NOT NULL,
  `service_id` INTEGER NOT NULL,
  `capacity` INTEGER NOT NULL,
  `is_required` BOOLEAN NOT NULL DEFAULT false,
  `is_active` BOOLEAN NOT NULL DEFAULT true,
  `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  `updated_at` DATETIME(0) NOT NULL,

  UNIQUE INDEX `club_slot_additional_services_slot_id_service_id_key` (`slot_id`, `service_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS `club_class_bookings` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `slot_id` INTEGER NOT NULL,
  `user_id` INTEGER NOT NULL,
  `status` ENUM('confirmed', 'cancelled', 'completed', 'no_show') NOT NULL DEFAULT 'confirmed',
  `booked_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  `cancelled_at` DATETIME(0) NULL,
  `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  `updated_at` DATETIME(0) NOT NULL,

  UNIQUE INDEX `club_class_bookings_slot_id_user_id_key` (`slot_id`, `user_id`),
  INDEX `club_class_bookings_slot_id_status_idx` (`slot_id`, `status`),
  INDEX `club_class_bookings_user_id_status_idx` (`user_id`, `status`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS `club_booking_additional_services` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `booking_id` INTEGER NOT NULL,
  `slot_additional_service_id` INTEGER NOT NULL,
  `service_id` INTEGER NOT NULL,
  `status` ENUM('confirmed', 'cancelled', 'completed') NOT NULL DEFAULT 'confirmed',
  `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  `updated_at` DATETIME(0) NOT NULL,

  UNIQUE INDEX `club_booking_additional_services_booking_id_service_id_key` (`booking_id`, `service_id`),
  INDEX `booking_services_slot_service_status_idx` (`slot_additional_service_id`, `status`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci ENGINE = InnoDB;

ALTER TABLE `club_class_monthly_schedules`
  ADD CONSTRAINT `club_class_monthly_schedules_class_id_fkey` FOREIGN KEY (`class_id`) REFERENCES `club_classes`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION,
  ADD CONSTRAINT `club_class_monthly_schedules_trainer_id_fkey` FOREIGN KEY (`trainer_id`) REFERENCES `club_trainers`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE `club_class_schedule_slots`
  ADD CONSTRAINT `club_class_schedule_slots_monthly_schedule_id_fkey` FOREIGN KEY (`monthly_schedule_id`) REFERENCES `club_class_monthly_schedules`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE `club_class_additional_services`
  ADD CONSTRAINT `club_class_additional_services_class_id_fkey` FOREIGN KEY (`class_id`) REFERENCES `club_classes`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION,
  ADD CONSTRAINT `club_class_additional_services_service_id_fkey` FOREIGN KEY (`service_id`) REFERENCES `club_services`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE `club_slot_additional_services`
  ADD CONSTRAINT `club_slot_additional_services_slot_id_fkey` FOREIGN KEY (`slot_id`) REFERENCES `club_class_schedule_slots`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION,
  ADD CONSTRAINT `club_slot_additional_services_service_id_fkey` FOREIGN KEY (`service_id`) REFERENCES `club_services`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE `club_class_bookings`
  ADD CONSTRAINT `club_class_bookings_slot_id_fkey` FOREIGN KEY (`slot_id`) REFERENCES `club_class_schedule_slots`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  ADD CONSTRAINT `club_class_bookings_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`user_id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE `club_booking_additional_services`
  ADD CONSTRAINT `club_booking_additional_services_booking_id_fkey` FOREIGN KEY (`booking_id`) REFERENCES `club_class_bookings`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION,
  ADD CONSTRAINT `club_booking_additional_services_slot_additional_service_id_fkey` FOREIGN KEY (`slot_additional_service_id`) REFERENCES `club_slot_additional_services`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  ADD CONSTRAINT `club_booking_additional_services_service_id_fkey` FOREIGN KEY (`service_id`) REFERENCES `club_services`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
