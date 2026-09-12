import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtUser } from '../../common/types/jwt-user';
import { EmployeeDataScopeService } from '../../common/employee-scope/employee-data-scope.service';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { availableAppointmentTimes, intervalsOverlap, toClock, toMinutes } from './appointment-time.util';
import { nutritionBenefitTotal, NutritionEntitlementKey, summarizeNutritionEntitlement } from './nutrition-entitlement.util';
import { CreateNutritionBookingDto, CreatePersonalTrainingBookingDto } from './dto/nutrition-booking.dto';

type ProviderBookingCategory = 'nutrition' | 'spa' | 'personal_training';

@Injectable()
export class NutritionBookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly employeeScope: EmployeeDataScopeService,
    private readonly branchScope: BranchScopeService,
  ) {}

  private assertBranchAccess(user: JwtUser | undefined, branchId: number | null) {
    const allowed = this.branchScope.allowedBranchIds(user);
    if (allowed !== null && (branchId == null || !allowed.includes(Number(branchId)))) {
      throw new ForbiddenException('Nutrition booking is outside your branch scope.');
    }
  }

  private async eligibilityWithClient(client: any, memberId: number, service: any, date: string, category: ProviderBookingCategory = 'nutrition') {
    if (category === 'spa') {
      const subscriptions = await client.club_subscriptions.findMany({
        where: { member_id: memberId, status: { in: ['active', 'upcoming'] }, subscription_start_date: { lte: date }, subscription_end_date: { gte: date }, type: { includes_spa: true, spa_count: { gt: 0 } } },
        select: { id: true, subscription_number: true, subscription_type: true, subscription_start_date: true, subscription_end_date: true, type: { select: { spa_count: true } } },
      });
      const total = subscriptions.reduce((sum: number, item: any) => sum + (item.type?.spa_count ?? 0), 0);
      const prior = subscriptions.length ? await client.club_bookings.findMany({
        where: { member_id: memberId, is_deleted: false, coverage_type: 'subscription', entitlement_restored_at: null, status: { in: ['pending', 'confirmed', 'completed', 'no_show'] }, service: { category: 'spa' }, booking_date: { gte: subscriptions.map((item: any) => item.subscription_start_date).sort()[0], lte: subscriptions.map((item: any) => item.subscription_end_date).sort().at(-1) } },
        select: { status: true },
      }) : [];
      const used = prior.filter((item: any) => ['completed', 'no_show'].includes(item.status)).length;
      const reserved = prior.filter((item: any) => ['pending', 'confirmed'].includes(item.status)).length;
      const remaining = Math.max(0, total - used - reserved);
      const covered = remaining > 0;
      return { total, used, reserved, remaining, coverageType: covered ? 'subscription' : 'pay_at_branch', paymentStatus: covered ? 'not_required' : 'due_at_branch', amountDue: covered ? '0.00' : service.price.toString(), sources: subscriptions.map((item: any) => ({ subscriptionId: item.id, subscriptionNumber: item.subscription_number, subscriptionName: item.subscription_type })) };
    }
    if (category === 'personal_training') {
      const subscriptions = await client.club_subscriptions.findMany({
        where: {
          member_id: memberId,
          status: { in: ['active', 'upcoming'] },
          subscription_start_date: { lte: date },
          subscription_end_date: { gte: date },
        },
        select: { id: true, subscription_number: true, subscription_type: true, subscription_start_date: true, subscription_end_date: true, benefits: true, type: { select: { benefits: true } } },
      });
      const sources = subscriptions.map((subscription: any) => ({
        subscriptionId: subscription.id,
        subscriptionNumber: subscription.subscription_number,
        subscriptionName: subscription.subscription_type,
        startDate: subscription.subscription_start_date,
        endDate: subscription.subscription_end_date,
        total: Math.max(0, Number(subscription.benefits?.ptSessions ?? subscription.type?.benefits?.ptSessions ?? 0)),
      }));
      const total = sources.reduce((sum: number, source: any) => sum + source.total, 0);
      const coverageStart = sources.map((source: any) => source.startDate).filter(Boolean).sort()[0] ?? date;
      const coverageEnd = sources.map((source: any) => source.endDate).filter(Boolean).sort().at(-1) ?? date;
      const prior = total > 0 ? await client.club_bookings.findMany({
        where: {
          member_id: memberId,
          is_deleted: false,
          coverage_type: 'subscription',
          entitlement_restored_at: null,
          status: { in: ['pending', 'confirmed', 'completed', 'no_show'] },
          booking_date: { gte: coverageStart, lte: coverageEnd },
          OR: [
            { entitlement_key_snapshot: 'pt_session' },
            { entitlement_key_snapshot: null, service: { category: 'personal_training' } },
          ],
        },
        select: { status: true },
      }) : [];
      const used = prior.filter((item: any) => ['completed', 'no_show'].includes(item.status)).length;
      const reserved = prior.filter((item: any) => ['pending', 'confirmed'].includes(item.status)).length;
      const remaining = Math.max(0, total - used - reserved);
      const covered = remaining > 0;
      return {
        total, used, reserved, remaining,
        hasPersonalTrainingSubscription: total > 0,
        coverageType: covered ? 'subscription' : 'pay_at_branch',
        paymentStatus: covered ? 'not_required' : 'due_at_branch',
        amountDue: covered ? '0.00' : service.price.toString(),
        sources: sources.map(({ total: sourceTotal, ...source }: any) => ({ ...source, total: sourceTotal })),
      };
    }
    const key = service.entitlement_key as NutritionEntitlementKey | null;
    const subscriptions = key ? await client.club_subscriptions.findMany({
      where: {
        member_id: memberId,
        status: { in: ['active', 'upcoming'] },
        subscription_start_date: { lte: date },
        subscription_end_date: { gte: date },
      },
      select: { id: true, subscription_number: true, subscription_type: true, subscription_start_date: true, subscription_end_date: true, benefits: true, type: { select: { inbody_count: true, benefits: true } } },
    }) : [];
    const sources = subscriptions.map((subscription: any) => ({
      subscriptionId: subscription.id,
      subscriptionNumber: subscription.subscription_number,
      subscriptionName: subscription.subscription_type,
      startDate: subscription.subscription_start_date,
      endDate: subscription.subscription_end_date,
      benefits: {
        ...(subscription.type?.benefits && typeof subscription.type.benefits === 'object' ? subscription.type.benefits : {}),
        ...(subscription.benefits && typeof subscription.benefits === 'object' ? subscription.benefits : {}),
      },
      inbodyCount: subscription.type?.inbody_count ?? 0,
    }));
    const total = key ? nutritionBenefitTotal(sources, key) : 0;
    const coverageStart = sources.map((source: any) => source.startDate).filter(Boolean).sort()[0] ?? date;
    const coverageEnd = sources.map((source: any) => source.endDate).filter(Boolean).sort().at(-1) ?? date;
    const prior = key && subscriptions.length ? await client.club_bookings.findMany({
      where: {
        member_id: memberId,
        is_deleted: false,
        coverage_type: 'subscription',
        status: { in: ['pending', 'confirmed', 'completed', 'no_show'] },
        booking_date: { gte: coverageStart, lte: coverageEnd },
        OR: [
          { entitlement_key_snapshot: key },
          { entitlement_key_snapshot: null, service: { entitlement_key: key } },
        ],
      },
      select: { status: true, entitlement_restored_at: true },
    }) : [];
    const summary = summarizeNutritionEntitlement(total, prior.map((booking: any) => ({
      status: booking.status,
      restored: booking.entitlement_restored_at != null,
    })));
    const covered = key != null && summary.remaining > 0;
    return {
      ...summary,
      coverageType: covered ? 'subscription' : 'pay_at_branch',
      paymentStatus: covered ? 'not_required' : 'due_at_branch',
      amountDue: covered ? '0.00' : service.price.toString(),
      sources: sources.map(({ benefits, inbodyCount, ...source }: any) => source),
    };
  }

  async eligibility(memberId: number, serviceId: number, date: string, category: ProviderBookingCategory = 'nutrition') {
    const service = await this.prisma.club_services.findFirst({
      where: { id: serviceId, category, is_active: true, is_deleted: false },
    });
    if (!service) throw new NotFoundException('Service not found.');
    return this.eligibilityWithClient(this.prisma, memberId, service, date, category);
  }

  private async personalTrainingService(client: any) {
    const service = await client.club_services.findFirst({
      where: { category: 'personal_training', is_active: true, is_deleted: false },
      orderBy: { id: 'asc' },
    });
    if (!service) throw new NotFoundException('No active personal-training service is configured.');
    return service;
  }

  async personalTrainingEligibility(memberId: number, date: string) {
    const service = await this.personalTrainingService(this.prisma);
    return this.eligibilityWithClient(this.prisma, memberId, service, date, 'personal_training');
  }

  async createPersonalTrainingAttendance(dto: CreatePersonalTrainingBookingDto, user?: JwtUser) {
    return this.prisma.$transaction(async (tx: any) => {
      await tx.$queryRaw`
        SELECT p.id
        FROM club_provider_monthly_availabilities p
        INNER JOIN club_availability_slots s ON s.monthly_availability_id = p.id
        WHERE s.id = ${dto.availabilitySlotId}
        FOR UPDATE
      `;
      await tx.$queryRaw`SELECT id FROM club_availability_slots WHERE id = ${dto.availabilitySlotId} FOR UPDATE`;
      const window = await tx.club_availability_slots.findFirst({
        where: {
          id: dto.availabilitySlotId,
          module_type: 'personal_training',
          is_active: true,
          is_deleted: false,
          cancelled_at: null,
          monthly_availability: { is: { category: 'personal_training', status: 'published' } },
          AND: [
            { OR: [{ booking_start_at: null }, { booking_start_at: { lte: new Date() } }] },
            { OR: [{ booking_end_at: null }, { booking_end_at: { gte: new Date() } }] },
          ],
        },
      });
      if (!window) throw new NotFoundException('Personal-training attendance window not found.');
      await this.employeeScope.assertProviderAccess(user, window.trainer_id);
      this.assertBranchAccess(user, window.branch_id);
      const now = this.cairoNow();
      if (window.slot_date < now.date || (window.slot_date === now.date && window.start_time.slice(0, 5) <= now.time)) {
        throw new BadRequestException('Past personal-training appointments cannot be booked.');
      }

      const existingCount = await tx.club_bookings.count({
        where: {
          availability_slot_id: window.id,
          is_deleted: false,
          status: { in: ['pending', 'confirmed', 'completed'] },
        },
      });
      if (existingCount >= Math.max(1, Number(window.capacity ?? 1)) && dto.status !== 'wait') {
        throw new ConflictException({
          code: 'APPOINTMENT_CAPACITY_FULL',
          message: 'العدد اكتمل، اختر موعدًا آخر.',
        });
      }

      const service = await this.personalTrainingService(tx);
      // Lock the member before calculating the remaining credit, so the final PT
      // session cannot be reserved by two different appointments at once.
      await tx.$queryRaw`SELECT id FROM club_members WHERE id = ${dto.memberId} FOR UPDATE`;
      const member = await tx.club_members.findFirst({
        where: { id: dto.memberId, is_active: true, is_deleted: false },
        select: { id: true, name: true },
      });
      if (!member) throw new NotFoundException('Member not found or inactive.');
      const eligibility = await this.eligibilityWithClient(tx, member.id, service, window.slot_date, 'personal_training');
      if (!eligibility.hasPersonalTrainingSubscription || eligibility.remaining <= 0) {
        throw new BadRequestException({
          code: 'PERSONAL_TRAINING_SUBSCRIPTION_UNAVAILABLE',
          message: 'لا توجد اشتراكات تدريب شخصي متاحة.',
        });
      }

      const startTime = window.start_time.slice(0, 5);
      const endTime = window.end_time.slice(0, 5);
      const durationMin = toMinutes(endTime) - toMinutes(startTime);
      const schedule = await tx.club_schedules.create({
        data: {
          service_id: service.id,
          employee_id: window.trainer_id,
          branch_id: window.branch_id,
          slot_date: window.slot_date,
          start_time: startTime,
          end_time: endTime,
          capacity: 1,
          booked_count: 1,
          status: 'available',
          notes: `personal_training-attendance:${window.id}`,
        },
      });
      const booking = await tx.club_bookings.create({
        data: {
          booking_number: `BK-${randomUUID().slice(0, 8).toUpperCase()}`,
          member_id: member.id,
          member_name: member.name,
          service_id: service.id,
          schedule_id: schedule.id,
          availability_slot_id: window.id,
          employee_id: window.trainer_id,
          booking_date: window.slot_date,
          status: dto.status ?? 'confirmed',
          notes: dto.notes ?? null,
          duration_min_snapshot: durationMin,
          price_snapshot: service.price,
          coverage_type: 'subscription',
          entitlement_key_snapshot: 'pt_session',
          payment_status: 'not_required',
          branch_id: window.branch_id,
        },
      });
      return {
        id: booking.id,
        bookingNumber: booking.booking_number,
        memberId: booking.member_id,
        memberName: booking.member_name,
        serviceId: service.id,
        serviceName: service.name,
        employeeId: window.trainer_id,
        bookingDate: window.slot_date,
        startTime,
        endTime,
        durationMin,
        status: booking.status,
        coverageType: 'subscription',
        paymentStatus: 'not_required',
        amountDue: '0.00',
        total: eligibility.total,
        used: eligibility.used,
        reserved: eligibility.reserved + 1,
        remaining: Math.max(0, eligibility.remaining - 1),
      };
    });
  }

  async restoreNoShow(bookingId: number, reason: string, user: JwtUser) {
    if (!reason?.trim()) throw new BadRequestException('A restoration reason is required.');
    const booking = await this.prisma.club_bookings.findFirst({
      where: { id: bookingId, is_deleted: false, service: { category: 'nutrition' } },
      select: {
        id: true, status: true, coverage_type: true, entitlement_restored_at: true,
        employee_id: true, branch_id: true,
      },
    });
    if (!booking) throw new NotFoundException('Nutrition booking not found.');
    await this.employeeScope.assertProviderAccess(user, booking.employee_id);
    this.assertBranchAccess(user, booking.branch_id);
    if (booking.status !== 'no_show' || booking.coverage_type !== 'subscription') {
      throw new BadRequestException('Only a subscription-covered no-show can be restored.');
    }
    if (booking.entitlement_restored_at) throw new ConflictException('This entitlement was already restored.');
    const restored = await this.prisma.club_bookings.updateMany({
      where: { id: bookingId, entitlement_restored_at: null },
      data: {
        entitlement_restored_at: new Date(),
        entitlement_restored_by: user.sub,
        entitlement_restore_reason: reason.trim(),
      },
    });
    if (restored.count === 0) throw new ConflictException('This entitlement was already restored.');
    return { success: true };
  }
  async transitionStatus(
    bookingId: number,
    nextStatus: 'completed' | 'cancelled' | 'no_show',
    user?: JwtUser,
    category: ProviderBookingCategory = 'nutrition',
  ) {
    return this.prisma.$transaction(async (tx: any) => {
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
      await tx.$queryRaw`SELECT id FROM club_bookings WHERE id = ${bookingId} FOR UPDATE`;
      const booking = await tx.club_bookings.findFirst({
        where: { id: bookingId, is_deleted: false, service: { category } },
        include: {
          service: { select: { id: true, name: true, category: true } },
          schedule: true,
          availability_slot: { include: { monthly_availability: true } },
        },
      });
      if (!booking || !booking.availability_slot || !booking.availability_slot.monthly_availability) {
        throw new NotFoundException('Provider booking not found.');
      }
      await this.employeeScope.assertProviderAccess(user, booking.employee_id);
      this.assertBranchAccess(user, booking.branch_id);
      const allowedFrom: Record<string, string[]> = {
        completed: ['pending', 'confirmed'],
        no_show: ['pending', 'confirmed'],
        cancelled: ['pending', 'confirmed', 'wait'],
      };
      if (!allowedFrom[nextStatus].includes(booking.status)) {
        throw new ConflictException(`Nutrition booking cannot move from ${booking.status} to ${nextStatus}.`);
      }
      if (nextStatus !== 'cancelled') {
        if (!booking.availability_slot.is_active || booking.availability_slot.cancelled_at) {
          throw new ConflictException('Cancelled attendance cannot be completed or marked no-show.');
        }
        const now = this.cairoNow();
        const start = booking.schedule.start_time.slice(0, 5);
        if (booking.schedule.slot_date > now.date || (booking.schedule.slot_date === now.date && start > now.time)) {
          throw new BadRequestException('Attendance cannot be completed before the appointment starts.');
        }
      }
      const updated = await tx.club_bookings.update({
        where: { id: bookingId },
        data: { status: nextStatus, ...(category !== 'nutrition' && nextStatus === 'cancelled' && booking.coverage_type === 'subscription' ? { entitlement_restored_at: new Date() } : {}) },
      });
      if (nextStatus === 'cancelled') {
        await tx.club_schedules.updateMany({
          where: { id: booking.schedule_id },
          data: { status: 'cancelled', booked_count: 0 },
        });
      } else if (nextStatus === 'no_show') {
        await tx.club_schedules.updateMany({
          where: { id: booking.schedule_id },
          data: { booked_count: 0 },
        });
      }
      await tx.club_appt_booking_additional_services.updateMany({
        where: { booking_id: bookingId, status: { not: 'cancelled' } },
        data: { status: nextStatus === 'completed' ? 'completed' : 'cancelled' },
      });
      return { id: updated.id, status: updated.status };
    });
  }

  async create(dto: CreateNutritionBookingDto, user?: JwtUser, category: ProviderBookingCategory = 'nutrition') {
    return this.prisma.$transaction(async (tx: any) => {
      await tx.$queryRaw`
        SELECT p.id
        FROM club_provider_monthly_availabilities p
        INNER JOIN club_availability_slots s ON s.monthly_availability_id = p.id
        WHERE s.id = ${dto.availabilitySlotId}
        FOR UPDATE
      `;
      await tx.$queryRaw`SELECT id FROM club_availability_slots WHERE id = ${dto.availabilitySlotId} FOR UPDATE`;
      const window = await tx.club_availability_slots.findFirst({
        where: {
          id: dto.availabilitySlotId,
          module_type: category,
          is_active: true,
          is_deleted: false,
          cancelled_at: null,
          monthly_availability: { is: { category, status: 'published' } },
          AND: [
            { OR: [{ booking_start_at: null }, { booking_start_at: { lte: new Date() } }] },
            { OR: [{ booking_end_at: null }, { booking_end_at: { gte: new Date() } }] },
          ],
        },
      });
      if (!window) throw new NotFoundException('Provider attendance window not found.');
      await this.employeeScope.assertProviderAccess(user, window.trainer_id);
      this.assertBranchAccess(user, window.branch_id);
      const existingCount = await tx.club_bookings.count({
        where: {
          availability_slot_id: window.id,
          is_deleted: false,
          status: { in: ['pending', 'confirmed'] },
        },
      });
      if (existingCount >= Math.max(1, Number(window.capacity ?? 1)) && dto.status !== 'wait') {
        throw new ConflictException({
          code: 'APPOINTMENT_CAPACITY_FULL',
          message: 'العدد اكتمل، اختر موعدًا آخر.',
        });
      }
      const service = await tx.club_services.findFirst({
        where: { id: dto.serviceId, category, is_active: true, is_deleted: false },
      });
      if (!service) throw new NotFoundException('Service not found.');
      // Serialize all nutrition entitlement decisions for one member. This prevents
      // two simultaneous bookings on different providers from consuming the same last credit.
      await tx.$queryRaw`SELECT id FROM club_members WHERE id = ${dto.memberId} FOR UPDATE`;
      const member = await tx.club_members.findFirst({
        where: { id: dto.memberId, is_active: true, is_deleted: false },
        select: { id: true, name: true },
      });
      if (!member) throw new NotFoundException('Member not found or inactive.');

      const start = toMinutes(dto.startTime);
      const end = start + service.duration_min;
      if (start < toMinutes(window.start_time) || end > toMinutes(window.end_time)) {
        throw new BadRequestException('The selected service does not fit inside provider attendance.');
      }
      const endTime = toClock(end);
      const existing = await tx.club_bookings.findMany({
        where: {
          employee_id: window.trainer_id,
          booking_date: window.slot_date,
          is_deleted: false,
          status: { in: ['pending', 'confirmed', 'completed'] },
          service: { category },
        },
        select: { schedule: { select: { start_time: true, end_time: true } } },
      });
      if (existing.some((booking: any) => booking.schedule && intervalsOverlap(
        dto.startTime, endTime, booking.schedule.start_time, booking.schedule.end_time,
      ))) throw new ConflictException('This appointment time was just booked. Choose another time.');
      const occupied = existing
        .filter((booking: any) => booking.schedule != null)
        .map((booking: any) => ({ startTime: booking.schedule.start_time, endTime: booking.schedule.end_time }));
      const normalizedStart = dto.startTime.slice(0, 5);
      const allowedStarts = availableAppointmentTimes(
        { startTime: window.start_time, endTime: window.end_time }, service.duration_min, occupied,
      );
      const now = this.cairoNow();
      if (window.slot_date < now.date || (window.slot_date === now.date && normalizedStart <= now.time)) {
        throw new BadRequestException('Past nutrition appointment times cannot be booked.');
      }
      if (!allowedStarts.some((candidate) => candidate.startTime === normalizedStart)) {
        throw new BadRequestException('Choose one of the currently available appointment times.');
      }

      const eligibility = await this.eligibilityWithClient(tx, dto.memberId, service, window.slot_date, category);
      const schedule = await tx.club_schedules.create({
        data: {
          service_id: service.id,
          employee_id: window.trainer_id,
          branch_id: window.branch_id,
          slot_date: window.slot_date,
          start_time: dto.startTime.slice(0, 5),
          end_time: endTime,
          capacity: 1,
          booked_count: 1,
          status: 'available',
          notes: `${category}-availability:${window.id}`,
        },
      });
      const booking = await tx.club_bookings.create({
        data: {
          booking_number: `BK-${randomUUID().slice(0, 8).toUpperCase()}`,
          member_id: member.id,
          member_name: member.name,
          service_id: service.id,
          schedule_id: schedule.id,
          availability_slot_id: window.id,
          employee_id: window.trainer_id,
          booking_date: window.slot_date,
          status: dto.status ?? 'confirmed',
          notes: dto.notes ?? null,
          duration_min_snapshot: service.duration_min,
          price_snapshot: service.price,
          coverage_type: eligibility.coverageType,
          entitlement_key_snapshot: category === 'spa' ? 'spa_session' : category === 'personal_training' ? 'pt_session' : service.entitlement_key,
          payment_status: eligibility.paymentStatus,
          branch_id: window.branch_id,
        },
      });
      return {
        id: booking.id,
        bookingNumber: booking.booking_number,
        memberId: booking.member_id,
        memberName: booking.member_name,
        serviceId: service.id,
        serviceName: service.name,
        employeeId: window.trainer_id,
        bookingDate: window.slot_date,
        startTime: dto.startTime.slice(0, 5),
        endTime,
        durationMin: service.duration_min,
        status: booking.status,
        coverageType: eligibility.coverageType,
        paymentStatus: eligibility.paymentStatus,
        amountDue: eligibility.amountDue,
        total: eligibility.total,
        used: eligibility.used,
        reserved: eligibility.reserved + (eligibility.coverageType === 'subscription' ? 1 : 0),
        remaining: Math.max(0, eligibility.remaining - (eligibility.coverageType === 'subscription' ? 1 : 0)),
      };
    });
  }

  private cairoNow() {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date());
    const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
    return { date: `${value('year')}-${value('month')}-${value('day')}`, time: `${value('hour')}:${value('minute')}` };
  }
}
