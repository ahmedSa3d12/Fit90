import {
  type MosReportResult,
  type ReportHandler,
  Prisma,
  dateRangeWhere,
  dateTimeRangeWhere,
  branchWhere,
  mapRow,
  toNum,
  paginated,
  isoDate,
  daysAgo,
} from '../mos-reports.shared';

/** staff-finance report handlers (keyed by reportKeyFromPath output). */
export const STAFF_FINANCE_REPORTS: Record<string, ReportHandler> = {
  // Per-employee payroll derived from financial entries (payroll module removed).
  // Sums entries of type salary + employee_commission in range, grouped per employee.
  staffPayroll: async (prisma, q): Promise<MosReportResult> => {
    const where: Prisma.club_financial_entriesWhereInput = {
      is_deleted: false,
      entry_type: { in: ['salary', 'employee_commission'] },
      ...branchWhere(q),
      ...dateRangeWhere('entry_date', q),
    };
    const [entries, employees] = await Promise.all([
      prisma.club_financial_entries.findMany({ where, orderBy: { entry_date: 'desc' } }),
      prisma.employees.findMany({
        where: q.branchId != null ? { branch_id_fk: q.branchId } : {},
        select: { id: true, employee: true },
      }),
    ]);

    // Aggregate per employee (keyed by employee_id, falling back to name).
    const agg = new Map<string, { employee: string; entries: number; total: number }>();
    for (const e of entries) {
      const key = e.employee_id != null ? `id:${e.employee_id}` : `name:${e.employee_name ?? '—'}`;
      const name = e.employee_name ?? `Employee #${e.employee_id ?? '?'}`;
      const cur = agg.get(key) ?? { employee: name, entries: 0, total: 0 };
      cur.entries += 1;
      cur.total += toNum(e.amount);
      agg.set(key, cur);
    }

    let rows = [...agg.values()].sort((a, b) => b.total - a.total);

    // If no payroll-type entries exist, list all employees with a zero baseline.
    if (rows.length === 0) {
      rows = employees.map((emp) => ({
        employee: emp.employee ?? `Employee #${emp.id}`,
        entries: 0,
        total: 0,
      }));
    }

    const grandTotal = rows.reduce((s, r) => s + r.total, 0);
    return {
      key: 'staffPayroll',
      title: 'Staff Payroll',
      summary: { grandTotal, employees: rows.length, entries: entries.length },
      columns: [
        { key: 'employee', label: 'Employee' },
        { key: 'entries', label: 'Entries' },
        { key: 'total', label: 'Total' },
      ],
      rows,
    };
  },

  // All financial entries linked to an employee (employee_id not null) in range.
  employeeFinancial: async (prisma, q): Promise<MosReportResult> => {
    const where: Prisma.club_financial_entriesWhereInput = {
      is_deleted: false,
      employee_id: { not: null },
      ...branchWhere(q),
      ...dateRangeWhere('entry_date', q),
    };
    const [rows, total] = await Promise.all([
      prisma.club_financial_entries.findMany({
        where,
        orderBy: { entry_date: 'desc' },
        skip: q.skip,
        take: q.take,
      }),
      prisma.club_financial_entries.count({ where }),
    ]);
    const all = await prisma.club_financial_entries.findMany({ where, select: { amount: true } });
    const sum = all.reduce((s, r) => s + toNum(r.amount), 0);
    const paged = paginated(
      rows.map((r) => mapRow(r as unknown as Record<string, unknown>)),
      total,
      q.page,
      q.pageSize,
    );
    return {
      key: 'employeeFinancial',
      title: 'Employee Financial Entries',
      summary: { total: sum, count: total },
      columns: [
        { key: 'title', label: 'Title' },
        { key: 'entryType', label: 'Type' },
        { key: 'employeeName', label: 'Employee' },
        { key: 'amount', label: 'Amount' },
        { key: 'entryDate', label: 'Date' },
      ],
      rows: paged.data,
      total: paged.total,
      page: paged.page,
      pageSize: paged.pageSize,
    };
  },

  // Granted subscription benefits with their consumption and remaining balance.
  benefitsConsumption: async (prisma, q): Promise<MosReportResult> => {
    const benefitLabels: Record<string, string> = {
      iceBath: 'Ice Bath',
      medicalFreeze: 'Medical Freeze',
      inBody: 'InBody',
      massage: 'Massage',
      freeDays: 'Free Days',
      nutritionSessions: 'Nutrition Sessions',
      ptSessions: 'PT Sessions',
      fitnessSessions: 'Fitness Sessions',
      freeze: 'Freeze',
      invitations: 'Invitations',
    };
    const benefitAliases: Record<string, string[]> = {
      iceBath: ['ice bath', 'حمام ثلج'],
      medicalFreeze: ['medical freeze', 'تجميد طبي'],
      inBody: ['inbody', 'in body', 'إن بودي', 'ان بودي'],
      massage: ['massage', 'مساج'],
      freeDays: ['free days', 'أيام مجانية', 'ايام مجانية'],
      nutritionSessions: ['nutrition session', 'جلسات تغذية'],
      ptSessions: ['pt session', 'personal training', 'جلسات تدريب شخصي', 'تدريب شخصي'],
      fitnessSessions: ['fitness session', 'جلسات لياقة'],
      freeze: ['freeze', 'مرات التجميد', 'أسبوع تجميد', 'اسبوع تجميد', 'تجميد مجاني'],
      invitations: ['invitation', 'الدعوات', 'دعوة', 'دعوات'],
    };
    const benefitKeyFromName = (name: string) => {
      const normalized = name.trim().toLocaleLowerCase();
      return Object.entries(benefitAliases).find(([, aliases]) =>
        aliases.some((alias) => normalized.includes(alias.toLocaleLowerCase())),
      )?.[0];
    };
    const benefitKeyFromBooking = (name: string, category: string) => {
      const namedKey = benefitKeyFromName(name);
      if (namedKey) return namedKey;
      if (category === 'inbody') return 'inBody';
      if (category === 'nutrition') return 'nutritionSessions';
      if (category === 'personal_training') return 'ptSessions';
      if (category === 'class' || category === 'zumba') return 'fitnessSessions';
      return undefined;
    };

    const subscriptionWhere: Prisma.club_subscriptionsWhereInput = {
      ...branchWhere(q),
      benefits: { not: Prisma.JsonNull },
      ...(q.dateFrom || q.dateTo
        ? {
            AND: [
              ...(q.dateTo ? [{ subscription_start_date: { lte: q.dateTo } }] : []),
              ...(q.dateFrom ? [{ subscription_end_date: { gte: q.dateFrom } }] : []),
            ],
          }
        : {}),
    };
    if (q.search?.trim()) {
      const search = q.search.trim();
      subscriptionWhere.OR = [
        { customer_name: { contains: search } },
        { subscription_number: { contains: search } },
        { subscription_type: { contains: search } },
        { member: { name: { contains: search } } },
        { member: { member_code: { contains: search } } },
      ];
    }

    const subscriptions = await prisma.club_subscriptions.findMany({
      where: subscriptionWhere,
      orderBy: [{ subscription_start_date: 'desc' }, { id: 'desc' }],
      include: {
        member: { select: { name: true, member_code: true } },
        freezes: { select: { freeze_start_date: true } },
      },
    });
    const eligible = subscriptions.filter((subscription) => {
      const granted = subscription.benefits as Record<string, unknown> | null;
      return granted && Object.values(granted).some((value) => Number(value) > 0);
    });
    const memberIds = [
      ...new Set(eligible.map((subscription) => subscription.member_id).filter((id): id is number => id != null)),
    ];
    const earliestStart = eligible.reduce<string | undefined>(
      (value, subscription) =>
        !value || subscription.subscription_start_date < value ? subscription.subscription_start_date : value,
      undefined,
    );
    const latestEnd = eligible.reduce<string | undefined>(
      (value, subscription) =>
        !value || subscription.subscription_end_date > value ? subscription.subscription_end_date : value,
      undefined,
    );

    const [logged, appointments, inbodyBookings, spaBookings, classBookings, invitations] =
      memberIds.length && earliestStart && latestEnd
        ? await Promise.all([
            prisma.club_free_benefits.findMany({
              where: {
                member_id: { in: memberIds },
                is_deleted: false,
                benefit_date: { gte: earliestStart, lte: latestEnd },
              },
              select: { member_id: true, benefit_name: true, benefit_date: true, quantity: true },
            }),
            prisma.club_bookings.findMany({
              where: {
                member_id: { in: memberIds },
                status: 'completed',
                is_deleted: false,
                booking_date: { gte: earliestStart, lte: latestEnd },
              },
              select: {
                member_id: true,
                booking_date: true,
                service: { select: { name: true, category: true } },
              },
            }),
            prisma.club_inbody_bookings.findMany({
              where: {
                member_id: { in: memberIds },
                status: 'completed',
                is_deleted: false,
                booking_date: { gte: earliestStart, lte: latestEnd },
              },
              select: { member_id: true, booking_date: true },
            }),
            prisma.club_spa_bookings.findMany({
              where: {
                member_id: { in: memberIds },
                status: 'completed',
                is_active: true,
                booking_date: { gte: earliestStart, lte: latestEnd },
              },
              select: {
                member_id: true,
                booking_date: true,
                service: { select: { name: true } },
              },
            }),
            prisma.club_class_bookings.findMany({
              where: {
                member_id: { in: memberIds },
                status: 'completed',
                slot: {
                  start_at: {
                    gte: new Date(`${earliestStart}T00:00:00`),
                    lte: new Date(`${latestEnd}T23:59:59`),
                  },
                },
              },
              select: { member_id: true, slot: { select: { start_at: true } } },
            }),
            prisma.club_invitations.findMany({
              where: {
                invited_by_id: { in: memberIds },
                status: 'visited',
                is_deleted: false,
                visit_date: { gte: earliestStart, lte: latestEnd },
              },
              select: { invited_by_id: true, visit_date: true },
            }),
          ])
        : [[], [], [], [], [], []];

    const rows = eligible.flatMap((subscription) => {
      const benefits = subscription.benefits as Record<string, unknown>;
      return Object.entries(benefits)
        .filter(([, value]) => Number(value) > 0)
        .map(([benefitKey, value]) => {
          const granted = Math.max(0, Number(value) || 0);
          const memberId = subscription.member_id;
          const inSubscription = (date: string) =>
            date >= subscription.subscription_start_date && date <= subscription.subscription_end_date;
          const loggedUsed = logged.reduce((total, item) => {
            if (
              item.member_id !== memberId
              || !inSubscription(item.benefit_date)
              || benefitKeyFromName(item.benefit_name) !== benefitKey
            ) return total;
            return total + (item.quantity ?? 1);
          }, 0);
          const appointmentUsed = appointments.filter((booking) =>
            booking.member_id === memberId
            && inSubscription(booking.booking_date)
            && benefitKeyFromBooking(booking.service.name, booking.service.category) === benefitKey,
          ).length;
          const inbodyUsed = benefitKey === 'inBody'
            ? inbodyBookings.filter((booking) =>
                booking.member_id === memberId && inSubscription(booking.booking_date),
              ).length
            : 0;
          const spaUsed = spaBookings.filter((booking) =>
            booking.member_id === memberId
            && inSubscription(booking.booking_date)
            && benefitKeyFromName(booking.service.name) === benefitKey,
          ).length;
          const classUsed = benefitKey === 'fitnessSessions'
            ? classBookings.filter((booking) => {
                const date = booking.slot.start_at.toISOString().slice(0, 10);
                return booking.member_id === memberId && inSubscription(date);
              }).length
            : 0;
          const freezeUsed = benefitKey === 'freeze' || benefitKey === 'medicalFreeze'
            ? subscription.freezes.filter((freeze) => inSubscription(freeze.freeze_start_date)).length
            : 0;
          const sessionUsed = benefitKey === 'fitnessSessions' ? subscription.sessions_used : 0;
          const invitationsUsed = benefitKey === 'invitations'
            ? invitations.filter((invitation) =>
                invitation.invited_by_id === memberId
                && invitation.visit_date != null
                && inSubscription(invitation.visit_date),
              ).length
            : 0;
          // Some flows write both a domain booking and a generic benefit log.
          // Taking the strongest source avoids counting the same consumption twice.
          const used = Math.min(
            granted,
            Math.max(
              loggedUsed,
              appointmentUsed,
              inbodyUsed,
              spaUsed,
              classUsed,
              freezeUsed,
              sessionUsed,
              invitationsUsed,
            ),
          );
          return {
            memberCode: subscription.member?.member_code ?? '—',
            member: subscription.member?.name ?? subscription.customer_name ?? '—',
            subscriptionNumber: subscription.subscription_number,
            subscriptionType: subscription.subscription_type ?? '—',
            startDate: subscription.subscription_start_date,
            endDate: subscription.subscription_end_date,
            benefit: benefitLabels[benefitKey] ?? benefitKey,
            granted,
            used,
            remaining: Math.max(0, granted - used),
            status: subscription.status,
          };
        });
    });
    const totalGranted = rows.reduce((sum, row) => sum + row.granted, 0);
    const totalUsed = rows.reduce((sum, row) => sum + row.used, 0);
    return {
      key: 'benefitsConsumption',
      title: 'Benefits Consumption',
      summary: {
        subscriptionsCount: eligible.length,
        totalGranted,
        totalUsed,
        totalRemaining: totalGranted - totalUsed,
      },
      columns: [
        { key: 'memberCode', label: 'Member code' },
        { key: 'member', label: 'Member' },
        { key: 'subscriptionNumber', label: 'Subscription number' },
        { key: 'subscriptionType', label: 'Subscription type' },
        { key: 'startDate', label: 'Start date' },
        { key: 'endDate', label: 'End date' },
        { key: 'benefit', label: 'Benefit' },
        { key: 'granted', label: 'Granted' },
        { key: 'used', label: 'Used' },
        { key: 'remaining', label: 'Remaining' },
        { key: 'status', label: 'Status' },
      ],
      rows: rows.slice(q.skip, q.skip + q.take),
      total: rows.length,
      page: q.page,
      pageSize: q.pageSize,
    };
  },

  // Members who checked in more than once on the same day.
  overAttendance: async (prisma, q): Promise<MosReportResult> => {
    const where: Prisma.club_attendanceWhereInput = {
      ...branchWhere(q),
      ...dateRangeWhere('attendance_date', q),
    };
    const attendances = await prisma.club_attendance.findMany({
      where,
      select: { member_id: true, member_name: true, attendance_date: true },
    });

    const counts = new Map<string, { member: string; date: string; checkIns: number }>();
    for (const a of attendances) {
      const key = `${a.member_id}|${a.attendance_date}`;
      const cur = counts.get(key) ?? { member: a.member_name, date: a.attendance_date, checkIns: 0 };
      cur.checkIns += 1;
      counts.set(key, cur);
    }
    const allRows = [...counts.values()]
      .filter((r) => r.checkIns > 1)
      .sort((a, b) => b.checkIns - a.checkIns || b.date.localeCompare(a.date));
    const rows = allRows.slice(q.skip, q.skip + q.take);
    return {
      key: 'overAttendance',
      title: 'Over Attendance (Multiple Check-ins Same Day)',
      summary: { count: allRows.length },
      columns: [
        { key: 'member', label: 'Member' },
        { key: 'date', label: 'Date' },
        { key: 'checkIns', label: 'Check-ins' },
      ],
      rows,
      total: allRows.length,
      page: q.page,
      pageSize: q.pageSize,
    };
  },

  // Members with NO check-in in the last 30 days (or the supplied range start).
  'absent-members': async (prisma, q): Promise<MosReportResult> => {
    const since = q.dateFrom ?? daysAgo(30);
    const members = await prisma.club_members.findMany({
      where: { is_deleted: false, ...branchWhere(q) },
      include: {
        attendances: {
          where: { attendance_date: { gte: since } },
          take: 1,
        },
      },
      skip: q.skip,
      take: q.take,
    });
    const absent = members.filter((m) => m.attendances.length === 0);
    return {
      key: 'absent-members',
      title: 'Absent Members',
      summary: { count: absent.length, since },
      columns: [
        { key: 'name', label: 'Member' },
        { key: 'phone', label: 'Phone' },
        { key: 'memberCode', label: 'Member code' },
      ],
      rows: absent.map((m) => ({
        name: m.name,
        phone: m.phone,
        memberCode: m.member_code,
      })),
    };
  },

  // Members who checked in more than once in a single day.
  multipleAttendancePerDay: async (prisma, q): Promise<MosReportResult> => {
    const where: Prisma.club_attendanceWhereInput = {
      ...branchWhere(q),
      ...dateRangeWhere('attendance_date', q),
    };
    const attendances = await prisma.club_attendance.findMany({
      where,
      select: { member_id: true, attendance_date: true, member_name: true, member_code: true },
    });

    // perDay[date][member_id] = { count, name, code }
    const perDay = new Map<string, Map<number, { count: number; name: string; code: string }>>();
    for (const a of attendances) {
      let members = perDay.get(a.attendance_date);
      if (!members) {
        members = new Map();
        perDay.set(a.attendance_date, members);
      }
      const existing = members.get(a.member_id);
      if (existing) {
        existing.count += 1;
      } else {
        members.set(a.member_id, { count: 1, name: a.member_name, code: a.member_code });
      }
    }

    const allRows: any[] = [];
    for (const [date, members] of perDay.entries()) {
      for (const info of members.values()) {
        if (info.count > 1) {
          allRows.push({
            date,
            memberName: info.name,
            memberCode: info.code,
            attendanceCount: info.count,
          });
        }
      }
    }

    allRows.sort((a, b) => b.date.localeCompare(a.date));
    const paged = paginated(
      allRows.slice(q.skip, q.skip + q.take),
      allRows.length,
      q.page,
      q.pageSize,
    );

    return {
      key: 'multipleAttendancePerDay',
      title: 'Multiple Attendance Per Day',
      summary: { totalIncidents: allRows.length },
      columns: [
        { key: 'date', label: 'Date' },
        { key: 'memberName', label: 'Member Name' },
        { key: 'memberCode', label: 'Member Code' },
        { key: 'attendanceCount', label: 'Check-ins' },
      ],
      rows: paged.data,
      total: paged.total,
      page: paged.page,
      pageSize: paged.pageSize,
    };
  },

  // Members ranked by check-in count in range (top 50).
  topActiveMembers: async (prisma, q): Promise<MosReportResult> => {
    const where: Prisma.club_attendanceWhereInput = {
      ...branchWhere(q),
      ...dateRangeWhere('attendance_date', q),
    };
    const attendances = await prisma.club_attendance.findMany({
      where,
      select: { member_id: true, member_name: true },
    });

    const counts = new Map<number, { member: string; checkIns: number }>();
    for (const a of attendances) {
      const cur = counts.get(a.member_id) ?? { member: a.member_name, checkIns: 0 };
      cur.checkIns += 1;
      counts.set(a.member_id, cur);
    }
    const topRows = [...counts.values()]
      .sort((a, b) => b.checkIns - a.checkIns)
      .slice(0, 50);
    const rows = topRows.slice(q.skip, q.skip + q.take);
    return {
      key: 'topActiveMembers',
      title: 'Top Active Members',
      summary: { count: counts.size, checkIns: attendances.length },
      columns: [
        { key: 'member', label: 'Member' },
        { key: 'checkIns', label: 'Check-ins' },
      ],
      rows,
      total: topRows.length,
      page: q.page,
      pageSize: q.pageSize,
    };
  },

  // Recent activity log: built from recent check-ins + receipts
  logs: async (prisma, q): Promise<MosReportResult> => {
    const auditWhere: Prisma.business_audit_logWhereInput = {
      ...branchWhere(q),
      ...dateTimeRangeWhere('created_at', q),
    };
    const auditTotal = await prisma.business_audit_log.count({ where: auditWhere });
    if (auditTotal > 0) {
      const auditRows = await prisma.business_audit_log.findMany({
        where: auditWhere,
        orderBy: { created_at: 'desc' },
        skip: q.skip,
        take: q.take,
      });
      return {
        key: 'logs',
        title: 'Activity Log',
        summary: { count: auditTotal },
        columns: [
          { key: 'createdAt', label: 'When' },
          { key: 'entityType', label: 'Entity' },
          { key: 'action', label: 'Action' },
          { key: 'actor', label: 'Actor' },
        ],
        rows: auditRows.map((row) => ({
          createdAt: row.created_at.toISOString(),
          entityType: row.entity_type,
          action: row.action,
          actor: row.actor_name ?? (row.actor_user_id != null ? `User #${row.actor_user_id}` : '—'),
        })),
        total: auditTotal,
        page: q.page,
        pageSize: q.pageSize,
      };
    }

    // Older installations may not yet write business audit rows. In that case,
    // provide a bounded activity feed from check-ins and receipts.
    const [attendances, receipts] = await Promise.all([
      prisma.club_attendance.findMany({
        where: { ...branchWhere(q), ...dateRangeWhere('attendance_date', q) },
        orderBy: { check_in_time: 'desc' },
        take: 200,
        select: { member_name: true, check_in_time: true },
      }),
      prisma.club_receipts.findMany({
        where: { ...branchWhere(q), ...dateTimeRangeWhere('created_at', q) },
        orderBy: { created_at: 'desc' },
        take: 200,
        select: { member_name: true, amount: true, receipt_number: true, created_at: true },
      }),
    ]);

    const feed = [
      ...attendances.map((a) => ({
        createdAt: a.check_in_time.toISOString(),
        entityType: 'attendance',
        action: 'check_in',
        actor: a.member_name,
        detail: '',
      })),
      ...receipts.map((r) => ({
        createdAt: r.created_at.toISOString(),
        entityType: 'receipt',
        action: 'payment',
        actor: r.member_name,
        detail: `${r.receipt_number} · ${toNum(r.amount)}`,
      })),
    ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const paged = paginated(
      feed.slice(q.skip, q.skip + q.take),
      feed.length,
      q.page,
      q.pageSize,
    );
    return {
      key: 'logs',
      title: 'Activity Log',
      summary: { count: feed.length, generatedAt: isoDate() },
      columns: [
        { key: 'createdAt', label: 'When' },
        { key: 'entityType', label: 'Entity' },
        { key: 'action', label: 'Action' },
        { key: 'actor', label: 'Actor' },
        { key: 'detail', label: 'Detail' },
      ],
      rows: paged.data,
      total: paged.total,
      page: paged.page,
      pageSize: paged.pageSize,
    };
  },
};
