import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { paginated } from '../../common/dto/list-result';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtUser } from '../../common/types/jwt-user';
import { ListFreePrivateTrainingDto } from './dto/list-free-private-training.dto';

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

function benefitKeyFromName(name: string) {
  const normalizedName = name.trim().toLocaleLowerCase();
  return Object.entries(benefitAliases).find(([, aliases]) =>
    aliases.some((alias) => normalizedName.includes(alias.toLocaleLowerCase())),
  )?.[0];
}

function benefitKeyFromBooking(serviceName: string, category: string) {
  const namedKey = benefitKeyFromName(serviceName);
  if (namedKey) return namedKey;
  if (category === 'inbody') return 'inBody';
  if (category === 'nutrition') return 'nutritionSessions';
  if (category === 'personal_training') return 'ptSessions';
  if (category === 'class' || category === 'zumba') return 'fitnessSessions';
  return undefined;
}

@Injectable()
export class MosFreePrivateTrainingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branchScope: BranchScopeService,
  ) {}

  async list(q: ListFreePrivateTrainingDto, user?: JwtUser) {
    const and: Prisma.club_subscriptionsWhereInput[] = [{ benefits: { not: Prisma.JsonNull } }];
    const branches = this.branchScope.resolveListFilter(user, q.branchId);
    if (branches) and.push({ branch_id: { in: branches } });
    const search = q.search?.trim();
    if (search) {
      and.push({
        OR: [
          { customer_name: { contains: search } },
          { subscription_number: { contains: search } },
          { subscription_type: { contains: search } },
          { member: { member_code: { contains: search } } },
        ],
      });
    }

    const subscriptions = await this.prisma.club_subscriptions.findMany({
      where: { AND: and },
      orderBy: [{ registration_date: 'desc' }, { id: 'desc' }],
      include: {
        member: { select: { member_code: true, name: true, gender: true, trainer_id: true } },
      },
    });
    const rowsWithBenefits = subscriptions.filter((row) => {
      const benefits = row.benefits as Record<string, unknown> | null;
      return benefits && Object.values(benefits).some((value) => Number(value) > 0);
    });

    const memberIds = [...new Set(rowsWithBenefits.map((r) => r.member_id).filter((id): id is number => id != null))];
    const trainerIds = [...new Set(rowsWithBenefits.map((r) => r.member?.trainer_id).filter((id): id is number => id != null))];
    const salesIds = [...new Set(rowsWithBenefits.map((r) => r.sales_id).filter((id): id is number => id != null))];
    const firstSubscriptions: Array<{ id: number; member_id: number | null }> = memberIds.length
      ? await this.prisma.club_subscriptions.findMany({
            where: { member_id: { in: memberIds } },
            orderBy: [{ registration_date: 'asc' }, { id: 'asc' }],
            select: { id: true, member_id: true },
          })
      : [];
    const employees: Array<{ id: number; employee: string | null }> = trainerIds.length || salesIds.length
      ? await this.prisma.employees.findMany({
            where: { id: { in: [...new Set([...trainerIds, ...salesIds])] } },
            select: { id: true, employee: true },
          })
      : [];
    const firstIdByMember = new Map<number, number>();
    firstSubscriptions.forEach((row) => {
      if (row.member_id != null && !firstIdByMember.has(row.member_id)) firstIdByMember.set(row.member_id, row.id);
    });
    const employeeNameById = new Map<number, string | null>(employees.map((row) => [row.id, row.employee]));
    const data = rowsWithBenefits.map((row) => ({
      id: row.id,
      memberId: row.member_id,
      memberCode: row.member?.member_code ?? '—',
      memberName: row.member?.name ?? row.customer_name ?? '—',
      gender: row.member?.gender ?? row.gender ?? null,
      paymentDate: row.registration_date,
      startDate: row.subscription_start_date,
      subscriptionEndDate: row.subscription_end_date,
      subscriptionType: row.subscription_type ?? '—',
      membershipStatus: row.member_id != null && firstIdByMember.get(row.member_id) === row.id ? 'new' : 'renew',
      salesEmployee: row.sales_id ? employeeNameById.get(row.sales_id) ?? '—' : '—',
      trainer: row.member?.trainer_id ? employeeNameById.get(row.member.trainer_id) ?? '—' : '—',
      benefits: row.benefits as Record<string, number>,
      notes: row.free_benefit_notes ?? '',
    }));
    const pageRows = data.slice(q.skip, q.skip + q.take);
    const pageMemberIds = [...new Set(pageRows.map((row) => row.memberId).filter((id): id is number => id != null))];
    const firstStartDate = pageRows.reduce<string | undefined>(
      (first, row) => (!first || row.startDate < first ? row.startDate : first),
      undefined,
    );
    const lastEndDate = pageRows.reduce<string | undefined>(
      (last, row) => (!last || row.subscriptionEndDate > last ? row.subscriptionEndDate : last),
      undefined,
    );
    const [consumption, appointmentBookings, inbodyBookings, spaBookings, classBookings] =
      pageMemberIds.length && firstStartDate && lastEndDate
        ? await Promise.all([
            this.prisma.club_free_benefits.findMany({
              where: {
                member_id: { in: pageMemberIds },
                is_deleted: false,
                benefit_date: { gte: firstStartDate, lte: lastEndDate },
              },
              select: { member_id: true, benefit_name: true, benefit_date: true, quantity: true },
            }),
            this.prisma.club_bookings.findMany({
              where: {
                member_id: { in: pageMemberIds },
                status: 'completed',
                is_deleted: false,
              },
              select: {
                member_id: true,
                booking_date: true,
                service: { select: { name: true, category: true } },
              },
            }),
            this.prisma.club_inbody_bookings.findMany({
              where: {
                member_id: { in: pageMemberIds },
                status: 'completed',
                is_deleted: false,
              },
              select: { member_id: true, booking_date: true },
            }),
            this.prisma.club_spa_bookings.findMany({
              where: {
                member_id: { in: pageMemberIds },
                status: 'completed',
                is_active: true,
              },
              select: {
                member_id: true,
                booking_date: true,
                service: { select: { name: true } },
              },
            }),
            this.prisma.club_class_bookings.findMany({
              where: {
                member_id: { in: pageMemberIds },
                status: 'completed',
              },
              select: {
                member_id: true,
                slot: { select: { start_at: true } },
              },
            }),
          ])
        : [[], [], [], [], []];

    const result = pageRows.map(({ memberId, subscriptionEndDate, ...row }) => {
      const loggedBenefits: Record<string, number> = {};
      const bookedBenefits: Record<string, number> = {};
      if (memberId != null) {
        for (const item of consumption) {
          if (
            item.member_id !== memberId
            || item.benefit_date < row.startDate
            || item.benefit_date > subscriptionEndDate
          ) continue;
          const key = benefitKeyFromName(item.benefit_name);
          if (key) loggedBenefits[key] = (loggedBenefits[key] ?? 0) + (item.quantity ?? 1);
        }
        for (const booking of appointmentBookings) {
          if (booking.member_id !== memberId) continue;
          const key = benefitKeyFromBooking(booking.service.name, booking.service.category);
          if (key) bookedBenefits[key] = (bookedBenefits[key] ?? 0) + 1;
        }
        for (const booking of inbodyBookings) {
          if (booking.member_id === memberId) {
            bookedBenefits.inBody = (bookedBenefits.inBody ?? 0) + 1;
          }
        }
        for (const booking of spaBookings) {
          if (booking.member_id !== memberId) continue;
          const key = benefitKeyFromName(booking.service.name);
          if (key) bookedBenefits[key] = (bookedBenefits[key] ?? 0) + 1;
        }
        for (const booking of classBookings) {
          if (booking.member_id !== memberId) continue;
          bookedBenefits.fitnessSessions = (bookedBenefits.fitnessSessions ?? 0) + 1;
        }
      }
      const usedBenefits = Object.fromEntries(
        Object.keys(benefitAliases).map((key) => [
          key,
          Math.min(
            Number(row.benefits[key] ?? 0),
            Math.max(loggedBenefits[key] ?? 0, bookedBenefits[key] ?? 0),
          ),
        ]),
      );
      return { ...row, usedBenefits };
    });
    return paginated(result, data.length, q.page, q.pageSize);
  }

  async updateNotes(id: number, notes: string | undefined, user?: JwtUser) {
    const row = await this.prisma.club_subscriptions.findUnique({ where: { id }, select: { id: true, branch_id: true } });
    if (!row) throw new NotFoundException('Subscription not found');
    if (!this.branchScope.isBranchAllowed(user, row.branch_id)) throw new ForbiddenException('Branch access denied');
    return this.prisma.club_subscriptions.update({
      where: { id },
      data: { free_benefit_notes: notes?.trim() || null },
      select: { id: true, free_benefit_notes: true },
    });
  }
}
