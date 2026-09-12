import { Injectable } from '@nestjs/common';
import { PermissionEngineService } from './engine/permission-engine.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { isNutritionJobTitle, isSalesJobTitle, isSpaJobTitle, isTrainerJobTitle } from '../employees/trainer-job-title.util';

export interface WorkspaceConfig {
  homeRoute: string;
  roleHint: string;
  widgets: string[];
}

@Injectable()
export class WorkspaceService {
  constructor(
    private readonly engine: PermissionEngineService,
    private readonly prisma: PrismaService,
  ) {}

  async getWorkspace(userId: number): Promise<WorkspaceConfig> {
    const eff = await this.engine.getEffective(userId);
    const canView = (key: string) => eff.superAdmin || eff.keys.has(`${key}:view`);
    const canCreate = (key: string) => eff.superAdmin || eff.keys.has(`${key}:create`);

    if (eff.superAdmin) {
      return {
        homeRoute: '/dashboard',
        roleHint: 'owner',
        widgets: ['club_kpis', 'pending_renewals', 'attendance_rate', 'treasury_today'],
      };
    }

    const loginUser = await this.prisma.users.findUnique({
      where: { user_id: userId },
      select: { emp_code: true, level: true },
    });
    const employee = loginUser?.emp_code
      ? await this.prisma.employees.findUnique({
          where: { id: loginUser.emp_code },
          select: { mosma_wazefy_n: true },
        })
      : null;
    if (isTrainerJobTitle(employee?.mosma_wazefy_n)) {
      return {
        homeRoute: '/trainer/dashboard',
        roleHint: 'trainer',
        widgets: ['trainer_subscriptions', 'trainer_sessions', 'trainer_schedule'],
      };
    }
    if (isSalesJobTitle(employee?.mosma_wazefy_n)) {
      return {
        homeRoute: '/sales/dashboard',
        roleHint: 'sales_specialist',
        widgets: ['sales_target', 'sales_subscriptions', 'sales_collections'],
      };
    }
    if (isNutritionJobTitle(employee?.mosma_wazefy_n)) {
      return {
        homeRoute: '/nutrition/dashboard',
        roleHint: 'nutrition_specialist',
        widgets: ['nutrition_schedule', 'nutrition_bookings', 'nutrition_target'],
      };
    }
    if (isSpaJobTitle(employee?.mosma_wazefy_n)) {
      return {
        homeRoute: '/spa/dashboard',
        roleHint: 'spa_specialist',
        widgets: ['spa_schedule', 'spa_bookings', 'spa_target'],
      };
    }

    // Every other ordinary employee lands on their own profile, never on a
    // department-wide dashboard that could expose colleagues' data.
    if (loginUser?.level === 2 && loginUser.emp_code != null) {
      return {
        homeRoute: '/profile',
        roleHint: 'employee_self_service',
        widgets: ['notifications'],
      };
    }

    // Land the user on the home of the department they actually belong to, from most-specific
    // role to least. `club.dashboard:view` is the BROADEST club signal (many roles are granted
    // club view for reference), so it must be the LAST landing before the fallback — otherwise a
    // user who merely has club view lands on the club dashboard instead of their own department.
    if (canCreate('club.members')) {
      return {
        homeRoute: '/club/reception',
        roleHint: 'reception',
        widgets: ['recent_checkins', 'pending_tasks', 'expiring_subscriptions', 'outstanding_balances'],
      };
    }

    if (canView('gym-sales.sales')) {
      return {
        homeRoute: '/sales',
        roleHint: 'sales',
        widgets: ['pos_shift', 'today_sales', 'low_stock_alerts'],
      };
    }

    if (canView('accounting.dashboard')) {
      return {
        homeRoute: '/accounting',
        roleHint: 'accountant',
        widgets: ['trial_balance', 'pending_journal', 'cash_position'],
      };
    }

    if (canView('financial-reports.dashboard')) {
      return {
        homeRoute: '/finance',
        roleHint: 'finance',
        widgets: ['revenue_summary', 'expense_summary', 'sync_status'],
      };
    }

    // Club manager (only club access, no more specific department home) → club dashboard.
    if (canView('club.dashboard')) {
      return {
        homeRoute: '/club',
        roleHint: 'club_manager',
        widgets: ['club_kpis', 'pending_renewals', 'attendance_rate', 'treasury_today'],
      };
    }

    return {
      homeRoute: '/dashboard',
      roleHint: 'staff',
      widgets: ['notifications', 'quick_links'],
    };
  }
}
