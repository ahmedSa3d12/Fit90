ALTER TABLE `club_class_monthly_schedules`
  DROP FOREIGN KEY `club_class_monthly_schedules_class_id_fkey`;

ALTER TABLE `club_class_additional_services`
  DROP FOREIGN KEY `club_class_additional_services_class_id_fkey`;

ALTER TABLE `club_class_monthly_schedules`
  ADD CONSTRAINT `club_class_monthly_schedules_class_id_fkey`
  FOREIGN KEY (`class_id`) REFERENCES `club_lookups`(`id`)
  ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE `club_class_additional_services`
  ADD CONSTRAINT `club_class_additional_services_class_id_fkey`
  FOREIGN KEY (`class_id`) REFERENCES `club_lookups`(`id`)
  ON DELETE CASCADE ON UPDATE NO ACTION;
