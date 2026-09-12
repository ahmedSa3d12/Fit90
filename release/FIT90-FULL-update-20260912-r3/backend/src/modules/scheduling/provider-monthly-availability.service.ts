import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EmployeeDataScopeService } from '../../common/employee-scope/employee-data-scope.service';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { JwtUser } from '../../common/types/jwt-user';
import { SchedulingNotificationsService } from './scheduling-notifications.service';

type ProviderAvailabilityCategory = 'nutrition' | 'spa' | 'personal_training';
type CreateProviderMonthlyAvailability = { employeeId: number; month: number; year: number; category?: ProviderAvailabilityCategory };
type WindowInput = {
  slotDate: string;
  startTime: string;
  endTime: string;
  repeatWeekly?: boolean;
  bookingStartAt?: string;
  bookingEndAt?: string;
  capacity?: number;
};

@Injectable()
export class ProviderMonthlyAvailabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly employeeScope: EmployeeDataScopeService,
    private readonly notifications: SchedulingNotificationsService,
    private readonly branchScope: BranchScopeService,
  ) {}

  private readonly include = {
    windows: {
      where: { is_deleted: false },
      include: {
        _count: {
          select: {
            nutrition_bookings: {
              where: { is_deleted: false, status: { in: ['pending' as const, 'confirmed' as const, 'wait' as const] } },
            },
          },
        },
      },
      orderBy: [{ slot_date: 'asc' as const }, { start_time: 'asc' as const }],
    },
  };

  private async present(row: any) {
    const provider = await this.prisma.club_trainers.findFirst({
      where: { id: row.employee_id, is_deleted: false },
      select: { id: true, name: true },
    });
    const windows = Array.isArray(row.windows)
      ? row.windows.map((window: any) => ({
          ...window,
          bookingCount: window._count?.nutrition_bookings ?? 0,
        }))
      : [];
    return {
      ...row,
      windows,
      employeeId: row.employee_id,
      trainer: provider ?? { id: row.employee_id, name: '#' + row.employee_id },
      _count: { windows: windows.length },
    };
  }

  private assertProviderForCategory(provider: { specialization: string | null } | null, category: ProviderAvailabilityCategory) {
    if (category === 'spa' || category === 'personal_training') {
      if (!provider) throw new NotFoundException('SPA service provider not found.');
      return;
    }
    const specialization = provider?.specialization?.trim().toLowerCase() ?? '';
    if (!provider || (!specialization.includes('nutrition') && !specialization.includes('تغذية'))) {
      throw new NotFoundException('Nutrition specialist not found.');
    }
  }

  private async assertProviderBranchAccess(user: JwtUser | undefined, providerId: number, client: any = this.prisma) {
    const provider = await client.club_trainers.findFirst({
      where: { id: providerId, is_deleted: false },
      select: { employee_id: true },
    });
    if (!provider) throw new NotFoundException('Nutrition specialist not found.');
    const employee = provider.employee_id == null ? null : await client.employees.findFirst({
      where: { id: provider.employee_id },
      select: { branch_id_fk: true },
    });
    const branchId = employee?.branch_id_fk == null ? null : Number(employee.branch_id_fk);
    const allowed = this.branchScope.allowedBranchIds(user);
    if (allowed !== null && (branchId == null || !allowed.includes(branchId))) {
      throw new ForbiddenException('Nutrition specialist is outside your branch scope.');
    }
    return branchId;
  }

  private async branchScopedProviderIds(user?: JwtUser) {
    const allowed = this.branchScope.allowedBranchIds(user);
    if (allowed === null) return null;
    const employees = await this.prisma.employees.findMany({
      where: { branch_id_fk: { in: allowed } },
      select: { id: true },
    });
    const providers = await this.prisma.club_trainers.findMany({
      where: { employee_id: { in: employees.map((employee) => employee.id) }, is_deleted: false },
      select: { id: true },
    });
    return providers.map((provider) => provider.id);
  }

  private async lockPlan(client: any, id: number) {
    await client.$executeRawUnsafe(
      'SELECT id FROM club_provider_monthly_availabilities WHERE id = ? FOR UPDATE',
      id,
    );
    const plan = await client.club_provider_monthly_availabilities.findUnique({
      where: { id }, include: this.include,
    });
    if (!plan) throw new NotFoundException('Nutrition monthly plan not found.');
    return plan;
  }

  private cairoNow() {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date());
    const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
    return { date: `${value('year')}-${value('month')}-${value('day')}`, time: `${value('hour')}:${value('minute')}` };
  }

  private assertFutureWindow(window: { slot_date: string; start_time: string }) {
    const now = this.cairoNow();
    const start = window.start_time.slice(0, 5);
    if (window.slot_date < now.date || (window.slot_date === now.date && start <= now.time)) {
      throw new BadRequestException('Only future attendance that has not started can be cancelled.');
    }
  }

  private validateWindow(plan: { month: number; year: number }, dto: WindowInput) {
    if (dto.endTime <= dto.startTime) throw new BadRequestException('Attendance end must be after start.');
    const prefix = String(plan.year) + '-' + String(plan.month).padStart(2, '0') + '-';
    if (!dto.slotDate.startsWith(prefix)) {
      throw new BadRequestException('Attendance window must be inside the plan month.');
    }
    const appointmentStart = new Date(dto.slotDate + 'T' + dto.startTime + ':00');
    if (Number.isNaN(appointmentStart.getTime())) throw new BadRequestException('Attendance date is invalid.');
    if (Boolean(dto.bookingStartAt) !== Boolean(dto.bookingEndAt)) {
      throw new BadRequestException('Booking open and close must be supplied together.');
    }
    if (dto.bookingStartAt && dto.bookingEndAt) {
      const bookingStart = new Date(dto.bookingStartAt);
      const bookingEnd = new Date(dto.bookingEndAt);
      if (Number.isNaN(bookingStart.getTime()) || Number.isNaN(bookingEnd.getTime()) || bookingEnd <= bookingStart) {
        throw new BadRequestException('Booking close must be after booking open.');
      }
      if (bookingEnd > appointmentStart) {
        throw new BadRequestException('Booking must close before attendance starts.');
      }
    }
    return appointmentStart;
  }

  async create(dto: CreateProviderMonthlyAvailability, user?: JwtUser) {
    const category = dto.category ?? 'nutrition';
    const employeeId = await this.employeeScope.scopedProviderId(user, dto.employeeId);
    if (employeeId == null) throw new NotFoundException('Service provider not found.');
    const provider = await this.prisma.club_trainers.findFirst({
      where: { id: employeeId, is_active: true, is_deleted: false },
      select: { id: true, specialization: true },
    });
    this.assertProviderForCategory(provider, category);
    await this.assertProviderBranchAccess(user, employeeId);
    const duplicate = await this.prisma.club_provider_monthly_availabilities.findUnique({
      where: {
        employee_id_category_month_year: {
          employee_id: employeeId, category, month: dto.month, year: dto.year,
        },
      },
    });
    if (duplicate) throw new ConflictException('A provider monthly plan already exists for this provider and month.');
    const created = await this.prisma.club_provider_monthly_availabilities.create({
      data: { employee_id: employeeId, category, month: dto.month, year: dto.year },
      include: this.include,
    });
    return this.present(created);
  }

  async list(
    query: { employeeId?: number; month?: number; year?: number; status?: 'draft' | 'published' | 'archived'; category?: ProviderAvailabilityCategory },
    user?: JwtUser,
  ) {
    const selfOnly = this.employeeScope.isSelfOnly(user);
    const ownProviderId = selfOnly ? await this.employeeScope.providerId(user) : null;
    const requestedProviderId = selfOnly ? (ownProviderId ?? -1) : (query.employeeId ?? null);
    const branchProviderIds = await this.branchScopedProviderIds(user);
    if (branchProviderIds !== null && requestedProviderId != null && !branchProviderIds.includes(requestedProviderId)) {
      return [];
    }
    const rows = await this.prisma.club_provider_monthly_availabilities.findMany({
      where: {
        category: query.category ?? 'nutrition',
        ...(requestedProviderId != null
          ? { employee_id: requestedProviderId }
          : branchProviderIds !== null ? { employee_id: { in: branchProviderIds } } : {}),
        ...(query.month ? { month: query.month } : {}),
        ...(query.year ? { year: query.year } : {}),
        ...(query.status ? { status: query.status } : {}),
      },
      include: this.include,
      orderBy: [{ year: 'desc' }, { month: 'desc' }, { id: 'desc' }],
    });
    return Promise.all(rows.map((row) => this.present(row)));
  }

  async findOne(id: number, user?: JwtUser) {
    const plan = await this.prisma.club_provider_monthly_availabilities.findUnique({
      where: { id }, include: this.include,
    });
    if (!plan) throw new NotFoundException('Nutrition monthly plan not found.');
    await this.employeeScope.assertProviderAccess(user, plan.employee_id);
    await this.assertProviderBranchAccess(user, plan.employee_id);
    return this.present(plan);
  }

  async publish(id: number, user?: JwtUser) {
    const updated = await this.prisma.$transaction(async (tx) => {
      const plan = await this.lockPlan(tx, id);
      await this.employeeScope.assertProviderAccess(user, plan.employee_id);
      await this.assertProviderBranchAccess(user, plan.employee_id, tx);
      if (plan.status !== 'draft') throw new ConflictException('Only draft plans can be published.');
      if (!plan.windows.length) throw new BadRequestException('Add at least one attendance window before publishing.');
      return tx.club_provider_monthly_availabilities.update({
        where: { id },
        data: { status: 'published', published_at: new Date() },
        include: this.include,
      });
    });
    return this.present(updated);
  }
  async addWindows(id: number, dto: WindowInput, user?: JwtUser) {
    return this.prisma.$transaction(async (tx) => {
      const plan = await this.lockPlan(tx, id);
      await this.employeeScope.assertProviderAccess(user, plan.employee_id);
      const providerBranchId = await this.assertProviderBranchAccess(user, plan.employee_id, tx);
      if (plan.status === 'archived') throw new ConflictException('Archived plans cannot be edited.');
      const first = this.validateWindow(plan, dto);
      if (plan.status === 'published') {
        this.assertFutureWindow({ slot_date: dto.slotDate, start_time: dto.startTime });
      }
      const dates: string[] = [];
      for (let cursor = new Date(first); cursor.getMonth() === first.getMonth(); cursor.setDate(cursor.getDate() + 7)) {
        dates.push([
          cursor.getFullYear(),
          String(cursor.getMonth() + 1).padStart(2, '0'),
          String(cursor.getDate()).padStart(2, '0'),
        ].join('-'));
        if (!dto.repeatWeekly) break;
      }
      const sourceDateMs = Date.parse(dto.slotDate + 'T00:00:00.000Z');
      const bookingStartAt = dto.bookingStartAt ? new Date(dto.bookingStartAt) : null;
      const bookingEndAt = dto.bookingEndAt ? new Date(dto.bookingEndAt) : null;
      let created = 0;
      for (const slotDate of dates) {
        const conflict = await tx.club_availability_slots.findFirst({
          where: {
            module_type: plan.category, trainer_id: plan.employee_id, slot_date: slotDate,
            is_deleted: false, start_time: { lt: dto.endTime }, end_time: { gt: dto.startTime },
          },
          select: { id: true },
        });
        if (conflict) {
          if (!dto.repeatWeekly) {
            throw new ConflictException('يوجد موعد بالفعل يتداخل مع هذه الفترة.');
          }
          continue;
        }
        const offsetMs = Date.parse(slotDate + 'T00:00:00.000Z') - sourceDateMs;
        await tx.club_availability_slots.create({
          data: {
            monthly_availability_id: id,
            module_type: plan.category,
            branch_id: providerBranchId,
            trainer_id: plan.employee_id,
            service_id: null,
            slot_date: slotDate,
            start_time: dto.startTime,
            end_time: dto.endTime,
            booking_start_at: bookingStartAt ? new Date(bookingStartAt.getTime() + offsetMs) : null,
            booking_end_at: bookingEndAt ? new Date(bookingEndAt.getTime() + offsetMs) : null,
            capacity: dto.capacity ?? 1,
            is_active: true,
          },
        });
        created++;
      }
      return { created };
    });
  }

  async updateWindow(id: number, windowId: number, dto: WindowInput, user?: JwtUser) {
    return this.prisma.$transaction(async (tx) => {
      const plan = await this.lockPlan(tx, id);
      await this.employeeScope.assertProviderAccess(user, plan.employee_id);
      await this.assertProviderBranchAccess(user, plan.employee_id, tx);
      if (plan.status === 'archived') throw new ConflictException('Archived plans cannot be edited.');
      this.validateWindow(plan, dto);
      await tx.$executeRawUnsafe(
        'SELECT id FROM club_availability_slots WHERE id = ? AND monthly_availability_id = ? FOR UPDATE',
        windowId,
        id,
      );
      const window = await tx.club_availability_slots.findFirst({
        where: { id: windowId, monthly_availability_id: id, module_type: plan.category, is_deleted: false },
      });
      if (!window) throw new NotFoundException('Attendance window not found.');
      if (plan.status === 'published') {
        this.assertFutureWindow({ slot_date: dto.slotDate, start_time: dto.startTime });
      }
      const activeBookings = await tx.club_bookings.count({
        where: {
          availability_slot_id: windowId, is_deleted: false,
          status: { in: ['pending', 'confirmed', 'wait'] },
        },
      });
      if (activeBookings) {
        throw new ConflictException('غير مسموح بتعديل هذا الموعد لوجود حجوزات بالفعل');
      }
      const conflict = await tx.club_availability_slots.findFirst({
        where: {
          id: { not: windowId },
          module_type: plan.category, trainer_id: plan.employee_id, slot_date: dto.slotDate,
          is_deleted: false, start_time: { lt: dto.endTime }, end_time: { gt: dto.startTime },
        },
        select: { id: true },
      });
      if (conflict) throw new ConflictException('Attendance overlaps another window.');
      return tx.club_availability_slots.update({
        where: { id: windowId },
        data: {
          slot_date: dto.slotDate,
          start_time: dto.startTime,
          end_time: dto.endTime,
          booking_start_at: dto.bookingStartAt ? new Date(dto.bookingStartAt) : null,
          booking_end_at: dto.bookingEndAt ? new Date(dto.bookingEndAt) : null,
          ...(dto.capacity != null ? { capacity: dto.capacity } : {}),
        },
      });
    });
  }

  async deleteWindow(id: number, windowId: number, user?: JwtUser) {
    return this.prisma.$transaction(async (tx) => {
      const plan = await this.lockPlan(tx, id);
      await this.employeeScope.assertProviderAccess(user, plan.employee_id);
      await this.assertProviderBranchAccess(user, plan.employee_id, tx);
      await tx.$executeRawUnsafe(
        'SELECT id FROM club_availability_slots WHERE id = ? AND monthly_availability_id = ? FOR UPDATE',
        windowId,
        id,
      );
      const window = await tx.club_availability_slots.findFirst({
        where: { id: windowId, monthly_availability_id: id, module_type: plan.category, is_deleted: false },
      });
      if (!window) throw new NotFoundException('Attendance window not found.');
      const activeBookings = await tx.club_bookings.count({
        where: {
          availability_slot_id: windowId, is_deleted: false,
          status: { in: ['pending', 'confirmed', 'wait'] },
        },
      });
      if (activeBookings) {
        throw new ConflictException('Attendance with active bookings must be cancelled with a reason.');
      }
      if (plan.status !== 'draft') throw new ConflictException('Published attendance must be cancelled.');
      await tx.club_availability_slots.update({
        where: { id: windowId }, data: { is_deleted: true, is_active: false },
      });
      return { success: true };
    });
  }
  async cancelWindow(id: number, windowId: number, reason: string, user?: JwtUser) {
    if (!reason || !reason.trim()) throw new BadRequestException('A cancellation reason is required.');
    const result = await this.prisma.$transaction(async (tx) => {
      const plan = await this.lockPlan(tx, id);
      await this.employeeScope.assertProviderAccess(user, plan.employee_id);
      await this.assertProviderBranchAccess(user, plan.employee_id, tx);
      if (plan.status !== 'published') throw new ConflictException('Only published attendance can be cancelled.');
      await tx.$executeRawUnsafe(
        'SELECT id FROM club_availability_slots WHERE id = ? AND monthly_availability_id = ? FOR UPDATE',
        windowId,
        id,
      );
      const window = await tx.club_availability_slots.findFirst({
        where: {
          id: windowId, monthly_availability_id: id, module_type: plan.category,
          is_deleted: false, is_active: true, cancelled_at: null,
        },
      });
      if (!window) throw new NotFoundException('Active attendance window not found.');
      this.assertFutureWindow(window);
      const bookings = await tx.club_bookings.findMany({
        where: {
          availability_slot_id: windowId, is_deleted: false,
          status: { in: ['pending', 'confirmed', 'wait'] },
        },
        select: {
          id: true, schedule_id: true, member_id: true, member_name: true, branch_id: true,
          schedule: { select: { id: true, slot_date: true, start_time: true } },
          service: { select: { name: true } },
        },
      });
      const bookingIds = bookings.map((booking) => booking.id);
      const scheduleIds = bookings.map((booking) => booking.schedule_id);
      const updatedWindow = await tx.club_availability_slots.update({
        where: { id: windowId },
        data: { is_active: false, cancelled_at: new Date(), cancellation_reason: reason.trim() },
      });
      if (bookingIds.length) {
        await tx.club_bookings.updateMany({
          where: { id: { in: bookingIds } }, data: { status: 'cancelled' },
        });
        await tx.club_schedules.updateMany({
          where: { id: { in: scheduleIds } }, data: { status: 'cancelled', booked_count: 0 },
        });
        await tx.club_appt_booking_additional_services.updateMany({
          where: { booking_id: { in: bookingIds }, status: { not: 'cancelled' } },
          data: { status: 'cancelled' },
        });
      }
      return { updatedWindow, bookings };
    });
    await Promise.all(result.bookings.map(async (booking) => {
      await this.notifications.bookingCancelled({
        bookingId: booking.id,
        scheduleId: booking.schedule_id,
        memberId: booking.member_id,
        memberName: booking.member_name,
        serviceName: booking.service?.name ?? null,
        slotDate: booking.schedule.slot_date,
        startTime: booking.schedule.start_time,
        branchId: booking.branch_id,
      });
    }));
    return { ...result.updatedWindow, cancelledBookingsCount: result.bookings.length };
  }

  async archive(id: number, user?: JwtUser) {
    const updated = await this.prisma.$transaction(async (tx) => {
      const plan = await this.lockPlan(tx, id);
      await this.employeeScope.assertProviderAccess(user, plan.employee_id);
      await this.assertProviderBranchAccess(user, plan.employee_id, tx);
      if (plan.status !== 'published') throw new ConflictException('Only published plans can be archived.');
      return tx.club_provider_monthly_availabilities.update({
        where: { id }, data: { status: 'archived' }, include: this.include,
      });
    });
    return this.present(updated);
  }
  async remove(id: number, user?: JwtUser) {
    return this.prisma.$transaction(async (tx) => {
      const plan = await this.lockPlan(tx, id);
      await this.employeeScope.assertProviderAccess(user, plan.employee_id);
      await this.assertProviderBranchAccess(user, plan.employee_id, tx);
      if (plan.status !== 'draft') throw new ConflictException('Only draft plans can be deleted.');
      const activeBookings = await tx.club_bookings.count({
        where: {
          availability_slot_id: { in: plan.windows.map((window) => window.id) },
          is_deleted: false,
          status: { in: ['pending', 'confirmed', 'wait'] },
        },
      });
      if (activeBookings) throw new ConflictException('This plan has active bookings and cannot be deleted.');
      await tx.club_availability_slots.updateMany({
        where: { monthly_availability_id: id },
        data: { is_deleted: true, is_active: false, monthly_availability_id: null },
      });
      await tx.club_provider_monthly_availabilities.delete({ where: { id } });
      return { success: true };
    });
  }
}
