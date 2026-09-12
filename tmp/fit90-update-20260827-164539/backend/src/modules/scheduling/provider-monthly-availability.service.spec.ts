import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { ProviderMonthlyAvailabilityService } from './provider-monthly-availability.service';

describe('ProviderMonthlyAvailabilityService', () => {
  const prisma = {
    club_trainers: { findFirst: jest.fn(), findMany: jest.fn() },
    employees: { findFirst: jest.fn(), findMany: jest.fn() },
    club_provider_monthly_availabilities: {
      findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn(),
    },
    club_availability_slots: {
      findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn(), count: jest.fn(),
    },
    club_bookings: { count: jest.fn(), findMany: jest.fn(), updateMany: jest.fn() },
    club_schedules: { updateMany: jest.fn() },
    club_appt_booking_additional_services: { updateMany: jest.fn() },
    $executeRawUnsafe: jest.fn(),
    $transaction: jest.fn(),
  } as any;
  const employeeScope = {
    scopedProviderId: jest.fn(async (_user, id) => id),
    assertProviderAccess: jest.fn(),
    isSelfOnly: jest.fn(() => false),
    providerId: jest.fn(),
  } as any;
  const notifications = { bookingCancelled: jest.fn() } as any;
  const branchScope = { allowedBranchIds: jest.fn(() => null) } as any;
  const service = new ProviderMonthlyAvailabilityService(prisma, employeeScope, notifications, branchScope);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(async (value: any) => typeof value === 'function' ? value(prisma) : Promise.all(value));
    prisma.club_trainers.findFirst.mockResolvedValue({ id: 12, employee_id: 120, name: 'Mona', is_active: true, specialization: 'Nutrition' });
    prisma.club_trainers.findMany.mockResolvedValue([{ id: 12, name: 'Mona' }]);
    prisma.employees.findFirst.mockResolvedValue({ id: 120, branch_id_fk: 1 });
    prisma.employees.findMany.mockResolvedValue([{ id: 120 }]);
    branchScope.allowedBranchIds.mockReturnValue(null);
    prisma.club_provider_monthly_availabilities.findUnique.mockResolvedValue(null);
  });

  it('creates a draft nutrition monthly plan owned only by the specialist', async () => {
    prisma.club_provider_monthly_availabilities.create.mockResolvedValue({
      id: 3, employee_id: 12, category: 'nutrition', month: 8, year: 2026,
      status: 'draft', published_at: null, windows: [],
    });

    const result = await service.create({ employeeId: 12, month: 8, year: 2026 });

    expect(result).toEqual(expect.objectContaining({ id: 3, employeeId: 12, status: 'draft' }));
    expect(prisma.club_provider_monthly_availabilities.create).toHaveBeenCalledWith(expect.objectContaining({
      data: { employee_id: 12, category: 'nutrition', month: 8, year: 2026 },
    }));
  });

  it('rejects another nutrition plan for the same specialist and month', async () => {
    prisma.club_provider_monthly_availabilities.findUnique.mockResolvedValue({ id: 3 });

    await expect(service.create({ employeeId: 12, month: 8, year: 2026 }))
      .rejects.toBeInstanceOf(ConflictException);

    expect(prisma.club_provider_monthly_availabilities.create).not.toHaveBeenCalled();
  });

  it('does not publish a draft without attendance windows', async () => {
    prisma.club_provider_monthly_availabilities.findUnique.mockResolvedValue({
      id: 3, employee_id: 12, category: 'nutrition', month: 8, year: 2026,
      status: 'draft', windows: [],
    });

    await expect(service.publish(3)).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.club_provider_monthly_availabilities.update).not.toHaveBeenCalled();
  });

  it('adds a service-independent attendance window inside the plan month', async () => {
    prisma.club_provider_monthly_availabilities.findUnique.mockResolvedValue({
      id: 3, employee_id: 12, category: 'nutrition', month: 8, year: 2026,
      status: 'draft', windows: [],
    });
    prisma.club_availability_slots.findFirst.mockResolvedValue(null);
    prisma.club_availability_slots.create.mockResolvedValue({ id: 90 });

    await service.addWindows(3, {
      slotDate: '2026-08-23', startTime: '15:00', endTime: '20:00', repeatWeekly: false,
    });

    expect(prisma.club_availability_slots.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      monthly_availability_id: 3, module_type: 'nutrition', trainer_id: 12,
      service_id: null, slot_date: '2026-08-23', start_time: '15:00', end_time: '20:00',
    }) });
  });

  it('repeats the same attendance window on the remaining matching weekdays of the month', async () => {
    prisma.club_provider_monthly_availabilities.findUnique.mockResolvedValue({
      id: 3, employee_id: 12, category: 'nutrition', month: 8, year: 2026,
      status: 'draft', windows: [],
    });
    prisma.club_availability_slots.findFirst.mockResolvedValue(null);
    prisma.club_availability_slots.create.mockResolvedValue({ id: 90 });

    const result = await service.addWindows(3, {
      slotDate: '2026-08-02', startTime: '15:00', endTime: '20:00', repeatWeekly: true,
    });

    expect(result.created).toBe(5);
    expect(prisma.club_availability_slots.create).toHaveBeenCalledTimes(5);
    expect(prisma.club_availability_slots.create).toHaveBeenLastCalledWith({ data: expect.objectContaining({
      slot_date: '2026-08-30', service_id: null,
    }) });
  });

  it('moves booking open and close dates with each weekly nutrition attendance occurrence', async () => {
    prisma.club_provider_monthly_availabilities.findUnique.mockResolvedValue({
      id: 3, employee_id: 12, category: 'nutrition', month: 8, year: 2026,
      status: 'draft', windows: [],
    });
    prisma.club_availability_slots.findFirst.mockResolvedValue(null);
    prisma.club_availability_slots.create.mockResolvedValue({ id: 90 });

    await service.addWindows(3, {
      slotDate: '2026-08-20', startTime: '15:00', endTime: '20:00', repeatWeekly: true,
      bookingStartAt: '2026-08-19T09:00:00.000Z',
      bookingEndAt: '2026-08-20T12:00:00.000Z',
    });

    expect(prisma.club_availability_slots.create).toHaveBeenNthCalledWith(2, {
      data: expect.objectContaining({
        slot_date: '2026-08-27',
        booking_start_at: new Date('2026-08-26T09:00:00.000Z'),
        booking_end_at: new Date('2026-08-27T12:00:00.000Z'),
      }),
    });
  });
  it('rejects an attendance window outside the plan month', async () => {
    prisma.club_provider_monthly_availabilities.findUnique.mockResolvedValue({
      id: 3, employee_id: 12, category: 'nutrition', month: 8, year: 2026,
      status: 'draft', windows: [],
    });

    await expect(service.addWindows(3, {
      slotDate: '2026-09-01', startTime: '15:00', endTime: '20:00', repeatWeekly: false,
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('archives a published plan without marking historical attendance as cancelled', async () => {
    prisma.club_provider_monthly_availabilities.findUnique.mockResolvedValue({
      id: 3, employee_id: 12, category: 'nutrition', month: 8, year: 2026,
      status: 'published', windows: [{ id: 90 }],
    });
    prisma.club_provider_monthly_availabilities.update.mockResolvedValue({ id: 3, status: 'archived' });

    const result = await service.archive(3);

    expect(result).toEqual(expect.objectContaining({ status: 'archived' }));
    expect(prisma.club_availability_slots.updateMany).not.toHaveBeenCalled();
  });

  it('requires cancellation instead of deleting a window with an active booking', async () => {
    prisma.club_provider_monthly_availabilities.findUnique.mockResolvedValue({
      id: 3, employee_id: 12, category: 'nutrition', month: 8, year: 2026,
      status: 'published', windows: [{ id: 90 }],
    });
    prisma.club_availability_slots.findFirst.mockResolvedValue({
      id: 90, monthly_availability_id: 3, trainer_id: 12, module_type: 'nutrition', is_deleted: false,
    });
    prisma.club_bookings.count.mockResolvedValue(1);

    await expect(service.deleteWindow(3, 90)).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.club_availability_slots.update).not.toHaveBeenCalled();
  });
  it('lists nutrition plans with specialist names and window counts', async () => {
    prisma.club_provider_monthly_availabilities.findMany.mockResolvedValue([{
      id: 3, employee_id: 12, category: 'nutrition', month: 8, year: 2026,
      status: 'published', windows: [{ id: 90 }, { id: 91 }],
    }]);

    const result = await service.list({});

    expect(result).toEqual([expect.objectContaining({
      id: 3, employeeId: 12, trainer: expect.objectContaining({ id: 12, name: 'Mona' }), _count: { windows: 2 },
    })]);
  });

  it('cancels a published window with an audit reason', async () => {
    prisma.club_provider_monthly_availabilities.findUnique.mockResolvedValue({
      id: 3, employee_id: 12, category: 'nutrition', month: 8, year: 2026,
      status: 'published', windows: [{ id: 90 }],
    });
    prisma.club_availability_slots.findFirst.mockResolvedValue({
      id: 90, monthly_availability_id: 3, is_deleted: false, is_active: true, cancelled_at: null,
      slot_date: '2026-08-23', start_time: '15:00', end_time: '20:00',
    });
    prisma.club_availability_slots.update.mockResolvedValue({ id: 90, is_active: false });
    prisma.club_bookings.findMany.mockResolvedValue([{
      id: 51, schedule_id: 41, member_id: 9, member_name: 'Member', branch_id: 1,
      schedule: { id: 41, slot_date: '2026-08-23', start_time: '15:00' },
      service: { name: 'InBody' },
    }]);

    await service.cancelWindow(3, 90, 'Specialist unavailable');

    expect(prisma.club_availability_slots.update).toHaveBeenCalledWith({
      where: { id: 90 },
      data: expect.objectContaining({
        is_active: false,
        cancellation_reason: 'Specialist unavailable',
        cancelled_at: expect.any(Date),
      }),
    });
    expect(prisma.club_bookings.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [51] } }, data: { status: 'cancelled' },
    });
    expect(prisma.club_schedules.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [41] } }, data: { status: 'cancelled', booked_count: 0 },
    });
    expect(notifications.bookingCancelled).toHaveBeenCalledWith(expect.objectContaining({ bookingId: 51, scheduleId: 41 }));
  });

  it('deletes a draft plan and soft-deletes its unbooked windows', async () => {
    prisma.club_provider_monthly_availabilities.findUnique.mockResolvedValue({
      id: 3, employee_id: 12, category: 'nutrition', month: 8, year: 2026,
      status: 'draft', windows: [{ id: 90 }],
    });
    prisma.club_bookings.count.mockResolvedValue(0);
    prisma.club_provider_monthly_availabilities.delete.mockResolvedValue({ id: 3 });

    await expect(service.remove(3)).resolves.toEqual({ success: true });

    expect(prisma.club_availability_slots.updateMany).toHaveBeenCalledWith({
      where: { monthly_availability_id: 3 },
      data: { is_deleted: true, is_active: false, monthly_availability_id: null },
    });
  });
  it('locks the monthly plan before checking and inserting attendance windows', async () => {
    prisma.club_provider_monthly_availabilities.findUnique.mockResolvedValue({
      id: 3, employee_id: 12, category: 'nutrition', month: 8, year: 2026,
      status: 'draft', windows: [],
    });
    prisma.club_availability_slots.findFirst.mockResolvedValue(null);
    prisma.club_availability_slots.create.mockResolvedValue({ id: 90 });

    await service.addWindows(3, {
      slotDate: '2026-08-23', startTime: '15:00', endTime: '20:00',
    });

    expect(prisma.$executeRawUnsafe).toHaveBeenCalled();
  });

  it('rejects incomplete or invalid booking-open and booking-close ranges', async () => {
    prisma.club_provider_monthly_availabilities.findUnique.mockResolvedValue({
      id: 3, employee_id: 12, category: 'nutrition', month: 8, year: 2026,
      status: 'draft', windows: [],
    });

    await expect(service.addWindows(3, {
      slotDate: '2026-08-23', startTime: '15:00', endTime: '20:00',
      bookingStartAt: '2026-08-01T09:00:00.000Z',
    })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.addWindows(3, {
      slotDate: '2026-08-23', startTime: '15:00', endTime: '20:00',
      bookingStartAt: '2026-08-24T09:00:00.000Z',
      bookingEndAt: '2026-08-24T10:00:00.000Z',
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('updates an unbooked attendance window while its plan is draft', async () => {
    prisma.club_provider_monthly_availabilities.findUnique.mockResolvedValue({
      id: 3, employee_id: 12, category: 'nutrition', month: 8, year: 2026,
      status: 'draft', windows: [{ id: 90 }],
    });
    prisma.club_availability_slots.findFirst
      .mockResolvedValueOnce({ id: 90, monthly_availability_id: 3, slot_date: '2026-08-23' })
      .mockResolvedValueOnce(null);
    prisma.club_bookings.count.mockResolvedValue(0);
    prisma.club_availability_slots.update.mockResolvedValue({ id: 90, start_time: '16:00', end_time: '20:00' });

    await service.updateWindow(3, 90, {
      slotDate: '2026-08-23', startTime: '16:00', endTime: '20:00',
    });

    expect(prisma.club_availability_slots.update).toHaveBeenCalledWith({
      where: { id: 90 },
      data: expect.objectContaining({ start_time: '16:00', end_time: '20:00' }),
    });
  });
  it('adds a future attendance window to a published plan', async () => {
    prisma.club_provider_monthly_availabilities.findUnique.mockResolvedValue({
      id: 3, employee_id: 12, category: 'nutrition', month: 9, year: 2099,
      status: 'published', windows: [],
    });
    prisma.club_availability_slots.findFirst.mockResolvedValue(null);
    prisma.club_availability_slots.create.mockResolvedValue({ id: 91 });

    await expect(service.addWindows(3, {
      slotDate: '2099-09-10', startTime: '15:00', endTime: '20:00', repeatWeekly: false,
    })).resolves.toEqual({ created: 1 });
  });

  it('rejects a single attendance window that partially overlaps another window on the same day', async () => {
    prisma.club_provider_monthly_availabilities.findUnique.mockResolvedValue({
      id: 3, employee_id: 12, category: 'nutrition', month: 9, year: 2099,
      status: 'published', windows: [],
    });
    prisma.club_availability_slots.findFirst.mockResolvedValue({ id: 77 });

    await expect(service.addWindows(3, {
      slotDate: '2099-09-10', startTime: '15:00', endTime: '19:00', repeatWeekly: false,
    })).rejects.toThrow('يوجد موعد بالفعل يتداخل مع هذه الفترة.');
    expect(prisma.club_availability_slots.create).not.toHaveBeenCalled();
  });

  it('updates an unbooked future attendance window in a published plan', async () => {
    prisma.club_provider_monthly_availabilities.findUnique.mockResolvedValue({
      id: 3, employee_id: 12, category: 'nutrition', month: 9, year: 2099,
      status: 'published', windows: [{ id: 90 }],
    });
    prisma.club_availability_slots.findFirst
      .mockResolvedValueOnce({
        id: 90, monthly_availability_id: 3, slot_date: '2099-09-10', start_time: '15:00',
      })
      .mockResolvedValueOnce(null);
    prisma.club_bookings.count.mockResolvedValue(0);
    prisma.club_availability_slots.update.mockResolvedValue({ id: 90, start_time: '16:00' });

    await expect(service.updateWindow(3, 90, {
      slotDate: '2099-09-10', startTime: '16:00', endTime: '20:00',
    })).resolves.toEqual(expect.objectContaining({ id: 90 }));
  });

  it('rejects editing an attendance window with active bookings using the user-facing rule', async () => {
    prisma.club_provider_monthly_availabilities.findUnique.mockResolvedValue({
      id: 3, employee_id: 12, category: 'nutrition', month: 9, year: 2099,
      status: 'published', windows: [{ id: 90 }],
    });
    prisma.club_availability_slots.findFirst.mockResolvedValue({
      id: 90, monthly_availability_id: 3, slot_date: '2099-09-10', start_time: '15:00',
    });
    prisma.club_bookings.count.mockResolvedValue(1);

    await expect(service.updateWindow(3, 90, {
      slotDate: '2099-09-10', startTime: '16:00', endTime: '20:00',
    })).rejects.toThrow('غير مسموح بتعديل هذا الموعد لوجود حجوزات بالفعل');
    expect(prisma.club_availability_slots.update).not.toHaveBeenCalled();
  });
  it('rejects creating a plan for a specialist outside the manager branch scope', async () => {
    branchScope.allowedBranchIds.mockReturnValue([2]);
    await expect(service.create(
      { employeeId: 12, month: 8, year: 2026 },
      { level: 3, branch: 2 } as any,
    )).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.club_provider_monthly_availabilities.create).not.toHaveBeenCalled();
  });

  it('rejects cancelling attendance that has already started in Cairo', async () => {
    prisma.club_provider_monthly_availabilities.findUnique.mockResolvedValue({
      id: 3, employee_id: 12, category: 'nutrition', month: 8, year: 2026,
      status: 'published', windows: [{ id: 90 }],
    });
    prisma.club_availability_slots.findFirst.mockResolvedValue({
      id: 90, monthly_availability_id: 3, is_deleted: false, is_active: true, cancelled_at: null,
      slot_date: '2026-08-18', start_time: '15:00', end_time: '20:00',
    });

    await expect(service.cancelWindow(3, 90, 'Too late')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.club_availability_slots.update).not.toHaveBeenCalled();
  });
});
