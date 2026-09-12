import { BadRequestException, Injectable } from '@nestjs/common';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { paginated } from '../../common/dto/list-result';
import { PrismaService } from '../../common/prisma/prisma.service';
import { diffDaysFromToday, parseLegacyDate, todayIso, toIsoDate } from '../../common/utils/legacy-date.util';

const REPORT_KEYS = [
  'employees-list',
  'employees-data',
  'employees-new',
  'employees-expiring',
  'employees-resigned',
  'attendance-daily',
  'attendance-absence',
  'attendance-late',
  'attendance-overtime',
  'attendance-shift',
] as const;

type ReportKey = (typeof REPORT_KEYS)[number];

interface ReportRow {
  id: number;
  name: string;
  value: string | number;
  [key: string]: unknown;
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async run(key: string, q: PaginationDto) {
    if (!REPORT_KEYS.includes(key as ReportKey)) {
      throw new BadRequestException('تقرير غير معروف');
    }
    const handler = this.handlers[key as ReportKey].bind(this);
    return handler(q);
  }

  private paginateRows(rows: ReportRow[], q: PaginationDto) {
    let filtered = rows;
    if (q.search?.trim()) {
      const s = q.search.trim().toLowerCase();
      filtered = rows.filter(
        (r) =>
          String(r.name ?? '').toLowerCase().includes(s) ||
          String(r.value ?? '').toLowerCase().includes(s),
      );
    }
    const total = filtered.length;
    const data = filtered.slice(q.skip, q.skip + q.take);
    return paginated(data, total, q.page, q.pageSize);
  }

