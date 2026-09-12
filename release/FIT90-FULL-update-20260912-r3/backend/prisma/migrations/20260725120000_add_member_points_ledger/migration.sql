CREATE TABLE `club_member_points_transactions` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `member_id` INTEGER NOT NULL,
  `subscription_id` INTEGER NULL,
  `points` INTEGER NOT NULL,
  `transaction_type` VARCHAR(20) NOT NULL,
  `source` VARCHAR(50) NOT NULL,
  `event_key` VARCHAR(190) NOT NULL,
  `description` VARCHAR(500) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `club_member_points_transactions_event_key_key` (`event_key`),
  INDEX `club_member_points_transactions_member_id_created_at_idx` (`member_id`, `created_at`),
  INDEX `club_member_points_transactions_subscription_id_idx` (`subscription_id`),
  PRIMARY KEY (`id`),
  CONSTRAINT `club_member_points_transactions_member_id_fkey`
    FOREIGN KEY (`member_id`) REFERENCES `club_members` (`id`)
    ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT `club_member_points_transactions_subscription_id_fkey`
    FOREIGN KEY (`subscription_id`) REFERENCES `club_subscriptions` (`id`)
    ON DELETE SET NULL ON UPDATE NO ACTION
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Give existing subscriptions one auditable opening earn entry using the package
-- points configured at migration time. Future package edits cannot rewrite history.
INSERT INTO `club_member_points_transactions`
  (`member_id`, `subscription_id`, `points`, `transaction_type`, `source`, `event_key`, `description`)
SELECT
  s.`member_id`,
  s.`id`,
  t.`wallet_points`,
  'earn',
  'subscription_purchase',
  CONCAT('subscription:', s.`id`, ':purchase'),
  CONCAT('نقاط اشتراك ', COALESCE(s.`subscription_type`, t.`name`))
FROM `club_subscriptions` s
INNER JOIN `club_subscription_types` t ON t.`id` = s.`subscription_type_id`
WHERE s.`member_id` IS NOT NULL
  AND t.`wallet_points` IS NOT NULL
  AND t.`wallet_points` > 0;
