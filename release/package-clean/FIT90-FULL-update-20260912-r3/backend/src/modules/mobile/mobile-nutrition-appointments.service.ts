import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AvailabilityService } from '../scheduling/availability.service';
import { NutritionBookingsService } from '../scheduling/nutrition-bookings.service';

export type MobileNutritionBookingInput = {
  availabilitySlotId: number;
  serviceId: number;
  startTime: string;
  notes?: string;
};

@Injectable()
export class MobileNutritionAppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly availability: AvailabilityService,
    private readonly bookings: NutritionBookingsService,
  ) {}

  async services(appUserId: number, memberId: number) {
    await this.assertCustomer(appUserId, memberId);
    const rows = await this.prisma.club_services.findMany({
      where: { category: 'nutrition', is_active: true, is_deleted: false },
      select: { id: true, name: true, description: true, duration_min: true, price: true, entitlement_key: true },
      orderBy: { name: 'asc' },
    });
    return { data: rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      durationMin: row.duration_min,
      price: row.price.toString(),
      entitlementKey: row.entitlement_key,
    })) };
  }

  async providers(appUserId: number, memberId: number) {
    await this.assertCustomer(appUserId, memberId);
    const rows = await this.prisma.club_availability_slots.findMany({
      where: {
        module_type: 'nutrition',
        service_id: null,
        is_active: true,
        is_deleted: false,
        cancelled_at: null,
        monthly_availability: { is: { category: 'nutrition', status: 'published' } },
        slot_date: { gte: this.cairoDate() },
        trainer_id: { not: null },
      },
      select: { trainer_id: true },
    });
    const ids = [...new Set(rows.map((row) => row.trainer_id).filter((id): id is number => id != null))];
    const providers = await this.prisma.club_trainers.findMany({
      where: { id: { in: ids }, is_active: true, is_deleted: false },
      select: { id: true, name: true, specialization: true, image_url: true },
      orderBy: { name: 'asc' },
    });
    return { data: providers.map((provider) => ({
      id: provider.id,
      name: provider.name,
      specialization: provider.specialization,
      imageUrl: provider.image_url,
    })) };
  }

  async schedule(appUserId: number, memberId: number, serviceId: number | undefined, trainerId: number, year: number, month: number) {
    await this.assertCustomer(appUserId, memberId);
    const service = serviceId == null
      ? null
      : await this.prisma.club_services.findFirst({
        where: { id: serviceId, category: 'nutrition', is_active: true, is_deleted: false },
        select: { id: true, name: true, duration_min: true, price: true, entitlement_key: true },
      });
    if (serviceId != null && !service) throw new NotFoundException('خدمة التغذية غير موجودة.');
    const [provider, plan] = await Promise.all([
      this.prisma.club_trainers.findFirst({
        where: { id: trainerId, is_active: true, is_deleted: false },
        select: { id: true },
      }),
      this.prisma.club_provider_monthly_availabilities.findFirst({
        where: {
          employee_id: trainerId, category: 'nutrition', status: 'published', year, month,
        },
        select: { id: true, employee_id: true, category: true, status: true, year: true, month: true, published_at: true },
      }),
    ]);
    if (!provider || !plan) throw new NotFoundException('Published nutrition schedule not found.');
    const monthText = String(month).padStart(2, '0');
    const dateFrom = `${year}-${monthText}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const dateTo = `${year}-${monthText}-${String(lastDay).padStart(2, '0')}`;
    const effectiveFrom = dateFrom < this.cairoDate() ? this.cairoDate() : dateFrom;
    const windows = await this.prisma.club_availability_slots.findMany({
      where: {
        module_type: 'nutrition', trainer_id: trainerId, service_id: null,
        monthly_availability_id: plan.id,
        slot_date: { gte: effectiveFrom, lte: dateTo }, is_active: true, is_deleted: false,
        cancelled_at: null,
        monthly_availability: { is: { category: 'nutrition', status: 'published' } },
      },
      select: {
        id: true,
        slot_date: true,
        start_time: true,
        end_time: true,
        booking_start_at: true,
        booking_end_at: true,
      },
      orderBy: { slot_date: 'asc' },
    });
    const dates = [...new Set(windows.map((window) => window.slot_date))];
    const now = this.cairoNow();
    const days = await Promise.all(dates.map(async (date) => {
      const result = service
        ? await this.availability.nutritionAvailableTimes(service.id, trainerId, date)
        : { times: [] };
      return {
        date,
        windows: windows.filter((window) => window.slot_date === date).map((window) => ({
          availabilitySlotId: window.id,
          startTime: window.start_time,
          endTime: window.end_time,
          bookingStartAt: window.booking_start_at?.toISOString() ?? null,
          bookingEndAt: window.booking_end_at?.toISOString() ?? null,
          bookingStatus: this.bookingStatus(window, now),
        })),
        times: result.times,
      };
    }));
    return {
      plan: {
        id: plan.id,
        employeeId: plan.employee_id,
        status: plan.status,
        year: plan.year,
        month: plan.month,
        publishedAt: plan.published_at?.toISOString() ?? null,
      },
      service: service
        ? { id: service.id, name: service.name, durationMin: service.duration_min, price: service.price.toString(), entitlementKey: service.entitlement_key }
        : null,
      trainerId, year, month, days,
    };
  }

  async eligibility(appUserId: number, memberId: number, serviceId: number, date: string) {
    await this.assertCustomer(appUserId, memberId);
    return this.bookings.eligibility(memberId, serviceId, date);
  }

  async book(appUserId: number, memberId: number, input: MobileNutritionBookingInput) {
    await this.assertCustomer(appUserId, memberId);
    return this.bookings.create({ ...input, memberId, status: 'confirmed' }, undefined);
  }

  private async assertCustomer(appUserId: number, memberId: number) {
    const member = await this.prisma.club_members.findFirst({
      where: { id: memberId, app_user_id: appUserId, is_active: true, is_deleted: false },
      select: { id: true, name: true },
    });
    if (!member) throw new ForbiddenException('عضوية التطبيق غير صالحة أو غير نشطة.');
    return member;
  }

  private bookingStatus(
    window: { slot_date: string; start_time: string; booking_start_at: Date | null; booking_end_at: Date | null },
    now: { date: string; time: string },
  ) {
    if (window.slot_date < now.date || (window.slot_date === now.date && window.start_time.slice(0, 5) <= now.time)) {
      return 'appointment_started';
    }
    const instant = new Date();
    if (window.booking_start_at && instant < window.booking_start_at) return 'booking_not_started';
    if (window.booking_end_at && instant > window.booking_end_at) return 'booking_closed';
    return 'booking_available';
  }

  private cairoNow() {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date());
    const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
    return { date: `${value('year')}-${value('month')}-${value('day')}`, time: `${value('hour')}:${value('minute')}` };
  }

  private cairoDate() {
    return this.cairoNow().date;
  }
}