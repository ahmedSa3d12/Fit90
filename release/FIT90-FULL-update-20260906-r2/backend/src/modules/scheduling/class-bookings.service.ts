import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  AvailableClassSlotsQueryDto,
  CreateClassBookingDto,
  MyClassBookingsQueryDto,
  UpdateBookingAdditionalServicesDto,
} from './dto/class-booking.dto';
import { AdminBookingsQueryDto } from './dto/admin-bookings-query.dto';

@Injectable()
export class ClassBookingsService {
  constructor(private readonly prisma: PrismaService) {}

  async mobileClassCatalog() {
    const rows = await this.prisma.club_class_monthly_schedules.findMany({
      where: {
        status: 'published',
        slots: { some: { status: { not: 'cancelled' }, end_at: { gt: new Date() } } },
      },
      select: {
        class: { select: { id: true, name: true, name_en: true, code: true } },
      },
      orderBy: { class: { name: 'asc' } },
    });
    const unique = new Map(rows.map((row) => [row.class.id, {
      id: row.class.id,
      name: row.class.name,
      nameEn: row.class.name_en,
      code: row.class.code,
    }]));
    return { data: [...unique.values()] };
  }

  async mobileClassTrainers(classId?: number) {
    const rows = await this.prisma.club_class_monthly_schedules.findMany({
      where: {
        status: 'published',
        ...(classId != null ? { class_id: classId } : {}),
        slots: { some: { status: { not: 'cancelled' }, end_at: { gt: new Date() } } },
      },
      select: {
        trainer: { select: { id: true, name: true, specialization: true, image_url: true } },
      },
      orderBy: { trainer: { name: 'asc' } },
    });
    const unique = new Map(rows.map((row) => [row.trainer.id, {
      id: row.trainer.id,
      name: row.trainer.name,
      specialization: row.trainer.specialization,
      imageUrl: row.trainer.image_url,
    }]));
    return { data: [...unique.values()] };
  }

  async mobileMonthlySchedule(
    appUserId: number,
    memberId: number,
    query: { trainerId: number; year: number; month: number; classId?: number },
  ) {
    await this.assertMobileCustomer(appUserId, memberId);
    const slots = await this.availableSlots(query);
    const slotIds = slots.map((slot) => slot.id);
    const [memberBookings, subscriptions, waiting] = await Promise.all([
      this.prisma.club_class_bookings.findMany({
        where: { member_id: memberId, slot_id: { in: slotIds } },
        select: { id: true, slot_id: true, status: true, booked_at: true },
      }),
      this.prisma.club_subscriptions.findMany({
        where: {
          member_id: memberId,
          status: { not: 'frozen' },
          sessions_count: { not: null },
        },
        select: {
          id: true,
          subscription_number: true,
          subscription_start_date: true,
          subscription_end_date: true,
          sessions_count: true,
          sessions_used: true,
        },
        orderBy: { subscription_end_date: 'asc' },
      }),
      this.prisma.club_class_bookings.findMany({
        where: { slot_id: { in: slotIds }, status: 'wait' },
        select: { id: true, slot_id: true },
        orderBy: [{ booked_at: 'asc' }, { id: 'asc' }],
      }),
    ]);

    const bookingBySlot = new Map<number, (typeof memberBookings)[number]>(
      memberBookings.map((booking) => [booking.slot_id, booking] as const),
    );
    const waitPositions = this.waitPositions(waiting);
    const days = new Map<string, any[]>();
    for (const slot of slots) {
      const date = this.formatCairoDate(slot.startAt);
      const myBooking = bookingBySlot.get(slot.id);
      const freeSession = this.freeSessionForDate(subscriptions, date);
      const availability = this.mobileAvailability(
        slot.bookingStatus,
        slot.bookingStartAt != null && slot.bookingEndAt != null,
      );
      const item = {
        ...slot,
        availability,
        freeSession: { ...freeSession, classId: slot.class.id },
        myBooking: myBooking
          ? {
              id: myBooking.id,
              status: myBooking.status,
              bookedAt: myBooking.booked_at,
              waitlistPosition:
                myBooking.status === 'wait' ? waitPositions.get(myBooking.id) ?? null : null,
            }
          : null,
      };
      const list = days.get(date) ?? [];
      list.push(item);
      days.set(date, list);
    }

    return {
      trainer: slots[0]?.trainer ?? { id: query.trainerId },
      year: query.year,
      month: query.month,
      days: [...days.entries()].map(([date, daySlots]) => ({ date, slots: daySlots })),
    };
  }

  async mobileSlot(appUserId: number, memberId: number, slotId: number) {
    await this.assertMobileCustomer(appUserId, memberId);
    const meta = await this.prisma.club_class_schedule_slots.findUnique({
      where: { id: slotId },
      select: {
        monthly_schedule: { select: { trainer_id: true, class_id: true, month: true, year: true } },
      },
    });
    if (!meta) throw new NotFoundException('موعد الكلاس غير موجود.');
    const schedule = await this.mobileMonthlySchedule(appUserId, memberId, {
      trainerId: meta.monthly_schedule.trainer_id,
      classId: meta.monthly_schedule.class_id,
      month: meta.monthly_schedule.month,
      year: meta.monthly_schedule.year,
    });
    const slot = schedule.days.flatMap((day) => day.slots).find((item) => item.id === slotId);
    if (!slot) throw new NotFoundException('موعد الكلاس غير متاح في التطبيق.');
    return slot;
  }

  async mobileClassNotifications(appUserId: number, memberId: number) {
    await this.assertMobileCustomer(appUserId, memberId);
    const rows = await this.prisma.club_notifications.findMany({
      where: { member_id: memberId },
      orderBy: { id: 'desc' },
      take: 50,
    });
    return {
      data: rows.map((row) => ({
        id: row.id,
        type: row.type,
        bookingId: row.booking_id,
        title: row.title,
        message: row.message,
        status: row.status,
        createdAt: row.created_at,
      })),
    };
  }

