import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { JwtUser } from '../../common/types/jwt-user';

export interface DashboardQuery {
  dateFrom?: string;
  dateTo?: string;
  branchId?: number;
}

/**
 * Aggregations for the Scheduling dashboard: totals, occupancy, leaderboards and
 * upcoming/cancelled feeds. All figures respect the caller's branch scope.
 */
@Injectable()
export class SchedulingDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branchScope: BranchScopeService,
  ) {}

  async summary(q: DashboardQuery, user?: JwtUser) {
    const branchIds = this.branchScope.resolveListFilter(user, q.branchId);
    const branchWhere = branchIds ? { branch_id: { in: branchIds } } : {};
    const dateWhere: Prisma.club_schedulesWhereInput = {};
    if (q.dateFrom) dateWhere.slot_date = { gte: q.dateFrom };
    if (q.dateTo) {
      dateWhere.slot_date = { ...(dateWhere.slot_date as object), lte: q.dateTo };
    }

    const scheduleWhere: Prisma.club_schedulesWhereInput = {
      is_deleted: false,
      ...branchWhere,
      ...dateWhere,
    };
    const bookingDate: Prisma.club_bookingsWhereInput['booking_date'] = {};
    if (q.dateFrom) bookingDate.gte = q.dateFrom;
    if (q.dateTo) bookingDate.lte = q.dateTo;
    const bookingWhere: Prisma.club_bookingsWhereInput = {
      is_deleted: false,
      ...branchWhere,
      ...(q.dateFrom || q.dateTo ? { booking_date: bookingDate } : {}),
    };

    const [
      totalSchedules,
      totalBookings,
      cancelledBookings,
      capacityAgg,
      byStatus,
      topServices,
      topCoaches,
      upcoming,
      recentCancelled,
    ] = await Promise.all([
      this.prisma.club_schedules.count({ where: scheduleWhere }),
      this.prisma.club_bookings.count({ where: bookingWhere }),
      this.prisma.club_bookings.count({ where: { ...bookingWhere, status: 'cancelled' } }),
      this.prisma.club_schedules.aggregate({
        where: scheduleWhere,
        _sum: { capacity: true, booked_count: true },
      }),
      this.prisma.club_bookings.groupBy({
        by: ['status'],
        where: bookingWhere,
        _count: { _all: true },
      }),
      this.prisma.club_bookings.groupBy({
        by: ['service_id'],
        where: { ...bookingWhere, status: { not: 'cancelled' } },
        _count: { _all: true },
        orderBy: { _count: { service_id: 'desc' } },
        take: 5,
      }),
      this.prisma.club_bookings.groupBy({
        by: ['employee_id'],
        where: { ...bookingWhere, status: { not: 'cancelled' }, employee_id: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { employee_id: 'desc' } },
        take: 5,
      }),
      this.prisma.club_bookings.findMany({
        where: { ...bookingWhere, status: { in: ['pending', 'confirmed'] } },
        include: {
          service: { select: { name: true, category: true, color: true } },
          schedule: { select: { slot_date: true, start_time: true, end_time: true } },
        },
        orderBy: [{ booking_date: 'asc' }, { id: 'asc' }],
        take: 10,
      }),
      this.prisma.club_bookings.findMany({
        where: { ...bookingWhere, status: 'cancelled' },
        include: {
          service: { select: { name: true, category: true } },
          schedule: { select: { slot_date: true, start_time: true } },
        },
        orderBy: { updated_at: 'desc' },
        take: 10,
      }),
    ]);

    const totalCapacity = capacityAgg._sum.capacity ?? 0;
    const totalBooked = capacityAgg._sum.booked_count ?? 0;
    const occupancyPct =
      totalCapacity > 0 ? Math.round((totalBooked / totalCapacity) * 1000) / 10 : 0;

    const serviceNames = await this.nameMap(
      'club_services',
      topServices.map((s) => s.service_id),
    );
    const coachNames = await this.trainerNameMap(
      topCoaches.map((c) => c.employee_id).filter((v): v is number => v != null),
    );

    return {
      totals: {
        schedules: totalSchedules,
        bookings: totalBookings,
        cancelled: cancelledBookings,
        totalCapacity,
        totalBooked,
        occupancyPct,
      },
      bookingsByStatus: byStatus.map((s) => ({ status: s.status, count: s._count._all })),
      mostBookedServices: topServices.map((s) => ({
        serviceId: s.service_id,
        name: serviceNames.get(s.service_id) ?? `#${s.service_id}`,
        count: s._count._all,
      })),
      mostActiveCoaches: topCoaches.map((c) => ({
        employeeId: c.employee_id,
        name: c.employee_id != null ? coachNames.get(c.employee_id) ?? `#${c.employee_id}` : '—',
        count: c._count._all,
      })),
      upcoming: upcoming.map((b) => ({
        id: b.id,
        bookingNumber: b.booking_number,
        memberName: b.member_name,
        serviceName: b.service?.name ?? null,
        category: b.service?.category ?? null,
        color: b.service?.color ?? null,
        date: b.schedule?.slot_date ?? b.booking_date,
        startTime: b.schedule?.start_time ?? null,
        endTime: b.schedule?.end_time ?? null,
        status: b.status,
      })),
      cancelled: recentCancelled.map((b) => ({
        id: b.id,
        bookingNumber: b.booking_number,
        memberName: b.member_name,
        serviceName: b.service?.name ?? null,
        date: b.schedule?.slot_date ?? b.booking_date,
        startTime: b.schedule?.start_time ?? null,
      })),
    };
  }

  private async nameMap(_table: 'club_services', ids: number[]): Promise<Map<number, string>> {
    if (!ids.length) return new Map();
    const rows = await this.prisma.club_services.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    });
    return new Map(rows.map((r) => [r.id, r.name]));
  }

  private async trainerNameMap(ids: number[]): Promise<Map<number, string>> {
    if (!ids.length) return new Map();
    const rows = await this.prisma.club_trainers.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    });
    return new Map(rows.map((r) => [r.id, r.name]));
  }
}
