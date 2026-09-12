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

    const subscriptions = await this.prisma.club_subscriptions.findMany({
      where: { employee_id: employee.id, registration_date: { gte: month.from, lt: month.to } },
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
    });

    const totalSales = subscriptions.reduce((sum, item) => sum + Number(item.subscription_value), 0);
    const collected = subscriptions.reduce((sum, item) => sum + Number(item.paid_amount), 0);
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
        customers: new Set(subscriptions.map((item) => item.member_id ?? item.customer_name)).size,
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

    const schedules = await this.prisma.club_schedules.findMany({
      where: {
        employee_id: provider.id,
        is_deleted: false,
        slot_date: { gte: month.from, lt: month.to },
        status: { not: 'cancelled' },
        service: { category: 'nutrition' },
      },
      include: {
        service: { select: { name: true, color: true, duration_min: true } },
        bookings: {
          where: { is_deleted: false, status: { not: 'cancelled' } },
          select: { id: true, member_id: true, member_name: true, status: true, notes: true },
        },
      },
      orderBy: [{ slot_date: 'asc' }, { start_time: 'asc' }],
    });

    const appointments = schedules.flatMap<NutritionAppointment>((schedule) => {
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
        scheduleSlots: schedules.length,
        bookings: booked.length,
        completed,
        remaining: Math.max(0, booked.length - completed),
        customers: new Set(booked.map((item) => item.memberId ?? item.memberName)).size,
        availableSlots: appointments.filter((item) => !item.memberId && !item.memberName).length,
        target,
        targetAchievement: target > 0 ? Math.min(100, Math.round((completed / target) * 100)) : 0,
      },
      appointments,
    };
  }
}