  async availableSlots(query: AvailableClassSlotsQueryDto) {
    const now = new Date();
    const slots = await this.prisma.club_class_schedule_slots.findMany({
      where: {
        ...(query.includeCancelled ? {} : { status: { not: 'cancelled' } }),
        monthly_schedule: {
          status: 'published',
          ...(query.classId != null ? { class_id: query.classId } : {}),
          ...(query.trainerId != null ? { trainer_id: query.trainerId } : {}),
          ...(query.month != null ? { month: query.month } : {}),
          ...(query.year != null ? { year: query.year } : {}),
        },
      },
      include: {
        monthly_schedule: {
          include: {
            class: {
              select: {
                id: true,
                name: true,
                name_en: true,
                code: true,
                additional_services: {
                  where: { is_active: true },
                  select: { service_id: true },
                },
              },
            },
            trainer: { select: { id: true, name: true, specialization: true } },
          },
        },
        _count: { select: { bookings: { where: { status: 'confirmed' } } } },
        bookings: {
          where: { status: 'wait' },
          select: { id: true },
        },
        additional_services: {
          where: {
            is_active: true,
            service: { category: 'additional', is_active: true, is_deleted: false },
          },
          include: {
            service: { select: { id: true, name: true } },
            _count: {
              select: {
                booking_services: {
                  where: { status: 'confirmed', booking: { status: 'confirmed' } },
                },
              },
            },
          },
        },
      },
      orderBy: { start_at: 'asc' },
    });

    return slots
      .filter((slot) => !query.date || this.formatCairoDate(slot.start_at) === query.date)
      .map((slot) => {
        const confirmedBookingsCount = slot._count.bookings;
        const remainingCapacity = Math.max(0, slot.capacity - confirmedBookingsCount);
        const linkedServiceIds = new Set(
          slot.monthly_schedule.class.additional_services.map((link) => link.service_id),
        );
        return {
          id: slot.id,
          startAt: slot.start_at,
          endAt: slot.end_at,
          bookingStartAt: slot.booking_start_at,
          bookingEndAt: slot.booking_end_at,
          capacity: slot.capacity,
          confirmedBookingsCount,
          waitingBookingsCount: slot.bookings.length,
          remainingCapacity,
          bookingStatus: this.computedBookingStatus(slot, confirmedBookingsCount, now),
          class: {
            id: slot.monthly_schedule.class.id,
            name: slot.monthly_schedule.class.name,
            type: slot.monthly_schedule.class.code ?? slot.monthly_schedule.class.name,
          },
          service: {
            id: slot.monthly_schedule.class.id,
            name: slot.monthly_schedule.class.name,
            category: 'class',
          },
          trainer: slot.monthly_schedule.trainer,
          additionalServices: slot.additional_services
            .filter((item) => linkedServiceIds.has(item.service_id))
            .map((item) => {
              const count = item._count.booking_services;
              return {
                serviceId: item.service_id,
                name: item.service.name,
                capacity: item.capacity,
                confirmedBookingsCount: count,
                remainingCapacity: Math.max(0, item.capacity - count),
                isRequired: item.is_required,
                isAvailable: count < item.capacity,
              };
            }),
        };
      });
  }

  async adminSlotBookings(slotId: number) {
    const slot = await this.prisma.club_class_schedule_slots.findUnique({
      where: { id: slotId },
      select: { id: true },
    });
    if (!slot) throw new NotFoundException('موعد الكلاس غير موجود.');
    const bookings = await this.prisma.club_class_bookings.findMany({
      where: { slot_id: slotId },
      include: {
        member: { select: { id: true, name: true, member_code: true, phone: true } },
        user: { select: { user_id: true, name: true, username: true, email: true } },
        additional_services: {
          include: { service: { select: { id: true, name: true } } },
          orderBy: { service: { name: 'asc' } },
        },
      },
      orderBy: { booked_at: 'desc' },
    });
    return bookings.map((booking) => ({
      id: booking.id,
      status: booking.status,
      bookedAt: booking.booked_at,
      cancelledAt: booking.cancelled_at,
      member: booking.member ?? (booking.user ? {
        id: booking.user.user_id,
        name: booking.user.name ?? booking.user.username,
        member_code: null,
        phone: null,
      } : null),
      user: booking.user,
      additionalServices: booking.additional_services.map((item) => ({
        serviceId: item.service_id,
        name: item.service.name,
        status: item.status,
      })),
    }));
  }

  async adminMemberFreeSessions(slotId: number, memberId: number) {
    const slot = await this.prisma.club_class_schedule_slots.findUnique({
      where: { id: slotId },
      select: {
        start_at: true,
        monthly_schedule: {
          select: { class: { select: { id: true, name: true } } },
        },
      },
    });
    if (!slot) throw new NotFoundException('موعد الكلاس غير موجود.');

    const member = await this.prisma.club_members.findFirst({
      where: { id: memberId, is_active: true, is_deleted: false },
      select: { id: true },
    });
    if (!member) throw new NotFoundException('العضو غير موجود أو غير فعال.');

    const classDate = this.formatCairoDate(slot.start_at);
    const subscriptions = await this.prisma.club_subscriptions.findMany({
      where: {
        member_id: memberId,
        status: { not: 'frozen' },
        sessions_count: { not: null },
        subscription_start_date: { lte: classDate },
        subscription_end_date: { gte: classDate },
      },
      select: {
        id: true,
        subscription_number: true,
        subscription_type: true,
        subscription_start_date: true,
        subscription_end_date: true,
        sessions_count: true,
        sessions_used: true,
      },
      orderBy: { subscription_end_date: 'asc' },
    });

    const sources = subscriptions
      .filter((subscription) => (subscription.sessions_count ?? 0) > 0)
      .map((subscription) => {
        const total = subscription.sessions_count ?? 0;
        const used = Math.min(total, Math.max(0, subscription.sessions_used));
        return {
          subscriptionId: subscription.id,
          subscriptionNumber: subscription.subscription_number,
          subscriptionName: subscription.subscription_type,
          total,
          used,
          remaining: Math.max(0, total - used),
        };
      });

    const completedBookings = sources.length
      ? await this.prisma.club_class_bookings.findMany({
          where: {
            member_id: memberId,
            status: 'completed',
            slot: { monthly_schedule: { class_id: slot.monthly_schedule.class.id } },
          },
          select: { slot: { select: { start_at: true } } },
        })
      : [];
    const completedUsed = completedBookings.filter((booking) => {
      const bookingDate = this.formatCairoDate(booking.slot.start_at);
      return subscriptions.some(
        (subscription) =>
          subscription.subscription_start_date <= bookingDate &&
          subscription.subscription_end_date >= bookingDate,
      );
    }).length;
    const total = sources.reduce((sum, source) => sum + source.total, 0);
    const storedUsed = sources.reduce((sum, source) => sum + source.used, 0);
    const used = Math.min(total, Math.max(storedUsed, completedUsed));

    return {
      class: slot.monthly_schedule.class,
      hasFreeSessions: sources.length > 0,
      total,
      used,
      remaining: Math.max(0, total - used),
      sources,
    };
  }

