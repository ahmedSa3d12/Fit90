import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import configuration from './common/config/configuration';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { PrismaModule } from './common/prisma/prisma.module';
import { ExportModule } from './common/export/export.module';
import { BranchScopeModule } from './common/branch-scope/branch-scope.module';
import { EmployeeScopeModule } from './common/employee-scope/employee-scope.module';
// Infrastructure
import { AuthModule } from './modules/auth/auth.module';
import { RbacModule } from './modules/rbac/rbac.module';
import { RbacAdminModule } from './modules/rbac/admin/rbac-admin.module';
import { UsersModule } from './modules/users/users.module';
import { UserAdminModule } from './modules/user-admin/user-admin.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { BranchesModule } from './modules/branches/branches.module';
import { OrgModule } from './modules/org/org.module';
import { LookupsModule } from './modules/lookups/lookups.module';
import { SettingsModule } from './modules/settings/settings.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { UploadsModule } from './modules/uploads/uploads.module';
// Slim HR
import { EmployeesModule } from './modules/employees/employees.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { ReportsModule } from './modules/reports/reports.module';
// Member phone app
import { AppUsersModule } from './modules/app-users/app-users.module';
import { PushModule } from './modules/push/push.module';
import { MobileModule } from './modules/mobile/mobile.module';
// Club / Gym product
import { GymOpsModule } from './modules/gym-ops/gym-ops.module';
import { ClubMembersModule } from './modules/club-members/club-members.module';
import { ClubSubscriptionsModule } from './modules/club-subscriptions/club-subscriptions.module';
import { ClubCustomerSourcesModule } from './modules/club-customer-sources/club-customer-sources.module';
import { ClubFitnessModule } from './modules/club-fitness/club-fitness.module';
import { ClubDashboardModule } from './modules/club-dashboard/club-dashboard.module';
import { LostFoundModule } from './modules/lost-found/lost-found.module';
import { ClubSalesStaffModule } from './modules/club-sales-staff/club-sales-staff.module';
import { SchedulingModule } from './modules/scheduling/scheduling.module';
import { ClubMosModule } from './modules/club-mos/club-mos.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    ScheduleModule.forRoot(),
    // Default throttle config; enforced only where ThrottlerGuard is applied (login routes).
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 10 }]),
    ExportModule,
    PrismaModule,
    BranchScopeModule,
    EmployeeScopeModule,
    // Infrastructure
    AuthModule,
    RbacModule,
    RbacAdminModule,
    UsersModule,
    UserAdminModule,
    DashboardModule,
    BranchesModule,
    OrgModule,
    LookupsModule,
    SettingsModule,
    NotificationsModule,
    UploadsModule,
    // Slim HR
    EmployeesModule,
    AttendanceModule,
    ReportsModule,
    // Member phone app
    AppUsersModule,
    PushModule,
    MobileModule,
    // Club / Gym product
    GymOpsModule,
    ClubMembersModule,
    ClubSubscriptionsModule,
    ClubCustomerSourcesModule,
    ClubFitnessModule,
    ClubDashboardModule,
    LostFoundModule,
    ClubSalesStaffModule,
    SchedulingModule,
    ClubMosModule,
  ],
  controllers: [AppController],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    // Global auth: every route requires a valid JWT unless marked @Public().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // Global RBAC: opt-in per route via @RequiresPage('Legacy/Link').
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
