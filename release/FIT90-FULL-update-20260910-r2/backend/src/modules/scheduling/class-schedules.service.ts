import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtUser } from '../../common/types/jwt-user';
import { EmployeeDataScopeService } from '../../common/employee-scope/employee-data-scope.service';
import {
  CreateClassMonthlyScheduleDto,
  ListClassMonthlySchedulesDto,
} from './dto/class-monthly-schedule.dto';
import {
  CreateClassScheduleSlotDto,
  UpdateClassScheduleSlotDto,
} from './dto/class-schedule-slot.dto';
import { CreateRecurringClassSlotsDto } from './dto/recurring-class-slots.dto';
import { AdditionalServicesService } from './additional-services.service';
import { SlotAdditionalServiceItemDto } from './dto/additional-service.dto';

const TRAINER_CONFLICT_MESSAGE =
  'لا يمكن إضافة الموعد لأن المدرب لديه كلاس آخر في هذا التوقيت.';
const BUSINESS_TIME_ZONE = 'Africa/Cairo';

type SlotValues = {
  startAt: Date;
  endAt: Date;
  bookingStartAt: Date | null;
  bookingEndAt: Date | null;
  capacity: number;
  status: 'available' | 'unavailable' | 'cancelled';
};

type SlotCandidate = SlotValues & {
  originalDate?: string;
  services?: SlotAdditionalServiceItemDto[];
};

@Injectable()
export class ClassSchedulesService {
  private readonly log = new Logger(ClassSchedulesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly additionalServices: AdditionalServicesService,
    private readonly employeeScope: EmployeeDataScopeService,
  ) {}