  searchAdminBookings(query: AdminBookingsQueryDto) {
    return this.prisma.club_class_bookings.findMany({
      where: {
        slot: { monthly_schedule: {
          ...(query.classId ? { class_id: query.classId } : {}),
          ...(query.trainerId ? { trainer_id: query.trainerId } : {}),
          ...(query.month ? { month: query.month } : {}),
          ...(query.year ? { year: query.year } : {}),
        } },
      },
      include: {
        member: { select: { id: true, name: true, member_code: true, phone: true } },
        user: { select: { user_id: true, name: true, username: true } },
        additional_services: {
          include: { service: { select: { id: true, name: true } } },
          orderBy: { service: { name: 'asc' } },
        },
        slot: { include: { monthly_schedule: { include: {
          class: { select: { id: true, name: true } },
          trainer: { select: { id: true, name: true } },
        } } } },
      },
      orderBy: [{ slot: { start_at: 'desc' } }, { booked_at: 'desc' }],
    }).then((rows) => rows.map((booking) => ({
      id: booking.id,
      status: booking.status,
      bookedAt: booking.booked_at,
      member: booking.member ?? (booking.user ? { id: booking.user.user_id, name: booking.user.name ?? booking.user.username, member_code: null, phone: null } : null),
      slot: { id: booking.slot.id, startAt: booking.slot.start_at, endAt: booking.slot.end_at },
      class: booking.slot.monthly_schedule.class,
      trainer: booking.slot.monthly_schedule.trainer,
      additionalServices: booking.additional_services.map((item) => ({
        serviceId: item.service_id,
        name: item.service.name,
        status: item.status,
      })),
    })));
  }

  adminUpdateBookingServices(
    bookingId: number,
    dto: UpdateBookingAdditionalServicesDto,
  ) {
    const selectedIds = [...new Set(dto.additionalServiceIds)];
    return this.prisma.$transaction(async (tx) => {
      const snapshot = await tx.club_class_bookings.findUnique({
        where: { id: bookingId },
        select: { slot_id: true },
      });
      if (!snapshot) throw new NotFoundException('الحجز غير موجود.');

      await this.lockSlot(tx, snapshot.slot_id);
      await this.lockBooking(tx, bookingId);
      const booking = await tx.club_class_bookings.findUnique({
        where: { id: bookingId },
        include: { slot: { include: { monthly_schedule: true } } },
      });
      if (!booking) throw new NotFoundException('الحجز غير موجود.');
      if (booking.status !== 'confirmed') {
        throw new ConflictException('يمكن تعديل خدمات الحجوزات المؤكدة فقط.');
      }

      const activeServices = await tx.club_services.findMany({
        where: {
          id: { in: selectedIds },
          category: 'class',
          class_type_id: booking.slot.monthly_schedule.class_id,
          is_active: true,
          is_deleted: false,
        },
        select: { id: true },
      });
      if (activeServices.length !== selectedIds.length) {
        throw new BadRequestException('إحدى الخدمات المختارة غير موجودة أو غير مفعلة.');
      }
      for (const serviceId of selectedIds) {
        await tx.club_class_additional_services.upsert({
          where: {
            class_id_service_id: {
              class_id: booking.slot.monthly_schedule.class_id,
              service_id: serviceId,
            },
          },
          create: {
            class_id: booking.slot.monthly_schedule.class_id,
            service_id: serviceId,
            is_required: false,
            is_active: true,
          },
          update: { is_active: true },
        });
      }

      const selectedServices = await this.lockAndValidateServices(
        tx,
        booking.slot_id,
        booking.slot.monthly_schedule.class_id,
        selectedIds,
        booking.slot.capacity,
      );
      await this.assertServiceCapacity(tx, selectedServices, booking.id);
      await this.syncBookingServices(tx, booking.id, selectedServices);
      return this.getBookingById(tx, booking.id);
    });
  }

  async adminServiceBookings(slotId: number, serviceId: number) {
    const configured = await this.prisma.club_slot_additional_services.findUnique({
      where: { slot_id_service_id: { slot_id: slotId, service_id: serviceId } },
      select: { id: true, service: { select: { id: true, name: true } } },
    });
    if (!configured) throw new NotFoundException('الخدمة غير معدة على هذا الموعد.');
    const rows = await this.prisma.club_booking_additional_services.findMany({
      where: { slot_additional_service_id: configured.id },
      include: {
        booking: {
          include: {
            user: { select: { user_id: true, name: true, username: true, email: true } },
          },
        },
      },
      orderBy: { created_at: 'desc' },
    });
    return {
      service: configured.service,
      bookings: rows.map((row) => ({
        bookingId: row.booking_id,
        bookingStatus: row.booking.status,
        serviceStatus: row.status,
        bookedAt: row.booking.booked_at,
        user: row.booking.user,
      })),
    };
  }

