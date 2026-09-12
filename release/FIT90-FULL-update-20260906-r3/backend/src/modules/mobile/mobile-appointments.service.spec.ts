import { MobileAppointmentsService } from './mobile-appointments.service';

describe('MobileAppointmentsService', () => {
  const trainer = {
    id: 4,
    name: 'Coach Sara',
    specialization: 'Nutrition',
    image_url: '/trainer.jpg',
  };
  const service = { id: 8, name: 'Appointment', category: 'spa' };
  const slot = {
    id: 15,
    service_id: 8,
    employee_id: 4,
    branch_id: 1,
    slot_date: '2099-08-05',
    start_time: '15:00',
    end_time: '16:00',
    booking_start_at: new Date('2000-01-01T00:00:00Z'),
    booking_end_at: new Date('2099-08-05T12:00:00Z'),
    capacity: 2,
    booked_count: 0,
    status: 'available',
    service,
    monthly_schedule: { status: 'published' },
  };

  it('يرسل اسم الخدمة والمدرب داخل الجدول وكل موعد', async () => {
    const prisma: any = {
      club_members: { findFirst: jest.fn().mockResolvedValue({ id: 22, name: 'Member' }) },
      club_service_monthly_schedules: {
        findFirst: jest.fn().mockResolvedValue({
          id: 3,
          employee_id: 4,
          service,
        }),
      },
      club_trainers: { findFirst: jest.fn().mockResolvedValue(trainer) },
      club_schedules: { findMany: jest.fn().mockResolvedValue([slot]) },
      club_bookings: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const result = await new MobileAppointmentsService(prisma).monthlySchedule(70, 22, {
      category: 'spa',
      serviceId: 8,
      trainerId: 4,
      month: 8,
      year: 2099,
    });

    expect(result.service).toEqual(expect.objectContaining({ id: 8, name: 'Appointment' }));
    expect(result.trainer).toEqual(expect.objectContaining({ id: 4, name: 'Coach Sara' }));
    expect(result.days[0].slots[0]).toEqual(expect.objectContaining({
      service: expect.objectContaining({ id: 8, name: 'Appointment' }),
      trainer: expect.objectContaining({ id: 4, name: 'Coach Sara' }),
    }));
  });

  it('ينشئ حجز انتظار عند اكتمال سعة موعد الخدمة', async () => {
    const createdAt = new Date('2099-07-20T10:00:00Z');
    const tx: any = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      club_schedules: {
        findFirst: jest.fn().mockResolvedValue({ ...slot, booked_count: 2 }),
        update: jest.fn(),
      },
      club_bookings: {
        findFirst: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValueOnce(2).mockResolvedValueOnce(1),
        create: jest.fn().mockResolvedValue({
          id: 91,
          booking_number: 'BK-TEST',
          created_at: createdAt,
        }),
        update: jest.fn(),
      },
      club_trainers: { findUnique: jest.fn().mockResolvedValue(trainer) },
    };
    const prisma: any = {
      club_members: { findFirst: jest.fn().mockResolvedValue({ id: 22, name: 'Member' }) },
      $transaction: jest.fn((callback: any) => callback(tx)),
    };

    const result = await new MobileAppointmentsService(prisma).createBooking(70, 22, 15);

    expect(result).toEqual(expect.objectContaining({
      status: 'wait',
      code: 'SERVICE_FULL_WAITLISTED',
      waitlistPosition: 1,
      service: expect.objectContaining({ name: 'Appointment' }),
      trainer: expect.objectContaining({ name: 'Coach Sara' }),
    }));
    expect(tx.club_schedules.update).not.toHaveBeenCalled();
  });

  it('rejects nutrition booking through the legacy generic path', async () => {
    const tx: any = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      club_schedules: { findFirst: jest.fn().mockResolvedValue({ ...slot, service: { ...service, category: 'nutrition' } }) },
    };
    const prisma: any = {
      club_members: { findFirst: jest.fn().mockResolvedValue({ id: 22, name: 'Member' }) },
      $transaction: jest.fn((callback: any) => callback(tx)),
    };

    await expect(new MobileAppointmentsService(prisma).createBooking(70, 22, 15))
      .rejects.toThrow('حجوزات التغذية تستخدم مسار التغذية المخصص.');
  });

  it('scopes dedicated slot routes to their department category', async () => {
    const spaSlot = { ...slot, service: { ...service, category: 'spa' } };
    const prisma: any = {
      club_members: { findFirst: jest.fn().mockResolvedValue({ id: 22, name: 'Member' }) },
      club_schedules: { findFirst: jest.fn().mockResolvedValue(spaSlot) },
      club_trainers: { findUnique: jest.fn().mockResolvedValue(trainer) },
      club_bookings: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    await new MobileAppointmentsService(prisma).slot(70, 22, 15, 'spa');

    expect(prisma.club_schedules.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: 15,
        service: { category: 'spa' },
      }),
    }));
  });

  it.each([
    ['spa', 'spa'],
    ['personal_training', 'personal_training'],
  ] as const)(
    'promotes and notifies the oldest waiter after cancelling a %s booking',
    async (category, expectedCategory) => {
      const appointmentService = { ...service, category };
      const confirmedBooking = {
        id: 40,
        booking_number: 'BK-CONFIRMED',
        member_id: 22,
        schedule_id: slot.id,
        branch_id: 1,
        status: 'confirmed',
        service: appointmentService,
        schedule: { ...slot, service: appointmentService },
      };
      const oldestWaiter = {
        id: 41,
        member_id: 23,
        schedule_id: slot.id,
        status: 'wait',
        created_at: new Date('2099-07-20T09:00:00Z'),
      };
      const tx: any = {
        $queryRaw: jest.fn().mockResolvedValue([]),
        club_bookings: {
          findFirst: jest.fn()
            .mockResolvedValueOnce({ schedule_id: slot.id })
            .mockResolvedValueOnce(confirmedBooking)
            .mockResolvedValueOnce(oldestWaiter),
          update: jest.fn().mockResolvedValue({}),
        },
        club_members: {
          findUnique: jest.fn().mockResolvedValue({ app_user_id: 73 }),
        },
        club_notifications: { create: jest.fn().mockResolvedValue({ id: 1 }) },
        club_schedules: { updateMany: jest.fn() },
      };
      const prisma: any = {
        club_members: { findFirst: jest.fn().mockResolvedValue({ id: 22, name: 'Member' }) },
        $transaction: jest.fn((callback: any) => callback(tx)),
      };

      const result = await new MobileAppointmentsService(prisma).cancelBooking(
        70,
        22,
        confirmedBooking.id,
        expectedCategory,
      );

      expect(tx.club_bookings.findFirst).toHaveBeenNthCalledWith(3, {
        where: { schedule_id: slot.id, status: 'wait', is_deleted: false },
        orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
      });
      expect(tx.club_bookings.update).toHaveBeenCalledWith({
        where: { id: oldestWaiter.id },
        data: { status: 'confirmed' },
      });
      expect(tx.club_notifications.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'booking_confirmed',
          booking_id: oldestWaiter.id,
          member_id: oldestWaiter.member_id,
          to_user: 73,
          schedule_id: slot.id,
        }),
      });
      expect(tx.club_schedules.updateMany).not.toHaveBeenCalled();
      expect(result).toEqual(expect.objectContaining({
        status: 'cancelled',
        promotedBookingId: oldestWaiter.id,
        service: expect.objectContaining({ category }),
      }));
    },
  );
  it('locks the nutrition plan before its attendance window when cancelling from mobile', async () => {
    const nutritionService = { ...service, category: 'nutrition' };
    const booking = {
      id: 40, member_id: 22, schedule_id: slot.id, branch_id: 1, status: 'confirmed',
      service: nutritionService,
      schedule: { ...slot, service: nutritionService },
    };
    const tx: any = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      club_bookings: {
        findFirst: jest.fn()
          .mockResolvedValueOnce({ schedule_id: slot.id })
          .mockResolvedValueOnce(booking)
          .mockResolvedValueOnce(null),
        update: jest.fn().mockResolvedValue({}),
      },
      club_schedules: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const prisma: any = {
      club_members: { findFirst: jest.fn().mockResolvedValue({ id: 22, name: 'Member' }) },
      $transaction: jest.fn((callback: any) => callback(tx)),
    };

    await expect(new MobileAppointmentsService(prisma).cancelBooking(70, 22, 40, 'nutrition'))
      .resolves.toEqual(expect.objectContaining({ status: 'cancelled' }));

    expect(tx.$queryRaw).toHaveBeenCalledTimes(4);
  });
});
