import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { isNutritionJobTitle, isSalesJobTitle } from '../employees/trainer-job-title.util';

export interface NutritionAppointment {
  id: string;
  scheduleId: number;
  serviceName: string;
  date: string;
  startTime: string;
  endTime: string;
  memberId: number | null;
  memberName: string | null;
  status: string;
  notes: string | null;
}

function selectedMonth(month?: string) {
  const now = new Date();
  const value = month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) throw new BadRequestException('الشهر يجب أن يكون بصيغة YYYY-MM');
  const [year, monthNumber] = value.split('-').map(Number);
  const nextYear = monthNumber === 12 ? year + 1 : year;
  const nextMonth = monthNumber === 12 ? 1 : monthNumber + 1;
  return {
    value,
    year,
    monthNumber,
    from: `${value}-01`,
    to: `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`,
  };
}

@Injectable()
export class StaffDashboardsService {
  constructor(private readonly prisma: PrismaService) {}

  private async employeeForUser(userId: number) {
    const user = await this.prisma.users.findUnique({ where: { user_id: userId }, select: { emp_code: true } });
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
    if (!employee) throw new NotFoundException('الموظف غير موجود');
    return employee;
  }

  async salesDashboard(userId: number, requestedMonth?: string) {
    const month = selectedMonth(requestedMonth);
    const employee = await this.employeeForUser(userId);
    if (!isSalesJobTitle(employee.mosma_wazefy_n)) throw new NotFoundException('الحساب الحالي ليس حساب مبيعات');

    const ownership = {
      OR: [
        { employee_id: employee.id },
        { sales_id: employee.id },
        { member: { is: { OR: [{ employee_id: employee.id }, { sales_id: employee.id }] } } },
      ],
    };
    const memberOwnership = {
      OR: [{ employee_id: employee.id }, { sales_id: employee.id }],
    };
    const [subscriptions, assignedMembers, receipts] = await Promise.all([
      this.prisma.club_subscriptions.findMany({
        where: { registration_date: { gte: month.from, lt: month.to }, ...ownership },
      select: {
        id: true,
        member_id: true,
        customer_name: true,
        subscription_number: true,
        subscription_type: true,
        registration_date: true,
        subscription_start_date: true,
        subscription_end_date: true,
        subscription_value: true,
        paid_amount: true,
        remaining_amount: true,
        status: true,
        payment_method: true,
      },
      orderBy: [{ registration_date: 'desc' }, { id: 'desc' }],
      }),
      this.prisma.club_members.findMany({
        where: { is_deleted: false, ...memberOwnership },
        select: { id: true },
      }),
      this.prisma.club_receipts.findMany({
        where: {
          receipt_date: { gte: month.from, lt: month.to },
          OR: [
            { subscription: { is: ownership } },
            { member: { is: { is_deleted: false, ...memberOwnership } } },
          ],
        },
        select: { amount: true },
      }),
    ]);

    const totalSales = subscriptions.reduce((sum, item) => sum + Number(item.subscription_value), 0);
    const collected = receipts.reduce((sum, item) => sum + Number(item.amount), 0);
    const outstanding = subscriptions.reduce((sum, item) => sum + Number(item.remaining_amount), 0);
    const target = Number(employee.employee_target ?? 0);
    const commissionRate = Number(employee.employee_commission ?? 0);

    return {
      month: month.value,
      employee: {
        id: employee.id,
        name: employee.employee ?? 'موظف مبيعات',
        jobTitle: employee.mosma_wazefy_n,
        imageUrl: employee.personal_photo,
        target: employee.employee_target?.toString() ?? null,
        commissionRate: employee.employee_commission?.toString() ?? null,
      },
      summary: {
        subscriptions: subscriptions.length,
        customers: new Set([
          ...assignedMembers.map((member) => `member:${member.id}`),
          ...subscriptions.map((item) => item.member_id != null ? `member:${item.member_id}` : `customer:${item.customer_name ?? item.id}`),
        ]).size,
        totalSales,
        collected,
        outstanding,
        target,
        targetRemaining: Math.max(0, target - collected),
        targetAchievement: target > 0 ? Math.min(100, Math.round((collected / target) * 100)) : 0,
        commissionRate,
        commissionAmount: collected * (commissionRate / 100),
      },
      subscriptions: subscriptions.map((item) => ({
        id: item.id,
        customerName: item.customer_name ?? '—',
        subscriptionNumber: item.subscription_number,
        subscriptionType: item.subscription_type,
        registrationDate: item.registration_date,
        startDate: item.subscription_start_date,
        endDate: item.subscription_end_date,
        value: Number(item.subscription_value),
        paid: Number(item.paid_amount),
        remaining: Number(item.remaining_amount),
        status: item.status,
        paymentMethod: item.payment_method,
      })),
    };
  }

  private async nutritionProvider(employee: Awaited<ReturnType<StaffDashboardsService['employeeForUser']>>) {
    let provider = await this.prisma.club_trainers.findFirst({ where: { employee_id: employee.id, is_deleted: false } });
    if (!provider) {
      provider = await this.prisma.club_trainers.create({
        data: {
          employee_id: employee.id,
          name: employee.employee ?? 'أخصائي تغذية',
          email: employee.email,
          phone: employee.phone,
          specialization: employee.mosma_wazefy_n,
          image_url: employee.personal_photo,
          is_active: true,
        },
      });
    }
    return provider;
  }

