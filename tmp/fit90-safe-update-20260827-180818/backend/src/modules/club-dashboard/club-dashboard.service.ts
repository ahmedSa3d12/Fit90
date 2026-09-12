import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { JwtUser } from '../../common/types/jwt-user';
import { localDateString } from '../club-members/club-member.utils';
import { addDays, daysBetween, deriveSubStatus, toNum } from '../club-subscriptions/club-subscription.utils';

@Injectable()
export class ClubDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branchScope: BranchScopeService,
  ) {}

  async summary(query: { startDate?: string; endDate?: string; branchId?: string }, user?: JwtUser) {
    const start = query.startDate ?? localDateString().slice(0, 8) + '01';
    const end = query.endDate ?? localDateString();
    // Intersect the requested branch with the caller's scope: a branch manager
    // can never widen past their own branch(es) via ?branchId=; super-admins are
    // unrestricted (branchIds === null).
    const branchIds = this.branchScope.resolveListFilter(user, query.branchId ?? null);
    const branchCond: { branch_id?: { in: number[] } } =
      branchIds === null ? {} : { branch_id: { in: branchIds } };

    const memberWhere = { is_deleted: false, ...branchCond };
    const subWhere = {
      ...branchCond,
      registration_date: { gte: start, lte: end },
    };

    const today = localDateString();
    const monthStart = today.slice(0, 8) + '01';

    const [totalMembers, members, subsInRange, attendance, allSubs, trainerCount, classesToday, spaInvoices, inbodyInvoices, classEnrollmentsPaid] =
      await Promise.all([
        this.prisma.club_members.count({ where: memberWhere }),
        this.prisma.club_members.findMany({
          where: memberWhere,
          select: { id: true, end_date: true, created_at: true },
        }),
        this.prisma.club_subscriptions.findMany({ where: subWhere }),
        this.prisma.club_attendance.findMany({
          where: {
            attendance_date: { gte: start, lte: end },
            ...branchCond,
          },
          select: { member_id: true },
        }),
        this.prisma.club_subscriptions.findMany({
          where: branchCond,
          select: {
            member_id: true,
            subscription_start_date: true,
            subscription_end_date: true,
          },
        }),
        this.prisma.club_trainers.count({ where: { is_deleted: false, is_active: true } }),
        this.prisma.club_classes.count({
          where: {
            is_deleted: false,
            class_date: today,
            ...branchCond,
          },
        }),
        this.prisma.club_spa_invoices.findMany({
          where: {
            is_active: true,
            invoice_date: { gte: start, lte: end },
            ...branchCond,
          },
        }),
        this.prisma.club_inbody_invoices.findMany({
          where: {
            is_active: true,
            invoice_date: { gte: start, lte: end },
            ...branchCond,
          },
        }),
        this.prisma.club_class_enrollments.findMany({
          where: {
            enrollment_date: { gte: start, lte: end },
            attendance_status: { not: 'cancelled' },
            class: {
              is_deleted: false,
              ...branchCond,
            },
          },
          include: { class: { select: { price: true } } },
        }),
      ]);

    const spaRevenue = spaInvoices
      .filter((i) => i.status === 'paid')
      .reduce((sum, i) => sum + toNum(i.total_amount), 0);
    const inbodyRevenue = inbodyInvoices
      .filter((i) => i.status === 'paid')
      .reduce((sum, i) => sum + toNum(i.total_amount), 0);
    const classRevenue = classEnrollmentsPaid.reduce(
      (sum, e) => sum + toNum(e.class.price),
      0,
    );

    const activeMemberIds = new Set<number>();
    for (const s of allSubs) {
      if (!s.member_id) continue;
      const st = deriveSubStatus(s.subscription_start_date, s.subscription_end_date);
      if (st === 'active' || st === 'upcoming') activeMemberIds.add(s.member_id);
    }

    const newThisMonth = members.filter((m) => m.created_at.toISOString().slice(0, 10) >= monthStart).length;

    const subscriptionRevenue = subsInRange.reduce((sum, s) => sum + toNum(s.paid_amount), 0);
    const monthlyRevenue = subscriptionRevenue + spaRevenue + inbodyRevenue + classRevenue;
    const totalRevenueAllSources = monthlyRevenue;

    // No expenses module has been migrated to the new schema yet, so there is no source of truth for
    // expenses. Report 0 with expensesAvailable=false explicitly, rather than querying the old-system
    // `Expenses` table (which doesn't exist here and made the flag structurally always false anyway).
    const expenses = 0;
    const expensesAvailable = false;

    const distinctAttendees = new Set(attendance.map((a) => a.member_id)).size;
    const activeMembers =
      activeMemberIds.size || members.filter((m) => m.end_date && m.end_date >= today).length;
    const attendanceRate = activeMembers > 0 ? Math.round((distinctAttendees / activeMembers) * 100) : 0;

    // Distribution of currently active/upcoming subscriptions (by real duration), not only new
    // registrations in the selected date range — hub users expect the live plan mix.
    const distribution = { monthly: 0, quarterly: 0, halfYearly: 0, yearly: 0 };
    for (const s of allSubs) {
      const st = deriveSubStatus(s.subscription_start_date, s.subscription_end_date);
      if (st !== 'active' && st !== 'upcoming') continue;
      const days = daysBetween(s.subscription_start_date, s.subscription_end_date);
      if (days <= 35) distribution.monthly++;
      else if (days <= 100) distribution.quarterly++;
      else if (days < 360) distribution.halfYearly++;
      else distribution.yearly++;
    }

    const expiredSubscriptions = allSubs.filter(
      (s) => deriveSubStatus(s.subscription_start_date, s.subscription_end_date) === 'expired',
    ).length;

    const renewalWindow = addDays(today, 7);
    const pendingRenewals = allSubs.filter((s) => {
      const st = deriveSubStatus(s.subscription_start_date, s.subscription_end_date);
      return st === 'active' && s.subscription_end_date <= renewalWindow;
    }).length;

    const recentMembers = await this.prisma.club_members.findMany({
      where: memberWhere,
      orderBy: { created_at: 'desc' },
      take: 5,
      select: { id: true, name: true, member_code: true, created_at: true },
    });

    const recentPayments = await this.prisma.club_receipts.findMany({
      where: {
        receipt_date: { gte: start, lte: end },
        // Honor branch scope via the receipt's subscription/member (receipts have no branch column).
        ...(branchIds === null
          ? {}
          : {
              OR: [
                { subscription: { branch_id: { in: branchIds } } },
                { member: { branch_id: { in: branchIds } } },
              ],
            }),
      },
      orderBy: { created_at: 'desc' },
      take: 5,
      select: { id: true, member_name: true, amount: true, receipt_date: true, receipt_number: true },
    });

    const avgMonthlyMembership =
      subsInRange.length > 0
        ? subsInRange.reduce((s, x) => s + toNum(x.subscription_value), 0) / subsInRange.length
        : 0;

    return {
      totalMembers: {
        total: totalMembers,
        active: activeMembers,
        inactive: totalMembers - activeMembers,
        newThisMonth,
      },
      monthlyRevenue,
      subscriptionRevenue,
      spaRevenue,
      inbodyRevenue,
      classRevenue,
      otherRevenue: spaRevenue + inbodyRevenue + classRevenue,
      totalRevenueAllSources,
      netProfit: totalRevenueAllSources - expenses,
      expensesAvailable,
      trainers: trainerCount,
      classesToday,
      avgMonthlyMembership,
      attendanceRate,
      subscriptionDistribution: distribution,
      alerts: {
        expiredSubscriptions,
        pendingRenewals,
        newMembers: newThisMonth,
      },
      recentActivities: {
        members: recentMembers.map((m) => ({
          type: 'member',
          label: m.name,
          code: m.member_code,
          date: m.created_at,
        })),
        payments: recentPayments.map((p) => ({
          type: 'payment',
          label: p.member_name,
          amount: toNum(p.amount),
          date: p.receipt_date,
          receiptNumber: p.receipt_number,
        })),
      },
      startDate: start,
      endDate: end,
      branchId: branchIds && branchIds.length === 1 ? branchIds[0] : null,
    };
  }

  async treasury(dateInput?: string) {
    const date = dateInput ?? localDateString();
    const [receipts, subs, spaInvoices, inbodyInvoices] = await Promise.all([
      this.prisma.club_receipts.findMany({ where: { receipt_date: date } }),
      this.prisma.club_subscriptions.findMany({ where: { registration_date: date } }),
      this.prisma.club_spa_invoices.findMany({
        where: { invoice_date: date, is_active: true, status: 'paid' },
        include: { service: { select: { name: true } } },
      }),
      this.prisma.club_inbody_invoices.findMany({
        where: { invoice_date: date, is_active: true, status: 'paid' },
      }),
    ]);

    const memberIds = [
      ...new Set([
        ...spaInvoices.map((i) => i.member_id),
        ...inbodyInvoices.filter((i) => i.member_id).map((i) => i.member_id!),
      ]),
    ];
    const memberRows =
      memberIds.length > 0
        ? await this.prisma.club_members.findMany({
            where: { id: { in: memberIds } },
            select: { id: true, name: true },
          })
        : [];
    const memberNameById = new Map(memberRows.map((m) => [m.id, m.name]));

    // Every subscription payment also creates a club_receipts row, so receipts are the single
    // source of truth for subscription cash. Only emit a subscription-sourced entry when the
    // subscription has NO receipt on this date (e.g. legacy/imported rows) — otherwise the same
    // money would be counted twice (once as 'receipt' and once as 'subscription').
    const receiptSubIds = new Set(
      receipts.map((r) => r.subscription_id).filter((sid): sid is number => sid != null),
    );

    const entries: Array<{
      source: string;
      subscriptionId?: number | null;
      customerName: string;
      amount: number;
      paymentMethod: string;
    }> = [
      ...receipts.map((r) => ({
        source: 'receipt',
        subscriptionId: r.subscription_id ?? null,
        customerName: r.member_name ?? '—',
        amount: toNum(r.amount),
        // club_receipts.payment_method (ClubPaymentMethod enum) is now populated — use the real
        // method; fall back to 'cash' only when null (legacy/imported rows).
        paymentMethod: r.payment_method ?? 'cash',
      })),
      ...subs
        .filter((s) => toNum(s.paid_amount) > 0 && !receiptSubIds.has(s.id))
        .map((s) => ({
          source: 'subscription',
          subscriptionId: s.id,
          customerName: s.customer_name ?? '—',
          amount: toNum(s.paid_amount),
          paymentMethod: s.payment_method ?? 'cash',
        })),
      ...spaInvoices.map((i) => ({
        source: 'spa',
        customerName: memberNameById.get(i.member_id) ?? i.service?.name ?? '—',
        amount: toNum(i.total_amount),
        // club_spa_invoices has no payment_method column → default to 'cash'.
        paymentMethod: 'cash',
      })),
      ...inbodyInvoices.map((i) => ({
        source: 'inbody',
        customerName:
          (i.member_id ? memberNameById.get(i.member_id) : null) ?? i.customer_name ?? '—',
        amount: toNum(i.total_amount),
        // club_inbody_invoices has no payment_method column → default to 'cash'.
        paymentMethod: 'cash',
      })),
    ];

    const byMethod: Record<string, number> = {};
    let total = 0;
    for (const e of entries) {
      total += e.amount;
      byMethod[e.paymentMethod] = (byMethod[e.paymentMethod] ?? 0) + e.amount;
    }
    return { date, total, byMethod, entries };
  }
}