  adminTransitionBooking(
    bookingId: number,
    target: 'cancelled' | 'completed' | 'no_show',
  ) {
    return this.prisma.$transaction(async (tx) => {
      const snapshot = await tx.club_class_bookings.findUnique({
        where: { id: bookingId },
        select: { slot_id: true },
      });
      if (!snapshot) throw new NotFoundException('الحجز غير موجود.');
      await this.lockSlot(tx, snapshot.slot_id);
      await this.lockBooking(tx, bookingId);
      const booking = await tx.club_class_bookings.findUnique({
        where: { id: bookingId },
        include: { slot: { select: { start_at: true } } },
      });
      if (!booking) throw new NotFoundException('الحجز غير موجود.');
      if (booking.status !== 'confirmed' && !(target === 'cancelled' && booking.status === 'wait')) {
        throw new ConflictException(`لا يمكن تحويل الحجز من ${booking.status} إلى ${target}.`);
      }

      const now = new Date();
      await tx.club_class_bookings.update({
        where: { id: booking.id },
        data: {
          status: target,
          ...(target === 'cancelled' ? { cancelled_at: now } : {}),
        },
      });
      if (target === 'completed' && booking.member_id != null) {
        await this.consumeMemberFreeSession(tx, booking.member_id, booking.slot.start_at);
      }
      if (target === 'cancelled' || target === 'no_show') {
        await tx.club_booking_additional_services.updateMany({
          where: { booking_id: booking.id, status: 'confirmed' },
          data: { status: 'cancelled' },
        });
      } else {
        await tx.club_booking_additional_services.updateMany({
          where: { booking_id: booking.id, status: 'confirmed' },
          data: { status: 'completed' },
        });
      }
      if (target === 'cancelled' && booking.status === 'confirmed') {
        await this.promoteNextWaiter(tx, booking.slot_id);
      }
      return this.getBookingById(tx, booking.id);
    });
  }

  adminCreateMemberBooking(slotId: number, memberId: number) {
    return this.prisma.$transaction(async (tx) => {
      const slot = await this.lockAndGetSlot(tx, slotId);
      this.assertSlotBookable(slot, new Date());
      const member = await tx.club_members.findFirst({
        where: { id: memberId, is_active: true, is_deleted: false },
        select: { id: true, name: true },
      });
      if (!member) throw new NotFoundException('العضو غير موجود أو غير فعال.');
      const existing = await tx.club_class_bookings.findUnique({
        where: { slot_id_member_id: { slot_id: slotId, member_id: memberId } },
      });
      if (existing && ['confirmed', 'wait'].includes(existing.status)) {
        throw new ConflictException('العضو مسجل بالفعل في هذا الموعد.');
      }
      const confirmedCount = await tx.club_class_bookings.count({
        where: { slot_id: slotId, status: 'confirmed' },
      });
      const status = confirmedCount < slot.capacity ? 'confirmed' : 'wait';
      const booking = existing
        ? await tx.club_class_bookings.update({ where: { id: existing.id }, data: { status, booked_at: new Date(), cancelled_at: null } })
        : await tx.club_class_bookings.create({ data: { slot_id: slotId, member_id: memberId, status } });
      return { id: booking.id, status: booking.status, member, bookedAt: booking.booked_at };
    });
  }

  async createMemberAppBooking(appUserId: number, memberId: number, slotId: number) {
    await this.assertMobileCustomer(appUserId, memberId);
    const result = await this.prisma.$transaction(async (tx) => {
      const slot = await this.lockAndGetSlot(tx, slotId);
      const now = new Date();
      this.assertSlotBookable(slot, now);
      if (!slot.booking_start_at || !slot.booking_end_at) {
        throw new ConflictException('فترة فتح وغلق الحجز غير محددة لهذا الموعد.');
      }
      await this.lockMemberSlotBooking(tx, slot.id, memberId);

      const existing = await tx.club_class_bookings.findUnique({
        where: { slot_id_member_id: { slot_id: slot.id, member_id: memberId } },
      });
      if (existing && ['confirmed', 'wait'].includes(existing.status)) {
        throw new ConflictException('لديك حجز أو طلب انتظار لهذا الموعد بالفعل.');
      }

      const confirmedCount = await tx.club_class_bookings.count({
        where: { slot_id: slot.id, status: 'confirmed' },
      });
      const status = confirmedCount < slot.capacity ? 'confirmed' : 'wait';
      const booking = existing
        ? await tx.club_class_bookings.update({
            where: { id: existing.id },
            data: { status, booked_at: now, cancelled_at: null, user_id: null, member_id: memberId },
          })
        : await tx.club_class_bookings.create({
            data: { slot_id: slot.id, member_id: memberId, status, booked_at: now },
          });
      const waitlistPosition = status === 'wait'
        ? await tx.club_class_bookings.count({
            where: {
              slot_id: slot.id,
              status: 'wait',
              OR: [
                { booked_at: { lt: booking.booked_at } },
                { booked_at: booking.booked_at, id: { lte: booking.id } },
              ],
            },
          })
        : null;
      return { booking: await this.getBookingById(tx, booking.id), status, waitlistPosition };
    });
    const freeSession = await this.adminMemberFreeSessions(slotId, memberId);
    return {
      ...result.booking,
      code: result.status === 'confirmed' ? 'BOOKING_CONFIRMED' : 'CLASS_FULL_WAITLISTED',
      message:
        result.status === 'confirmed'
          ? 'تم تأكيد حجز الحصة بنجاح.'
          : 'اكتملت سعة الحصة وتمت إضافتك إلى قائمة الانتظار.',
      waitlistPosition: result.waitlistPosition,
      freeSession: {
        eligible: freeSession.remaining > 0,
        remaining: freeSession.remaining,
        classId: freeSession.class.id,
      },
    };
  }

