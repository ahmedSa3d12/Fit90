import { BadRequestException, ConflictException } from '@nestjs/common';
import { NutritionBookingsService } from './nutrition-bookings.service';

const price = (value: string) => ({ toString: () => value });

describe('NutritionBookingsService', () => {
  const tx: any = {
    $queryRaw: jest.fn(),
    club_availability_slots: { findFirst: jest.fn() },
    club_services: { findFirst: jest.fn() },
    club_members: { findFirst: jest.fn() },
    club_bookings: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
    club_subscriptions: { findMany: jest.fn() },
    club_schedules: { create: jest.fn(), updateMany: jest.fn() },
    club_appt_booking_additional_services: { updateMany: jest.fn() },
  };
  const prisma: any = {
    $transaction: jest.fn((callback) => callback(tx)),
    club_bookings: { findFirst: jest.fn(), updateMany: jest.fn() },
  };
  const employeeScope: any = { assertProviderAccess: jest.fn() };
  const branchScope: any = { allowedBranchIds: jest.fn(() => null) };
  const service = new NutritionBookingsService(prisma, employeeScope, branchScope);

  beforeEach(() => {
    jest.clearAllMocks();
    branchScope.allowedBranchIds.mockReturnValue(null);
    tx.club_availability_slots.findFirst.mockResolvedValue({
      id: 5, trainer_id: 3, branch_id: 1, slot_date: '2026-08-23',
      start_time: '15:00', end_time: '20:00', is_active: true,
    });
    tx.club_services.findFirst.mockResolvedValue({
      id: 7, name: 'InBody', category: 'nutrition', duration_min: 30,
      price: price('200.00'), entitlement_key: 'inbody',
    });
    tx.club_members.findFirst.mockResolvedValue({ id: 9, name: 'Member' });
    tx.club_bookings.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    tx.club_subscriptions.findMany.mockResolvedValue([{
      benefits: { inBody: 1 }, type: null,
      subscription_start_date: '2026-08-01', subscription_end_date: '2026-08-31',
    }]);
    tx.club_schedules.create.mockResolvedValue({ id: 41 });
    tx.club_bookings.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 51, ...data }));
  });

  it('creates a covered variable-duration booking', async () => {
    const result = await service.create({
      availabilitySlotId: 5, serviceId: 7, memberId: 9,
      startTime: '15:00', status: 'confirmed',
    });
    expect(result).toEqual(expect.objectContaining({
      startTime: '15:00', endTime: '15:30', coverageType: 'subscription',
      paymentStatus: 'not_required', remaining: 0,
    }));
    expect(tx.club_schedules.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ start_time: '15:00', end_time: '15:30' }),
    }));
    expect(tx.club_bookings.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ availability_slot_id: 5 }),
    }));
    expect(tx.$queryRaw).toHaveBeenCalledTimes(3);
    expect(tx.club_bookings.findMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: expect.objectContaining({ booking_date: { gte: '2026-08-01', lte: '2026-08-31' } }),
    }));
  });

  it('creates a pay-at-branch booking when credit is zero', async () => {
    tx.club_subscriptions.findMany.mockResolvedValue([]);
    tx.club_bookings.findMany.mockReset().mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const result = await service.create({
      availabilitySlotId: 5, serviceId: 7, memberId: 9,
      startTime: '16:15', status: 'confirmed',
    });
    expect(result).toEqual(expect.objectContaining({
      coverageType: 'pay_at_branch', paymentStatus: 'due_at_branch', amountDue: '200.00',
    }));
  });

  it('rejects an off-grid start that was not returned as available', async () => {
    await expect(service.create({
      availabilitySlotId: 5, serviceId: 7, memberId: 9,
      startTime: '15:07', status: 'confirmed',
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a start that overlaps an existing nutrition booking', async () => {
    tx.club_bookings.findMany.mockReset().mockResolvedValueOnce([
      { schedule: { start_time: '15:15', end_time: '16:00' } },
    ]);
    await expect(service.create({
      availabilitySlotId: 5, serviceId: 7, memberId: 9,
      startTime: '15:30', status: 'confirmed',
    })).rejects.toBeInstanceOf(ConflictException);
  });

  it('restores a covered no-show only with an audit reason', async () => {
    prisma.club_bookings.findFirst.mockResolvedValue({
      id: 51, status: 'no_show', coverage_type: 'subscription', entitlement_restored_at: null,
      employee_id: 3, branch_id: 1,
    });
    prisma.club_bookings.updateMany.mockResolvedValue({ count: 1 });

    await expect(service.restoreNoShow(51, 'Medical exception', { sub: 4 } as any))
      .resolves.toEqual({ success: true });
    expect(prisma.club_bookings.updateMany).toHaveBeenCalledWith({
      where: { id: 51, entitlement_restored_at: null },
      data: expect.objectContaining({
        entitlement_restored_by: 4,
        entitlement_restore_reason: 'Medical exception',
        entitlement_restored_at: expect.any(Date),
      }),
    });
  });
  it('uses plan-window-booking locks and only permits forward nutrition status changes', async () => {
    tx.club_bookings.findFirst.mockResolvedValue({
      id: 51, status: 'confirmed', employee_id: 3, branch_id: 1, schedule_id: 41,
      service: { id: 7, name: 'InBody', category: 'nutrition' },
      schedule: { id: 41, slot_date: '2026-08-23', start_time: '15:00', end_time: '15:30' },
      availability_slot: {
        id: 5, is_active: true, cancelled_at: null,
        monthly_availability: { id: 3, status: 'published' },
      },
    });
    tx.club_bookings.update.mockResolvedValue({ id: 51, status: 'cancelled' });

    await expect(service.transitionStatus(51, 'cancelled', { branch: 1 } as any))
      .resolves.toEqual({ id: 51, status: 'cancelled' });

    expect(tx.$queryRaw).toHaveBeenCalledTimes(3);
    expect(tx.club_bookings.update).toHaveBeenCalledWith({
      where: { id: 51 }, data: { status: 'cancelled' },
    });
    expect(tx.club_schedules.updateMany).toHaveBeenCalledWith({
      where: { id: 41 }, data: { status: 'cancelled', booked_count: 0 },
    });
  });
});