import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { paginated } from '../../common/dto/list-result';
import { retryOnUniqueViolation } from '../../common/retry-unique';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { JwtUser } from '../../common/types/jwt-user';
import { assertDateOrder } from '../../common/validators';
import { assertMemberExists, localDateString } from '../club-members/club-member.utils';
import { BusinessAuditService } from '../gym-ops/business-audit.service';
import { AutomationEngineService } from '../gym-ops/automation-engine.service';
import { ClubSubscriptionAccountingService } from './club-subscription-accounting.service';
import { ClubReceiptsService } from './club-receipts.service';
import {
  addDays,
  daysBetween,
  deriveSubStatus,
  isOpenEndedEndDate,
  netValue,
  nextSeqFromMax,
  remainingAmount,
  resolveSubscriptionEndDate,
  deriveSessionAwareStatus,
  toClubPaymentMethod,
  toNum,
} from './club-subscription.utils';
import { ListClubSubscriptionsDto } from './dto/list-club-subscriptions.dto';
import { UpsertClubSubscriptionDto } from './dto/upsert-club-subscription.dto';

@Injectable()
export class ClubSubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly receipts: ClubReceiptsService,
    private readonly accounting: ClubSubscriptionAccountingService,
    private readonly audit: BusinessAuditService,
    private readonly automation: AutomationEngineService,
    private readonly branchScope: BranchScopeService,
  ) {}

  private mapSub(
    row: Record<string, unknown>,
    extras?: { salesName?: string | null; createdByName?: string | null },
  ) {
    const member = row.member as { phone?: string | null } | null | undefined;
    const start = row.subscription_start_date as string;
    const end = row.subscription_end_date as string;
    // A frozen subscription must report as frozen regardless of its date range (the stored status
    // column is authoritative for the frozen state; date-derived status applies to the rest).
    const status =
      row.status === 'frozen'
        ? 'frozen'
        : deriveSessionAwareStatus({
            startDate: start,
            endDate: end,
            isLinkedToSessions: !!row.is_linked_to_sessions,
            sessionsCount: row.sessions_count as number | null,
            sessionsUsed: row.sessions_used as number | null,
          });
    return {
      id: row.id,
      subscriptionNumber: row.subscription_number,
      registrationDate: row.registration_date,
      branchId: row.branch_id,
      memberId: row.member_id,
      customerName: row.customer_name,
      customerPhone: member?.phone ?? null,
      memberCode: (member as any)?.member_code ?? null,
      subscriptionTypeId: row.subscription_type_id,
      subscriptionType: row.subscription_type,
      subscriptionStartDate: start,
      subscriptionEndDate: end,
      subscriptionValue: toNum(row.subscription_value),
      discountEnabled: row.discount_enabled,
      discountValue: toNum(row.discount_value),
      paidAmount: toNum(row.paid_amount),
      remainingAmount: toNum(row.remaining_amount),
      gender: row.gender,
      employeeId: row.employee_id,
      salesId: row.sales_id,
      salesName: extras?.salesName ?? null,
      paymentMethod: row.payment_method,
      receiptNumber: row.receipt_number,
      customerSourceId: row.customer_source_id,
      guardianName: row.guardian_name,
      guardianPhone: row.guardian_phone,
      status,
      isSpecial: row.is_special,
      isLinkedToSessions: row.is_linked_to_sessions,
      sessionsCount: row.sessions_count,
      sessionsUsed: row.sessions_used,
      allowMultipleDailyEntries: row.allow_multiple_daily_entries,
      isTimeBased: row.is_time_based,
      timeFrom: row.time_from,
      timeTo: row.time_to,
      benefits: row.benefits && typeof row.benefits === 'object' ? row.benefits : {},
      createdByUserId: row.created_by ?? null,
      createdByName: extras?.createdByName ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private async enrichSubNames(rows: Array<{ sales_id: number | null; created_by: number | null }>) {
    const salesIds = [...new Set(rows.map((r) => r.sales_id).filter((id): id is number => id != null))];
    const userIds = [...new Set(rows.map((r) => r.created_by).filter((id): id is number => id != null))];
    const [salesEmps, users] = await Promise.all([
      salesIds.length
        ? this.prisma.employees.findMany({
            where: { id: { in: salesIds } },
            select: { id: true, employee: true },
          })
        : [],
      userIds.length
        ? this.prisma.users.findMany({
            where: { user_id: { in: userIds } },
            select: { user_id: true, name: true },
          })
        : [],
    ]);
    return {
      salesNameById: new Map<number, string | null>(
        salesEmps.map((e) => [e.id, e.employee ?? null] as const),
      ),
      userNameById: new Map<number, string | null>(
        users.map((u) => [u.user_id, u.name ?? null] as const),
      ),
    };
  }

  private specialSubscriptionFilter(): Prisma.club_subscriptionsWhereInput {
    return {
      OR: [{ is_special: true }, { type: { is_special_offer: true } }],
    };
  }

  private assertBranchAccess(user: JwtUser | undefined, branchId: number) {
    if (!this.branchScope.isBranchAllowed(user, branchId)) {
      throw new ForbiddenException('لا تملك صلاحية الوصول لبيانات هذا الفرع');
    }
  }

  async list(q: ListClubSubscriptionsDto, user?: JwtUser) {
    const and: Prisma.club_subscriptionsWhereInput[] = [];

    if (q.search?.trim()) {
      // Phone numbers are stored with Western digits, while staff may enter Arabic-Indic
      // digits from an Arabic keyboard. Normalize the query before matching either form.
      const s = q.search
        .trim()
        .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));
      and.push({
        OR: [
          { customer_name: { contains: s } },
          { subscription_number: { contains: s } },
          { subscription_type: { contains: s } },
          { receipt_number: { contains: s } },
          { member: { phone: { contains: s } } },
        ],
      });
    }
    if (q.branch && q.branch !== 'all') and.push({ branch_id: Number(q.branch) });
    // Default a branch-scoped user to their allowed branches (intersects any explicit filter).
    const scope = this.branchScope.resolveListFilter(user, q.branch ?? null);
    if (scope !== null) and.push({ branch_id: { in: scope } });
    if (q.subscriptionType) and.push({ subscription_type: { contains: q.subscriptionType } });
    if (q.memberId) and.push({ member_id: Number(q.memberId) });
    if (q.memberName) and.push({ customer_name: { contains: q.memberName } });
    if (q.receiptNumber) and.push({ receipt_number: { contains: q.receiptNumber } });
    if (q.isSpecial === 'true' || q.isSpecial === '1') and.push(this.specialSubscriptionFilter());
    if (q.isSpecial === 'false' || q.isSpecial === '0') {
      and.push({
        AND: [
          { is_special: false },
          { OR: [{ subscription_type_id: null }, { type: { is_special_offer: false } }] },
        ],
      });
    }
    if (q.hasDiscount === 'true' || q.hasDiscount === '1') and.push({ discount_enabled: true });
    if (q.isTimeBased === 'true' || q.isTimeBased === '1') and.push({ is_time_based: true });
    if (q.endDateFrom) and.push({ subscription_end_date: { gte: q.endDateFrom } });
    if (q.endDateTo) and.push({ subscription_end_date: { lte: q.endDateTo } });
    if (q.startDateFrom) and.push({ subscription_start_date: { gte: q.startDateFrom } });
    if (q.startDateTo) and.push({ subscription_start_date: { lte: q.startDateTo } });
    if (q.expiresWithinDays) {
      const days = Number(q.expiresWithinDays);
      if (Number.isFinite(days) && days >= 0) {
        const today = localDateString();
        const target = new Date();
        target.setDate(target.getDate() + days);
        const targetIso = target.toISOString().slice(0, 10);
        and.push({ subscription_end_date: { gte: today, lte: targetIso } });
      }
    }

    // Translate the derived-status filter into date predicates so it runs in SQL BEFORE
    // pagination — filtering an already-paginated page corrupts both the page and the total.
    // Mirrors deriveSubStatus: upcoming = start > today, expired = end < today, active otherwise.
    if (q.status && q.status !== 'all') {
      const today = localDateString();
      if (q.status === 'frozen') {
        // Frozen is a stored-column state, not a date-derived one.
        and.push({ status: 'frozen' });
      } else if (q.status === 'upcoming') {
        and.push({ subscription_start_date: { gt: today }, status: { not: 'frozen' } });
      } else if (q.status === 'expired') {
        and.push({ subscription_end_date: { lt: today }, status: { not: 'frozen' } });
      } else if (q.status === 'active') {
        and.push({
          subscription_start_date: { lte: today },
          subscription_end_date: { gte: today },
          status: { not: 'frozen' },
        });
      }
    }

    const where: Prisma.club_subscriptionsWhereInput = and.length ? { AND: and } : {};

    const [rows, total] = await Promise.all([
      this.prisma.club_subscriptions.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: q.skip,
        take: q.take,
        include: { member: { select: { phone: true, member_code: true } } },
      }),
      this.prisma.club_subscriptions.count({ where }),
    ]);

    const { salesNameById, userNameById } = await this.enrichSubNames(rows);
    const data = rows.map((r) =>
      this.mapSub(r, {
        salesName: r.sales_id ? salesNameById.get(r.sales_id) ?? null : null,
        createdByName: r.created_by ? userNameById.get(r.created_by) ?? null : null,
      }),
    );
    return paginated(data, total, q.page, q.pageSize);
  }

  async findOne(id: number, user?: JwtUser) {
    const row = await this.prisma.club_subscriptions.findUnique({
      where: { id },
      include: { member: { select: { phone: true, member_code: true } } },
    });
    if (!row) throw new NotFoundException('الاشتراك غير موجود');
    this.assertBranchAccess(user, row.branch_id);
    return this.mapSub(row);
  }

  private async generateSubNumber(): Promise<string> {
    // Serialize concurrent creates on a named advisory lock so two requests can't read the same
    // MAX and mint the same SUB###### (same pattern as club-lockers' generateLockNumber). Runs in
    // a transaction so GET_LOCK/RELEASE_LOCK hit the same pooled connection.
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT GET_LOCK('club_sub_number', 10)`;
      try {
        const rows = await tx.$queryRaw<{ maxNum: number | null }[]>`
          SELECT MAX(CAST(SUBSTRING(subscription_number, 4) AS UNSIGNED)) AS maxNum
          FROM club_subscriptions WHERE subscription_number LIKE 'SUB%'
        `;
        const next = nextSeqFromMax(rows[0]?.maxNum);
        return `SUB${String(next).padStart(6, '0')}`;
      } finally {
        await tx.$queryRaw`SELECT RELEASE_LOCK('club_sub_number')`;
      }
    });
  }

  /**
   * Subscription number for a member mirrors the member's own code (e.g. member A000123 →
   * subscription A000123). Because a member can hold several subscriptions over time (a new row
   * per renewal-as-new / re-subscribe) and subscription_number is unique, the first one takes the
   * bare member code and each subsequent one gets a `-N` suffix (A000123-2, A000123-3 …).
   * Walk-ins with no member fall back to the sequential SUB###### format.
   */
  private async generateSubNumberForMember(memberId: number | null): Promise<string> {
    if (memberId == null) return this.generateSubNumber();
    const member = await this.prisma.club_members.findUnique({
      where: { id: memberId },
      select: { member_code: true },
    });
    const code = member?.member_code?.trim();
    if (!code) return this.generateSubNumber();

    // Serialize on the same advisory lock generateSubNumber uses so concurrent creates for the
    // same member can't both read the same set and mint a duplicate number.
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT GET_LOCK('club_sub_number', 10)`;
      try {
        const taken = await tx.club_subscriptions.findMany({
          where: {
            OR: [{ subscription_number: code }, { subscription_number: { startsWith: `${code}-` } }],
          },
          select: { subscription_number: true },
        });
        const used = new Set(taken.map((r) => r.subscription_number));
        if (!used.has(code)) return code;
        let n = 2;
        while (used.has(`${code}-${n}`)) n += 1;
        return `${code}-${n}`;
      } finally {
        await tx.$queryRaw`SELECT RELEASE_LOCK('club_sub_number')`;
      }
    });
  }

  async create(dto: UpsertClubSubscriptionDto, userId: number) {
    let data = { ...dto };

    // Short format: startDate + subscriptionTypeId + memberId
    if (data.startDate && data.subscriptionTypeId && data.memberId && !data.subscriptionEndDate) {
      const member = await assertMemberExists(this.prisma, data.memberId).catch((e) => {
        throw new BadRequestException(e.message);
      });
      const type = await this.prisma.club_subscription_types.findUnique({ where: { id: data.subscriptionTypeId } });
      if (!type) throw new BadRequestException('نوع الاشتراك غير موجود');
      const mem = await this.prisma.club_members.findUnique({ where: { id: member.id } });
      data = {
        ...data,
        customerName: data.customerName ?? member.name,
        subscriptionValue: toNum(type.price),
        subscriptionType: type.name,
        subscriptionStartDate: data.startDate,
        subscriptionEndDate: resolveSubscriptionEndDate(
          data.startDate,
          type.days,
          type.is_linked_to_sessions,
        ),
        isLinkedToSessions: type.is_linked_to_sessions,
        sessionsCount: type.sessions_count ?? undefined,
        allowMultipleDailyEntries: type.allow_multiple_daily_entries,
        gender: data.gender ?? mem?.gender ?? undefined,
        guardianName: data.guardianName ?? mem?.guardian_name ?? undefined,
        guardianPhone: data.guardianPhone ?? mem?.guardian_phone ?? undefined,
        employeeId: data.employeeId ?? mem?.employee_id ?? undefined,
        salesId: data.salesId ?? mem?.sales_id ?? undefined,
        isSpecial: data.isSpecial ?? type.is_special_offer,
        benefits:
          data.benefits ??
          (type.benefits && typeof type.benefits === 'object'
            ? (type.benefits as Record<string, number>)
            : {}),
      };
      if (mem) data.branchId = mem.branch_id;
    }

    if (!data.branchId || !data.customerName || !data.subscriptionStartDate || !data.subscriptionEndDate) {
      throw new BadRequestException('الحقول المطلوبة: الفرع، اسم العميل، تاريخ البداية والنهاية');
    }

    // Session packages (حصص) never expire by calendar — force open-ended end date.
    if (data.isLinkedToSessions) {
      data.subscriptionEndDate = resolveSubscriptionEndDate(
        data.subscriptionStartDate,
        0,
        true,
      );
    }

    assertDateOrder(data.subscriptionStartDate, data.subscriptionEndDate);

    if (data.isSpecial === undefined && data.subscriptionTypeId) {
      const typeRow = await this.prisma.club_subscription_types.findUnique({
        where: { id: data.subscriptionTypeId },
        select: { is_special_offer: true },
      });
      if (typeRow) data.isSpecial = typeRow.is_special_offer;
    }

    // Snapshot the package's multiple-daily-entries policy onto the subscription
    // so check-in reads it per-subscription (matches is_linked_to_sessions handling).
    if (data.allowMultipleDailyEntries === undefined && data.subscriptionTypeId) {
      const typeRow = await this.prisma.club_subscription_types.findUnique({
        where: { id: data.subscriptionTypeId },
        select: { allow_multiple_daily_entries: true },
      });
      if (typeRow) data.allowMultipleDailyEntries = typeRow.allow_multiple_daily_entries;
    }

    if (data.memberId) {
      await assertMemberExists(this.prisma, data.memberId).catch((e) => {
        throw new BadRequestException(e.message);
      });
    }

    const subValue = data.subscriptionValue ?? 0;
    const discountEnabled = data.discountEnabled ?? false;
    const discount = data.discountValue ?? 0;
    const paid = data.paidAmount ?? 0;

    if (discountEnabled && discount > subValue) {
      throw new BadRequestException('قيمة الخصم لا يمكن أن تتجاوز قيمة الاشتراك');
    }
    const netAfterDiscount = subValue - (discountEnabled ? discount : 0);
    if (paid > netAfterDiscount) {
      throw new BadRequestException('المبلغ المدفوع لا يمكن أن يتجاوز الصافي بعد الخصم');
    }

    // remaining honors discountEnabled (raw subValue−discount−paid double-counts a disabled discount).
    const remaining = remainingAmount(subValue, discountEnabled, discount, paid);

    // Overlapping live subscriptions are allowed (e.g. sessions package + monthly membership).

    const subNumber = await this.generateSubNumberForMember(data.memberId ?? null);
    const status = deriveSessionAwareStatus({
      startDate: data.subscriptionStartDate,
      endDate: data.subscriptionEndDate,
      isLinkedToSessions: !!data.isLinkedToSessions,
      sessionsCount: data.sessionsCount ?? null,
      sessionsUsed: 0,
    });
    const packagePoints = data.memberId && data.subscriptionTypeId
      ? (await this.prisma.club_subscription_types.findUnique({
          where: { id: data.subscriptionTypeId },
          select: { wallet_points: true },
        }))?.wallet_points ?? 0
      : 0;

    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.club_subscriptions.create({
        data: {
          subscription_number: subNumber,
          registration_date: data.registrationDate ?? localDateString(),
          branch_id: data.branchId!,
          member_id: data.memberId ?? null,
          customer_name: data.customerName!,
          subscription_type_id: data.subscriptionTypeId ?? null,
          subscription_type: data.subscriptionType ?? null,
          subscription_start_date: data.subscriptionStartDate!,
          subscription_end_date: data.subscriptionEndDate!,
          subscription_value: subValue,
          discount_enabled: discountEnabled,
          discount_value: discount,
          paid_amount: paid,
          remaining_amount: remaining,
          gender: data.gender ?? null,
          employee_id: data.employeeId ?? null,
          sales_id: data.salesId ?? null,
          payment_method: data.paymentMethod ?? null,
          customer_source_id: data.customerSourceId ?? null,
          guardian_name: data.guardianName ?? null,
          guardian_phone: data.guardianPhone ?? null,
          status,
          is_special: data.isSpecial ?? false,
          is_linked_to_sessions: data.isLinkedToSessions ?? false,
          sessions_count: data.sessionsCount ?? null,
          sessions_used: 0,
          allow_multiple_daily_entries: data.allowMultipleDailyEntries ?? false,
          is_time_based: data.isTimeBased ?? false,
          time_from: data.timeFrom ?? null,
          time_to: data.timeTo ?? null,
          benefits: data.benefits ?? {},
          created_by: userId,
        },
      });

      if (paid > 0) {
        const receipt = await this.receipts.createForSubscription(
          created.id,
          paid,
          {
            memberName: data.customerName!,
            memberId: data.memberId,
            paymentMethod: data.paymentMethod,
          },
          tx,
        );
        await this.accounting.postJournal(
          {
            subscriptionNumber: subNumber,
            sourceDocId: receipt?.receipt_number ?? subNumber,
            paidAmount: paid,
            subscriptionValue: subValue,
            discountValue: discount,
            discountEnabled,
            paymentMethod: data.paymentMethod,
            branchId: data.branchId!,
            createdBy: userId,
            registrationDate: created.registration_date,
            kind: 'subscription',
          },
          tx,
        );
      }

      if (created.member_id && packagePoints > 0) {
        await tx.club_member_points_transactions.upsert({
          where: { event_key: `subscription:${created.id}:purchase` },
          create: {
            member_id: created.member_id,
            subscription_id: created.id,
            points: packagePoints,
            transaction_type: 'earn',
            source: 'subscription_purchase',
            event_key: `subscription:${created.id}:purchase`,
            description: `نقاط اشتراك ${created.subscription_type ?? created.subscription_number}`,
          },
          update: {},
        });
      }

      return created;
    }, { maxWait: 10000, timeout: 15000 });

    await this.audit.log({
      entityType: 'club_subscription',
      entityId: row.id,
      action: 'create',
      actorUserId: userId,
      branchId: data.branchId,
      after: {
        subscriptionNumber: subNumber,
        customerName: data.customerName,
        memberId: data.memberId,
        subscriptionValue: subValue,
        paidAmount: paid,
      },
    });

    if (row.member_id) {
      await this.syncMemberProfileFromSubscription(row);
    }

    return this.findOne(row.id);
  }

  async update(id: number, dto: Partial<UpsertClubSubscriptionDto>, user?: JwtUser) {
    const existing = await this.prisma.club_subscriptions.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('الاشتراك غير موجود');
    this.assertBranchAccess(user, existing.branch_id);

    const start = dto.subscriptionStartDate ?? existing.subscription_start_date;
    let end = dto.subscriptionEndDate ?? existing.subscription_end_date;
    const linkedToSessions =
      dto.isLinkedToSessions !== undefined ? dto.isLinkedToSessions : existing.is_linked_to_sessions;
    if (linkedToSessions) {
      end = resolveSubscriptionEndDate(start, 0, true);
    }
    const subValue = dto.subscriptionValue ?? toNum(existing.subscription_value);
    const discountEnabled = dto.discountEnabled ?? existing.discount_enabled;
    const discount = dto.discountValue ?? toNum(existing.discount_value);
    const paid = toNum(existing.paid_amount);

    const row = await this.prisma.club_subscriptions.update({
      where: { id },
      data: {
        ...(dto.customerName != null ? { customer_name: dto.customerName } : {}),
        ...(dto.subscriptionStartDate != null ? { subscription_start_date: dto.subscriptionStartDate } : {}),
        ...(linkedToSessions || dto.subscriptionEndDate != null
          ? { subscription_end_date: end }
          : {}),
        ...(dto.subscriptionValue != null ? { subscription_value: dto.subscriptionValue } : {}),
        ...(dto.discountEnabled !== undefined ? { discount_enabled: dto.discountEnabled } : {}),
        ...(dto.discountValue !== undefined ? { discount_value: dto.discountValue } : {}),
        ...(dto.subscriptionType != null ? { subscription_type: dto.subscriptionType } : {}),
        ...(dto.subscriptionTypeId !== undefined ? { subscription_type_id: dto.subscriptionTypeId } : {}),
        ...(dto.employeeId !== undefined ? { employee_id: dto.employeeId } : {}),
        ...(dto.salesId !== undefined ? { sales_id: dto.salesId } : {}),
        ...(dto.paymentMethod !== undefined ? { payment_method: dto.paymentMethod } : {}),
        ...(dto.customerSourceId !== undefined ? { customer_source_id: dto.customerSourceId } : {}),
        ...(dto.guardianName !== undefined ? { guardian_name: dto.guardianName } : {}),
        ...(dto.guardianPhone !== undefined ? { guardian_phone: dto.guardianPhone } : {}),
        ...(dto.isSpecial !== undefined ? { is_special: dto.isSpecial } : {}),
        ...(dto.isTimeBased !== undefined ? { is_time_based: dto.isTimeBased } : {}),
        ...(dto.timeFrom !== undefined ? { time_from: dto.timeFrom } : {}),
        ...(dto.timeTo !== undefined ? { time_to: dto.timeTo } : {}),
        ...(dto.benefits !== undefined ? { benefits: dto.benefits } : {}),
        ...(dto.isLinkedToSessions !== undefined ? { is_linked_to_sessions: dto.isLinkedToSessions } : {}),
        ...(dto.sessionsCount !== undefined ? { sessions_count: dto.sessionsCount } : {}),
        ...(dto.memberId !== undefined ? { member_id: dto.memberId } : {}),
        status: deriveSessionAwareStatus({
          startDate: start,
          endDate: end,
          isLinkedToSessions: linkedToSessions,
          sessionsCount:
            dto.sessionsCount !== undefined ? dto.sessionsCount : existing.sessions_count,
          sessionsUsed: existing.sessions_used,
        }),
        remaining_amount: remainingAmount(subValue, discountEnabled, discount, paid),
      },
    });

    await this.audit.log({
      entityType: 'club_subscription',
      entityId: id,
      action: 'update',
      branchId: existing.branch_id,
      before: this.mapSub(existing),
      after: this.mapSub(row),
    });

    if (row.member_id) {
      await this.syncMemberProfileFromSubscription(row);
    }

    return this.mapSub(row);
  }

  async remove(id: number, user?: JwtUser) {
    const existing = await this.prisma.club_subscriptions.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('الاشتراك غير موجود');
    this.assertBranchAccess(user, existing.branch_id);

    // A subscription with financial history (receipts) or an active/completed refund must not be
    // hard-deleted — deleting would orphan GL entries and drop the audit trail. Direct to refund.
    const [receiptCount, refundCount] = await Promise.all([
      this.prisma.club_receipts.count({ where: { subscription_id: id } }),
      this.prisma.club_subscription_refunds.count({
        where: { subscription_id: id, status: { not: 'cancelled' } },
      }),
    ]);
    if (receiptCount > 0 || refundCount > 0) {
      throw new BadRequestException(
        'لا يمكن حذف اشتراك له إيصالات أو عمليات استرداد — استخدم عملية الاسترداد بدلاً من الحذف',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.club_subscription_freezes.deleteMany({ where: { subscription_id: id } });
      await tx.club_subscriptions.delete({ where: { id } });
    });

    await this.audit.log({
      entityType: 'club_subscription',
      entityId: id,
      action: 'delete',
      branchId: existing.branch_id,
      before: this.mapSub(existing),
    });
    return { success: true };
  }

  async patchSessions(id: number, sessionsUsed: number, user?: JwtUser) {
    const sub = await this.prisma.club_subscriptions.findUnique({ where: { id } });
    if (!sub) throw new NotFoundException('الاشتراك غير موجود');
    this.assertBranchAccess(user, sub.branch_id);
    const max = sub.sessions_count;
    if (max != null && sessionsUsed > max) {
      throw new BadRequestException('عدد الحصص المستخدمة يتجاوز الحد المسموح');
    }
    const data: Prisma.club_subscriptionsUpdateInput = { sessions_used: sessionsUsed };
    if (sub.sessions_count == null) {
      let sessionsFromType = 10;
      if (sub.subscription_type_id) {
        const type = await this.prisma.club_subscription_types.findUnique({
          where: { id: sub.subscription_type_id },
        });
        if (type?.sessions_count != null) sessionsFromType = type.sessions_count;
      }
      data.sessions_count = sessionsFromType;
      data.is_linked_to_sessions = true;
    }
    const row = await this.prisma.club_subscriptions.update({ where: { id }, data });
    return this.mapSub(row);
  }

  async useSession(id: number, user?: JwtUser) {
    const sub = await this.prisma.club_subscriptions.findUnique({ where: { id } });
    if (!sub) throw new NotFoundException('الاشتراك غير موجود');
    this.assertBranchAccess(user, sub.branch_id);
    if (!sub.is_linked_to_sessions && sub.sessions_count == null) {
      throw new BadRequestException('هذا الاشتراك غير مرتبط بحصص');
    }
    const max = sub.sessions_count ?? 0;
    const used = sub.sessions_used ?? 0;
    if (max > 0 && used >= max) {
      throw new BadRequestException('لا توجد حصص متبقية');
    }
    const row = await this.prisma.club_subscriptions.update({
      where: { id },
      data: { sessions_used: used + 1, is_linked_to_sessions: true },
    });
    return this.mapSub(row);
  }

  async processPayment(id: number, paymentAmount: number, paymentMethod?: string, user?: JwtUser) {
    if (paymentAmount <= 0) throw new BadRequestException('مبلغ الدفع غير صالح');

    const { updated, receiptNumber, sub, prevRemaining, prevPaid } = await this.prisma.$transaction(
      async (tx) => {
        // Serialize concurrent installments on this subscription with a MySQL advisory lock (same
        // pattern as generateSubNumber). A plain findUnique is NOT a locking read, so without this
        // two concurrent payments could both pass the overpay guard and over-collect. GET_LOCK runs
        // on the tx's pooled connection; it is released when the tx connection is returned.
        await tx.$queryRaw`SELECT GET_LOCK(${`club_sub_pay_${id}`}, 10)`;
        try {
          const sub = await tx.club_subscriptions.findUnique({ where: { id } });
          if (!sub) throw new NotFoundException('الاشتراك غير موجود');
          this.assertBranchAccess(user, sub.branch_id);

          // Re-read remaining INSIDE the lock so a concurrent payment can't overshoot the balance.
          const prevRemaining = toNum(sub.remaining_amount);
          const prevPaid = toNum(sub.paid_amount);
          if (paymentAmount > prevRemaining) {
            throw new BadRequestException('مبلغ الدفع يتجاوز المبلغ المتبقي');
          }

          const receipt = await retryOnUniqueViolation(async () => {
          const receiptNumber = await this.receipts.nextReceiptNumber(tx);
          return tx.club_receipts.create({
            data: {
              receipt_number: receiptNumber,
              subscription_id: id,
              member_id: sub.member_id,
              member_name: sub.customer_name ?? '',
              amount: paymentAmount,
              type: sub.subscription_type,
              payment_method: toClubPaymentMethod(paymentMethod ?? sub.payment_method),
              receipt_date: localDateString(),
              status: 'مدفوعة',
              description: `سداد متبقي اشتراك - ${sub.subscription_type ?? ''}`,
            },
          });
        });

        // Recompute paid/remaining from the receipt ledger (single source of truth) within the tx.
        const agg = await tx.club_receipts.aggregate({
          where: { subscription_id: id },
          _sum: { amount: true },
        });
        const paid = toNum(agg._sum.amount);
        const remaining = remainingAmount(
          toNum(sub.subscription_value),
          sub.discount_enabled,
          toNum(sub.discount_value),
          paid,
        );
        const updated = await tx.club_subscriptions.update({
          where: { id },
          data: { paid_amount: paid, remaining_amount: remaining, receipt_number: receipt.receipt_number },
        });

        // GL: later installment — cash in = revenue, NO discount line (recognized once at creation).
        await this.accounting.postJournal(
          {
            subscriptionNumber: sub.subscription_number,
            sourceDocId: receipt.receipt_number,
            paidAmount: paymentAmount,
            subscriptionValue: toNum(sub.subscription_value),
            discountValue: toNum(sub.discount_value),
            discountEnabled: sub.discount_enabled,
            paymentMethod: paymentMethod ?? sub.payment_method ?? 'cash',
            branchId: sub.branch_id,
            createdBy: sub.created_by ?? undefined,
            kind: 'payment',
          },
          tx,
        );

          return { updated, receiptNumber: receipt.receipt_number, sub, prevRemaining, prevPaid };
        } finally {
          await tx.$queryRaw`SELECT RELEASE_LOCK(${`club_sub_pay_${id}`})`;
        }
      },
    );

    await this.audit.log({
      entityType: 'club_subscription',
      entityId: id,
      action: 'payment',
      branchId: sub.branch_id,
      before: { remainingAmount: prevRemaining, paidAmount: prevPaid },
      after: { paymentAmount, remainingAmount: toNum(updated.remaining_amount), receiptNumber },
    });

    return { subscription: this.mapSub(updated), paymentAmount };
  }

  async renew(
    id: number,
    renewalDays?: number,
    opts?: { paidAmount?: number; paymentMethod?: string; dryRun?: boolean; user?: JwtUser },
  ) {
    const sub = await this.prisma.club_subscriptions.findUnique({ where: { id } });
    if (!sub) throw new NotFoundException('الاشتراك غير موجود');
    this.assertBranchAccess(opts?.user, sub.branch_id);

    if (sub.status === 'frozen') {
      throw new BadRequestException('لا يمكن تجديد اشتراك مجمّد — ألغِ التجميد أولاً');
    }

    const activeFreeze = await this.prisma.club_subscription_freezes.findFirst({
      where: { subscription_id: id, is_active: true },
    });
    if (activeFreeze) {
      throw new BadRequestException('يوجد تجميد نشط — ألغِ التجميد قبل التجديد');
    }

    const today = localDateString();
    // If the current period hasn't ended yet (end date is today or later — deriveSubStatus keeps
    // the end date itself an active day), the new period starts the day AFTER the current end so
    // already-paid days aren't confiscated. Only an already-expired subscription restarts today.
    const newStart =
      sub.subscription_end_date >= today ? addDays(sub.subscription_end_date, 1) : today;
    const duration =
      renewalDays ??
      daysBetween(sub.subscription_start_date, sub.subscription_end_date);
    const newEnd = addDays(newStart, duration);
    const newStatus = deriveSubStatus(newStart, newEnd);
    const subValue = toNum(sub.subscription_value);
    const discount = toNum(sub.discount_value);
    const paidAmount = Math.max(0, opts?.paidAmount ?? 0);
    const paymentMethod = opts?.paymentMethod ?? sub.payment_method ?? 'cash';
    const packagePoints = sub.member_id && sub.subscription_type_id
      ? (await this.prisma.club_subscription_types.findUnique({
          where: { id: sub.subscription_type_id },
          select: { wallet_points: true },
        }))?.wallet_points ?? 0
      : 0;
    const renewalPointsEventKey = `subscription:${id}:renewal:${newStart}:${newEnd}`;

    // Reverse each existing receipt's GL entry BEFORE deleting the receipts so the subledger and GL
    // stay consistent (a blanket deleteMany would erase the receipts but leave dangling GL entries).
    // Chosen approach: reverse-then-delete per receipt, then recalc paid/remaining for the new period.
    const priorReceipts = await this.prisma.club_receipts.findMany({
      where: { subscription_id: id },
      select: { id: true, receipt_number: true },
    });

    const row = await this.prisma.$transaction(async (tx) => {
      await tx.club_subscriptions.update({
        where: { id },
        data: {
          subscription_start_date: newStart,
          subscription_end_date: newEnd,
          status: newStatus,
        },
      });

      for (const r of priorReceipts) {
        await this.accounting.reverseReceiptEntry(
          r.receipt_number,
          `عكس إيصال ${r.receipt_number} — تجديد الاشتراك ${sub.subscription_number}`,
          sub.created_by ?? undefined,
          tx,
        );
      }
      await tx.club_receipts.deleteMany({ where: { subscription_id: id } });

      // Optional up-front payment for the new period.
      let newReceiptNumber: string | undefined;
      if (paidAmount > 0) {
        const receipt = await retryOnUniqueViolation(async () => {
          const receiptNumber = await this.receipts.nextReceiptNumber();
          return tx.club_receipts.create({
            data: {
              receipt_number: receiptNumber,
              subscription_id: id,
              member_id: sub.member_id,
              member_name: sub.customer_name ?? '',
              amount: paidAmount,
              type: sub.subscription_type,
              payment_method: toClubPaymentMethod(paymentMethod),
              receipt_date: today,
              status: 'مدفوعة',
              description: `تجديد اشتراك - ${sub.subscription_type ?? ''}`,
            },
          });
        });
        newReceiptNumber = receipt.receipt_number;
      }

      // Recompute paid/remaining from the (reset) receipt ledger inside the tx.
      const agg = await tx.club_receipts.aggregate({
        where: { subscription_id: id },
        _sum: { amount: true },
      });
      const paid = toNum(agg._sum.amount);
      const remaining = remainingAmount(subValue, sub.discount_enabled, discount, paid);
      const updatedRow = await tx.club_subscriptions.update({
        where: { id },
        data: {
          paid_amount: paid,
          remaining_amount: remaining,
          receipt_number: newReceiptNumber ?? null,
        },
      });

      // GL for the new period. If a payment was made, recognize the discount once (kind 'renewal').
      if (paidAmount > 0) {
        await this.accounting.postJournal(
          {
            subscriptionNumber: sub.subscription_number,
            sourceDocId: newReceiptNumber,
            paidAmount,
            subscriptionValue: subValue,
            discountValue: discount,
            discountEnabled: sub.discount_enabled,
            paymentMethod,
            branchId: sub.branch_id,
            createdBy: sub.created_by ?? undefined,
            registrationDate: today,
            kind: 'renewal',
          },
          tx,
        );
      }

      if (sub.member_id && packagePoints > 0) {
        await tx.club_member_points_transactions.upsert({
          where: { event_key: renewalPointsEventKey },
          create: {
            member_id: sub.member_id,
            subscription_id: id,
            points: packagePoints,
            transaction_type: 'earn',
            source: 'subscription_renewal',
            event_key: renewalPointsEventKey,
            description: `نقاط تجديد اشتراك ${sub.subscription_type ?? sub.subscription_number}`,
          },
          update: {},
        });
      }

      return updatedRow;
    });

    await this.audit.log({
      entityType: 'club_subscription',
      entityId: id,
      action: 'renew',
      branchId: sub.branch_id,
      before: {
        subscriptionStartDate: sub.subscription_start_date,
        subscriptionEndDate: sub.subscription_end_date,
        status: sub.status,
      },
      after: {
        subscriptionStartDate: newStart,
        subscriptionEndDate: newEnd,
        status: newStatus,
        renewalPeriod: duration,
      },
    });

    if (sub.member_id) {
      void this.automation.emit('subscription_renewed', {
        memberId: sub.member_id,
        subscriptionId: id,
        branchId: sub.branch_id,
        memberName: sub.customer_name ?? '—',
        subscriptionNumber: sub.subscription_number,
      });
      await this.syncMemberProfileFromSubscription({
        member_id: sub.member_id,
        subscription_start_date: newStart,
        subscription_end_date: newEnd,
        subscription_type_id: sub.subscription_type_id,
        status: newStatus,
        is_linked_to_sessions: sub.is_linked_to_sessions,
        sessions_count: sub.sessions_count,
        sessions_used: sub.sessions_used,
      });
    }

    return { subscription: this.mapSub(row), renewalPeriod: duration };
  }

  /** Align member profile dates, plan label, and active flag with a linked subscription. */
  private async syncMemberProfileFromSubscription(sub: {
    member_id: number | null;
    subscription_start_date: string;
    subscription_end_date: string;
    subscription_type_id: number | null;
    status: string;
    is_linked_to_sessions?: boolean;
    sessions_count?: number | null;
    sessions_used?: number | null;
  }) {
    if (!sub.member_id) return;

    let membershipTypeId: number | undefined;
    if (sub.subscription_type_id) {
      const st = await this.prisma.club_subscription_types.findUnique({
        where: { id: sub.subscription_type_id },
      });
      if (st) {
        let mt = await this.prisma.club_membership_types.findFirst({
          where: { name: st.name },
        });
        if (!mt) {
          mt = await this.prisma.club_membership_types.create({
            data: {
              name: st.name,
              price: st.price,
              duration_days: st.days,
            },
          });
        } else if (toNum(mt.price) !== toNum(st.price) || mt.duration_days !== st.days) {
          mt = await this.prisma.club_membership_types.update({
            where: { id: mt.id },
            data: { price: st.price, duration_days: st.days },
          });
        }
        membershipTypeId = mt.id;
      }
    }

    const today = localDateString();
    const isSessions = !!sub.is_linked_to_sessions;
    const active =
      sub.status !== 'expired' &&
      sub.status !== 'frozen' &&
      (isSessions
        ? sub.subscription_start_date <= today &&
          (sub.sessions_count == null || (sub.sessions_used ?? 0) < sub.sessions_count)
        : sub.subscription_end_date >= today);

    await this.prisma.club_members.update({
      where: { id: sub.member_id },
      data: {
        start_date: sub.subscription_start_date,
        // Don't stamp the open-ended sentinel onto the member profile for session packages.
        ...(isSessions || isOpenEndedEndDate(sub.subscription_end_date)
          ? {}
          : { end_date: sub.subscription_end_date }),
        is_active: active,
        ...(membershipTypeId != null ? { membership_type_id: membershipTypeId } : {}),
      },
    });
  }

  async freeze(id: number, days?: number, reason?: string, userId?: number, user?: JwtUser) {
    // Optional planned days (legacy). Prefer open-ended freeze: staff unfreezes when ready;
    // remaining subscription time is preserved by extending the end date on unfreeze.
    const plannedDays =
      days != null && Number.isFinite(Number(days)) && Number(days) > 0
        ? Math.floor(Number(days))
        : 0;

    const sub = await this.prisma.club_subscriptions.findUnique({ where: { id } });
    if (!sub) throw new NotFoundException('الاشتراك غير موجود');
    this.assertBranchAccess(user, sub.branch_id);

    if (sub.status === 'frozen') {
      throw new BadRequestException('الاشتراك مجمّد بالفعل');
    }
    // Only a currently date-active subscription can be frozen.
    if (deriveSubStatus(sub.subscription_start_date, sub.subscription_end_date) !== 'active') {
      throw new BadRequestException('لا يمكن تجميد اشتراك غير نشط');
    }
    const existingFreeze = await this.prisma.club_subscription_freezes.findFirst({
      where: { subscription_id: id, is_active: true },
    });
    if (existingFreeze) {
      throw new BadRequestException('يوجد تجميد نشط لهذا الاشتراك بالفعل');
    }

    if (sub.subscription_type_id) {
      const type = await this.prisma.club_subscription_types.findUnique({
        where: { id: sub.subscription_type_id },
      });
      if (type && !type.is_linked_to_freeze) {
        throw new BadRequestException('نوع الاشتراك لا يدعم التجميد');
      }
      // freeze_days on the package = max number of freeze times (not total freeze days).
      if (type?.freeze_days != null) {
        const usedCount = await this.prisma.club_subscription_freezes.count({
          where: { subscription_id: id },
        });
        if (usedCount >= type.freeze_days) {
          throw new BadRequestException(
            `تم استنفاذ عدد مرات التجميد المسموح بها (${type.freeze_days})`,
          );
        }
      }
    }

    const today = localDateString();
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.club_subscription_freezes.create({
        data: {
          subscription_id: id,
          freeze_start_date: today,
          freeze_end_date: plannedDays > 0 ? addDays(today, plannedDays) : null,
          planned_days: plannedDays,
          original_end_date: sub.subscription_end_date,
          reason: reason ?? null,
          is_active: true,
          branch_id: sub.branch_id,
          created_by: userId ?? null,
        },
      });
      return tx.club_subscriptions.update({
        where: { id },
        data: { status: 'frozen' },
      });
    });

    await this.audit.log({
      entityType: 'club_subscription',
      entityId: id,
      action: 'freeze',
      actorUserId: userId,
      branchId: sub.branch_id,
      before: { status: sub.status, subscriptionEndDate: sub.subscription_end_date },
      after: { status: 'frozen', plannedDays, reason },
    });

    return this.mapSub(row);
  }

  async unfreeze(id: number, userId?: number, user?: JwtUser) {
    const sub = await this.prisma.club_subscriptions.findUnique({ where: { id } });
    if (!sub) throw new NotFoundException('الاشتراك غير موجود');
    this.assertBranchAccess(user, sub.branch_id);

    const freeze = await this.prisma.club_subscription_freezes.findFirst({
      where: { subscription_id: id, is_active: true },
      orderBy: { id: 'desc' },
    });
    if (!freeze) {
      throw new BadRequestException('لا يوجد تجميد نشط لهذا الاشتراك');
    }

    const today = localDateString();
    // Pause the clock: extend end date by the days actually frozen so remaining time is unchanged.
    // Example: 30 days left → freeze 7 days → unfreeze → still 30 days left.
    const actualDays = Math.max(0, daysBetween(freeze.freeze_start_date, today));
    const baseEnd = freeze.original_end_date || sub.subscription_end_date;
    const newEnd = isOpenEndedEndDate(baseEnd) ? baseEnd : addDays(baseEnd, actualDays);
    const newStatus = deriveSessionAwareStatus({
      startDate: sub.subscription_start_date,
      endDate: newEnd,
      isLinkedToSessions: sub.is_linked_to_sessions,
      sessionsCount: sub.sessions_count,
      sessionsUsed: sub.sessions_used,
    });

    const row = await this.prisma.$transaction(async (tx) => {
      await tx.club_subscription_freezes.update({
        where: { id: freeze.id },
        data: { is_active: false, freeze_end_date: today, actual_days: actualDays },
      });
      return tx.club_subscriptions.update({
        where: { id },
        data: { subscription_end_date: newEnd, status: newStatus },
      });
    });

    await this.audit.log({
      entityType: 'club_subscription',
      entityId: id,
      action: 'unfreeze',
      actorUserId: userId,
      branchId: sub.branch_id,
      before: { status: 'frozen', subscriptionEndDate: sub.subscription_end_date },
      after: { status: newStatus, subscriptionEndDate: newEnd, actualDays },
    });

    return this.mapSub(row);
  }

  async memberTransferHistory(user?: JwtUser) {
    const scope = this.branchScope.resolveListFilter(user, null);
    const rows = await this.prisma.business_audit_log.findMany({
      where: {
        entity_type: 'club_subscription',
        action: 'member_transfer',
        ...(scope === null ? {} : { branch_id: { in: scope } }),
      },
      orderBy: { id: 'desc' },
      take: 200,
    });

    const record = (value: Prisma.JsonValue | null): Record<string, unknown> =>
      value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {};

    return {
      data: rows.map((row) => {
        const before = record(row.before_json);
        const after = record(row.after_json);
        return {
          id: row.id,
          subscriptionId: Number(row.entity_id),
          fromMemberId: before.memberId ?? null,
          fromMemberName: before.customerName ?? null,
          toMemberId: after.memberId ?? null,
          toMemberName: after.customerName ?? null,
          actorName: row.actor_name,
          reason: row.reason,
          transferDate: row.created_at,
        };
      }),
    };
  }

  async transferMember(id: number, memberId: number, reason: string | undefined, user?: JwtUser) {
    const transferReason = reason?.trim();
    if (!transferReason) throw new BadRequestException('سبب تحويل الاشتراك مطلوب');
    if (transferReason.length > 1000) throw new BadRequestException('سبب التحويل يجب ألا يتجاوز 1000 حرف');
    const [sub, member] = await Promise.all([
      this.prisma.club_subscriptions.findUnique({ where: { id } }),
      this.prisma.club_members.findUnique({ where: { id: memberId } }),
    ]);
    if (!sub) throw new NotFoundException('الاشتراك غير موجود');
    if (!member) throw new NotFoundException('العضو غير موجود');
    this.assertBranchAccess(user, sub.branch_id);
    this.assertBranchAccess(user, member.branch_id);
    if (sub.member_id === memberId) {
      throw new BadRequestException('الاشتراك مرتبط بهذا العضو بالفعل');
    }
    if (sub.status === 'frozen') {
      throw new BadRequestException('لا يمكن تحويل اشتراك مجمّد — ألغِ التجميد أولاً');
    }

    await assertMemberExists(this.prisma, memberId).catch((e) => {
      throw new BadRequestException(e.message);
    });

    const row = await this.prisma.club_subscriptions.update({
      where: { id },
      data: { member_id: memberId, customer_name: member.name },
    });

    await this.audit.log({
      entityType: 'club_subscription',
      entityId: id,
      action: 'member_transfer',
      actorUserId: user?.sub,
      branchId: sub.branch_id,
      reason: transferReason,
      before: { memberId: sub.member_id, customerName: sub.customer_name },
      after: { memberId, customerName: member.name },
    });

    return this.mapSub(row);
  }

  async statistics(isSpecial?: string, user?: JwtUser) {
    const and: Prisma.club_subscriptionsWhereInput[] = [];
    const scope = this.branchScope.resolveListFilter(user, null);
    if (scope !== null) and.push({ branch_id: { in: scope } });
    if (isSpecial === 'true' || isSpecial === '1') and.push(this.specialSubscriptionFilter());
    if (isSpecial === 'false' || isSpecial === '0') {
      and.push({
        AND: [
          { is_special: false },
          { OR: [{ subscription_type_id: null }, { type: { is_special_offer: false } }] },
        ],
      });
    }

    const where: Prisma.club_subscriptionsWhereInput = and.length ? { AND: and } : {};
    const rows = await this.prisma.club_subscriptions.findMany({ where });
    let total = 0;
    let active = 0;
    let expired = 0;
    let upcoming = 0;
    let totalValue = 0;
    let totalPaid = 0;
    let totalRemaining = 0;
    let monthlyCount = 0;
    let yearlyCount = 0;

    for (const r of rows) {
      total++;
      const st = deriveSubStatus(r.subscription_start_date, r.subscription_end_date);
      if (st === 'active') active++;
      else if (st === 'expired') expired++;
      else upcoming++;

      totalValue += toNum(r.subscription_value);
      totalPaid += toNum(r.paid_amount);
      totalRemaining += toNum(r.remaining_amount);

      const dur = daysBetween(r.subscription_start_date, r.subscription_end_date);
      if (dur <= 35) monthlyCount++;
      if (dur >= 360) yearlyCount++;
    }

    return { total, active, expired, upcoming, totalValue, totalPaid, totalRemaining, monthlyCount, yearlyCount };
  }

  async outstandingReport(query: {
    dateFrom?: string;
    dateTo?: string;
    branch?: string;
    search?: string;
    dateField?: string;
  }, user?: JwtUser) {
    const and: Prisma.club_subscriptionsWhereInput[] = [{ remaining_amount: { gt: 0 } }];
    if (query.branch && query.branch !== 'all') and.push({ branch_id: Number(query.branch) });
    const scope = this.branchScope.resolveListFilter(user, query.branch ?? null);
    if (scope !== null) and.push({ branch_id: { in: scope } });
    if (query.search?.trim()) {
      const s = query.search.trim();
      and.push({
        OR: [
          { customer_name: { contains: s } },
          { subscription_number: { contains: s } },
        ],
      });
    }
    const dateField = query.dateField ?? 'registration_date';
    if (query.dateFrom && query.dateTo) {
      if (dateField === 'subscription_start_date') {
        and.push({ subscription_start_date: { gte: query.dateFrom, lte: query.dateTo } });
      } else if (dateField === 'subscription_end_date') {
        and.push({ subscription_end_date: { gte: query.dateFrom, lte: query.dateTo } });
      } else {
        and.push({ registration_date: { gte: query.dateFrom, lte: query.dateTo } });
      }
    }

    const rows = await this.prisma.club_subscriptions.findMany({
      where: { AND: and },
      orderBy: [{ remaining_amount: 'desc' }, { registration_date: 'desc' }],
    });

    const subscriptions = rows.map((r) => ({
      ...this.mapSub(r),
      netValue: netValue(toNum(r.subscription_value), r.discount_enabled, toNum(r.discount_value)),
    }));

    const memberIds = new Set(rows.map((r) => r.member_id).filter(Boolean));
    return {
      subscriptions,
      summary: {
        count: rows.length,
        uniqueMembers: memberIds.size,
        totalOutstanding: subscriptions.reduce((s, x) => s + x.remainingAmount, 0),
        totalPaid: subscriptions.reduce((s, x) => s + x.paidAmount, 0),
        totalNetValue: subscriptions.reduce((s, x) => s + x.netValue, 0),
      },
    };
  }

  async expiredReport(query: { branch?: string; search?: string }, user?: JwtUser) {
    const and: Prisma.club_subscriptionsWhereInput[] = [];
    if (query.branch && query.branch !== 'all') and.push({ branch_id: Number(query.branch) });
    const scope = this.branchScope.resolveListFilter(user, query.branch ?? null);
    if (scope !== null) and.push({ branch_id: { in: scope } });
    const rows = await this.prisma.club_subscriptions.findMany({
      where: and.length ? { AND: and } : {},
      orderBy: { subscription_end_date: 'desc' },
    });
    type SubRow = ReturnType<ClubSubscriptionsService['mapSub']>;
    let list: SubRow[] = rows
      .filter((r) => deriveSubStatus(r.subscription_start_date, r.subscription_end_date) === 'expired')
      .map((r) => this.mapSub(r));
    if (query.search?.trim()) {
      const s = query.search.trim().toLowerCase();
      list = list.filter(
        (x) =>
          String(x.customerName ?? '').toLowerCase().includes(s) ||
          String(x.subscriptionNumber).toLowerCase().includes(s),
      );
    }
    return { data: list, count: list.length };
  }

  async updateExpiredStatuses(): Promise<number> {
    const today = localDateString();
    const result = await this.prisma.club_subscriptions.updateMany({
      where: {
        status: { in: ['active', 'upcoming'] },
        subscription_end_date: { lt: today },
      },
      data: { status: 'expired' },
    });
    return result.count;
  }

  /**
   * Subscriptions whose first fully-expired day is today (before status update).
   * deriveSubStatus keeps subscription_end_date itself an active day, so "newly expired" means
   * the end date was YESTERDAY — selecting end date == today would fire a day early.
   */
  async findNewlyExpired() {
    const yesterday = addDays(localDateString(), -1);
    return this.prisma.club_subscriptions.findMany({
      where: {
        subscription_end_date: yesterday,
        status: { in: ['active', 'upcoming'] },
      },
      select: {
        id: true,
        member_id: true,
        branch_id: true,
        customer_name: true,
        subscription_number: true,
      },
    });
  }
}