  async myMemberAppBookings(
    appUserId: number,
    memberId: number,
    query: { status?: 'confirmed' | 'wait' | 'cancelled' | 'completed' | 'no_show'; scope?: 'upcoming' | 'past' | 'all' },
  ) {
    await this.assertMobileCustomer(appUserId, memberId);
    const now = new Date();
    const timeFilter =
      query.scope === 'past'
        ? { start_at: { lte: now } }
        : query.scope === 'all'
          ? {}
          : { start_at: { gt: now } };
    const rows = await this.prisma.club_class_bookings.findMany({
      where: {
        member_id: memberId,
        ...(query.status ? { status: query.status } : {}),
        slot: timeFilter,
      },
      include: this.bookingInclude,
      orderBy: { slot: { start_at: query.scope === 'past' ? 'desc' : 'asc' } },
    });
    const waitSlotIds = [...new Set(rows.filter((row) => row.status === 'wait').map((row) => row.slot_id))];
    const waiting = waitSlotIds.length
      ? await this.prisma.club_class_bookings.findMany({
          where: { slot_id: { in: waitSlotIds }, status: 'wait' },
          select: { id: true, slot_id: true },
          orderBy: [{ booked_at: 'asc' }, { id: 'asc' }],
        })
      : [];
    const positions = this.waitPositions(waiting);
    return {
      data: rows.map((row) => ({
        ...this.mapBooking(row),
        waitlistPosition: row.status === 'wait' ? positions.get(row.id) ?? null : null,
      })),
    };
  }

  async cancelMemberAppBooking(appUserId: number, memberId: number, bookingId: number) {
    await this.assertMobileCustomer(appUserId, memberId);
    return this.prisma.$transaction(async (tx) => {
      const snapshot = await tx.club_class_bookings.findUnique({
        where: { id: bookingId },
        select: { slot_id: true },
      });
      if (!snapshot) throw new NotFoundException('الحجز غير موجود.');
      await this.lockSlot(tx, snapshot.slot_id);
      await this.lockBooking(tx, bookingId);
      const booking = await tx.club_class_bookings.findUnique({
        where: { id: bookingId },
        include: { slot: true },
      });
      if (!booking) throw new NotFoundException('الحجز غير موجود.');
      if (booking.member_id !== memberId) throw new ForbiddenException('لا يمكنك إلغاء هذا الحجز.');
      if (!['confirmed', 'wait'].includes(booking.status)) {
        throw new ConflictException(`لا يمكن إلغاء الحجز بحالته الحالية: ${booking.status}.`);
      }
      this.assertChangeWindow(booking.slot, new Date());

      await tx.club_class_bookings.update({
        where: { id: booking.id },
        data: { status: 'cancelled', cancelled_at: new Date() },
      });
      await tx.club_booking_additional_services.updateMany({
        where: { booking_id: booking.id, status: 'confirmed' },
        data: { status: 'cancelled' },
      });

      const promoted =
        booking.status === 'confirmed' ? await this.promoteNextWaiter(tx, booking.slot_id) : null;

      return {
        booking: await this.getBookingById(tx, booking.id),
        code: 'BOOKING_CANCELLED',
        message: 'تم إلغاء الحجز بنجاح.',
        promotedBookingId: promoted?.id ?? null,
      };
    });
  }

  createBooking(userId: number, dto: CreateClassBookingDto) {
    const selectedIds = [...new Set(dto.additionalServiceIds ?? [])];
    return this.prisma.$transaction(async (tx) => {
      const slot = await this.lockAndGetSlot(tx, dto.slotId);
      const now = new Date();
      this.assertSlotBookable(slot, now);

      await this.lockUserSlotBooking(tx, slot.id, userId);
      const existing = await tx.club_class_bookings.findUnique({
        where: { slot_id_user_id: { slot_id: slot.id, user_id: userId } },
      });
      if (existing?.status === 'confirmed') {
        throw new ConflictException('لديك حجز مؤكد لهذا الموعد بالفعل.');
      }
      if (existing && existing.status !== 'cancelled') {
        throw new ConflictException('لا يمكن إعادة تفعيل هذا الحجز بحالته الحالية.');
      }

      const confirmedCount = await tx.club_class_bookings.count({
        where: { slot_id: slot.id, status: 'confirmed' },
      });
      if (confirmedCount >= slot.capacity) throw new ConflictException('اكتملت سعة الكلاس.');

      const selectedServices = await this.lockAndValidateServices(
        tx,
        slot.id,
        slot.monthly_schedule.class_id,
        selectedIds,
        slot.capacity,
      );
      await this.assertServiceCapacity(tx, selectedServices);

      const booking = existing
        ? await tx.club_class_bookings.update({
            where: { id: existing.id },
            data: {
              status: 'confirmed',
              booked_at: now,
              cancelled_at: null,
            },
          })
        : await tx.club_class_bookings.create({
            data: {
              slot_id: slot.id,
              user_id: userId,
              status: 'confirmed',
              booked_at: now,
            },
          });
      await this.syncBookingServices(tx, booking.id, selectedServices);
      return this.getBookingById(tx, booking.id);
    });
  }

  myBookings(userId: number, query: MyClassBookingsQueryDto) {
    const now = new Date();
    const timeFilter =
      query.upcoming && !query.past
        ? { start_at: { gt: now } }
        : query.past && !query.upcoming
          ? { start_at: { lte: now } }
          : {};
    return this.prisma.club_class_bookings.findMany({
      where: {
        user_id: userId,
        ...(query.status ? { status: query.status } : {}),
        slot: timeFilter,
      },
      include: this.bookingInclude,
      orderBy: { slot: { start_at: 'desc' } },
    }).then((rows) => rows.map((row) => this.mapBooking(row)));
  }

