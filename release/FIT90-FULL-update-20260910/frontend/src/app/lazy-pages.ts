import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

/** Lazy-load a page module by named export (keeps route chunks split). */
function lazyPage(
  loader: () => Promise<Record<string, unknown>>,
  exportName: string,
): LazyExoticComponent<ComponentType<unknown>> {
  return lazy(() =>
    loader().then((mod) => ({
      default: mod[exportName] as ComponentType<unknown>,
    })),
  );
}

// --- Core / shell ---
export const DashboardPage = lazyPage(() => import('@/pages/mos-dashboard'), 'DashboardPage');
export const TrainerDashboardPage = lazyPage(() => import('@/pages/trainer-dashboard'), 'TrainerDashboardPage');
export const SalesDashboardPage = lazyPage(() => import('@/pages/sales-dashboard'), 'SalesDashboardPage');
export const NutritionDashboardPage = lazyPage(() => import('@/pages/nutrition-dashboard'), 'NutritionDashboardPage');
export const DepartmentHubPage = lazyPage(() => import('@/pages/hub'), 'DepartmentHubPage');
export const ProfilePage = lazyPage(() => import('@/pages/profile'), 'ProfilePage');
export const CompanyPage = lazyPage(() => import('@/pages/company'), 'CompanyPage');
export const NotificationsPage = lazyPage(() => import('@/pages/notifications/index'), 'NotificationsPage');
export const MenuPlaceholderPage = lazyPage(() => import('@/pages/menu-placeholder'), 'MenuPlaceholderPage');
export const MosRouterPage = lazyPage(() => import('@/pages/mos/mos-router'), 'MosRouterPage');

// --- Slim HR ---
export const EmployeesListPage = lazyPage(() => import('@/pages/employees/list'), 'EmployeesListPage');
export const EmployeeFormPage = lazyPage(() => import('@/pages/employees/form'), 'EmployeeFormPage');
export const EmployeeProfilePage = lazyPage(() => import('@/pages/employees/profile'), 'EmployeeProfilePage');
export const OrgBranchesPage = lazyPage(() => import('@/pages/org/branches'), 'OrgBranchesPage');
export const OrgDepartmentsPage = lazyPage(() => import('@/pages/org/departments'), 'OrgDepartmentsPage');
export const OrgJobTitlesPage = lazyPage(() => import('@/pages/org/job-titles'), 'OrgJobTitlesPage');
export const AttendanceDevicesPage = lazyPage(() => import('@/pages/attendance/devices'), 'AttendanceDevicesPage');
export const AttendanceBoardPage = lazyPage(() => import('@/pages/attendance/board'), 'AttendanceBoardPage');
export const AttendanceSettingsPage = lazyPage(() => import('@/pages/attendance/settings'), 'AttendanceSettingsPage');
export const AttendanceRulesPage = lazyPage(() => import('@/pages/attendance/rules'), 'AttendanceRulesPage');

// --- Admin / RBAC / users ---
export const UsersPage = lazyPage(() => import('@/pages/users/index'), 'UsersPage');
export const UsersManagePage = lazyPage(() => import('@/pages/users/manage'), 'UsersManagePage');
export const AppUsersPage = lazyPage(() => import('@/pages/settings/app-users'), 'AppUsersPage');
export const AdminLayout = lazyPage(() => import('@/pages/admin/layout'), 'AdminLayout');
export const RolesPage = lazyPage(() => import('@/pages/admin/roles'), 'RolesPage');
export const UserExceptionsPage = lazyPage(() => import('@/pages/admin/exceptions'), 'UserExceptionsPage');
export const AuditPage = lazyPage(() => import('@/pages/admin/audit'), 'AuditPage');

// --- Club: members ---
export const ClubReceptionPage = lazyPage(() => import('@/pages/club/route-pages'), 'ClubReceptionPage');
export const ClubMembersManagementPage = lazyPage(() => import('@/pages/club/route-pages'), 'ClubMembersManagementPage');
export const ClubMemberEntryPage = lazyPage(() => import('@/pages/club/member-entry'), 'ClubMemberEntryPage');
export const ClubMembersAttendancePage = lazyPage(() => import('@/pages/club/route-pages'), 'ClubMembersAttendancePage');
export const ClubMembersSettingsPage = lazyPage(() => import('@/pages/club/route-pages'), 'ClubMembersSettingsPage');
export const ClubMemberFormPage = lazyPage(() => import('@/pages/club/route-pages'), 'ClubMemberFormPage');

// --- Club: subscriptions ---
export const ClubSubscriptionsPage = lazyPage(() => import('@/pages/club/route-pages'), 'ClubSubscriptionsListPage');
export const ClubSubscriptionsNewPage = lazyPage(() => import('@/pages/club/route-pages'), 'ClubSubscriptionsNewPage');
export const ClubSubscriptionsTransfersPage = lazyPage(() => import('@/pages/club/route-pages'), 'ClubSubscriptionsTransfersPage');
export const ClubSubscriptionsRefundsPage = lazyPage(() => import('@/pages/club/route-pages'), 'ClubSubscriptionsRefundsPage');
export const ClubSubscriptionsSettingsPage = lazyPage(() => import('@/pages/club/route-pages'), 'ClubSubscriptionsSettingsPage');

