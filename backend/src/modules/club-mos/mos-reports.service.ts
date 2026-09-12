import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { paginated } from '../../common/dto/list-result';
import { mapRow, toNum } from './mos-camel.util';
import { ListMosReportDto } from './dto/list-mos-entity.dto';
import {
  type MosReportResult,
  type ReportHandler,
  dateRangeWhere,
  branchWhere,
} from './mos-reports.shared';
import { MEMBERSHIP_REPORTS } from './reports/memberships.reports';
import { INCOME_REPORTS } from './reports/income.reports';
import { SALES_REPORTS } from './reports/sales.reports';
import { TRAINER_REPORTS } from './reports/trainers.reports';
import { CLASS_REPORTS } from './reports/classes.reports';
import { STAFF_FINANCE_REPORTS } from './reports/staff-finance.reports';

export type { MosReportResult };

@Injectable()
export class MosReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async run(key: string, q: ListMosReportDto): Promise<MosReportResult> {
    const handler = REPORT_HANDLERS[key];
    if (handler) return handler(this.prisma, q);
    return {
      key,
      title: key,
      summary: { count: 0 },
      columns: [{ key: 'message', label: 'Info' }],
      rows: [{ message: 'Report data will populate as club activity grows.' }],
    };
  }

  listAvailable(): string[] {
    return Object.keys(REPORT_HANDLERS);
  }
}

