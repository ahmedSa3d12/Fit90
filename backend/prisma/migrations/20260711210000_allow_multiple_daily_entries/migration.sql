-- Allow multiple check-ins per day (ported from one80 package settings).
ALTER TABLE `club_subscription_types`
  ADD COLUMN `allow_multiple_daily_entries` BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE `club_subscriptions`
  ADD COLUMN `allow_multiple_daily_entries` BOOLEAN NOT NULL DEFAULT false;
