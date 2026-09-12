import { Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { AppShell } from '@/components/layout/app-shell';
import { ConfirmDialogProvider } from '@/components/common/confirm-dialog';
import { PageSkeleton } from '@/components/common/page-skeleton';
import { LoginPage } from '@/pages/login';
import { useAuth } from '@/store/auth';
import {
  AttendanceBoardPage,
  AttendanceDevicesPage,
  AttendanceRulesPage,
  AttendanceSettingsPage,
  CompanyPage,
  DashboardPage,
  TrainerDashboardPage,
  SalesDashboardPage,
  NutritionDashboardPage,
  DepartmentHubPage,
  EmployeeFormPage,
  EmployeeProfilePage,
  EmployeesListPage,
  MenuPlaceholderPage,
  MosRouterPage,
  NotificationsPage,
  OrgBranchesPage,
  OrgDepartmentsPage,
  OrgJobTitlesPage,
  ProfilePage,
  UsersPage,
  AppUsersPage,
  UsersManagePage,
  ClubMembersManagementPage,
  ClubMembersAttendancePage,
  ClubMembersSettingsPage,
  ClubReceptionPage,
  ClubSubscriptionsPage,
  ClubSubscriptionsNewPage,
  ClubSubscriptionsTransfersPage,
  ClubSubscriptionsRefundsPage,
  ClubSubscriptionsSettingsPage,
  ClubMemberFormPage,
  FitnessInbodyPage,
  FitnessSchedulingPage,
  FitnessClassesPage,
  FitnessClassBookingPage,
  FitnessTrainersPage,
  FitnessTrainerSettingsPage,
  FitnessSpaServicesPage,
  FitnessSpaBookingsPage,
  FitnessFacilitySettingsPage,
  LostFoundPage,
  SalesStaffPage,
  CustomerSourcesPage,
  GymPoliciesPage,
  NationalitiesSettingsPage,
  ReligionsSettingsPage,
  SocialStatusesSettingsPage,
  AvailabilityPage,
  FitnessInbodyBookingsPage,
  ServiceSettingsPage,
  InBodyRecordsPage,
  SchedulingDashboardPage,
  SchedulingHubPage,
  SchedClassesPage,
  SchedZumbaPage,
  SchedNutritionPage,
  SchedSpaPage,
  SchedPersonalTrainingPage,
  SchedInbodyPage,
  SchedAdditionalPage,
  ClassServiceSettingsPage,
  NutritionServiceSettingsPage,
  SpaServiceSettingsPage,
  PersonalTrainingServiceSettingsPage,
  BookingsClassesPage,
  BookingsZumbaPage,
  BookingsNutritionPage,
  BookingsSpaPage,
  BookingsPersonalTrainingPage,
  BookingsInbodyPage,
  BookingsAdditionalPage,
  AdminLayout,
  RolesPage,
  UserExceptionsPage,
  AuditPage,
  ClassSchedulingAdminHomePage,
  ClassMonthlySchedulesAdminPage,
  ClassScheduleSlotsAdminPage,
  ClassAdditionalServicesAdminPage,
  ClassBookingsAdminPage,
  AvailableClassSlotsAdminPage,
} from '@/app/lazy-pages';

function Lazy({ children }: { children: ReactNode }) {
  return <Suspense fallback={<PageSkeleton />}>{children}</Suspense>;
}

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  if (status === 'unauthenticated') return <Navigate to="/login" replace />;
  return <>{children}</>;
}

/** Legacy per-user permission tree is superseded by enterprise RBAC user exceptions. */
function LegacyUserPermsRedirect() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`/admin/exceptions?user=${id ?? ''}`} replace />;
}