const REPORT_HANDLERS: Record<string, ReportHandler> = {
  ...MEMBERSHIP_REPORTS,
  ...INCOME_REPORTS,
  ...SALES_REPORTS,
  ...TRAINER_REPORTS,
  ...CLASS_REPORTS,
  ...STAFF_FINANCE_REPORTS,
  profit: async (prisma, q) => {
    const receiptWhere = { ...branchWhere(q), ...dateRangeWhere('receipt_date', q) };
    const expenseWhere = {
      is_deleted: false,
      entry_type: 'expense' as const,
      ...branchWhere(q),
      ...dateRangeWhere('entry_date', q),
    };

    const [receipts, expenses, otherRevenue] = await Promise.all([
      prisma.club_receipts.findMany({ where: receiptWhere }),
      prisma.club_financial_entries.findMany({ where: expenseWhere }),
      prisma.club_financial_entries.findMany({
        where: {
          is_deleted: false,
          entry_type: 'other_revenue',
          ...branchWhere(q),
          ...dateRangeWhere('entry_date', q),
        },
      }),
    ]);

    const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
    const receiptsTotal = roundMoney(receipts.reduce((s, r) => s + toNum(r.amount), 0));
    const otherRevenueTotal = roundMoney(otherRevenue.reduce((s, r) => s + toNum(r.amount), 0));
    const income = roundMoney(receiptsTotal + otherRevenueTotal);
    const expenseTotal = roundMoney(expenses.reduce((s, r) => s + toNum(r.amount), 0));
    const netProfit = roundMoney(income - expenseTotal);

    return {
      key: 'profit',
      title: 'Profit',
      summary: { income, expenses: expenseTotal, net: netProfit },
      columns: [
        { key: 'source', label: 'Source' },
        { key: 'amount', label: 'Amount' },
      ],
      rows: [
        { source: 'Receipts & payments', amount: receiptsTotal },
        { source: 'Other revenue', amount: otherRevenueTotal },
        { source: 'Expenses', amount: -expenseTotal },
        { source: 'Net profit', amount: netProfit },
      ],
    };
  },

  profitSummary: async (prisma, q) => {
    const base = await REPORT_HANDLERS.profit(prisma, q);
    return { ...base, key: 'profitSummary', title: 'Profit Summary' };
  },

  membershipsIncome: async (prisma, q) => {
    const where: Prisma.club_receiptsWhereInput = {
      subscription: {
        is: {
          is_linked_to_sessions: false,
          type: { is: { package_category: { notIn: ['private', 'medical'] } } },
        },
      },
      ...branchWhere(q),
      ...dateRangeWhere('receipt_date', q),
    };
    const receipts = await prisma.club_receipts.findMany({ where, orderBy: { receipt_date: 'desc' } });
    const total = receipts.reduce((s, r) => s + toNum(r.amount), 0);
    const rows = receipts.slice(q.skip, q.skip + q.take);
    return {
      key: 'membershipsIncome',
      title: 'Memberships Income',
      summary: { total, count: receipts.length },
      columns: [
        { key: 'receiptNumber', label: 'Receipt' },
        { key: 'memberName', label: 'Member' },
        { key: 'amount', label: 'Amount' },
        { key: 'receiptDate', label: 'Date' },
      ],
      rows: rows.map((r) => mapRow(r as unknown as Record<string, unknown>)),
      total: receipts.length,
      page: q.page,
      pageSize: q.pageSize,
    };
  },

  debts: async (prisma, q) => {
    const and: Prisma.club_subscriptionsWhereInput[] = [{ remaining_amount: { gt: 0 } }];
    if (q.branchId != null) and.push({ branch_id: q.branchId });
    if (q.search?.trim()) {
      and.push({
        OR: [
          { customer_name: { contains: q.search.trim() } },
          { subscription_number: { contains: q.search.trim() } },
        ],
      });
    }

    const [rows, total] = await Promise.all([
      prisma.club_subscriptions.findMany({
        where: { AND: and },
        orderBy: [{ remaining_amount: 'desc' }],
        skip: q.skip,
        take: q.take,
      }),
      prisma.club_subscriptions.count({ where: { AND: and } }),
    ]);

    const allDebt = await prisma.club_subscriptions.findMany({
      where: { AND: and },
      select: { remaining_amount: true },
    });
    const totalDebt = allDebt.reduce((s, r) => s + toNum(r.remaining_amount), 0);
    const paged = paginated(
      rows.map((r) => ({
        subscriptionNumber: r.subscription_number,
        customerName: r.customer_name,
        subscriptionType: r.subscription_type,
        remainingAmount: toNum(r.remaining_amount),
        paidAmount: toNum(r.paid_amount),
        registrationDate: r.registration_date,
      })),
      total,
      q.page,
      q.pageSize,
    );

    return {
      key: 'debts',
      title: 'Debts',
      summary: { totalDebt, count: total },
      columns: [
        { key: 'subscriptionNumber', label: 'Subscription' },
        { key: 'customerName', label: 'Member' },
        { key: 'remainingAmount', label: 'Remaining' },
        { key: 'registrationDate', label: 'Date' },
      ],
      rows: paged.data,
      total: paged.total,
      page: paged.page,
      pageSize: paged.pageSize,
    };
  },

  birthdays: async (prisma, q) => {
    const search = q.search?.trim();
    const where: Prisma.club_membersWhereInput = {
      is_deleted: false,
      date_of_birth: { not: null },
      ...branchWhere(q),
      ...(search ? { name: { contains: search } } : {}),
    };

    const members = await prisma.club_members.findMany({
      where,
      orderBy: { date_of_birth: 'asc' },
      skip: q.skip,
      take: q.take,
    });
    const total = await prisma.club_members.count({ where });

    return {
      key: 'birthdays',
      title: 'Birthdays',
      summary: { count: total },
      columns: [
        { key: 'name', label: 'Member' },
        { key: 'birthDate', label: 'Birthday' },
        { key: 'phone', label: 'Phone' },
      ],
      rows: members.map((m) => ({
        name: m.name,
        birthDate: m.date_of_birth,
        phone: m.phone,
      })),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  },

  callsSummary: async (prisma, q) => {
    const where = { is_deleted: false, ...branchWhere(q), ...dateRangeWhere('call_date', q) };
    const calls = await prisma.club_calls.findMany({ where, orderBy: { call_date: 'desc' } });
    const byOutcome: Record<string, number> = {};
    for (const c of calls) {
      const o = c.outcome ?? 'unknown';
      byOutcome[o] = (byOutcome[o] ?? 0) + 1;
    }
    return {
      key: 'callsSummary',
      title: 'Calls Summary',
      summary: { total: calls.length, ...byOutcome },
      columns: [
        { key: 'memberName', label: 'Member' },
        { key: 'callDate', label: 'Date' },
        { key: 'outcome', label: 'Outcome' },
        { key: 'staffName', label: 'Staff' },
      ],
      rows: calls.map((c) => mapRow(c as unknown as Record<string, unknown>)),
    };
  },

  inactiveMembers: async (prisma, q) => {
    const since = q.dateFrom ?? new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const attendanceRange: { gte: string; lte?: string } = { gte: since };
    if (q.dateTo) attendanceRange.lte = q.dateTo;
    const where: Prisma.club_membersWhereInput = {
      is_deleted: false,
      ...branchWhere(q),
      attendances: { none: { attendance_date: attendanceRange } },
    };
    const [inactive, total] = await Promise.all([
      prisma.club_members.findMany({ where, skip: q.skip, take: q.take, orderBy: { name: 'asc' } }),
      prisma.club_members.count({ where }),
    ]);
    return {
      key: 'inactiveMembers',
      title: 'Inactive Members',
      summary: { count: total, since },
      columns: [
        { key: 'name', label: 'Member' },
        { key: 'phone', label: 'Phone' },
        { key: 'memberCode', label: 'Member code' },
      ],
      rows: inactive.map((m) => ({
        name: m.name,
        phone: m.phone,
        memberCode: m.member_code,
      })),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  },

  members: async (prisma, q) => {
    const where: Prisma.club_membersWhereInput = {
      is_deleted: false,
      ...branchWhere(q),
    };
    if (q.search?.trim()) {
      where.OR = [
        { name: { contains: q.search.trim() } },
        { phone: { contains: q.search.trim() } },
        { member_code: { contains: q.search.trim() } },
      ];
    }
    const [rows, total] = await Promise.all([
      prisma.club_members.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: q.skip,
        take: q.take,
      }),
      prisma.club_members.count({ where }),
    ]);
    return {
      key: 'members',
      title: 'Members Report',
      summary: { count: total },
      columns: [
        { key: 'name', label: 'Name' },
        { key: 'phone', label: 'Phone' },
        { key: 'memberCode', label: 'Member code' },
        { key: 'registrationDate', label: 'Registered' },
      ],
      rows: rows.map((m) => ({
        name: m.name,
        phone: m.phone,
        memberCode: m.member_code,
        registrationDate: m.start_date,
      })),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  },

  expenses: async (prisma, q) => {
    const where = {
      is_deleted: false,
      entry_type: 'expense' as const,
      ...branchWhere(q),
      ...dateRangeWhere('entry_date', q),
    };
    const rows = await prisma.club_financial_entries.findMany({
      where,
      orderBy: { entry_date: 'desc' },
      skip: q.skip,
      take: q.take,
    });
    const total = await prisma.club_financial_entries.count({ where });
    const all = await prisma.club_financial_entries.findMany({ where, select: { amount: true } });
    const sum = all.reduce((s, r) => s + toNum(r.amount), 0);
    return {
      key: 'expenses',
      title: 'Expenses Report',
      summary: { total: sum, count: total },
      columns: [
        { key: 'title', label: 'Title' },
        { key: 'amount', label: 'Amount' },
        { key: 'entryDate', label: 'Date' },
        { key: 'employeeName', label: 'Employee' },
      ],
      rows: rows.map((r) => mapRow(r as unknown as Record<string, unknown>)),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  },

  invitationCount: async (prisma, q) => {
    const where = { is_deleted: false, ...branchWhere(q), ...dateRangeWhere('visit_date', q) };
    const rows = await prisma.club_invitations.findMany({ where });
    const byStatus: Record<string, number> = {};
    for (const r of rows) {
      byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    }
    return {
      key: 'invitationCount',
      title: 'Invitations',
      summary: { total: rows.length, ...byStatus },
      columns: [
        { key: 'inviteeName', label: 'Invitee' },
        { key: 'visitDate', label: 'Visit date' },
        { key: 'status', label: 'Status' },
      ],
      rows: rows.map((r) => mapRow(r as unknown as Record<string, unknown>)),
    };
  },

  freeConsumedBenefits: async (prisma, q) => {
    const where = { is_deleted: false, ...branchWhere(q), ...dateRangeWhere('benefit_date', q) };
    const rows = await prisma.club_free_benefits.findMany({ where, orderBy: { benefit_date: 'desc' } });
    return {
      key: 'freeConsumedBenefits',
      title: 'Free Benefits Consumed',
      summary: { count: rows.length },
      columns: [
        { key: 'memberName', label: 'Member' },
        { key: 'benefitName', label: 'Benefit' },
        { key: 'benefitDate', label: 'Date' },
        { key: 'quantity', label: 'Qty' },
      ],
      rows: rows.map((r) => mapRow(r as unknown as Record<string, unknown>)),
    };
  },

  deletedReceipts: async (prisma, q) => {
    // Receipts are hard-deleted; show empty with note — audit trail via club audit if needed
    return {
      key: 'deletedReceipts',
      title: 'Deleted Receipts',
      summary: { count: 0 },
      columns: [
        { key: 'receiptNumber', label: 'Receipt' },
        { key: 'memberName', label: 'Member' },
        { key: 'amount', label: 'Amount' },
      ],
      rows: [],
    };
  },

  daybydayprofit: async (prisma, q) => {
    const from = q.dateFrom ?? new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const to = q.dateTo ?? new Date().toISOString().slice(0, 10);
    const [receipts, expenses, otherRevenue] = await Promise.all([
      prisma.club_receipts.findMany({
        where: { receipt_date: { gte: from, lte: to }, ...branchWhere(q) },
      }),
      prisma.club_financial_entries.findMany({
        where: {
          is_deleted: false,
          entry_type: 'expense',
          entry_date: { gte: from, lte: to },
          ...branchWhere(q),
        },
      }),
      prisma.club_financial_entries.findMany({
        where: {
          is_deleted: false,
          entry_type: 'other_revenue',
          entry_date: { gte: from, lte: to },
          ...branchWhere(q),
        },
      }),
    ]);
    const byDay = new Map<string, { date: string; income: number; expenses: number; net: number }>();
    const getDay = (date: string) => {
      const row = byDay.get(date) ?? { date, income: 0, expenses: 0, net: 0 };
      byDay.set(date, row);
      return row;
    };
    for (const r of receipts) {
      getDay(r.receipt_date).income += toNum(r.amount);
    }
    for (const r of otherRevenue) {
      getDay(r.entry_date).income += toNum(r.amount);
    }
    for (const r of expenses) {
      getDay(r.entry_date).expenses += toNum(r.amount);
    }
    const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
    const rows = [...byDay.values()]
      .map((row) => ({
        date: row.date,
        income: roundMoney(row.income),
        expenses: roundMoney(row.expenses),
        net: roundMoney(row.income - row.expenses),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
    const pagedRows = rows.slice(q.skip, q.skip + q.take);
    const totalIncome = roundMoney(rows.reduce((sum, row) => sum + row.income, 0));
    const totalExpenses = roundMoney(rows.reduce((sum, row) => sum + row.expenses, 0));
    return {
      key: 'daybydayprofit',
      title: 'Day by Day Profit',
      summary: {
        income: totalIncome,
        expenses: totalExpenses,
        net: roundMoney(totalIncome - totalExpenses),
      },
      columns: [
        { key: 'date', label: 'Date' },
        { key: 'income', label: 'Income' },
        { key: 'expenses', label: 'Expenses' },
        { key: 'net', label: 'Net Profit' },
      ],
      rows: pagedRows,
      total: rows.length,
      page: q.page,
      pageSize: q.pageSize,
    };
  },

  blockedMembers: async (prisma, q) => {
    const rows = await prisma.club_members.findMany({
      where: { is_deleted: false, is_active: false, ...branchWhere(q) },
      skip: q.skip,
      take: q.take,
    });
    return {
      key: 'blockedMembers',
      title: 'Blocked / Inactive Members',
      summary: { count: rows.length },
      columns: [
        { key: 'name', label: 'Name' },
        { key: 'phone', label: 'Phone' },
        { key: 'memberCode', label: 'Code' },
      ],
      rows: rows.map((m) => ({
        name: m.name,
        phone: m.phone,
        memberCode: m.member_code,
      })),
    };
  },

  gymAttendanceCount: async (prisma, q) => {
    const dateFilter = dateRangeWhere('attendance_date', q);
    const where = { ...branchWhere(q), ...(dateFilter ?? {}) };
    const count = await prisma.club_attendance.count({ where });
    return {
      key: 'gymAttendanceCount',
      title: 'Gym Attendance Count',
      summary: { count },
      columns: [{ key: 'count', label: 'Check-ins' }],
      rows: [{ count }],
    };
  },
};