  async nutritionDashboard(userId: number, requestedMonth?: string) {
    const month = selectedMonth(requestedMonth);
    const employee = await this.employeeForUser(userId);
    if (!isNutritionJobTitle(employee.mosma_wazefy_n)) throw new NotFoundException('الحساب الحالي ليس حساب أخصائي تغذية');
    const provider = await this.nutritionProvider(employee);

    const [schedules, providerWindows] = await Promise.all([
      this.prisma.club_schedules.findMany({
        where: {
          employee_id: employee.id,
          is_deleted: false,
          slot_date: { gte: month.from, lt: month.to },
          status: { not: 'cancelled' },
          service: { category: 'nutrition' },
        },
        include: {
          service: { select: { name: true, color: true, duration_min: true } },
          bookings: {
            where: { is_deleted: false, status: { not: 'cancelled' } },
            select: { id: true, member_id: true, member_name: true, status: true, notes: true, availability_slot_id: true },
          },
        },
        orderBy: [{ slot_date: 'asc' }, { start_time: 'asc' }],
      }),
      this.prisma.club_availability_slots.findMany({
        where: {
          trainer_id: employee.id,
          module_type: 'nutrition',
          slot_date: { gte: month.from, lt: month.to },
          is_active: true,
          is_deleted: false,
          cancelled_at: null,
          monthly_availability: { is: { category: 'nutrition', status: 'published' } },
        },
        include: {
          monthly_availability: { select: { category: true } },
          nutrition_bookings: {
            where: { is_deleted: false, status: { not: 'cancelled' } },
            select: {
              id: true, member_id: true, member_name: true, status: true, notes: true,
              service: { select: { name: true } },
              schedule: { select: { start_time: true, end_time: true } },
            },
          },
        },
        orderBy: [{ slot_date: 'asc' }, { start_time: 'asc' }],
      }),
    ]);

    // A booking made through the new published monthly availability creates a
    // supporting club_schedule too. Render it from the availability window only,
    // otherwise the specialist would see the same booking twice.
    const legacySchedules = schedules.filter((schedule) => !schedule.bookings.some((booking) => booking.availability_slot_id != null));
    const legacyAppointments = legacySchedules.flatMap<NutritionAppointment>((schedule) => {
      if (!schedule.bookings.length) {
        return [{
          id: `slot-${schedule.id}`,
          scheduleId: schedule.id,
          serviceName: schedule.service.name,
          date: schedule.slot_date,
          startTime: schedule.start_time,
          endTime: schedule.end_time,
          memberId: null,
          memberName: null,
          status: 'available',
          notes: schedule.notes,
        }];
      }
      return schedule.bookings.map((booking) => ({
        id: `booking-${booking.id}`,
        scheduleId: schedule.id,
        serviceName: schedule.service.name,
        date: schedule.slot_date,
        startTime: schedule.start_time,
        endTime: schedule.end_time,
        memberId: booking.member_id,
        memberName: booking.member_name,
        status: booking.status,
        notes: booking.notes ?? schedule.notes,
      }));
    });
    const providerAppointments = providerWindows.flatMap<NutritionAppointment>((window) => {
      if (!window.nutrition_bookings.length) {
        return [{
          id: `provider-window-${window.id}`,
          scheduleId: window.id,
          serviceName: 'تغذية',
          date: window.slot_date,
          startTime: window.start_time,
          endTime: window.end_time,
          memberId: null,
          memberName: null,
          status: 'available',
          notes: null,
        }];
      }
      return window.nutrition_bookings.map((booking) => ({
        id: `provider-booking-${booking.id}`,
        scheduleId: window.id,
        serviceName: booking.service?.name ?? 'تغذية',
        date: window.slot_date,
        startTime: booking.schedule?.start_time ?? window.start_time,
        endTime: booking.schedule?.end_time ?? window.end_time,
        memberId: booking.member_id,
        memberName: booking.member_name,
        status: booking.status,
        notes: booking.notes,
      }));
    });
    const appointments = [...legacyAppointments, ...providerAppointments]
      .sort((a, b) => `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`));
    const booked = appointments.filter((item) => item.memberId != null || item.memberName);
    const completed = booked.filter((item) => item.status === 'completed').length;
    const target = Number(employee.employee_target ?? 0);

    return {
      month: month.value,
      employee: {
        id: employee.id,
        providerId: provider.id,
        name: employee.employee ?? provider.name,
        jobTitle: employee.mosma_wazefy_n,
        imageUrl: employee.personal_photo ?? provider.image_url,
        target: employee.employee_target?.toString() ?? null,
        commissionRate: employee.employee_commission?.toString() ?? null,
      },
      summary: {
        scheduleSlots: legacySchedules.length + providerWindows.length,
        bookings: booked.length,
        completed,
        remaining: Math.max(0, booked.length - completed),
        customers: new Set(booked.map((item) => item.memberId ?? item.memberName)).size,
        availableSlots: legacyAppointments.filter((item) => !item.memberId && !item.memberName).length
          + providerWindows.filter((window) => window.nutrition_bookings.length < Math.max(1, Number(window.capacity ?? 1))).length,
        target,
        targetAchievement: target > 0 ? Math.min(100, Math.round((completed / target) * 100)) : 0,
      },
      appointments,
    };
  }
}
