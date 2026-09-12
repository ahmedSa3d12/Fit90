import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { isTrainerJobTitle } from '../employees/trainer-job-title.util';

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function monthBounds(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new BadRequestException('الشهر يجب أن يكون بصيغة YYYY-MM');
  }
  const [year, monthNumber] = month.split('-').map(Number);
  const nextYear = monthNumber === 12 ? year + 1 : year;
  const nextMonth = monthNumber === 12 ? 1 : monthNumber + 1;
  return {
    year,
    monthNumber,
    dateFrom: `${month}-01`,
    dateTo: `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`,
    startAt: new Date(year, monthNumber - 1, 1),
    endAt: new Date(nextYear, nextMonth - 1, 1),
  };
}

function localDate(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

@Injectable()
export class TrainerDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  private async resolveTrainer(userId: number) {
    const user = await this.prisma.users.findUnique({
      where: { user_id: userId },
      select: { emp_code: true },
    });
    if (!user?.emp_code) throw new NotFoundException('حساب المستخدم غير مرتبط بموظف');

    const employee = await this.prisma.employees.findUnique({
      where: { id: user.emp_code },
      select: {
        id: true,
        employee: true,
        email: true,
        phone: true,
        personal_photo: true,
        branch_id_fk: true,
        mosma_wazefy_n: true,
        employee_target: true,
        employee_commission: true,
      },
    });
    if (!employee || !isTrainerJobTitle(employee.mosma_wazefy_n)) {
      throw new NotFoundException('الحساب الحالي ليس حساب مدرب');
    }

    let trainer = await this.prisma.club_trainers.findFirst({
      where: { employee_id: employee.id, is_deleted: false },
    });
    if (!trainer) {
      const identityMatches = [
        ...(employee.email ? [{ email: employee.email }] : []),
        ...(employee.phone ? [{ phone: employee.phone }] : []),
        ...(employee.employee ? [{ name: employee.employee }] : []),
      ];
      const legacyTrainers = identityMatches.length
        ? await this.prisma.club_trainers.findMany({
            where: { employee_id: null, is_deleted: false, OR: identityMatches },
          })
        : [];
      if (legacyTrainers.length === 1) {
        trainer = await this.prisma.club_trainers.update({
          where: { id: legacyTrainers[0].id },
          data: { employee_id: employee.id },
        });
      } else {
        trainer = await this.prisma.club_trainers.create({
          data: {
            employee_id: employee.id,
            name: employee.employee ?? 'مدرب',
            email: employee.email,
            phone: employee.phone,
            specialization: employee.mosma_wazefy_n,
            image_url: employee.personal_photo,
            is_active: true,
          },
        });
      }
    }
    return { employee, trainer };
  }

  async getDashboard(userId: number, requestedMonth?: string) {
    const month = requestedMonth || currentMonth();
    const bounds = monthBounds(month);
    const { employee, trainer } = await this.resolveTrainer(userId);

    const members = await this.prisma.club_members.findMany({
      where: { trainer_id: trainer.id, is_deleted: false },
      select: { id: true, member_code: true, name: true, phone: true, is_active: true },
      orderBy: { name: 'asc' },
    });
    const memberIds = members.map((member) => member.id);
    const subscriptionOwnership = {
      OR: [
        { employee_id: employee.id },
        { member_id: { in: memberIds } },
        { member: { is: { trainer_id: trainer.id, is_deleted: false } } },
      ],
    };

    const [subscriptions, monthlySalesSubscriptions, schedules, classPlans, legacyClasses, receipts, providerWindows] = await Promise.all([
      this.prisma.club_subscriptions.findMany({
        where: {
          ...subscriptionOwnership,
          subscription_start_date: { lt: bounds.dateTo },
          subscription_end_date: { gte: bounds.dateFrom },
        },
        select: {
          id: true,
          member_id: true,
          subscription_number: true,
          subscription_type: true,
          subscription_start_date: true,
          subscription_end_date: true,
          sessions_count: true,
          sessions_used: true,
          is_linked_to_sessions: true,
          status: true,
          member: { select: { id: true, member_code: true, name: true, phone: true } },
        },
        orderBy: { subscription_end_date: 'asc' },
      }),
      this.prisma.club_subscriptions.findMany({
        where: {
          ...subscriptionOwnership,
          registration_date: { gte: bounds.dateFrom, lt: bounds.dateTo },
        },
        select: {
          id: true,
          member_id: true,
          subscription_number: true,
          customer_name: true,
          subscription_type: true,
          registration_date: true,
          subscription_value: true,
          paid_amount: true,
          remaining_amount: true,
          status: true,
          member: { select: { id: true, name: true } },
        },
        orderBy: [{ registration_date: 'desc' }, { id: 'desc' }],
      }),
      this.prisma.club_schedules.findMany({
        where: {
          employee_id: trainer.id,
          is_deleted: false,
          slot_date: { gte: bounds.dateFrom, lt: bounds.dateTo },
          status: { not: 'cancelled' },
        },
        include: {
          service: { select: { name: true, category: true, color: true } },
          bookings: {
            where: { is_deleted: false, status: { not: 'cancelled' } },
            select: { id: true, member_name: true, status: true },
          },
        },
        orderBy: [{ slot_date: 'asc' }, { start_time: 'asc' }],
      }),
      this.prisma.club_class_monthly_schedules.findMany({
        where: { trainer_id: trainer.id, month: bounds.monthNumber, year: bounds.year, status: { not: 'archived' } },
        include: {
          class: { select: { name: true } },
          slots: {
            where: { start_at: { gte: bounds.startAt, lt: bounds.endAt }, status: { not: 'cancelled' } },
            include: {
              bookings: {
                where: { status: { not: 'cancelled' } },
                include: { member: { select: { name: true } } },
              },
            },
            orderBy: { start_at: 'asc' },
          },
        },
      }),
      this.prisma.club_classes.findMany({
        where: {
          trainer_id: trainer.id,
          is_deleted: false,
          class_date: { gte: bounds.dateFrom, lt: bounds.dateTo },
          status: { not: 'cancelled' },
        },
        include: {
          enrollments: {
            where: { attendance_status: { not: 'cancelled' } },
            select: { attendance_status: true },
          },
        },
        orderBy: [{ class_date: 'asc' }, { start_time: 'asc' }],
      }),
      this.prisma.club_receipts.findMany({
        where: {
          receipt_date: { gte: bounds.dateFrom, lt: bounds.dateTo },
          OR: [
            { member_id: { in: memberIds } },
            { member: { is: { trainer_id: trainer.id, is_deleted: false } } },
            { subscription: { is: subscriptionOwnership } },
          ],
        },
        select: { amount: true },
      }),
      this.prisma.club_availability_slots.findMany({
        where: {
          trainer_id: trainer.id,
          module_type: { in: ['spa', 'personal_training', 'nutrition'] },
          slot_date: { gte: bounds.dateFrom, lt: bounds.dateTo },
          is_active: true,
          is_deleted: false,
          cancelled_at: null,
          monthly_availability: { is: { status: 'published' } },
        },
        include: {
          monthly_availability: { select: { category: true } },
          nutrition_bookings: {
            where: { is_deleted: false, status: { not: 'cancelled' } },
            select: { member_name: true, status: true },
          },
        },
        orderBy: [{ slot_date: 'asc' }, { start_time: 'asc' }],
      }),
    ]);

    const memberById = new Map(members.map((member) => [member.id, member]));
    const sessionSubscriptions = subscriptions.filter((subscription) => subscription.is_linked_to_sessions);
    const sessionsTotal = sessionSubscriptions.reduce((sum, subscription) => sum + (subscription.sessions_count ?? 0), 0);
    const sessionsUsed = sessionSubscriptions.reduce((sum, subscription) => sum + subscription.sessions_used, 0);

    const appointments = [
      ...schedules.map((schedule) => ({
        id: `schedule-${schedule.id}`,
        source: 'appointment',
        kind: schedule.service.category ?? 'appointment',
        className: null,
        title: schedule.service.name,
        category: schedule.service.category,
        date: schedule.slot_date,
        startTime: schedule.start_time,
        endTime: schedule.end_time,
        status: schedule.bookings.some((booking) => booking.status === 'completed') ? 'completed' : schedule.status,
        memberNames: schedule.bookings.map((booking) => booking.member_name).filter(Boolean),
        bookingsCount: schedule.bookings.length,
        capacity: schedule.capacity,
      })),
      ...providerWindows.map((window) => ({
        id: `provider-window-${window.id}`,
        source: 'provider-availability',
        kind: window.monthly_availability?.category ?? window.module_type,
        className: null,
        title: window.monthly_availability?.category === 'spa'
          ? 'SPA'
          : window.monthly_availability?.category === 'personal_training'
            ? 'تدريب شخصي'
            : 'تغذية',
        category: window.monthly_availability?.category ?? window.module_type,
        date: window.slot_date,
        startTime: window.start_time,
        endTime: window.end_time,
        status: window.nutrition_bookings.some((booking) => booking.status === 'completed') ? 'completed' : 'available',
        memberNames: window.nutrition_bookings.map((booking) => booking.member_name).filter(Boolean),
        bookingsCount: window.nutrition_bookings.length,
        capacity: window.capacity,
      })),
      ...classPlans.flatMap((plan) =>
        plan.slots.map((slot) => ({
          id: `class-slot-${slot.id}`,
          source: 'class',
          kind: 'class',
          className: plan.class?.name ?? null,
          title: plan.class?.name ?? 'غير محدد',
          category: 'class',
          date: localDate(slot.start_at),
          startTime: slot.start_at.toTimeString().slice(0, 5),
          endTime: slot.end_at.toTimeString().slice(0, 5),
          status: slot.bookings.some((booking) => booking.status === 'completed') ? 'completed' : slot.status,
          memberNames: slot.bookings.map((booking) => booking.member?.name).filter(Boolean),
          bookingsCount: slot.bookings.length,
          capacity: slot.capacity,
        })),
      ),
      ...legacyClasses.map((item) => ({
        id: `legacy-class-${item.id}`,
        source: 'class',
        kind: 'class',
        className: item.class_name || null,
        title: item.class_name || 'غير محدد',
        category: 'class',
        date: item.class_date,
        startTime: item.start_time,
        endTime: item.end_time,
        status: item.status,
        memberNames: [],
        bookingsCount: item.enrollments.length,
        capacity: item.max_capacity,
      })),
    ].sort((a, b) => `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`));

    const completedAppointments = appointments.filter((item) => item.status === 'completed').length;
    const target = Number(employee.employee_target ?? 0);
    const commissionRate = Number(employee.employee_commission ?? 0);
    const collected = receipts.reduce((sum, item) => sum + Number(item.amount), 0);
    const totalSales = monthlySalesSubscriptions.reduce((sum, item) => sum + Number(item.subscription_value), 0);
    const outstanding = monthlySalesSubscriptions.reduce((sum, item) => sum + Number(item.remaining_amount), 0);

    return {
      month,
      trainer: {
        id: trainer.id,
        employeeId: employee.id,
        name: trainer.name,
        specialization: trainer.specialization,
        imageUrl: trainer.image_url,
        target: employee.employee_target?.toString() ?? null,
        commissionRate: employee.employee_commission?.toString() ?? null,
      },
      summary: {
        assignedMembers: members.length,
        activeSubscriptions: subscriptions.length,
        sessionsTotal,
        sessionsUsed,
        sessionsRemaining: Math.max(0, sessionsTotal - sessionsUsed),
        monthAppointments: appointments.length,
        completedAppointments,
        remainingAppointments: Math.max(0, appointments.length - completedAppointments),
        monthlySubscriptions: monthlySalesSubscriptions.length,
        totalSales,
        collected,
        outstanding,
        target,
        targetRemaining: Math.max(0, target - collected),
        targetAchievement: target > 0 ? Math.min(100, Math.round((collected / target) * 100)) : 0,
        commissionRate,
        commissionAmount: collected * (commissionRate / 100),
      },
      subscriptions: subscriptions.map((subscription) => ({
        id: subscription.id,
        memberId: subscription.member_id,
        memberCode: subscription.member?.member_code ?? (subscription.member_id ? memberById.get(subscription.member_id)?.member_code ?? null : null),
        memberName: subscription.member?.name ?? (subscription.member_id ? memberById.get(subscription.member_id)?.name ?? '—' : '—'),
        memberPhone: subscription.member?.phone ?? (subscription.member_id ? memberById.get(subscription.member_id)?.phone ?? null : null),
        subscriptionNumber: subscription.subscription_number,
        subscriptionType: subscription.subscription_type,
        startDate: subscription.subscription_start_date,
        endDate: subscription.subscription_end_date,
        sessionsTotal: subscription.sessions_count,
        sessionsUsed: subscription.sessions_used,
        sessionsRemaining: Math.max(0, (subscription.sessions_count ?? 0) - subscription.sessions_used),
        status: subscription.status,
      })),
      monthlySalesSubscriptions: monthlySalesSubscriptions.map((subscription) => ({
        id: subscription.id,
        memberName: subscription.member?.name ?? (subscription.member_id
          ? memberById.get(subscription.member_id)?.name ?? subscription.customer_name ?? '—'
          : subscription.customer_name ?? '—'),
        subscriptionNumber: subscription.subscription_number,
        subscriptionType: subscription.subscription_type,
        registrationDate: subscription.registration_date,
        value: Number(subscription.subscription_value),
        paid: Number(subscription.paid_amount),
        remaining: Number(subscription.remaining_amount),
        status: subscription.status,
      })),
      appointments,
    };
  }
}
