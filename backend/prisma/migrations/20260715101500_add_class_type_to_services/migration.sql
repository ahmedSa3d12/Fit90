ALTER TABLE `club_services`
  ADD COLUMN `class_type_id` INTEGER NULL AFTER `name`,
  ADD INDEX `club_services_class_type_id_idx` (`class_type_id`);
