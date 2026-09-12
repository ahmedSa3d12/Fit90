import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { JwtUser } from '../../common/types/jwt-user';
import { EmployeeDataScopeService } from '../../common/employee-scope/employee-data-scope.service';
import { paginated } from '../../common/dto/list-result';
import { ListScheduleDto, ScheduleStatus } from './dto/list-schedule.dto';
import { UpsertScheduleDto } from './dto/upsert-schedule.dto';
import { GenerateRecurringDto } from './dto/generate-recurring.dto';
import { GenerateBulkDto } from './dto/generate-bulk.dto';
import { dateRange, isValidDate, normTime, sliceWindow, toMinutes, weekdayOf } from './scheduling.util';
import { SchedulingNotificationsService } from './scheduling-notifications.service';

/** A resource-occupying candidate slot used by conflict detection. */
interface Candidate {
  slotDate: string;
  startTime: string;
  endTime: string;
  employeeId: number | null;
  roomId: number | null;
  machineId: number | null;
  bookingStartAt?: Date | null;
  bookingEndAt?: Date | null;
}

@Injectable()
export class SchedulesService {
  private readonly log = new Logger(SchedulesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly branchScope: BranchScopeService,
    private readonly employeeScope: EmployeeDataScopeService,
    private readonly notifications: SchedulingNotificationsService,
  ) {}

  // ── mapping ────────────────────────────────────────────────────────────────

