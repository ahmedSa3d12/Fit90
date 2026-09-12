ALTER TABLE `club_notifications`
  MODIFY `type` ENUM(
    'booking_confirmed',
    'booking_cancelled',
    'appointment_reminder',
    'schedule_changed',
    'member_message'
  ) NOT NULL;
