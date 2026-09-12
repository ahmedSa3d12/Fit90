import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ListAvailabilityDto } from './dto/list-availability.dto';
import { UpsertSlotDto } from './dto/upsert-slot.dto';
import { GenerateMonthDto } from './dto/generate-month.dto';
import { JwtUser } from '../../common/types/jwt-user';
import { EmployeeDataScopeService } from '../../common/employee-scope/employee-data-scope.service';
import { availableAppointmentTimes } from './appointment-time.util';


type SlotRow = {
  id: number;
  module_type: string;
  branch_id: number | null;
  trainer_id: number | null;
  service_id: number | null;
  slot_date: string;
  start_time: string;
  end_time: string;
  capacity: number;
  booked_count: number;
  is_active: boolean;
  is_deleted: boolean;
  created_at: Date;
  updated_at: Date;
};

@Injectable()
export class AvailabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly employeeScope?: EmployeeDataScopeService,
  ) {}

  private map(r: SlotRow) {
    return {
      id: r.id,
      moduleType: r.module_type,
      branchId: r.branch_id,
      trainerId: r.trainer_id,
      serviceId: r.service_id,
      slotDate: r.slot_date,
      startTime: r.start_time,
      endTime: r.end_time,
      capacity: r.capacity,
      bookedCount: r.booked_count,
      isActive: r.is_active,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }

  async list(q: ListAvailabilityDto, user?: JwtUser) {
    const and: Prisma.club_availability_slotsWhereInput[] = [{ is_deleted: false }];
    if (q.moduleType) and.push({ module_type: q.moduleType });
    if (q.branchId != null) and.push({ branch_id: q.branchId });
    const trainerId = q.moduleType === 'nutrition' && this.employeeScope?.isSelfOnly(user)
      ? await this.employeeScope.providerId(user)
      : q.trainerId;
    if (trainerId != null) and.push({ trainer_id: trainerId });
    if (q.dateFrom) and.push({ slot_date: { gte: q.dateFrom } });
    if (q.dateTo) and.push({ slot_date: { lte: q.dateTo } });
    const where: Prisma.club_availability_slotsWhereInput = { AND: and };
    const rows = await this.prisma.club_availability_slots.findMany({
      where,
      orderBy: [{ slot_date: 'asc' }, { start_time: 'asc' }],
    });
    return rows.map((r) => this.map(r));
  }

  /** Bookable slots (active, not full) for a given module/date. */
  async available(
    moduleType: string,
    date: string,
    branchId?: number,
    trainerId?: number,
  ) {
    const and: Prisma.club_availability_slotsWhereInput[] = [
      { is_deleted: false },
      { is_active: true },
      { module_type: moduleType },
      { slot_date: date },
    ];
    if (branchId != null) and.push({ branch_id: branchId });
    if (trainerId != null) and.push({ trainer_id: trainerId });
    const rows = await this.prisma.club_availability_slots.findMany({
      where: { AND: and },
      orderBy: [{ start_time: 'asc' }],
    });
    return rows.filter((r) => r.booked_count < r.capacity).map((r) => this.map(r));
  }

  /**
   * True when a non-deleted club_classes for `trainerId` on `date` overlaps the
   * [startTime, endTime) window. Overlap test: existing.start < end AND
   * existing.end > start (half-open), on the shared HH:mm(:ss) string scale.
   */
  private async hasClassConflict(
    trainerId: number,
    date: string,
    startTime: string,
    endTime: string,
  ): Promise<boolean> {
    const conflict = await this.prisma.club_classes.findFirst({
      where: {
        is_deleted: false,
        trainer_id: trainerId,
        class_date: date,
        start_time: { lt: endTime },
        end_time: { gt: startTime },
      },
      select: { id: true },
    });
    return conflict != null;
  }

  async nutritionAvailableTimes(
    serviceId: number,
    trainerId: number,
    date: string,
    branchId?: number,
  ) {
    const service = await this.prisma.club_services.findFirst({
      where: { id: serviceId, category: 'nutrition', is_active: true, is_deleted: false },
      select: {
        id: true,
        name: true,
        duration_min: true,
        price: true,
        entitlement_key: true,
      },
    });
    if (!service) throw new NotFoundException('Nutrition service not found.');

    const windows = await this.prisma.club_availability_slots.findMany({
      where: {
        module_type: 'nutrition',
        trainer_id: trainerId,
        slot_date: date,
        is_active: true,
        is_deleted: false,
        cancelled_at: null,
        monthly_availability: { is: { category: 'nutrition', status: 'published' } },
        AND: [
          { OR: [{ booking_start_at: null }, { booking_start_at: { lte: new Date() } }] },
          { OR: [{ booking_end_at: null }, { booking_end_at: { gte: new Date() } }] },
        ],
        ...(branchId != null ? { branch_id: branchId } : {}),
      },
      select: { id: true, start_time: true, end_time: true, booking_start_at: true, booking_end_at: true, monthly_availability_id: true },
      orderBy: { start_time: 'asc' },
    });
    const bookings = await this.prisma.club_bookings.findMany({
      where: {
        employee_id: trainerId,
        booking_date: date,
        is_deleted: false,
        status: { in: ['pending', 'confirmed', 'completed'] },
        service: { category: 'nutrition' },
      },
      select: { schedule: { select: { start_time: true, end_time: true } } },
    });
    const occupied = bookings
      .filter((booking) => booking.schedule != null)
      .map((booking) => ({
        startTime: booking.schedule!.start_time,
        endTime: booking.schedule!.end_time,
      }));
    const now = this.cairoNow();
    const times = windows.flatMap((window) =>
      availableAppointmentTimes(
        { startTime: window.start_time, endTime: window.end_time },
        service.duration_min,
        occupied,
      ).map((time) => ({
        windowId: window.id,
        availabilitySlotId: window.id,
        monthlyAvailabilityId: window.monthly_availability_id,
        bookingStartAt: window.booking_start_at?.toISOString() ?? null,
        bookingEndAt: window.booking_end_at?.toISOString() ?? null,
        ...time,
      })),
    ).filter((time) => date > now.date || (date === now.date && time.startTime > now.time));
    return {
      service: {
        id: service.id,
        name: service.name,
        durationMin: service.duration_min,
        price: service.price.toString(),
        entitlementKey: service.entitlement_key,
      },
      trainerId,
      date,
      times,
    };
  }
  private cairoNow() {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date());
    const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
    return { date: `${value('year')}-${value('month')}-${value('day')}`, time: `${value('hour')}:${value('minute')}` };
  }

  private validateSlotDate(date: string) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    if (!match) throw new BadRequestException('Availability date must be yyyy-mm-dd.');
    const probe = new Date(`${date}T12:00:00`);
    if (Number.isNaN(probe.getTime())
      || probe.getFullYear() !== Number(match[1])
      || probe.getMonth() + 1 !== Number(match[2])
      || probe.getDate() !== Number(match[3])) {
      throw new BadRequestException('Availability date is not a valid calendar date.');
    }
  }

  private async hasProviderAvailabilityConflict(
    moduleType: string,
    trainerId: number,
    date: string,
    startTime: string,
    endTime: string,
    excludeId?: number,
  ) {
    const conflict = await this.prisma.club_availability_slots.findFirst({
      where: {
        is_deleted: false,
        module_type: moduleType,
        trainer_id: trainerId,
        slot_date: date,
        start_time: { lt: endTime },
        end_time: { gt: startTime },
        ...(excludeId != null ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
    return conflict != null;
  }

  async create(dto: UpsertSlotDto, user?: JwtUser) {
    this.validateSlotDate(dto.slotDate);
    if (dto.moduleType === 'nutrition') {
      throw new BadRequestException('Manage nutrition attendance through provider monthly plans.');
    }
    if (dto.endTime <= dto.startTime) throw new BadRequestException('Availability end must be after start.');

    // Availability conflict with classes: for a class slot tied to a trainer,
    // reject if it overlaps an existing (non-deleted) class for that trainer.
    if (dto.moduleType === 'class' && dto.trainerId != null) {
      const conflict = await this.hasClassConflict(
        dto.trainerId,
        dto.slotDate,
        dto.startTime,
        dto.endTime,
      );
      if (conflict) {
        throw new BadRequestException(
          `Slot overlaps an existing class for trainer ${dto.trainerId} on ${dto.slotDate} ${dto.startTime}-${dto.endTime}.`,
        );
      }
    }
    const row = await this.prisma.club_availability_slots.create({
      data: {
        module_type: dto.moduleType,
        branch_id: dto.branchId ?? null,
        trainer_id: dto.trainerId ?? null,
        service_id: dto.serviceId ?? null,
        slot_date: dto.slotDate,
        start_time: dto.startTime,
        end_time: dto.endTime,
        capacity: dto.capacity ?? 1,
        is_active: dto.isActive ?? true,
      },
    });
    return this.map(row);
  }

  async update(id: number, dto: UpsertSlotDto, user?: JwtUser) {
    const existing = await this.prisma.club_availability_slots.findFirst({
      where: { id, is_deleted: false },
    });
    if (!existing) throw new NotFoundException('Availability slot not found');
    if (existing.module_type === 'nutrition' || dto.moduleType === 'nutrition') {
      throw new BadRequestException('Manage nutrition attendance through provider monthly plans.');
    }
    const nextModuleType = dto.moduleType ?? existing.module_type;
    const nextTrainerId = dto.trainerId === undefined ? existing.trainer_id : dto.trainerId;
    const nextDate = dto.slotDate ?? existing.slot_date;
    const nextStart = dto.startTime ?? existing.start_time;
    const nextEnd = dto.endTime ?? existing.end_time;
    this.validateSlotDate(nextDate);
    const nextServiceId = dto.serviceId === undefined ? existing.service_id : dto.serviceId;
    if (nextEnd <= nextStart) throw new BadRequestException('Availability end must be after start.');

    const row = await this.prisma.club_availability_slots.update({
      where: { id },
      data: {
        ...(dto.moduleType != null ? { module_type: dto.moduleType } : {}),
        ...(dto.branchId !== undefined ? { branch_id: dto.branchId } : {}),
        ...(dto.trainerId !== undefined ? { trainer_id: dto.trainerId } : {}),
        ...(dto.serviceId !== undefined ? { service_id: dto.serviceId } : {}),
        ...(dto.slotDate != null ? { slot_date: dto.slotDate } : {}),
        ...(dto.startTime != null ? { start_time: dto.startTime } : {}),
        ...(dto.endTime != null ? { end_time: dto.endTime } : {}),
        ...(dto.capacity !== undefined ? { capacity: dto.capacity } : {}),
        ...(dto.isActive !== undefined ? { is_active: dto.isActive } : {}),
      },
    });
    return this.map(row);
  }

  async remove(id: number, user?: JwtUser) {
    const existing = await this.prisma.club_availability_slots.findFirst({
      where: { id, is_deleted: false },
    });
    if (!existing) throw new NotFoundException('Availability slot not found');
    if (existing.module_type === 'nutrition') {
      throw new BadRequestException('Manage nutrition attendance through provider monthly plans.');
    }

    await this.prisma.club_availability_slots.update({
      where: { id },
      data: { is_deleted: true },
    });
    return { success: true };
  }

  private activeNutritionWindowBookings(windowId: number) {
    return this.prisma.club_bookings.count({
      where: {
        is_deleted: false,
        status: { in: ['pending', 'confirmed'] },
        schedule: { notes: `nutrition-availability:${windowId}` },
      },
    });
  }

  /**
   * Generate slots for every day in `month` (yyyy-mm) whose weekday matches a
   * template. Days are built by iterating 1..31 and validating each candidate
   * date (never using Date.now() / new Date() with no args), so invalid days
   * such as the 31st of a short month are dropped automatically.
   * Skips any (slot_date + start_time + module_type) that already exists.
   */
  async generateMonth(dto: GenerateMonthDto, user?: JwtUser) {
    if (dto.moduleType === 'nutrition') {
      throw new BadRequestException('Manage nutrition attendance through provider monthly plans.');
    }

    const [yearStr, monthStr] = dto.month.split('-');
    const year = parseInt(yearStr, 10);
    const monthNum = parseInt(monthStr, 10); // 1..12

    const capacity = dto.capacity ?? 1;
    let created = 0;
    let skippedConflicts = 0;

    for (let day = 1; day <= 31; day++) {
      const dateStr = `${yearStr}-${monthStr}-${String(day).padStart(2, '0')}`;
      const probe = new Date(`${dateStr}T12:00:00`);
      // Drop invalid dates (e.g. 2024-02-31 rolls over to March).
      if (Number.isNaN(probe.getTime())) continue;
      if (probe.getFullYear() !== year || probe.getMonth() + 1 !== monthNum) continue;

      const weekday = probe.getDay(); // 0..6

      for (const tpl of dto.templates) {
        if (tpl.weekday !== weekday) continue;

        const exists = await this.prisma.club_availability_slots.findFirst({
          where: {
            is_deleted: false,
            module_type: dto.moduleType,
            slot_date: dateStr,
            start_time: tpl.startTime,
            branch_id: dto.branchId ?? null,
            trainer_id: dto.trainerId ?? null,
          },
        });
        if (exists) continue;


        // Skip class slots that overlap an existing class for this trainer.
        if (dto.moduleType === 'class' && dto.trainerId != null) {
          const conflict = await this.hasClassConflict(
            dto.trainerId,
            dateStr,
            tpl.startTime,
            tpl.endTime,
          );
          if (conflict) {
            skippedConflicts++;
            continue;
          }
        }

        await this.prisma.club_availability_slots.create({
          data: {
            module_type: dto.moduleType,
            branch_id: dto.branchId ?? null,
            trainer_id: dto.trainerId ?? null,
            slot_date: dateStr,
            start_time: tpl.startTime,
            end_time: tpl.endTime,
            capacity,
            is_active: true,
          },
        });
        created++;
      }
    }

    return { created, skippedConflicts };
  }
}
