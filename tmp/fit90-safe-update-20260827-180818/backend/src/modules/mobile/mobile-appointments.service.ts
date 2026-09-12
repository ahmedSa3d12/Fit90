import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import type {
  MobileAppointmentBookingsQueryDto,
  MobileAppointmentCategory,
  MobileAppointmentScheduleQueryDto,
} from './dto/mobile-appointment.dto';

type InternalMobileAppointmentBookingsQuery = Omit<MobileAppointmentBookingsQueryDto, 'category'> & {
  category?: MobileAppointmentCategory;
};

@Injectable()
export class MobileAppointmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async services(category: MobileAppointmentCategory) {
    const rows = await this.prisma.club_service_monthly_schedules.findMany({
      where: {
        category,
        status: 'published',
        service: { is_active: true, is_deleted: false },
        slots: { some: { is_deleted: false, status: 'available', slot_date: { gte: this.cairoNow().date } } },
      },
      select: {
        service: {
          select: { id: true, name: true, category: true, description: true, duration_min: true, price: true },
        },
      },
      orderBy: { service: { name: 'asc' } },
    });
    const unique = new Map(rows.map(({ service }) => [service.id, {
      id: service.id,
      name: service.name,
      category: service.category,
      description: service.description,
      durationMin: service.duration_min,
      price: service.price.toString(),
    }]));
    return { data: [...unique.values()] };
  }

  async trainers(category: MobileAppointmentCategory, serviceId?: number) {
    const rows = await this.prisma.club_service_monthly_schedules.findMany({
      where: {
        category,
        status: 'published',
        ...(serviceId != null ? { service_id: serviceId } : {}),
        slots: { some: { is_deleted: false, status: 'available', slot_date: { gte: this.cairoNow().date } } },
      },
      select: { employee_id: true },
    });
    const ids = [...new Set(rows.map((row) => row.employee_id))];
    const trainers = await this.prisma.club_trainers.findMany({
      where: { id: { in: ids }, is_active: true, is_deleted: false },
      select: { id: true, name: true, specialization: true, image_url: true },
      orderBy: { name: 'asc' },
    });
    return {
      data: trainers.map((trainer) => ({
        id: trainer.id,
        name: trainer.name,
        specialization: trainer.specialization,
        imageUrl: trainer.image_url,
      })),
    };
  }

  async monthlySchedule(appUserId: number, memberId: number, query: MobileAppointmentScheduleQueryDto) {
    await this.assertCustomer(appUserId, memberId);
    const plan = await this.prisma.club_service_monthly_schedules.findFirst({
      where: {
        service_id: query.serviceId,
        employee_id: query.trainerId,
        category: query.category,
        month: query.month,
        year: query.year,
        status: 'published',
      },
      include: {
        service: { select: { id: true, name: true, category: true, description: true, duration_min: true } },
      },
    });
    if (!plan) throw new NotFoundException('لا يوجد جدول شهري منشور للخدمة والمدرب المحددين.');
    const [trainer, slots] = await Promise.all([
      this.prisma.club_trainers.findFirst({
        where: { id: plan.employee_id, is_active: true, is_deleted: false },
        select: { id: true, name: true, specialization: true, image_url: true },
      }),
      this.prisma.club_schedules.findMany({
        where: { monthly_schedule_id: plan.id, is_deleted: false, status: 'available' },
        include: { service: { select: { id: true, name: true, category: true } } },
        orderBy: [{ slot_date: 'asc' }, { start_time: 'asc' }],
      }),
    ]);
    if (!trainer) throw new NotFoundException('المدرب أو مقدم الخدمة غير موجود.');
    const slotIds = slots.map((slot) => slot.id);
    const [mine, waiting] = await Promise.all([
      this.prisma.club_bookings.findMany({
        where: { member_id: memberId, schedule_id: { in: slotIds }, is_deleted: false },
        select: { id: true, schedule_id: true, status: true, created_at: true },
      }),
      this.prisma.club_bookings.findMany({
        where: { schedule_id: { in: slotIds }, status: 'wait', is_deleted: false },
        select: { id: true, schedule_id: true },
        orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
      }),
    ]);
    const mineBySlot = new Map(mine.map((booking) => [booking.schedule_id, booking]));
    const positions = this.waitPositions(waiting);
    const days = new Map<string, any[]>();
    for (const slot of slots) {
      const myBooking = mineBySlot.get(slot.id);
      const item = this.mapSlot(slot, trainer, myBooking
        ? {
            id: myBooking.id,
            status: myBooking.status,
            bookedAt: myBooking.created_at,
            waitlistPosition: myBooking.status === 'wait' ? positions.get(myBooking.id) ?? null : null,
          }
        : null);
      const day = days.get(slot.slot_date) ?? [];
      day.push(item);
      days.set(slot.slot_date, day);
    }
    return {
      category: query.category,
      service: { id: plan.service.id, name: plan.service.name, category: plan.service.category },
      trainer: this.mapTrainer(trainer),
      year: query.year,
      month: query.month,
      days: [...days.entries()].map(([date, daySlots]) => ({ date, slots: daySlots })),
    };
  }

  async slot(
    appUserId: number,
    memberId: number,
    scheduleId: number,
    expectedCategory?: MobileAppointmentCategory,
  ) {
    await this.assertCustomer(appUserId, memberId);
    const slot = await this.prisma.club_schedules.findFirst({
      where: {
        id: scheduleId,
        is_deleted: false,
        status: 'available',
        service: {
          category: expectedCategory ?? { in: ['nutrition', 'spa', 'personal_training'] },
        },
        monthly_schedule: { status: 'published' },
      },
      include: {
        service: { select: { id: true, name: true, category: true } },
      },
    });
    if (!slot) throw new NotFoundException('الموعد غير موجود أو غير منشور.');
    if (expectedCategory == null && slot.service.category === 'nutrition') {
      throw new ConflictException('استخدم مسار التغذية المخصص.');
    }
    const [trainer, mine, waiting] = await Promise.all([
      slot.employee_id != null
        ? this.prisma.club_trainers.findUnique({
            where: { id: slot.employee_id },
            select: { id: true, name: true, specialization: true, image_url: true },
          })
        : Promise.resolve(null),
      this.prisma.club_bookings.findFirst({
        where: { schedule_id: slot.id, member_id: memberId, is_deleted: false },
      }),
      this.prisma.club_bookings.findMany({
        where: { schedule_id: slot.id, status: 'wait', is_deleted: false },
        select: { id: true, schedule_id: true },
        orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
      }),
    ]);
    if (!trainer) throw new NotFoundException('المدرب أو مقدم الخدمة غير موجود.');
    const positions = this.waitPositions(waiting);
    return this.mapSlot(slot, trainer, mine
      ? {
          id: mine.id,
          status: mine.status,
          bookedAt: mine.created_at,
          waitlistPosition: mine.status === 'wait' ? positions.get(mine.id) ?? null : null,
        }
      : null);
  }

  async createBooking(
    appUserId: number,
    memberId: number,
    scheduleId: number,
    expectedCategory?: MobileAppointmentCategory,
  ) {
    const member = await this.assertCustomer(appUserId, memberId);
    return this.prisma.$transaction(async (tx) => {
      await this.lockSchedule(tx, scheduleId);
      const slot = await tx.club_schedules.findFirst({
        where: {
          id: scheduleId,
          is_deleted: false,
          service: {
            category: expectedCategory ?? { in: ['nutrition', 'spa', 'personal_training'] },
          },
        },
        include: {
          service: { select: { id: true, name: true, category: true } },
          monthly_schedule: true,
        },
      });
      if (!slot) throw new NotFoundException('الموعد غير موجود.');
      if (slot.service.category === 'nutrition') {
        throw new ConflictException('حجوزات التغذية تستخدم مسار التغذية المخصص.');
      }
      this.assertBookable(slot);
      await this.lockMemberBooking(tx, scheduleId, memberId);
      const existing = await tx.club_bookings.findFirst({
        where: { schedule_id: scheduleId, member_id: memberId, is_deleted: false },
        orderBy: { id: 'desc' },
      });
      if (existing && ['pending', 'confirmed', 'wait', 'completed'].includes(existing.status)) {
        throw new ConflictException('لديك حجز أو طلب انتظار لهذا الموعد بالفعل.');
      }
      const occupied = await tx.club_bookings.count({
        where: { schedule_id: scheduleId, is_deleted: false, status: { in: ['pending', 'confirmed'] } },
      });
      const status = occupied < slot.capacity ? 'confirmed' : 'wait';
      const booking = existing
        ? await tx.club_bookings.update({
            where: { id: existing.id },
            data: {
              member_id: memberId,
              member_name: member.name,
              status,
              service_id: slot.service_id,
              employee_id: slot.employee_id,
              booking_date: slot.slot_date,
              branch_id: slot.branch_id,
              created_at: new Date(),
            },
          })
        : await tx.club_bookings.create({
            data: {
              booking_number: `BK-${randomUUID().slice(0, 8).toUpperCase()}`,
              member_id: memberId,
              member_name: member.name,
              service_id: slot.service_id,
              schedule_id: slot.id,
              employee_id: slot.employee_id,
              booking_date: slot.slot_date,
              status,
              branch_id: slot.branch_id,
            },
          });
      if (status === 'confirmed') {
        await tx.club_schedules.update({ where: { id: slot.id }, data: { booked_count: { increment: 1 } } });
      }
      const trainer = slot.employee_id != null
        ? await tx.club_trainers.findUnique({
            where: { id: slot.employee_id },
            select: { id: true, name: true, specialization: true, image_url: true },
          })
        : null;
      if (!trainer) throw new NotFoundException('المدرب أو مقدم الخدمة غير موجود.');
      const waitlistPosition = status === 'wait'
        ? await tx.club_bookings.count({
            where: {
              schedule_id: slot.id,
              status: 'wait',
              is_deleted: false,
              OR: [
                { created_at: { lt: booking.created_at } },
                { created_at: booking.created_at, id: { lte: booking.id } },
              ],
            },
          })
        : null;
      return {
        id: booking.id,
        bookingNumber: booking.booking_number,
        status,
        code: status === 'confirmed' ? 'BOOKING_CONFIRMED' : 'SERVICE_FULL_WAITLISTED',
        message: status === 'confirmed'
          ? 'تم تأكيد الحجز بنجاح.'
          : 'اكتملت سعة الموعد وتمت إضافتك إلى قائمة الانتظار.',
        waitlistPosition,
        service: { id: slot.service.id, name: slot.service.name, category: slot.service.category },
        trainer: this.mapTrainer(trainer),
        schedule: { id: slot.id, date: slot.slot_date, startTime: slot.start_time, endTime: slot.end_time },
      };
    });
  }

  async myBookings(appUserId: number, memberId: number, query: InternalMobileAppointmentBookingsQuery) {
    await this.assertCustomer(appUserId, memberId);
    const today = this.cairoNow().date;
    const rows = await this.prisma.club_bookings.findMany({
      where: {
        member_id: memberId,
        is_deleted: false,
        service: {
          category: query.category
            ? query.category
            : { in: ['nutrition', 'spa', 'personal_training'] },
        },
        ...(query.status ? { status: query.status } : {}),
        ...(query.scope === 'past'
          ? { booking_date: { lt: today } }
          : query.scope === 'all'
            ? {}
            : { booking_date: { gte: today } }),
      },
      include: {
        service: { select: { id: true, name: true, category: true } },
        schedule: true,
      },
      orderBy: [{ booking_date: query.scope === 'past' ? 'desc' : 'asc' }, { id: 'desc' }],
    });
    const trainerIds = [...new Set(rows.map((row) => row.employee_id).filter((id): id is number => id != null))];
    const [trainers, waiting] = await Promise.all([
      this.prisma.club_trainers.findMany({
        where: { id: { in: trainerIds } },
        select: { id: true, name: true, specialization: true, image_url: true },
      }),
      this.prisma.club_bookings.findMany({
        where: {
          schedule_id: { in: rows.filter((row) => row.status === 'wait').map((row) => row.schedule_id) },
          status: 'wait',
          is_deleted: false,
        },
        select: { id: true, schedule_id: true },
        orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
      }),
    ]);
    const trainerById = new Map(trainers.map((trainer) => [trainer.id, trainer]));
    const positions = this.waitPositions(waiting);
    return {
      data: rows.map((booking) => ({
        id: booking.id,
        bookingNumber: booking.booking_number,
        status: booking.status,
        waitlistPosition: booking.status === 'wait' ? positions.get(booking.id) ?? null : null,
        durationMin: booking.duration_min_snapshot,
        price: booking.price_snapshot?.toString() ?? null,
        coverageType: booking.coverage_type,
        paymentStatus: booking.payment_status,
        entitlementRestoredAt: booking.entitlement_restored_at,
        service: { id: booking.service.id, name: booking.service.name, category: booking.service.category },
        trainer: booking.employee_id != null && trainerById.has(booking.employee_id)
          ? this.mapTrainer(trainerById.get(booking.employee_id)!)
          : null,
        schedule: {
          id: booking.schedule.id,
          date: booking.schedule.slot_date,
          startTime: booking.schedule.start_time,
          endTime: booking.schedule.end_time,
        },
        createdAt: booking.created_at,
      })),
    };
  }

  async cancelBooking(
    appUserId: number,
    memberId: number,
    bookingId: number,
    expectedCategory?: MobileAppointmentCategory,
  ) {
    await this.assertCustomer(appUserId, memberId);
    return this.prisma.$transaction(async (tx) => {
      if (expectedCategory === 'nutrition') {
        await tx.$queryRaw`
          SELECT p.id
          FROM club_provider_monthly_availabilities p
          INNER JOIN club_availability_slots s ON s.monthly_availability_id = p.id
          INNER JOIN club_bookings b ON b.availability_slot_id = s.id
          WHERE b.id = ${bookingId}
          FOR UPDATE
        `;
        await tx.$queryRaw`
          SELECT s.id
          FROM club_availability_slots s
          INNER JOIN club_bookings b ON b.availability_slot_id = s.id
          WHERE b.id = ${bookingId}
          FOR UPDATE
        `;
      }
      const snapshot = await tx.club_bookings.findFirst({
        where: {
          id: bookingId,
          is_deleted: false,
          ...(expectedCategory ? { service: { category: expectedCategory } } : {}),
        },
        select: { schedule_id: true },
      });
      if (!snapshot) throw new NotFoundException('الحجز غير موجود.');
      await this.lockSchedule(tx, snapshot.schedule_id);
      await this.lockBooking(tx, bookingId);
      const booking = await tx.club_bookings.findFirst({
        where: { id: bookingId, is_deleted: false },
        include: {
          service: { select: { id: true, name: true, category: true } },
          schedule: true,
        },
      });
      if (!booking) throw new NotFoundException('الحجز غير موجود.');
      if (expectedCategory == null && booking.service.category === 'nutrition') {
        throw new ConflictException('استخدم مسار التغذية المخصص.');
      }
      if (booking.member_id !== memberId) throw new ForbiddenException('لا يمكنك إلغاء هذا الحجز.');
      if (!['pending', 'confirmed', 'wait'].includes(booking.status)) {
        throw new ConflictException(`لا يمكن إلغاء الحجز بحالته الحالية: ${booking.status}.`);
      }
      this.assertCancellationWindow(booking.schedule);
      await tx.club_bookings.update({ where: { id: booking.id }, data: { status: 'cancelled' } });

      let promotedBookingId: number | null = null;
      if (booking.status === 'pending' || booking.status === 'confirmed') {
        const waiting = await tx.club_bookings.findFirst({
          where: { schedule_id: booking.schedule_id, status: 'wait', is_deleted: false },
          orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
        });
        if (waiting) {
          await tx.club_bookings.update({ where: { id: waiting.id }, data: { status: 'confirmed' } });
          promotedBookingId = waiting.id;
          if (waiting.member_id != null) {
            const promoted = await tx.club_members.findUnique({
              where: { id: waiting.member_id },
              select: { app_user_id: true },
            });
            await tx.club_notifications.create({
              data: {
                type: 'booking_confirmed',
                booking_id: waiting.id,
                schedule_id: booking.schedule_id,
                member_id: waiting.member_id,
                to_user: promoted?.app_user_id ?? null,
                title: 'تم تأكيد حجزك',
                message: `أصبح موعد ${booking.service.name} متاحًا وتم تأكيد حجزك.`,
                status: 'pending',
                channel: 'in_app',
                branch_id: booking.branch_id,
              },
            });
          }
        } else {
          await tx.club_schedules.updateMany({
            where: { id: booking.schedule_id, booked_count: { gt: 0 } },
            data: { booked_count: { decrement: 1 } },
          });
        }
      }
      return {
        id: booking.id,
        status: 'cancelled',
        code: 'BOOKING_CANCELLED',
        message: 'تم إلغاء الحجز بنجاح.',
        promotedBookingId,
        service: { id: booking.service.id, name: booking.service.name, category: booking.service.category },
      };
    });
  }

  private mapSlot(slot: any, trainer: any, myBooking: any) {
    return {
      id: slot.id,
      date: slot.slot_date,
      startTime: slot.start_time,
      endTime: slot.end_time,
      bookingStartAt: slot.booking_start_at,
      bookingEndAt: slot.booking_end_at,
      capacity: slot.capacity,
      bookedCount: slot.booked_count,
      remainingCapacity: Math.max(0, slot.capacity - slot.booked_count),
      availability: this.availability(slot),
      service: { id: slot.service.id, name: slot.service.name, category: slot.service.category },
      trainer: this.mapTrainer(trainer),
      myBooking,
    };
  }

  private availability(slot: any) {
    if (!slot.booking_start_at || !slot.booking_end_at) {
      return { status: 'BOOKING_WINDOW_NOT_CONFIGURED', canBook: false, canJoinWaitlist: false };
    }
    const now = new Date();
    const cairo = this.cairoNow();
    if (slot.slot_date < cairo.date || (slot.slot_date === cairo.date && slot.start_time.slice(0, 5) <= cairo.time)) {
      return { status: 'APPOINTMENT_STARTED', canBook: false, canJoinWaitlist: false };
    }
    if (now < slot.booking_start_at) {
      return { status: 'BOOKING_NOT_STARTED', canBook: false, canJoinWaitlist: false };
    }
    if (now > slot.booking_end_at) {
      return { status: 'BOOKING_CLOSED', canBook: false, canJoinWaitlist: false };
    }
    if (slot.booked_count >= slot.capacity) {
      return { status: 'WAITLIST_ONLY', canBook: true, canJoinWaitlist: true };
    }
    return { status: 'BOOKING_AVAILABLE', canBook: true, canJoinWaitlist: false };
  }

  private assertBookable(slot: any) {
    if (slot.monthly_schedule?.status !== 'published') throw new ConflictException('الجدول الشهري غير منشور.');
    if (slot.status !== 'available') throw new ConflictException('الموعد غير متاح للحجز.');
    const availability = this.availability(slot);
    if (!availability.canBook) throw new ConflictException(this.availabilityMessage(availability.status));
  }

  private assertCancellationWindow(slot: any) {
    const cairo = this.cairoNow();
    if (slot.slot_date < cairo.date || (slot.slot_date === cairo.date && slot.start_time.slice(0, 5) <= cairo.time)) {
      throw new ConflictException('بدأ الموعد بالفعل ولا يمكن إلغاء الحجز.');
    }
    if (slot.booking_end_at && new Date() > slot.booking_end_at) {
      throw new ConflictException('انتهت فترة إلغاء الحجز.');
    }
  }

  private availabilityMessage(status: string) {
    const messages: Record<string, string> = {
      BOOKING_WINDOW_NOT_CONFIGURED: 'فترة فتح وغلق الحجز غير محددة لهذا الموعد.',
      BOOKING_NOT_STARTED: 'فترة الحجز لم تبدأ بعد.',
      BOOKING_CLOSED: 'انتهت فترة الحجز.',
      APPOINTMENT_STARTED: 'بدأ الموعد بالفعل.',
    };
    return messages[status] ?? 'الموعد غير متاح للحجز.';
  }

  private async assertCustomer(appUserId: number, memberId: number) {
    const member = await this.prisma.club_members.findFirst({
      where: { id: memberId, app_user_id: appUserId, is_active: true, is_deleted: false },
      select: { id: true, name: true },
    });
    if (!member) throw new ForbiddenException('عضوية التطبيق غير صالحة أو غير نشطة.');
    return member;
  }

  private waitPositions(rows: Array<{ id: number; schedule_id: number }>) {
    const counters = new Map<number, number>();
    const positions = new Map<number, number>();
    for (const row of rows) {
      const position = (counters.get(row.schedule_id) ?? 0) + 1;
      counters.set(row.schedule_id, position);
      positions.set(row.id, position);
    }
    return positions;
  }

  private mapTrainer(trainer: { id: number; name: string; specialization: string | null; image_url: string | null }) {
    return {
      id: trainer.id,
      name: trainer.name,
      specialization: trainer.specialization,
      imageUrl: trainer.image_url,
    };
  }

  private lockSchedule(tx: Prisma.TransactionClient, id: number) {
    return tx.$queryRaw<Array<{ id: number }>>(Prisma.sql`SELECT id FROM club_schedules WHERE id = ${id} FOR UPDATE`);
  }

  private lockBooking(tx: Prisma.TransactionClient, id: number) {
    return tx.$queryRaw<Array<{ id: number }>>(Prisma.sql`SELECT id FROM club_bookings WHERE id = ${id} FOR UPDATE`);
  }

  private lockMemberBooking(tx: Prisma.TransactionClient, scheduleId: number, memberId: number) {
    return tx.$queryRaw<Array<{ id: number }>>(
      Prisma.sql`SELECT id FROM club_bookings WHERE schedule_id = ${scheduleId} AND member_id = ${memberId} FOR UPDATE`,
    );
  }

  private cairoNow() {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Cairo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date());
    const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
    return { date: `${value('year')}-${value('month')}-${value('day')}`, time: `${value('hour')}:${value('minute')}` };
  }
}