  cancelBooking(userId: number, bookingId: number) {
    return this.prisma.$transaction(async (tx) => {
      const snapshot = await tx.club_class_bookings.findUnique({
        where: { id: bookingId },
        select: { slot_id: true },
      });
      if (!snapshot) throw new NotFoundException('الحجز غير موجود.');
      await this.lockSlot(tx, snapshot.slot_id);
      await this.lockBooking(tx, bookingId);
      const booking = await tx.club_class_bookings.findUnique({
        where: { id: bookingId },
        include: { slot: true },
      });
      if (!booking) throw new NotFoundException('الحجز غير موجود.');
      if (booking.user_id !== userId) throw new ForbiddenException('لا يمكنك إلغاء هذا الحجز.');
      if (booking.status !== 'confirmed') {
        throw new ConflictException('يمكن إلغاء الحجوزات المؤكدة فقط.');
      }
      this.assertChangeWindow(booking.slot, new Date());
      const now = new Date();
      await tx.club_booking_additional_services.updateMany({
        where: { booking_id: booking.id, status: 'confirmed' },
        data: { status: 'cancelled' },
      });
      await tx.club_class_bookings.update({
        where: { id: booking.id },
        data: { status: 'cancelled', cancelled_at: now },
      });
      const promoted = await this.promoteNextWaiter(tx, booking.slot_id);
      const cancelledBooking = await this.getBookingById(tx, booking.id);
      return { ...cancelledBooking, promotedBookingId: promoted?.id ?? null };
    });
  }

  updateBookingServices(
    userId: number,
    bookingId: number,
    dto: UpdateBookingAdditionalServicesDto,
  ) {
    const selectedIds = [...new Set(dto.additionalServiceIds)];
    return this.prisma.$transaction(async (tx) => {
      const snapshot = await tx.club_class_bookings.findUnique({
        where: { id: bookingId },
        select: { slot_id: true },
      });
      if (!snapshot) throw new NotFoundException('الحجز غير موجود.');
      await this.lockSlot(tx, snapshot.slot_id);
      await this.lockBooking(tx, bookingId);
      const booking = await tx.club_class_bookings.findUnique({
        where: { id: bookingId },
        include: { slot: { include: { monthly_schedule: true } } },
      });
      if (!booking) throw new NotFoundException('الحجز غير موجود.');
      if (booking.user_id !== userId) throw new ForbiddenException('لا يمكنك تعديل هذا الحجز.');
      if (booking.status !== 'confirmed') {
        throw new ConflictException('يمكن تعديل خدمات الحجوزات المؤكدة فقط.');
      }
      this.assertChangeWindow(booking.slot, new Date());
      const selectedServices = await this.lockAndValidateServices(
        tx,
        booking.slot_id,
        booking.slot.monthly_schedule.class_id,
        selectedIds,
        booking.slot.capacity,
      );
      await this.assertServiceCapacity(tx, selectedServices, booking.id);
      await this.syncBookingServices(tx, booking.id, selectedServices);
      return this.getBookingById(tx, booking.id);
    });
  }

  private readonly bookingInclude = {
    slot: {
      include: {
        monthly_schedule: {
          include: {
            class: { select: { id: true, name: true, name_en: true, code: true } },
            trainer: { select: { id: true, name: true, specialization: true } },
          },
        },
      },
    },
    member: { select: { id: true, name: true, member_code: true } },
    additional_services: {
      include: { service: { select: { id: true, name: true } } },
      orderBy: { service: { name: 'asc' as const } },
    },
  };

  private async lockAndGetSlot(tx: Prisma.TransactionClient, slotId: number) {
    await this.lockSlot(tx, slotId);
    const slot = await tx.club_class_schedule_slots.findUnique({
      where: { id: slotId },
      include: { monthly_schedule: true },
    });
    if (!slot) throw new NotFoundException('موعد الكلاس غير موجود.');
    return slot;
  }

  private lockSlot(tx: Prisma.TransactionClient, slotId: number) {
    return tx.$queryRaw<Array<{ id: number }>>(
      Prisma.sql`SELECT id FROM club_class_schedule_slots WHERE id = ${slotId} FOR UPDATE`,
    );
  }

  private lockBooking(tx: Prisma.TransactionClient, bookingId: number) {
    return tx.$queryRaw<Array<{ id: number }>>(
      Prisma.sql`SELECT id FROM club_class_bookings WHERE id = ${bookingId} FOR UPDATE`,
    );
  }

  private lockUserSlotBooking(
    tx: Prisma.TransactionClient,
    slotId: number,
    userId: number,
  ) {
    return tx.$queryRaw<Array<{ id: number }>>(
      Prisma.sql`SELECT id FROM club_class_bookings WHERE slot_id = ${slotId} AND user_id = ${userId} FOR UPDATE`,
    );
  }

  private lockMemberSlotBooking(
    tx: Prisma.TransactionClient,
    slotId: number,
    memberId: number,
  ) {
    return tx.$queryRaw<Array<{ id: number }>>(
      Prisma.sql`SELECT id FROM club_class_bookings WHERE slot_id = ${slotId} AND member_id = ${memberId} FOR UPDATE`,
    );
  }