  private readonly scheduleInclude = {
    class: {
      select: {
        id: true,
        name: true,
        name_en: true,
        code: true,
      },
    },
    trainer: {
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        specialization: true,
      },
    },
    slots: { orderBy: { start_at: 'asc' as const } },
  };

  async createSchedule(dto: CreateClassMonthlyScheduleDto, user?: JwtUser) {
    const trainerId = await this.employeeScope.scopedProviderId(user, dto.trainerId);
    if (trainerId == null) throw new NotFoundException('المدرب غير موجود.');
    const [classRecord, trainer] = await Promise.all([
      this.prisma.club_lookups.findFirst({
        where: { id: dto.classId, category: 'class_type', is_active: true },
        select: { id: true },
      }),
      this.prisma.club_trainers.findFirst({
        where: { id: trainerId, is_deleted: false },
        select: { id: true },
      }),
    ]);
    if (!classRecord) throw new NotFoundException('الكلاس غير موجود.');
    if (!trainer) throw new NotFoundException('المدرب غير موجود.');
    const duplicate = await this.prisma.club_class_monthly_schedules.findUnique({
      where: {
        class_id_trainer_id_month_year: {
          class_id: dto.classId,
          trainer_id: trainerId,
          month: dto.month,
          year: dto.year,
        },
      },
      select: { id: true },
    });
    if (duplicate) throw new ConflictException('يوجد جدول شهري مطابق بالفعل.');

    return this.prisma.club_class_monthly_schedules.create({
      data: {
        class_id: dto.classId,
        trainer_id: trainerId,
        month: dto.month,
        year: dto.year,
        status: 'draft',
      },
      include: this.scheduleInclude,
    });
  }

  async listSchedules(query: ListClassMonthlySchedulesDto, user?: JwtUser) {
    const ownTrainerId = this.employeeScope.isSelfOnly(user)
      ? await this.employeeScope.providerId(user)
      : null;
    const where: Prisma.club_class_monthly_schedulesWhereInput = {
      ...(query.classId != null ? { class_id: query.classId } : {}),
      ...(this.employeeScope.isSelfOnly(user)
        ? { trainer_id: ownTrainerId ?? -1 }
        : query.trainerId != null
          ? { trainer_id: query.trainerId }
          : {}),
      ...(query.month != null ? { month: query.month } : {}),
      ...(query.year != null ? { year: query.year } : {}),
      ...(query.status != null ? { status: query.status } : {}),
    };
    return this.prisma.club_class_monthly_schedules.findMany({
      where,
      include: {
        class: { select: { id: true, name: true, name_en: true, code: true } },
        trainer: { select: { id: true, name: true, specialization: true } },
        _count: { select: { slots: true } },
      },
      orderBy: [{ year: 'desc' }, { month: 'desc' }, { id: 'desc' }],
    });
  }

  async getSchedule(id: number, user?: JwtUser) {
    const schedule = await this.prisma.club_class_monthly_schedules.findUnique({
      where: { id },
      include: this.scheduleInclude,
    });
    if (!schedule) throw new NotFoundException('الجدول الشهري غير موجود.');
    await this.employeeScope.assertProviderAccess(user, schedule.trainer_id);
    return schedule;
  }

  async createSlot(scheduleId: number, dto: CreateClassScheduleSlotDto, user?: JwtUser) {
    const schedule = await this.getScheduleRecord(scheduleId);
    await this.employeeScope.assertProviderAccess(user, schedule.trainer_id);
    this.assertScheduleEditable(schedule.status);
    const values = this.slotValues(dto);
    this.validateSlot(values, schedule.month, schedule.year);
    await this.assertNoTrainerConflict(
      this.prisma,
      schedule.trainer_id,
      values.startAt,
      values.endAt,
      values.status,
    );

    return this.prisma.club_class_schedule_slots.create({
      data: {
        monthly_schedule_id: schedule.id,
        start_at: values.startAt,
        end_at: values.endAt,
        booking_start_at: values.bookingStartAt,
        booking_end_at: values.bookingEndAt,
        capacity: values.capacity,
        status: values.status,
      },
    });
  }

  async createRecurringSlots(scheduleId: number, dto: CreateRecurringClassSlotsDto, user?: JwtUser) {
    const ownedSchedule = await this.getScheduleRecord(scheduleId);
    await this.employeeScope.assertProviderAccess(user, ownedSchedule.trainer_id);
    return this.prisma.$transaction(async (tx) => {
      const schedule = await tx.club_class_monthly_schedules.findUnique({
        where: { id: scheduleId },
      });
      if (!schedule) throw new NotFoundException('الجدول الشهري غير موجود.');
      if (schedule.status !== 'draft') {
        throw new ConflictException('يمكن إضافة المواعيد المتكررة إلى جدول draft فقط.');
      }

      const wantedDays = new Set(dto.weekDays);
      const daysInMonth = new Date(Date.UTC(schedule.year, schedule.month, 0)).getUTCDate();
      const bookingStartAt = new Date(dto.bookingStartAt);
      const templateStartAt = dto.templateStartAt ? new Date(dto.templateStartAt) : null;
      const templateBookingEndAt = dto.bookingEndAt ? new Date(dto.bookingEndAt) : null;
      if (!templateBookingEndAt && !dto.bookingEndRule) {
        throw new BadRequestException('يجب تحديد وقت غلق الحجز أو قاعدة غلق الحجز.');
      }
      const bookingStartOffsetMs = templateStartAt
        ? templateStartAt.getTime() - bookingStartAt.getTime()
        : null;
      const bookingEndOffsetMs = templateStartAt && templateBookingEndAt
        ? templateStartAt.getTime() - templateBookingEndAt.getTime()
        : null;
      const candidates: SlotCandidate[] = [];
      for (let day = 1; day <= daysInMonth; day += 1) {
        const weekDay = new Date(Date.UTC(schedule.year, schedule.month - 1, day)).getUTCDay();
        if (!wantedDays.has(weekDay)) continue;
        const startAt = this.localDateTime(schedule.year, schedule.month, day, dto.startTime);
        const endAt = this.localDateTime(schedule.year, schedule.month, day, dto.endTime);
        const occurrenceBookingStartAt = bookingStartOffsetMs == null
          ? bookingStartAt
          : new Date(startAt.getTime() - bookingStartOffsetMs);
        const bookingEndAt = bookingEndOffsetMs == null
          ? new Date(startAt.getTime() - (dto.bookingEndRule?.value ?? 0) * 60_000)
          : new Date(startAt.getTime() - bookingEndOffsetMs);
        const candidate: SlotCandidate = {
          startAt,
          endAt,
          bookingStartAt: occurrenceBookingStartAt,
          bookingEndAt,
          capacity: dto.capacity,
          status: dto.status,
        };
        this.validateSlot(candidate, schedule.month, schedule.year);
        candidates.push(candidate);
      }

      const conflicts = await this.collectTrainerConflictDates(
        tx,
        schedule.trainer_id,
        candidates,
      );
      this.throwConflicts(conflicts);

      if (dto.services) {
        await this.additionalServices.validateSlotServiceItems(
          tx,
          schedule.class_id,
          dto.services,
        );
      }
      const slots: Array<{ id: number }> = [];
      for (const slot of candidates) {
        const created = await tx.club_class_schedule_slots.create({
          data: {
          monthly_schedule_id: schedule.id,
          start_at: slot.startAt,
          end_at: slot.endAt,
          booking_start_at: slot.bookingStartAt,
          booking_end_at: slot.bookingEndAt,
          capacity: slot.capacity,
          status: slot.status,
          },
        });
        if (dto.services?.length) {
          await this.additionalServices.upsertSlotServiceItems(
            tx,
            created.id,
            dto.services,
            false,
          );
        }
        slots.push(created);
      }
      return { createdSlotsCount: slots.length, slots };
    });
  }

  async copyPreviousMonth(scheduleId: number, user?: JwtUser) {
    const ownedSchedule = await this.getScheduleRecord(scheduleId);
    await this.employeeScope.assertProviderAccess(user, ownedSchedule.trainer_id);
    return this.prisma.$transaction(async (tx) => {
      const schedule = await tx.club_class_monthly_schedules.findUnique({
        where: { id: scheduleId },
        include: { slots: true },
      });
      if (!schedule) throw new NotFoundException('الجدول الشهري غير موجود.');
      if (schedule.status !== 'draft') {
        throw new ConflictException('يمكن النسخ إلى جدول draft فقط.');
      }

      const previousMonth = schedule.month === 1 ? 12 : schedule.month - 1;
      const previousYear = schedule.month === 1 ? schedule.year - 1 : schedule.year;
      const previous = await tx.club_class_monthly_schedules.findUnique({
        where: {
          class_id_trainer_id_month_year: {
            class_id: schedule.class_id,
            trainer_id: schedule.trainer_id,
            month: previousMonth,
            year: previousYear,
          },
        },
        include: {
          slots: {
            where: { status: { not: 'cancelled' } },
            orderBy: { start_at: 'asc' },
            include: { additional_services: true },
          },
        },
      });
      if (!previous) throw new NotFoundException('لا يوجد جدول للشهر السابق لنفس الكلاس والمدرب.');

      const daysInTarget = new Date(Date.UTC(schedule.year, schedule.month, 0)).getUTCDate();
      const existingKeys = new Set(
        schedule.slots.map((slot) => `${slot.start_at.getTime()}:${slot.end_at.getTime()}`),
      );
      const skippedSlots: Array<{ originalDate: string; reason: string }> = [];
      const candidates: SlotCandidate[] = [];

      for (const source of previous.slots) {
        const sourceParts = this.localParts(source.start_at);
        const originalDate = this.formatLocalDate(source.start_at);
        if (sourceParts.day > daysInTarget) {
          skippedSlots.push({ originalDate, reason: 'اليوم غير موجود في الشهر الجديد' });
          continue;
        }
        const startAt = this.localDateTime(
          schedule.year,
          schedule.month,
          sourceParts.day,
          this.formatTime(source.start_at),
        );
        const endAt = new Date(startAt.getTime() + (source.end_at.getTime() - source.start_at.getTime()));
        const bookingStartAt = source.booking_start_at
          ? new Date(startAt.getTime() + (source.booking_start_at.getTime() - source.start_at.getTime()))
          : null;
        const bookingEndAt = source.booking_end_at
          ? new Date(startAt.getTime() + (source.booking_end_at.getTime() - source.start_at.getTime()))
          : null;
        const key = `${startAt.getTime()}:${endAt.getTime()}`;
        if (existingKeys.has(key)) {
          skippedSlots.push({ originalDate, reason: 'الموعد موجود بالفعل في الجدول الحالي' });
          continue;
        }
        existingKeys.add(key);
        const candidate: SlotCandidate = {
          startAt,
          endAt,
          bookingStartAt,
          bookingEndAt,
          capacity: source.capacity,
          status: source.status,
          originalDate,
          services: source.additional_services.map((item) => ({
            serviceId: item.service_id,
            capacity: item.capacity,
            isRequired: item.is_required,
            isActive: item.is_active,
          })),
        };
        this.validateSlot(candidate, schedule.month, schedule.year);
        candidates.push(candidate);
      }

      const conflicts = await this.collectTrainerConflictDates(
        tx,
        schedule.trainer_id,
        candidates,
      );
      this.throwConflicts(conflicts);

      if (candidates.length > 0) {
        for (const slot of candidates) {
          const created = await tx.club_class_schedule_slots.create({
            data: {
            monthly_schedule_id: schedule.id,
            start_at: slot.startAt,
            end_at: slot.endAt,
            booking_start_at: slot.bookingStartAt,
            booking_end_at: slot.bookingEndAt,
            capacity: slot.capacity,
            status: slot.status,
            },
          });
          if (slot.services?.length) {
            await this.additionalServices.upsertSlotServiceItems(
              tx,
              created.id,
              slot.services,
              false,
            );
          }
        }
      }
      return {
        copiedSlotsCount: candidates.length,
        skippedSlotsCount: skippedSlots.length,
        skippedSlots,
      };
    });
  }

  async updateSlot(slotId: number, dto: UpdateClassScheduleSlotDto, user?: JwtUser) {
    const slot = await this.getSlot(slotId);
    await this.employeeScope.assertProviderAccess(user, slot.monthly_schedule.trainer_id);
    this.assertScheduleEditable(slot.monthly_schedule.status);
    const values = this.slotValues(dto, {
      startAt: slot.start_at,
      endAt: slot.end_at,
      bookingStartAt: slot.booking_start_at,
      bookingEndAt: slot.booking_end_at,
      capacity: slot.capacity,
      status: slot.status,
    });
    this.validateSlot(values, slot.monthly_schedule.month, slot.monthly_schedule.year);
    await this.assertNoTrainerConflict(
      this.prisma,
      slot.monthly_schedule.trainer_id,
      values.startAt,
      values.endAt,
      values.status,
      slot.id,
    );

    return this.prisma.club_class_schedule_slots.update({
      where: { id: slot.id },
      data: {
        start_at: values.startAt,
        end_at: values.endAt,
        booking_start_at: values.bookingStartAt,
        booking_end_at: values.bookingEndAt,
        capacity: values.capacity,
        status: values.status,
      },
    });
  }

  async deleteSlot(slotId: number, user?: JwtUser) {
    const slot = await this.getSlot(slotId);
    await this.employeeScope.assertProviderAccess(user, slot.monthly_schedule.trainer_id);
    this.assertScheduleEditable(slot.monthly_schedule.status);
    const bookings = await this.prisma.club_class_bookings.count({ where: { slot_id: slot.id } });
    if (bookings > 0) {
      throw new ConflictException('لا يمكن حذف الموعد لوجود حجوزات مرتبطة به. استخدم الإلغاء.');
    }
    await this.prisma.club_class_schedule_slots.delete({ where: { id: slot.id } });
    return { success: true };
  }

  async cancelSlot(slotId: number, user?: JwtUser) {
    const ownedSlot = await this.getSlot(slotId);
    await this.employeeScope.assertProviderAccess(user, ownedSlot.monthly_schedule.trainer_id);
    const result = await this.prisma.$transaction(async (tx) => {
      const slot = await tx.club_class_schedule_slots.findUnique({
        where: { id: slotId },
        include: {
          monthly_schedule: { include: { class: { select: { name: true } } } },
          bookings: {
            where: { status: { in: ['confirmed', 'wait'] } },
            include: {
              member: { select: { id: true, name: true, app_user_id: true, branch_id: true } },
              user: { select: { user_id: true, name: true } },
            },
          },
        },
      });
      if (!slot) throw new NotFoundException('موعد الكلاس غير موجود.');
      this.assertScheduleEditable(slot.monthly_schedule.status);
      if (slot.status === 'cancelled') {
        return { slot, bookings: [] };
      }

      const cancelledAt = new Date();
      const bookingIds = slot.bookings.map((booking) => booking.id);
      const updated = await tx.club_class_schedule_slots.update({
        where: { id: slot.id },
        data: { status: 'cancelled' },
      });
      if (bookingIds.length) {
        await tx.club_class_bookings.updateMany({
          where: { id: { in: bookingIds } },
          data: { status: 'cancelled', cancelled_at: cancelledAt },
        });
        await tx.club_booking_additional_services.updateMany({
          where: { booking_id: { in: bookingIds }, status: 'confirmed' },
          data: { status: 'cancelled' },
        });
      }
      return { slot: { ...slot, ...updated }, bookings: slot.bookings };
    });

    if (result.bookings.length) {
      try {
        const bookingIds = result.bookings.map((booking) => booking.id);
        const sessionDate = new Intl.DateTimeFormat('ar-EG', {
          timeZone: BUSINESS_TIME_ZONE,
          dateStyle: 'medium',
          timeStyle: 'short',
        }).format(result.slot.start_at);
        await this.prisma.$transaction([
          this.prisma.club_notifications.updateMany({
            where: { booking_id: { in: bookingIds }, type: 'appointment_reminder', status: 'pending' },
            data: { status: 'cancelled' },
          }),
          this.prisma.club_notifications.createMany({
            data: result.bookings.map((booking) => ({
              type: 'booking_cancelled' as const,
              booking_id: booking.id,
              schedule_id: result.slot.monthly_schedule_id,
              member_id: booking.member_id,
              to_user: booking.user_id ?? booking.member?.app_user_id ?? null,
              title: 'إلغاء موعد الكلاس',
              message: `تم إلغاء موعد ${result.slot.monthly_schedule.class.name} بتاريخ ${sessionDate}.`,
              status: 'sent',
              channel: 'in_app',
              branch_id: booking.member?.branch_id ?? null,
            })),
          }),
        ]);
      } catch (err) {
        this.log.warn(
          `failed to record cancellation notifications for class slot #${slotId}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    return { slot: result.slot, notifiedBookingsCount: result.bookings.length };
  }

  async publishSchedule(id: number, user?: JwtUser) {
    const ownedSchedule = await this.getScheduleRecord(id);
    await this.employeeScope.assertProviderAccess(user, ownedSchedule.trainer_id);
    return this.prisma.$transaction(async (tx) => {
      const schedule = await tx.club_class_monthly_schedules.findUnique({
        where: { id },
        include: { slots: { orderBy: { start_at: 'asc' } } },
      });
      if (!schedule) throw new NotFoundException('الجدول الشهري غير موجود.');
      if (schedule.status !== 'draft') {
        throw new ConflictException('يمكن نشر الجداول الموجودة بحالة draft فقط.');
      }
      const activeSlots = schedule.slots.filter((slot) => slot.status !== 'cancelled');
      if (activeSlots.length === 0) {
        throw new BadRequestException('يجب أن يحتوي الجدول على موعد واحد صالح على الأقل.');
      }

      for (const slot of schedule.slots) {
        const values: SlotValues = {
          startAt: slot.start_at,
          endAt: slot.end_at,
          bookingStartAt: slot.booking_start_at,
          bookingEndAt: slot.booking_end_at,
          capacity: slot.capacity,
          status: slot.status,
        };
        this.validateSlot(values, schedule.month, schedule.year);
      }
      const conflicts = await this.collectTrainerConflictDates(
        tx,
        schedule.trainer_id,
        activeSlots.map((slot) => ({
          startAt: slot.start_at,
          endAt: slot.end_at,
          bookingStartAt: slot.booking_start_at,
          bookingEndAt: slot.booking_end_at,
          capacity: slot.capacity,
          status: slot.status,
        })),
        schedule.slots.map((slot) => slot.id),
      );
      this.throwConflicts(conflicts);

      return tx.club_class_monthly_schedules.update({
        where: { id: schedule.id },
        data: { status: 'published', published_at: new Date() },
        include: this.scheduleInclude,
      });
    });
  }

  async archiveSchedule(id: number, user?: JwtUser) {
    const schedule = await this.getScheduleRecord(id);
    await this.employeeScope.assertProviderAccess(user, schedule.trainer_id);
    if (schedule.status === 'archived') return schedule;
    return this.prisma.club_class_monthly_schedules.update({
      where: { id: schedule.id },
      data: { status: 'archived' },
      include: this.scheduleInclude,
    });
  }

  async deleteSchedule(id: number, user?: JwtUser) {
    const schedule = await this.getScheduleRecord(id);
    await this.employeeScope.assertProviderAccess(user, schedule.trainer_id);
    if (schedule.status !== 'draft') {
      throw new ConflictException('يمكن حذف الجداول الموجودة بحالة draft فقط.');
    }
    const bookings = await this.prisma.club_class_bookings.count({
      where: { slot: { monthly_schedule_id: schedule.id } },
    });
    if (bookings > 0) {
      throw new ConflictException('لا يمكن حذف الجدول لوجود حجوزات مرتبطة بمواعيده.');
    }
    await this.prisma.club_class_monthly_schedules.delete({ where: { id: schedule.id } });
    return { success: true };
  }

  private async getScheduleRecord(id: number) {
    const schedule = await this.prisma.club_class_monthly_schedules.findUnique({ where: { id } });
    if (!schedule) throw new NotFoundException('الجدول الشهري غير موجود.');
    return schedule;
  }

  private async getSlot(id: number) {
    const slot = await this.prisma.club_class_schedule_slots.findUnique({
      where: { id },
      include: { monthly_schedule: true },
    });
    if (!slot) throw new NotFoundException('موعد الكلاس غير موجود.');
    return slot;
  }

  private assertScheduleEditable(status: string) {
    if (status === 'archived') {
      throw new ConflictException('لا يمكن تعديل جدول مؤرشف.');
    }
  }

  private slotValues(
    dto: CreateClassScheduleSlotDto | UpdateClassScheduleSlotDto,
    current?: SlotValues,
  ): SlotValues {
    const value = (raw: string | undefined, fallback: Date | null | undefined) =>
      raw !== undefined ? new Date(raw) : (fallback ?? null);
    const startAt = value(dto.startAt, current?.startAt);
    const endAt = value(dto.endAt, current?.endAt);
    if (!startAt || !endAt) throw new BadRequestException('وقت بداية ونهاية الموعد مطلوبان.');
    return {
      startAt,
      endAt,
      bookingStartAt: value(dto.bookingStartAt, current?.bookingStartAt),
      bookingEndAt: value(dto.bookingEndAt, current?.bookingEndAt),
      capacity: dto.capacity ?? current?.capacity ?? 0,
      status: dto.status ?? current?.status ?? 'available',
    };
  }

  private validateSlot(values: SlotValues, month: number, year: number) {
    if (values.endAt <= values.startAt) {
      throw new BadRequestException('يجب أن يكون endAt بعد startAt.');
    }
    if ((values.bookingStartAt == null) !== (values.bookingEndAt == null)) {
      throw new BadRequestException('يجب إرسال bookingStartAt و bookingEndAt معًا.');
    }
    if (
      values.bookingStartAt &&
      values.bookingEndAt &&
      values.bookingEndAt <= values.bookingStartAt
    ) {
      throw new BadRequestException('يجب أن يكون تاريخ غلق الحجز بعد تاريخ فتح الحجز.');
    }
    if (values.bookingEndAt && values.bookingEndAt > values.startAt) {
      throw new BadRequestException('يجب أن يكون تاريخ غلق الحجز قبل بداية الكلاس.');
    }
    if (values.capacity <= 0) throw new BadRequestException('يجب أن تكون capacity أكبر من صفر.');

    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: BUSINESS_TIME_ZONE,
      year: 'numeric',
      month: 'numeric',
    }).formatToParts(values.startAt);
    const startMonth = Number(parts.find((part) => part.type === 'month')?.value);
    const startYear = Number(parts.find((part) => part.type === 'year')?.value);
    if (startMonth !== month || startYear !== year) {
      throw new BadRequestException('يجب أن يكون موعد الكلاس داخل شهر وسنة الجدول.');
    }
  }

  private async assertNoTrainerConflict(
    db: Prisma.TransactionClient,
    trainerId: number,
    startAt: Date,
    endAt: Date,
    status: string,
    excludeSlotId?: number,
  ) {
    if (status === 'cancelled') return;
    const conflict = await this.trainerConflictExists(
      db,
      trainerId,
      startAt,
      endAt,
      excludeSlotId,
    );
    if (conflict) throw new ConflictException(TRAINER_CONFLICT_MESSAGE);
  }

  private async trainerConflictExists(
    db: Prisma.TransactionClient,
    trainerId: number,
    startAt: Date,
    endAt: Date,
    excludeSlotId?: number,
  ) {
    return db.club_class_schedule_slots.findFirst({
      where: {
        ...(excludeSlotId != null ? { id: { not: excludeSlotId } } : {}),
        status: { not: 'cancelled' },
        start_at: { lt: endAt },
        end_at: { gt: startAt },
        monthly_schedule: { trainer_id: trainerId },
      },
      select: { id: true },
    });
  }

  private async collectTrainerConflictDates(
    db: Prisma.TransactionClient,
    trainerId: number,
    candidates: SlotCandidate[],
    excludeSlotIds: number[] = [],
  ) {
    const conflicts: string[] = [];
    const activeCandidates = candidates.filter((slot) => slot.status !== 'cancelled');
    if (activeCandidates.length === 0) return conflicts;
    const rangeStart = new Date(Math.min(...activeCandidates.map((slot) => slot.startAt.getTime())));
    const rangeEnd = new Date(Math.max(...activeCandidates.map((slot) => slot.endAt.getTime())));
    const existing = await db.club_class_schedule_slots.findMany({
      where: {
        ...(excludeSlotIds.length ? { id: { notIn: excludeSlotIds } } : {}),
        status: { not: 'cancelled' },
        start_at: { lt: rangeEnd },
        end_at: { gt: rangeStart },
        monthly_schedule: { trainer_id: trainerId },
      },
      select: { start_at: true, end_at: true },
    });
    for (const slot of activeCandidates) {
      if (existing.some((item) => item.start_at < slot.endAt && item.end_at > slot.startAt)) {
        conflicts.push(this.formatLocalDate(slot.startAt));
      }
    }
    for (let left = 0; left < candidates.length; left += 1) {
      const first = candidates[left];
      if (first.status === 'cancelled') continue;
      for (let right = left + 1; right < candidates.length; right += 1) {
        const second = candidates[right];
        if (second.status === 'cancelled') continue;
        if (first.startAt < second.endAt && first.endAt > second.startAt) {
          conflicts.push(this.formatLocalDate(first.startAt));
          conflicts.push(this.formatLocalDate(second.startAt));
        }
      }
    }
    return [...new Set(conflicts)];
  }

  private throwConflicts(conflicts: string[]) {
    if (conflicts.length === 0) return;
    throw new ConflictException([
      TRAINER_CONFLICT_MESSAGE,
      ...conflicts.map((date) => `التاريخ المتعارض: ${date}`),
    ]);
  }

  private localParts(date: Date) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: BUSINESS_TIME_ZONE,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date);
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((item) => item.type === type)?.value);
    return {
      year: part('year'),
      month: part('month'),
      day: part('day'),
      hour: part('hour'),
      minute: part('minute'),
      second: part('second'),
    };
  }

  private localDateTime(year: number, month: number, day: number, time: string) {
    const [hour, minute] = time.split(':').map(Number);
    const intendedUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
    const probe = new Date(intendedUtc);
    const actual = this.localParts(probe);
    const representedUtc = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second,
    );
    return new Date(intendedUtc - (representedUtc - intendedUtc));
  }

  private formatLocalDate(date: Date) {
    const parts = this.localParts(date);
    return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
  }

  private formatTime(date: Date) {
    const parts = this.localParts(date);
    return `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;
  }
}
