import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, StaffTaskStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { paginated } from '../../common/dto/list-result';
import { AutomationEngineService } from './automation-engine.service';
import { PushService } from '../push/push.service';
import type { JwtUser } from '../../common/types/jwt-user';

@Injectable()
export class AutomationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: AutomationEngineService,
    private readonly push: PushService,
  ) {}

  async listWorkflows() {
    const rows = await this.prisma.automation_workflows.findMany({
      orderBy: { id: 'asc' },
      include: { _count: { select: { runs: true } } },
    });
    return rows.map((r) => ({
      id: r.id,
      key: r.key,
      nameAr: r.name_ar,
      nameEn: r.name_en,
      triggerType: r.trigger_type,
      triggerConfig: r.trigger_config,
      isActive: r.is_active,
      branchId: r.branch_id,
      runsCount: r._count.runs,
      updatedAt: r.updated_at,
    }));
  }

  async toggleWorkflow(id: number, isActive: boolean) {
    return this.prisma.automation_workflows.update({
      where: { id },
      data: { is_active: isActive },
    });
  }

  async listRuns(workflowId?: number, page = 1, pageSize = 25) {
    const skip = (page - 1) * pageSize;
    const where: Prisma.automation_runsWhereInput = workflowId ? { workflow_id: workflowId } : {};
    const [rows, total] = await Promise.all([
      this.prisma.automation_runs.findMany({
        where,
        orderBy: { id: 'desc' },
        skip,
        take: pageSize,
        include: { workflow: { select: { key: true, name_ar: true } } },
      }),
      this.prisma.automation_runs.count({ where }),
    ]);
    return paginated(
      rows.map((r) => ({
        id: r.id,
        workflowKey: r.workflow.key,
        workflowName: r.workflow.name_ar,
        triggerType: r.trigger_type,
        entityType: r.entity_type,
        entityId: r.entity_id,
        status: r.status,
        detail: r.detail,
        errorMessage: r.error_message,
        createdAt: r.created_at,
      })),
      total,
      page,
      pageSize,
    );
  }

  async listTasks(query: {
    status?: StaffTaskStatus;
    search?: string;
    memberId?: number;
    branchId?: number;
    page?: number;
    pageSize?: number;
  }) {
    const page = query.page ?? 1;
    const pageSize = Math.min(100, query.pageSize ?? 25);
    const skip = (page - 1) * pageSize;
    const and: Prisma.staff_tasksWhereInput[] = [];
    if (query.status) and.push({ status: query.status });
    if (query.search?.trim()) {
      const search = query.search.trim();
      const employees = await this.prisma.employees.findMany({
        where: { employee: { contains: search } },
        select: { emp_code: true },
      });
      const employeeCodes = employees.flatMap((employee) => employee.emp_code == null ? [] : [employee.emp_code]);
      const matchingUsers = await this.prisma.users.findMany({
        where: { OR: [{ name: { contains: search } }, { emp_code: { in: employeeCodes } }] },
        select: { user_id: true },
      });
      const matchingUserIds = matchingUsers.map((user) => user.user_id);
      and.push({
        OR: [
          { title: { contains: search } },
          { description: { contains: search } },
          { created_by: { in: matchingUserIds } },
          { assigned_to: { in: matchingUserIds } },
        ],
      });
    }
    if (query.memberId) and.push({ member_id: query.memberId });
    if (query.branchId) and.push({ branch_id: query.branchId });
    const where = and.length ? { AND: and } : {};

    const [rows, total] = await Promise.all([
      this.prisma.staff_tasks.findMany({
        where,
        orderBy: [{ status: 'asc' }, { due_date: 'asc' }, { id: 'desc' }],
        skip,
        take: pageSize,
      }),
      this.prisma.staff_tasks.count({ where }),
    ]);
    const userIds = [...new Set(rows.flatMap((task) => [task.created_by, task.assigned_to].filter((id): id is number => id != null)))];
    const users = await this.prisma.users.findMany({
      where: { user_id: { in: userIds } },
      select: { user_id: true, name: true, emp_code: true },
    });
    const employeeCodes = users.flatMap((user) => user.emp_code == null ? [] : [user.emp_code]);
    const employees = await this.prisma.employees.findMany({
      where: { emp_code: { in: employeeCodes } },
      select: { emp_code: true, employee: true },
    });
    const employeeNames = new Map(employees.map((employee) => [employee.emp_code, employee.employee]));
    const userNames = new Map(users.map((user) => [
      user.user_id,
      (user.emp_code != null ? employeeNames.get(user.emp_code) : null) ?? user.name,
    ]));

    return paginated(
      rows.map((t) => ({
        id: t.id,
        taskType: t.task_type,
        title: t.title,
        description: t.description,
        memberId: t.member_id,
        subscriptionId: t.subscription_id,
        assignedTo: t.assigned_to,
        fromEmployee: t.created_by ? userNames.get(t.created_by) ?? null : null,
        toEmployee: t.assigned_to ? userNames.get(t.assigned_to) ?? null : null,
        status: t.status,
        priority: t.priority,
        startDate: t.start_date,
        dueDate: t.due_date,
        branchId: t.branch_id,
        createdAt: t.created_at,
        closedAt: t.closed_at,
      })),
      total,
      page,
      pageSize,
    );
  }

  async taskStats() {
    const grouped = await this.prisma.staff_tasks.groupBy({ by: ['status'], _count: { _all: true } });
    const counts = new Map(grouped.map((row) => [row.status, row._count._all]));
    return {
      total: grouped.reduce((sum, row) => sum + row._count._all, 0),
      sent: counts.get('open') ?? 0,
      inProgress: counts.get('in_progress') ?? 0,
      completed: counts.get('completed') ?? 0,
      cancelled: counts.get('cancelled') ?? 0,
    };
  }

  async taskAssignees(search?: string) {
    const employees = await this.prisma.employees.findMany({
      where: {
        OR: [{ leave_emp: null }, { leave_emp: 0 }],
        ...(search?.trim() ? { employee: { contains: search.trim() } } : {}),
      },
      select: { id: true, emp_code: true, employee: true, edara_n: true, mosma_wazefy_n: true },
      orderBy: { employee: 'asc' },
    });
    const codes = employees.flatMap((employee) => employee.emp_code == null ? [] : [employee.emp_code]);
    const users = await this.prisma.users.findMany({
      where: { emp_code: { in: codes } },
      select: { user_id: true, emp_code: true },
    });
    const userByCode = new Map(users.map((user) => [user.emp_code, user.user_id]));
    return employees.flatMap((employee) => {
      const userId = userByCode.get(employee.emp_code);
      return userId == null ? [] : [{
        employeeId: employee.id,
        userId,
        name: employee.employee,
        department: employee.edara_n,
        jobTitle: employee.mosma_wazefy_n,
      }];
    });
  }

  async createTask(body: {
    assigneeUserId?: number;
    title?: string;
    description?: string;
    startDate?: string;
    endDate?: string;
  }, user: JwtUser) {
    const assigneeUserId = Number(body.assigneeUserId);
    if (!assigneeUserId || !body.title?.trim() || !body.description?.trim() || !body.startDate || !body.endDate) {
      throw new BadRequestException('جميع بيانات المهمة مطلوبة');
    }
    if (body.endDate < body.startDate) {
      throw new BadRequestException('تاريخ الانتهاء يجب أن يكون بعد تاريخ البداية');
    }
    const assignee = await this.prisma.users.findUnique({ where: { user_id: assigneeUserId } });
    if (!assignee) throw new NotFoundException('حساب الموظف المستلم غير موجود');

    const task = await this.prisma.staff_tasks.create({
      data: {
        task_type: 'manual',
        title: body.title.trim(),
        description: body.description.trim(),
        assigned_to: assigneeUserId,
        created_by: user.sub,
        start_date: body.startDate,
        due_date: body.endDate,
        branch_id: assignee.branch_id_fk ?? null,
        status: 'open',
        priority: 'medium',
      },
    });
    await this.push.sendToUsers(
      [assigneeUserId],
      'مهمة جديدة',
      `${user.name ?? 'أحد الموظفين'} أرسل إليك مهمة: ${task.title}`,
      user.sub,
      '/mos/tasks',
    );
    return task;
  }

  async updateTaskStatus(id: number, status: StaffTaskStatus, userId?: number) {
    return this.prisma.staff_tasks.update({
      where: { id },
      data: {
        status,
        closed_at: status === 'completed' || status === 'cancelled' ? new Date() : null,
        assigned_to: userId ?? undefined,
      },
    });
  }

  async updateTask(id: number, body: {
    title?: string;
    description?: string;
    assigneeUserId?: number;
    startDate?: string;
    endDate?: string;
  }) {
    const existing = await this.prisma.staff_tasks.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('المهمة غير موجودة');
    if (body.startDate && body.endDate && body.endDate < body.startDate) {
      throw new BadRequestException('تاريخ الانتهاء يجب أن يكون بعد تاريخ البداية');
    }
    if (body.assigneeUserId) {
      const user = await this.prisma.users.findUnique({ where: { user_id: Number(body.assigneeUserId) } });
      if (!user) throw new NotFoundException('حساب الموظف المستلم غير موجود');
    }
    return this.prisma.staff_tasks.update({
      where: { id },
      data: {
        title: body.title?.trim(),
        description: body.description?.trim(),
        assigned_to: body.assigneeUserId ? Number(body.assigneeUserId) : undefined,
        start_date: body.startDate,
        due_date: body.endDate,
      },
    });
  }

  async runScheduled() {
    return this.engine.processScheduledTriggers();
  }
}
