import {
  type MosReportResult,
  type ReportHandler,
  Prisma,
  dateRangeWhere,
  branchWhere,
  paginated,
  toNum,
} from '../mos-reports.shared';

/** income report handlers (keyed by reportKeyFromPath output). Populated per-domain. */
export const INCOME_REPORTS: Record<string, ReportHandler> = {
  privateMembershipsIncome: async (prisma, q): Promise<MosReportResult> => {
    // Private / PT income: receipts whose subscription is a session-linked
    // (private training) package. Grouped per subscription with its paid total.
    const where: Prisma.club_receiptsWhereInput = {
      subscription: {
        is: {
          OR: [
            { type: { is: { package_category: 'private' } } },
            { is_linked_to_sessions: true },
          ],
        },
      },
      ...branchWhere(q),
      ...dateRangeWhere('receipt_date', q),
    };

    const receipts = await prisma.club_receipts.findMany({
      where,
      include: {
        subscription: {
          select: {
            subscription_number: true,
            subscription_type: true,
            customer_name: true,
          },
        },
      },
      orderBy: { receipt_date: 'desc' },
    });

    const total = receipts.reduce((s, r) => s + toNum(r.amount), 0);

    // Group by subscription (fall back to receipt id when unlinked).
    const bySub = new Map<
      string,
      {
        subscriptionNumber: string | null;
        subscriptionType: string | null;
        memberName: string;
        amount: number;
        count: number;
      }
    >();
    for (const r of receipts) {
      const key = r.subscription_id != null ? `s:${r.subscription_id}` : `r:${r.id}`;
      const entry = bySub.get(key) ?? {
        subscriptionNumber: r.subscription?.subscription_number ?? null,
        subscriptionType: r.subscription?.subscription_type ?? null,
        memberName: r.subscription?.customer_name ?? r.member_name,
        amount: 0,
        count: 0,
      };
      entry.amount += toNum(r.amount);
      entry.count += 1;
      bySub.set(key, entry);
    }

    const grouped = Array.from(bySub.values()).sort((a, b) => b.amount - a.amount);
    const totalGroups = grouped.length;
    const pageRows = grouped.slice(q.skip, q.skip + q.take);

    const paged = paginated(pageRows, totalGroups, q.page, q.pageSize);

    return {
      key: 'privateMembershipsIncome',
      title: 'Private (PT) Memberships Income',
      summary: { total, count: receipts.length, subscriptions: totalGroups },
      columns: [
        { key: 'subscriptionNumber', label: 'Subscription' },
        { key: 'subscriptionType', label: 'Type' },
        { key: 'memberName', label: 'Member' },
        { key: 'amount', label: 'Income' },
        { key: 'count', label: 'Receipts' },
      ],
      rows: paged.data,
      total: paged.total,
      page: paged.page,
      pageSize: paged.pageSize,
    };
  },

  medicalMembershipsIncome: async (prisma, q): Promise<MosReportResult> => {
    // Clinic income is every receipt whose subscription package is explicitly
    // classified as medical, regardless of the package's Arabic/English name.
    const columns = [
      { key: 'receiptNumber', label: 'Receipt' },
      { key: 'subscriptionType', label: 'Type' },
      { key: 'memberName', label: 'Member' },
      { key: 'amount', label: 'Income' },
      { key: 'receiptDate', label: 'Date' },
    ];

    const where: Prisma.club_receiptsWhereInput = {
      subscription: { is: { type: { is: { package_category: 'medical' } } } },
      ...branchWhere(q),
      ...dateRangeWhere('receipt_date', q),
    };

    const receipts = await prisma.club_receipts.findMany({
      where,
      include: {
        subscription: { select: { subscription_type: true, customer_name: true } },
      },
      orderBy: { receipt_date: 'desc' },
    });

    const total = receipts.reduce((s, r) => s + toNum(r.amount), 0);
    const totalRows = receipts.length;
    const pageRows = receipts.slice(q.skip, q.skip + q.take);

    const paged = paginated(
      pageRows.map((r) => ({
        receiptNumber: r.receipt_number,
        subscriptionType: r.subscription?.subscription_type ?? null,
        memberName: r.subscription?.customer_name ?? r.member_name,
        amount: toNum(r.amount),
        receiptDate: r.receipt_date,
      })),
      totalRows,
      q.page,
      q.pageSize,
    );

    return {
      key: 'medicalMembershipsIncome',
      title: 'Medical Memberships Income',
      summary: { total, count: totalRows },
      columns,
      rows: paged.data,
      total: paged.total,
      page: paged.page,
      pageSize: paged.pageSize,
    };
  },
};