export function AppRouter() {
  return (
    <>
      <ConfirmDialogProvider />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          element={
            <ProtectedRoute>
              <AppShell />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Lazy><DashboardPage /></Lazy>} />
          <Route path="trainer/dashboard" element={<Lazy><TrainerDashboardPage /></Lazy>} />
          <Route path="sales/dashboard" element={<Lazy><SalesDashboardPage /></Lazy>} />
          <Route path="nutrition/dashboard" element={<Lazy><NutritionDashboardPage /></Lazy>} />
          <Route path="hub/:section" element={<Lazy><DepartmentHubPage /></Lazy>} />

          {/* System settings */}
          <Route path="org/branches" element={<Lazy><OrgBranchesPage /></Lazy>} />
          <Route path="org/departments" element={<Navigate to="/org/job-titles" replace />} />
          <Route path="org/job-titles" element={<Lazy><OrgJobTitlesPage /></Lazy>} />

          {/* HR */}
          <Route path="employees" element={<Lazy><EmployeesListPage /></Lazy>} />
          <Route path="employees/new" element={<Lazy><EmployeeFormPage /></Lazy>} />
          <Route path="employees/:id/edit" element={<Lazy><EmployeeFormPage /></Lazy>} />
          <Route path="employees/:id" element={<Lazy><EmployeeProfilePage /></Lazy>} />
          <Route path="attendance" element={<Lazy><AttendanceBoardPage /></Lazy>} />
          <Route path="attendance/devices" element={<Lazy><AttendanceDevicesPage /></Lazy>} />
          <Route path="attendance/settings" element={<Lazy><AttendanceSettingsPage /></Lazy>} />
          <Route path="attendance/rules" element={<Lazy><AttendanceRulesPage /></Lazy>} />

          <Route path="notifications" element={<Lazy><NotificationsPage /></Lazy>} />
          <Route path="settings/app-users" element={<Lazy><AppUsersPage /></Lazy>} />
          <Route path="settings/sales-staff" element={<Lazy><SalesStaffPage /></Lazy>} />
          <Route path="settings/customer-sources" element={<Lazy><CustomerSourcesPage /></Lazy>} />
          <Route path="settings/gym-policies" element={<Lazy><GymPoliciesPage /></Lazy>} />
          <Route path="settings/nationalities" element={<Lazy><NationalitiesSettingsPage /></Lazy>} />
          <Route path="settings/religions" element={<Lazy><ReligionsSettingsPage /></Lazy>} />
          <Route path="settings/social-statuses" element={<Lazy><SocialStatusesSettingsPage /></Lazy>} />

          {/* Club — members */}
          <Route path="club" element={<Navigate to="/hub/club" replace />} />
          <Route path="club/reception" element={<Lazy><ClubReceptionPage /></Lazy>} />
          <Route path="club/members/attendance" element={<Lazy><ClubMembersAttendancePage /></Lazy>} />
          <Route path="club/members/settings" element={<Lazy><ClubMembersSettingsPage /></Lazy>} />
          <Route path="club/members" element={<Lazy><ClubMembersManagementPage /></Lazy>} />

          {/* Club — subscriptions */}
          <Route path="club/subscriptions/new" element={<Lazy><ClubSubscriptionsNewPage /></Lazy>} />
          <Route path="club/subscriptions/transfers" element={<Lazy><ClubSubscriptionsTransfersPage /></Lazy>} />
          <Route path="club/subscriptions/refunds" element={<Lazy><ClubSubscriptionsRefundsPage /></Lazy>} />
          <Route path="club/subscriptions/settings" element={<Lazy><ClubSubscriptionsSettingsPage /></Lazy>} />
          <Route path="club/subscriptions/member-form" element={<Lazy><ClubMemberFormPage /></Lazy>} />
          <Route path="club/subscriptions" element={<Lazy><ClubSubscriptionsPage /></Lazy>} />

          {/* Club — classes / inbody / spa / trainers */}
          <Route path="club/fitness/inbody" element={<Lazy><FitnessInbodyPage /></Lazy>} />
          <Route path="club/fitness/scheduling" element={<Lazy><FitnessSchedulingPage /></Lazy>} />
          <Route path="club/fitness/classes" element={<Lazy><FitnessClassesPage /></Lazy>} />
          <Route path="club/fitness/class-booking" element={<Lazy><FitnessClassBookingPage /></Lazy>} />
          <Route path="club/fitness/trainers" element={<Lazy><FitnessTrainersPage /></Lazy>} />
          <Route path="club/fitness/trainer-settings" element={<Lazy><FitnessTrainerSettingsPage /></Lazy>} />
          <Route path="club/fitness/spa-services" element={<Lazy><FitnessSpaServicesPage /></Lazy>} />
          <Route path="club/fitness/spa-bookings" element={<Lazy><FitnessSpaBookingsPage /></Lazy>} />
          <Route path="club/fitness/facility-settings" element={<Lazy><FitnessFacilitySettingsPage /></Lazy>} />
          <Route path="club/fitness/availability" element={<Lazy><AvailabilityPage /></Lazy>} />
          <Route path="club/fitness/inbody-bookings" element={<Lazy><FitnessInbodyBookingsPage /></Lazy>} />
          <Route path="club/fitness/class-scheduling" element={<Lazy><ClassSchedulingAdminHomePage /></Lazy>} />
          <Route path="club/fitness/class-scheduling/monthly" element={<Lazy><ClassMonthlySchedulesAdminPage /></Lazy>} />
          <Route path="club/fitness/class-scheduling/slots" element={<Lazy><ClassScheduleSlotsAdminPage /></Lazy>} />
          <Route path="club/fitness/class-scheduling/services" element={<Lazy><ClassAdditionalServicesAdminPage /></Lazy>} />
          <Route path="club/fitness/class-scheduling/bookings" element={<Lazy><ClassBookingsAdminPage /></Lazy>} />
          <Route path="club/fitness/class-scheduling/available" element={<Lazy><AvailableClassSlotsAdminPage /></Lazy>} />

          {/* Scheduling & Booking engine */}
          <Route path="scheduling/hub" element={<Lazy><SchedulingHubPage /></Lazy>} />
          <Route path="scheduling" element={<Lazy><SchedulingDashboardPage /></Lazy>} />
          <Route path="scheduling/services" element={<Lazy><ServiceSettingsPage /></Lazy>} />
          <Route path="scheduling/inbody-records" element={<Lazy><InBodyRecordsPage /></Lazy>} />
          <Route path="scheduling/classes" element={<Lazy><SchedClassesPage /></Lazy>} />
          <Route path="scheduling/zumba" element={<Lazy><SchedZumbaPage /></Lazy>} />
          <Route path="scheduling/nutrition" element={<Lazy><SchedNutritionPage /></Lazy>} />
          <Route path="scheduling/spa" element={<Lazy><SchedSpaPage /></Lazy>} />
          <Route path="scheduling/personal-training" element={<Lazy><SchedPersonalTrainingPage /></Lazy>} />
          <Route path="scheduling/inbody" element={<Lazy><SchedInbodyPage /></Lazy>} />
          <Route path="scheduling/additional" element={<Lazy><SchedAdditionalPage /></Lazy>} />
          <Route path="scheduling/services/classes" element={<Lazy><ClassServiceSettingsPage /></Lazy>} />
          <Route path="scheduling/services/nutrition" element={<Lazy><NutritionServiceSettingsPage /></Lazy>} />
          <Route path="scheduling/services/spa" element={<Lazy><SpaServiceSettingsPage /></Lazy>} />
          <Route path="scheduling/services/personal-training" element={<Lazy><PersonalTrainingServiceSettingsPage /></Lazy>} />
          <Route path="bookings/classes" element={<Lazy><BookingsClassesPage /></Lazy>} />
          <Route path="bookings/zumba" element={<Lazy><BookingsZumbaPage /></Lazy>} />
          <Route path="bookings/nutrition" element={<Lazy><BookingsNutritionPage /></Lazy>} />
          <Route path="bookings/spa" element={<Lazy><BookingsSpaPage /></Lazy>} />
          <Route path="bookings/personal-training" element={<Lazy><BookingsPersonalTrainingPage /></Lazy>} />
          <Route path="bookings/inbody" element={<Lazy><BookingsInbodyPage /></Lazy>} />
          <Route path="bookings/additional" element={<Lazy><BookingsAdditionalPage /></Lazy>} />

          {/* Lost & Found */}
          <Route path="club/lost-found" element={<Lazy><LostFoundPage /></Lazy>} />

          {/* Users & RBAC admin */}
          <Route path="users" element={<Lazy><UsersPage /></Lazy>} />
          <Route path="users/manage" element={<Lazy><UsersManagePage /></Lazy>} />
          <Route path="users/:id/permissions" element={<LegacyUserPermsRedirect />} />

          <Route path="admin" element={<Lazy><AdminLayout /></Lazy>}>
            <Route index element={<Navigate to="/admin/roles" replace />} />
            <Route path="roles" element={<Lazy><RolesPage /></Lazy>} />
            <Route path="exceptions" element={<Lazy><UserExceptionsPage /></Lazy>} />
            <Route path="audit" element={<Lazy><AuditPage /></Lazy>} />
          </Route>

          <Route path="company" element={<Lazy><CompanyPage /></Lazy>} />
          <Route path="profile" element={<Lazy><ProfilePage /></Lazy>} />
          <Route path="app/*" element={<Lazy><MosRouterPage /></Lazy>} />
          <Route path="m/:link" element={<Lazy><MenuPlaceholderPage /></Lazy>} />
          <Route path="mos/*" element={<Lazy><MosRouterPage /></Lazy>} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </>
  );
}
