import { BadRequestException, ConflictException } from '@nestjs/common';
import { ClassSchedulesService } from './class-schedules.service';

const future = (value: string) => value;

describe('ClassSchedulesService', () => {
  let prisma: any;
  let additionalServices: any;
  let employeeScope: any;
  let service: ClassSchedulesService;

  beforeEach(() => {
    const tx: any = {
      club_class_monthly_schedules: { findUnique: jest.fn(), update: jest.fn() },
      club_class_schedule_slots: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
      },
    };
    prisma = {
      club_lookups: { findFirst: jest.fn() },
      club_classes: { findFirst: jest.fn() },
      club_trainers: { findFirst: jest.fn() },
      club_class_monthly_schedules: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      club_class_schedule_slots: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      $transaction: jest.fn((callback: any) => callback(tx)),
      __tx: tx,
    };
    // The production service validates the schedule through the root Prisma client
    // before entering a transaction; keep legacy transaction-focused tests in sync.
    prisma.club_class_monthly_schedules.findUnique.mockImplementation((...args: any[]) =>
      prisma.__tx.club_class_monthly_schedules.findUnique(...args),
    );
    additionalServices = {
      validateSlotServiceItems: jest.fn(),
      upsertSlotServiceItems: jest.fn(),
    };
    employeeScope = {
      scopedProviderId: jest.fn().mockImplementation(async (_user: unknown, requested?: number | null) => requested ?? null),
      assertProviderAccess: jest.fn(),
    };
    service = new ClassSchedulesService(prisma, additionalServices, employeeScope);
  });

  it('ينشئ جدولًا ناجحًا', async () => {
    prisma.club_lookups.findFirst.mockResolvedValue({ id: 1 });
    prisma.club_trainers.findFirst.mockResolvedValue({ id: 2 });
    prisma.club_class_monthly_schedules.findUnique.mockResolvedValue(null);
    prisma.club_class_monthly_schedules.create.mockResolvedValue({ id: 10, status: 'draft' });
    await expect(service.createSchedule({ classId: 1, trainerId: 2, month: 8, year: 2026 }))
      .resolves.toMatchObject({ id: 10, status: 'draft' });
  });

  it('يرفض جدولًا مكررًا', async () => {
    prisma.club_lookups.findFirst.mockResolvedValue({ id: 1 });
    prisma.club_trainers.findFirst.mockResolvedValue({ id: 2 });
    prisma.club_class_monthly_schedules.findUnique.mockResolvedValue({ id: 9 });
    await expect(service.createSchedule({ classId: 1, trainerId: 2, month: 8, year: 2026 }))
      .rejects.toBeInstanceOf(ConflictException);
  });

  const arrangeSlot = (overrides: Record<string, unknown> = {}) => {
    prisma.club_class_monthly_schedules.findUnique.mockResolvedValue({
      id: 1,
      class_id: 4,
      trainer_id: 2,
      month: 8,
      year: 2026,
      status: 'draft',
    });
    prisma.club_class_schedule_slots.findFirst.mockResolvedValue(null);
    prisma.club_class_schedule_slots.create.mockResolvedValue({ id: 3 });
    return {
      startAt: future('2026-08-05T18:00:00+03:00'),
      endAt: future('2026-08-05T19:00:00+03:00'),
      bookingStartAt: future('2026-08-01T09:00:00+03:00'),
      bookingEndAt: future('2026-08-05T17:00:00+03:00'),
      capacity: 20,
      status: 'available' as const,
      ...overrides,
    } as any;
  };

  it('يضيف موعدًا صحيحًا', async () => {
    await expect(service.createSlot(1, arrangeSlot())).resolves.toMatchObject({ id: 3 });
  });

  it('يرفض موعدًا خارج الشهر', async () => {
    await expect(
      service.createSlot(1, arrangeSlot({ startAt: '2026-09-05T18:00:00+03:00', endAt: '2026-09-05T19:00:00+03:00' })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('يرفض endAt قبل startAt', async () => {
    await expect(
      service.createSlot(1, arrangeSlot({ endAt: '2026-08-05T17:00:00+03:00' })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('يرفض bookingEndAt بعد startAt', async () => {
    await expect(
      service.createSlot(1, arrangeSlot({ bookingEndAt: '2026-08-05T18:30:00+03:00' })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('يكتشف تعارض المدرب', async () => {
    const dto = arrangeSlot();
    prisma.club_class_schedule_slots.findFirst.mockResolvedValue({ id: 99 });
    await expect(service.createSlot(1, dto)).rejects.toBeInstanceOf(ConflictException);
  });

  it('يسمح بموعدين متتاليين', async () => {
    await service.createSlot(1, arrangeSlot());
    expect(prisma.club_class_schedule_slots.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          start_at: { lt: new Date('2026-08-05T19:00:00+03:00') },
          end_at: { gt: new Date('2026-08-05T18:00:00+03:00') },
        }),
      }),
    );
  });

  const recurringDto = {
    weekDays: [0],
    startTime: '18:00',
    endTime: '19:00',
    bookingStartAt: '2026-07-25T09:00:00+03:00',
    bookingEndRule: { type: 'minutes_before_class' as const, value: 60 },
    capacity: 20,
    status: 'available' as const,
  };

  it('ينشئ مواعيد متكررة داخل الشهر', async () => {
    prisma.__tx.club_class_monthly_schedules.findUnique.mockResolvedValue({
      id: 1, class_id: 4, trainer_id: 2, month: 8, year: 2026, status: 'draft',
    });
    prisma.__tx.club_class_schedule_slots.findMany.mockResolvedValue([]);
    prisma.__tx.club_class_schedule_slots.create.mockImplementation(({ data }: any) => ({ id: Math.random(), ...data }));
    const result = await service.createRecurringSlots(1, recurringDto);
    expect(result.createdSlotsCount).toBe(5);
  });

  it('يلغي العملية المتكررة عند وجود تعارض', async () => {
    prisma.__tx.club_class_monthly_schedules.findUnique.mockResolvedValue({
      id: 1, class_id: 4, trainer_id: 2, month: 8, year: 2026, status: 'draft',
    });
    prisma.__tx.club_class_schedule_slots.findMany.mockResolvedValue([
      { start_at: new Date('2026-08-02T15:30:00Z'), end_at: new Date('2026-08-02T16:30:00Z') },
    ]);
    await expect(service.createRecurringSlots(1, recurringDto)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.__tx.club_class_schedule_slots.create).not.toHaveBeenCalled();
  });

  it('ينسخ الشهر السابق مع إعداداته دون حجوزات', async () => {
    prisma.club_class_monthly_schedules.findUnique.mockResolvedValue({
      id: 2, class_id: 4, trainer_id: 2, month: 9, year: 2026, status: 'draft', slots: [],
    });
    prisma.__tx.club_class_monthly_schedules.findUnique
      .mockResolvedValueOnce({
        id: 2, class_id: 4, trainer_id: 2, month: 9, year: 2026, status: 'draft', slots: [],
      })
      .mockResolvedValueOnce({
        id: 1,
        slots: [{
          start_at: new Date('2026-08-05T15:00:00Z'), end_at: new Date('2026-08-05T16:00:00Z'),
          booking_start_at: new Date('2026-08-01T06:00:00Z'), booking_end_at: new Date('2026-08-05T14:00:00Z'),
          capacity: 10, status: 'available', additional_services: [{ service_id: 7, capacity: 2, is_required: false, is_active: true }],
        }],
      });
    prisma.__tx.club_class_schedule_slots.findMany.mockResolvedValue([]);
    prisma.__tx.club_class_schedule_slots.create.mockResolvedValue({ id: 20 });
    const result = await service.copyPreviousMonth(2);
    expect(result.copiedSlotsCount).toBe(1);
    expect(additionalServices.upsertSlotServiceItems).toHaveBeenCalled();
  });

  it('يتخطى يوم 31 عند النسخ لشهر أقصر', async () => {
    prisma.club_class_monthly_schedules.findUnique.mockResolvedValue({
      id: 2, class_id: 4, trainer_id: 2, month: 9, year: 2026, status: 'draft', slots: [],
    });
    prisma.__tx.club_class_monthly_schedules.findUnique
      .mockResolvedValueOnce({ id: 2, class_id: 4, trainer_id: 2, month: 9, year: 2026, status: 'draft', slots: [] })
      .mockResolvedValueOnce({ id: 1, slots: [{
        start_at: new Date('2026-08-31T15:00:00Z'), end_at: new Date('2026-08-31T16:00:00Z'),
        booking_start_at: null, booking_end_at: null, capacity: 10, status: 'available', additional_services: [],
      }] });
    const result = await service.copyPreviousMonth(2);
    expect(result).toMatchObject({ copiedSlotsCount: 0, skippedSlotsCount: 1 });
  });

  it('يرفض نشر جدول فارغ', async () => {
    prisma.__tx.club_class_monthly_schedules.findUnique.mockResolvedValue({
      id: 1, trainer_id: 2, month: 8, year: 2026, status: 'draft', slots: [],
    });
    await expect(service.publishSchedule(1)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('يلغي موعد الحصة وكل الحجوزات حتى إذا تعطلت الإشعارات', async () => {
    const slot = {
      id: 15,
      status: 'available',
      start_at: new Date('2026-08-05T15:00:00Z'),
      monthly_schedule_id: 3,
      monthly_schedule: {
        trainer_id: 2,
        status: 'published',
        class: { name: 'Yoga' },
      },
      bookings: [
        {
          id: 41,
          member_id: 7,
          user_id: null,
          member: { id: 7, name: 'A', app_user_id: 70, branch_id: 1 },
          user: null,
        },
        {
          id: 42,
          member_id: 8,
          user_id: null,
          member: { id: 8, name: 'B', app_user_id: 80, branch_id: 1 },
          user: null,
        },
      ],
    };
    const classTx: any = {
      club_class_schedule_slots: {
        findUnique: jest.fn().mockResolvedValue(slot),
        update: jest.fn().mockResolvedValue({ id: 15, status: 'cancelled' }),
      },
      club_class_bookings: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
      club_booking_additional_services: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const classPrisma: any = {
      club_class_schedule_slots: { findUnique: jest.fn().mockResolvedValue(slot) },
      club_notifications: {
        updateMany: jest.fn().mockRejectedValue(new Error('notifications unavailable')),
        createMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      $transaction: jest.fn((arg: any) =>
        Array.isArray(arg) ? Promise.all(arg) : arg(classTx),
      ),
    };
    const classEmployeeScope = { assertProviderAccess: jest.fn().mockResolvedValue(undefined) };
    const classService = new ClassSchedulesService(
      classPrisma,
      {} as any,
      classEmployeeScope as any,
    );

    await expect(classService.cancelSlot(15)).resolves.toMatchObject({
      slot: { id: 15, status: 'cancelled' },
      notifiedBookingsCount: 2,
    });
    expect(classTx.club_class_bookings.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [41, 42] } },
      data: { status: 'cancelled', cancelled_at: expect.any(Date) },
    });
    expect(classTx.club_booking_additional_services.updateMany).toHaveBeenCalledWith({
      where: { booking_id: { in: [41, 42] }, status: 'confirmed' },
      data: { status: 'cancelled' },
    });
  });
});
