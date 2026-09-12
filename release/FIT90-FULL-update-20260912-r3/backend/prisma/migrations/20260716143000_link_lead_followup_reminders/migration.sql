ALTER TABLE `club_reminders`
  ADD COLUMN `lead_id` INT NULL AFTER `id`,
  ADD UNIQUE INDEX `club_reminders_lead_id_key` (`lead_id`);
