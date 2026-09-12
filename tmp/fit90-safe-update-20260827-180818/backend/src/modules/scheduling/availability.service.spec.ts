import { BadRequestException } from '@nestjs/common';
import { AvailabilityService } from './availability.service';

describe('AvailabilityService nutrition appointments', () => {
  const prisma = {
    club_services: { findFirst: jest.fn() },
    club_availability_slots: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    club_bookings: { findMany: jest.fn(), count: jest.fn() },
  } as any;
  const service = new AvailabilityService(prisma);

  beforeEach(() => jest.clearAllMocks());

  it('calculates starts from provider attendance and service duration', async () => {
    prisma.club_services.findFirst.mockResolvedValue({
      id: 7, name: 'InBody', category: 'nutrition', duration_min: 30,
      price: { toString: () => '200.00' }, entitlement_key: 'inbody',
    });
    prisma.club_availability_slots.findMany.mockResolvedValue([
      { id: 11, start_time: '15:00', end_time: '20:00' },
    ]);
    prisma.club_bookings.findMany.mockResolvedValue([
      { schedule: { start_time: '15:30', end_time: '16:15' } },
    ]);

    const result = await service.nutritionAvailableTimes(7, 3, '2026-08-23');

    expect(result.service).toEqual(expect.objectContaining({ id: 7, durationMin: 30 }));
    expect(prisma.club_availability_slots.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        monthly_availability: { is: { category: 'nutrition', status: 'published' } },
      }),
    }));
    expect(result.times).toContainEqual(expect.objectContaining({ availabilitySlotId: 11, windowId: 11, startTime: '16:15', endTime: '16:45' }));
    expect(result.times).not.toContainEqual(expect.objectContaining({ startTime: '15:30' }));
  });

  it('does not return appointment starts that have already passed in Cairo', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-19T13:10:00+03:00'));
    prisma.club_services.findFirst.mockResolvedValue({
      id: 7, name: 'InBody', category: 'nutrition', duration_min: 30,
      price: { toString: () => '200.00' }, entitlement_key: 'inbody',
    });
    prisma.club_availability_slots.findMany.mockResolvedValue([
      { id: 11, start_time: '12:00', end_time: '15:00' },
    ]);
    prisma.club_bookings.findMany.mockResolvedValue([]);

    const result = await service.nutritionAvailableTimes(7, 3, '2026-08-19');

    expect(result.times).not.toContainEqual(expect.objectContaining({ startTime: '13:00' }));
    expect(result.times).toContainEqual(expect.objectContaining({ availabilitySlotId: 11, windowId: 11, startTime: '13:15', endTime: '13:45' }));
    jest.useRealTimers();
  });

  it('blocks legacy direct creation of nutrition attendance outside a monthly plan', async () => {
    prisma.club_availability_slots.findFirst.mockResolvedValue(null);

    await expect(service.create({
      moduleType: 'nutrition', trainerId: 3, slotDate: '2026-08-23',
      startTime: '16:00', endTime: '18:00', capacity: 1,
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.club_availability_slots.create).not.toHaveBeenCalled();
  });

  it('blocks legacy monthly generation of nutrition attendance', async () => {
    await expect(service.generateMonth({
      moduleType: 'nutrition', trainerId: 3, month: '2026-08', capacity: 1,
      templates: [{ weekday: 0, startTime: '15:00', endTime: '20:00' }],
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.club_availability_slots.create).not.toHaveBeenCalled();
  });

  it('blocks legacy updates to nutrition attendance windows', async () => {
    prisma.club_availability_slots.findFirst.mockResolvedValue({
      id: 90, module_type: 'nutrition', trainer_id: 3, service_id: null,
      slot_date: '2026-08-23', start_time: '15:00', end_time: '20:00',
    });

    await expect(service.update(90, {
      moduleType: 'nutrition', trainerId: 3, slotDate: '2026-08-23',
      startTime: '16:00', endTime: '20:00',
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.club_availability_slots.update).not.toHaveBeenCalled();
  });

  it('blocks legacy deletion of nutrition attendance windows', async () => {
    prisma.club_availability_slots.findFirst.mockResolvedValue({
      id: 90, module_type: 'nutrition', trainer_id: 3, service_id: null,
      slot_date: '2026-08-23', start_time: '15:00', end_time: '20:00',
    });

    await expect(service.remove(90)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.club_availability_slots.update).not.toHaveBeenCalled();
  });

  it('returns no times when there is no provider attendance', async () => {
    prisma.club_services.findFirst.mockResolvedValue({
      id: 7, name: 'InBody', category: 'nutrition', duration_min: 30,
      price: { toString: () => '200.00' }, entitlement_key: 'inbody',
    });
    prisma.club_availability_slots.findMany.mockResolvedValue([]);
    prisma.club_bookings.findMany.mockResolvedValue([]);

    await expect(service.nutritionAvailableTimes(7, 3, '2026-08-23'))
      .resolves.toEqual(expect.objectContaining({ times: [] }));
  });
});