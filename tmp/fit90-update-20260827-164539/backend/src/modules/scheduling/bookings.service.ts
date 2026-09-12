import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { JwtUser } from '../../common/types/jwt-user';
import { EmployeeDataScopeService } from '../../common/employee-scope/employee-data-scope.service';
import { paginated } from '../../common/dto/list-result';
import { ListBookingDto, BookingStatusValue } from './dto/list-booking.dto';
import { CreateBookingDto, UpdateBookingDto } from './dto/upsert-booking.dto';
import {
  BookingNotifyContext,
  SchedulingNotificationsService,
} from './scheduling-notifications.service';

/** Statuses that consume a seat in the slot's capacity. */
const OCCUPYING: BookingStatusValue[] = ['pending', 'confirmed', 'completed'];
const occupies = (s: string) => OCCUPYING.includes(s as BookingStatusValue);

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branchScope: BranchScopeService,
    private readonly notifications: SchedulingNotificationsService,
    private readonly employeeScope: EmployeeDataScopeService,
  ) {}

  private map(r: {
    id: number;
    booking_number: string;
    member_id: number | null;
    member_name: string | null;
    service_id: number;
    schedule_id: number;
    employee_id: number | null;
    booking_date: string;
    status: string;
    notes: string | null;
    branch_id: number | null;
    duration_min_snapshot: number | null;
    price_snapshot: unknown;
    coverage_type: string | null;
    payment_status: string | null;
    entitlement_restored_at: Date | null;
    entitlement_restore_reason: string | null;
    created_at: Date;
    updated_at: Date;
    service?: { id: number; name: string; category: string; color: string | null } | null;
    schedule?: { id: number; start_time: string; end_time: string; slot_date: string } | null;
    additional_services?: Array<{
      status: string;
      additional_service: { id: number; name: string };
    }>;
  }) {
    return {
      id: r.id,
      bookingNumber: r.booking_number,
      memberId: r.member_id,
      memberName: r.member_name,
      serviceId: r.service_id,
      serviceName: r.service?.name ?? null,
      category: r.service?.category ?? null,
      color: r.service?.color ?? null,
      scheduleId: r.schedule_id,
      employeeId: r.employee_id,
      bookingDate: r.booking_date,
      startTime: r.schedule?.start_time ?? null,
      endTime: r.schedule?.end_time ?? null,
      status: r.status,
      notes: r.notes,
      branchId: r.branch_id,
      durationMin: r.duration_min_snapshot,
      priceSnapshot: r.price_snapshot == null ? null : Number(r.price_snapshot),
      coverageType: r.coverage_type,
      paymentStatus: r.payment_status,
      entitlementRestoredAt: r.entitlement_restored_at,
      entitlementRestoreReason: r.entitlement_restore_reason,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      additionalServices: (r.additional_services ?? []).map((item) => ({
        serviceId: item.additional_service.id,
        name: item.additional_service.name,
        status: item.status,
      })),
    };
  }

  private include = {
    service: { select: { id: true, name: true, category: true, color: true } },
    schedule: { select: { id: true, start_time: true, end_time: true, slot_date: true } },
    additional_services: {
      include: { additional_service: { select: { id: true, name: true } } },
      orderBy: { additional_service: { name: 'asc' as const } },
    },
  };

  /** Attach the same member/provider details shown by the class booking screens. */
  private async attachNames<
    T extends { memberId: number | null; employeeId: number | null; memberName: string | null },
  >(rows: T[]) {
    const memberIds = [...new Set(rows.map((row) => row.memberId).filter((id): id is number => id != null))];
    const employeeIds = [...new Set(rows.map((row) => row.employeeId).filter((id): id is number => id != null))];
    const [members, employees] = await Promise.all([
      memberIds.length
        ? this.prisma.club_members.findMany({
            where: { id: { in: memberIds }, is_deleted: false },
            select: { id: true, name: true, member_code: true, phone: true },
          })
        : Promise.resolve([] as Array<{ id: number; name: string; member_code: string; phone: string | null }>),
      employeeIds.length
        ? this.prisma.club_trainers.findMany({
            where: { id: { in: employeeIds }, is_deleted: false },
            select: { id: true, name: true },
          })
        : Promise.resolve([] as Array<{ id: number; name: string }>),
    ]);
    const memberById = new Map(members.map((member) => [member.id, member]));
    const employeeById = new Map(employees.map((employee) => [employee.id, employee]));
    return rows.map((row) => {
      const member = row.memberId != null ? memberById.get(row.memberId) : null;
      return {
        ...row,
        memberName: row.memberName ?? member?.name ?? null,
        memberCode: member?.member_code ?? null,
        memberPhone: member?.phone ?? null,
        employeeName: row.employeeId != null ? employeeById.get(row.employeeId)?.name ?? null : null,
      };
    });
  }

  async list(q: ListBookingDto, user?: JwtUser) {
    const and: Prisma.club_bookingsWhereInput[] = [{ is_deleted: false }];
    if (q.category) and.push({ service: { category: q.category } });
    if (q.serviceId != null) and.push({ service_id: q.serviceId });
    if (q.scheduleId != null) and.push({ schedule_id: q.scheduleId });
    if (this.employeeScope.isSelfOnly(user)) {
      and.push({ employee_id: (await this.employeeScope.providerId(user)) ?? -1 });
    } else if (q.employeeId != null) {
      and.push({ employee_id: q.employeeId });
    }
    if (q.memberId != null) and.push({ member_id: q.memberId });
    if (q.status && q.status !== 'all') and.push({ status: q.status as BookingStatusValue });
    if (q.dateFrom) and.push({ booking_date: { gte: q.dateFrom } });
    if (q.dateTo) and.push({ booking_date: { lte: q.dateTo } });
    if (q.search?.trim()) {
      const s = q.search.trim();
      and.push({
        OR: [{ member_name: { contains: s } }, { booking_number: { contains: s } }],
      });
    }
    const branchIds = this.branchScope.resolveListFilter(user, q.branchId);
    if (branchIds) and.push({ OR: [{ branch_id: { in: branchIds } }, { branch_id: null }] });

    const where: Prisma.club_bookingsWhereInput = { AND: and };
    const [rows, total] = await Promise.all([
      this.prisma.club_bookings.findMany({
        where,
        include: this.include,
        orderBy: [{ booking_date: 'desc' }, { id: 'desc' }],
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.club_bookings.count({ where }),
    ]);
    const mapped = await this.attachNames(rows.map((r) => this.map(r)));
    return paginated(mapped, total, q.page, q.pageSize);
  }

  async findOne(id: number, user?: JwtUser) {
    const row = await this.prisma.club_bookings.findFirst({
      where: { id, is_deleted: false },
      include: this.include,
    });
    if (!row) throw new NotFoundException('Booking not found');
    await this.employeeScope.assertProviderAccess(user, row.employee_id);
    return (await this.attachNames([this.map(row)]))[0];
  }

  async memberSpaFreeSessions(scheduleId: number, memberId: number, user?: JwtUser) {
    const schedule = await this.prisma.club_schedules.findFirst({
      where: { id: scheduleId, is_deleted: false },
      select: {
        slot_date: true,
        employee_id: true,
        service: { select: { id: true, name: true, category: true } },
      },
    });
    if (!schedule) throw new NotFoundException('موعد السبا غير موجود.');
    if (schedule.service.category !== 'spa') throw new BadRequestException('هذا الموعد ليس موعد سبا.');
    await this.employeeScope.assertProviderAccess(user, schedule.employee_id);

    const member = await this.prisma.club_members.findFirst({
      where: { id: memberId, is_active: true, is_deleted: false },
      select: { id: true },
    });
    if (!member) throw new NotFoundException('العضو غير موجود أو غير فعال.');

    const subscriptions = await this.prisma.club_subscriptions.findMany({
      where: {
        member_id: memberId,
        status: { not: 'frozen' },
        subscription_start_date: { lte: schedule.slot_date },
        subscription_end_date: { gte: schedule.slot_date },
        type: { includes_spa: true, spa_count: { gt: 0 } },
      },
      select: {
        id: true,
        subscription_number: true,
        subscription_type: true,
        subscription_start_date: true,
        subscription_end_date: true,
        type: { select: { spa_count: true } },
      },
      orderBy: { subscription_end_date: 'asc' },
    });

    const sources = subscriptions.map((subscription) => ({
      subscriptionId: subscription.id,
      subscriptionNumber: subscription.subscription_number,
      subscriptionName: subscription.subscription_type,
      total: subscription.type?.spa_count ?? 0,
    }));
    const total = sources.reduce((sum, source) => sum + source.total, 0);
    const completed = subscriptions.length
      ? await this.prisma.club_bookings.count({
          where: {
            member_id: memberId,
            status: 'completed',
            is_deleted: false,
            service: { category: 'spa' },
            OR: subscriptions.map((subscription) => ({
              booking_date: {
                gte: subscription.subscription_start_date,
                lte: subscription.subscription_end_date,
              },
            })),
          },
        })
      : 0;
    const used = Math.min(total, completed);

    return {
      service: schedule.service,
      hasFreeSessions: total > 0,
      total,
      used,
      remaining: Math.max(0, total - used),
      sources,
    };
  }

  private notifyContext(row: {
    id: number;
    schedule_id: number;
    member_id: number | null;
    member_name: string | null;
    branch_id: number | null;
    service?: { name: string } | null;
    schedule?: { slot_date: string; start_time: string } | null;
  }): BookingNotifyContext {
    return {
      bookingId: row.id,
      scheduleId: row.schedule_id,
      memberId: row.member_id,
      memberName: row.member_name,
      serviceName: row.service?.name ?? null,
      slotDate: row.schedule?.slot_date ?? '',
      startTime: row.schedule?.start_time ?? '',
      branchId: row.branch_id,
    };
  }

  async create(dto: CreateBookingDto, user?: JwtUser) {
    const targetSchedule = await this.prisma.club_schedules.findFirst({
      where: { id: dto.scheduleId, is_deleted: false },
      select: { employee_id: true, service: { select: { category: true } } },
    });
    if (!targetSchedule) throw new BadRequestException(`Schedule ${dto.scheduleId} not found`);
    if (targetSchedule.service.category === 'nutrition') {
      throw new BadRequestException('Nutrition bookings must use the nutrition availability booking endpoint.');
    }
    await this.employeeScope.assertProviderAccess(user, targetSchedule.employee_id);
    const requestedStatus: BookingStatusValue = dto.status ?? 'pending';

    const created = await this.prisma.$transaction(async (tx) => {
      const schedule = await tx.club_schedules.findFirst({
        where: { id: dto.scheduleId, is_deleted: false },
      });
      if (!schedule) throw new BadRequestException(`Schedule ${dto.scheduleId} not found`);
      if (schedule.status !== 'available') {
        throw new BadRequestException(`Schedule ${dto.scheduleId} is ${schedule.status}, not bookable.`);
      }
      const now = new Date();
      if (schedule.booking_start_at && now < schedule.booking_start_at) {
        throw new BadRequestException(`Booking for schedule ${dto.scheduleId} has not opened yet.`);
      }
      if (schedule.booking_end_at && now > schedule.booking_end_at) {
        throw new BadRequestException(`Booking for schedule ${dto.scheduleId} has closed.`);
      }
      if (dto.memberId != null) {
        const duplicate = await tx.club_bookings.findFirst({
          where: {
            schedule_id: schedule.id,
            member_id: dto.memberId,
            is_deleted: false,
            status: { in: ['pending', 'confirmed', 'wait'] },
          },
          select: { id: true },
        });
        if (duplicate) throw new ConflictException('Member already has a booking or waitlist request for this appointment.');
      }

      let status = requestedStatus;
      if (occupies(requestedStatus)) {
        const claim = await tx.club_schedules.updateMany({
          where: { id: schedule.id, is_deleted: false, booked_count: { lt: schedule.capacity } },
          data: { booked_count: { increment: 1 } },
        });
        if (claim.count === 0) status = 'wait';
      }

      const row = await tx.club_bookings.create({
        data: {
          booking_number: `BK-${randomUUID().slice(0, 8).toUpperCase()}`,
          member_id: dto.memberId ?? null,
          member_name: dto.memberName ?? null,
          service_id: schedule.service_id,
          schedule_id: schedule.id,
          employee_id: schedule.employee_id,
          booking_date: schedule.slot_date,
          status,
          notes: dto.notes ?? null,
          branch_id: schedule.branch_id,
        },
        include: this.include,
      });
      const additionalServiceIds = await this.validateAdditionalSelection(
        tx,
        schedule.service_id,
        dto.additionalServiceIds ?? [],
      );
      for (const serviceId of additionalServiceIds) {
        await tx.club_appt_booking_additional_services.create({
          data: {
            booking_id: row.id,
            additional_service_id: serviceId,
            status: 'confirmed',
          },
        });
      }

      return tx.club_bookings.findUniqueOrThrow({ where: { id: row.id }, include: this.include });
    });

    if (created.status === 'confirmed') {
      await this.notifications.bookingConfirmed(this.notifyContext(created));
    }
    return this.map(created);
  }

  async update(id: number, dto: UpdateBookingDto, user?: JwtUser) {
    const existing = await this.prisma.club_bookings.findFirst({
      where: { id, is_deleted: false },
      include: this.include,
    });
    if (!existing) throw new NotFoundException('Booking not found');
    if (existing.service?.category === 'nutrition') {
      throw new BadRequestException('Nutrition bookings must use the nutrition booking workflow.');
    }
    await this.employeeScope.assertProviderAccess(user, existing.employee_id);

    const prevStatus = existing.status;
    const nextStatus = dto.status ?? (prevStatus as BookingStatusValue);
    const wasOccupying = occupies(prevStatus);
    const willOccupy = occupies(nextStatus);

    const result = await this.prisma.$transaction(async (tx) => {
      const row = await tx.club_bookings.update({
        where: { id },
        data: {
          ...(dto.status != null ? { status: dto.status } : {}),
          ...(dto.memberId !== undefined ? { member_id: dto.memberId } : {}),
          ...(dto.memberName !== undefined ? { member_name: dto.memberName } : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        },
        include: this.include,
      });

      if (nextStatus === 'cancelled' || nextStatus === 'completed') {
        await tx.club_appt_booking_additional_services.updateMany({
          where: { booking_id: id, status: { not: 'cancelled' } },
          data: { status: nextStatus === 'completed' ? 'completed' : 'cancelled' },
        });
      }

      // Reconcile the slot's booked_count against the occupancy transition.
      if (wasOccupying && !willOccupy) {
        await this.decrement(tx, existing.schedule_id);
      } else if (!wasOccupying && willOccupy) {
        // Atomic re-acquire: only take the seat if one is actually free.
        const schedule = await tx.club_schedules.findFirst({ where: { id: existing.schedule_id } });
        const cap = schedule?.capacity ?? 0;
        const claim = await tx.club_schedules.updateMany({
          where: { id: existing.schedule_id, is_deleted: false, booked_count: { lt: cap } },
          data: { booked_count: { increment: 1 } },
        });
        if (claim.count === 0) {
          throw new BadRequestException(
            `Schedule ${existing.schedule_id} is fully booked (${cap}/${cap}).`,
          );
        }
      }
      const promoted = wasOccupying && nextStatus === 'cancelled'
        ? await this.promoteNextWaiter(tx, existing.schedule_id)
        : null;
      const refreshed = nextStatus === 'cancelled' || nextStatus === 'completed'
        ? await tx.club_bookings.findUniqueOrThrow({ where: { id }, include: this.include })
        : row;
      return { row: refreshed, promoted };
    });

    // Fire notifications after the transaction commits.
    if (prevStatus !== 'confirmed' && nextStatus === 'confirmed') {
      await this.notifications.bookingConfirmed(this.notifyContext(result.row));
    } else if (prevStatus !== 'cancelled' && nextStatus === 'cancelled') {
      await this.notifications.bookingCancelled(this.notifyContext(result.row));
    }
    if (result.promoted) {
      await this.notifications.bookingConfirmed(this.notifyContext(result.promoted));
    }
    return this.map(result.row);
  }

  async remove(id: number, user?: JwtUser) {
    const existing = await this.prisma.club_bookings.findFirst({
      where: { id, is_deleted: false },
      include: this.include,
    });
    if (!existing) throw new NotFoundException('Booking not found');
    if (existing.service?.category === 'nutrition') {
      throw new BadRequestException('Nutrition bookings cannot be deleted from the generic booking route.');
    }
    await this.employeeScope.assertProviderAccess(user, existing.employee_id);

    const promoted = await this.prisma.$transaction(async (tx) => {
      await tx.club_bookings.update({ where: { id }, data: { is_deleted: true } });
      await tx.club_appt_booking_additional_services.updateMany({
        where: { booking_id: id, status: { not: 'cancelled' } },
        data: { status: 'cancelled' },
      });
      if (occupies(existing.status)) {
        await this.decrement(tx, existing.schedule_id);
        return this.promoteNextWaiter(tx, existing.schedule_id);
      }
      return null;
    });
    if (existing.status !== 'cancelled') {
      await this.notifications.bookingCancelled(this.notifyContext(existing));
    }
    if (promoted) await this.notifications.bookingConfirmed(this.notifyContext(promoted));
    return { success: true };
  }

  /** Decrement a schedule's booked_count, flooring at 0. */
  private async decrement(tx: Prisma.TransactionClient, scheduleId: number) {
    const schedule = await tx.club_schedules.findFirst({ where: { id: scheduleId } });
    if (!schedule) return;
    const next = schedule.booked_count > 0 ? schedule.booked_count - 1 : 0;
    await tx.club_schedules.update({ where: { id: scheduleId }, data: { booked_count: next } });
  }

  /** Promote the oldest waiting booking when a confirmed seat becomes free. */
  private async promoteNextWaiter(tx: Prisma.TransactionClient, scheduleId: number) {
    const schedule = await tx.club_schedules.findFirst({
      where: { id: scheduleId, is_deleted: false },
      select: { id: true, capacity: true },
    });
    if (!schedule) return null;
    const waiting = await tx.club_bookings.findFirst({
      where: { schedule_id: scheduleId, status: 'wait', is_deleted: false },
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
    });
    if (!waiting) return null;
    const claim = await tx.club_schedules.updateMany({
      where: { id: scheduleId, is_deleted: false, booked_count: { lt: schedule.capacity } },
      data: { booked_count: { increment: 1 } },
    });
    if (claim.count === 0) return null;
    return tx.club_bookings.update({
      where: { id: waiting.id },
      data: { status: 'confirmed' },
      include: this.include,
    });
  }

  /** Validate selected add-ons against the base service and include required ones. */
  private async validateAdditionalSelection(
    tx: Prisma.TransactionClient,
    parentServiceId: number,
    requestedIds: number[],
  ) {
    const parentService = await tx.club_services.findUnique({
      where: { id: parentServiceId },
      select: { category: true },
    });
    if (parentService?.category !== 'spa') {
      if (requestedIds.length) throw new BadRequestException('Additional services can only be selected for SPA bookings.');
      return [];
    }
    const services = await tx.club_services.findMany({
      where: { id: { in: requestedIds }, category: 'additional', is_active: true, is_deleted: false },
      select: { id: true },
    });
    const allowed = new Set(services.map((service) => service.id));
    const invalid = requestedIds.find((id) => !allowed.has(id));
    if (invalid != null) {
      throw new BadRequestException(`Additional service ${invalid} is inactive or does not exist.`);
    }
    return [...new Set(requestedIds)];
  }
}
