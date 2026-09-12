import { StaffDashboardsService } from './staff-dashboards.service';

describe('StaffDashboardsService', () => {
  it('includes subscriptions and clients assigned to the sales representative and totals this month receipts', async () => {
    const prisma: any = {
      users: { findUnique: jest.fn().mockResolvedValue({ emp_code: 7 }) },
      employees: { findUnique: jest.fn().mockResolvedValue({
        id: 7, employee: 'مندوب المبيعات', email: null, phone: null, personal_photo: null,
        branch_id_fk: 1, mosma_wazefy_n: 'مندوب مبيعات', employee_target: 1000, employee_commission: 10,
      }) },
      club_subscriptions: { findMany: jest.fn().mockResolvedValue([{
        id: 50, member_id: 22, customer_name: 'Client One', subscription_number: 'SUB001',
        subscription_type: 'Gold', registration_date: '2026-09-05', subscription_start_date: '2026-09-05',
        subscription_end_date: '2026-10-05', subscription_value: 800, paid_amount: 200,
        remaining_amount: 600, status: 'active', payment_method: 'cash',
      }]) },
      club_members: { findMany: jest.fn().mockResolvedValue([{ id: 22 }, { id: 23 }]) },
      club_receipts: { findMany: jest.fn().mockResolvedValue([{ amount: 400 }, { amount: 150 }]) },
    };
    const service = new StaffDashboardsService(prisma);

    const result = await service.salesDashboard(90, '2026-09');

    expect(result.summary).toEqual(expect.objectContaining({
      subscriptions: 1,
      customers: 2,
      totalSales: 800,
      collected: 550,
      outstanding: 600,
      commissionAmount: 55,
    }));
    expect(prisma.club_subscriptions.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        OR: expect.arrayContaining([
          { employee_id: 7 },
          { sales_id: 7 },
          { member: { is: { OR: [{ employee_id: 7 }, { sales_id: 7 }] } } },
        ]),
      }),
    }));
    expect(prisma.club_receipts.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ receipt_date: { gte: '2026-09-01', lt: '2026-10-01' } }),
    }));
  });

  it('shows published nutrition availability and its bookings using the specialist employee id', async () => {
    const prisma: any = {
      users: { findUnique: jest.fn().mockResolvedValue({ emp_code: 11 }) },
      employees: { findUnique: jest.fn().mockResolvedValue({
        id: 11, employee: 'أخصائي التغذية', email: 'nutrition@example.test', phone: null, personal_photo: null,
        branch_id_fk: 1, mosma_wazefy_n: 'أخصائي تغذية', employee_target: 8000, employee_commission: 0,
      }) },
      club_trainers: { findFirst: jest.fn().mockResolvedValue({ id: 91, employee_id: 11, name: 'أخصائي التغذية', image_url: null }) },
      club_schedules: { findMany: jest.fn().mockResolvedValue([]) },
      club_availability_slots: { findMany: jest.fn().mockResolvedValue([{
        id: 401, trainer_id: 11, module_type: 'nutrition', slot_date: '2026-09-12', start_time: '15:00', end_time: '17:00',
        capacity: 2, monthly_availability: { category: 'nutrition' },
        nutrition_bookings: [{
          id: 501, member_id: 31, member_name: 'سارة', status: 'confirmed', notes: null,
          service: { name: 'استشارة تغذية' }, schedule: { start_time: '15:00', end_time: '15:30' },
        }],
      }]) },
    };
    const service = new StaffDashboardsService(prisma);

    const result = await service.nutritionDashboard(90, '2026-09');

    expect(result.summary).toEqual(expect.objectContaining({
      scheduleSlots: 1, bookings: 1, customers: 1, availableSlots: 1,
    }));
    expect(result.appointments).toEqual(expect.arrayContaining([
      expect.objectContaining({ memberName: 'سارة', serviceName: 'استشارة تغذية', startTime: '15:00', endTime: '15:30' }),
    ]));
    expect(prisma.club_availability_slots.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ trainer_id: 11, module_type: 'nutrition' }),
    }));
  });

  it('shows Spa bookings and calculates the session target for the Spa specialist', async () => {
    const prisma: any = {
      users: { findUnique: jest.fn().mockResolvedValue({ emp_code: 19 }) },
      employees: { findUnique: jest.fn().mockResolvedValue({
        id: 19, employee: 'أخصائي سبا', email: 'spa@example.test', phone: null, personal_photo: null,
        branch_id_fk: 1, mosma_wazefy_n: 'اخصائى سبا', employee_target: 10, employee_commission: 0,
      }) },
      club_trainers: { findFirst: jest.fn().mockResolvedValue({ id: 92, employee_id: 19, name: 'أخصائي سبا', image_url: null }) },
      club_schedules: { findMany: jest.fn().mockResolvedValue([]) },
      club_availability_slots: { findMany: jest.fn().mockResolvedValue([{
        id: 402, trainer_id: 19, module_type: 'spa', slot_date: '2026-09-12', start_time: '15:00', end_time: '16:00',
        capacity: 1, monthly_availability: { category: 'spa' },
        nutrition_bookings: [{
          id: 502, member_id: 32, member_name: 'ليلى', status: 'completed', notes: 'جلسة استرخاء',
          service: { name: 'مساج علاجي' }, schedule: { start_time: '15:00', end_time: '16:00' },
        }],
      }]) },
    };
    const service = new StaffDashboardsService(prisma);

    const result = await (service as any).spaDashboard(90, '2026-09');

    expect(result.summary).toEqual(expect.objectContaining({
      bookings: 1, completed: 1, remaining: 0, target: 10, targetAchievement: 10,
    }));
    expect(result.appointments).toEqual(expect.arrayContaining([
      expect.objectContaining({ memberName: 'ليلى', serviceName: 'مساج علاجي', status: 'completed' }),
    ]));
    expect(prisma.club_availability_slots.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ trainer_id: 19, module_type: 'spa' }),
    }));
  });
});
