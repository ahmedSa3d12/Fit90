import {
  type MosReportResult,
  type ReportHandler,
  dateRangeWhere,
  dateTimeRangeWhere,
  branchWhere,
  toNum,
} from '../mos-reports.shared';
import {
  marketingRepEmployeeWhere,
  marketingRepJobTitleWhere,
  salesSpecialistEmployeeWhere,
  salesSpecialistJobTitleWhere,
} from '../../employees/marketing-rep.util';

/**
 * Lookup { salesId -> name } for the branch, plus an "Unassigned" bucket for
 * subscriptions/leads whose `sales_id` / `assigned_to` is null or unknown.
 */
async function salesStaffMap(
  prisma: Parameters<ReportHandler>[0],
  q: Parameters<ReportHandler>[1],
): Promise<Map<number, string>> {
  const staff = await prisma.club_sales_staff.findMany({
    where: { is_deleted: false, ...branchWhere(q) },
  });
  return new Map(staff.map((s) => [s.id, s.name]));
}

async function salesSpecialistEmployeeMap(
  prisma: Parameters<ReportHandler>[0],
  q: Parameters<ReportHandler>[1],
): Promise<Map<number, string>> {
  const jobTitles = await prisma.department_jobs.findMany({
    where: salesSpecialistJobTitleWhere,
    select: { id: true },
  });
  const employees = await prisma.employees.findMany({
    where: {
      AND: [
        { OR: [{ leave_emp: null }, { leave_emp: 0 }] },
        { employee_type: 1 },
        salesSpecialistEmployeeWhere(jobTitles.map((job) => job.id)),
        ...(q.branchId != null ? [{ branch_id_fk: q.branchId }] : []),
      ],
    },
    select: { id: true, employee: true },
    orderBy: { employee: 'asc' },
  });

  return new Map(
    employees
      .filter((employee) => Boolean(employee.employee?.trim()))
      .map((employee) => [employee.id, employee.employee!.trim()]),
  );
}

const UNASSIGNED = 'Unassigned';

