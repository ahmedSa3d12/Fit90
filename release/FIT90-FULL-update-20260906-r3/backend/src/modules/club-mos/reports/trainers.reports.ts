import {
  type MosReportResult,
  type ReportHandler,
  dateRangeWhere,
  branchWhere,
  paginated,
  toNum,
  isoDate,
  daysAgo,
} from '../mos-reports.shared';

/** Default per-class commission (currency units) when no instructor_class_rate rule exists. */
const DEFAULT_CLASS_RATE = 50;
/** Default flat monthly commission when no fixed_trainer_commission rule exists. */
const DEFAULT_FIXED_COMMISSION = 1000;

/** Read a numeric field out of a commission rule's JSON config, tolerating shape drift. */
function configNum(config: unknown, ...keys: string[]): number | undefined {
  if (config == null || typeof config !== 'object') return undefined;
  const obj = config as Record<string, unknown>;
  for (const k of keys) {
    const v = obj[k];
    const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

/** Load id -> name for the active trainers in scope (branch is not on club_trainers). */
async function trainerNames(
  prisma: Parameters<ReportHandler>[0],
): Promise<Map<number, string>> {
  const trainers = await prisma.club_trainers.findMany({
    where: { is_deleted: false },
    select: { id: true, name: true },
  });
  return new Map(trainers.map((t) => [t.id, t.name]));
}

/** trainers report handlers (keyed by reportKeyFromPath output). */
export const TRAINER_REPORTS: Record<string, ReportHandler> = {
  consumedPTSessions: async (prisma, q): Promise<MosReportResult> => {
    // All session-linked subscriptions; a row per subscription/member.
    const subs = await prisma.club_subscriptions.findMany({
      where: {
        is_linked_to_sessions: true,
        ...branchWhere(q),
        ...dateRangeWhere('registration_date', q),
      },
      orderBy: { registration_date: 'desc' },
      select: {
        subscription_number: true,
        customer_name: true,
        member_id: true,
        sessions_count: true,
        sessions_used: true,
      },
    });

    const totalConsumed = subs.reduce((s, r) => s + toNum(r.sessions_used), 0);
    const totalRemaining = subs.reduce(
      (s, r) => s + Math.max(0, toNum(r.sessions_count) - toNum(r.sessions_used)),
      0,
    );

    const paged = paginated(
      subs.map((r) => ({
        subscriptionNumber: r.subscription_number,
        member: r.customer_name ?? 'Unknown',
        used: toNum(r.sessions_used),
        total: toNum(r.sessions_count),
        remaining: Math.max(0, toNum(r.sessions_count) - toNum(r.sessions_used)),
      })),
      subs.length,
      q.page,
      q.pageSize,
    );

    return {
      key: 'consumedPTSessions',
      title: 'Consumed Private Training Sessions',
      summary: { totalConsumed, totalRemaining, subscriptions: subs.length },
      columns: [
        { key: 'subscriptionNumber', label: 'Subscription' },
        { key: 'member', label: 'Member' },
        { key: 'used', label: 'Consumed' },
        { key: 'total', label: 'Total' },
        { key: 'remaining', label: 'Remaining' },
      ],
      rows: paged.data,
      total: paged.total,
      page: paged.page,
      pageSize: paged.pageSize,
    };
  },

  consumedPTSessionsPerMembership: async (prisma, q): Promise<MosReportResult> => {
    // Same source, framed per subscription/membership.
    const subs = await prisma.club_subscriptions.findMany({
      where: {
        is_linked_to_sessions: true,
        ...branchWhere(q),
        ...dateRangeWhere('registration_date', q),
      },
      orderBy: { sessions_used: 'desc' },
      select: {
        subscription_number: true,
        customer_name: true,
        sessions_count: true,
        sessions_used: true,
      },
    });

    const totalConsumed = subs.reduce((s, r) => s + toNum(r.sessions_used), 0);
    const totalRemaining = subs.reduce(
      (s, r) => s + Math.max(0, toNum(r.sessions_count) - toNum(r.sessions_used)),
      0,
    );

    const paged = paginated(
      subs.map((r) => ({
        member: r.customer_name ?? 'Unknown',
        subscriptionNumber: r.subscription_number,
        used: toNum(r.sessions_used),
        total: toNum(r.sessions_count),
        remaining: Math.max(0, toNum(r.sessions_count) - toNum(r.sessions_used)),
      })),
      subs.length,
      q.page,
      q.pageSize,
    );

    return {
      key: 'consumedPTSessionsPerMembership',
      title: 'Consumed PT Sessions per Membership',
      summary: { totalConsumed, totalRemaining, memberships: subs.length },
      columns: [
        { key: 'member', label: 'Member' },
        { key: 'subscriptionNumber', label: 'Subscription' },
        { key: 'used', label: 'Consumed' },
        { key: 'total', label: 'Total' },
        { key: 'remaining', label: 'Remaining' },
      ],
      rows: paged.data,
      total: paged.total,
      page: paged.page,
      pageSize: paged.pageSize,
    };
  },

  consumedPTSessionsPerTrainer: async (prisma, q): Promise<MosReportResult> => {
    // club_subscriptions has no trainer_id; attribute PT sessions to the trainer
    // assigned on the member record (club_members.trainer_id).
    const subs = await prisma.club_subscriptions.findMany({
      where: {
        is_linked_to_sessions: true,
        member_id: { not: null },
        ...branchWhere(q),
        ...dateRangeWhere('registration_date', q),
      },
      select: { member_id: true, sessions_used: true },
    });

    const memberIds = Array.from(
      new Set(subs.map((s) => s.member_id).filter((id): id is number => id != null)),
    );
    const members = memberIds.length
      ? await prisma.club_members.findMany({
          where: { id: { in: memberIds } },
          select: { id: true, trainer_id: true },
        })
      : [];
    const memberTrainer = new Map(members.map((m) => [m.id, m.trainer_id]));
    const names = await trainerNames(prisma);

    const byTrainer = new Map<number, number>();
    let unassigned = 0;
    for (const s of subs) {
      const tid = s.member_id != null ? memberTrainer.get(s.member_id) : null;
      if (tid == null) {
        unassigned += toNum(s.sessions_used);
        continue;
      }
      byTrainer.set(tid, (byTrainer.get(tid) ?? 0) + toNum(s.sessions_used));
    }

    const rows = Array.from(byTrainer.entries())
      .map(([tid, sessionsConsumed]) => ({
        trainer: names.get(tid) ?? `Trainer #${tid}`,
        sessionsConsumed,
      }))
      .sort((a, b) => b.sessionsConsumed - a.sessionsConsumed);
    if (unassigned > 0) rows.push({ trainer: 'Unassigned', sessionsConsumed: unassigned });

    return {
      key: 'consumedPTSessionsPerTrainer',
      title: 'Consumed PT Sessions per Trainer',
      summary: {
        totalConsumed: rows.reduce((s, r) => s + r.sessionsConsumed, 0),
        trainers: byTrainer.size,
      },
      columns: [
        { key: 'trainer', label: 'Trainer' },
        { key: 'sessionsConsumed', label: 'Sessions Consumed' },
      ],
      rows,
    };
  },

  trainerCommission: async (prisma, q): Promise<MosReportResult> => {
    // Per trainer: classes held + enrollments, with a percentage/per-class commission.
    const classes = await prisma.club_classes.findMany({
      where: {
        is_deleted: false,
        ...branchWhere(q),
        ...dateRangeWhere('class_date', q),
      },
      select: { id: true, trainer_id: true, price: true },
    });

    const enrollments = classes.length
      ? await prisma.club_class_enrollments.findMany({
          where: { class_id: { in: classes.map((c) => c.id) } },
          select: { class_id: true },
        })
      : [];
    const enrollByClass = new Map<number, number>();
    for (const e of enrollments) {
      enrollByClass.set(e.class_id, (enrollByClass.get(e.class_id) ?? 0) + 1);
    }

    // Commission config: percentage of class revenue, or a per-class flat rate.
    const rules = await prisma.club_commission_rules.findMany({
      where: {
        is_deleted: false,
        is_active: true,
        kind: { in: ['trainer_percentage', 'instructor_class_rate'] },
        ...(q.branchId != null ? { OR: [{ branch_id: q.branchId }, { branch_id: null }] } : {}),
      },
    });
    const pctRule = rules.find((r) => r.kind === 'trainer_percentage');
    const rateRule = rules.find((r) => r.kind === 'instructor_class_rate');
    const percentage = configNum(pctRule?.config, 'percentage', 'percent', 'rate');
    const perClassRate =
      configNum(rateRule?.config, 'rate', 'amount', 'perClass') ?? DEFAULT_CLASS_RATE;

    const names = await trainerNames(prisma);
    const byTrainer = new Map<
      number,
      { classes: number; enrollments: number; revenue: number }
    >();
    for (const c of classes) {
      const entry = byTrainer.get(c.trainer_id) ?? { classes: 0, enrollments: 0, revenue: 0 };
      const ce = enrollByClass.get(c.id) ?? 0;
      entry.classes += 1;
      entry.enrollments += ce;
      entry.revenue += toNum(c.price) * ce;
      byTrainer.set(c.trainer_id, entry);
    }

    const rows = Array.from(byTrainer.entries())
      .map(([tid, v]) => {
        const commission =
          percentage != null
            ? (v.revenue * percentage) / 100
            : v.classes * perClassRate;
        return {
          trainer: names.get(tid) ?? `Trainer #${tid}`,
          classes: v.classes,
          enrollments: v.enrollments,
          commission: Math.round(commission * 100) / 100,
        };
      })
      .sort((a, b) => b.commission - a.commission);

    return {
      key: 'trainerCommission',
      title: 'Trainer Commission',
      summary: {
        total: rows.reduce((s, r) => s + r.commission, 0),
        basis: percentage != null ? `${percentage}% of class revenue` : `${perClassRate} per class`,
      },
      columns: [
        { key: 'trainer', label: 'Trainer' },
        { key: 'classes', label: 'Classes' },
        { key: 'enrollments', label: 'Enrollments' },
        { key: 'commission', label: 'Commission' },
      ],
      rows,
    };
  },

  fixedTrainerCommission: async (prisma, q): Promise<MosReportResult> => {
    // Flat monthly commission per active trainer, from the fixed_trainer_commission rule.
    const rule = await prisma.club_commission_rules.findFirst({
      where: {
        is_deleted: false,
        is_active: true,
        kind: 'fixed_trainer_commission',
        ...(q.branchId != null ? { OR: [{ branch_id: q.branchId }, { branch_id: null }] } : {}),
      },
    });
    const fixedAmount =
      configNum(rule?.config, 'amount', 'monthly', 'fixed') ?? DEFAULT_FIXED_COMMISSION;

    const trainers = await prisma.club_trainers.findMany({
      where: { is_deleted: false, is_active: true },
      orderBy: { name: 'asc' },
      select: { name: true },
    });

    const rows = trainers.map((t) => ({ trainer: t.name, fixedAmount }));

    return {
      key: 'fixedTrainerCommission',
      title: 'Fixed Trainer Commission',
      summary: {
        total: fixedAmount * trainers.length,
        perTrainer: fixedAmount,
        trainers: trainers.length,
      },
      columns: [
        { key: 'trainer', label: 'Trainer' },
        { key: 'fixedAmount', label: 'Fixed Commission' },
      ],
      rows,
    };
  },

  trainerClosingRatio: async (prisma, q): Promise<MosReportResult> => {
    // Best-effort: leads assigned to a trainer (club_leads.assigned_to) vs those converted
    // (status won/converted/member). assigned_to maps to trainer/staff id.
    const leads = await prisma.club_leads.findMany({
      where: { is_deleted: false, assigned_to: { not: null }, ...branchWhere(q) },
      select: { assigned_to: true, status: true },
    });
    const names = await trainerNames(prisma);
    const converted = new Set(['won', 'converted', 'member', 'closed', 'subscribed']);

    const byOwner = new Map<number, { assigned: number; converted: number }>();
    for (const l of leads) {
      const id = l.assigned_to as number;
      const entry = byOwner.get(id) ?? { assigned: 0, converted: 0 };
      entry.assigned += 1;
      if (converted.has((l.status ?? '').toLowerCase())) entry.converted += 1;
      byOwner.set(id, entry);
    }

    const rows = Array.from(byOwner.entries())
      .map(([id, v]) => ({
        trainer: names.get(id) ?? `Owner #${id}`,
        assigned: v.assigned,
        converted: v.converted,
        ratio: v.assigned ? Math.round((v.converted / v.assigned) * 10000) / 100 : 0,
      }))
      .sort((a, b) => b.ratio - a.ratio);

    const totalAssigned = rows.reduce((s, r) => s + r.assigned, 0);
    const totalConverted = rows.reduce((s, r) => s + r.converted, 0);

    return {
      key: 'trainerClosingRatio',
      title: 'Trainer Closing Ratio',
      summary: {
        assigned: totalAssigned,
        converted: totalConverted,
        ratio: totalAssigned ? Math.round((totalConverted / totalAssigned) * 10000) / 100 : 0,
      },
      columns: [
        { key: 'trainer', label: 'Trainer' },
        { key: 'assigned', label: 'Assigned' },
        { key: 'converted', label: 'Converted' },
        { key: 'ratio', label: 'Ratio %' },
      ],
      rows,
    };
  },

  trainerClosingRatioDetails: async (prisma, q): Promise<MosReportResult> => {
    // Per-lead detail behind the closing ratio.
    const converted = new Set(['won', 'converted', 'member', 'closed', 'subscribed']);
    const where = {
      is_deleted: false,
      assigned_to: { not: null },
      ...branchWhere(q),
    };
    const [leads, total] = await Promise.all([
      prisma.club_leads.findMany({
        where,
        orderBy: { updated_at: 'desc' },
        skip: q.skip,
        take: q.take,
        select: { name: true, phone: true, status: true, assigned_to: true, follow_up_at: true },
      }),
      prisma.club_leads.count({ where }),
    ]);
    const names = await trainerNames(prisma);

    const paged = paginated(
      leads.map((l) => ({
        trainer: l.assigned_to != null ? names.get(l.assigned_to) ?? `Owner #${l.assigned_to}` : 'Unassigned',
        lead: l.name,
        phone: l.phone,
        status: l.status,
        converted: converted.has((l.status ?? '').toLowerCase()) ? 'Yes' : 'No',
        followUp: l.follow_up_at,
      })),
      total,
      q.page,
      q.pageSize,
    );

    return {
      key: 'trainerClosingRatioDetails',
      title: 'Trainer Closing Ratio Details',
      summary: { count: total },
      columns: [
        { key: 'trainer', label: 'Trainer' },
        { key: 'lead', label: 'Lead' },
        { key: 'phone', label: 'Phone' },
        { key: 'status', label: 'Status' },
        { key: 'converted', label: 'Converted' },
        { key: 'followUp', label: 'Follow-up' },
      ],
      rows: paged.data,
      total: paged.total,
      page: paged.page,
      pageSize: paged.pageSize,
    };
  },

  trainersAchievement: async (prisma, q): Promise<MosReportResult> => {
    // Per-trainer KPIs: classes held, unique members trained, PT sessions delivered.
    const classes = await prisma.club_classes.findMany({
      where: {
        is_deleted: false,
        ...branchWhere(q),
        ...dateRangeWhere('class_date', q),
      },
      select: { id: true, trainer_id: true },
    });
    const classToTrainer = new Map(classes.map((c) => [c.id, c.trainer_id]));

    const enrollments = classes.length
      ? await prisma.club_class_enrollments.findMany({
          where: { class_id: { in: classes.map((c) => c.id) } },
          select: { class_id: true, member_id: true },
        })
      : [];

    // PT sessions delivered, attributed via the member's assigned trainer.
    const subs = await prisma.club_subscriptions.findMany({
      where: {
        is_linked_to_sessions: true,
        member_id: { not: null },
        ...branchWhere(q),
        ...dateRangeWhere('registration_date', q),
      },
      select: { member_id: true, sessions_used: true },
    });
    const memberIds = Array.from(
      new Set(subs.map((s) => s.member_id).filter((id): id is number => id != null)),
    );
    const members = memberIds.length
      ? await prisma.club_members.findMany({
          where: { id: { in: memberIds } },
          select: { id: true, trainer_id: true },
        })
      : [];
    const memberTrainer = new Map(members.map((m) => [m.id, m.trainer_id]));

    const names = await trainerNames(prisma);
    const stats = new Map<
      number,
      { classes: number; members: Set<number>; sessions: number }
    >();
    const ensure = (tid: number) => {
      let s = stats.get(tid);
      if (!s) {
        s = { classes: 0, members: new Set<number>(), sessions: 0 };
        stats.set(tid, s);
      }
      return s;
    };
    for (const c of classes) ensure(c.trainer_id).classes += 1;
    for (const e of enrollments) {
      const tid = classToTrainer.get(e.class_id);
      if (tid != null) ensure(tid).members.add(e.member_id);
    }
    for (const s of subs) {
      const tid = s.member_id != null ? memberTrainer.get(s.member_id) : null;
      if (tid != null) ensure(tid).sessions += toNum(s.sessions_used);
    }

    const rows = Array.from(stats.entries())
      .map(([tid, v]) => ({
        trainer: names.get(tid) ?? `Trainer #${tid}`,
        classes: v.classes,
        members: v.members.size,
        sessions: v.sessions,
      }))
      .sort((a, b) => b.classes - a.classes);

    return {
      key: 'trainersAchievement',
      title: 'Trainers Achievement',
      summary: {
        trainers: rows.length,
        classes: rows.reduce((s, r) => s + r.classes, 0),
        sessions: rows.reduce((s, r) => s + r.sessions, 0),
      },
      columns: [
        { key: 'trainer', label: 'Trainer' },
        { key: 'classes', label: 'Classes' },
        { key: 'members', label: 'Members Trained' },
        { key: 'sessions', label: 'PT Sessions' },
      ],
      rows,
    };
  },

  freePrivateTraining: async (prisma, q): Promise<MosReportResult> => {
    // Free PT given: complimentary session-linked subscriptions (zero value but sessions)
    // plus PT-flavored entries in club_free_benefits.
    const [freeSubs, benefits] = await Promise.all([
      prisma.club_subscriptions.findMany({
        where: {
          is_linked_to_sessions: true,
          subscription_value: 0,
          ...branchWhere(q),
          ...dateRangeWhere('registration_date', q),
        },
        select: {
          subscription_number: true,
          customer_name: true,
          sessions_count: true,
          registration_date: true,
        },
      }),
      prisma.club_free_benefits.findMany({
        where: {
          is_deleted: false,
          OR: [
            { benefit_name: { contains: 'training' } },
            { benefit_name: { contains: 'session' } },
            { benefit_name: { contains: 'PT' } },
            { benefit_name: { contains: 'تدريب' } },
            { benefit_name: { contains: 'حصص' } },
          ],
          ...branchWhere(q),
          ...dateRangeWhere('benefit_date', q),
        },
        select: { member_name: true, benefit_name: true, benefit_date: true, quantity: true },
      }),
    ]);

    const rows = [
      ...freeSubs.map((s) => ({
        member: s.customer_name ?? 'Unknown',
        source: `Complimentary subscription ${s.subscription_number}`,
        sessions: toNum(s.sessions_count),
        date: s.registration_date,
      })),
      ...benefits.map((b) => ({
        member: b.member_name ?? 'Unknown',
        source: b.benefit_name,
        sessions: toNum(b.quantity),
        date: b.benefit_date,
      })),
    ].sort((a, b) => (a.date < b.date ? 1 : -1));

    return {
      key: 'freePrivateTraining',
      title: 'Free Private Training',
      summary: {
        count: rows.length,
        totalSessions: rows.reduce((s, r) => s + r.sessions, 0),
      },
      columns: [
        { key: 'member', label: 'Member' },
        { key: 'source', label: 'Source' },
        { key: 'sessions', label: 'Sessions' },
        { key: 'date', label: 'Date' },
      ],
      rows,
    };
  },

  'trainer-member-retention': async (prisma, q): Promise<MosReportResult> => {
    // Per trainer: members still active vs lapsed. A member counts as active when their
    // record is active and their latest subscription has not expired.
    const today = isoDate();
    const members = await prisma.club_members.findMany({
      where: { is_deleted: false, trainer_id: { not: null }, ...branchWhere(q) },
      select: { id: true, trainer_id: true, is_active: true, end_date: true },
    });

    // Latest subscription end date per member, to refine active/lapsed.
    const memberIds = members.map((m) => m.id);
    const subs = memberIds.length
      ? await prisma.club_subscriptions.findMany({
          where: { member_id: { in: memberIds } },
          select: { member_id: true, subscription_end_date: true },
        })
      : [];
    const latestEnd = new Map<number, string>();
    for (const s of subs) {
      if (s.member_id == null) continue;
      const cur = latestEnd.get(s.member_id);
      if (!cur || s.subscription_end_date > cur) latestEnd.set(s.member_id, s.subscription_end_date);
    }

    const names = await trainerNames(prisma);
    const byTrainer = new Map<number, { active: number; lapsed: number }>();
    for (const m of members) {
      const tid = m.trainer_id as number;
      const end = latestEnd.get(m.id) ?? m.end_date ?? null;
      const isActive = m.is_active && (end == null || end >= today);
      const entry = byTrainer.get(tid) ?? { active: 0, lapsed: 0 };
      if (isActive) entry.active += 1;
      else entry.lapsed += 1;
      byTrainer.set(tid, entry);
    }

    const rows = Array.from(byTrainer.entries())
      .map(([tid, v]) => {
        const total = v.active + v.lapsed;
        return {
          trainer: names.get(tid) ?? `Trainer #${tid}`,
          active: v.active,
          lapsed: v.lapsed,
          retentionRate: total ? Math.round((v.active / total) * 10000) / 100 : 0,
        };
      })
      .sort((a, b) => b.retentionRate - a.retentionRate);

    const totalActive = rows.reduce((s, r) => s + r.active, 0);
    const totalMembers = rows.reduce((s, r) => s + r.active + r.lapsed, 0);

    return {
      key: 'trainer-member-retention',
      title: 'Trainer Member Retention',
      summary: {
        members: totalMembers,
        active: totalActive,
        retentionRate: totalMembers ? Math.round((totalActive / totalMembers) * 10000) / 100 : 0,
        since: daysAgo(0),
      },
      columns: [
        { key: 'trainer', label: 'Trainer' },
        { key: 'active', label: 'Active' },
        { key: 'lapsed', label: 'Lapsed' },
        { key: 'retentionRate', label: 'Retention %' },
      ],
      rows,
    };
  },
};