  private map(r: {
    id: number;
    service_id: number;
    additional_service_id: number | null;
    employee_id: number | null;
    room_id: number | null;
    machine_id: number | null;
    branch_id: number | null;
    slot_date: string;
    start_time: string;
    end_time: string;
    booking_start_at: Date | null;
    booking_end_at: Date | null;
    capacity: number;
    booked_count: number;
    status: string;
    recurrence_group: string | null;
    monthly_schedule_id: number | null;
    notes: string | null;
    created_at: Date;
    updated_at: Date;
    service?: { id: number; name: string; category: string; color: string | null } | null;
    additional_service?: { id: number; name: string; price: Prisma.Decimal } | null;
  }) {
    return {
      id: r.id,
      serviceId: r.service_id,
      serviceName: r.service?.name ?? null,
      additionalServiceId: r.additional_service_id,
      additionalServiceName: r.additional_service?.name ?? null,
      additionalServicePrice: r.additional_service?.price.toString() ?? null,
      category: r.service?.category ?? null,
      color: r.service?.color ?? null,
      employeeId: r.employee_id,
      roomId: r.room_id,
      machineId: r.machine_id,
      branchId: r.branch_id,
      slotDate: r.slot_date,
      startTime: r.start_time,
      endTime: r.end_time,
      bookingStartAt: r.booking_start_at,
      bookingEndAt: r.booking_end_at,
      capacity: r.capacity,
      bookedCount: r.booked_count,
      remaining: Math.max(0, r.capacity - r.booked_count),
      status: r.status,
      recurrenceGroup: r.recurrence_group,
      monthlyScheduleId: r.monthly_schedule_id,
      notes: r.notes,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }

  private serviceInclude = {
    service: { select: { id: true, name: true, category: true, color: true } },
    additional_service: { select: { id: true, name: true, price: true } },
  };

  // ── list / read ──────────────────────────────────────────────────────────

  async list(q: ListScheduleDto, user?: JwtUser) {
    const where = await this.buildWhere(q, user);
    const [rows, total] = await Promise.all([
      this.prisma.club_schedules.findMany({
        where,
        include: this.serviceInclude,
        orderBy: [{ slot_date: 'asc' }, { start_time: 'asc' }],
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.club_schedules.count({ where }),
    ]);
    const now = new Date();
    const filtered = q.bookable === 'true'
      ? rows.filter(
          (r) =>
            r.booked_count < r.capacity &&
            (!r.booking_start_at || r.booking_start_at <= now) &&
            (!r.booking_end_at || r.booking_end_at >= now),
        )
      : rows;
    const withNames = await this.attachResourceNames(filtered.map((r) => this.map(r)));
    return paginated(withNames, total, q.page, q.pageSize);
  }

  /** Calendar feed for month/week/day views — flat array (no pagination). */
  async calendar(q: ListScheduleDto, user?: JwtUser) {
    const where = await this.buildWhere(q, user);
    const rows = await this.prisma.club_schedules.findMany({
      where,
      include: {
        ...this.serviceInclude,
        bookings: {
          where: { status: 'wait', is_deleted: false },
          select: { id: true },
        },
      },
      orderBy: [{ slot_date: 'asc' }, { start_time: 'asc' }],
      take: 2000,
    });
    return this.attachResourceNames(rows.map((r) => ({ ...this.map(r), waitingCount: r.bookings.length })));
  }

  private async buildWhere(
    q: ListScheduleDto,
    user?: JwtUser,
  ): Promise<Prisma.club_schedulesWhereInput> {
    const and: Prisma.club_schedulesWhereInput[] = [{ is_deleted: false }];
    if (q.monthlyScheduleId != null) and.push({ monthly_schedule_id: q.monthlyScheduleId });
    if (q.serviceId != null) and.push({ service_id: q.serviceId });
    if (q.category) and.push({ service: { category: q.category } });
    if (this.employeeScope.isSelfOnly(user)) {
      and.push({ employee_id: (await this.employeeScope.providerId(user)) ?? -1 });
    } else if (q.employeeId != null) {
      and.push({ employee_id: q.employeeId });
    }
    if (q.roomId != null) and.push({ room_id: q.roomId });
    if (q.machineId != null) and.push({ machine_id: q.machineId });
    if (q.status && q.status !== 'all') and.push({ status: q.status as ScheduleStatus });
    if (q.dateFrom) and.push({ slot_date: { gte: q.dateFrom } });
    if (q.dateTo) and.push({ slot_date: { lte: q.dateTo } });

    const branchIds = this.branchScope.resolveListFilter(user, q.branchId);
    if (branchIds) and.push({ OR: [{ branch_id: { in: branchIds } }, { branch_id: null }] });
    return { AND: and };
  }

  /** Batch-resolve employee (trainer) & room names for a page of mapped rows. */
  private async attachResourceNames<T extends { employeeId: number | null; roomId: number | null }>(
    rows: T[],
  ): Promise<Array<T & { employeeName: string | null; roomName: string | null }>> {
    const empIds = [...new Set(rows.map((r) => r.employeeId).filter((v): v is number => v != null))];
    const roomIds = [...new Set(rows.map((r) => r.roomId).filter((v): v is number => v != null))];
    const [emps, rooms] = await Promise.all([
      empIds.length
        ? this.prisma.club_trainers.findMany({
            where: { id: { in: empIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([] as Array<{ id: number; name: string }>),
      roomIds.length
        ? this.prisma.club_class_rooms.findMany({
            where: { id: { in: roomIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([] as Array<{ id: number; name: string }>),
    ]);
    const empMap = new Map(emps.map((e) => [e.id, e.name]));
    const roomMap = new Map(rooms.map((r) => [r.id, r.name]));
    return rows.map((r) => ({
      ...r,
      employeeName: r.employeeId != null ? empMap.get(r.employeeId) ?? null : null,
      roomName: r.roomId != null ? roomMap.get(r.roomId) ?? null : null,
    }));
  }

  async findOne(id: number, user?: JwtUser) {
    const row = await this.prisma.club_schedules.findFirst({
      where: { id, is_deleted: false },
      include: this.serviceInclude,
    });
    if (!row) throw new NotFoundException('Schedule not found');
    await this.employeeScope.assertProviderAccess(user, row.employee_id);
    const [withName] = await this.attachResourceNames([this.map(row)]);
    return withName;
  }

  // ── conflict detection ─────────────────────────────────────────────────────

  /**
   * Return human-readable conflict reasons for a candidate slot. A resource
   * (employee / room / machine) is considered occupied by any non-deleted,
   * non-cancelled/hidden schedule on the same date whose time window overlaps.
   */
  async findConflicts(cand: Candidate, excludeId?: number): Promise<string[]> {
    const reasons: string[] = [];
    const baseOverlap: Prisma.club_schedulesWhereInput = {
      is_deleted: false,
      OR: [
        { status: 'available' },
        { status: 'hidden', monthly_schedule: { status: { not: 'archived' } } },
      ],
      slot_date: cand.slotDate,
      start_time: { lt: cand.endTime },
      end_time: { gt: cand.startTime },
      ...(excludeId != null ? { id: { not: excludeId } } : {}),
    };

    const checks: Array<{ field: 'employee_id' | 'room_id' | 'machine_id'; id: number | null; label: string }> = [
      { field: 'employee_id', id: cand.employeeId, label: 'Employee/coach' },
      { field: 'room_id', id: cand.roomId, label: 'Room' },
      { field: 'machine_id', id: cand.machineId, label: 'Machine' },
    ];

    for (const c of checks) {
      if (c.id == null) continue;
      const hit = await this.prisma.club_schedules.findFirst({
        where: { ...baseOverlap, [c.field]: c.id },
        select: { id: true, start_time: true, end_time: true },
      });
      if (hit) {
        reasons.push(
          `${c.label} already booked ${hit.start_time}-${hit.end_time} on ${cand.slotDate} (schedule #${hit.id}).`,
        );
      }
    }
    return reasons;
  }

  private validateTimeOrder(startTime: string, endTime: string) {
    if (toMinutes(endTime) <= toMinutes(startTime)) {
      throw new BadRequestException('endTime must be after startTime.');
    }
  }

  private bookingWindow(start?: string, end?: string) {
    if (!!start !== !!end) {
      throw new BadRequestException('bookingStartAt and bookingEndAt must be provided together.');
    }
    if (!start || !end) return { bookingStartAt: null, bookingEndAt: null };
    const bookingStartAt = new Date(start);
    const bookingEndAt = new Date(end);
    if (bookingEndAt <= bookingStartAt) {
      throw new BadRequestException('bookingEndAt must be after bookingStartAt.');
    }
    return { bookingStartAt, bookingEndAt };
  }

  // ── create / update / delete ───────────────────────────────────────────────

  async create(dto: UpsertScheduleDto, user?: JwtUser) {
    const employeeId = await this.employeeScope.scopedProviderId(user, dto.employeeId);
    if (dto.serviceId == null) throw new BadRequestException('serviceId is required');
    if (!dto.slotDate || !dto.startTime || !dto.endTime) {
      throw new BadRequestException('slotDate, startTime and endTime are required');
    }
    const service = await this.prisma.club_services.findFirst({
      where: { id: dto.serviceId, is_deleted: false },
    });
    if (!service) throw new BadRequestException(`Service ${dto.serviceId} not found`);
    if (service.category === 'nutrition') {
      throw new BadRequestException('Nutrition attendance and bookings use the dedicated nutrition availability flow.');
    }
    const monthlyPlan = dto.monthlyScheduleId != null
      ? await this.prisma.club_service_monthly_schedules.findUnique({ where: { id: dto.monthlyScheduleId } })
      : null;
    if (dto.monthlyScheduleId != null && !monthlyPlan) throw new BadRequestException('Monthly schedule not found');
    if (monthlyPlan && (monthlyPlan.service_id !== dto.serviceId || monthlyPlan.employee_id !== employeeId)) {
      throw new BadRequestException('Service/provider does not match the monthly schedule');
    }
    if (monthlyPlan && dto.slotDate && (monthlyPlan.month !== Number(dto.slotDate.slice(5, 7)) || monthlyPlan.year !== Number(dto.slotDate.slice(0, 4)))) {
      throw new BadRequestException('Appointment date must be inside the monthly schedule');
    }
    if (monthlyPlan?.status === 'archived') throw new BadRequestException('Archived schedules cannot be edited');

    const startTime = normTime(dto.startTime);
    const endTime = normTime(dto.endTime);
    this.validateTimeOrder(startTime, endTime);
    const bookingWindow = this.bookingWindow(dto.bookingStartAt, dto.bookingEndAt);

    const cand: Candidate = {
      slotDate: dto.slotDate,
      startTime,
      endTime,
      employeeId,
      roomId: dto.roomId ?? null,
      machineId: dto.machineId ?? null,
    };
    const conflicts = await this.findConflicts(cand);
    if (conflicts.length) throw new BadRequestException(conflicts.join(' '));

    const row = await this.prisma.club_schedules.create({
      data: {
        service_id: dto.serviceId,
        monthly_schedule_id: dto.monthlyScheduleId ?? null,
        employee_id: employeeId,
        room_id: dto.roomId ?? null,
        machine_id: dto.machineId ?? null,
        branch_id: dto.branchId ?? service.branch_id ?? null,
        slot_date: dto.slotDate,
        start_time: startTime,
        end_time: endTime,
        booking_start_at: bookingWindow.bookingStartAt,
        booking_end_at: bookingWindow.bookingEndAt,
        capacity: dto.capacity ?? service.capacity ?? 1,
        status: monthlyPlan ? (monthlyPlan.status === 'published' ? 'available' : 'hidden') : (dto.status ?? 'available'),
        notes: dto.notes ?? null,
      },
      include: this.serviceInclude,
    });
    const [withName] = await this.attachResourceNames([this.map(row)]);
    return withName;
  }

  async update(id: number, dto: UpsertScheduleDto, user?: JwtUser) {
    const existing = await this.prisma.club_schedules.findFirst({
      where: { id, is_deleted: false },
      include: { service: { select: { category: true } } },
    });
    if (!existing) throw new NotFoundException('Schedule not found');
    if (existing.service.category === 'nutrition') {
      throw new BadRequestException('Nutrition appointments are managed by the dedicated nutrition flow.');
    }
    await this.employeeScope.assertProviderAccess(user, existing.employee_id);
    if (dto.employeeId !== undefined) await this.employeeScope.scopedProviderId(user, dto.employeeId);

    const startTime = dto.startTime != null ? normTime(dto.startTime) : existing.start_time;
    const endTime = dto.endTime != null ? normTime(dto.endTime) : existing.end_time;
    this.validateTimeOrder(startTime, endTime);
    const bookingWindow =
      dto.bookingStartAt !== undefined || dto.bookingEndAt !== undefined
        ? this.bookingWindow(dto.bookingStartAt, dto.bookingEndAt)
        : null;

    const nextStatus = dto.status ?? (existing.status as ScheduleStatus);
    // Re-check conflicts only when the slot remains active and time/resources move.
    if (nextStatus === 'available') {
      const cand: Candidate = {
        slotDate: dto.slotDate ?? existing.slot_date,
        startTime,
        endTime,
        employeeId: dto.employeeId !== undefined ? dto.employeeId : existing.employee_id,
        roomId: dto.roomId !== undefined ? dto.roomId : existing.room_id,
        machineId: dto.machineId !== undefined ? dto.machineId : existing.machine_id,
      };
      const conflicts = await this.findConflicts(cand, id);
      if (conflicts.length) throw new BadRequestException(conflicts.join(' '));
    }

    // Capacity can never drop below what's already booked.
    if (dto.capacity != null && dto.capacity < existing.booked_count) {
      throw new BadRequestException(
        `Capacity ${dto.capacity} is below current bookings (${existing.booked_count}).`,
      );
    }

    const row = await this.prisma.club_schedules.update({
      where: { id },
      data: {
        ...(dto.serviceId != null ? { service_id: dto.serviceId } : {}),
        ...(dto.employeeId !== undefined ? { employee_id: dto.employeeId } : {}),
        ...(dto.roomId !== undefined ? { room_id: dto.roomId } : {}),
        ...(dto.machineId !== undefined ? { machine_id: dto.machineId } : {}),
        ...(dto.branchId !== undefined ? { branch_id: dto.branchId } : {}),
        ...(dto.slotDate != null ? { slot_date: dto.slotDate } : {}),
        ...(dto.startTime != null ? { start_time: startTime } : {}),
        ...(dto.endTime != null ? { end_time: endTime } : {}),
        ...(bookingWindow
          ? {
              booking_start_at: bookingWindow.bookingStartAt,
              booking_end_at: bookingWindow.bookingEndAt,
            }
          : {}),
        ...(dto.capacity != null ? { capacity: dto.capacity } : {}),
        ...(dto.status != null ? { status: dto.status } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
      },
      include: this.serviceInclude,
    });
    const [withName] = await this.attachResourceNames([this.map(row)]);
    return withName;
  }

  async cancel(id: number, user?: JwtUser) {
    const schedule = await this.prisma.club_schedules.findFirst({
      where: { id, is_deleted: false },
      include: {
        service: { select: { name: true } },
        bookings: {
          where: {
            is_deleted: false,
            status: { in: ['pending', 'confirmed', 'wait'] },
          },
        },
      },
    });
    if (!schedule) throw new NotFoundException('Schedule not found');
    await this.employeeScope.assertProviderAccess(user, schedule.employee_id);
    if (schedule.status === 'cancelled') {
      return { success: true, notifiedBookingsCount: 0 };
    }

    const bookingIds = schedule.bookings.map((booking) => booking.id);
    await this.prisma.$transaction(async (tx) => {
      await tx.club_schedules.update({
        where: { id },
        data: { status: 'cancelled', booked_count: 0 },
      });
      if (!bookingIds.length) return;
      await tx.club_bookings.updateMany({
        where: { id: { in: bookingIds } },
        data: { status: 'cancelled' },
      });
      await tx.club_appt_booking_additional_services.updateMany({
        where: { booking_id: { in: bookingIds }, status: { not: 'cancelled' } },
        data: { status: 'cancelled' },
      });
    });

    await Promise.all(schedule.bookings.map(async (booking) => {
      try {
        await this.notifications.bookingCancelled({
          bookingId: booking.id,
          scheduleId: schedule.id,
          memberId: booking.member_id,
          memberName: booking.member_name,
          serviceName: schedule.service?.name ?? null,
          slotDate: schedule.slot_date,
          startTime: schedule.start_time,
          branchId: booking.branch_id,
        });
      } catch (err) {
        this.log.warn(
          `failed to notify cancellation for booking #${booking.id}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }));

    return { success: true, notifiedBookingsCount: schedule.bookings.length };
  }

  async remove(id: number, user?: JwtUser) {
    const existing = await this.prisma.club_schedules.findFirst({
      where: { id, is_deleted: false },
      include: { service: { select: { category: true } } },
    });
    if (!existing) throw new NotFoundException('Schedule not found');
    if (existing.service.category === 'nutrition') {
      throw new BadRequestException('Nutrition appointments are managed by the dedicated nutrition flow.');
    }
    await this.employeeScope.assertProviderAccess(user, existing.employee_id);
    const activeBookings = await this.prisma.club_bookings.count({
      where: { schedule_id: id, is_deleted: false, status: { in: ['pending', 'confirmed'] } },
    });
    if (activeBookings > 0) {
      throw new BadRequestException(
        `Cannot delete schedule: ${activeBookings} active booking(s) exist. Cancel them first.`,
      );
    }
    await this.prisma.club_schedules.update({ where: { id }, data: { is_deleted: true } });
    return { success: true };
  }

  // ── bulk generators ─────────────────────────────────────────────────────────

  private async resolveService(serviceId: number) {
    const service = await this.prisma.club_services.findFirst({
      where: { id: serviceId, is_deleted: false },
    });
    if (!service) throw new BadRequestException(`Service ${serviceId} not found`);
    if (service.category === 'nutrition') {
      throw new BadRequestException('Nutrition attendance uses the dedicated provider availability flow.');
    }
    return service;
  }

  /**
   * Persist a batch of candidate slots, skipping (never throwing on) any that
   * conflict or already exist. Returns counts + the skip reasons.
   */
  private async persistBatch(
    slots: Candidate[],
    opts: { serviceId: number; branchId: number | null; capacity: number; group: string; monthlyScheduleId?: number; status?: ScheduleStatus },
  ) {
    let created = 0;
    const createdIds: number[] = [];
    const skipped: string[] = [];
    for (const s of slots) {
      const dup = await this.prisma.club_schedules.findFirst({
        where: {
          is_deleted: false,
          service_id: opts.serviceId,
          slot_date: s.slotDate,
          start_time: s.startTime,
          employee_id: s.employeeId,
          room_id: s.roomId,
          machine_id: s.machineId,
        },
        select: { id: true },
      });
      if (dup) {
        skipped.push(`${s.slotDate} ${s.startTime}: duplicate of #${dup.id}`);
        continue;
      }
      const conflicts = await this.findConflicts(s);
      if (conflicts.length) {
        skipped.push(`${s.slotDate} ${s.startTime}: ${conflicts.join(' ')}`);
        continue;
      }
      const createdSlot = await this.prisma.club_schedules.create({
        data: {
          service_id: opts.serviceId,
          monthly_schedule_id: opts.monthlyScheduleId ?? null,
          employee_id: s.employeeId,
          room_id: s.roomId,
          machine_id: s.machineId,
          branch_id: opts.branchId,
          slot_date: s.slotDate,
          start_time: s.startTime,
          end_time: s.endTime,
          booking_start_at: s.bookingStartAt ?? null,
          booking_end_at: s.bookingEndAt ?? null,
          capacity: opts.capacity,
          status: opts.status ?? 'available',
          recurrence_group: opts.group,
        },
      });
      created += 1;
      createdIds.push(createdSlot.id);
    }
    return { created, createdIds, skipped, skippedCount: skipped.length };
  }

  async generateRecurring(dto: GenerateRecurringDto, user?: JwtUser) {
    const employeeId = await this.employeeScope.scopedProviderId(user, dto.employeeId);
    const service = await this.resolveService(dto.serviceId);
    const monthlyPlan = dto.monthlyScheduleId != null
      ? await this.prisma.club_service_monthly_schedules.findUnique({ where: { id: dto.monthlyScheduleId } })
      : null;
    if (dto.monthlyScheduleId != null && !monthlyPlan) throw new BadRequestException('Monthly schedule not found');
    if (monthlyPlan && (monthlyPlan.service_id !== dto.serviceId || monthlyPlan.employee_id !== employeeId)) throw new BadRequestException('Service/provider does not match the monthly schedule');
    if (monthlyPlan?.status === 'archived') throw new BadRequestException('Archived schedules cannot be edited');
    const startTime = normTime(dto.startTime);
    const endTime = normTime(dto.endTime);
    this.validateTimeOrder(startTime, endTime);
    const bookingWindow = this.bookingWindow(dto.bookingStartAt, dto.bookingEndAt);
    if ((bookingWindow.bookingStartAt || bookingWindow.bookingEndAt) && !dto.templateDate) {
      throw new BadRequestException('templateDate is required with a recurring booking window');
    }

    const wanted = new Set(dto.weekdays);
    const dates = dateRange(dto.dateFrom, dto.dateTo).filter((d) => wanted.has(weekdayOf(d)));
    const slots: Candidate[] = dates.map((slotDate) => {
      const offset = dto.templateDate
        ? Date.parse(`${slotDate}T00:00:00.000Z`) - Date.parse(`${dto.templateDate}T00:00:00.000Z`)
        : 0;
      return {
        slotDate,
        startTime,
        endTime,
        employeeId,
        roomId: dto.roomId ?? null,
        machineId: dto.machineId ?? null,
        bookingStartAt: bookingWindow.bookingStartAt
          ? new Date(bookingWindow.bookingStartAt.getTime() + offset)
          : null,
        bookingEndAt: bookingWindow.bookingEndAt
          ? new Date(bookingWindow.bookingEndAt.getTime() + offset)
          : null,
      };
    });

    return this.persistBatch(slots, {
      serviceId: dto.serviceId,
      branchId: dto.branchId ?? service.branch_id ?? null,
      capacity: dto.capacity ?? service.capacity ?? 1,
      group: `rec-${randomUUID().slice(0, 8)}`,
      monthlyScheduleId: dto.monthlyScheduleId,
      status: monthlyPlan ? (monthlyPlan.status === 'published' ? 'available' : 'hidden') : 'available',
    });
  }

  async generateBulk(dto: GenerateBulkDto, user?: JwtUser) {
    const employeeId = await this.employeeScope.scopedProviderId(user, dto.employeeId);
    const service = await this.resolveService(dto.serviceId);
    const monthlyPlan = dto.monthlyScheduleId != null
      ? await this.prisma.club_service_monthly_schedules.findUnique({ where: { id: dto.monthlyScheduleId } })
      : null;
    if (dto.monthlyScheduleId != null && !monthlyPlan) throw new BadRequestException('Monthly schedule not found');
    if (monthlyPlan && (monthlyPlan.service_id !== dto.serviceId || monthlyPlan.employee_id !== employeeId)) throw new BadRequestException('Service/provider does not match the monthly schedule');
    if (monthlyPlan?.status === 'archived') throw new BadRequestException('Archived schedules cannot be edited');
    this.validateTimeOrder(normTime(dto.workStart), normTime(dto.workEnd));

    // Resolve target dates: explicit list, or range (+ optional weekday filter).
    let dates: string[];
    if (dto.dates?.length) {
      dates = dto.dates.filter((d) => isValidDate(d));
    } else if (dto.dateFrom && dto.dateTo) {
      const wanted = dto.weekdays?.length ? new Set(dto.weekdays) : null;
      dates = dateRange(dto.dateFrom, dto.dateTo).filter((d) => !wanted || wanted.has(weekdayOf(d)));
    } else {
      throw new BadRequestException('Provide either `dates` or `dateFrom`+`dateTo`.');
    }

    const windows = sliceWindow(dto.workStart, dto.workEnd, dto.durationMin, dto.breakMin ?? 0);
    if (!windows.length) {
      throw new BadRequestException('No slots fit the working window with that duration.');
    }

    const slots: Candidate[] = [];
    for (const date of dates) {
      for (const w of windows) {
        slots.push({
          slotDate: date,
          startTime: w.start,
          endTime: w.end,
          employeeId,
          roomId: dto.roomId ?? null,
          machineId: dto.machineId ?? null,
        });
      }
    }

    return this.persistBatch(slots, {
      serviceId: dto.serviceId,
      branchId: dto.branchId ?? service.branch_id ?? null,
      capacity: dto.capacity ?? service.capacity ?? 1,
      group: `bulk-${randomUUID().slice(0, 8)}`,
      monthlyScheduleId: dto.monthlyScheduleId,
      status: monthlyPlan ? (monthlyPlan.status === 'published' ? 'available' : 'hidden') : 'available',
    });
  }
}
