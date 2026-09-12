import {
  type MosReportResult,
  type ReportHandler,
  Prisma,
  dateRangeWhere,
  branchWhere,
  paginated,
  toNum,
  isoDate,
} from '../mos-reports.shared';

/** Build the subscription-status string used across the memberships reports. */
function subStatus(row: { status: string; subscription_end_date: string }, today: string): string {
  if (row.subscription_end_date < today && row.status === 'active') return 'expired';
  return row.status;
}

/** memberships report handlers (keyed by reportKeyFromPath output). */
export const MEMBERSHIP_REPORTS: Record<string, ReportHandler> = {
  all: async (prisma, q): Promise<MosReportResult> => {
    const and: Prisma.club_subscriptionsWhereInput[] = [];
    if (q.branchId != null) and.push({ branch_id: q.branchId });
    if (q.dateFrom || q.dateTo) {
      const range: { gte?: string; lte?: string } = {};
      if (q.dateFrom) range.gte = q.dateFrom;
      if (q.dateTo) range.lte = q.dateTo;
      and.push({ registration_date: range });
    }
    if (q.search?.trim()) {
      const s = q.search.trim();
      and.push({
        OR: [
          { customer_name: { contains: s } },
          { subscription_number: { contains: s } },
          { subscription_type: { contains: s } },
        ],
      });
    }
    const where: Prisma.club_subscriptionsWhereInput = and.length ? { AND: and } : {};

    const [rows, total, allMatching] = await Promise.all([
      prisma.club_subscriptions.findMany({
        where,
        orderBy: { registration_date: 'desc' },
        skip: q.skip,
        take: q.take,
      }),
      prisma.club_subscriptions.count({ where }),
      prisma.club_subscriptions.findMany({
        where,
        select: { subscription_value: true, paid_amount: true, remaining_amount: true },
      }),
    ]);

    const today = isoDate();
    const totalValue = allMatching.reduce((s, r) => s + toNum(r.subscription_value), 0);
    const totalPaid = allMatching.reduce((s, r) => s + toNum(r.paid_amount), 0);
    const totalRemaining = allMatching.reduce((s, r) => s + toNum(r.remaining_amount), 0);

    const paged = paginated(
      rows.map((r) => ({
        subscriptionNumber: r.subscription_number,
        customerName: r.customer_name,
        subscriptionType: r.subscription_type,
        startDate: r.subscription_start_date,
        endDate: r.subscription_end_date,
        value: toNum(r.subscription_value),
        paid: toNum(r.paid_amount),
        remaining: toNum(r.remaining_amount),
        status: subStatus(r, today),
      })),
      total,
      q.page,
      q.pageSize,
    );

    return {
      key: 'all',
      title: 'All Memberships',
      summary: { count: total, totalValue, totalPaid, totalRemaining },
      columns: [
        { key: 'subscriptionNumber', label: 'Subscription' },
        { key: 'customerName', label: 'Member' },
        { key: 'subscriptionType', label: 'Type' },
        { key: 'startDate', label: 'Start' },
        { key: 'endDate', label: 'End' },
        { key: 'value', label: 'Value' },
        { key: 'paid', label: 'Paid' },
        { key: 'remaining', label: 'Remaining' },
        { key: 'status', label: 'Status' },
      ],
      rows: paged.data,
      total: paged.total,
      page: paged.page,
      pageSize: paged.pageSize,
    };
  },

  notRenewed: async (prisma, q): Promise<MosReportResult> => {
    const today = isoDate();
    const expirationRange: { lt: string; gte?: string; lte?: string } = { lt: today };
    if (q.dateFrom) expirationRange.gte = q.dateFrom;
    if (q.dateTo && q.dateTo < today) expirationRange.lte = q.dateTo;
    // Expired subscriptions (end date in the past).
    const expired = await prisma.club_subscriptions.findMany({
      where: {
        subscription_end_date: expirationRange,
        ...branchWhere(q),
      },
      orderBy: { subscription_end_date: 'desc' },
    });

    // For each affected member, find whether a newer subscription (end date >= today) exists.
    const memberIds = Array.from(
      new Set(expired.map((r) => r.member_id).filter((id): id is number => id != null)),
    );
    const activeCovered = memberIds.length
      ? await prisma.club_subscriptions.findMany({
          where: {
            member_id: { in: memberIds },
            subscription_end_date: { gte: today },
          },
          select: { member_id: true },
        })
      : [];
    const coveredMembers = new Set(activeCovered.map((r) => r.member_id));

    // Keep only the latest expired subscription per member with no active coverage.
    const latestPerMember = new Map<string, (typeof expired)[number]>();
    for (const r of expired) {
      const key = r.member_id != null ? `m:${r.member_id}` : `s:${r.id}`;
      if (r.member_id != null && coveredMembers.has(r.member_id)) continue;
      const existing = latestPerMember.get(key);
      if (!existing || r.subscription_end_date > existing.subscription_end_date) {
        latestPerMember.set(key, r);
      }
    }
    const notRenewed = Array.from(latestPerMember.values()).sort((a, b) =>
      b.subscription_end_date.localeCompare(a.subscription_end_date),
    );

    const total = notRenewed.length;
    const pageStart = q.skip;
    const pageRows = notRenewed.slice(pageStart, pageStart + q.take);

    const paged = paginated(
      pageRows.map((r) => ({
        subscriptionNumber: r.subscription_number,
        customerName: r.customer_name,
        subscriptionType: r.subscription_type,
        endDate: r.subscription_end_date,
        value: toNum(r.subscription_value),
      })),
      total,
      q.page,
      q.pageSize,
    );

    return {
      key: 'notRenewed',
      title: 'Not Renewed Memberships',
      summary: { count: total },
      columns: [
        { key: 'subscriptionNumber', label: 'Subscription' },
        { key: 'customerName', label: 'Member' },
        { key: 'subscriptionType', label: 'Type' },
        { key: 'endDate', label: 'Expired On' },
        { key: 'value', label: 'Value' },
      ],
      rows: paged.data,
      total: paged.total,
      page: paged.page,
      pageSize: paged.pageSize,
    };
  },

  newRenewed: async (prisma, q): Promise<MosReportResult> => {
    const inRange = await prisma.club_subscriptions.findMany({
      where: {
        ...branchWhere(q),
        ...dateRangeWhere('registration_date', q),
      },
      orderBy: { registration_date: 'desc' },
    });

    // For members appearing in-range, load their full subscription history to
    // determine, per subscription, whether the member had any prior subscription.
    const memberIds = Array.from(
      new Set(inRange.map((r) => r.member_id).filter((id): id is number => id != null)),
    );
    const history = memberIds.length
      ? await prisma.club_subscriptions.findMany({
          where: { member_id: { in: memberIds } },
          select: { member_id: true, registration_date: true, id: true },
        })
      : [];
    const historyByMember = new Map<number, { registration_date: string; id: number }[]>();
    for (const h of history) {
      if (h.member_id == null) continue;
      const list = historyByMember.get(h.member_id) ?? [];
      list.push({ registration_date: h.registration_date, id: h.id });
      historyByMember.set(h.member_id, list);
    }

    let newCount = 0;
    let renewedCount = 0;
    const rows = inRange.map((r) => {
      let isRenewed = false;
      if (r.member_id != null) {
        const list = historyByMember.get(r.member_id) ?? [];
        // Renewed when an earlier subscription exists (earlier reg date, or same date but lower id).
        isRenewed = list.some(
          (h) =>
            h.registration_date < r.registration_date ||
            (h.registration_date === r.registration_date && h.id < r.id),
        );
      }
      if (isRenewed) renewedCount += 1;
      else newCount += 1;
      return {
        subscriptionNumber: r.subscription_number,
        customerName: r.customer_name,
        subscriptionType: r.subscription_type,
        registrationDate: r.registration_date,
        value: toNum(r.subscription_value),
        kind: isRenewed ? 'renewed' : 'new',
      };
    });
    const pagedRows = rows.slice(q.skip, q.skip + q.take);

    return {
      key: 'newRenewed',
      title: 'New vs Renewed Memberships',
      summary: { new: newCount, renewed: renewedCount, total: rows.length },
      columns: [
        { key: 'subscriptionNumber', label: 'Subscription' },
        { key: 'customerName', label: 'Member' },
        { key: 'subscriptionType', label: 'Type' },
        { key: 'registrationDate', label: 'Registered' },
        { key: 'value', label: 'Value' },
        { key: 'kind', label: 'New / Renewed' },
      ],
      rows: pagedRows,
      total: rows.length,
      page: q.page,
      pageSize: q.pageSize,
    };
  },

  log: async (prisma, q): Promise<MosReportResult> => {
    const where: Prisma.club_subscriptionsWhereInput = {
      ...branchWhere(q),
      ...dateRangeWhere('registration_date', q),
    };
    const [rows, total] = await Promise.all([
      prisma.club_subscriptions.findMany({
        where,
        orderBy: [{ registration_date: 'desc' }, { id: 'desc' }],
        skip: q.skip,
        take: q.take,
      }),
      prisma.club_subscriptions.count({ where }),
    ]);

    const today = isoDate();
    const paged = paginated(
      rows.map((r) => ({
        registrationDate: r.registration_date,
        subscriptionNumber: r.subscription_number,
        customerName: r.customer_name,
        subscriptionType: r.subscription_type,
        value: toNum(r.subscription_value),
        status: subStatus(r, today),
      })),
      total,
      q.page,
      q.pageSize,
    );

    return {
      key: 'log',
      title: 'Memberships Activity Log',
      summary: { count: total },
      columns: [
        { key: 'registrationDate', label: 'Date' },
        { key: 'subscriptionNumber', label: 'Subscription' },
        { key: 'customerName', label: 'Member' },
        { key: 'subscriptionType', label: 'Type' },
        { key: 'value', label: 'Value' },
        { key: 'status', label: 'Status' },
      ],
      rows: paged.data,
      total: paged.total,
      page: paged.page,
      pageSize: paged.pageSize,
    };
  },

  privateMemberships: async (prisma, q): Promise<MosReportResult> => {
    const where: Prisma.club_subscriptionsWhereInput = {
      OR: [
        { type: { is: { package_category: 'private' } } },
        { is_linked_to_sessions: true },
      ],
      ...branchWhere(q),
      ...dateRangeWhere('registration_date', q),
    };
    const [rows, total, all] = await Promise.all([
      prisma.club_subscriptions.findMany({
        where,
        orderBy: { registration_date: 'desc' },
        skip: q.skip,
        take: q.take,
      }),
      prisma.club_subscriptions.count({ where }),
      prisma.club_subscriptions.findMany({
        where,
        select: { subscription_value: true, paid_amount: true },
      }),
    ]);

    const revenue = all.reduce((s, r) => s + toNum(r.paid_amount), 0);
    const totalValue = all.reduce((s, r) => s + toNum(r.subscription_value), 0);
    const today = isoDate();

    const paged = paginated(
      rows.map((r) => ({
        subscriptionNumber: r.subscription_number,
        customerName: r.customer_name,
        subscriptionType: r.subscription_type,
        sessionsCount: r.sessions_count,
        sessionsUsed: r.sessions_used,
        value: toNum(r.subscription_value),
        paid: toNum(r.paid_amount),
        status: subStatus(r, today),
      })),
      total,
      q.page,
      q.pageSize,
    );

    return {
      key: 'privateMemberships',
      title: 'Private (PT) Memberships',
      summary: { count: total, revenue, totalValue },
      columns: [
        { key: 'subscriptionNumber', label: 'Subscription' },
        { key: 'customerName', label: 'Member' },
        { key: 'subscriptionType', label: 'Type' },
        { key: 'sessionsCount', label: 'Sessions' },
        { key: 'sessionsUsed', label: 'Used' },
        { key: 'value', label: 'Value' },
        { key: 'paid', label: 'Paid' },
        { key: 'status', label: 'Status' },
      ],
      rows: paged.data,
      total: paged.total,
      page: paged.page,
      pageSize: paged.pageSize,
    };
  },

  membershipsDiscount: async (prisma, q): Promise<MosReportResult> => {
    const where: Prisma.club_subscriptionsWhereInput = {
      discount_enabled: true,
      discount_value: { gt: 0 },
      ...branchWhere(q),
      ...dateRangeWhere('registration_date', q),
    };
    const [rows, total, all] = await Promise.all([
      prisma.club_subscriptions.findMany({
        where,
        orderBy: { discount_value: 'desc' },
        skip: q.skip,
        take: q.take,
      }),
      prisma.club_subscriptions.count({ where }),
      prisma.club_subscriptions.findMany({ where, select: { discount_value: true } }),
    ]);

    const totalDiscount = all.reduce((s, r) => s + toNum(r.discount_value), 0);

    const paged = paginated(
      rows.map((r) => ({
        subscriptionNumber: r.subscription_number,
        customerName: r.customer_name,
        subscriptionType: r.subscription_type,
        value: toNum(r.subscription_value),
        discount: toNum(r.discount_value),
        paid: toNum(r.paid_amount),
        registrationDate: r.registration_date,
      })),
      total,
      q.page,
      q.pageSize,
    );

    return {
      key: 'membershipsDiscount',
      title: 'Memberships with Discount',
      summary: { count: total, totalDiscount },
      columns: [
        { key: 'subscriptionNumber', label: 'Subscription' },
        { key: 'customerName', label: 'Member' },
        { key: 'subscriptionType', label: 'Type' },
        { key: 'value', label: 'Value' },
        { key: 'discount', label: 'Discount' },
        { key: 'paid', label: 'Paid' },
        { key: 'registrationDate', label: 'Date' },
      ],
      rows: paged.data,
      total: paged.total,
      page: paged.page,
      pageSize: paged.pageSize,
    };
  },

  membershipUpgrade: async (prisma, q): Promise<MosReportResult> => {
    const all = await prisma.club_subscription_transfers.findMany({
      where: {
        ...branchWhere(q),
        ...dateRangeWhere('transfer_date', q),
      },
      orderBy: { transfer_date: 'desc' },
    });

    // Upgrades = destination plan value greater than the origin plan value.
    const upgrades = all.filter((t) => toNum(t.to_value) > toNum(t.from_value));
    const total = upgrades.length;
    const totalUpgradeValue = upgrades.reduce(
      (s, t) => s + (toNum(t.to_value) - toNum(t.from_value)),
      0,
    );

    const pageRows = upgrades.slice(q.skip, q.skip + q.take);
    const paged = paginated(
      pageRows.map((t) => ({
        customerName: t.customer_name,
        fromType: t.from_subscription_type,
        toType: t.to_subscription_type,
        fromValue: toNum(t.from_value),
        toValue: toNum(t.to_value),
        upgradeValue: toNum(t.to_value) - toNum(t.from_value),
        transferDate: t.transfer_date,
      })),
      total,
      q.page,
      q.pageSize,
    );

    return {
      key: 'membershipUpgrade',
      title: 'Membership Upgrades',
      summary: { count: total, totalUpgradeValue },
      columns: [
        { key: 'customerName', label: 'Member' },
        { key: 'fromType', label: 'From' },
        { key: 'toType', label: 'To' },
        { key: 'fromValue', label: 'From Value' },
        { key: 'toValue', label: 'To Value' },
        { key: 'upgradeValue', label: 'Upgrade Value' },
        { key: 'transferDate', label: 'Date' },
      ],
      rows: paged.data,
      total: paged.total,
      page: paged.page,
      pageSize: paged.pageSize,
    };
  },

  maximumExpirationDate: async (prisma, q): Promise<MosReportResult> => {
    const subs = await prisma.club_subscriptions.findMany({
      where: {
        member_id: { not: null },
        ...branchWhere(q),
      },
      select: {
        member_id: true,
        customer_name: true,
        subscription_type: true,
        subscription_end_date: true,
      },
    });

    // Per member, keep the subscription with the latest end date.
    const latest = new Map<number, (typeof subs)[number]>();
    for (const s of subs) {
      if (s.member_id == null) continue;
      const cur = latest.get(s.member_id);
      if (!cur || s.subscription_end_date > cur.subscription_end_date) {
        latest.set(s.member_id, s);
      }
    }
    const ordered = Array.from(latest.values())
      .filter((s) =>
        (!q.dateFrom || s.subscription_end_date >= q.dateFrom)
        && (!q.dateTo || s.subscription_end_date <= q.dateTo),
      )
      .sort((a, b) => b.subscription_end_date.localeCompare(a.subscription_end_date));

    const total = ordered.length;
    const pageRows = ordered.slice(q.skip, q.skip + q.take);
    const today = isoDate();

    const paged = paginated(
      pageRows.map((s) => ({
        customerName: s.customer_name,
        subscriptionType: s.subscription_type,
        maxEndDate: s.subscription_end_date,
        active: s.subscription_end_date >= today ? 'yes' : 'no',
      })),
      total,
      q.page,
      q.pageSize,
    );

    return {
      key: 'maximumExpirationDate',
      title: 'Maximum Expiration Date per Member',
      summary: { count: total },
      columns: [
        { key: 'customerName', label: 'Member' },
        { key: 'subscriptionType', label: 'Latest Type' },
        { key: 'maxEndDate', label: 'Expires On' },
        { key: 'active', label: 'Still Active' },
      ],
      rows: paged.data,
      total: paged.total,
      page: paged.page,
      pageSize: paged.pageSize,
    };
  },

  membershipsIncomePerPackageType: async (prisma, q): Promise<MosReportResult> => {
    // Group subscriptions by package type; income = paid amount per type.
    const subs = await prisma.club_subscriptions.findMany({
      where: {
        ...branchWhere(q),
        ...dateRangeWhere('registration_date', q),
      },
      select: {
        subscription_type: true,
        subscription_type_id: true,
        paid_amount: true,
        subscription_value: true,
      },
    });

    const byType = new Map<string, { type: string; count: number; total: number; value: number }>();
    for (const s of subs) {
      const type = s.subscription_type ?? 'Unspecified';
      const entry = byType.get(type) ?? { type, count: 0, total: 0, value: 0 };
      entry.count += 1;
      entry.total += toNum(s.paid_amount);
      entry.value += toNum(s.subscription_value);
      byType.set(type, entry);
    }
    const rows = Array.from(byType.values()).sort((a, b) => b.total - a.total);
    const grandTotal = rows.reduce((s, r) => s + r.total, 0);

    return {
      key: 'membershipsIncomePerPackageType',
      title: 'Memberships Income per Package Type',
      summary: { total: grandTotal, types: rows.length },
      columns: [
        { key: 'type', label: 'Package Type' },
        { key: 'count', label: 'Count' },
        { key: 'total', label: 'Income (Paid)' },
        { key: 'value', label: 'Total Value' },
      ],
      rows: rows.map((r) => ({
        type: r.type,
        count: r.count,
        total: r.total,
        value: r.value,
      })),
    };
  },

  packagesUntil: async (prisma, q): Promise<MosReportResult> => {
    const today = isoDate();
    const active = await prisma.club_subscriptions.findMany({
      where: {
        subscription_end_date: { gte: today },
        ...branchWhere(q),
      },
      select: { subscription_end_date: true, subscription_value: true },
    });

    const weekEnd = isoDate(new Date(Date.now() + 7 * 86400000));
    const monthEnd = isoDate(new Date(Date.now() + 30 * 86400000));

    const buckets = {
      thisWeek: { bucket: 'Expiring this week', count: 0, value: 0 },
      thisMonth: { bucket: 'Expiring this month', count: 0, value: 0 },
      later: { bucket: 'Expiring later', count: 0, value: 0 },
    };
    for (const s of active) {
      const end = s.subscription_end_date;
      let b: { count: number; value: number };
      if (end <= weekEnd) b = buckets.thisWeek;
      else if (end <= monthEnd) b = buckets.thisMonth;
      else b = buckets.later;
      b.count += 1;
      b.value += toNum(s.subscription_value);
    }

    const rows = [buckets.thisWeek, buckets.thisMonth, buckets.later];

    return {
      key: 'packagesUntil',
      title: 'Active Packages by Expiry Window',
      summary: { count: active.length },
      columns: [
        { key: 'bucket', label: 'Window' },
        { key: 'count', label: 'Active Packages' },
        { key: 'value', label: 'Total Value' },
      ],
      rows: rows.map((r) => ({ bucket: r.bucket, count: r.count, value: r.value })),
    };
  },
};
