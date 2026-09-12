ALTER TABLE `club_class_bookings`
  MODIFY `user_id` INTEGER NULL,
  ADD COLUMN `member_id` INTEGER NULL AFTER `user_id`,
  MODIFY `status` ENUM('confirmed', 'wait', 'cancelled', 'completed', 'no_show') NOT NULL DEFAULT 'confirmed',
  ADD UNIQUE INDEX `club_class_bookings_slot_id_member_id_key` (`slot_id`, `member_id`),
  ADD INDEX `club_class_bookings_member_id_status_idx` (`member_id`, `status`),
  ADD CONSTRAINT `club_class_bookings_member_id_fkey` FOREIGN KEY (`member_id`) REFERENCES `club_members`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
