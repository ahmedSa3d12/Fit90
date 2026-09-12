CREATE TABLE `club_service_additional_services` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `parent_service_id` INTEGER NOT NULL,
    `additional_service_id` INTEGER NOT NULL,
    `is_required` BOOLEAN NOT NULL DEFAULT false,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL,

    INDEX `svc_addl_service_idx`(`additional_service_id`),
    UNIQUE INDEX `svc_addl_parent_service_uq`(`parent_service_id`, `additional_service_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `club_appt_booking_additional_services` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `booking_id` INTEGER NOT NULL,
    `additional_service_id` INTEGER NOT NULL,
    `status` ENUM('confirmed', 'cancelled', 'completed') NOT NULL DEFAULT 'confirmed',
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL,

    INDEX `appt_addl_service_status_idx`(`additional_service_id`, `status`),
    UNIQUE INDEX `appt_addl_booking_service_uq`(`booking_id`, `additional_service_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `club_service_additional_services`
    ADD CONSTRAINT `svc_addl_parent_fkey`
    FOREIGN KEY (`parent_service_id`) REFERENCES `club_services`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION,
    ADD CONSTRAINT `svc_addl_service_fkey`
    FOREIGN KEY (`additional_service_id`) REFERENCES `club_services`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE `club_appt_booking_additional_services`
    ADD CONSTRAINT `appt_addl_booking_fkey`
    FOREIGN KEY (`booking_id`) REFERENCES `club_bookings`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION,
    ADD CONSTRAINT `appt_addl_service_fkey`
    FOREIGN KEY (`additional_service_id`) REFERENCES `club_services`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
