import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { club_subscription_refunds, club_subscriptions, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { isDryRun, previewResponse, PreviewRow } from '../../common/preview';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { JwtUser } from '../../common/types/jwt-user';
import { localDateString, parseDateOnly } from '../club-members/club-member.utils';
import { BusinessAuditService } from '../gym-ops/business-audit.service';
import { ClubSubscriptionAccountingService } from './club-subscription-accounting.service';
import { ClubReceiptsService } from './club-receipts.service';
import { daysBetween, netValue, roundMoney, toNum } from './club-subscription.utils';

export interface RefundPreview {
  subscriptionId: number;
  customerName: string | null;
  stopDate: string;
  remainingDays: number;
  remainingSessions: number | null;
  refundBasis: 'days' | 'sessions';
  refundAmount: number;
  dailyRate: number;
  originalValue: number;
  /** Total subscription days (denominator of the consumption equation). */
  totalDays: number;
  /** Effective days spent = totalDays − remainingDays. */
  consumedDays: number;
  /** قيمة الاستهلاك = القيمة الكلية − المبلغ المرتجع (refund = total − consumption). */
  consumedValue: number;
  status: 'pending';
}

@Injectable()
export class ClubSubscriptionRefundsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounting: ClubSubscriptionAccountingService,
    private readonly receipts: ClubReceiptsService,
    private readonly audit: BusinessAuditService,
    private readonly branchScope: BranchScopeService,
  ) {}

  private assertBranchAccess(user: JwtUser | undefined, branchId: number | null | undefined) {
    if (branchId == null || !this.branchScope.isBranchAllowed(user, branchId)) {
      throw new ForbiddenException('لا تملك صلاحية الوصول لبيانات هذا الفرع');
    }
  }

  private branchWhere(user?: JwtUser): Prisma.club_subscription_refundsWhereInput {
    const allowed = this.branchScope.allowedBranchIds(user);
    return allowed === null ? {} : { branch_id: { in: allowed } };
  }

  async list(user?: JwtUser) {
    const rows = await this.prisma.club_subscription_refunds.findMany({
      where: this.branchWhere(user),
      orderBy: { id: 'desc' },
    });
    return rows.map((r) => this.map(r));
  }

  async findOne(id: number, user?: JwtUser) {
    const row = await this.prisma.club_subscription_refunds.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('الاسترداد غير موجود');
    this.assertBranchAccess(user, row.branch_id);
    return this.map(row);
  }

  private map(r: Record<string, unknown>) {
    return {
      id: r.id,
      subscriptionId: r.subscription_id,
      memberId: r.member_id,
      customerName: r.customer_name,
      subscriptionType: r.subscription_type,
      originalStartDate: r.original_start_date,
      originalEndDate: r.original_end_date,
      stopDate: r.stop_date,
      remainingDays: r.remaining_days,
      originalValue: toNum(r.original_value),
      dailyRate: toNum(r.daily_rate),
      refundAmount: toNum(r.refund_amount),
      invoiceNumber: r.invoice_number,
      refundDate: r.refund_date,
      reason: r.reason,
      notes: r.notes,
      status: r.status,
      branchId: r.branch_id,
      createdAt: r.created_at,
    };
  }

  private previewRows(p: RefundPreview): PreviewRow[] {
    const rows: PreviewRow[] = [];
    if (p.refundBasis === 'sessions' && p.remainingSessions != null) {
      rows.push({ label: 'الحصص المتبقية', after: String(p.remainingSessions) });
    } else {
      rows.push({ label: 'الأيام المتبقية', after: String(p.remainingDays) });
    }
    rows.push({ label: 'قيمة الاستهلاك', after: `${p.consumedValue.toFixed(2)}` });
    rows.push({ label: 'مبلغ الاسترداد', after: `${p.refundAmount.toFixed(2)}` });
    rows.push({ label: 'تاريخ الإيقاف', after: p.stopDate });
    return rows;
  }

  /** Compute refund amounts without writing. */
  async computePreview(body: {
    subscriptionId: number;
    stopDate: string;
  }, user?: JwtUser): Promise<RefundPreview> {
    const sub = await this.prisma.club_subscriptions.findUnique({ where: { id: body.subscriptionId } });
    if (!sub) throw new NotFoundException('الاشتراك غير موجود');
    this.assertBranchAccess(user, sub.branch_id);

    const start = sub.subscription_start_date;
    const end = sub.subscription_end_date;
    const stop = body.stopDate;
    if (parseDateOnly(stop) < parseDateOnly(start) || parseDateOnly(stop) > parseDateOnly(end)) {
      throw new BadRequestException('تاريخ الإيقاف يجب أن يكون ضمن فترة الاشتراك');
    }

    const net = netValue(toNum(sub.subscription_value), sub.discount_enabled, toNum(sub.discount_value));
    const paid = toNum(sub.paid_amount);
    const priorAgg = await this.prisma.club_subscription_refunds.aggregate({
      where: { subscription_id: body.subscriptionId, status: { not: 'cancelled' } },
      _sum: { refund_amount: true },
    });
    const alreadyRefunded = toNum(priorAgg._sum.refund_amount);
    const refundableCap = Math.max(0, paid - alreadyRefunded);
    if (refundableCap <= 0) {
      throw new BadRequestException('لا يوجد مبلغ متبقٍ للاسترداد لهذا الاشتراك');
    }

    let remainingDays = daysBetween(stop, end);
    let remainingSessions: number | null = null;
    let refundBasis: 'days' | 'sessions' = 'days';
    let refundAmount = 0;
    let dailyRate = 0;
    const totalDays = daysBetween(start, end);

    if (sub.is_linked_to_sessions && sub.sessions_count != null && sub.sessions_count > 0) {
      remainingSessions = Math.max(0, sub.sessions_count - sub.sessions_used);
      if (remainingSessions <= 0) {
        throw new BadRequestException('لا توجد حصص متبقية للاسترداد');
      }
      refundBasis = 'sessions';
      const sessionRate = roundMoney(net / sub.sessions_count);
      dailyRate = sessionRate;
      refundAmount = roundMoney(Math.min(remainingSessions * sessionRate, refundableCap));
      remainingDays = daysBetween(stop, end);
    } else {
      if (remainingDays <= 0) throw new BadRequestException('لا توجد أيام متبقية للاسترداد');
      dailyRate = roundMoney(totalDays > 0 ? net / totalDays : 0);
      refundAmount = roundMoney(Math.max(0, Math.min(remainingDays * dailyRate, refundableCap)));
    }

    if (refundAmount <= 0) {
      throw new BadRequestException('مبلغ الاسترداد المحسوب صفر');
    }

    // قيمة الاستهلاك = القيمة الكلية − المبلغ المرتجع (rearrangement of refund = total − consumption).
    const consumedDays = Math.max(0, totalDays - remainingDays);
    const consumedValue = roundMoney(Math.max(0, net - refundAmount));

    return {
      subscriptionId: body.subscriptionId,
      customerName: sub.customer_name,
      stopDate: stop,
      remainingDays,
      remainingSessions,
      refundBasis,
      refundAmount,
      dailyRate,
      originalValue: net,
      totalDays,
      consumedDays,
      consumedValue,
      status: 'pending',
    };
  }

  async create(body: {
    subscriptionId: number;
    stopDate: string;
    reason?: string;
    notes?: string;
    createdBy?: number;
    dryRun?: boolean;
  }, user?: JwtUser) {
    const preview = await this.computePreview(body, user);
    if (isDryRun(body.dryRun)) {
      return previewResponse(preview, {
        rows: this.previewRows(preview),
        warning: 'سيتم صرف المبلغ من الخزينة وترحيله كمصروف استرداد وإنهاء الاشتراك',
      });
    }

    const sub = await this.prisma.club_subscriptions.findUnique({ where: { id: body.subscriptionId } });
    if (!sub) throw new NotFoundException('الاشتراك غير موجود');
    this.assertBranchAccess(user, sub.branch_id);

    const pendingExists = await this.prisma.club_subscription_refunds.findFirst({
      where: { subscription_id: body.subscriptionId, status: 'pending' },
    });
    if (pendingExists) {
      throw new BadRequestException('يوجد طلب استرداد معلّق لهذا الاشتراك — اعتمده أو ألغِه أولاً');
    }

    let refund: club_subscription_refunds | undefined;
    let invoiceNumber = '';
    for (let attempt = 0; ; attempt++) {
      try {
        const out = await this.prisma.$transaction(async (tx) => {
          const last = await tx.club_subscription_refunds.findFirst({ orderBy: { id: 'desc' } });
          const invNo = `REF-${String((last?.id ?? 0) + 1).padStart(6, '0')}`;
          const created = await tx.club_subscription_refunds.create({
            data: {
              subscription_id: body.subscriptionId,
              member_id: sub.member_id,
              customer_name: sub.customer_name,
              subscription_type: sub.subscription_type,
              original_start_date: sub.subscription_start_date,
              original_end_date: sub.subscription_end_date,
              stop_date: preview.stopDate,
              remaining_days: preview.remainingDays,
              original_value: preview.originalValue,
              daily_rate: preview.dailyRate,
              refund_amount: preview.refundAmount,
              invoice_number: invNo,
              refund_date: localDateString(),
              reason: body.reason ?? null,
              notes: body.notes ?? null,
              status: 'pending',
              branch_id: sub.branch_id,
              created_by: body.createdBy ?? null,
            },
          });
          return { created, invNo };
        });
        refund = out.created;
        invoiceNumber = out.invNo;
        break;
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002' && attempt < 4) {
          continue;
        }
        throw e;
      }
    }
    if (!refund) throw new BadRequestException('تعذّر إنشاء الاسترداد — حاول مرة أخرى');

    await this.commitRefund(refund, body.createdBy);
    const completed = await this.prisma.club_subscription_refunds.findUnique({ where: { id: refund.id } });
    if (!completed) throw new BadRequestException('تعذّر إتمام الاسترداد');

    return this.map(completed);
  }

  /** Apply financial side effects when a pending refund is approved. */
  private async commitRefund(refund: club_subscription_refunds, actorUserId?: number) {
    const sub = await this.prisma.club_subscriptions.findUnique({
      where: { id: refund.subscription_id },
    });
    if (!sub) throw new NotFoundException('الاشتراك غير موجود');

    const refundAmount = toNum(refund.refund_amount);
    const stop = refund.stop_date;

    const committed = await this.prisma.$transaction(async (tx) => {
      const claim = await tx.club_subscription_refunds.updateMany({
        where: { id: refund.id, status: 'pending' },
        data: { status: 'completed' },
      });
      if (claim.count === 0) return false;

      await tx.club_subscriptions.update({
        where: { id: refund.subscription_id },
        data: { subscription_end_date: stop, status: 'expired' },
      });

      await this.receipts.recalculateSubscriptionPayments(refund.subscription_id, tx);

      await this.accounting.postJournal({
        subscriptionNumber: sub.subscription_number,
        sourceDocId: refund.invoice_number,
        paidAmount: refundAmount,
        subscriptionValue: toNum(sub.subscription_value),
        discountValue: toNum(sub.discount_value),
        discountEnabled: sub.discount_enabled,
        paymentMethod: sub.payment_method ?? 'cash',
        branchId: sub.branch_id,
        createdBy: actorUserId ?? refund.created_by ?? undefined,
        kind: 'refund',
      }, tx);

      return true;
    });
    if (!committed) throw new BadRequestException('تم اعتماد الاسترداد بالفعل');

    await this.audit.log({
      entityType: 'club_subscription',
      entityId: refund.subscription_id,
      action: 'refund',
      actorUserId,
      branchId: sub.branch_id,
      after: {
        refundId: refund.id,
        refundAmount,
        invoiceNumber: refund.invoice_number,
        stopDate: stop,
        status: 'completed',
      },
    });
  }

  async updateStatus(
    id: number,
    status: 'pending' | 'completed' | 'cancelled',
    actorUserId?: number,
    user?: JwtUser,
  ) {
    const existing = await this.prisma.club_subscription_refunds.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('الاسترداد غير موجود');
    this.assertBranchAccess(user, existing.branch_id);

    if (status === 'completed') {
      if (existing.status === 'completed') {
        return this.map(existing);
      }
      if (existing.status === 'cancelled') {
        throw new BadRequestException('لا يمكن اعتماد استرداد ملغى');
      }
      await this.commitRefund(existing, actorUserId);
      const row = await this.prisma.club_subscription_refunds.findUnique({ where: { id } });
      return this.map(row!);
    }

    if (status === 'cancelled' && existing.status === 'completed') {
      throw new BadRequestException('لا يمكن إلغاء استرداد مُعتمد — استخدم قيد عكسي');
    }

    const row = await this.prisma.club_subscription_refunds.update({ where: { id }, data: { status } });
    return this.map(row);
  }

  async statistics(user?: JwtUser) {
    const rows = await this.prisma.club_subscription_refunds.findMany({ where: this.branchWhere(user) });
    const totalRefundAmount = rows.reduce((s, r) => s + toNum(r.refund_amount), 0);
    return {
      totalRefunds: rows.length,
      totalRefundAmount,
      averageRefundAmount: rows.length ? totalRefundAmount / rows.length : 0,
      pendingRefunds: rows.filter((r) => r.status === 'pending').length,
      completedRefunds: rows.filter((r) => r.status === 'completed').length,
      cancelledRefunds: rows.filter((r) => r.status === 'cancelled').length,
    };
  }
}