export const SALES_REPORTS: Record<string, ReportHandler> = {
  salesCommission: async (prisma, q) => {
    const jobTitles = await prisma.department_jobs.findMany({
      where: marketingRepJobTitleWhere,
      select: { id: true },
    });
    const jobTitleIds = jobTitles.map((job) => job.id);
    const employees = await prisma.employees.findMany({
      where: {
        AND: [
          { OR: [{ leave_emp: null }, { leave_emp: 0 }] },
          { employee_type: 1 },
          marketingRepEmployeeWhere(jobTitleIds),
          ...(q.branchId != null ? [{ branch_id_fk: q.branchId }] : []),
        ],
      },
      select: {
        id: true,
        emp_code: true,
        employee: true,
        mosma_wazefy_n: true,
        employee_target: true,
        employee_commission: true,
      },
      orderBy: { employee: 'asc' },
    });

    const employeeIds = employees.map((employee) => employee.id);
    const subs = employeeIds.length
      ? await prisma.club_subscriptions.findMany({
          where: {
            sales_id: { in: employeeIds },
            ...branchWhere(q),
            ...dateRangeWhere('registration_date', q),
          },
          select: {
            sales_id: true,
            subscription_value: true,
            paid_amount: true,
            remaining_amount: true,
          },
        })
      : [];

    const totalsByEmployee = new Map<number, {
      count: number;
      totalSales: number;
      collected: number;
      remaining: number;
    }>();
    for (const sub of subs) {
      if (sub.sales_id == null) continue;
      const totals = totalsByEmployee.get(sub.sales_id) ?? {
        count: 0,
        totalSales: 0,
        collected: 0,
        remaining: 0,
      };
      totals.count += 1;
      totals.totalSales += toNum(sub.subscription_value);
      totals.collected += toNum(sub.paid_amount);
      totals.remaining += toNum(sub.remaining_amount);
      totalsByEmployee.set(sub.sales_id, totals);
    }

    const allRows = employees
      .map((employee) => {
        const totals = totalsByEmployee.get(employee.id) ?? {
          count: 0,
          totalSales: 0,
          collected: 0,
          remaining: 0,
        };
        const target = toNum(employee.employee_target);
        const commissionPercentage = toNum(employee.employee_commission);
        const commission = Math.round(totals.collected * (commissionPercentage / 100) * 100) / 100;
        return {
          employeeCode: employee.emp_code ?? employee.id,
          salesPerson: employee.employee ?? '—',
          jobTitle: employee.mosma_wazefy_n ?? 'أخصائي مبيعات',
          subscriptionsCount: totals.count,
          target,
          totalSales: Math.round(totals.totalSales * 100) / 100,
          collected: Math.round(totals.collected * 100) / 100,
          remaining: Math.round(totals.remaining * 100) / 100,
          targetAchievement: target > 0
            ? Math.round((totals.collected / target) * 1000) / 10
            : 0,
          commissionPercentage,
          commission,
        };
      })
      .sort((a, b) => b.commission - a.commission);

    const search = q.search?.trim().toLocaleLowerCase();
    const filteredRows = search
      ? allRows.filter((row) => row.salesPerson.toLocaleLowerCase().includes(search))
      : allRows;
    const rows = filteredRows.slice(q.skip, q.skip + q.take);
    const totalCommission = filteredRows.reduce((s, r) => s + r.commission, 0);
    const totalTarget = filteredRows.reduce((s, r) => s + r.target, 0);
    const totalCollected = filteredRows.reduce((s, r) => s + r.collected, 0);

    return {
      key: 'salesCommission',
      title: 'Sales Commission',
      summary: {
        totalCommission: Math.round(totalCommission * 100) / 100,
        totalTarget: Math.round(totalTarget * 100) / 100,
        totalCollected: Math.round(totalCollected * 100) / 100,
        salesPersonsCount: filteredRows.length,
      },
      columns: [
        { key: 'employeeCode', label: 'كود الموظف' },
        { key: 'salesPerson', label: 'Sales Person' },
        { key: 'jobTitle', label: 'المسمى الوظيفي' },
        { key: 'subscriptionsCount', label: 'Subscriptions' },
        { key: 'target', label: 'Target' },
        { key: 'totalSales', label: 'Total Sales' },
        { key: 'collected', label: 'المدفوع' },
        { key: 'remaining', label: 'المتبقي' },
        { key: 'targetAchievement', label: 'نسبة تحقيق التارجت %' },
        { key: 'commissionPercentage', label: 'نسبة العمولة %' },
        { key: 'commission', label: 'Commission' },
      ],
      rows,
      total: filteredRows.length,
      page: q.page,
      pageSize: q.pageSize,
    };
  },

  customPackagesCommission: async (prisma, q) => {
    // Membership commission follows the sales-commission calculation, but is
    // attributed to the trainer assigned to each member. The percentage and
    // target come from the linked HR employee, exactly as they do for sales.
    const trainerTitles = ['مدرب', 'مدرب لياقة'];
    const trainerJobTitles = await prisma.department_jobs.findMany({
      where: { name: { in: trainerTitles } },
      select: { id: true },
    });
    const trainerJobTitleIds = trainerJobTitles.map((job) => job.id);
    const trainerEmployees = await prisma.employees.findMany({
      where: {
        AND: [
          { OR: [{ leave_emp: null }, { leave_emp: 0 }] },
          { employee_type: 1 },
          {
            OR: [
              { mosma_wazefy_n: { in: trainerTitles } },
              ...(trainerJobTitleIds.length
                ? [{ mosma_wazefy_code: { in: trainerJobTitleIds } }]
                : []),
            ],
          },
          ...(q.branchId != null ? [{ branch_id_fk: q.branchId }] : []),
        ],
      },
      select: {
        id: true,
        emp_code: true,
        employee: true,
        mosma_wazefy_n: true,
        employee_target: true,
        employee_commission: true,
      },
      orderBy: { employee: 'asc' },
    });
    const employeeIds = trainerEmployees.map((employee) => employee.id);
    const trainerProfiles = employeeIds.length
      ? await prisma.club_trainers.findMany({
          where: { employee_id: { in: employeeIds }, is_deleted: false },
          select: { id: true, employee_id: true },
        })
      : [];
    const trainerIdByEmployee = new Map(
      trainerProfiles
        .filter((trainer) => trainer.employee_id != null)
        .map((trainer) => [trainer.employee_id as number, trainer.id]),
    );
    const trainerIds = trainerProfiles.map((trainer) => trainer.id);
    const members = trainerIds.length
      ? await prisma.club_members.findMany({
          where: {
            trainer_id: { in: trainerIds },
            is_deleted: false,
            ...branchWhere(q),
          },
          select: { id: true, trainer_id: true },
        })
      : [];
    const memberIds = members.map((member) => member.id);
    const trainerIdByMember = new Map(members.map((member) => [member.id, member.trainer_id]));
    const subs = memberIds.length
      ? await prisma.club_subscriptions.findMany({
          where: {
            member_id: { in: memberIds },
            ...branchWhere(q),
            ...dateRangeWhere('registration_date', q),
          },
          select: {
            member_id: true,
            subscription_value: true,
            paid_amount: true,
            remaining_amount: true,
          },
        })
      : [];

    const totalsByTrainer = new Map<number, {
      count: number;
      totalSales: number;
      collected: number;
      remaining: number;
    }>();
    for (const sub of subs) {
      if (sub.member_id == null) continue;
      const trainerId = trainerIdByMember.get(sub.member_id);
      if (trainerId == null) continue;
      const totals = totalsByTrainer.get(trainerId) ?? {
        count: 0,
        totalSales: 0,
        collected: 0,
        remaining: 0,
      };
      totals.count += 1;
      totals.totalSales += toNum(sub.subscription_value);
      totals.collected += toNum(sub.paid_amount);
      totals.remaining += toNum(sub.remaining_amount);
      totalsByTrainer.set(trainerId, totals);
    }

    const allRows = trainerEmployees
      .map((employee) => {
        const trainerId = trainerIdByEmployee.get(employee.id);
        const totals = trainerId != null
          ? totalsByTrainer.get(trainerId) ?? { count: 0, totalSales: 0, collected: 0, remaining: 0 }
          : { count: 0, totalSales: 0, collected: 0, remaining: 0 };
        const target = toNum(employee.employee_target);
        const commissionPercentage = toNum(employee.employee_commission);
        const commission = Math.round(totals.collected * (commissionPercentage / 100) * 100) / 100;
        return {
          employeeCode: employee.emp_code ?? employee.id,
          trainer: employee.employee ?? 'Trainer',
          jobTitle: employee.mosma_wazefy_n ?? 'Trainer',
          subscriptionsCount: totals.count,
          target,
          totalSales: Math.round(totals.totalSales * 100) / 100,
          collected: Math.round(totals.collected * 100) / 100,
          remaining: Math.round(totals.remaining * 100) / 100,
          targetAchievement: target > 0
            ? Math.round((totals.collected / target) * 1000) / 10
            : 0,
          commissionPercentage,
          commission,
        };
      })
      .sort((a, b) => b.commission - a.commission);

    const search = q.search?.trim().toLocaleLowerCase();
    const filteredRows = search
      ? allRows.filter((row) => row.trainer.toLocaleLowerCase().includes(search))
      : allRows;
    const rows = filteredRows.slice(q.skip, q.skip + q.take);
    const totalCommission = filteredRows.reduce((sum, row) => sum + row.commission, 0);
    const totalTarget = filteredRows.reduce((sum, row) => sum + row.target, 0);
    const totalCollected = filteredRows.reduce((sum, row) => sum + row.collected, 0);

    return {
      key: 'customPackagesCommission',
      title: 'Membership Commission',
      summary: {
        totalCommission: Math.round(totalCommission * 100) / 100,
        totalTarget: Math.round(totalTarget * 100) / 100,
        totalCollected: Math.round(totalCollected * 100) / 100,
        trainersCount: filteredRows.length,
      },
      columns: [
        { key: 'employeeCode', label: 'Employee Code' },
        { key: 'trainer', label: 'Trainer' },
        { key: 'jobTitle', label: 'Job Title' },
        { key: 'subscriptionsCount', label: 'Subscriptions' },
        { key: 'target', label: 'Target' },
        { key: 'totalSales', label: 'Total Sales' },
        { key: 'collected', label: 'Collected' },
        { key: 'remaining', label: 'Remaining' },
        { key: 'targetAchievement', label: 'Target Achievement %' },
        { key: 'commissionPercentage', label: 'Commission %' },
        { key: 'commission', label: 'Commission' },
      ],
      rows,
      total: filteredRows.length,
      page: q.page,
      pageSize: q.pageSize,
    };
  },

  salesPersonClosingRatio: async (prisma, q) => {
    const where = { is_deleted: false, ...branchWhere(q), ...dateTimeRangeWhere('created_at', q) };
    const staff = await salesSpecialistEmployeeMap(prisma, q);
    const leads = await prisma.club_leads.findMany({ where });

    // A lead is "converted" when its status marks a win / subscription.
    const convertedStatuses = new Set(['converted', 'won', 'subscribed', 'closed', 'closed_won']);

    const grouped = new Map<number, { salesPerson: string; leads: number; converted: number }>(
      [...staff].map(([id, salesPerson]) => [id, { salesPerson, leads: 0, converted: 0 }]),
    );
    for (const l of leads) {
      if (l.assigned_to == null || !staff.has(l.assigned_to)) continue;
      const g = grouped.get(l.assigned_to)!;
      g.leads += 1;
      if (convertedStatuses.has((l.status ?? '').toLowerCase())) g.converted += 1;
    }

    const rows = [...grouped.values()]
      .map((g) => ({
        salesPerson: g.salesPerson,
        leads: g.leads,
        converted: g.converted,
        ratio: g.leads ? Math.round((g.converted / g.leads) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.ratio - a.ratio);

    const totalLeads = rows.reduce((s, r) => s + r.leads, 0);
    const totalConverted = rows.reduce((s, r) => s + r.converted, 0);

    return {
      key: 'salesPersonClosingRatio',
      title: 'Sales Person Closing Ratio',
      summary: {
        totalLeads,
        totalConverted,
        overallRatio: totalLeads ? Math.round((totalConverted / totalLeads) * 1000) / 10 : 0,
      },
      columns: [
        { key: 'salesPerson', label: 'Sales Person' },
        { key: 'leads', label: 'Leads' },
        { key: 'converted', label: 'Converted' },
        { key: 'ratio', label: 'Ratio %' },
      ],
      rows,
    };
  },

  salesPersonClosingRatioDetails: async (prisma, q) => {
    const staff = await salesSpecialistEmployeeMap(prisma, q);
    const leads = await prisma.club_leads.findMany({
      where: {
        is_deleted: false,
        assigned_to: { in: [...staff.keys()] },
        ...branchWhere(q),
        ...dateTimeRangeWhere('created_at', q),
      },
      orderBy: [{ assigned_to: 'asc' }, { created_at: 'desc' }],
    });

    // club_calls has no direct lead FK; approximate a per-lead calls count by
    // matching on phone number (both hold the raw contact number).
    const phones = leads.map((l) => l.phone).filter((p): p is string => !!p);
    const callsByPhone = new Map<string, number>();
    if (phones.length) {
      const calls = await prisma.club_calls.findMany({
        where: {
          is_deleted: false,
          phone: { in: phones },
          ...branchWhere(q),
          ...dateRangeWhere('call_date', q),
        },
        select: { phone: true },
      });
      for (const c of calls) {
        if (c.phone) callsByPhone.set(c.phone, (callsByPhone.get(c.phone) ?? 0) + 1);
      }
    }

    const allRows = leads.map((l) => ({
      salesPerson: staff.get(l.assigned_to!)!,
      leadName: l.name,
      status: l.status,
      callsCount: l.phone ? callsByPhone.get(l.phone) ?? 0 : 0,
    }));
    const rows = allRows.slice(q.skip, q.skip + q.take);

    return {
      key: 'salesPersonClosingRatioDetails',
      title: 'Sales Person Closing Ratio (Details)',
      summary: { count: allRows.length },
      columns: [
        { key: 'salesPerson', label: 'Sales Person' },
        { key: 'leadName', label: 'Lead' },
        { key: 'status', label: 'Status' },
        { key: 'callsCount', label: 'Calls' },
      ],
      rows,
      total: allRows.length,
      page: q.page,
      pageSize: q.pageSize,
    };
  },

  packageUtilizationPerSalesPersonal: async (prisma, q) => {
    const where = { ...branchWhere(q), ...dateRangeWhere('registration_date', q) };
    const [subs, staff] = await Promise.all([
      prisma.club_subscriptions.findMany({ where }),
      salesStaffMap(prisma, q),
    ]);

    // group by (salesPerson, package/subscription type)
    const grouped = new Map<string, { salesPerson: string; type: string; count: number; total: number }>();
    for (const s of subs) {
      const salesPerson = (s.sales_id != null && staff.get(s.sales_id)) || UNASSIGNED;
      const type = s.subscription_type?.trim() || 'Unknown';
      const key = `${salesPerson}||${type}`;
      const g = grouped.get(key) ?? { salesPerson, type, count: 0, total: 0 };
      g.count += 1;
      g.total += toNum(s.subscription_value);
      grouped.set(key, g);
    }

    const allRows = [...grouped.values()].sort(
      (a, b) => a.salesPerson.localeCompare(b.salesPerson) || b.count - a.count,
    );
    const rows = allRows.slice(q.skip, q.skip + q.take);

    return {
      key: 'packageUtilizationPerSalesPersonal',
      title: 'Package Utilization per Sales Person',
      summary: { count: allRows.length, subscriptions: subs.length },
      columns: [
        { key: 'salesPerson', label: 'Sales Person' },
        { key: 'type', label: 'Package Type' },
        { key: 'count', label: 'Count' },
        { key: 'total', label: 'Total' },
      ],
      rows,
      total: allRows.length,
      page: q.page,
      pageSize: q.pageSize,
    };
  },
};

// Silence "unused" for the shared type re-export kept for parity with siblings.
export type { MosReportResult };
