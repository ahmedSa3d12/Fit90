import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { paginated } from '../../common/dto/list-result';
import { UpsertLostFoundDto } from './dto/upsert-lost-found.dto';
import { ListLostFoundDto } from './dto/list-lost-found.dto';
import { DeliverLostFoundDto } from './dto/deliver-lost-found.dto';

/** Number of whole days between a yyyy-mm-dd string and today (UTC, floored). */
function ageDaysFrom(found?: string | null, now: Date = new Date()): number | null {
  if (!found) return null;
  const m = found.trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (!m) return null;
  const y = +m[1];
  const mo = +m[2];
  const d = +m[3];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const foundUtc = Date.UTC(y, mo - 1, d);
  if (isNaN(foundUtc)) return null;
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const days = Math.floor((todayUtc - foundUtc) / 86_400_000);
  return days >= 0 ? days : 0;
}

const STALE_AGE_DAYS = 30;

type LostFoundRow = {
  id: number;
  item_name: string;
  description: string | null;
  staff_name: string | null;
  found_date: string;
  found_time: string | null;
  action_taken: string | null;
  branch_id: number | null;
  status: string;
  delivered_to: string | null;
  delivered_phone: string | null;
  delivered_at: string | null;
  delivered_note: string | null;
  created_at: Date;
  updated_at: Date;
};

@Injectable()
export class LostFoundService {
  constructor(private readonly prisma: PrismaService) {}

  private map(r: LostFoundRow) {
    // Aging (additive, computed only): whole days since found_date, and a
    // "stale" flag for items still stored past the stale threshold.
    const ageDays = ageDaysFrom(r.found_date);
    const isStale = r.status === 'stored' && ageDays != null && ageDays > STALE_AGE_DAYS;
    return {
      id: r.id,
      itemName: r.item_name,
      description: r.description,
      staffName: r.staff_name,
      foundDate: r.found_date,
      foundTime: r.found_time,
      actionTaken: r.action_taken,
      branchId: r.branch_id,
      status: r.status,
      deliveredTo: r.delivered_to,
      deliveredPhone: r.delivered_phone,
      deliveredAt: r.delivered_at,
      deliveredNote: r.delivered_note,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      ageDays,
      isStale,
    };
  }

  async list(q: ListLostFoundDto) {
    const and: Prisma.club_lost_foundWhereInput[] = [{ is_deleted: false }];
    if (q.status && q.status !== 'all') and.push({ status: q.status });
    if (q.branchId && q.branchId !== 'all') and.push({ branch_id: Number(q.branchId) });
    if (q.search) {
      and.push({
        OR: [
          { item_name: { contains: q.search } },
          { staff_name: { contains: q.search } },
        ],
      });
    }
    const where: Prisma.club_lost_foundWhereInput = { AND: and };
    const [rows, total] = await Promise.all([
      this.prisma.club_lost_found.findMany({ where, orderBy: { id: 'desc' }, skip: q.skip, take: q.take }),
      this.prisma.club_lost_found.count({ where }),
    ]);
    return paginated(rows.map((r) => this.map(r)), total, q.page, q.pageSize);
  }

  async statistics(branchId?: string) {
    const branchFilter = branchId && branchId !== 'all' ? Number(branchId) : undefined;
    const base: Prisma.club_lost_foundWhereInput = {
      is_deleted: false,
      ...(branchFilter ? { branch_id: branchFilter } : {}),
    };
    const [total, stored, delivered, storedRows] = await Promise.all([
      this.prisma.club_lost_found.count({ where: base }),
      this.prisma.club_lost_found.count({ where: { ...base, status: 'stored' } }),
      this.prisma.club_lost_found.count({ where: { ...base, status: 'delivered' } }),
      // Only stored items can be stale; pull just their found dates to count them.
      this.prisma.club_lost_found.findMany({
        where: { ...base, status: 'stored' },
        select: { found_date: true },
      }),
    ]);
    // staleCount (additive, computed): stored items older than the stale threshold.
    const staleCount = storedRows.reduce((n, r) => {
      const ageDays = ageDaysFrom(r.found_date);
      return ageDays != null && ageDays > STALE_AGE_DAYS ? n + 1 : n;
    }, 0);
    return { total, stored, delivered, staleCount };
  }

  async findOne(id: number) {
    const row = await this.prisma.club_lost_found.findFirst({ where: { id, is_deleted: false } });
    if (!row) throw new NotFoundException('Lost & found item not found');
    return this.map(row);
  }

  async create(dto: UpsertLostFoundDto, createdBy?: number) {
    const row = await this.prisma.club_lost_found.create({
      data: {
        item_name: dto.itemName.trim(),
        description: dto.description ?? null,
        staff_name: dto.staffName ?? null,
        found_date: dto.foundDate,
        found_time: dto.foundTime ?? null,
        action_taken: dto.actionTaken ?? null,
        branch_id: dto.branchId ?? null,
        created_by: createdBy ?? null,
      },
    });
    return this.map(row);
  }

  async update(id: number, dto: UpsertLostFoundDto) {
    await this.findOne(id);
    const row = await this.prisma.club_lost_found.update({
      where: { id },
      data: {
        ...(dto.itemName != null ? { item_name: dto.itemName.trim() } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.staffName !== undefined ? { staff_name: dto.staffName } : {}),
        ...(dto.foundDate != null ? { found_date: dto.foundDate } : {}),
        ...(dto.foundTime !== undefined ? { found_time: dto.foundTime } : {}),
        ...(dto.actionTaken !== undefined ? { action_taken: dto.actionTaken } : {}),
        ...(dto.branchId !== undefined ? { branch_id: dto.branchId } : {}),
      },
    });
    return this.map(row);
  }

  /** Mark an item as delivered / handed over (تسليم المفقود). */
  async deliver(id: number, dto: DeliverLostFoundDto) {
    const existing = await this.findOne(id);
    if (existing.status === 'delivered') {
      return existing;
    }
    const row = await this.prisma.club_lost_found.update({
      where: { id },
      data: {
        status: 'delivered',
        delivered_to: dto.deliveredTo.trim(),
        delivered_phone: dto.deliveredPhone ?? null,
        delivered_note: dto.deliveredNote ?? null,
        delivered_at: new Date().toISOString(),
      },
    });
    return this.map(row);
  }

  async remove(id: number) {
    await this.findOne(id);
    await this.prisma.club_lost_found.update({ where: { id }, data: { is_deleted: true } });
    return { success: true };
  }
}
