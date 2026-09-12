-- Separate mobile-app offers from announcements while using the shared content table.
ALTER TABLE `club_content_items`
  MODIFY `content_type` ENUM(
    'faq',
    'exercise',
    'announcement',
    'offer',
    'gym_image',
    'schedule_image',
    'transformation_image',
    'app_home_section',
    'gym_rule',
    'notification_template',
    'member_profile_field',
    'possible_member_field'
  ) NOT NULL;
