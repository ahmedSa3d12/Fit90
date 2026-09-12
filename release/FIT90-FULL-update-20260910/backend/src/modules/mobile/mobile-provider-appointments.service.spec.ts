import { MobileProviderAppointmentsService } from './mobile-provider-appointments.service';

describe('MobileProviderAppointmentsService', () => {
  it('returns the latest 15 published SPA provider plans for the signed-in member', async () => {
    const prisma: any = {
      api_users: { findFirst: jest.fn().mockResolvedValue({ user_id: 70, status: 1 }) },
      club_members: { findFirst: jest.fn().mockResolvedValue({ id: 22, app_user_id: 70, is_active: true, is_deleted: false }) },
      club_provider_monthly_availabilities: {
        findMany: jest.fn().mockResolvedValue([{
          id: 15,
          employee_id: 3,
          category: 'spa',
          month: 9,
          year: 2026,
          published_at: new Date('2026-09-01T10:00:00Z'),
          windows: [{ id: 105, slot_date: '2026-09-10', start_time: '15:00', end_time: '16:00', capacity: 3, booking_start_at: null, booking_end_at: null, is_active: true, is_deleted: false, cancelled_at: null }],
        }]),
      },
      club_trainers: { findMany: jest.fn().mockResolvedValue([{ id: 3, name: 'Spa Provider' }]) },
      club_bookings: { groupBy: jest.fn().mockResolvedValue([{ availability_slot_id: 105, _count: { _all: 1 } }]) },
    };
    const eligibility: any = {};
    const service = new MobileProviderAppointmentsService(prisma, eligibility);

    const result = await service.publishedPlans(70, 22, 'spa', 15);

    expect(result.data).toEqual([expect.objectContaining({
      id: 15,
      trainer: { id: 3, name: 'Spa Provider' },
      windowsCount: 1,
    })]);
    expect(prisma.club_provider_monthly_availabilities.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { category: 'spa', status: 'published' },
      take: 15,
      orderBy: [{ published_at: 'desc' }, { id: 'desc' }],
    }));
  });

  it('blocks personal-training booking when the member has no remaining sessions', async () => {
    const prisma: any = {
      api_users: { findFirst: jest.fn().mockResolvedValue({ user_id: 70, status: 1 }) },
      club_members: { findFirst: jest.fn().mockResolvedValue({ id: 22, app_user_id: 70, is_active: true, is_deleted: false }) },
      club_availability_slots: {
        findFirst: jest.fn().mockResolvedValue({
          id: 105,
          module_type: 'personal_training',
          slot_date: '2026-09-20',
          start_time: '15:00',
          end_time: '16:00',
          capacity: 3,
          trainer_id: 3,
          branch_id: 1,
        }),
      },
      club_bookings: { count: jest.fn().mockResolvedValue(0) },
    };
    const eligibility: any = {
      personalTrainingEligibility: jest.fn().mockResolvedValue({
        total: 5, used: 5, reserved: 0, remaining: 0, hasPersonalTrainingSubscription: true,
      }),
      createPersonalTrainingAttendance: jest.fn().mockResolvedValue({ id: 900 }),
    };
    const service = new MobileProviderAppointmentsService(prisma, eligibility);

    await expect(service.bookPersonalTraining(70, 22, { availabilitySlotId: 105 }))
      .rejects.toThrow('لا توجد اشتراكات تدريب شخصي متاحة.');
    expect(eligibility.createPersonalTrainingAttendance).not.toHaveBeenCalled();
  });

  it('labels personal-training bookings generically instead of exposing the backing service name', async () => {
    const prisma: any = {
      api_users: { findFirst: jest.fn().mockResolvedValue({ user_id: 70 }) },
      club_members: { findFirst: jest.fn().mockResolvedValue({ id: 22 }) },
      club_bookings: { findMany: jest.fn().mockResolvedValue([{
        id: 900, booking_number: 'BK-900', status: 'confirmed', coverage_type: 'subscription', payment_status: 'not_required',
        price_snapshot: null, service: { id: 10, name: 'زومبا' },
        availability_slot: { id: 105, slot_date: '2026-09-20', start_time: '15:00', end_time: '16:00', capacity: 1, booked_count: 1 },
      }]) },
    };
    const service = new MobileProviderAppointmentsService(prisma, {} as any);

    const result = await service.myBookings(70, 22, 'personal_training', 'all');

    expect(result.data[0].service).toEqual({ id: 10, name: 'تدريب شخصي', category: 'personal_training' });
  });

  it('returns SPA times only for the selected attendance window', async () => {
    const prisma: any = {
      api_users: { findFirst: jest.fn().mockResolvedValue({ user_id: 70, status: 1 }) },
      club_members: { findFirst: jest.fn().mockResolvedValue({ id: 22, app_user_id: 70, is_active: true, is_deleted: false }) },
      club_availability_slots: {
        findFirst: jest.fn().mockResolvedValue({ id: 105, slot_date: '2026-09-20', trainer_id: 3, branch_id: 1 }),
      },
    };
    const availability: any = {
      providerAvailableTimes: jest.fn().mockResolvedValue({
        trainerId: 3,
        date: '2026-09-20',
        times: [
          { availabilitySlotId: 105, startTime: '15:00' },
          { availabilitySlotId: 106, startTime: '16:00' },
        ],
      }),
    };
    const service = new MobileProviderAppointmentsService(prisma, {} as any, availability);

    const result = await service.spaAvailableTimes(70, 22, 105, 8);

    expect(result.times).toEqual([{ availabilitySlotId: 105, startTime: '15:00' }]);
  });

  it('creates a wait-list SPA booking only when the appointment is full and the member opts in', async () => {
    const prisma: any = {
      api_users: { findFirst: jest.fn().mockResolvedValue({ user_id: 70, status: 1 }) },
      club_members: { findFirst: jest.fn().mockResolvedValue({ id: 22, app_user_id: 70, is_active: true, is_deleted: false }) },
      club_availability_slots: {
        findFirst: jest.fn().mockResolvedValue({
          id: 105, module_type: 'spa', slot_date: '2026-09-20', start_time: '15:00',
          end_time: '16:00', capacity: 3, trainer_id: 3, branch_id: 1,
        }),
      },
      club_bookings: { count: jest.fn().mockResolvedValue(3) },
    };
    const eligibility: any = { create: jest.fn().mockResolvedValue({ id: 901, status: 'wait' }) };
    const service = new MobileProviderAppointmentsService(prisma, eligibility);

    await expect(service.bookSpa(70, 22, {
      availabilitySlotId: 105, serviceId: 8, startTime: '15:00', joinWaitlist: true,
    } as any)).resolves.toEqual({ id: 901, status: 'wait' });

    expect(eligibility.create).toHaveBeenCalledWith(expect.objectContaining({ status: 'wait' }), undefined, 'spa');
  });

  it('summarizes the remaining free SPA balance for the selected service', async () => {
    const prisma: any = {
      api_users: { findFirst: jest.fn().mockResolvedValue({ user_id: 70, status: 1 }) },
      club_members: { findFirst: jest.fn().mockResolvedValue({ id: 22, app_user_id: 70, is_active: true, is_deleted: false }) },
      club_availability_slots: { findFirst: jest.fn().mockResolvedValue({ id: 105, slot_date: '2026-09-20' }) },
    };
    const eligibility: any = {
      eligibility: jest.fn().mockResolvedValue({
        total: 3, used: 2, reserved: 0, remaining: 1,
        coverageType: 'subscription', paymentStatus: 'not_required', amountDue: '0.00', sources: [],
      }),
    };
    const service = new MobileProviderAppointmentsService(prisma, eligibility);

    const result = await service.spaEligibility(70, 22, 105, 8);

    expect(result).toEqual(expect.objectContaining({
      total: 3, used: 2, remaining: 1,
      messageCode: 'SPA_FREE_BALANCE_AVAILABLE',
      message: 'رصيدك المجاني: 3 خدمات. استخدمت 2، والمتبقي 1.',
    }));
  });

  it('states the exact paid amount in English when no SPA credit is available', async () => {
    const prisma: any = {
      api_users: { findFirst: jest.fn().mockResolvedValue({ user_id: 70, status: 1 }) },
      club_members: { findFirst: jest.fn().mockResolvedValue({ id: 22, app_user_id: 70, is_active: true, is_deleted: false }) },
      club_availability_slots: { findFirst: jest.fn().mockResolvedValue({ id: 105, slot_date: '2026-09-20' }) },
    };
    const eligibility: any = {
      eligibility: jest.fn().mockResolvedValue({
        total: 0, used: 0, reserved: 0, remaining: 0,
        coverageType: 'pay_at_branch', paymentStatus: 'due_at_branch', amountDue: '350.00', sources: [],
      }),
    };
    const service = new MobileProviderAppointmentsService(prisma, eligibility);

    const result = await (service as any).spaEligibility(70, 22, 105, 8, 'en');

    expect(result).toEqual(expect.objectContaining({
      messageCode: 'SPA_PAID_BOOKING_REQUIRED',
      message: 'No free SPA balance is available. This service will be paid at 350.00.',
    }));
  });
});
