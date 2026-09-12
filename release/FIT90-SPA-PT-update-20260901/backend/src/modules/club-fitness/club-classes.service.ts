import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { paginated } from '../../common/dto/list-result';
import { EntitlementService } from '../gym-ops/entitlement.service';
import { isActiveEnrollment, localDateString, timeOverlap, toNum } from './club-fitness.utils';
import { ListClubClassesDto } from './dto/list-club-classes.dto';

@Injectable()
export class ClubClassesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlement: EntitlementService,
  ) {}

  private async countActiveEnrollments(classId: number, tx?: Prisma.TransactionClient) {
    const db = tx ?? this.prisma;
    return db.club_class_enrollments.count({
      where: { class_id: classId, attendance_status: { not: 'cancelled' } },
    });
  }

  /**
   * Reject when another non-deleted class exists for the same trainer on the same date whose
   * [start_time, end_time) window overlaps [startTime, endTime). Additive guard; excludeId skips
   * the class being updated. Missing time fields → nothing to check.
   */
  private async assertNoTrainerConflict(
    trainerId: number,
    classDate: string,
    startTime: string,
    endTime: string,
    excludeId?: number,
  ) {
    if (!trainerId || !classDate || !startTime || !endTime) return;
    const sameDay = await this.prisma.club_classes.findMany({
      where: {
        is_deleted: false,
        trainer_id: trainerId,
        class_date: classDate,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true, class_name: true, start_time: true, end_time: true },
    });
    const clash = sameDay.find((c) => timeOverlap(startTime, endTime, c.start_time, c.end_time));
    if (clash) {
      throw new ConflictException(
        `المدرب لديه حصة أخرى (${clash.class_name}) في نفس التوقيت من ${clash.start_time} إلى ${clash.end_time}`,
      );
    }
  }

  private mapClass(
    row: {
      id: number;
      class_name: string;
      class_type: string;
      description: string | null;
      trainer_id: number;
      branch_id: number;
      hall_id: number | null;
      class_date: string;
      start_time: string;
      end_time: string;
      max_capacity: number;
      price: Prisma.Decimal;
      status: string;
      notes: string | null;
      is_active: boolean;
      created_at: Date;
      updated_at: Date;
      trainer?: { id: number; name: string; phone: string | null; email: string | null };
      enrollments?: Array<{
        id: number;
        member_id: number;
        enrollment_date: string;
        attendance_status: string;
        attendance_time: string | null;
        notes: string | null;
      }>;
    },
    enrollmentCount?: number,
  ) {
    const activeEnrollments =
      row.enrollments?.filter((e) => isActiveEnrollment(e.attendance_status)) ?? [];
    return {
      id: row.id,
      className: row.class_name,
      classType: row.class_type,
      description: row.description,
      trainerId: row.trainer_id,
      branchId: row.branch_id,
      hallId: row.hall_id,
      classDate: row.class_date,
      startTime: row.start_time,
      endTime: row.end_time,
      maxCapacity: row.max_capacity,
      price: toNum(row.price),
      status: row.status,
      notes: row.notes,
      isActive: row.is_active,
      enrollmentCount: enrollmentCount ?? activeEnrollments.length,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      trainer: row.trainer,
      enrollments: row.enrollments?.map((e) => ({
        id: e.id,
        memberId: e.member_id,
        enrollmentDate: e.enrollment_date,
        attendanceStatus: e.attendance_status,
        attendanceTime: e.attendance_time,
        notes: e.notes,
      })),
    };
  }

  async list(q: ListClubClassesDto) {
    const and: Prisma.club_classesWhereInput[] = [{ is_deleted: false }];
    if (q.search?.trim()) {
      const s = q.search.trim();
      and.push({ OR: [{ class_name: { contains: s } }, { description: { contains: s } }] });
    }
    if (q.branch && q.branch !== 'all') and.push({ branch_id: Number(q.branch) });
    if (q.trainer && q.trainer !== 'all') and.push({ trainer_id: Number(q.trainer) });
    if (q.classType && q.classType !== 'all') and.push({ class_type: q.classType });
    if (q.status && q.status !== 'all') {
      and.push({ status: q.status as Prisma.EnumClubFitnessClassStatusFilter['equals'] });
    }
    if (q.dateFrom && q.dateTo) {
      and.push({ class_date: { gte: q.dateFrom, lte: q.dateTo } });
    } else if (q.dateFrom) {
      and.push({ class_date: { gte: q.dateFrom } });
    } else if (q.dateTo) {
      and.push({ class_date: { lte: q.dateTo } });
    }
    if (q.personalOnly) and.push({ max_capacity: 1 });

    const where: Prisma.club_classesWhereInput = { AND: and };
    const [rows, total] = await Promise.all([
      this.prisma.club_classes.findMany({
        where,
        include: {
          trainer: { select: { id: true, name: true, phone: true, email: true } },
          enrollments: { where: { attendance_status: { not: 'cancelled' } } },
        },
        orderBy: [
          { class_date: q.dateOrder === 'asc' ? 'asc' : 'desc' },
          { start_time: 'asc' },
        ],
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.club_classes.count({ where }),
    ]);

    return paginated(rows.map((r) => this.mapClass(r)), total, q.page, q.pageSize);
  }

  async statistics(query?: { branch?: string; trainer?: string; dateFrom?: string; dateTo?: string }) {
    const and: Prisma.club_classesWhereInput[] = [{ is_deleted: false }];
    if (query?.branch && query.branch !== 'all') and.push({ branch_id: Number(query.branch) });
    if (query?.trainer && query.trainer !== 'all') and.push({ trainer_id: Number(query.trainer) });
    if (query?.dateFrom && query?.dateTo) {
      and.push({ class_date: { gte: query.dateFrom, lte: query.dateTo } });
    }
    const where: Prisma.club_classesWhereInput = { AND: and };

    const [total, scheduled, completed, cancelled] = await Promise.all([
      this.prisma.club_classes.count({ where }),
      this.prisma.club_classes.count({ where: { AND: [...and, { status: 'scheduled' }] } }),
      this.prisma.club_classes.count({ where: { AND: [...and, { status: 'completed' }] } }),
      this.prisma.club_classes.count({ where: { AND: [...and, { status: 'cancelled' }] } }),
    ]);

    const classIds = await this.prisma.club_classes.findMany({ where, select: { id: true } });
    const ids = classIds.map((c) => c.id);

    const [totalEnrollments, totalAttendances] = ids.length
      ? await Promise.all([
          this.prisma.club_class_enrollments.count({
            where: { class_id: { in: ids }, attendance_status: { not: 'cancelled' } },
          }),
          this.prisma.club_class_enrollments.count({
            where: { class_id: { in: ids }, attendance_status: 'attended' },
          }),
        ])
      : [0, 0];

    return {
      totalClasses: total,
      scheduledClasses: scheduled,
      completedClasses: completed,
      cancelledClasses: cancelled,
      totalEnrollments,
      totalAttendances,
      attendanceRate: totalEnrollments > 0 ? (totalAttendances / totalEnrollments) * 100 : 0,
    };
  }

  async findOne(id: number) {
    const row = await this.prisma.club_classes.findFirst({
      where: { id, is_deleted: false },
      include: {
        trainer: { select: { id: true, name: true, phone: true, email: true } },
        enrollments: true,
      },
    });
    if (!row) throw new NotFoundException('الحصة غير موجودة');
    return this.mapClass(row);
  }

  private async validateReferences(body: Record<string, unknown>) {
    const trainerId = Number(body.trainerId);
    const branchId = Number(body.branchId);
    if (!trainerId || !branchId) {
      throw new BadRequestException('المدرب والفرع مطلوبان');
    }
    const trainer = await this.prisma.club_trainers.findFirst({
      where: { id: trainerId, is_deleted: false },
    });
    if (!trainer) throw new NotFoundException('المدرب غير موجود');
  }

  async create(body: Record<string, unknown>) {
    if (!body.className || !body.classDate || !body.startTime || !body.endTime) {
      throw new BadRequestException('يرجى إدخال جميع الحقول المطلوبة');
    }
    await this.validateReferences(body);

    await this.assertNoTrainerConflict(
      Number(body.trainerId),
      String(body.classDate),
      String(body.startTime),
      String(body.endTime),
    );

    const maxCapacity = body.maxCapacity != null ? Number(body.maxCapacity) : 10;
    const memberIds = Array.isArray(body.memberIds)
      ? [...new Set(body.memberIds.map((m) => Number(m)).filter((m) => m > 0))]
      : [];

    if (memberIds.length > maxCapacity) {
      throw new BadRequestException(`عدد الأعضاء (${memberIds.length}) يتجاوز السعة القصوى (${maxCapacity})`);
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const cls = await tx.club_classes.create({
        data: {
          class_name: String(body.className).trim(),
          class_type: body.classType ? String(body.classType).trim() : 'class',
          description: body.description ? String(body.description) : null,
          trainer_id: Number(body.trainerId),
          branch_id: Number(body.branchId),
          hall_id: body.hallId ? Number(body.hallId) : null,
          class_date: String(body.classDate),
          start_time: String(body.startTime),
          end_time: String(body.endTime),
          max_capacity: maxCapacity,
          price: body.price != null ? Number(body.price) : 0,
          notes: body.notes ? String(body.notes) : null,
          status: 'scheduled',
        },
      });

      if (memberIds.length > 0) {
        const today = localDateString();
        await tx.club_class_enrollments.createMany({
          data: memberIds.map((memberId) => ({
            class_id: cls.id,
            member_id: memberId,
            enrollment_date: today,
            attendance_status: 'registered' as const,
          })),
        });
      }

      return cls;
    });

    return this.findOne(created.id);
  }

  async update(id: number, body: Record<string, unknown>) {
    await this.findOne(id);

    // Re-check trainer double-booking when any of trainer/date/time changes, using the effective
    // (post-update) values merged over the existing row. Excludes this class from the search.
    if (
      body.trainerId != null ||
      body.classDate != null ||
      body.startTime != null ||
      body.endTime != null
    ) {
      const current = await this.prisma.club_classes.findUnique({ where: { id } });
      if (current) {
        await this.assertNoTrainerConflict(
          body.trainerId != null ? Number(body.trainerId) : current.trainer_id,
          body.classDate != null ? String(body.classDate) : current.class_date,
          body.startTime != null ? String(body.startTime) : current.start_time,
          body.endTime != null ? String(body.endTime) : current.end_time,
          id,
        );
      }
    }

    if (body.trainerId != null || body.branchId != null || body.hallId != null) {
      await this.validateReferences({
        trainerId: body.trainerId ?? (await this.prisma.club_classes.findUnique({ where: { id } }))!.trainer_id,
        branchId: body.branchId ?? (await this.prisma.club_classes.findUnique({ where: { id } }))!.branch_id,
        hallId: body.hallId,
      });
    }

    if (body.maxCapacity != null) {
      const activeCount = await this.countActiveEnrollments(id);
      if (activeCount > Number(body.maxCapacity)) {
        throw new BadRequestException(
          `لا يمكن تقليل السعة — يوجد ${activeCount} تسجيل نشط`,
        );
      }
    }

    await this.prisma.club_classes.update({
      where: { id },
      data: {
        ...(body.className != null ? { class_name: String(body.className).trim() } : {}),
        ...(body.classType != null ? { class_type: String(body.classType).trim() } : {}),
        ...(body.description !== undefined ? { description: body.description ? String(body.description) : null } : {}),
        ...(body.trainerId != null ? { trainer_id: Number(body.trainerId) } : {}),
        ...(body.branchId != null ? { branch_id: Number(body.branchId) } : {}),
        ...(body.hallId !== undefined ? { hall_id: body.hallId ? Number(body.hallId) : null } : {}),
        ...(body.classDate != null ? { class_date: String(body.classDate) } : {}),
        ...(body.startTime != null ? { start_time: String(body.startTime) } : {}),
        ...(body.endTime != null ? { end_time: String(body.endTime) } : {}),
        ...(body.maxCapacity != null ? { max_capacity: Number(body.maxCapacity) } : {}),
        ...(body.price != null ? { price: Number(body.price) } : {}),
        ...(body.status != null ? { status: String(body.status) as Prisma.EnumClubFitnessClassStatusFieldUpdateOperationsInput['set'] } : {}),
        ...(body.notes !== undefined ? { notes: body.notes ? String(body.notes) : null } : {}),
        ...(body.isActive !== undefined ? { is_active: Boolean(body.isActive) } : {}),
      },
    });

    return this.findOne(id);
  }

  async remove(id: number) {
    await this.findOne(id);
    await this.prisma.club_classes.update({
      where: { id },
      data: { is_deleted: true, is_active: false },
    });
    return { success: true };
  }

  async enrollMember(
    classId: number,
    memberId: number,
    options?: { waitlistIfFull?: boolean; force?: boolean },
  ) {
    const cls = await this.prisma.club_classes.findFirst({
      where: { id: classId, is_deleted: false },
    });
    if (!cls) throw new NotFoundException('الحصة غير موجودة');

    const entitlement = await this.entitlement.validate({
      memberId,
      branchId: cls.branch_id,
      blockOnOutstanding: !options?.force,
      requireActiveSubscription: true,
    });

    if (!entitlement.allowed && !options?.force) {
      throw new BadRequestException({
        message: 'العضو غير مؤهل للتسجيل في الحصة',
        entitlement,
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const member = await tx.club_members.findFirst({
        where: { id: memberId, is_deleted: false },
      });
      if (!member) throw new NotFoundException('العضو غير موجود');

      const activeCount = await this.countActiveEnrollments(classId, tx);
      if (activeCount >= cls.max_capacity) {
        if (options?.waitlistIfFull) {
          return this.addToWaitlist(classId, memberId, tx);
        }
        throw new BadRequestException({
          message: 'الحصة ممتلئة',
          code: 'CLASS_FULL',
          waitlistAvailable: true,
        });
      }

      const existing = await tx.club_class_enrollments.findUnique({
        where: { class_id_member_id: { class_id: classId, member_id: memberId } },
      });

      if (existing && isActiveEnrollment(existing.attendance_status)) {
        throw new ConflictException('العضو مسجل بالفعل في هذه الحصة');
      }

      const today = localDateString();
      if (existing) {
        await tx.club_class_enrollments.update({
          where: { id: existing.id },
          data: {
            enrollment_date: today,
            attendance_status: 'registered',
            attendance_time: null,
          },
        });
      } else {
        await tx.club_class_enrollments.create({
          data: {
            class_id: classId,
            member_id: memberId,
            enrollment_date: today,
            attendance_status: 'registered',
          },
        });
      }

      const result = await this.findOne(classId);
      // Conservative child guard: never block, only surface a warning when the member's card
      // number carries the child marker '-C'.
      const isChild = (member.card_number ?? '').includes('-C');
      return isChild
        ? { ...result, warning: 'العضو طفل (بطاقة تحتوي على -C) — يرجى المراجعة' }
        : result;
    });
  }

  private async addToWaitlist(classId: number, memberId: number, tx: Prisma.TransactionClient) {
    const existing = await tx.club_class_waitlist.findUnique({
      where: { class_id_member_id: { class_id: classId, member_id: memberId } },
    });
    if (existing && existing.status === 'waiting') {
      throw new ConflictException('العضو موجود بالفعل في قائمة الانتظار');
    }

    const count = await tx.club_class_waitlist.count({
      where: { class_id: classId, status: 'waiting' },
    });

    const row = existing
      ? await tx.club_class_waitlist.update({
          where: { id: existing.id },
          data: { status: 'waiting', position: count + 1 },
        })
      : await tx.club_class_waitlist.create({
          data: {
            class_id: classId,
            member_id: memberId,
            position: count + 1,
            status: 'waiting',
          },
        });

    return { waitlisted: true, position: row.position, classId, memberId };
  }

  async listWaitlist(classId: number) {
    const rows = await this.prisma.club_class_waitlist.findMany({
      where: { class_id: classId, status: 'waiting' },
      orderBy: { position: 'asc' },
    });
    const memberIds = rows.map((r) => r.member_id);
    const members =
      memberIds.length > 0
        ? await this.prisma.club_members.findMany({
            where: { id: { in: memberIds } },
            select: { id: true, name: true, member_code: true, phone: true },
          })
        : [];
    const byId = new Map(members.map((m) => [m.id, m]));
    return rows.map((r) => ({
      id: r.id,
      memberId: r.member_id,
      position: r.position,
      member: byId.get(r.member_id) ?? null,
      createdAt: r.created_at,
    }));
  }

  async removeFromWaitlist(classId: number, memberId: number) {
    await this.prisma.club_class_waitlist.updateMany({
      where: { class_id: classId, member_id: memberId, status: 'waiting' },
      data: { status: 'cancelled' },
    });
    return { success: true };
  }

  private async promoteWaitlist(classId: number, tx: Prisma.TransactionClient) {
    const next = await tx.club_class_waitlist.findFirst({
      where: { class_id: classId, status: 'waiting' },
      orderBy: { position: 'asc' },
    });
    if (!next) return;

    const cls = await tx.club_classes.findUnique({ where: { id: classId } });
    if (!cls) return;

    const activeCount = await this.countActiveEnrollments(classId, tx);
    if (activeCount >= cls.max_capacity) return;

    const today = localDateString();
    const existing = await tx.club_class_enrollments.findUnique({
      where: { class_id_member_id: { class_id: classId, member_id: next.member_id } },
    });

    if (existing) {
      await tx.club_class_enrollments.update({
        where: { id: existing.id },
        data: { enrollment_date: today, attendance_status: 'registered' },
      });
    } else {
      await tx.club_class_enrollments.create({
        data: {
          class_id: classId,
          member_id: next.member_id,
          enrollment_date: today,
          attendance_status: 'registered',
        },
      });
    }

    await tx.club_class_waitlist.update({
      where: { id: next.id },
      data: { status: 'promoted' },
    });
  }

  async unenrollMember(classId: number, memberId: number) {
    const enrollment = await this.prisma.club_class_enrollments.findUnique({
      where: { class_id_member_id: { class_id: classId, member_id: memberId } },
    });
    if (!enrollment || !isActiveEnrollment(enrollment.attendance_status)) {
      throw new NotFoundException('العضو غير مسجل في هذه الحصة');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.club_class_enrollments.update({
        where: { id: enrollment.id },
        data: { attendance_status: 'cancelled' },
      });
      await this.promoteWaitlist(classId, tx);
    });

    return this.findOne(classId);
  }

  async updateAttendance(
    classId: number,
    memberId: number,
    body: { attendanceStatus?: string; attendanceTime?: string },
  ) {
    const enrollment = await this.prisma.club_class_enrollments.findUnique({
      where: { class_id_member_id: { class_id: classId, member_id: memberId } },
    });
    if (!enrollment || !isActiveEnrollment(enrollment.attendance_status)) {
      throw new NotFoundException('العضو غير مسجل في هذه الحصة');
    }

    // Detect the transition INTO 'attended' (was something else, now becomes 'attended'). Only on
    // that transition do we consume one session from the member's active session-linked plan.
    const newlyAttended =
      body.attendanceStatus === 'attended' && enrollment.attendance_status !== 'attended';

    await this.prisma.$transaction(async (tx) => {
      await tx.club_class_enrollments.update({
        where: { id: enrollment.id },
        data: {
          ...(body.attendanceStatus != null ? { attendance_status: body.attendanceStatus as Prisma.EnumClubFitnessEnrollmentStatusFieldUpdateOperationsInput['set'] } : {}),
          ...(body.attendanceTime !== undefined ? { attendance_time: body.attendanceTime || null } : {}),
        },
      });

      if (newlyAttended) {
        await this.consumeSessionOnAttendance(memberId, tx);
      }
    });

    return this.findOne(classId);
  }

  /**
   * On a newly-attended class, consume one session from the member's active session-linked
   * subscription. Guards: only a subscription that is linked to sessions, active, and still has
   * remaining sessions (sessions_used < sessions_count) is touched; exactly one increment. If no
   * eligible subscription exists, do nothing (attendance is still recorded).
   */
  private async consumeSessionOnAttendance(memberId: number, tx: Prisma.TransactionClient) {
    const sub = await tx.club_subscriptions.findFirst({
      where: {
        member_id: memberId,
        status: 'active',
        is_linked_to_sessions: true,
        sessions_count: { not: null },
      },
      orderBy: { subscription_end_date: 'asc' },
    });
    if (!sub || sub.sessions_count == null) return;
    if (sub.sessions_used >= sub.sessions_count) return;

    await tx.club_subscriptions.update({
      where: { id: sub.id },
      data: { sessions_used: { increment: 1 } },
    });
  }
}
