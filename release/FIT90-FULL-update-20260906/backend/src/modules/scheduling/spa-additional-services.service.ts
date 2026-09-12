import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EmployeeDataScopeService } from '../../common/employee-scope/employee-data-scope.service';
import { JwtUser } from '../../common/types/jwt-user';
import { SpaServiceAdditionalItemDto } from './dto/spa-additional-service.dto';

@Injectable()
export class SpaAdditionalServicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly employeeScope: EmployeeDataScopeService,
  ) {}

  async getServiceOptions(serviceId: number) {
    await this.assertSpaService(this.prisma, serviceId);
    const [catalog, links] = await Promise.all([
      this.prisma.club_services.findMany({
        where: { category: 'additional', is_deleted: false },
        select: { id: true, name: true, description: true, is_active: true },
        orderBy: [{ is_active: 'desc' }, { name: 'asc' }],
      }),
      this.prisma.club_service_additional_services.findMany({
        where: { parent_service_id: serviceId },
      }),
    ]);
    const byService = new Map(links.map((link) => [link.additional_service_id, link]));
    return catalog.map((service) => {
      const link = byService.get(service.id);
      return {
        serviceId: service.id,
        name: service.name,
        description: service.description,
        serviceIsActive: service.is_active,
        isActive: link?.is_active ?? false,
        isRequired: link?.is_required ?? false,
      };
    });
  }

  setServiceOptions(serviceId: number, services: SpaServiceAdditionalItemDto[]) {
    return this.prisma.$transaction(async (tx) => {
      await this.assertSpaService(tx, serviceId);
      const ids = services.map((item) => item.serviceId);
      const activeCatalog = await tx.club_services.findMany({
        where: { id: { in: ids }, category: 'additional', is_active: true, is_deleted: false },
        select: { id: true },
      });
      const activeIds = new Set(activeCatalog.map((item) => item.id));
      for (const item of services) {
        if (item.isRequired && !item.isActive) {
          throw new BadRequestException('لا يمكن تعطيل خدمة إضافية إجبارية.');
        }
        if (item.isActive && !activeIds.has(item.serviceId)) {
          throw new BadRequestException(`الخدمة الإضافية ${item.serviceId} غير موجودة أو غير مفعلة.`);
        }
      }
      await tx.club_service_additional_services.updateMany({
        where: {
          parent_service_id: serviceId,
          ...(ids.length ? { additional_service_id: { notIn: ids } } : {}),
        },
        data: { is_active: false, is_required: false },
      });
      for (const item of services) {
        await tx.club_service_additional_services.upsert({
          where: {
            parent_service_id_additional_service_id: {
              parent_service_id: serviceId,
              additional_service_id: item.serviceId,
            },
          },
          create: {
            parent_service_id: serviceId,
            additional_service_id: item.serviceId,
            is_active: item.isActive,
            is_required: item.isRequired,
          },
          update: { is_active: item.isActive, is_required: item.isRequired },
        });
      }
      return this.getServiceOptionsWith(tx, serviceId);
    });
  }

  async getScheduleOptions(scheduleId: number, user?: JwtUser) {
    const schedule = await this.prisma.club_schedules.findFirst({
      where: { id: scheduleId, is_deleted: false },
      include: { service: { select: { category: true } } },
    });
    if (!schedule || schedule.service.category !== 'spa') {
      throw new NotFoundException('موعد السبا غير موجود.');
    }
    await this.employeeScope.assertProviderAccess(user, schedule.employee_id);
    const options = await this.activeCatalogOptions(this.prisma);
    return options.map((option) => ({
      ...option,
      selected: option.serviceId === schedule.additional_service_id,
    }));
  }

  async setScheduleOption(scheduleId: number, additionalServiceId: number | null, user?: JwtUser) {
    const schedule = await this.prisma.club_schedules.findFirst({
      where: { id: scheduleId, is_deleted: false },
      include: { service: { select: { category: true } } },
    });
    if (!schedule || schedule.service.category !== 'spa') {
      throw new NotFoundException('موعد السبا غير موجود.');
    }
    await this.employeeScope.assertProviderAccess(user, schedule.employee_id);
    if (additionalServiceId != null) {
      const additionalService = await this.prisma.club_services.findFirst({
        where: { id: additionalServiceId, category: 'additional', is_active: true, is_deleted: false },
        select: { id: true },
      });
      if (!additionalService) throw new BadRequestException('الخدمة الإضافية غير موجودة أو غير مفعلة.');
    }
    const updated = await this.prisma.club_schedules.update({
      where: { id: scheduleId },
      data: { additional_service_id: additionalServiceId },
      include: { additional_service: { select: { id: true, name: true, price: true } } },
    });
    return {
      scheduleId: updated.id,
      additionalServiceId: updated.additional_service_id,
      additionalServiceName: updated.additional_service?.name ?? null,
      additionalServicePrice: updated.additional_service?.price.toString() ?? null,
    };
  }

  async getBookingOptions(bookingId: number, user?: JwtUser) {
    const booking = await this.bookingOrThrow(bookingId, user);
    const [options, selected] = await Promise.all([
      this.activeCatalogOptions(this.prisma),
      this.prisma.club_appt_booking_additional_services.findMany({
        where: { booking_id: bookingId, status: { not: 'cancelled' } },
        select: { additional_service_id: true },
      }),
    ]);
    const selectedIds = new Set(selected.map((item) => item.additional_service_id));
    return options.map((option) => ({ ...option, selected: selectedIds.has(option.serviceId) }));
  }

  async setBookingOptions(bookingId: number, requestedIds: number[], user?: JwtUser) {
    const booking = await this.bookingOrThrow(bookingId, user);
    if (booking.status === 'cancelled') {
      throw new BadRequestException('لا يمكن تعديل خدمات حجز ملغي.');
    }
    return this.prisma.$transaction(async (tx) => {
      const selectedIds = await this.validateSelection(tx, requestedIds);
      await tx.club_appt_booking_additional_services.updateMany({
        where: { booking_id: bookingId },
        data: { status: 'cancelled' },
      });
      for (const serviceId of selectedIds) {
        await tx.club_appt_booking_additional_services.upsert({
          where: {
            booking_id_additional_service_id: {
              booking_id: bookingId,
              additional_service_id: serviceId,
            },
          },
          create: { booking_id: bookingId, additional_service_id: serviceId, status: 'confirmed' },
          update: { status: booking.status === 'completed' ? 'completed' : 'confirmed' },
        });
      }
      return this.bookingSelections(tx, bookingId);
    });
  }

  async validateSelection(
    tx: Prisma.TransactionClient,
    requestedIds: number[],
  ) {
    const services = await tx.club_services.findMany({
      where: { id: { in: requestedIds }, category: 'additional', is_active: true, is_deleted: false },
      select: { id: true },
    });
    const allowed = new Set(services.map((service) => service.id));
    const invalid = requestedIds.find((id) => !allowed.has(id));
    if (invalid != null) throw new BadRequestException(`الخدمة الإضافية ${invalid} غير موجودة أو غير مفعلة.`);
    return [...new Set(requestedIds)];
  }

  private async bookingOrThrow(bookingId: number, user?: JwtUser) {
    const booking = await this.prisma.club_bookings.findFirst({
      where: { id: bookingId, is_deleted: false },
      include: { service: { select: { category: true } } },
    });
    if (!booking || booking.service.category !== 'spa') throw new NotFoundException('حجز السبا غير موجود.');
    await this.employeeScope.assertProviderAccess(user, booking.employee_id);
    return booking;
  }

  private async assertSpaService(tx: Prisma.TransactionClient | PrismaService, serviceId: number) {
    const service = await tx.club_services.findFirst({
      where: { id: serviceId, category: 'spa', is_deleted: false },
      select: { id: true },
    });
    if (!service) throw new NotFoundException('خدمة السبا غير موجودة.');
  }

  private async activeCatalogOptions(tx: Prisma.TransactionClient | PrismaService) {
    const rows = await tx.club_services.findMany({
      where: { category: 'additional', is_active: true, is_deleted: false },
      select: { id: true, name: true, description: true, price: true },
      orderBy: { name: 'asc' },
    });
    return rows.map((row) => ({
      serviceId: row.id,
      name: row.name,
      description: row.description,
      price: row.price.toString(),
      isRequired: false,
    }));
  }

  private async getServiceOptionsWith(tx: Prisma.TransactionClient, serviceId: number) {
    const [catalog, links] = await Promise.all([
      tx.club_services.findMany({
        where: { category: 'additional', is_deleted: false },
        select: { id: true, name: true, description: true, is_active: true },
        orderBy: [{ is_active: 'desc' }, { name: 'asc' }],
      }),
      tx.club_service_additional_services.findMany({ where: { parent_service_id: serviceId } }),
    ]);
    const byService = new Map(links.map((link) => [link.additional_service_id, link]));
    return catalog.map((service) => ({
      serviceId: service.id,
      name: service.name,
      description: service.description,
      serviceIsActive: service.is_active,
      isActive: byService.get(service.id)?.is_active ?? false,
      isRequired: byService.get(service.id)?.is_required ?? false,
    }));
  }

  private async bookingSelections(tx: Prisma.TransactionClient, bookingId: number) {
    const rows = await tx.club_appt_booking_additional_services.findMany({
      where: { booking_id: bookingId, status: { not: 'cancelled' } },
      include: { additional_service: { select: { id: true, name: true } } },
      orderBy: { additional_service: { name: 'asc' } },
    });
    return rows.map((row) => ({
      serviceId: row.additional_service_id,
      name: row.additional_service.name,
      status: row.status,
    }));
  }
}
