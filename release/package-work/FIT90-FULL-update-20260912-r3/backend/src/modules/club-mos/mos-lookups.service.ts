import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { paginated } from '../../common/dto/list-result';
import { mapRow } from './mos-camel.util';
import { UpsertMosLookupDto } from './dto/list-mos-entity.dto';
import { ClubLookupCategory, Prisma } from '@prisma/client';

@Injectable()
export class MosLookupsService {
  constructor(private readonly prisma: PrismaService) {}

  private mapLookup(row: Record<string, unknown>) {
    const mapped = mapRow(row);
    if (row.category === 'class_type') {
      const metadata = row.metadata;
      const price =
        metadata && typeof metadata === 'object' && !Array.isArray(metadata)
          ? Number((metadata as Record<string, unknown>).price ?? 0)
          : 0;
      mapped.price = Number.isFinite(price) ? price : 0;
    }
    return mapped;
  }

  private assertCategory(category: string): ClubLookupCategory {
    if (!(category in ClubLookupCategory)) {
      throw new BadRequestException(`Unknown lookup category: ${category}`);
    }
    return category as ClubLookupCategory;
  }

  list(category: string) {
    const cat = this.assertCategory(category);
    return this.prisma.club_lookups
      .findMany({
        where: { category: cat, is_active: true },
        orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
      })
      .then((rows) => rows.map((r) => this.mapLookup(r as unknown as Record<string, unknown>)));
  }

  async create(category: string, body: UpsertMosLookupDto) {
    const cat = this.assertCategory(category);
    const row = await this.prisma.club_lookups.create({
      data: {
        category: cat,
        name: body.name.trim(),
        name_en: body.nameEn?.trim() ?? null,
        code: body.code?.trim() ?? null,
        sort_order: body.sortOrder ?? 0,
        is_active: body.isActive ?? true,
        ...(cat === 'class_type' && body.price !== undefined
          ? { metadata: { price: body.price } }
          : {}),
      },
    });
    return this.mapLookup(row as unknown as Record<string, unknown>);
  }

  async update(category: string, id: number, body: UpsertMosLookupDto) {
    const cat = this.assertCategory(category);
    const existing = await this.prisma.club_lookups.findFirst({ where: { id, category: cat } });
    if (!existing) throw new NotFoundException('Lookup not found');
    const existingMetadata =
      existing.metadata && typeof existing.metadata === 'object' && !Array.isArray(existing.metadata)
        ? (existing.metadata as Prisma.JsonObject)
        : {};

    const row = await this.prisma.club_lookups.update({
      where: { id },
      data: {
        name: body.name?.trim() ?? existing.name,
        name_en: body.nameEn !== undefined ? body.nameEn?.trim() ?? null : existing.name_en,
        code: body.code !== undefined ? body.code?.trim() ?? null : existing.code,
        sort_order: body.sortOrder ?? existing.sort_order,
        is_active: body.isActive ?? existing.is_active,
        ...(cat === 'class_type' && body.price !== undefined
          ? { metadata: { ...existingMetadata, price: body.price } }
          : {}),
      },
    });
    return this.mapLookup(row as unknown as Record<string, unknown>);
  }

  async remove(category: string, id: number) {
    const cat = this.assertCategory(category);
    const existing = await this.prisma.club_lookups.findFirst({ where: { id, category: cat } });
    if (!existing) throw new NotFoundException('Lookup not found');
    await this.prisma.club_lookups.update({ where: { id }, data: { is_active: false } });
    return { success: true };
  }
}
