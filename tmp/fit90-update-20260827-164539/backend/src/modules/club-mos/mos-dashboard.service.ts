import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { deriveSubStatus, toNum } from '../club-subscriptions/club-subscription.utils';
import { isoDate, daysAgo } from './mos-reports.shared';

function monthStart(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function monthEnd(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return `${month}-${String(last).padStart(2, '0')}`;
}

function targetFromConfig(config: unknown): number {
  if (config == null || typeof config !== 'object') return 0;
  const c = config as Record<string, unknown>;
  for (const key of ['target', 'amount', 'goal']) {
    const n = Number(c[key]);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

function classPrice(metadata: Prisma.JsonValue | null): number {
  if (metadata == null || typeof metadata !== 'object' || Array.isArray(metadata)) return 0;
  return toNum((metadata as Prisma.JsonObject).price);
}

@Injectable()
export class MosDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async analytics(query: { days?: number; branchId?: number }) {
    const days = Math.min(Math.max(query.days ?? 30, 7), 365);
    const from = daysAgo(days);
    const to = isoDate();
    const branchFilter = query.branchId != null ? { branch_id: query.branchId } : {};
    const classRange = {
      gte: new Date(`${from}T00:00:00`),
      lte: new Date(`${to}T23:59:59.999`),
    };

    const [
      totalMembers,
      members,
      subsInRange,
      receiptsInRange,
      attendanceInRange,
      allSubs,
      sources,
      leadsPending,
      activeSubsWithDebt,
      completedServiceBookings,
      completedClassBookings,
    ] = await Promise.all([
      this.prisma.club_members.count({ where: { is_deleted: false, ...branchFilter } }),
      this.prisma.club_members.findMany({
        where: { is_deleted: false, ...branchFilter },
        select: { id: true, created_at: true, source_id: true },
      }),
      this.prisma.club_subscriptions.findMany({
        where: { registration_date: { gte: from, lte: to }, ...branchFilter },
        select: {
          id: true,
          member_id: true,
          registration_date: true,
          subscription_type: true,
          paid_amount: true,
          remaining_amount: true,
          customer_source_id: true,
        },
      }),
      this.prisma.club_receipts.findMany({
        where: {
          receipt_date: { gte: from, lte: to },
          ...(query.branchId != null ? { member: { branch_id: query.branchId } } : {}),
        },
        select: { receipt_date: true, amount: true },
      }),
      this.prisma.club_attendance.findMany({
        where: { attendance_date: { gte: from, lte: to }, ...branchFilter },
        select: { check_in_time: true },
      }),
      this.prisma.club_subscriptions.findMany({
        where: branchFilter,
        select: {
          id: true,
          member_id: true,
          registration_date: true,
          subscription_start_date: true,
          subscription_end_date: true,
          subscription_type: true,
          paid_amount: true,
          remaining_amount: true,
        },
      }),
      this.prisma.club_customer_sources.findMany({ select: { id: true, name: true } }),
      this.prisma.club_leads.count({
        where: {
          is_deleted: false,
          status: { in: ['new', 'contacted', 'qualified'] },
          ...branchFilter,
        },
      }),
      this.prisma.club_subscriptions.findMany({
        where: { remaining_amount: { gt: 0 }, status: 'active', ...branchFilter },
        select: { remaining_amount: true },
      }),
      this.prisma.club_bookings.findMany({
        where: {
          is_deleted: false,
          status: 'completed',
          booking_date: { gte: from, lte: to },
          ...branchFilter,
        },
        select: {
          service: { select: { category: true, price: true } },
          additional_services: {
            where: { status: 'completed' },
            select: { additional_service: { select: { price: true } } },
          },
        },
      }),
      this.prisma.club_class_bookings.findMany({
        where: {
          status: 'completed',
          slot: { start_at: classRange },
        },
        select: {
          slot: {
            select: {
              monthly_schedule: {
                select: { class: { select: { metadata: true } } },
              },
            },
          },
          additional_services: {
            where: { status: 'completed' },
            select: { service: { select: { price: true } } },
          },
        },
      }),
    ]);

    const today = isoDate();
    const activeMemberIds = new Set<number>();
    for (const s of allSubs) {
      const st = deriveSubStatus(s.subscription_start_date, s.subscription_end_date);
      if (st === 'active' && s.member_id) activeMemberIds.add(s.member_id);
    }

    const subscriptionRevenue = subsInRange.reduce((sum, s) => sum + toNum(s.paid_amount), 0);
    let classRevenue = 0;
    let personalTrainingRevenue = 0;
    let nutritionRevenue = 0;
    let spaRevenue = 0;

    for (const booking of completedServiceBookings) {
      const amount =
        toNum(booking.service.price) +
        booking.additional_services.reduce(
          (sum, item) => sum + toNum(item.additional_service.price),
          0,
        );
      switch (booking.service.category) {
        case 'class':
        case 'zumba':
          classRevenue += amount;
          break;
        case 'personal_training':
          personalTrainingRevenue += amount;
          break;
        case 'nutrition':
          nutritionRevenue += amount;
          break;
        case 'spa':
          spaRevenue += amount;
          break;
      }
    }

    for (const booking of completedClassBookings) {
      classRevenue +=
        classPrice(booking.slot.monthly_schedule.class.metadata) +
        booking.additional_services.reduce((sum, item) => sum + toNum(item.service.price), 0);
    }

    const revenue =
      subscriptionRevenue +
      classRevenue +
      personalTrainingRevenue +
      nutritionRevenue +
      spaRevenue;
    const newMembersInRange = members.filter((m) => m.created_at.toISOString().slice(0, 10) >= from).length;
    const openDebtTotal = activeSubsWithDebt.reduce((s, r) => s + toNum(r.remaining_amount), 0);

    const membersProgress: Array<{
      month: string;
      oldMembers: number;
      newMembers: number;
      renewed: number;
      notRenewed: number;
    }> = [];

    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - i);
      const mKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const mStart = `${mKey}-01`;
      const mEnd = monthEnd(mKey);

      const newInMonth = members.filter((m) => {
        const c = m.created_at.toISOString().slice(0, 10);
        return c >= mStart && c <= mEnd;
      }).length;

      const subsInMonth = allSubs.filter((s) => s.registration_date >= mStart && s.registration_date <= mEnd);
      const renewed = subsInMonth.filter((s) => {
        if (!s.member_id) return false;
        return allSubs.some(
          (prev) =>
            prev.member_id === s.member_id &&
            prev.subscription_end_date < s.subscription_start_date &&
            prev.id !== s.id,
        );
      }).length;

      const expiredInMonth = allSubs.filter(
        (s) => s.subscription_end_date >= mStart && s.subscription_end_date <= mEnd,
      );
      const notRenewed = expiredInMonth.filter((s) => {
        if (!s.member_id) return true;
        return !allSubs.some(
          (n) =>
            n.member_id === s.member_id &&
            n.subscription_start_date > s.subscription_end_date &&
            n.registration_date <= mEnd,
        );
      }).length;

      const activeAtEnd = allSubs.filter((s) => {
        const st = deriveSubStatus(s.subscription_start_date, s.subscription_end_date);
        return (st === 'active' || st === 'upcoming') && s.subscription_start_date <= mEnd && s.subscription_end_date >= mEnd;
      }).length;

      membersProgress.push({
        month: mKey,
        oldMembers: Math.max(0, activeAtEnd - newInMonth),
        newMembers: newInMonth,
        renewed,
        notRenewed,
      });
    }

    const attendanceByHour = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }));
    for (const a of attendanceInRange) {
      const h = a.check_in_time.getHours();
      attendanceByHour[h].count += 1;
    }

    const moneyByDayMap = new Map<string, number>();
    for (const r of receiptsInRange) {
      moneyByDayMap.set(r.receipt_date, (moneyByDayMap.get(r.receipt_date) ?? 0) + toNum(r.amount));
    }
    const moneyByDay = Array.from(moneyByDayMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, amount]) => ({ date, amount }));

    const sourceCounts = new Map<number, number>();
    for (const m of members) {
      if (m.source_id != null) sourceCounts.set(m.source_id, (sourceCounts.get(m.source_id) ?? 0) + 1);
    }
    for (const s of subsInRange) {
      if (s.customer_source_id != null) {
        sourceCounts.set(s.customer_source_id, (sourceCounts.get(s.customer_source_id) ?? 0) + 1);
      }
    }
    const sourceOfKnowledge = sources
      .map((s) => ({ name: s.name, count: sourceCounts.get(s.id) ?? 0 }))
      .filter((s) => s.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    const debtBuckets = [
      { label: '< 100', count: 0, total: 0 },
      { label: '100–300', count: 0, total: 0 },
      { label: '300–500', count: 0, total: 0 },
      { label: '500–1000', count: 0, total: 0 },
      { label: '1000+', count: 0, total: 0 },
    ];
    for (const s of activeSubsWithDebt) {
      const v = toNum(s.remaining_amount);
      const bucket =
        v < 100 ? 0 : v < 300 ? 1 : v < 500 ? 2 : v < 1000 ? 3 : 4;
      debtBuckets[bucket].count += 1;
      debtBuckets[bucket].total += v;
    }

    const packageCounts = new Map<string, { count: number; income: number }>();
    for (const s of subsInRange) {
      const name = s.subscription_type?.trim() || 'Other';
      const cur = packageCounts.get(name) ?? { count: 0, income: 0 };
      cur.count += 1;
      cur.income += toNum(s.paid_amount);
      packageCounts.set(name, cur);
    }
    const packages = Array.from(packageCounts.entries())
      .map(([name, v]) => ({ name, count: v.count, income: v.income }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const incomeByPackage = [...packages].sort((a, b) => b.income - a.income).slice(0, 8);

    return {
      range: { from, to, days },
      kpis: {
        totalMembers,
        activeMembers: activeMemberIds.size,
        newMembers: newMembersInRange,
        revenue,
        subscriptionRevenue,
        classRevenue,
        personalTrainingRevenue,
        nutritionRevenue,
        spaRevenue,
        attendanceCheckIns: attendanceInRange.length,
        pendingLeads: leadsPending,
        openDebtTotal,
        subscriptionsInRange: subsInRange.length,
      },
      membersProgress,
      attendanceByHour,
      moneyByDay,
      sourceOfKnowledge,
      debtBuckets,
      packages,
      incomeByPackage,
      asOf: today,
    };
  }

  async salesOverview(query: { month?: string; salesStaffId?: number; approvedOnly?: boolean }) {
    const month = query.month ?? monthStart().slice(0, 7);
    const from = `${month}-01`;
    const to = monthEnd(month);

    const [staff, rules, subs, receipts] = await Promise.all([
      this.prisma.club_sales_staff.findMany({
        where: { is_deleted: false, is_active: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.club_commission_rules.findMany({
        where: { kind: { in: ['sales_target', 'sales_percentage', 'sales_range'] }, is_active: true },
      }),
      this.prisma.club_subscriptions.findMany({
        where: {
          registration_date: { gte: from, lte: to },
          ...(query.salesStaffId != null ? { sales_id: query.salesStaffId } : {}),
        },
        select: {
          sales_id: true,
          paid_amount: true,
          registration_date: true,
          customer_name: true,
          status: true,
        },
      }),
      this.prisma.club_receipts.findMany({
        where: { receipt_date: { gte: from, lte: to } },
        select: { receipt_date: true, amount: true, subscription_id: true },
      }),
    ]);

    const targetRule = rules.find((r) => r.kind === 'sales_target');
    const defaultTarget = targetFromConfig(targetRule?.config) || 50000;
    const perStaffTarget = staff.length > 0 ? defaultTarget / staff.length : defaultTarget;

    const achievedByStaff = new Map<number, number>();
    for (const s of subs) {
      if (query.approvedOnly && s.status !== 'active') continue;
      const id = s.sales_id ?? 0;
      achievedByStaff.set(id, (achievedByStaff.get(id) ?? 0) + toNum(s.paid_amount));
    }

    const staffRows = staff
      .filter((s) => query.salesStaffId == null || s.id === query.salesStaffId)
      .map((s) => {
        const achieved = achievedByStaff.get(s.id) ?? 0;
        const target = perStaffTarget;
        return {
          id: s.id,
          name: s.name,
          target,
          achieved,
          percent: target > 0 ? Math.round((achieved / target) * 1000) / 10 : 0,
        };
      });

    const wholeTarget = staffRows.reduce((s, r) => s + r.target, 0);
    const wholeAchieved = staffRows.reduce((s, r) => s + r.achieved, 0);

    const dailyMap = new Map<string, number>();
    for (const s of subs) {
      if (query.approvedOnly && s.status !== 'active') continue;
      dailyMap.set(s.registration_date, (dailyMap.get(s.registration_date) ?? 0) + toNum(s.paid_amount));
    }
    const dailySales = Array.from({ length: 31 }, (_, i) => {
      const day = String(i + 1).padStart(2, '0');
      const date = `${month}-${day}`;
      if (date > to) return null;
      return { day, date, amount: dailyMap.get(date) ?? 0 };
    }).filter((d): d is { day: string; date: string; amount: number } => d != null);

    return {
      month,
      approvedOnly: Boolean(query.approvedOnly),
      wholeTarget: {
        target: wholeTarget,
        achieved: wholeAchieved,
        percent: wholeTarget > 0 ? Math.round((wholeAchieved / wholeTarget) * 1000) / 10 : 0,
      },
      staff: staffRows,
      dailySales,
      receiptTotal: receipts.reduce((s, r) => s + toNum(r.amount), 0),
    };
  }

  async trainerOverview(query: { month?: string; trainerId?: number; approvedOnly?: boolean }) {
    const month = query.month ?? monthStart().slice(0, 7);
    const from = `${month}-01`;
    const to = monthEnd(month);

    const [trainers, rules, classes, enrollments] = await Promise.all([
      this.prisma.club_trainers.findMany({
        where: { is_deleted: false, is_active: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.club_commission_rules.findMany({
        where: { kind: { in: ['trainer_target', 'trainer_percentage', 'instructor_class_rate'] }, is_active: true },
      }),
      this.prisma.club_classes.findMany({
        where: {
          class_date: { gte: from, lte: to },
          is_deleted: false,
          ...(query.trainerId != null ? { trainer_id: query.trainerId } : {}),
        },
        select: { id: true, trainer_id: true, class_date: true, price: true, status: true },
      }),
      this.prisma.club_class_enrollments.findMany({
        where: {
          enrollment_date: { gte: from, lte: to },
          attendance_status: { not: 'cancelled' },
        },
        select: { class_id: true, enrollment_date: true },
      }),
    ]);

    const targetRule = rules.find((r) => r.kind === 'trainer_target');
    const defaultTarget = targetFromConfig(targetRule?.config) || 40;
    const perTrainerTarget = trainers.length > 0 ? defaultTarget : defaultTarget;

    const classCountByTrainer = new Map<number, number>();
    const revenueByTrainer = new Map<number, number>();
    const classIdsByTrainer = new Map<number, Set<number>>();

    for (const c of classes) {
      if (query.approvedOnly && c.status === 'cancelled') continue;
      const tid = c.trainer_id ?? 0;
      classCountByTrainer.set(tid, (classCountByTrainer.get(tid) ?? 0) + 1);
      revenueByTrainer.set(tid, (revenueByTrainer.get(tid) ?? 0) + toNum(c.price));
      if (!classIdsByTrainer.has(tid)) classIdsByTrainer.set(tid, new Set());
      classIdsByTrainer.get(tid)!.add(c.id);
    }

    const enrollmentByDay = new Map<string, number>();
    const dashboardClassIds = new Set(classes.map((classRow) => classRow.id));
    for (const e of enrollments) {
      if (!dashboardClassIds.has(e.class_id)) continue;
      enrollmentByDay.set(e.enrollment_date, (enrollmentByDay.get(e.enrollment_date) ?? 0) + 1);
    }

    const trainerRows = trainers
      .filter((t) => query.trainerId == null || t.id === query.trainerId)
      .map((t) => {
        const classesHeld = classCountByTrainer.get(t.id) ?? 0;
        const target = perTrainerTarget;
        return {
          id: t.id,
          name: t.name,
          target,
          achieved: classesHeld,
          revenue: revenueByTrainer.get(t.id) ?? 0,
          percent: target > 0 ? Math.round((classesHeld / target) * 1000) / 10 : 0,
        };
      });

    const wholeTarget = trainerRows.reduce((s, r) => s + r.target, 0);
    const wholeAchieved = trainerRows.reduce((s, r) => s + r.achieved, 0);

    const dailySales = Array.from({ length: 31 }, (_, i) => {
      const day = String(i + 1).padStart(2, '0');
      const date = `${month}-${day}`;
      if (date > to) return null;
      return { day, date, count: enrollmentByDay.get(date) ?? 0 };
    }).filter((d): d is { day: string; date: string; count: number } => d != null);

    return {
      month,
      approvedOnly: Boolean(query.approvedOnly),
      wholeTarget: {
        target: wholeTarget,
        achieved: wholeAchieved,
        percent: wholeTarget > 0 ? Math.round((wholeAchieved / wholeTarget) * 1000) / 10 : 0,
      },
      trainers: trainerRows,
      dailySales,
    };
  }
}
