import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UpsertSalesStaffDto } from './dto/upsert-sales-staff.dto';

@Injectable()
export class ClubSalesStaffService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const rows = await this.prisma.club_sales_staff.findMany({
      where: { is_active: true, is_deleted: false },
      orderBy: { name: 'asc' },
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      phone: r.phone,
      branchId: r.branch_id,
      isActive: r.is_active,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  async create(dto: UpsertSalesStaffDto) {
    const row = await this.prisma.club_sales_staff.create({
      data: {
        name: dto.name.trim(),
        phone: dto.phone?.trim() ?? null,
        branch_id: dto.branchId ?? null,
        is_active: dto.isActive ?? true,
      },
    });
    return {
      id: row.id,
      name: row.name,
      phone: row.phone,
      branchId: row.branch_id,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async update(id: number, dto: UpsertSalesStaffDto) {
    const existing = await this.prisma.club_sales_staff.findUnique({ where: { id } });
    if (!existing || existing.is_deleted) throw new NotFoundException('Sales staff not found');
    const row = await this.prisma.club_sales_staff.update({
      where: { id },
      data: {
        ...(dto.name != null ? { name: dto.name.trim() } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone?.trim() ?? null } : {}),
        ...(dto.branchId !== undefined ? { branch_id: dto.branchId ?? null } : {}),
        ...(dto.isActive !== undefined ? { is_active: dto.isActive } : {}),
      },
    });
    return {
      id: row.id,
      name: row.name,
      phone: row.phone,
      branchId: row.branch_id,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async remove(id: number) {
    const existing = await this.prisma.club_sales_staff.findUnique({ where: { id } });
    if (!existing || existing.is_deleted) throw new NotFoundException('Sales staff not found');
    // Soft delete: mark the record as deleted instead of removing it.
    await this.prisma.club_sales_staff.update({
      where: { id },
      data: { is_deleted: true },
    });
    return { success: true };
  }
}
