-- Allow full Nutrition, SPA and Personal Training appointments to accept
-- additional bookings without consuming capacity.
ALTER TABLE `club_bookings`
  MODIFY `status` ENUM('pending', 'confirmed', 'wait', 'completed', 'cancelled', 'no_show')
  NOT NULL DEFAULT 'pending';
