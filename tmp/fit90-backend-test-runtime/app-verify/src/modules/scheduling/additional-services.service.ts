import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  AdditionalServiceStatusDto,
  ClassAdditionalServiceDto,
  CreateAdditionalServiceDto,
  ListAdditionalServicesDto,
  SlotAdditionalServiceItemDto,
  UpdateAdditionalServiceDto,
  UpdateClassAdditionalServiceDto,
} from './dto/additional-service.dto';

@Injectable()
export class AdditionalServicesService {
  constructor(private readonly prisma: PrismaService) {}

  list(query: ListAdditionalServicesDto) {
    return this.prisma.club_services.findMany({
      where: {
        category: 'additional',
        is_deleted: false,
        ...(query.status === 'active' ? { is_active: true } : {}),
        ...(query.status === 'inactive' ? { is_active: false } : {}),
        ...(query.search?.trim()
          ? {
              OR: [
                { name: { contains: query.search.trim() } },
                { description: { contains: query.search.trim() } },
              ],
            }
          : {}),
      },
      orderBy: [{ is_active: 'desc' }, { name: 'asc' }],
    }).then((rows) => rows.map((row) => this.mapService(row)));
  }

  async findOne(id: number) {
    const service = await this.getAdditionalService(id);
    return this.mapService(service);
  }

  async create(dto: CreateAdditionalServiceDto) {
    if (!dto.name.trim()) throw new BadRequestException('اسم الخدمة مطلوب.');
    const service = await this.prisma.club_services.create({
      data: {
        name: dto.name.trim(),
        category: 'additional',
        description: dto.description?.trim() || null,
        duration_min: dto.durationMin ?? 60,
        price: new Prisma.Decimal(dto.price ?? 0),
        is_active: dto.isActive ?? true,
      },
    });
    return this.mapService(service);
  }

