import {
  Prisma,
  type MosReportResult,
  type ReportHandler,
  dateRangeWhere,
  branchWhere,
  mapRow,
  toNum,
  paginated,
  isoDate,
  daysAgo,
} from '../mos-reports.shared';

// keep referenced so the shared helpers stay imported even as handlers evolve
void mapRow;
void paginated;
void daysAgo;

/** Default per-class instructor rate (currency units) used for payroll estimates. */
const PER_CLASS_RATE = 100;

/** Map trainer ids -> trainer name for the given rows. */
async function trainerNames(
  prisma: Parameters<ReportHandler>[0],
  ids: number[],
): Promise<Map<number, string>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const trainers = await prisma.club_trainers.findMany({
    where: { id: { in: unique } },
    select: { id: true, name: true },
  });
  return new Map(trainers.map((t) => [t.id, t.name]));
}

/** Map member ids -> member name for the given rows. */
async function memberNames(
  prisma: Parameters<ReportHandler>[0],
  ids: number[],
): Promise<Map<number, string>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const members = await prisma.club_members.findMany({
    where: { id: { in: unique } },
    select: { id: true, name: true },
  });
  return new Map(members.map((m) => [m.id, m.name]));
}

/** classes report handlers (keyed by reportKeyFromPath output). */
export const CLASS_REPORTS: Record<string, ReportHandler> = {
  heldClasses: async (prisma, q): Promise<MosReportResult> => {
    const today = isoDate();
    // "held" = completed/ongoing, OR already occurred (class_date <= today) and not cancelled.
    const where: Prisma.club_classesWhereInput = {
      is_deleted: false,
      ...branchWhere(q),
      ...dateRangeWhere('class_date', q),
      OR: [
        { status: { in: ['completed', 'ongoing'] } },
        { AND: [{ class_date: { lte: today } }, { status: { not: 'cancelled' } }] },
      ],
    };

    const classes = await prisma.club_classes.findMany({
      where,
      orderBy: { class_date: 'desc' },
      include: { _count: { select: { enrollments: true } } },
    });

    const trainers = await trainerNames(
      prisma,
      classes.map((c) => c.trainer_id),
    );

    const totalEnrollments = classes.reduce((s, c) => s + c._count.enrollments, 0);

    return {
      key: 'heldClasses',
      title: 'Held Classes',
      summary: { count: classes.length, totalEnrollments },
      columns: [
        { key: 'className', label: 'Class' },
        { key: 'classType', label: 'Type' },
        { key: 'trainer', label: 'Trainer' },
        { key: 'date', label: 'Date' },
        { key: 'enrollments', label: 'Enrollments' },
        { key: 'capacity', label: 'Capacity' },
      ],
      rows: classes.map((c) => ({
        className: c.class_name,
        classType: c.class_type,
        trainer: trainers.get(c.trainer_id) ?? `#${c.trainer_id}`,
        date: c.class_date,
        enrollments: c._count.enrollments,
        capacity: c.max_capacity,
      })),
    };
  },

  cancelledClasses: async (prisma, q): Promise<MosReportResult> => {
    const where = {
      is_deleted: false,
      status: 'cancelled' as const,
      ...branchWhere(q),
      ...dateRangeWhere('class_date', q),
    };

    const classes = await prisma.club_classes.findMany({
      where,
      orderBy: { class_date: 'desc' },
    });
    const trainers = await trainerNames(
      prisma,
      classes.map((c) => c.trainer_id),
    );

    return {
      key: 'cancelledClasses',
      title: 'Cancelled Classes',
      summary: { count: classes.length },
      columns: [
        { key: 'className', label: 'Class' },
        { key: 'classType', label: 'Type' },
        { key: 'trainer', label: 'Trainer' },
        { key: 'date', label: 'Date' },
        { key: 'capacity', label: 'Capacity' },
      ],
      rows: classes.map((c) => ({
        className: c.class_name,
        classType: c.class_type,
        trainer: trainers.get(c.trainer_id) ?? `#${c.trainer_id}`,
        date: c.class_date,
        capacity: c.max_capacity,
      })),
    };
  },

  membersAttendanceOnClasses: async (prisma, q): Promise<MosReportResult> => {
    // Enrollments have no branch/date columns — filter via the related class.
    const classFilter = {
      is_deleted: false,
      ...branchWhere(q),
      ...dateRangeWhere('class_date', q),
    };

    const enrollments = await prisma.club_class_enrollments.findMany({
      where: {
        attendance_status: 'attended',
        class: classFilter,
      },
      orderBy: { id: 'desc' },
    });

    const members = await memberNames(
      prisma,
      enrollments.map((e) => e.member_id),
    );

    // Aggregate per member in JS.
    const perMember = new Map<number, number>();
    for (const e of enrollments) {
      perMember.set(e.member_id, (perMember.get(e.member_id) ?? 0) + 1);
    }

    const rows = [...perMember.entries()]
      .map(([memberId, classesAttended]) => ({
        member: members.get(memberId) ?? `#${memberId}`,
        classesAttended,
      }))
      .sort((a, b) => b.classesAttended - a.classesAttended);

    return {
      key: 'membersAttendanceOnClasses',
      title: 'Members Attendance on Classes',
      summary: { count: enrollments.length, uniqueMembers: perMember.size },
      columns: [
        { key: 'member', label: 'Member' },
        { key: 'classesAttended', label: 'Classes attended' },
      ],
      rows,
    };
  },

  classesPerInstructorType: async (prisma, q): Promise<MosReportResult> => {
    const where = {
      is_deleted: false,
      ...branchWhere(q),
      ...dateRangeWhere('class_date', q),
    };

    const classes = await prisma.club_classes.findMany({
      where,
      select: { class_type: true, trainer_id: true },
    });
    const trainers = await trainerNames(
      prisma,
      classes.map((c) => c.trainer_id),
    );

    // Group by class_type × trainer in JS.
    const groups = new Map<string, { classType: string; trainer: string; count: number }>();
    for (const c of classes) {
      const trainer = trainers.get(c.trainer_id) ?? `#${c.trainer_id}`;
      const gkey = `${c.class_type}||${c.trainer_id}`;
      const existing = groups.get(gkey);
      if (existing) existing.count += 1;
      else groups.set(gkey, { classType: c.class_type, trainer, count: 1 });
    }

    const rows = [...groups.values()].sort((a, b) => b.count - a.count);

    return {
      key: 'classesPerInstructorType',
      title: 'Classes per Instructor & Type',
      summary: { totalClasses: classes.length, groups: rows.length },
      columns: [
        { key: 'classType', label: 'Type' },
        { key: 'trainer', label: 'Trainer' },
        { key: 'count', label: 'Classes' },
      ],
      rows,
    };
  },

  'instructors-payroll': async (prisma, q): Promise<MosReportResult> => {
    const today = isoDate();
    // Held classes drive payroll (same definition as heldClasses).
    const where: Prisma.club_classesWhereInput = {
      is_deleted: false,
      ...branchWhere(q),
      ...dateRangeWhere('class_date', q),
      OR: [
        { status: { in: ['completed', 'ongoing'] } },
        { AND: [{ class_date: { lte: today } }, { status: { not: 'cancelled' } }] },
      ],
    };

    const classes = await prisma.club_classes.findMany({
      where,
      select: { trainer_id: true },
    });
    const trainers = await trainerNames(
      prisma,
      classes.map((c) => c.trainer_id),
    );

    // Classes held per trainer in JS.
    const perTrainer = new Map<number, number>();
    for (const c of classes) {
      perTrainer.set(c.trainer_id, (perTrainer.get(c.trainer_id) ?? 0) + 1);
    }

    const rows = [...perTrainer.entries()]
      .map(([trainerId, count]) => ({
        trainer: trainers.get(trainerId) ?? `#${trainerId}`,
        classes: count,
        estimatedPayroll: count * PER_CLASS_RATE,
      }))
      .sort((a, b) => b.estimatedPayroll - a.estimatedPayroll);

    const totalPayroll = rows.reduce((s, r) => s + r.estimatedPayroll, 0);

    return {
      key: 'instructors-payroll',
      title: 'Instructors Payroll',
      summary: {
        totalClasses: classes.length,
        totalPayroll,
        perClassRate: PER_CLASS_RATE,
        instructors: rows.length,
      },
      columns: [
        { key: 'trainer', label: 'Instructor' },
        { key: 'classes', label: 'Classes held' },
        { key: 'estimatedPayroll', label: 'Estimated payroll' },
      ],
      rows,
    };
  },

  'instructors-Rating': async (prisma, q): Promise<MosReportResult> => {
    // club_trainers has rating_avg — use it directly, plus a class count in range.
    const trainers = await prisma.club_trainers.findMany({
      where: { is_deleted: false },
      select: { id: true, name: true, rating_avg: true },
    });

    const classWhere = {
      is_deleted: false,
      ...branchWhere(q),
      ...dateRangeWhere('class_date', q),
    };
    const classes = await prisma.club_classes.findMany({
      where: classWhere,
      select: { trainer_id: true },
    });
    const perTrainer = new Map<number, number>();
    for (const c of classes) {
      perTrainer.set(c.trainer_id, (perTrainer.get(c.trainer_id) ?? 0) + 1);
    }

    const rows = trainers
      .map((t) => ({
        trainer: t.name,
        rating: toNum(t.rating_avg),
        classes: perTrainer.get(t.id) ?? 0,
      }))
      .sort((a, b) => b.rating - a.rating);

    const rated = rows.filter((r) => r.rating > 0);
    const avgRating =
      rated.length > 0 ? rated.reduce((s, r) => s + r.rating, 0) / rated.length : 0;

    return {
      key: 'instructors-Rating',
      title: 'Instructors Rating',
      summary: {
        instructors: rows.length,
        avgRating: Math.round(avgRating * 100) / 100,
      },
      columns: [
        { key: 'trainer', label: 'Instructor' },
        { key: 'rating', label: 'Rating' },
        { key: 'classes', label: 'Classes' },
      ],
      rows,
    };
  },

  'other-entities-bookings': async (prisma, q): Promise<MosReportResult> => {
    const [spa, inbody] = await Promise.all([
      prisma.club_spa_bookings.findMany({
        where: { ...branchWhere(q), ...dateRangeWhere('booking_date', q) },
        orderBy: { booking_date: 'desc' },
      }),
      prisma.club_inbody_bookings.findMany({
        where: { is_deleted: false, ...branchWhere(q), ...dateRangeWhere('booking_date', q) },
        orderBy: { booking_date: 'desc' },
      }),
    ]);

    // Resolve inbody member names (booking may reference a member).
    const inbodyMembers = await memberNames(
      prisma,
      inbody.map((b) => b.member_id).filter((id): id is number => id != null),
    );

    const spaRows = spa.map((b) => ({
      type: 'spa' as const,
      member: b.customer_name ?? (b.member_id != null ? `#${b.member_id}` : 'Guest'),
      date: b.booking_date,
      status: String(b.status),
    }));

    const inbodyRows = inbody.map((b) => ({
      type: 'inbody' as const,
      member:
        b.member_name ??
        (b.member_id != null ? inbodyMembers.get(b.member_id) ?? `#${b.member_id}` : 'Guest'),
      date: b.booking_date,
      status: b.status,
    }));

    const rows = [...spaRows, ...inbodyRows].sort((a, b) => b.date.localeCompare(a.date));

    return {
      key: 'other-entities-bookings',
      title: 'Other Entities Bookings',
      summary: { spa: spa.length, inbody: inbody.length, total: rows.length },
      columns: [
        { key: 'type', label: 'Type' },
        { key: 'member', label: 'Member / Customer' },
        { key: 'date', label: 'Date' },
        { key: 'status', label: 'Status' },
      ],
      rows,
    };
  },
};
