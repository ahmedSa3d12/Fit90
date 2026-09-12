import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { JwtUser } from '../../common/types/jwt-user';
import { paginated } from '../../common/dto/list-result';
import { BusinessAuditService } from '../gym-ops/business-audit.service';
import { EntitlementService } from '../gym-ops/entitlement.service';
import { AutomationEngineService } from '../gym-ops/automation-engine.service';
import { localDateString } from './club-member.utils';
import { CheckInDto, CheckOutDto } from './dto/check-in.dto';
import { ListClubAttendanceDto } from './dto/list-club-attendance.dto';
import { ClubMembersService } from './club-members.service';

@Injectable()
export class ClubAttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly members: ClubMembersService,
    private readonly entitlement: EntitlementService,
    private readonly audit: BusinessAuditService,
    private readonly automation: AutomationEngineService,
    private readonly branchScope: BranchScopeService,
  ) {}

  private mapRow(row: {
    id: number;
    member_id: number;
    member_code: string;
    member_name: string;
    branch_id: number;
    check_in_time: Date;
    check_out_time: Date | null;
    attendance_date: string;
    status: string;
    duration: number | null;
    notes: string | null;
    created_by: number | null;
    created_at: Date;
  }) {
    return {
      id: row.id,
      memberId: row.member_id,
      memberCode: row.member_code,
      memberName: row.member_name,
      branchId: row.branch_id,
      checkInTime: row.check_in_time,
      checkOutTime: row.check_out_time,
      attendanceDate: row.attendance_date,
      status: row.status,
      duration: row.duration,
      notes: row.notes,
      createdBy: row.created_by,
      createdAt: row.created_at,
    };
  }

  async checkIn(dto: CheckInDto, userId: number) {
    const member = await this.members.resolveByIdOrCode(dto.memberId, dto.memberCode);
    const branchId = dto.branchId ?? member.branch_id;

    const entitlement = await this.entitlement.validate({
      memberId: member.id,
      branchId,
    });

    if (!entitlement.allowed && !dto.force) {
      throw new BadRequestException({
        message: 'لا يمكن تسجيل الدخول — تحقق من الاشتراك',
        entitlement,
      });
    }

    if (!entitlement.allowed && dto.force) {
      if (!dto.overrideReason?.trim()) {
        throw new BadRequestException('يجب إدخال سبب التجاوز عند تسجيل الدخول بالقوة');
      }
      await this.audit.log({
        entityType: 'club_member',
        entityId: member.id,
        action: 'check_in.override',
        actorUserId: userId,
        branchId,
        reason: dto.overrideReason.trim(),
        after: { entitlement },
      });
    }

    const today = localDateString();

    // Duplicate same-day check-in guard: a member may only be checked in ONCE per
    // day. Any prior check-in for today (whether still checked_in or already
    // checked_out) blocks a second check-in — unless `force` is passed. The
    // check-out flow is unaffected: checkOut() finds its own open record.
    const existing = await this.prisma.club_attendance.findFirst({
      where: {
        member_id: member.id,
        attendance_date: today,
      },
      orderBy: { check_in_time: 'desc' },
    });
    if (existing && !dto.force) {
      throw new BadRequestException({
        message:
          existing.status === 'checked_out'
            ? 'العضو سجّل حضوره بالفعل اليوم — استخدم "force" للسماح بتسجيل دخول إضافي'
            : 'العضو مسجل دخول بالفعل اليوم',
        data: this.mapRow(existing),
        entitlement,
      });
    }

    if (dto.consumeSession && entitlement.activeSubscription?.isLinkedToSessions) {
      const subId = entitlement.activeSubscription.id;
      const sub = await this.prisma.club_subscriptions.findUnique({ where: { id: subId } });
      if (sub) {
        const remaining = (sub.sessions_count ?? 0) - sub.sessions_used;
        if (remaining > 0) {
          await this.prisma.club_subscriptions.update({
            where: { id: subId },
            data: { sessions_used: { increment: 1 } },
          });
        }
      }
    }

    const row = await this.prisma.club_attendance.create({
      data: {
        member_id: member.id,
        member_code: member.member_code,
        member_name: member.name,
        branch_id: branchId,
        attendance_date: today,
        status: 'checked_in',
        notes: dto.notes || null,
        created_by: userId,
      },
    });

    await this.audit.log({
      entityType: 'club_attendance',
      entityId: row.id,
      action: 'check_in',
      actorUserId: userId,
      branchId,
      after: this.mapRow(row),
    });

    void this.automation.emit('member_checked_in', {
      memberId: member.id,
      branchId,
      memberName: member.name,
    });

    return {
      attendance: this.mapRow(row),
      entitlement,
      overridden: Boolean(dto.force && !entitlement.allowed),
    };
  }

  async checkOut(dto: CheckOutDto, userId?: number) {
    const today = localDateString();
    let row;

    if (dto.attendanceId) {
      row = await this.prisma.club_attendance.findUnique({ where: { id: dto.attendanceId } });
    } else {
      const member = await this.members.resolveByIdOrCode(dto.memberId, dto.memberCode);
      row = await this.prisma.club_attendance.findFirst({
        where: { member_id: member.id, attendance_date: today, status: 'checked_in' },
        orderBy: { check_in_time: 'desc' },
      });
    }

    if (!row) throw new NotFoundException('لا يوجد تسجيل دخول مفتوح لهذا العضو اليوم');
    if (row.status === 'checked_out') throw new BadRequestException('تم تسجيل الخروج مسبقاً');

    const checkOutTime = new Date();
    const duration = Math.floor((checkOutTime.getTime() - row.check_in_time.getTime()) / 60000);

    const updated = await this.prisma.club_attendance.update({
      where: { id: row.id },
      data: { check_out_time: checkOutTime, status: 'checked_out', duration },
    });

    await this.audit.log({
      entityType: 'club_attendance',
      entityId: updated.id,
      action: 'check_out',
      actorUserId: userId,
      branchId: updated.branch_id,
      after: this.mapRow(updated),
    });

    return this.mapRow(updated);
  }

  async list(q: ListClubAttendanceDto, user?: JwtUser) {
    const and: Prisma.club_attendanceWhereInput[] = [];

    if (q.memberId) and.push({ member_id: Number(q.memberId) });
    // Branch isolation: intersect requested branch with the caller's scope.
    const branchIds = this.branchScope.resolveListFilter(user, q.branch ?? null);
    if (branchIds !== null) and.push({ branch_id: { in: branchIds } });
    if (q.startDate && q.endDate) {
      and.push({ attendance_date: { gte: q.startDate, lte: q.endDate } });
    } else if (q.startDate) {
      and.push({ attendance_date: { gte: q.startDate } });
    } else if (q.endDate) {
      and.push({ attendance_date: { lte: q.endDate } });
    }
    if (q.status && q.status !== 'all') and.push({ status: q.status as 'checked_in' | 'checked_out' });
    if (q.search?.trim()) {
      const s = q.search.trim();
      and.push({
        OR: [{ member_name: { contains: s } }, { member_code: { contains: s } }],
      });
    }

    const where: Prisma.club_attendanceWhereInput = and.length ? { AND: and } : {};

    const [rows, total] = await Promise.all([
      this.prisma.club_attendance.findMany({
        where,
        orderBy: { check_in_time: 'desc' },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.club_attendance.count({ where }),
    ]);

    return paginated(rows.map((r) => this.mapRow(r)), total, q.page, q.pageSize);
  }

  async statistics(query: { branch?: string; startDate?: string; endDate?: string }) {
    const and: Prisma.club_attendanceWhereInput[] = [];
    if (query.branch && query.branch !== 'all') and.push({ branch_id: Number(query.branch) });
    if (query.startDate && query.endDate) {
      and.push({ attendance_date: { gte: query.startDate, lte: query.endDate } });
    }
    const where: Prisma.club_attendanceWhereInput = and.length ? { AND: and } : {};

    const today = localDateString();

    const [totalRecords, todayCheckIns, todayCheckOuts, activeCheckIns, membersByDate] =
      await Promise.all([
        this.prisma.club_attendance.count({ where }),
        this.prisma.club_attendance.count({
          where: { ...where, attendance_date: today, status: 'checked_in' },
        }),
        this.prisma.club_attendance.count({
          where: { ...where, attendance_date: today, status: 'checked_out' },
        }),
        this.prisma.club_attendance.count({
          where: { ...where, status: 'checked_in' },
        }),
        this.prisma.$queryRaw<{ date: string; count: bigint }[]>`
          SELECT attendance_date AS date, COUNT(DISTINCT member_id) AS count
          FROM club_attendance
          WHERE attendance_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
          GROUP BY attendance_date
          ORDER BY attendance_date DESC
        `,
      ]);

    return {
      totalRecords,
      todayCheckIns,
      todayCheckOuts,
      activeCheckIns,
      membersByDate: membersByDate.map((r) => ({
        date: r.date,
        count: Number(r.count),
      })),
    };
  }
}
