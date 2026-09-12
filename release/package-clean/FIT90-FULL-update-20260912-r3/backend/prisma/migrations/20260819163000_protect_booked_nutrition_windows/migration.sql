ALTER TABLE club_bookings
  DROP FOREIGN KEY club_bookings_availability_slot_id_fkey;

ALTER TABLE club_bookings
  ADD CONSTRAINT club_bookings_availability_slot_id_fkey
  FOREIGN KEY (availability_slot_id) REFERENCES club_availability_slots(id)
  ON DELETE NO ACTION ON UPDATE NO ACTION;