// --- Club: classes / inbody / spa / trainers ---
export const FitnessInbodyPage = lazyPage(() => import('@/pages/club/fitness/route-pages'), 'FitnessInbodyPage');
export const FitnessSchedulingPage = lazyPage(() => import('@/pages/club/fitness/route-pages'), 'FitnessSchedulingPage');
export const FitnessClassesPage = lazyPage(() => import('@/pages/club/fitness/route-pages'), 'FitnessClassesListPage');
export const FitnessClassBookingPage = lazyPage(() => import('@/pages/club/fitness/route-pages'), 'FitnessClassBookingPage');
export const FitnessTrainersPage = lazyPage(() => import('@/pages/club/fitness/route-pages'), 'FitnessTrainersPage');
export const FitnessTrainerSettingsPage = lazyPage(() => import('@/pages/club/fitness/route-pages'), 'FitnessTrainerSettingsPage');
export const FitnessSpaServicesPage = lazyPage(() => import('@/pages/club/fitness/route-pages'), 'FitnessSpaServicesPage');
export const FitnessSpaBookingsPage = lazyPage(() => import('@/pages/club/fitness/route-pages'), 'FitnessSpaBookingsPage');
export const FitnessFacilitySettingsPage = lazyPage(() => import('@/pages/club/fitness/route-pages'), 'FitnessFacilitySettingsPage');
const CLASS_SCHED_ADMIN = () => import('@/pages/club/fitness/class-scheduling-admin');
export const ClassSchedulingAdminHomePage = lazyPage(CLASS_SCHED_ADMIN, 'ClassSchedulingAdminHomePage');
export const ClassMonthlySchedulesAdminPage = lazyPage(CLASS_SCHED_ADMIN, 'ClassMonthlySchedulesAdminPage');
export const ClassScheduleSlotsAdminPage = lazyPage(CLASS_SCHED_ADMIN, 'ClassScheduleSlotsAdminPage');
export const ClassAdditionalServicesAdminPage = lazyPage(CLASS_SCHED_ADMIN, 'ClassAdditionalServicesAdminPage');
export const ClassBookingsAdminPage = lazyPage(CLASS_SCHED_ADMIN, 'ClassBookingsAdminPage');
export const AvailableClassSlotsAdminPage = lazyPage(CLASS_SCHED_ADMIN, 'AvailableClassSlotsAdminPage');

// --- Lost & Found ---
export const LostFoundPage = lazyPage(() => import('@/pages/club/lost-found'), 'LostFoundPage');

// --- System settings: sales staff ---
export const SalesStaffPage = lazyPage(() => import('@/pages/settings/sales-staff'), 'SalesStaffPage');
export const CustomerSourcesPage = lazyPage(() => import('@/pages/settings/customer-sources'), 'CustomerSourcesPage');
export const GymPoliciesPage = lazyPage(() => import('@/pages/settings/gym-policies'), 'GymPoliciesPage');
export const NationalitiesSettingsPage = lazyPage(() => import('@/pages/settings/employee-lookups'), 'NationalitiesSettingsPage');
export const ReligionsSettingsPage = lazyPage(() => import('@/pages/settings/employee-lookups'), 'ReligionsSettingsPage');
export const SocialStatusesSettingsPage = lazyPage(() => import('@/pages/settings/employee-lookups'), 'SocialStatusesSettingsPage');

// --- Availability / monthly schedule (Classes/Spa/InBody) ---
export const AvailabilityPage = lazyPage(() => import('@/pages/club/fitness/availability'), 'AvailabilityPage');
export const FitnessInbodyBookingsPage = lazyPage(() => import('@/pages/club/fitness/inbody-bookings'), 'FitnessInbodyBookingsPage');

// --- Scheduling & Booking engine (generic) ---
const SCHED = () => import('@/pages/scheduling/route-pages');
export const ServiceSettingsPage = lazyPage(SCHED, 'ServiceSettingsPage');
export const InBodyRecordsPage = lazyPage(SCHED, 'InBodyRecordsPage');
export const SchedulingDashboardPage = lazyPage(SCHED, 'SchedulingDashboardPage');
export const SchedulingHubPage = lazyPage(SCHED, 'SchedulingHubPage');
export const SchedClassesPage = lazyPage(SCHED, 'SchedClassesPage');
export const SchedZumbaPage = lazyPage(SCHED, 'SchedZumbaPage');
export const SchedNutritionPage = lazyPage(SCHED, 'SchedNutritionPage');
export const SchedSpaPage = lazyPage(SCHED, 'SchedSpaPage');
export const SchedPersonalTrainingPage = lazyPage(SCHED, 'SchedPersonalTrainingPage');
export const SchedInbodyPage = lazyPage(SCHED, 'SchedInbodyPage');
export const SchedAdditionalPage = lazyPage(SCHED, 'SchedAdditionalPage');
export const ClassServiceSettingsPage = lazyPage(SCHED, 'ClassServiceSettingsPage');
export const NutritionServiceSettingsPage = lazyPage(SCHED, 'NutritionServiceSettingsPage');
export const SpaServiceSettingsPage = lazyPage(SCHED, 'SpaServiceSettingsPage');
export const PersonalTrainingServiceSettingsPage = lazyPage(SCHED, 'PersonalTrainingServiceSettingsPage');
export const BookingsClassesPage = lazyPage(SCHED, 'BookingsClassesPage');
export const BookingsZumbaPage = lazyPage(SCHED, 'BookingsZumbaPage');
export const BookingsNutritionPage = lazyPage(SCHED, 'BookingsNutritionPage');
export const BookingsSpaPage = lazyPage(SCHED, 'BookingsSpaPage');
export const BookingsPersonalTrainingPage = lazyPage(SCHED, 'BookingsPersonalTrainingPage');
export const BookingsInbodyPage = lazyPage(SCHED, 'BookingsInbodyPage');
export const BookingsAdditionalPage = lazyPage(SCHED, 'BookingsAdditionalPage');
