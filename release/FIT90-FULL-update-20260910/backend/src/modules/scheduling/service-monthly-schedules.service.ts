import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtUser } from '../../common/types/jwt-user';
import { EmployeeDataScopeService } from '../../common/employee-scope/employee-data-scope.service';
import {
  CreateServiceMonthlyScheduleDto,
  ListServiceMonthlySchedulesDto,
} from './dto/service-monthly-schedule.dto';

@Injectable()
export class ServiceMonthlySchedulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly employeeScope: EmployeeDataScopeService,
  ) {}

  private readonly include = {
    service: { select: { id: true, name: true, category: true, capacity: true, duration_min: true } },
    slots: {
      where: { is_deleted: false },
      orderBy: [{ slot_date: 'asc' as const }, { start_time: 'asc' as const }],
    },
  };

  private async withProvider<T extends { employee_id: number }>(rows: T[]) {
    const ids = [...new Set(rows.map((row) => row.employee_id))];
    const providers = await this.prisma.club_trainers.findMany({
      where: { id: { in: ids }, is_deleted: false },
      select: { id: true, name: true },
    });
    const names = new Map(providers.map((provider) => [provider.id, provider.name]));
    return rows.map((row) => ({
      ...row,
      employeeId: row.employee_id,
      trainer: { id: row.employee_id, name: names.get(row.employee_id) ?? `#${row.employee_id}` },
      _count: { slots: 'slots' in row && Array.isArray(row.slots) ? row.slots.length : 0 },
    }));
  }

  async create(dto: CreateServiceMonthlyScheduleDto, user?: JwtUser) {
    if (dto.category === 'nutrition') {
      throw new BadRequestException('Nutrition uses provider attendance without a service-bound monthly schedule.');
    }
    const employeeId = await this.employeeScope.scopedProviderId(user, dto.employeeId);
    if (employeeId == null) throw new NotFoundException('Service provider not found.');
    const [service, provider] = await Promise.all([
      this.prisma.club_services.findFirst({
        where: { id: dto.serviceId, category: dto.category, is_active: true, is_deleted: false },
      }),
      this.prisma.club_trainers.findFirst({
        where: { id: employeeId, is_active: true, is_deleted: false },
      }),
    ]);
    if (!service) throw new NotFoundException('Service not found in this department.');
    if (!provider) throw new NotFoundException('Service provider not found.');

    const duplicate = await this.prisma.club_service_monthly_schedules.findUnique({
      where: {
        service_id_employee_id_month_year: {
          service_id: dto.serviceId,
          employee_id: employeeId,
          month: dto.month,
          year: dto.year,
        },
      },
    });
    if (duplicate) throw new ConflictException('An identical monthly schedule already exists.');

    const created = await this.prisma.club_service_monthly_schedules.create({
      data: {
        service_id: dto.serviceId,
        employee_id: employeeId,
        category: dto.category,
        month: dto.month,
        year: dto.year,
      },
      include: this.include,
    });
    return (await this.withProvider([created]))[0];
  }

  async list(query: ListServiceMonthlySchedulesDto, user?: JwtUser) {
    const ownProviderId = this.employeeScope.isSelfOnly(user)
      ? await this.employeeScope.providerId(user)
      : null;
    const where: Prisma.club_service_monthly_schedulesWhereInput = {
      ...(query.category ? { category: query.category } : {}),
      ...(query.serviceId ? { service_id: query.serviceId } : {}),
      ...(this.employeeScope.isSelfOnly(user)
        ? { employee_id: ownProviderId ?? -1 }
        : query.employeeId
          ? { employee_id: query.employeeId }
          : {}),
    };
    const rows = await this.prisma.club_service_monthly_schedules.findMany({
      where,
      include: this.include,
      orderBy: [{ year: 'desc' }, { month: 'desc' }, { id: 'desc' }],
    });
    return this.withProvider(rows);
  }

  async findOne(id: number, user?: JwtUser) {
    const row = await this.prisma.club_service_monthly_schedules.findUnique({
      where: { id },
      include: this.include,
    });
    if (!row) throw new NotFoundException('Monthly schedule not found.');
    await this.employeeScope.assertProviderAccess(user, row.employee_id);
    return (await this.withProvider([row]))[0];
  }

  async publish(id: number, user?: JwtUser) {
    const plan = await this.prisma.club_service_monthly_schedules.findUnique({
      where: { id },
      include: { slots: { where: { is_deleted: false }, select: { id: true } } },
    });
    if (!plan) throw new NotFoundException('Monthly schedule not found.');
    await this.employeeScope.assertProviderAccess(user, plan.employee_id);
    if (plan.status !== 'draft') throw new ConflictException('Only draft schedules can be published.');
    if (!plan.slots.length) throw new BadRequestException('Add at least one appointment before publishing.');
    await this.prisma.$transaction([
      this.prisma.club_service_monthly_schedules.update({
        where: { id },
        data: { status: 'published', published_at: new Date() },
      }),
      this.prisma.club_schedules.updateMany({
        where: { monthly_schedule_id: id, is_deleted: false, status: 'hidden' },
        data: { status: 'available' },
      }),
    ]);
    return this.findOne(id, user);
  }

  async archive(id: number, user?: JwtUser) {
    const plan = await this.prisma.club_service_monthly_schedules.findUnique({ where: { id } });
    if (!plan) throw new NotFoundException('Monthly schedule not found.');
    await this.employeeScope.assertProviderAccess(user, plan.employee_id);
    await this.prisma.$transaction([
      this.prisma.club_service_monthly_schedules.update({ where: { id }, data: { status: 'archived' } }),
      this.prisma.club_schedules.updateMany({
        where: { monthly_schedule_id: id, is_deleted: false, status: 'available' },
        data: { status: 'hidden' },
      }),
    ]);
    return this.findOne(id, user);
  }

  async remove(id: number, user?: JwtUser) {
    const plan = await this.prisma.club_service_monthly_schedules.findUnique({
      where: { id },
      include: { slots: { select: { id: true } } },
    });
    if (!plan) throw new NotFoundException('Monthly schedule not found.');
    await this.employeeScope.assertProviderAccess(user, plan.employee_id);
    if (plan.status !== 'draft') throw new ConflictException('Only draft schedules can be deleted.');
    const slotIds = plan.slots.map((slot) => slot.id);
    const bookings = slotIds.length
      ? await this.prisma.club_bookings.count({ where: { schedule_id: { in: slotIds }, is_deleted: false } })
      : 0;
    if (bookings) throw new ConflictException('This schedule has bookings and cannot be deleted.');
    await this.prisma.$transaction([
      this.prisma.club_schedules.updateMany({
        where: { monthly_schedule_id: id },
        data: { is_deleted: true, monthly_schedule_id: null },
      }),
      this.prisma.club_service_monthly_schedules.delete({ where: { id } }),
    ]);
    return { success: true };
  }
}