  private handlers: Record<ReportKey, (q: PaginationDto) => Promise<ReturnType<typeof paginated>>> = {
    'employees-list': async (q) => {
      const rows = await this.prisma.employees.findMany({
        where: { OR: [{ leave_emp: null }, { leave_emp: 0 }] },
        select: { id: true, employee: true, emp_code: true, edara_n: true },
        orderBy: { id: 'desc' },
      });
      return this.paginateRows(
        rows.map((e) => ({
          id: e.id,
          name: e.employee ?? '—',
          value: e.emp_code ?? '—',
          department: e.edara_n,
        })),
        q,
      );
    },

    'employees-data': async (q) => {
      const rows = await this.prisma.employees.findMany({
        where: { OR: [{ leave_emp: null }, { leave_emp: 0 }] },
        select: {
          id: true,
          employee: true,
          phone: true,
          edara_n: true,
          mosma_wazefy_n: true,
        },
        orderBy: { id: 'desc' },
      });
      return this.paginateRows(
        rows.map((e) => ({
          id: e.id,
          name: e.employee ?? '—',
          value: e.phone ?? '—',
          jobTitle: e.mosma_wazefy_n,
          department: e.edara_n,
        })),
        q,
      );
    },

    'employees-new': async (q) => {
      const rows = await this.prisma.employees.findMany({
        where: { OR: [{ leave_emp: null }, { leave_emp: 0 }] },
        select: { id: true, employee: true, start_work_date_m: true, date: true },
        orderBy: { id: 'desc' },
        take: 500,
      });
      const recent = rows.filter((e) => {
        const d = parseLegacyDate(e.start_work_date_m ?? e.date);
        if (!d) return false;
        const days = -diffDaysFromToday(d.toISOString().slice(0, 10))!;
        return days <= 90;
      });
      return this.paginateRows(
        recent.map((e) => ({
          id: e.id,
          name: e.employee ?? '—',
          value: toIsoDate(e.start_work_date_m ?? e.date) ?? '—',
        })),
        q,
      );
    },

    'employees-expiring': async (q) => {
      const rows = await this.prisma.employees.findMany({
        where: { OR: [{ leave_emp: null }, { leave_emp: 0 }] },
        select: { id: true, employee: true, end_contract_date_m: true },
        orderBy: { id: 'desc' },
      });
      const expiring = rows.filter((e) => {
        const days = diffDaysFromToday(e.end_contract_date_m);
        return days != null && days >= 0 && days <= 90;
      });
      return this.paginateRows(
        expiring.map((e) => ({
          id: e.id,
          name: e.employee ?? '—',
          value: toIsoDate(e.end_contract_date_m) ?? '—',
          daysLeft: diffDaysFromToday(e.end_contract_date_m),
        })),
        q,
      );
    },

    'employees-resigned': async (q) => {
      const rows = await this.prisma.employees.findMany({
        where: { OR: [{ leave_emp: 1 }, { employee_type: { not: 1 } }] },
        select: { id: true, employee: true, end_service_date_m: true, reason: true },
        orderBy: { id: 'desc' },
      });
      return this.paginateRows(
        rows.map((e) => ({
          id: e.id,
          name: e.employee ?? '—',
          value: toIsoDate(e.end_service_date_m) ?? '—',
          reason: e.reason,
        })),
        q,
      );
    },

    'attendance-daily': async (q) => {
      const date = todayIso();
      const matches = [date, String(Math.floor(new Date(date + 'T00:00:00').getTime() / 1000))];
      const rows = await this.prisma.tbl_hdoor_emps.findMany({
        where: { action_date_s: { in: matches } },
        orderBy: { hodoor_id: 'desc' },
        take: 1000,
      });
      const empCodes = [...new Set(rows.map((r) => r.member_code).filter(Boolean))] as number[];
      const emps = await this.prisma.employees.findMany({
        where: { emp_code: { in: empCodes } },
        select: { emp_code: true, employee: true },
      });
      const byCode = new Map(emps.map((e) => [e.emp_code, e.employee]));
      return this.paginateRows(
        rows.map((r) => ({
          id: r.hodoor_id,
          name: byCode.get(r.member_code ?? 0) ?? String(r.member_code ?? '—'),
          value: r.hdoor_time ?? '—',
          checkOut: r.ensraf_time,
          lateMin: r.late_min ?? 0,
        })),
        q,
      );
    },

    'attendance-absence': async (q) => {
      const date = todayIso();
      const matches = [date, String(Math.floor(new Date(date + 'T00:00:00').getTime() / 1000))];
      const present = await this.prisma.tbl_hdoor_emps.findMany({
        where: { action_date_s: { in: matches }, hdoor_time: { not: null } },
        select: { member_code: true },
      });
      const presentCodes = new Set(present.map((p) => p.member_code));
      const emps = await this.prisma.employees.findMany({
        where: { OR: [{ leave_emp: null }, { leave_emp: 0 }], emp_code: { not: null } },
        select: { id: true, employee: true, emp_code: true, edara_n: true },
      });
      const absent = emps.filter((e) => e.emp_code != null && !presentCodes.has(e.emp_code));
      return this.paginateRows(
        absent.map((e) => ({
          id: e.id,
          name: e.employee ?? '—',
          value: e.emp_code ?? '—',
          department: e.edara_n,
          date,
        })),
        q,
      );
    },

    'attendance-late': async (q) => {
      const rows = await this.prisma.tbl_hdoor_emps.findMany({
        where: { late_min: { gt: 0 } },
        orderBy: { hodoor_id: 'desc' },
        take: 1000,
      });
      const empCodes = [...new Set(rows.map((r) => r.member_code).filter(Boolean))] as number[];
      const emps = await this.prisma.employees.findMany({
        where: { emp_code: { in: empCodes } },
        select: { emp_code: true, employee: true },
      });
      const byCode = new Map(emps.map((e) => [e.emp_code, e.employee]));
      return this.paginateRows(
        rows.map((r) => ({
          id: r.hodoor_id,
          name: byCode.get(r.member_code ?? 0) ?? String(r.member_code ?? '—'),
          value: Math.round(r.late_min ?? 0),
          date: r.action_date_s,
        })),
        q,
      );
    },

    'attendance-overtime': async (q) => {
      const rows = await this.prisma.tbl_hdoor_emps.findMany({
        where: { num_min: { gt: 0 } },
        orderBy: { hodoor_id: 'desc' },
        take: 1000,
      });
      const empCodes = [...new Set(rows.map((r) => r.member_code).filter(Boolean))] as number[];
      const emps = await this.prisma.employees.findMany({
        where: { emp_code: { in: empCodes } },
        select: { emp_code: true, employee: true },
      });
      const byCode = new Map(emps.map((e) => [e.emp_code, e.employee]));
      return this.paginateRows(
        rows.map((r) => ({
          id: r.hodoor_id,
          name: byCode.get(r.member_code ?? 0) ?? String(r.member_code ?? '—'),
          value: Math.round(r.num_min ?? 0),
          date: r.action_date_s,
        })),
        q,
      );
    },

    'attendance-shift': async (q) => {
      const rows = await this.prisma.tbl_hdoor_emps.findMany({
        where: { sheft_type: { not: 0 } },
        orderBy: { hodoor_id: 'desc' },
        take: 1000,
      });
      const empCodes = [...new Set(rows.map((r) => r.member_code).filter(Boolean))] as number[];
      const emps = await this.prisma.employees.findMany({
        where: { emp_code: { in: empCodes } },
        select: { emp_code: true, employee: true },
      });
      const byCode = new Map(emps.map((e) => [e.emp_code, e.employee]));
      return this.paginateRows(
        rows.map((r) => ({
          id: r.hodoor_id,
          name: byCode.get(r.member_code ?? 0) ?? String(r.member_code ?? '—'),
          value: r.sheft_type,
          date: r.action_date_s,
        })),
        q,
      );
    },
  };
}
