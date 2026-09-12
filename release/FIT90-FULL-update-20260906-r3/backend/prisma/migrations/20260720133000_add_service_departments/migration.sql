ALTER TABLE `club_services`
  MODIFY COLUMN `category` ENUM(
    'class',
    'zumba',
    'nutrition',
    'spa',
    'personal_training',
    'inbody',
    'additional'
  ) NOT NULL DEFAULT 'additional';
