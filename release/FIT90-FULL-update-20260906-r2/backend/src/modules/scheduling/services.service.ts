import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { JwtUser } from '../../common/types/jwt-user';
import { paginated } from '../../common/dto/list-result';
import { ListServiceDto } from './dto/list-service.dto';
import { UpsertServiceDto } from './dto/upsert-service.dto';

type ServiceRow = {
  id: number;
  name: string;
  class_type_id: number | null;
  category: string;
  description: string | null;
  entitlement_key: string | null;
  duration_min: number;
  price: Prisma.Decimal;
  capacity: number | null;
  color: string | null;
  branch_id: number | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
};

@Injectable()
export class ServicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branchScope: BranchScopeService,
  ) {}

  private map(r: ServiceRow) {
    return {
      id: r.id,
      name: r.name,
      classTypeId: r.class_type_id,
      category: r.category,
      description: r.description,
      entitlementKey: r.entitlement_key,
      durationMin: r.duration_min,
      price: r.price.toString(),
      capacity: r.capacity,
      color: r.color,
      branchId: r.branch_id,
      isActive: r.is_active,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }

  async list(q: ListServiceDto, user?: JwtUser) {
    const and: Prisma.club_servicesWhereInput[] = [{ is_deleted: false }];
    if (q.category) and.push({ category: q.category });
    if (q.active === 'true') and.push({ is_active: true });
    else if (q.active === 'false') and.push({ is_active: false });
    if (q.search?.trim()) {
      const s = q.search.trim();
      and.push({ OR: [{ name: { contains: s } }, { description: { contains: s } }] });
    }
    const branchIds = this.branchScope.resolveListFilter(user, q.branchId);
    if (branchIds) and.push({ OR: [{ branch_id: { in: branchIds } }, { branch_id: null }] });

    const where: Prisma.club_servicesWhereInput = { AND: and };
    const orderBy = this.orderBy(q.sort, q.order);
    const [rows, total] = await Promise.all([
      this.prisma.club_services.findMany({ where, orderBy, skip: q.skip, take: q.take }),
      this.prisma.club_services.count({ where }),
    ]);
    return paginated(rows.map((r) => this.map(r)), total, q.page, q.pageSize);
  }

  private orderBy(
    sort: string | undefined,
    order: 'asc' | 'desc',
  ): Prisma.club_servicesOrderByWithRelationInput[] {
    const dir = order === 'asc' ? 'asc' : 'desc';
    switch (sort) {
      case 'name':
        return [{ name: dir }];
      case 'category':
        return [{ category: dir }, { name: 'asc' }];
      case 'price':
        return [{ price: dir }];
      case 'duration':
        return [{ duration_min: dir }];
      default:
        return [{ created_at: dir }];
    }
  }

  async findOne(id: number) {
    const row = await this.prisma.club_services.findFirst({ where: { id, is_deleted: false } });
    if (!row) throw new NotFoundException('Service not found');
    return this.map(row);
  }

  async create(dto: UpsertServiceDto) {
    if (!dto.name?.trim()) throw new BadRequestException('Service name is required');
    if (!dto.category) throw new BadRequestException('Service category is required');
    const row = await this.prisma.club_services.create({
      data: {
        name: dto.name.trim(),
        class_type_id: dto.classTypeId ?? null,
        category: dto.category,
        description: dto.description ?? null,
        entitlement_key: dto.entitlementKey ?? null,
        duration_min: dto.durationMin ?? 60,
        price: dto.price != null ? new Prisma.Decimal(dto.price) : new Prisma.Decimal(0),
        capacity: dto.capacity ?? null,
        color: dto.color ?? null,
        branch_id: dto.branchId ?? null,
        is_active: dto.isActive ?? true,
      },
    });
    return this.map(row);
  }

  async update(id: number, dto: UpsertServiceDto) {
    const existing = await this.prisma.club_services.findFirst({
      where: { id, is_deleted: false },
    });
    if (!existing) throw new NotFoundException('Service not found');
    const row = await this.prisma.club_services.update({
      where: { id },
      data: {
        ...(dto.name != null ? { name: dto.name.trim() } : {}),
        ...(dto.classTypeId !== undefined ? { class_type_id: dto.classTypeId } : {}),
        ...(dto.category != null ? { category: dto.category } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.entitlementKey !== undefined ? { entitlement_key: dto.entitlementKey } : {}),
        ...(dto.durationMin != null ? { duration_min: dto.durationMin } : {}),
        ...(dto.price != null ? { price: new Prisma.Decimal(dto.price) } : {}),
        ...(dto.capacity !== undefined ? { capacity: dto.capacity } : {}),
        ...(dto.color !== undefined ? { color: dto.color } : {}),
        ...(dto.branchId !== undefined ? { branch_id: dto.branchId } : {}),
        ...(dto.isActive !== undefined ? { is_active: dto.isActive } : {}),
      },
    });
    return this.map(row);
  }

  async remove(id: number) {
    const existing = await this.prisma.club_services.findFirst({
      where: { id, is_deleted: false },
    });
    if (!existing) throw new NotFoundException('Service not found');
    // Block delete when future available schedules still reference it.
    const activeSchedules = await this.prisma.club_schedules.count({
      where: { service_id: id, is_deleted: false, status: 'available' },
    });
    if (activeSchedules > 0) {
      throw new BadRequestException(
        `Cannot delete service: ${activeSchedules} active schedule(s) still reference it. Cancel or remove them first.`,
      );
    }
    await this.prisma.club_services.update({ where: { id }, data: { is_deleted: true } });
    return { success: true };
  }
}
