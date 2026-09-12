/** Thin route wrappers for the Scheduling & Booking engine. */
import { SchedulingWorkspacePage } from './scheduling-workspace';
import { ServiceSettingsPage } from './service-settings';

export { ServiceSettingsPage };
export { InBodyRecordsPage } from './inbody-records';
export { SchedulingDashboardPage } from './dashboard';
export { SchedulingHubPage } from './scheduling-hub';

// One tabbed workspace per category — Schedule + Bookings live together.
export const SchedClassesPage = () => <SchedulingWorkspacePage category="class" />;
export const SchedZumbaPage = () => <SchedulingWorkspacePage category="zumba" />;
export const SchedNutritionPage = () => <SchedulingWorkspacePage category="nutrition" />;
export const SchedSpaPage = () => <SchedulingWorkspacePage category="spa" />;
export const SchedPersonalTrainingPage = () => <SchedulingWorkspacePage category="personal_training" />;
export const SchedInbodyPage = () => <SchedulingWorkspacePage category="inbody" />;
export const SchedAdditionalPage = () => <SchedulingWorkspacePage category="additional" />;

// Department-scoped service catalogs. The category is pinned, so records from
// one department can never appear in or be created from another department.
export const ClassServiceSettingsPage = () => <ServiceSettingsPage category="class" />;
export const NutritionServiceSettingsPage = () => <ServiceSettingsPage category="nutrition" />;
export const SpaServiceSettingsPage = () => <ServiceSettingsPage category="spa" />;
export const PersonalTrainingServiceSettingsPage = () => <ServiceSettingsPage category="personal_training" />;

// Legacy /bookings/* paths open the same page on the Bookings tab.
export const BookingsClassesPage = () => <SchedulingWorkspacePage category="class" initialTab="bookings" />;
export const BookingsZumbaPage = () => <SchedulingWorkspacePage category="zumba" initialTab="bookings" />;
export const BookingsNutritionPage = () => <SchedulingWorkspacePage category="nutrition" initialTab="bookings" />;
export const BookingsSpaPage = () => <SchedulingWorkspacePage category="spa" initialTab="bookings" />;
export const BookingsPersonalTrainingPage = () => <SchedulingWorkspacePage category="personal_training" initialTab="bookings" />;
export const BookingsInbodyPage = () => <SchedulingWorkspacePage category="inbody" initialTab="bookings" />;
export const BookingsAdditionalPage = () => <SchedulingWorkspacePage category="additional" initialTab="bookings" />;