  private async promoteNextWaiter(tx: Prisma.TransactionClient, slotId: number) {
    const waiting = await tx.club_class_bookings.findFirst({
      where: { slot_id: slotId, status: 'wait' },
      orderBy: [{ booked_at: 'asc' }, { id: 'asc' }],
    });
    if (!waiting) return null;
    await tx.club_class_bookings.update({
      where: { id: waiting.id },
      data: { status: 'confirmed' },
    });
    let recipientUserId = waiting.user_id ?? null;
    if (waiting.member_id != null) {
      const promotedMember = await tx.club_members.findUnique({
        where: { id: waiting.member_id },
        select: { app_user_id: true },
      });
      recipientUserId = promotedMember?.app_user_id ?? recipientUserId;
    }
    if (waiting.member_id != null || recipientUserId != null) {
      await tx.club_notifications.create({
        data: {
          type: 'booking_confirmed',
          booking_id: waiting.id,
          member_id: waiting.member_id ?? null,
          to_user: recipientUserId,
          title: 'تم تأكيد حجز الحصة',
          message: 'أصبح مكانك متاحًا وتم نقل حجزك من قائمة الانتظار إلى حجز مؤكد.',
          status: 'pending',
          channel: 'in_app',
        },
      });
    }
    return { id: waiting.id, memberId: waiting.member_id };
  }

  private async assertMobileCustomer(appUserId: number, memberId: number) {
    const member = await this.prisma.club_members.findFirst({
      where: {
        id: memberId,
        app_user_id: appUserId,
        is_active: true,
        is_deleted: false,
      },
      select: { id: true },
    });
    if (!member) throw new ForbiddenException('عضوية التطبيق غير صالحة أو غير نشطة.');
  }

  private waitPositions(rows: Array<{ id: number; slot_id: number }>) {
    const counters = new Map<number, number>();
    const positions = new Map<number, number>();
    for (const row of rows) {
      const position = (counters.get(row.slot_id) ?? 0) + 1;
      counters.set(row.slot_id, position);
      positions.set(row.id, position);
    }
    return positions;
  }

  private freeSessionForDate(
    subscriptions: Array<{
      id: number;
      subscription_number: string;
      subscription_start_date: string;
      subscription_end_date: string;
      sessions_count: number | null;
      sessions_used: number;
    }>,
    date: string,
  ) {
    const sources = subscriptions
      .filter(
        (subscription) =>
          subscription.subscription_start_date <= date &&
          subscription.subscription_end_date >= date &&
          (subscription.sessions_count ?? 0) > subscription.sessions_used,
      )
      .map((subscription) => ({
        subscriptionId: subscription.id,
        subscriptionNumber: subscription.subscription_number,
        remaining: Math.max(0, (subscription.sessions_count ?? 0) - subscription.sessions_used),
        expiresAt: subscription.subscription_end_date,
      }));
    const remaining = sources.reduce((sum, source) => sum + source.remaining, 0);
    return { eligible: remaining > 0, remaining, sources };
  }

  private mobileAvailability(status: string, hasBookingWindow: boolean) {
    if (!hasBookingWindow) {
      return {
        status: 'BOOKING_WINDOW_NOT_CONFIGURED',
        canBook: false,
        canJoinWaitlist: false,
      };
    }
    const mapped: Record<string, string> = {
      booking_available: 'BOOKING_AVAILABLE',
      fully_booked: 'WAITLIST_ONLY',
      booking_not_started: 'BOOKING_NOT_STARTED',
      booking_closed: 'BOOKING_CLOSED',
      class_started: 'CLASS_STARTED',
      unavailable: 'UNAVAILABLE',
      cancelled: 'CANCELLED',
    };
    const value = mapped[status] ?? 'UNAVAILABLE';
    return {
      status: value,
      canBook: value === 'BOOKING_AVAILABLE' || value === 'WAITLIST_ONLY',
      canJoinWaitlist: value === 'WAITLIST_ONLY',
    };
  }

  private assertSlotBookable(
    slot: {
      status: string;
      start_at: Date;
      booking_start_at: Date | null;
      booking_end_at: Date | null;
      monthly_schedule: { status: string };
    },
    now: Date,
  ) {
    if (slot.monthly_schedule.status !== 'published') {
      throw new ConflictException('الجدول غير منشور.');
    }
    if (slot.status !== 'available') throw new ConflictException('الموعد غير متاح للحجز.');
    if (now >= slot.start_at) throw new ConflictException('بدأ موعد الكلاس بالفعل.');
    if (slot.booking_start_at && now < slot.booking_start_at) {
      throw new ConflictException('فترة الحجز لم تبدأ بعد.');
    }
    if (slot.booking_end_at && now > slot.booking_end_at) {
      throw new ConflictException('انتهت فترة الحجز.');
    }
  }

  private assertChangeWindow(
    slot: { start_at: Date; booking_end_at: Date | null },
    now: Date,
  ) {
    if (now >= slot.start_at) throw new ConflictException('بدأ موعد الكلاس بالفعل.');
    if (slot.booking_end_at && now > slot.booking_end_at) {
      throw new ConflictException('انتهت فترة الإلغاء أو تعديل الخدمات.');
    }
  }

  private async lockAndValidateServices(
    tx: Prisma.TransactionClient,
    slotId: number,
    classId: number,
    selectedIds: number[],
    defaultCapacity: number,
  ) {
    await tx.$queryRaw<Array<{ id: number }>>(
      Prisma.sql`SELECT id FROM club_slot_additional_services WHERE slot_id = ${slotId} FOR UPDATE`,
    );
    const [configs, classLinks] = await Promise.all([
      tx.club_slot_additional_services.findMany({
        where: { slot_id: slotId },
        include: { service: true },
      }),
      tx.club_class_additional_services.findMany({
        where: { class_id: classId, is_active: true },
        include: { service: true },
      }),
    ]);
    const eligibleLinks = classLinks.filter(
      (link) => ['class', 'additional'].includes(link.service.category) && link.service.is_active && !link.service.is_deleted,
    );
    const linkByService = new Map(eligibleLinks.map((link) => [link.service_id, link]));
    const configByService = new Map(configs.map((config) => [config.service_id, config]));
    for (const id of selectedIds) {
      if (!linkByService.has(id)) {
        throw new BadRequestException(`الخدمة ${id} غير متاحة لهذا الكلاس.`);
      }
    }
    const requiredIds = new Set<number>();
    for (const link of eligibleLinks) {
      if (link.is_required || configByService.get(link.service_id)?.is_required) requiredIds.add(link.service_id);
    }
    for (const requiredId of requiredIds) {
      if (!selectedIds.includes(requiredId)) {
        throw new BadRequestException(`يجب اختيار الخدمة الإجبارية ${requiredId}.`);
      }
    }
    const selectedServices: Array<{ id: number; service_id: number; capacity: number }> = [];
    for (const id of selectedIds) {
      const link = linkByService.get(id)!;
      const existing = configByService.get(id);
      if (existing?.is_active) {
        selectedServices.push(existing);
        continue;
      }
      const configured = await tx.club_slot_additional_services.upsert({
        where: { slot_id_service_id: { slot_id: slotId, service_id: id } },
        create: {
          slot_id: slotId,
          service_id: id,
          capacity: defaultCapacity,
          is_required: link.is_required,
          is_active: true,
        },
        update: {
          is_required: Boolean(existing?.is_required || link.is_required),
          is_active: true,
        },
      });
      selectedServices.push(configured);
    }
    return selectedServices;
  }

