/** Thin route wrappers for club fitness lazy routes. */
import { FitnessClassesPage } from './classes';

export { FitnessInbodyPage } from './inbody';
export { FitnessSchedulingPage } from './scheduling';
export function FitnessClassesListPage() {
  return <FitnessClassesPage />;
}
export { FitnessClassBookingPage } from './class-booking';
export { FitnessTrainersPage } from './trainers/index';
export { FitnessTrainerSettingsPage } from './trainers/settings';
export { FitnessSpaServicesPage } from './facilities/spa-services';
export { FitnessSpaBookingsPage } from './facilities/spa-bookings';
export { FitnessFacilitySettingsPage } from './facilities/settings';
