import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { retryOnUniqueViolation } from '../../common/retry-unique';
import { paginated } from '../../common/dto/list-result';
import { assertMemberExists, localDateString } from '../club-members/club-member.utils';
import { ClubReceiptsService } from './club-receipts.service';
import { ClubSubscriptionAccountingService } from './club-subscription-accounting.service';
import { toClubPaymentMethod, toNum } from './club-subscription.utils';
import {
  CreateClubReceiptDto,
  ListClubReceiptsDto,
  UpdateClubReceiptDto,
} from './dto/club-receipts.dto';

@Injectable()
export class ClubReceiptsCrudService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly receipts: ClubReceiptsService,
    private readonly accounting: ClubSubscriptionAccountingService,
  ) {}

  private mapReceipt(r: {
    id: number;
    receipt_number: string;
    subscription_id: number | null;
    member_id: number | null;
    member_name: string;
    amount: unknown;
    type: string | null;
    payment_method: string | null;
    receipt_date: string;
    status: string;
    description: string | null;
  }) {
    // Field names are consumed by the frontend — do NOT rename.
    return {
      id: r.id,
      receiptNumber: r.receipt_number,
      subscriptionId: r.subscription_id,
      memberId: r.member_id,
      memberName: r.member_name,
      amount: toNum(r.amount),
      type: r.type,
      paymentMethod: r.payment_method,
      receiptDate: r.receipt_date,
      status: r.status,
      description: r.description,
    };
  }

  async list(q: ListClubReceiptsDto) {
    const where: {
      status?: string;
      subscription_id?: number;
      member_id?: number;
    } = {};
    if (q.status) where.status = q.status;
    if (q.subscriptionId != null) where.subscription_id = q.subscriptionId;
    if (q.memberId != null) where.member_id = q.memberId;

    const [rows, total] = await Promise.all([
      this.prisma.club_receipts.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.club_receipts.count({ where }),
    ]);

    return paginated(rows.map((r) => this.mapReceipt(r)), total, q.page, q.pageSize);
  }

  async findOne(id: number) {
    const r = await this.prisma.club_receipts.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('الإيصال غير موجود');
    return r;
  }

  async create(body: CreateClubReceiptDto) {
    if (body.memberId) {
      await assertMemberExists(this.prisma, body.memberId).catch((e) => {
        throw new BadRequestException(e instanceof Error ? e.message : 'العضو غير موجود');
      });
    }

    // A receipt affects a subscription's paid/remaining ONLY when subscriptionId is explicitly
    // provided — no auto-attach to the member's latest subscription.
    const subscriptionId = body.subscriptionId;
    let sub: Awaited<ReturnType<typeof this.prisma.club_subscriptions.findUnique>> = null;
    if (subscriptionId != null) {
      sub = await this.prisma.club_subscriptions.findUnique({ where: { id: subscriptionId } });
      if (!sub) throw new NotFoundException('الاشتراك غير موجود');
    }

    // Derive a branch for the GL posting: subscription's branch, else the member's branch.
    let branchId = sub?.branch_id;
    if (branchId == null && body.memberId) {
      const mem = await this.prisma.club_members.findUnique({ where: { id: body.memberId } });
      branchId = mem?.branch_id;
    }

    const receipt = await retryOnUniqueViolation(async () => {
      const receiptNumber = await this.receipts.nextReceiptNumber();
      return this.prisma.club_receipts.create({
        data: {
          receipt_number: receiptNumber,
          subscription_id: subscriptionId ?? null,
          member_id: body.memberId ?? null,
          member_name: body.memberName,
          amount: body.amount,
          type: body.type ?? null,
          payment_method: toClubPaymentMethod(body.paymentMethod),
          receipt_date: body.receiptDate ?? localDateString(),
          status: 'مدفوعة',
          description: body.description ?? null,
        },
      });
    });

    if (subscriptionId != null) {
      await this.receipts.recalculateSubscriptionPayments(subscriptionId);
    }

    // Post GL: debit cash/pay method, credit subscription_revenue. Idempotent per receipt number.
    if (branchId != null) {
      await this.accounting.postJournal({
        subscriptionNumber: sub?.subscription_number ?? receipt.receipt_number,
        sourceDocId: receipt.receipt_number,
        paidAmount: body.amount,
        subscriptionValue: 0,
        discountValue: 0,
        discountEnabled: false,
        paymentMethod: body.paymentMethod,
        branchId,
        kind: 'payment',
      });
    }

    return this.mapReceipt(receipt);
  }

  async update(id: number, body: UpdateClubReceiptDto) {
    await this.findOne(id);
    // Only description/type/payment_method are mutable. Amount/date/subscription are immutable —
    // changing money on a posted receipt would desync the GL; cancel and re-issue instead.
    const receipt = await this.prisma.club_receipts.update({
      where: { id },
      data: {
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.type !== undefined ? { type: body.type } : {}),
        ...(body.paymentMethod !== undefined
          ? { payment_method: toClubPaymentMethod(body.paymentMethod) }
          : {}),
      },
    });
    return this.mapReceipt(receipt);
  }

  async remove(id: number) {
    const existing = await this.findOne(id);
    await this.prisma.$transaction(async (tx) => {
      // Reverse the GL entry by source doc, then delete, then recalc the linked subscription.
      await this.accounting.reverseReceiptEntry(
        existing.receipt_number,
        `عكس إيصال ${existing.receipt_number} — حذف`,
        undefined,
        tx,
      );
      await tx.club_receipts.delete({ where: { id } });
      if (existing.subscription_id != null) {
        const agg = await tx.club_receipts.aggregate({
          where: { subscription_id: existing.subscription_id },
          _sum: { amount: true },
        });
        const paid = toNum(agg._sum.amount);
        const sub = await tx.club_subscriptions.findUnique({ where: { id: existing.subscription_id } });
        if (sub) {
          const discount = sub.discount_enabled ? toNum(sub.discount_value) : 0;
          const remaining = Math.max(0, toNum(sub.subscription_value) - discount - paid);
          await tx.club_subscriptions.update({
            where: { id: existing.subscription_id },
            data: { paid_amount: paid, remaining_amount: remaining },
          });
        }
      }
    });
    return { success: true };
  }

  async statistics() {
    const monthStart = localDateString().slice(0, 8) + '01';
    const rows = await this.prisma.club_receipts.findMany({
      where: { receipt_date: { gte: monthStart } },
    });
    return {
      total: rows.length,
      paid: rows.filter((r) => r.status === 'مدفوعة' || r.status === 'paid').length,
      pending: rows.filter((r) => r.status === 'معلقة' || r.status === 'pending').length,
      totalAmount: rows.reduce((s, r) => s + toNum(r.amount), 0),
    };
  }
}