  private async assertServiceCapacity(
    tx: Prisma.TransactionClient,
    services: Array<{ id: number; service_id: number; capacity: number }>,
    excludeBookingId?: number,
  ) {
    for (const service of services) {
      const count = await tx.club_booking_additional_services.count({
        where: {
          slot_additional_service_id: service.id,
          status: 'confirmed',
          booking: {
            status: 'confirmed',
            ...(excludeBookingId != null ? { id: { not: excludeBookingId } } : {}),
          },
        },
      });
      if (count >= service.capacity) {
        throw new ConflictException(`اكتملت سعة الخدمة ${service.service_id}.`);
      }
    }
  }

  private async syncBookingServices(
    tx: Prisma.TransactionClient,
    bookingId: number,
    services: Array<{ id: number; service_id: number }>,
  ) {
    const selectedIds = services.map((service) => service.service_id);
    await tx.club_booking_additional_services.updateMany({
      where: {
        booking_id: bookingId,
        ...(selectedIds.length ? { service_id: { notIn: selectedIds } } : {}),
        status: { not: 'cancelled' },
      },
      data: { status: 'cancelled' },
    });
    for (const service of services) {
      await tx.club_booking_additional_services.upsert({
        where: { booking_id_service_id: { booking_id: bookingId, service_id: service.service_id } },
        create: {
          booking_id: bookingId,
          slot_additional_service_id: service.id,
          service_id: service.service_id,
          status: 'confirmed',
        },
        update: {
          slot_additional_service_id: service.id,
          status: 'confirmed',
        },
      });
    }
  }

  private async getBookingById(tx: Prisma.TransactionClient, id: number) {
    const booking = await tx.club_class_bookings.findUnique({
      where: { id },
      include: this.bookingInclude,
    });
    if (!booking) throw new NotFoundException('الحجز غير موجود.');
    return this.mapBooking(booking);
  }

  private async consumeMemberFreeSession(
    tx: Prisma.TransactionClient,
    memberId: number,
    classStartAt: Date,
  ) {
    await tx.$queryRaw`
      SELECT id
      FROM club_subscriptions
      WHERE member_id = ${memberId} AND sessions_count IS NOT NULL
      FOR UPDATE
    `;
    const classDate = this.formatCairoDate(classStartAt);
    const subscriptions = await tx.club_subscriptions.findMany({
      where: {
        member_id: memberId,
        status: { not: 'frozen' },
        sessions_count: { not: null },
        subscription_start_date: { lte: classDate },
        subscription_end_date: { gte: classDate },
      },
      orderBy: { subscription_end_date: 'asc' },
    });
    const subscription = subscriptions.find(
      (item) => item.sessions_count != null && item.sessions_count > item.sessions_used,
    );
    if (!subscription || subscription.sessions_count == null) return;

    const sessionsUsed = subscription.sessions_used + 1;
    await tx.club_subscriptions.update({
      where: { id: subscription.id },
      data: {
        sessions_used: sessionsUsed,
        ...(subscription.is_linked_to_sessions && sessionsUsed >= subscription.sessions_count
          ? { status: 'expired' }
          : {}),
      },
    });
  }

  private computedBookingStatus(
    slot: {
      status: string;
      start_at: Date;
      booking_start_at: Date | null;
      booking_end_at: Date | null;
      capacity: number;
    },
    confirmedCount: number,
    now: Date,
  ) {
    if (slot.status === 'cancelled') return 'cancelled';
    if (slot.status !== 'available') return 'unavailable';
    if (now >= slot.start_at) return 'class_started';
    if (slot.booking_start_at && now < slot.booking_start_at) return 'booking_not_started';
    if (slot.booking_end_at && now > slot.booking_end_at) return 'booking_closed';
    if (confirmedCount >= slot.capacity) return 'fully_booked';
    return 'booking_available';
  }

  private mapBooking(booking: any) {
    return {
      id: booking.id,
      status: booking.status,
      bookedAt: booking.booked_at,
      cancelledAt: booking.cancelled_at,
      slot: {
        id: booking.slot.id,
        startAt: booking.slot.start_at,
        endAt: booking.slot.end_at,
        status: booking.slot.status,
      },
      class: {
        id: booking.slot.monthly_schedule.class.id,
        name: booking.slot.monthly_schedule.class.name,
        type: booking.slot.monthly_schedule.class.code ?? booking.slot.monthly_schedule.class.name,
      },
      service: {
        id: booking.slot.monthly_schedule.class.id,
        name: booking.slot.monthly_schedule.class.name,
        category: 'class',
      },
      trainer: booking.slot.monthly_schedule.trainer,
      additionalServices: booking.additional_services.map((item: any) => ({
        serviceId: item.service_id,
        name: item.service.name,
        status: item.status,
      })),
    };
  }

  private formatCairoDate(date: Date) {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Cairo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  }
}
