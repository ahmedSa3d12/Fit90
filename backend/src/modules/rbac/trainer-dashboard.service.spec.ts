import { TrainerDashboardService } from './trainer-dashboard.service';

describe('TrainerDashboardService', () => {
  it('shows the trainer published SPA, Personal Training, and Nutrition availability with their bookings', async () => {
    const prisma: any = {
      users: { findUnique: jest.fn().mockResolvedValue({ emp_code: 7 }) },
      employees: { findUnique: jest.fn().mockResolvedValue({
        id: 7, employee: 'نورا', email: 'noura@example.test', phone: '01000000000', personal_photo: null,
        branch_id_fk: 1, mosma_wazefy_n: 'مدرب', employee_target: 6000, employee_commission: 10,
      }) },
      club_trainers: { findFirst: jest.fn().mockResolvedValue({
        id: 30, employee_id: 7, name: 'نورا', specialization: 'مدرب', image_url: null,
      }) },
      club_members: { findMany: jest.fn().mockResolvedValue([]) },
      club_subscriptions: { findMany: jest.fn().mockResolvedValue([]) },
      club_schedules: { findMany: jest.fn().mockResolvedValue([]) },
      club_class_monthly_schedules: { findMany: jest.fn().mockResolvedValue([]) },
      club_classes: { findMany: jest.fn().mockResolvedValue([]) },
      club_receipts: { findMany: jest.fn().mockResolvedValue([{ amount: 500 }]) },
      club_availability_slots: { findMany: jest.fn().mockResolvedValue([
        {
          id: 101, module_type: 'spa', slot_date: '2026-09-10', start_time: '10:00', end_time: '11:00', capacity: 3,
          is_active: true, cancelled_at: null, monthly_availability: { category: 'spa' },
          nutrition_bookings: [{ member_name: 'سارة', status: 'confirmed' }],
        },
        {
          id: 102, module_type: 'personal_training', slot_date: '2026-09-11', start_time: '11:00', end_time: '12:00', capacity: 1,
          is_active: true, cancelled_at: null, monthly_availability: { category: 'personal_training' },
          nutrition_bookings: [{ member_name: 'منى', status: 'completed' }],
        },
        {
          id: 103, module_type: 'nutrition', slot_date: '2026-09-12', start_time: '12:00', end_time: '13:00', capacity: 1,
          is_active: true, cancelled_at: null, monthly_availability: { category: 'nutrition' },
          nutrition_bookings: [],
        },
      ]) },
    };
    const service = new TrainerDashboardService(prisma);

    const result = await service.getDashboard(90, '2026-09');

    expect(result.summary).toEqual(expect.objectContaining({ monthAppointments: 3, completedAppointments: 1, collected: 500 }));
    expect(result.appointments).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: 'provider-availability', category: 'spa', bookingsCount: 1, memberNames: ['سارة'] }),
      expect.objectContaining({ source: 'provider-availability', category: 'personal_training', status: 'completed' }),
      expect.objectContaining({ source: 'provider-availability', category: 'nutrition', bookingsCount: 0 }),
    ]));
    expect(prisma.club_availability_slots.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ trainer_id: 7, module_type: { in: ['spa', 'personal_training', 'nutrition'] } }),
    }));
  });

  it('links one matching legacy trainer record instead of creating an empty duplicate trainer', async () => {
    const prisma: any = {
      users: { findUnique: jest.fn().mockResolvedValue({ emp_code: 7 }) },
      employees: { findUnique: jest.fn().mockResolvedValue({
        id: 7, employee: 'نورا', email: 'noura@example.test', phone: '01000000000', personal_photo: null,
        branch_id_fk: 1, mosma_wazefy_n: 'مدرب', employee_target: 0, employee_commission: 0,
      }) },
      club_trainers: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([{ id: 12, name: 'نورا', employee_id: null, specialization: 'مدرب', image_url: null }]),
        update: jest.fn().mockResolvedValue({ id: 12, name: 'نورا', employee_id: 7, specialization: 'مدرب', image_url: null }),
        create: jest.fn().mockResolvedValue({ id: 99, name: 'نورا', employee_id: 7, specialization: 'مدرب', image_url: null }),
      },
      club_members: { findMany: jest.fn().mockResolvedValue([]) },
      club_subscriptions: { findMany: jest.fn().mockResolvedValue([]) },
      club_schedules: { findMany: jest.fn().mockResolvedValue([]) },
      club_class_monthly_schedules: { findMany: jest.fn().mockResolvedValue([]) },
      club_classes: { findMany: jest.fn().mockResolvedValue([]) },
      club_receipts: { findMany: jest.fn().mockResolvedValue([]) },
      club_availability_slots: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new TrainerDashboardService(prisma);

    const result = await service.getDashboard(90, '2026-09');

    expect(result.trainer.id).toBe(12);
    expect(prisma.club_trainers.update).toHaveBeenCalledWith({
      where: { id: 12 },
      data: { employee_id: 7 },
    });
    expect(prisma.club_trainers.create).not.toHaveBeenCalled();
  });

  it('counts a paid subscription assigned directly to the trainer toward the trainer target', async () => {
    const directSubscription = {
      id: 71, member_id: null, subscription_number: 'SUB-71', customer_name: 'عميل جديد',
      subscription_type: 'تدريب شخصي', subscription_start_date: '2026-09-01', subscription_end_date: '2026-09-30',
      registration_date: '2026-09-04', subscription_value: 1000, paid_amount: 750, remaining_amount: 250,
      sessions_count: 5, sessions_used: 0, is_linked_to_sessions: true, status: 'active',
    };
    const prisma: any = {
      users: { findUnique: jest.fn().mockResolvedValue({ emp_code: 7 }) },
      employees: { findUnique: jest.fn().mockResolvedValue({
        id: 7, employee: 'نورا', email: 'noura@example.test', phone: '01000000000', personal_photo: null,
        branch_id_fk: 1, mosma_wazefy_n: 'مدرب', employee_target: 1000, employee_commission: 10,
      }) },
      club_trainers: { findFirst: jest.fn().mockResolvedValue({ id: 30, employee_id: 7, name: 'نورا', specialization: 'مدرب', image_url: null }) },
      club_members: { findMany: jest.fn().mockResolvedValue([]) },
      club_subscriptions: { findMany: jest.fn().mockResolvedValue([directSubscription]) },
      club_schedules: { findMany: jest.fn().mockResolvedValue([]) },
      club_class_monthly_schedules: { findMany: jest.fn().mockResolvedValue([]) },
      club_classes: { findMany: jest.fn().mockResolvedValue([]) },
      club_receipts: { findMany: jest.fn().mockResolvedValue([{ amount: 750 }]) },
      club_availability_slots: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new TrainerDashboardService(prisma);

    const result = await service.getDashboard(90, '2026-09');

    expect(result.summary).toEqual(expect.objectContaining({
      monthlySubscriptions: 1, collected: 750, targetAchievement: 75, commissionAmount: 75,
    }));
    expect(prisma.club_subscriptions.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ OR: expect.arrayContaining([{ employee_id: 7 }]) }),
    }));
    expect(prisma.club_receipts.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        OR: expect.arrayContaining([expect.objectContaining({ subscription: expect.anything() })]),
      }),
    }));
  });
});
