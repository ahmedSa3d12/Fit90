ALTER TABLE `club_schedules`
    ADD COLUMN `additional_service_id` INTEGER NULL;

CREATE INDEX `schedule_additional_service_idx`
    ON `club_schedules`(`additional_service_id`);

ALTER TABLE `club_schedules`
    ADD CONSTRAINT `schedule_additional_service_fkey`
    FOREIGN KEY (`additional_service_id`) REFERENCES `club_services`(`id`)
    ON DELETE SET NULL ON UPDATE NO ACTION;
