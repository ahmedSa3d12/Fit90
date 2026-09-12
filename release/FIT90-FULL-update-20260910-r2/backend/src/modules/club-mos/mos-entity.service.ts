import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtUser } from '../../common/types/jwt-user';
import { ClubMembersService } from '../club-members/club-members.service';
import { paginated } from '../../common/dto/list-result';
import { bodyToDb, mapRow } from './mos-camel.util';
import { MOS_ENTITIES, type MosEntityConfig } from './mos-entity.registry';
import { ListMosEntityDto } from './dto/list-mos-entity.dto';

type PrismaDelegate = {
  findMany: (args: Record<string, unknown>) => Promise<Record<string, unknown>[]>;
  count: (args: Record<string, unknown>) => Promise<number>;
  findFirst: (args: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
  create: (args: Record<string, unknown>) => Promise<Record<string, unknown>>;
  update: (args: Record<string, unknown>) => Promise<Record<string, unknown>>;
  updateMany: (args: Record<string, unknown>) => Promise<{ count: number }>;
};

@Injectable()
export class MosEntityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly members: ClubMembersService,
  ) {}

  async convertLead(id: number, user: JwtUser) {
    const lead = await this.prisma.club_leads.findFirst({ where: { id, is_deleted: false } });
    if (!lead) throw new NotFoundException('LEAD_NOT_FOUND');
    if (lead.status === 'converted') throw new ConflictException('LEAD_ALREADY_CONVERTED');
    if (!lead.phone?.trim()) throw new BadRequestException('LEAD_PHONE_REQUIRED');

    const fallbackBranch = !lead.branch_id && !(user.branch > 0)
      ? await this.prisma.tbl_branches.findFirst({ orderBy: { branch_id: 'asc' }, select: { branch_id: true } })
      : null;
    const branchId = lead.branch_id ?? (user.branch > 0 ? user.branch : fallbackBranch?.branch_id);
    if (!branchId) throw new BadRequestException('LEAD_BRANCH_REQUIRED');

    return this.members.create({
      branchId,
      name: lead.name,
      phone: lead.phone,
      email: lead.email ?? undefined,
      gender: lead.gender === 'female' ? 'female' : 'male',
      sourceId: lead.source_id ?? undefined,
      salesId: lead.assigned_to ?? undefined,
      notes: lead.notes ?? undefined,
      autoCreateUser: true,
      isActive: true,
    }, user, async (tx) => {
      await tx.club_leads.update({ where: { id }, data: { status: 'converted' } });
    });
  }

  private delegate(model: string, client: unknown = this.prisma): PrismaDelegate {
    const d = (client as Record<string, PrismaDelegate>)[model];
    if (!d) throw new BadRequestException(`Unknown model: ${model}`);
    return d;
  }

  getConfig(key: string): MosEntityConfig {
    const cfg = MOS_ENTITIES[key];
    if (!cfg) throw new NotFoundException(`Unknown MOS entity: ${key}`);
    return cfg;
  }

  list(key: string, q: ListMosEntityDto) {
    const cfg = this.getConfig(key);
    const delegate = this.delegate(cfg.model);
    const where: Record<string, unknown> = { is_deleted: false, ...cfg.defaultWhere };

    if (q.branchId != null) where.branch_id = q.branchId;
    if (q.status && !(key === 'leads' && q.status === 'converted')) where.status = q.status;
    else if (key === 'leads') where.status = { not: 'converted' };
    if (cfg.dateField && (q.dateFrom || q.dateTo)) {
      where[cfg.dateField] = {
        ...(q.dateFrom ? { gte: q.dateFrom } : {}),
        ...(q.dateTo ? { lte: q.dateTo } : {}),
      };
    }

    if (q.search?.trim()) {
      const term = q.search.trim();
      where.OR = cfg.searchFields.map((f) => ({ [f]: { contains: term } }));
    }

    return Promise.all([
      delegate.findMany({
        where,
        orderBy: cfg.orderBy ?? { id: 'desc' },
        skip: q.skip,
        take: q.take,
      }),
      delegate.count({ where }),
    ]).then(([rows, total]) =>
      paginated(rows.map((r) => mapRow(r)), total, q.page, q.pageSize),
    );
  }

  statistics(key: string, q: ListMosEntityDto) {
    const cfg = this.getConfig(key);
    const delegate = this.delegate(cfg.model);
    const where: Record<string, unknown> = { is_deleted: false, ...cfg.defaultWhere };
    if (q.branchId != null) where.branch_id = q.branchId;
    if (q.status && !(key === 'leads' && q.status === 'converted')) where.status = q.status;
    else if (key === 'leads') where.status = { not: 'converted' };
    if (cfg.dateField && (q.dateFrom || q.dateTo)) {
      where[cfg.dateField] = {
        ...(q.dateFrom ? { gte: q.dateFrom } : {}),
        ...(q.dateTo ? { lte: q.dateTo } : {}),
      };
    }

    return delegate.findMany({ where, select: { id: true, status: true } }).then((rows) => {
      const byStatus: Record<string, number> = {};
      for (const r of rows) {
        const s = String(r.status ?? 'unknown');
        byStatus[s] = (byStatus[s] ?? 0) + 1;
      }
      return { total: rows.length, byStatus };
    });
  }

  async findOne(key: string, id: number) {
    const cfg = this.getConfig(key);
    const row = await this.delegate(cfg.model).findFirst({
      where: { id, is_deleted: false, ...cfg.defaultWhere },
    });
    if (!row) throw new NotFoundException('Record not found');
    return mapRow(row);
  }

  async create(key: string, body: Record<string, unknown>) {
    if (key === 'leads' && body.status === 'converted') {
      throw new BadRequestException('LEAD_STATUS_MANAGED_BY_CONVERSION');
    }
    const cfg = this.getConfig(key);
    for (const f of cfg.requiredOnCreate) {
      if (body[f] == null || body[f] === '') {
        throw new BadRequestException(`${f} is required`);
      }
    }

    const data = bodyToDb(body);
    for (const f of cfg.writable) {
      if (!(camelToSnakeField(f) in data) && body[f] !== undefined) {
        data[camelToSnakeField(f)] = body[f];
      }
    }

    // Pick only writable snake fields
    const picked: Record<string, unknown> = {};
    for (const f of cfg.writable) {
      const snake = camelToSnakeField(f);
      if (data[snake] !== undefined) picked[snake] = data[snake];
    }
    if (cfg.createData) Object.assign(picked, cfg.createData);
    else if (cfg.defaultWhere) Object.assign(picked, cfg.defaultWhere);

    const row = key === 'leads'
      ? await this.prisma.$transaction(async (tx) => {
          const created = await this.delegate(cfg.model, tx).create({ data: picked });
          await this.syncLeadReminder(tx, created);
          return created;
        })
      : await this.delegate(cfg.model).create({ data: picked });
    return mapRow(row);
  }

  async update(key: string, id: number, body: Record<string, unknown>) {
    if (key === 'leads' && body.status === 'converted') {
      throw new BadRequestException('LEAD_STATUS_MANAGED_BY_CONVERSION');
    }
    await this.findOne(key, id);
    const cfg = this.getConfig(key);
    const data = bodyToDb(body);
    const picked: Record<string, unknown> = {};
    for (const f of cfg.writable) {
      const snake = camelToSnakeField(f);
      if (data[snake] !== undefined) picked[snake] = data[snake];
    }

    const row = key === 'leads'
      ? await this.prisma.$transaction(async (tx) => {
          const updated = await this.delegate(cfg.model, tx).update({ where: { id }, data: picked });
          await this.syncLeadReminder(tx, updated);
          return updated;
        })
      : await this.delegate(cfg.model).update({ where: { id }, data: picked });
    return mapRow(row);
  }

  async remove(key: string, id: number) {
    await this.findOne(key, id);
    const cfg = this.getConfig(key);
    if (key === 'leads') {
      await this.prisma.$transaction(async (tx) => {
        await this.delegate(cfg.model, tx).update({
          where: { id },
          data: { is_deleted: true },
        });
        await this.delegate('club_reminders', tx).updateMany({
          where: { lead_id: id, is_deleted: false },
          data: { is_deleted: true },
        });
      });
    } else {
      await this.delegate(cfg.model).update({
        where: { id },
        data: { is_deleted: true },
      });
    }
    return { success: true };
  }

  private async syncLeadReminder(client: unknown, lead: Record<string, unknown>) {
    const leadId = Number(lead.id);
    const name = String(lead.name ?? '').trim();
    const followUpAt = String(lead.follow_up_at ?? '').trim();
    const reminders = this.delegate('club_reminders', client);
    const existing = await reminders.findFirst({ where: { lead_id: leadId } });

    if (!followUpAt) {
      if (existing && existing.is_deleted !== true) {
        await reminders.update({ where: { id: existing.id }, data: { is_deleted: true } });
      }
      return;
    }

    const data = {
      lead_id: leadId,
      member_name: name,
      title: `متابعة العضو: ${name}`,
      reminder_date: followUpAt,
      branch_id: lead.branch_id ?? null,
      is_deleted: false,
    };

    if (existing) {
      await reminders.update({ where: { id: existing.id }, data });
    } else {
      await reminders.create({ data: { ...data, status: 'pending', channel: 'call' } });
    }
  }

  async patchApproval(id: number, status: 'approved' | 'declined', reviewedBy?: string) {
    const row = await this.prisma.club_approval_items.findFirst({
      where: { id, is_deleted: false },
    });
    if (!row) throw new NotFoundException('Approval item not found');

    const updated = await this.prisma.club_approval_items.update({
      where: { id },
      data: {
        status,
        reviewed_by: reviewedBy ?? null,
        reviewed_at: new Date(),
      },
    });
    return mapRow(updated as unknown as Record<string, unknown>);
  }
}

function camelToSnakeField(key: string): string {
  return key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}
