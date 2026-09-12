import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ClubCommissionKind, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { mapRow, toNum } from './mos-camel.util';

/** Default commission percentage when no active sales rule is configured. */
const DEFAULT_SALES_PCT = 10;
/** Default commission percentage when no active trainer rule is configured. */
const DEFAULT_TRAINER_PCT = 12;
/** Default per-class flat rate (currency units) for instructor_class_rate. */
const DEFAULT_CLASS_RATE = 50;

/** Kinds that attribute to a sales person via club_subscriptions.sales_id. */
const SALES_KINDS: ClubCommissionKind[] = [
  ClubCommissionKind.sales_range,
  ClubCommissionKind.sales_percentage,
  ClubCommissionKind.sales_target,
  ClubCommissionKind.package_commission,
];

/** Kinds that attribute to a trainer via club_classes.trainer_id. */
const TRAINER_KINDS: ClubCommissionKind[] = [
  ClubCommissionKind.trainer_range,
  ClubCommissionKind.trainer_percentage,
  ClubCommissionKind.trainer_target,
  ClubCommissionKind.instructor_class_rate,
  ClubCommissionKind.fixed_trainer_commission,
];

export interface CommissionRow {
  personId: number | null;
  personName: string;
  base: number;
  rate: number;
  commission: number;
}

export interface CommissionResult {
  kind: ClubCommissionKind;
  from: string | null;
  to: string | null;
  branchId: number | null;
  rows: CommissionRow[];
  total: number;
}

const UNASSIGNED = 'Unassigned';

