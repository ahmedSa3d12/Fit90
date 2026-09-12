import { MobileNutritionAppointmentsService } from './mobile-nutrition-appointments.service';

describe('MobileNutritionAppointmentsService', () => {
  const member = { id: 22, name: 'Member' };

  it('lists nutrition providers from provider attendance windows, not service schedules', async () => {
    const prisma: any = {
      club_members: { findFirst: jest.fn().mockResolvedValue(member) },
      club_availability_slots: { findMany: jest.fn().mockResolvedValue([{ trainer_id: 7 }, { trainer_id: 7 }]) },
      club_trainers: { findMany: jest.fn().mockResolvedValue([{ id: 7, name: 'Mona', specialization: 'Nutrition', image_url: null }]) },
    };
    const service = new MobileNutritionAppointmentsService(prisma, {} as any, {} as any);
    const result = await service.providers(70, 22);
    expect(prisma.club_availability_slots.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        module_type: 'nutrition',
        service_id: null,
        monthly_availability: { is: { category: 'nutrition', status: 'published' } },
      }),
    }));
    expect(result.data).toEqual([{ id: 7, name: 'Mona', specialization: 'Nutrition', imageUrl: null }]);
  });

  it('uses the authenticated customer member id when creating a booking', async () => {
    const prisma: any = { club_members: { findFirst: jest.fn().mockResolvedValue(member) } };
    const bookings = { create: jest.fn().mockResolvedValue({ id: 99, coverageType: 'pay_at_branch' }) };
    const service = new MobileNutritionAppointmentsService(prisma, {} as any, bookings as any);
    const result = await service.book(70, 22, { availabilitySlotId: 10, serviceId: 8, startTime: '15:00' });
    expect(bookings.create).toHaveBeenCalledWith(expect.objectContaining({ memberId: 22 }), undefined);
    expect(result).toEqual(expect.objectContaining({ id: 99, coverageType: 'pay_at_branch' }));
  });

  it('returns the published plan and complete bookable time contract', async () => {
    const prisma: any = {
      club_members: { findFirst: jest.fn().mockResolvedValue(member) },
      club_services: { findFirst: jest.fn().mockResolvedValue({
        id: 8, name: 'InBody', duration_min: 30, price: { toString: () => '130.00' }, entitlement_key: 'inbody',
      }) },
      club_trainers: { findFirst: jest.fn().mockResolvedValue({ id: 7, is_active: true }) },
      club_provider_monthly_availabilities: { findFirst: jest.fn().mockResolvedValue({
        id: 44, employee_id: 7, category: 'nutrition', status: 'published', month: 8, year: 2026,
      }) },
      club_availability_slots: { findMany: jest.fn().mockResolvedValue([{ slot_date: '2026-08-23' }]) },
    };
    const availability = { nutritionAvailableTimes: jest.fn().mockResolvedValue({
      times: [{
        windowId: 10, availabilitySlotId: 10, startTime: '15:00', endTime: '15:30',
        bookingStartAt: '2026-08-01T09:00:00.000Z', bookingEndAt: '2026-08-23T11:00:00.000Z',
      }],
    }) };
    const service = new MobileNutritionAppointmentsService(prisma, availability as any, {} as any);

    const result = await service.schedule(70, 22, 8, 7, 2026, 8);

    expect(result.plan).toEqual(expect.objectContaining({ id: 44, status: 'published', employeeId: 7 }));
    expect(result.days[0].times[0]).toEqual(expect.objectContaining({
      availabilitySlotId: 10,
      bookingStartAt: '2026-08-01T09:00:00.000Z',
      bookingEndAt: '2026-08-23T11:00:00.000Z',
    }));
  });

  it('returns a provider monthly calendar before a service is selected', async () => {
    const prisma: any = {
      club_members: { findFirst: jest.fn().mockResolvedValue(member) },
      club_services: { findFirst: jest.fn().mockResolvedValue({
        id: 8, name: 'InBody', duration_min: 30, price: { toString: () => '130.00' }, entitlement_key: 'inbody',
      }) },
      club_trainers: { findFirst: jest.fn().mockResolvedValue({ id: 7, is_active: true }) },
      club_provider_monthly_availabilities: { findFirst: jest.fn().mockResolvedValue({
        id: 44, employee_id: 7, category: 'nutrition', status: 'published', month: 8, year: 2026,
      }) },
      club_availability_slots: { findMany: jest.fn().mockResolvedValue([{
        id: 10, slot_date: '2026-08-23', start_time: '15:00', end_time: '20:00',
        booking_start_at: null, booking_end_at: null,
      }]) },
    };
    const availability = { nutritionAvailableTimes: jest.fn() };
    const service = new MobileNutritionAppointmentsService(prisma, availability as any, {} as any);

    const result = await service.schedule(70, 22, undefined as any, 7, 2026, 8);

    expect(result.service).toBeNull();
    expect(result.days[0].windows).toEqual([expect.objectContaining({
      availabilitySlotId: 10, startTime: '15:00', endTime: '20:00',
    })]);
    expect(result.days[0].times).toEqual([]);
    expect(prisma.club_services.findFirst).not.toHaveBeenCalled();
    expect(availability.nutritionAvailableTimes).not.toHaveBeenCalled();
  });
  it('exposes a future attendance as booking_not_started to the mobile app', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-20T12:00:00.000Z'));
    try {
      const prisma: any = {
        club_members: { findFirst: jest.fn().mockResolvedValue(member) },
        club_services: { findFirst: jest.fn().mockResolvedValue({
          id: 8, name: 'InBody', duration_min: 30, price: { toString: () => '130.00' }, entitlement_key: 'inbody',
        }) },
        club_trainers: { findFirst: jest.fn().mockResolvedValue({ id: 7, is_active: true }) },
        club_provider_monthly_availabilities: { findFirst: jest.fn().mockResolvedValue({
          id: 44, employee_id: 7, category: 'nutrition', status: 'published', month: 8, year: 2026, published_at: null,
        }) },
        club_availability_slots: { findMany: jest.fn().mockResolvedValue([{
          id: 10, slot_date: '2026-08-27', start_time: '15:00', end_time: '20:00',
          booking_start_at: new Date('2026-08-26T09:00:00.000Z'),
          booking_end_at: new Date('2026-08-27T12:00:00.000Z'),
        }]) },
      };
      const availability = { nutritionAvailableTimes: jest.fn().mockResolvedValue({ times: [] }) };
      const service = new MobileNutritionAppointmentsService(prisma, availability as any, {} as any);

      const result = await service.schedule(70, 22, 8, 7, 2026, 8);

      expect(result.days[0].windows).toEqual([expect.objectContaining({
        availabilitySlotId: 10,
        bookingStatus: 'booking_not_started',
        bookingStartAt: '2026-08-26T09:00:00.000Z',
        bookingEndAt: '2026-08-27T12:00:00.000Z',
      })]);
    } finally {
      jest.useRealTimers();
    }
  });});
