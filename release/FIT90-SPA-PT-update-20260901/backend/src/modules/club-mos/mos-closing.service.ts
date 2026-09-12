import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { mapRow, toNum } from './mos-camel.util';

/** payment_method value -> cash/card/other bucket. */
function bucketOf(method: string | null | undefined): 'cash' | 'card' | 'other' {
  const m = (method ?? '').toLowerCase();
  if (m === 'cash') return 'cash';
  if (m === 'card' || m === 'visa') return 'card';
  return 'other';
}

export interface ClosingMethodRow {
  method: string;
  amount: number;
  count: number;
}

export interface ClosingSummary {
  date: string;
  branchId: number | null;
  byMethod: ClosingMethodRow[];
  expected: { cash: number; card: number; other: number; total: number };
  existing: Record<string, unknown> | null;
}

@Injectable()
export class ClubClosingService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(date: string, branchId?: number | null): Promise<ClosingSummary> {
    if (!date) throw new BadRequestException('date is required');

    const [receipts, existing] = await Promise.all([
      this.prisma.club_receipts.findMany({
        where: {
          receipt_date: date,
          ...(branchId != null ? { subscription: { branch_id: branchId } } : {}),
        },
        select: { amount: true, payment_method: true },
      }),
      this.prisma.club_closing_transactions.findFirst({
        where: {
          is_deleted: false,
          closing_date: date,
          ...(branchId != null ? { branch_id: branchId } : {}),
        },
        orderBy: { created_at: 'desc' },
      }),
    ]);

    const perMethod = new Map<string, { amount: number; count: number }>();
    const expected = { cash: 0, card: 0, other: 0, total: 0 };
    for (const r of receipts) {
      const method = r.payment_method ?? 'unknown';
      const amount = toNum(r.amount);
      const g = perMethod.get(method) ?? { amount: 0, count: 0 };
      g.amount += amount;
      g.count += 1;
      perMethod.set(method, g);
      expected[bucketOf(r.payment_method)] += amount;
      expected.total += amount;
    }

    const round = (n: number) => Math.round(n * 100) / 100;

    return {
      date,
      branchId: branchId ?? null,
      byMethod: [...perMethod.entries()].map(([method, g]) => ({
        method,
        amount: round(g.amount),
        count: g.count,
      })),
      expected: {
        cash: round(expected.cash),
        card: round(expected.card),
        other: round(expected.other),
        total: round(expected.total),
      },
      existing: existing ? mapRow(existing as unknown as Record<string, unknown>) : null,
    };
  }

  async save(body: {
    closingDate: string;
    branchId?: number | null;
    totalCash?: number;
    totalCard?: number;
    totalOther?: number;
    notes?: string | null;
    closedBy?: string | null;
  }) {
    if (!body.closingDate) throw new BadRequestException('closingDate is required');

    const totalCash = toNum(body.totalCash);
    const totalCard = toNum(body.totalCard);
    const totalOther = toNum(body.totalOther);

    const row = await this.prisma.club_closing_transactions.create({
      data: {
        closing_date: body.closingDate,
        branch_id: body.branchId ?? null,
        total_cash: new Prisma.Decimal(totalCash),
        total_card: new Prisma.Decimal(totalCard),
        total_other: new Prisma.Decimal(totalOther),
        notes: body.notes ?? null,
        closed_by: body.closedBy ?? null,
      },
    });

    const summary = await this.summary(body.closingDate, body.branchId ?? null);
    const round = (n: number) => Math.round(n * 100) / 100;
    const countedTotal = totalCash + totalCard + totalOther;
    const variance = {
      cash: round(totalCash - summary.expected.cash),
      card: round(totalCard - summary.expected.card),
      other: round(totalOther - summary.expected.other),
      total: round(countedTotal - summary.expected.total),
    };

    return {
      closing: mapRow(row as unknown as Record<string, unknown>),
      expected: summary.expected,
      counted: {
        cash: round(totalCash),
        card: round(totalCard),
        other: round(totalOther),
        total: round(countedTotal),
      },
      variance,
    };
  }

  list(branchId?: number | null) {
    return this.prisma.club_closing_transactions
      .findMany({
        where: {
          is_deleted: false,
          ...(branchId != null ? { branch_id: branchId } : {}),
        },
        orderBy: [{ closing_date: 'desc' }, { created_at: 'desc' }],
        take: 100,
      })
      .then((rows) => rows.map((r) => mapRow(r as unknown as Record<string, unknown>)));
  }
}
