import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AvailabilityService } from '../scheduling/availability.service';
import { NutritionBookingsService } from '../scheduling/nutrition-bookings.service';

export type ProviderAppointmentCategory = 'spa' | 'personal_training';

type BookingInput = {
  availabilitySlotId: number;
  serviceId?: number;
  startTime?: string;
  joinWaitlist?: boolean;
};

@Injectable()
export class MobileProviderAppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eligibility: NutritionBookingsService,
    private readonly availability?: AvailabilityService,
  ) {}

  async publishedPlans(appUserId: number, memberId: number, category: ProviderAppointmentCategory, take: number) {
    await this.assertCustomer(appUserId, memberId);
    const rows = await this.prisma.club_provider_monthly_availabilities.findMany({
      where: { category, status: 'published' },
      select: {
        id: true, employee_id: true, category: true, month: true, year: true, published_at: true,
        windows: {
          where: { is_deleted: false, is_active: true, cancelled_at: null },
          select: { id: true },
        },
      },
      orderBy: [{ published_at: 'desc' }, { id: 'desc' }],
      take,
    });
    const trainerIds = [...new Set(rows.map((row) => row.employee_id))];
    const trainers = await this.prisma.club_trainers.findMany({
      where: { id: { in: trainerIds }, is_deleted: false },
      select: { id: true, name: true },
    });
    const trainerNames = new Map(trainers.map((trainer) => [trainer.id, trainer.name]));
    return {
      data: rows.map((row) => ({
        id: row.id,
        category: row.category,
        month: row.month,
        year: row.year,
        publishedAt: row.published_at,
        trainer: { id: row.employee_id, name: trainerNames.get(row.employee_id) ?? `#${row.employee_id}` },
        windowsCount: row.windows.length,
      })),
    };
  }

  async plan(appUserId: number, memberId: number, category: ProviderAppointmentCategory, planId: number) {
    await this.assertCustomer(appUserId, memberId);
    const plan = await this.prisma.club_provider_monthly_availabilities.findFirst({
      where: { id: planId, category, status: 'published' },
      include: {
        windows: {
          where: { is_deleted: false },
          orderBy: [{ slot_date: 'asc' }, { start_time: 'asc' }],
        },
      },
    });
    if (!plan) throw new NotFoundException({ code: 'APPOINTMENT_PLAN_NOT_FOUND', message: 'الجدول الشهري غير موجود أو غير منشور.' });
    const [trainer, counts] = await Promise.all([
      this.prisma.club_trainers.findFirst({ where: { id: plan.employee_id, is_deleted: false }, select: { id: true, name: true } }),
      this.prisma.club_bookings.groupBy({
        by: ['availability_slot_id'],
        where: {
          availability_slot_id: { in: plan.windows.map((window) => window.id) },
          is_deleted: false,
          status: { in: ['pending', 'confirmed'] },
        },
        _count: { _all: true },
      }),
    ]);
    const bookedByWindow = new Map(counts.map((count) => [count.availability_slot_id, count._count._all]));
    return {
      id: plan.id,
      category: plan.category,
      month: plan.month,
      year: plan.year,
      publishedAt: plan.published_at,
      trainer: trainer ?? { id: plan.employee_id, name: `#${plan.employee_id}` },
      windows: plan.windows.map((window) => this.mapWindow(window, bookedByWindow.get(window.id) ?? 0)),
    };
  }

  async spaServices(appUserId: number, memberId: number) {
    await this.assertCustomer(appUserId, memberId);
    const rows = await this.prisma.club_services.findMany({
      where: { category: 'spa', is_active: true, is_deleted: false },
      select: { id: true, name: true, description: true, duration_min: true, price: true },
      orderBy: { name: 'asc' },
    });
    return { data: rows.map((row) => ({ id: row.id, name: row.name, description: row.description, durationMin: row.duration_min, price: row.price.toString() })) };
  }

  async windowForServices(appUserId: number, memberId: number, windowId: number) {
    await this.windowForMember(appUserId, memberId, 'spa', windowId);
    return this.spaServices(appUserId, memberId);
  }

  async spaEligibility(
    appUserId: number,
    memberId: number,
    windowId: number,
    serviceId: number,
    language = 'ar',
  ) {
    const window = await this.windowForMember(appUserId, memberId, 'spa', windowId);
    const result = await this.eligibility.eligibility(memberId, serviceId, window.slot_date, 'spa');
    const english = language.toLowerCase().startsWith('en');
    if (result.coverageType === 'subscription' && result.remaining > 0) {
      return {
        ...result,
        messageCode: 'SPA_FREE_BALANCE_AVAILABLE',
        message: english
          ? `Your free SPA balance: ${result.total} services. You used ${result.used} and have ${result.remaining} remaining.`
          : `رصيدك المجاني: ${result.total} خدمات. استخدمت ${result.used}، والمتبقي ${result.remaining}.`,
      };
    }
    return {
      ...result,
      messageCode: 'SPA_PAID_BOOKING_REQUIRED',
      message: english
        ? `No free SPA balance is available. This service will be paid at ${result.amountDue}.`
        : `لا يوجد رصيد مجاني؛ الخدمة ستكون مدفوعة بمبلغ ${result.amountDue}.`,
    };
  }

  async spaAvailableTimes(appUserId: number, memberId: number, windowId: number, serviceId: number) {
    const window = await this.windowForMember(appUserId, memberId, 'spa', windowId);
    if (!this.availability) throw new NotFoundException('خدمة المواعيد غير متاحة.');
    const available = await this.availability.providerAvailableTimes(
      serviceId,
      window.trainer_id!,
      window.slot_date,
      'spa',
      window.branch_id ?? undefined,
    );
    return {
      ...available,
      times: available.times.filter((time) => time.availabilitySlotId === window.id),
    };
  }

  async personalTrainingEligibility(appUserId: number, memberId: number, windowId: number) {
    const window = await this.windowForMember(appUserId, memberId, 'personal_training', windowId);
    return this.eligibility.personalTrainingEligibility(memberId, window.slot_date);
  }

  async bookSpa(appUserId: number, memberId: number, body: BookingInput) {
    const window = await this.windowForMember(appUserId, memberId, 'spa', body.availabilitySlotId);
    const isFull = await this.assertWindowCapacity(window, body.joinWaitlist === true);
    if (!body.serviceId || !body.startTime) throw new ConflictException({ code: 'APPOINTMENT_SELECTION_REQUIRED', message: 'اختر الخدمة والموعد أولاً.' });
    return this.eligibility.create({
      availabilitySlotId: body.availabilitySlotId,
      memberId,
      serviceId: body.serviceId,
      startTime: body.startTime,
      status: isFull ? 'wait' : 'confirmed',
    }, undefined, 'spa');
  }

  async bookPersonalTraining(appUserId: number, memberId: number, body: BookingInput) {
    const window = await this.windowForMember(appUserId, memberId, 'personal_training', body.availabilitySlotId);
    const isFull = await this.assertWindowCapacity(window, body.joinWaitlist === true);
    const eligibility = await this.eligibility.personalTrainingEligibility(memberId, window.slot_date);
    if (!eligibility.hasPersonalTrainingSubscription || eligibility.remaining <= 0) {
      throw new ConflictException({ code: 'PERSONAL_TRAINING_SUBSCRIPTION_UNAVAILABLE', message: 'لا توجد اشتراكات تدريب شخصي متاحة.' });
    }
    return this.eligibility.createPersonalTrainingAttendance({
      availabilitySlotId: body.availabilitySlotId,
      memberId,
      status: isFull ? 'wait' : 'confirmed',
    });
  }

  async myBookings(appUserId: number, memberId: number, category: ProviderAppointmentCategory, scope: 'upcoming' | 'past' | 'all' = 'upcoming') {
    await this.assertCustomer(appUserId, memberId);
    const today = this.cairoNow().date;
    const rows = await this.prisma.club_bookings.findMany({
      where: {
        member_id: memberId,
        is_deleted: false,
        service: { category },
        ...(scope === 'past' ? { booking_date: { lt: today } } : scope === 'all' ? {} : { booking_date: { gte: today } }),
      },
      include: {
        service: { select: { id: true, name: true } },
        availability_slot: { select: { id: true, slot_date: true, start_time: true, end_time: true, capacity: true, booked_count: true } },
      },
      orderBy: [{ booking_date: scope === 'past' ? 'desc' : 'asc' }, { id: 'desc' }],
    });
    return { data: rows.map((row) => ({
      id: row.id, bookingNumber: row.booking_number, status: row.status, coverageType: row.coverage_type,
      paymentStatus: row.payment_status, price: row.price_snapshot?.toString() ?? null,
      service: category === 'personal_training'
        ? { id: row.service.id, name: 'تدريب شخصي', category: 'personal_training' }
        : row.service,
      window: row.availability_slot,
    })) };
  }

  async cancelBooking(appUserId: number, memberId: number, category: ProviderAppointmentCategory, bookingId: number) {
    await this.assertCustomer(appUserId, memberId);
    const booking = await this.prisma.club_bookings.findFirst({
      where: { id: bookingId, member_id: memberId, is_deleted: false, service: { category } },
      select: { id: true },
    });
    if (!booking) throw new ForbiddenException({ code: 'APPOINTMENT_CANCELLATION_FORBIDDEN', message: 'لا يمكنك إلغاء هذا الحجز.' });
    return this.eligibility.transitionStatus(bookingId, 'cancelled', undefined, category);
  }

  private async windowForMember(appUserId: number, memberId: number, category: ProviderAppointmentCategory, windowId: number) {
    await this.assertCustomer(appUserId, memberId);
    const window = await this.prisma.club_availability_slots.findFirst({
      where: { id: windowId, module_type: category, is_deleted: false, is_active: true, cancelled_at: null, monthly_availability: { is: { category, status: 'published' } } },
    });
    if (!window) throw new NotFoundException({ code: 'APPOINTMENT_WINDOW_NOT_FOUND', message: 'الموعد غير موجود أو غير منشور.' });
    return window;
  }

  private async assertWindowCapacity(window: any, joinWaitlist: boolean) {
    const active = await this.prisma.club_bookings.count({
      where: { availability_slot_id: window.id, is_deleted: false, status: { in: ['pending', 'confirmed'] } },
    });
    if (active >= Math.max(1, Number(window.capacity ?? 1))) {
      if (joinWaitlist) return true;
      throw new ConflictException({ code: 'APPOINTMENT_CAPACITY_FULL', message: 'العدد اكتمل، اختر موعدًا آخر.' });
    }
    return false;
  }

  private mapWindow(window: any, bookedCount: number) {
    const availability = this.windowAvailability(window, bookedCount);
    return {
      id: window.id,
      date: window.slot_date,
      startTime: window.start_time,
      endTime: window.end_time,
      bookingStartAt: window.booking_start_at,
      bookingEndAt: window.booking_end_at,
      capacity: window.capacity,
      bookedCount,
      remainingCapacity: Math.max(0, Number(window.capacity ?? 1) - bookedCount),
      availability,
    };
  }

  private windowAvailability(window: any, bookedCount: number) {
    const now = new Date();
    const cairo = this.cairoNow();
    if (!window.is_active || window.cancelled_at) return { status: 'CANCELLED', canBook: false };
    if (window.slot_date < cairo.date || (window.slot_date === cairo.date && window.start_time.slice(0, 5) <= cairo.time)) return { status: 'APPOINTMENT_STARTED', canBook: false };
    if (window.booking_start_at && now < window.booking_start_at) return { status: 'BOOKING_NOT_STARTED', canBook: false };
    if (window.booking_end_at && now > window.booking_end_at) return { status: 'BOOKING_CLOSED', canBook: false };
    if (bookedCount >= Math.max(1, Number(window.capacity ?? 1))) return { status: 'CAPACITY_FULL', canBook: false, canJoinWaitlist: true, message: 'العدد اكتمل، اختر موعدًا آخر.' };
    return { status: 'BOOKING_AVAILABLE', canBook: true, canJoinWaitlist: false };
  }

  private async assertCustomer(appUserId: number, memberId: number) {
    const [account, member] = await Promise.all([
      this.prisma.api_users.findFirst({ where: { user_id: appUserId, status: 1 }, select: { user_id: true } }),
      this.prisma.club_members.findFirst({ where: { id: memberId, app_user_id: appUserId, is_active: true, is_deleted: false }, select: { id: true } }),
    ]);
    if (!account || !member) throw new ForbiddenException({ code: 'MEMBER_ACCOUNT_INACTIVE', message: 'حساب العضو غير نشط أو غير مرتبط بالعضوية.' });
  }

  private cairoNow() {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
    const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
    return { date: `${value('year')}-${value('month')}-${value('day')}`, time: `${value('hour')}:${value('minute')}` };
  }
}