/** Round to 2dp. */
function money(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Probe a commission rule's loosely-typed `config` JSON for a numeric
 * percentage/rate. Tolerates common shapes: `{ percentage }`, `{ percent }`,
 * `{ rate }`, `{ amount }`, or a first tier carrying one of those.
 */
function numFromConfig(config: unknown, keys: string[]): number | undefined {
  if (config == null || typeof config !== 'object') return undefined;
  const c = config as Record<string, unknown>;
  for (const key of keys) {
    const v = c[key];
    const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
    if (Number.isFinite(n)) return n;
  }
  for (const listKey of ['tiers', 'ranges', 'rules']) {
    const list = c[listKey];
    if (Array.isArray(list) && list.length) {
      const nested = numFromConfig(list[0], keys);
      if (nested != null) return nested;
    }
  }
  return undefined;
}

@Injectable()
export class ClubCommissionService {
  constructor(private readonly prisma: PrismaService) {}

  private assertKind(kind: string): ClubCommissionKind {
    if (!kind || !(kind in ClubCommissionKind)) {
      throw new BadRequestException(`Unknown commission kind: ${kind}`);
    }
    return kind as ClubCommissionKind;
  }

  private isSalesKind(kind: ClubCommissionKind): boolean {
    return SALES_KINDS.includes(kind);
  }

  /** `{ registration_date/class_date: { gte, lte } }` when a range is given. */
  private dateRange(
    field: string,
    from?: string | null,
    to?: string | null,
  ): Record<string, unknown> {
    if (!from && !to) return {};
    const range: Record<string, string> = {};
    if (from) range.gte = from;
    if (to) range.lte = to;
    return { [field]: range };
  }

  /** Active rule of the given kind for the branch (branch-specific or global). */
  private activeRule(kind: ClubCommissionKind, branchId?: number | null) {
    const kinds = this.isSalesKind(kind) ? SALES_KINDS : TRAINER_KINDS;
    return this.prisma.club_commission_rules.findFirst({
      where: {
        is_deleted: false,
        is_active: true,
        // Prefer the exact kind first, but fall back to same family.
        kind: { in: kinds },
        ...(branchId != null ? { OR: [{ branch_id: branchId }, { branch_id: null }] } : {}),
      },
      orderBy: [{ kind: 'asc' }, { updated_at: 'desc' }],
    });
  }

  async calculate(
    kind: string,
    from?: string | null,
    to?: string | null,
    branchId?: number | null,
  ): Promise<CommissionResult> {
    const k = this.assertKind(kind);
    const rows = this.isSalesKind(k)
      ? await this.calcSales(k, from, to, branchId)
      : await this.calcTrainer(k, from, to, branchId);

    rows.sort((a, b) => b.commission - a.commission);
    const total = money(rows.reduce((s, r) => s + r.commission, 0));

    return {
      kind: k,
      from: from ?? null,
      to: to ?? null,
      branchId: branchId ?? null,
      rows,
      total,
    };
  }

  private async calcSales(
    kind: ClubCommissionKind,
    from?: string | null,
    to?: string | null,
    branchId?: number | null,
  ): Promise<CommissionRow[]> {
    const where: Prisma.club_subscriptionsWhereInput = {
      ...(branchId != null ? { branch_id: branchId } : {}),
      ...this.dateRange('registration_date', from, to),
    };
    if (kind === ClubCommissionKind.package_commission) where.is_special = true;

    const [subs, rule, staff] = await Promise.all([
      this.prisma.club_subscriptions.findMany({
        where,
        select: { sales_id: true, subscription_value: true },
      }),
      this.activeRule(kind, branchId),
      this.prisma.club_sales_staff.findMany({
        where: { is_deleted: false, ...(branchId != null ? { branch_id: branchId } : {}) },
        select: { id: true, name: true },
      }),
    ]);

    const staffName = new Map(staff.map((s) => [s.id, s.name]));
    const rate =
      (rule ? numFromConfig(rule.config, ['percentage', 'percent', 'rate', 'commission', 'value']) : undefined) ??
      DEFAULT_SALES_PCT;

    const grouped = new Map<number | null, { name: string; base: number }>();
    for (const s of subs) {
      const id = s.sales_id ?? null;
      const name = (id != null && staffName.get(id)) || UNASSIGNED;
      const g = grouped.get(id) ?? { name, base: 0 };
      g.base += toNum(s.subscription_value);
      grouped.set(id, g);
    }

    return [...grouped.entries()].map(([personId, g]) => ({
      personId,
      personName: g.name,
      base: money(g.base),
      rate,
      commission: money(g.base * (rate / 100)),
    }));
  }

  private async calcTrainer(
    kind: ClubCommissionKind,
    from?: string | null,
    to?: string | null,
    branchId?: number | null,
  ): Promise<CommissionRow[]> {
    const [classes, rule, trainers] = await Promise.all([
      this.prisma.club_classes.findMany({
        where: {
          is_deleted: false,
          ...(branchId != null ? { branch_id: branchId } : {}),
          ...this.dateRange('class_date', from, to),
        },
        select: { trainer_id: true, price: true },
      }),
      this.activeRule(kind, branchId),
      this.prisma.club_trainers.findMany({
        where: { is_deleted: false },
        select: { id: true, name: true },
      }),
    ]);

    const trainerName = new Map(trainers.map((t) => [t.id, t.name]));
    const perClass = kind === ClubCommissionKind.instructor_class_rate;
    const rate = perClass
      ? (rule ? numFromConfig(rule.config, ['rate', 'amount', 'perClass', 'value']) : undefined) ??
        DEFAULT_CLASS_RATE
      : (rule ? numFromConfig(rule.config, ['percentage', 'percent', 'rate', 'commission', 'value']) : undefined) ??
        DEFAULT_TRAINER_PCT;

    // For per-class instructor rate, base = class count; else base = class revenue.
    const grouped = new Map<number, { count: number; revenue: number }>();
    for (const c of classes) {
      const g = grouped.get(c.trainer_id) ?? { count: 0, revenue: 0 };
      g.count += 1;
      g.revenue += toNum(c.price);
      grouped.set(c.trainer_id, g);
    }

    return [...grouped.entries()].map(([trainerId, g]) => {
      const base = perClass ? g.count : g.revenue;
      const commission = perClass ? g.count * rate : g.revenue * (rate / 100);
      return {
        personId: trainerId,
        personName: trainerName.get(trainerId) ?? `Trainer #${trainerId}`,
        base: money(base),
        rate,
        commission: money(commission),
      };
    });
  }

  /**
   * Recompute server-side then write one club_financial_entries row per person
   * (entry_type employee_commission). Zero/negative commissions are skipped.
   */
  async payout(body: {
    kind: string;
    from?: string | null;
    to?: string | null;
    branchId?: number | null;
    closedBy?: string | null;
  }): Promise<{ written: number; total: number }> {
    const result = await this.calculate(body.kind, body.from, body.to, body.branchId);
    const entryDate = body.to ?? new Date().toISOString().slice(0, 10);

    const payable = result.rows.filter((r) => r.commission > 0);
    let total = 0;
    for (const r of payable) {
      await this.prisma.club_financial_entries.create({
        data: {
          entry_type: 'employee_commission',
          title: `Commission — ${r.personName}`,
          amount: new Prisma.Decimal(r.commission),
          entry_date: entryDate,
          employee_id: r.personId,
          employee_name: r.personName,
          branch_id: body.branchId ?? null,
          notes: `${result.kind} commission ${result.from ?? ''}..${result.to ?? ''}`.trim(),
          status: 'posted',
        },
      });
      total += r.commission;
    }

    return { written: payable.length, total: money(total) };
  }

  listRules() {
    return this.prisma.club_commission_rules
      .findMany({
        where: { is_deleted: false },
        orderBy: [{ kind: 'asc' }, { updated_at: 'desc' }],
      })
      .then((rows) => rows.map((r) => mapRow(r as unknown as Record<string, unknown>)));
  }

  async updateRule(
    id: number,
    body: { config?: unknown; name?: string; isActive?: boolean },
  ) {
    const existing = await this.prisma.club_commission_rules.findFirst({
      where: { id, is_deleted: false },
    });
    if (!existing) throw new NotFoundException('Commission rule not found');

    const data: Prisma.club_commission_rulesUpdateInput = {};
    if (body.config !== undefined) {
      data.config = body.config as Prisma.InputJsonValue;
    }
    if (body.name !== undefined) data.name = body.name.trim();
    if (body.isActive !== undefined) data.is_active = body.isActive;

    const row = await this.prisma.club_commission_rules.update({ where: { id }, data });
    return mapRow(row as unknown as Record<string, unknown>);
  }
}