  async update(id: number, dto: UpdateAdditionalServiceDto) {
    await this.getAdditionalService(id);
    if (dto.name !== undefined && !dto.name.trim()) {
      throw new BadRequestException('اسم الخدمة مطلوب.');
    }
    const service = await this.prisma.club_services.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description.trim() || null }
          : {}),
        ...(dto.durationMin !== undefined ? { duration_min: dto.durationMin } : {}),
        ...(dto.price !== undefined ? { price: new Prisma.Decimal(dto.price) } : {}),
      },
    });
    return this.mapService(service);
  }

  async setStatus(id: number, dto: AdditionalServiceStatusDto) {
    await this.getAdditionalService(id);
    const service = await this.prisma.club_services.update({
      where: { id },
      data: { is_active: dto.status === 'active' },
    });
    return this.mapService(service);
  }

  async remove(id: number) {
    await this.getAdditionalService(id);
    await this.prisma.club_services.update({
      where: { id },
      data: { is_deleted: true, is_active: false },
    });
    return { success: true };
  }

  async addToClass(classId: number, dto: ClassAdditionalServiceDto) {
    await this.assertClassAndActiveService(classId, dto.serviceId);
    if (dto.isRequired && !dto.isActive) {
      throw new BadRequestException('لا يمكن تعطيل خدمة إجبارية.');
    }
    const existing = await this.prisma.club_class_additional_services.findUnique({
      where: { class_id_service_id: { class_id: classId, service_id: dto.serviceId } },
    });
    if (existing) throw new ConflictException('الخدمة مرتبطة بالكلاس بالفعل.');
    return this.prisma.club_class_additional_services.create({
      data: {
        class_id: classId,
        service_id: dto.serviceId,
        is_required: dto.isRequired,
        is_active: dto.isActive,
      },
      include: { service: { select: { id: true, name: true, is_active: true } } },
    });
  }

  async updateClassLink(
    classId: number,
    serviceId: number,
    dto: UpdateClassAdditionalServiceDto,
  ) {
    await this.assertClassAndActiveService(classId, serviceId);
    const link = await this.getClassLink(classId, serviceId);
    const isRequired = dto.isRequired ?? link.is_required;
    const isActive = dto.isActive ?? link.is_active;
    if (isRequired && !isActive) throw new BadRequestException('لا يمكن تعطيل خدمة إجبارية.');
    return this.prisma.club_class_additional_services.update({
      where: { id: link.id },
      data: {
        ...(dto.isRequired !== undefined ? { is_required: dto.isRequired } : {}),
        ...(dto.isActive !== undefined ? { is_active: dto.isActive } : {}),
      },
      include: { service: { select: { id: true, name: true, is_active: true } } },
    });
  }

  async removeFromClass(classId: number, serviceId: number) {
    const link = await this.getClassLink(classId, serviceId);
    const historicalUses = await this.prisma.club_slot_additional_services.count({
      where: {
        service_id: serviceId,
        slot: { monthly_schedule: { class_id: classId } },
      },
    });
    if (historicalUses > 0) {
      await this.prisma.club_class_additional_services.update({
        where: { id: link.id },
        data: { is_active: false, is_required: false },
      });
      return { success: true, disabled: true };
    }
    await this.prisma.club_class_additional_services.delete({ where: { id: link.id } });
    return { success: true, disabled: false };
  }

  async getSlotServices(slotId: number) {
    const slot = await this.prisma.club_class_schedule_slots.findUnique({
      where: { id: slotId },
      select: { id: true, capacity: true, monthly_schedule: { select: { class_id: true } } },
    });
    if (!slot) throw new NotFoundException('موعد الكلاس غير موجود.');
    const [classLinks, slotRows] = await Promise.all([
      this.prisma.club_class_additional_services.findMany({
        where: {
          class_id: slot.monthly_schedule.class_id,
          is_active: true,
          service: { category: { in: ['class', 'additional'] }, is_active: true, is_deleted: false },
        },
        include: { service: { select: { id: true, name: true, is_active: true } } },
        orderBy: { service: { name: 'asc' } },
      }),
      this.prisma.club_slot_additional_services.findMany({ where: { slot_id: slotId } }),
    ]);
    const slotRowByService = new Map(slotRows.map((row) => [row.service_id, row]));
    return classLinks.map((link) => {
      const slotRow = slotRowByService.get(link.service_id);
      return {
        id: slotRow?.id ?? null,
        serviceId: link.service_id,
        name: link.service.name,
        capacity: slotRow?.capacity ?? slot.capacity,
        isRequired: Boolean(link.is_required || slotRow?.is_required),
        isActive: true,
        serviceIsActive: link.service.is_active,
      };
    });
  }

  setSlotServices(slotId: number, services: SlotAdditionalServiceItemDto[]) {
    return this.prisma.$transaction(async (tx) => {
      const slot = await tx.club_class_schedule_slots.findUnique({
        where: { id: slotId },
        include: { monthly_schedule: true },
      });
      if (!slot) throw new NotFoundException('موعد الكلاس غير موجود.');
      if (slot.monthly_schedule.status === 'archived') {
        throw new ConflictException('لا يمكن تعديل خدمات موعد تابع لجدول مؤرشف.');
      }
      await this.validateSlotServiceItems(tx, slot.monthly_schedule.class_id, services);
      await this.upsertSlotServiceItems(tx, slot.id, services, true);
      return tx.club_slot_additional_services.findMany({
        where: { slot_id: slot.id },
        include: { service: { select: { id: true, name: true, is_active: true } } },
        orderBy: { service: { name: 'asc' } },
      });
    });
  }

  async validateSlotServiceItems(
    tx: Prisma.TransactionClient,
    classId: number,
    services: SlotAdditionalServiceItemDto[],
  ) {
    const ids = services.map((item) => item.serviceId);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException('لا يمكن تكرار الخدمة داخل الطلب.');
    }
    if (services.some((item) => item.isRequired && !item.isActive)) {
      throw new BadRequestException('لا يمكن تعطيل خدمة إجبارية.');
    }
    const [activeServices, activeLinks] = await Promise.all([
      tx.club_services.findMany({
        where: { id: { in: ids }, category: 'additional', is_active: true, is_deleted: false },
        select: { id: true },
      }),
      tx.club_class_additional_services.findMany({
        where: { class_id: classId, is_active: true },
        select: { service_id: true, is_required: true },
      }),
    ]);
    const activeServiceIds = new Set(activeServices.map((item) => item.id));
    const linkByService = new Map(activeLinks.map((item) => [item.service_id, item]));
    for (const item of services) {
      if (!activeServiceIds.has(item.serviceId)) {
        throw new BadRequestException(`الخدمة ${item.serviceId} غير موجودة أو غير مفعلة.`);
      }
      if (!linkByService.has(item.serviceId)) {
        throw new BadRequestException(`الخدمة ${item.serviceId} غير مرتبطة بكلاس الموعد.`);
      }
    }
    for (const link of activeLinks.filter((item) => item.is_required)) {
      const item = services.find((service) => service.serviceId === link.service_id);
      if (!item || !item.isActive || !item.isRequired) {
        throw new BadRequestException(`الخدمة الإجبارية ${link.service_id} يجب أن تبقى مفعلة وإجبارية.`);
      }
    }
  }

  async upsertSlotServiceItems(
    tx: Prisma.TransactionClient,
    slotId: number,
    services: SlotAdditionalServiceItemDto[],
    disableOmitted: boolean,
  ) {
    if (disableOmitted) {
      await tx.club_slot_additional_services.updateMany({
        where: {
          slot_id: slotId,
          ...(services.length ? { service_id: { notIn: services.map((item) => item.serviceId) } } : {}),
        },
        data: { is_active: false },
      });
    }
    for (const item of services) {
      await tx.club_slot_additional_services.upsert({
        where: { slot_id_service_id: { slot_id: slotId, service_id: item.serviceId } },
        create: {
          slot_id: slotId,
          service_id: item.serviceId,
          capacity: item.capacity,
          is_required: item.isRequired,
          is_active: item.isActive,
        },
        update: {
          capacity: item.capacity,
          is_required: item.isRequired,
          is_active: item.isActive,
        },
      });
    }
  }

  private async assertClassAndActiveService(classId: number, serviceId: number) {
    const [classRecord, service] = await Promise.all([
      this.prisma.club_classes.findFirst({ where: { id: classId, is_deleted: false } }),
      this.prisma.club_services.findFirst({
        where: { id: serviceId, category: 'additional', is_active: true, is_deleted: false },
      }),
    ]);
    if (!classRecord) throw new NotFoundException('الكلاس غير موجود.');
    if (!service) throw new BadRequestException('الخدمة غير موجودة أو غير مفعلة.');
  }

  private async getAdditionalService(id: number) {
    const service = await this.prisma.club_services.findFirst({
      where: { id, category: 'additional', is_deleted: false },
    });
    if (!service) throw new NotFoundException('الخدمة الإضافية غير موجودة.');
    return service;
  }

  private async getClassLink(classId: number, serviceId: number) {
    const link = await this.prisma.club_class_additional_services.findUnique({
      where: { class_id_service_id: { class_id: classId, service_id: serviceId } },
    });
    if (!link) throw new NotFoundException('الخدمة غير مرتبطة بالكلاس.');
    return link;
  }

  private mapService(service: {
    id: number;
    name: string;
    description: string | null;
    duration_min: number;
    price: Prisma.Decimal;
    is_active: boolean;
    created_at: Date;
    updated_at: Date;
  }) {
    return {
      id: service.id,
      name: service.name,
      description: service.description,
      durationMin: service.duration_min,
      price: service.price.toString(),
      status: service.is_active ? 'active' : 'inactive',
      createdAt: service.created_at,
      updatedAt: service.updated_at,
    };
  }
}
