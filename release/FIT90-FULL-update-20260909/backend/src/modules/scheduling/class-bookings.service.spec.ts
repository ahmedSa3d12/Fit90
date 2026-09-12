import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { ClassBookingsService } from './class-bookings.service';

describe('ClassBookingsService', () => {
  const start = new Date('2099-08-05T15:00:00Z');
  const slotBase = {
    id: 5,
    monthly_schedule_id: 1,
    start_at: start,
    end_at: new Date('2099-08-05T16:00:00Z'),
    booking_start_at: new Date('2000-01-01T00:00:00Z'),
    booking_end_at: new Date('2099-08-05T14:00:00Z'),
    capacity: 2,
    status: 'available',
    monthly_schedule: { id: 1, class_id: 3, trainer_id: 4, status: 'published' },
  };

  const fullBooking = (overrides: Record<string, unknown> = {}) => ({
    id: 10,
    slot_id: 5,
    user_id: 7,
    status: 'confirmed',
    booked_at: new Date(),
    cancelled_at: null,
    slot: {
      ...slotBase,
      monthly_schedule: {
        ...slotBase.monthly_schedule,
        class: { id: 3, class_name: 'Yoga', class_type: 'class' },
        trainer: { id: 4, name: 'Coach', specialization: null },
      },
    },
    additional_services: [],
    ...overrides,
  });

  function harness(options: {
    slot?: any;
    existing?: any;
    confirmedCount?: number;
    configs?: any[];
    links?: any[];
    serviceCount?: number;
  } = {}) {
    const slot = options.slot ?? slotBase;
    const configs = options.configs ?? [];
    const links = options.links ?? [];
    const booking = fullBooking();
    const tx: any = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      club_class_schedule_slots: { findUnique: jest.fn().mockResolvedValue(slot) },
      club_class_bookings: {
        findUnique: jest.fn()
          .mockResolvedValueOnce(options.existing ?? null)
          .mockResolvedValueOnce(booking),
        count: jest.fn().mockResolvedValue(options.confirmedCount ?? 0),
        create: jest.fn().mockResolvedValue({ id: 10 }),
        update: jest.fn().mockResolvedValue({ id: 10 }),
      },
      club_slot_additional_services: {
        findMany: jest.fn().mockResolvedValue(configs),
        upsert: jest.fn(),
      },
      club_class_additional_services: { findMany: jest.fn().mockResolvedValue(links) },
      club_booking_additional_services: {
        count: jest.fn().mockResolvedValue(options.serviceCount ?? 0),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        upsert: jest.fn(),
      },
    };
    const prisma: any = { $transaction: jest.fn((callback: any) => callback(tx)) };
    return { service: new ClassBookingsService(prisma), tx };
  }

  const config = (id: number, required = false, capacity = 2) => ({
    id: id + 100,
    slot_id: 5,
    service_id: id,
    capacity,
    is_required: required,
    is_active: true,
    service: { id, category: 'additional', is_active: true, is_deleted: false },
  });
  const link = (id: number, required = false) => ({
    service_id: id,
    is_required: required,
    is_active: true,
    service: { id, category: 'additional', is_active: true, is_deleted: false },
  });

  it('يحجز بدون خدمات', async () => {
    const { service, tx } = harness();
    await service.createBooking(7, { slotId: 5, additionalServiceIds: [] });
    expect(tx.club_class_bookings.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ user_id: 7, status: 'confirmed' }) }),
    );
  });

  it('يحجز مع خدمة', async () => {
    const { service, tx } = harness({ configs: [config(1)], links: [link(1)] });
    await service.createBooking(7, { slotId: 5, additionalServiceIds: [1] });
    expect(tx.club_booking_additional_services.upsert).toHaveBeenCalledTimes(1);
  });

  it('يحجز مع أكثر من خدمة', async () => {
    const { service, tx } = harness({
      configs: [config(1), config(2)],
      links: [link(1), link(2)],
    });
    await service.createBooking(7, { slotId: 5, additionalServiceIds: [1, 2] });
    expect(tx.club_booking_additional_services.upsert).toHaveBeenCalledTimes(2);
  });

  it('يرفض الحجز قبل فتح الحجز', async () => {
    const { service } = harness({
      slot: { ...slotBase, booking_start_at: new Date('2099-08-01T00:00:00Z') },
    });
    await expect(service.createBooking(7, { slotId: 5 })).rejects.toBeInstanceOf(ConflictException);
  });

  it('يرفض الحجز بعد إغلاق الحجز', async () => {
    const { service } = harness({
      slot: { ...slotBase, booking_end_at: new Date('2001-01-01T00:00:00Z') },
    });
    await expect(service.createBooking(7, { slotId: 5 })).rejects.toBeInstanceOf(ConflictException);
  });

  it('يرفض الحجز بعد بداية الكلاس', async () => {
    const { service } = harness({ slot: { ...slotBase, start_at: new Date('2001-01-01') } });
    await expect(service.createBooking(7, { slotId: 5 })).rejects.toBeInstanceOf(ConflictException);
  });

  it('يرفض الحجز في جدول غير منشور', async () => {
    const { service } = harness({
      slot: { ...slotBase, monthly_schedule: { ...slotBase.monthly_schedule, status: 'draft' } },
    });
    await expect(service.createBooking(7, { slotId: 5 })).rejects.toBeInstanceOf(ConflictException);
  });

  it('يرفض الحجز في موعد ملغي', async () => {
    const { service } = harness({ slot: { ...slotBase, status: 'cancelled' } });
    await expect(service.createBooking(7, { slotId: 5 })).rejects.toBeInstanceOf(ConflictException);
  });

  it('يرفض الحجز عند اكتمال سعة الكلاس', async () => {
    const { service } = harness({ confirmedCount: 2 });
    await expect(service.createBooking(7, { slotId: 5 })).rejects.toBeInstanceOf(ConflictException);
  });

  it('يمنع الحجز المكرر', async () => {
    const { service } = harness({ existing: { id: 10, status: 'confirmed' } });
    await expect(service.createBooking(7, { slotId: 5 })).rejects.toBeInstanceOf(ConflictException);
  });

  it('يرفض خدمة غير متاحة', async () => {
    const { service } = harness({ configs: [], links: [] });
    await expect(
      service.createBooking(7, { slotId: 5, additionalServiceIds: [1] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('يهيئ خدمة الكلاس على الموعد تلقائيًا عند اختيارها للحجز', async () => {
    const { service, tx } = harness({ configs: [], links: [link(1)] });
    tx.club_slot_additional_services.upsert.mockResolvedValue(config(1));

    await service.createBooking(7, { slotId: 5, additionalServiceIds: [1] });

    expect(tx.club_slot_additional_services.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ slot_id: 5, service_id: 1, capacity: slotBase.capacity }),
      }),
    );
    expect(tx.club_booking_additional_services.upsert).toHaveBeenCalledTimes(1);
  });

  it('يرفض خدمة مكتملة السعة', async () => {
    const { service } = harness({
      configs: [config(1, false, 1)], links: [link(1)], serviceCount: 1,
    });
    await expect(
      service.createBooking(7, { slotId: 5, additionalServiceIds: [1] }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('يجبر اختيار الخدمة المطلوبة', async () => {
    const { service } = harness({ configs: [config(1, true)], links: [link(1, true)] });
    await expect(service.createBooking(7, { slotId: 5, additionalServiceIds: [] }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('يعيد الحجز بعد الإلغاء ويلغي الخدمات القديمة', async () => {
    const { service, tx } = harness({ existing: { id: 10, status: 'cancelled' } });
    await service.createBooking(7, { slotId: 5, additionalServiceIds: [] });
    expect(tx.club_class_bookings.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'confirmed', cancelled_at: null }) }),
    );
    expect(tx.club_booking_additional_services.updateMany).toHaveBeenCalled();
  });

  function cancellationHarness(owner = 7) {
    const booking = { id: 10, slot_id: 5, user_id: owner, status: 'confirmed', slot: slotBase };
    const tx: any = {
      $queryRaw: jest.fn(),
      club_class_bookings: {
        findUnique: jest.fn()
          .mockResolvedValueOnce({ slot_id: 5 })
          .mockResolvedValueOnce(booking)
          .mockResolvedValueOnce(fullBooking()),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
      },
      club_services: { findMany: jest.fn() },
      club_class_additional_services: { upsert: jest.fn() },
      club_booking_additional_services: { updateMany: jest.fn(), findMany: jest.fn() },
    };
    const prisma: any = { $transaction: jest.fn((callback: any) => callback(tx)) };
    return { service: new ClassBookingsService(prisma), tx };
  }

  it('يلغي الحجز وخدماته داخل transaction', async () => {
    const { service, tx } = cancellationHarness();
    await service.cancelBooking(7, 10);
    expect(tx.club_class_bookings.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'cancelled' }) }),
    );
    expect(tx.club_booking_additional_services.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'cancelled' } }),
    );
  });

  it('يعدل خدمات الحجز ويعيد تفعيل المختار', async () => {
    const booking = {
      id: 10, slot_id: 5, user_id: 7, status: 'confirmed',
      slot: { ...slotBase, monthly_schedule: slotBase.monthly_schedule },
    };
    const { service, tx } = cancellationHarness();
    tx.club_class_bookings.findUnique
      .mockReset()
      .mockResolvedValueOnce({ slot_id: 5 })
      .mockResolvedValueOnce(booking)
      .mockResolvedValueOnce(fullBooking());
    tx.club_slot_additional_services = { findMany: jest.fn().mockResolvedValue([config(1)]) };
    tx.club_class_additional_services = { findMany: jest.fn().mockResolvedValue([link(1)]) };
    tx.club_booking_additional_services.count = jest.fn().mockResolvedValue(0);
    tx.club_booking_additional_services.upsert = jest.fn();
    await service.updateBookingServices(7, 10, { additionalServiceIds: [1] });
    expect(tx.club_booking_additional_services.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ status: 'confirmed' }) }),
    );
  });

  it('يمنع مستخدمًا من تعديل حجز غيره', async () => {
    const { service } = cancellationHarness(8);
    await expect(service.updateBookingServices(7, 10, { additionalServiceIds: [] }))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('يسمح للإدارة بإضافة أكثر من خدمة لحجز عضو', async () => {
    const booking = {
      id: 10, slot_id: 5, user_id: null, member_id: 22, status: 'confirmed',
      slot: { ...slotBase, monthly_schedule: slotBase.monthly_schedule },
    };
    const { service, tx } = cancellationHarness();
    tx.club_class_bookings.findUnique
      .mockReset()
      .mockResolvedValueOnce({ slot_id: 5 })
      .mockResolvedValueOnce(booking)
      .mockResolvedValueOnce(fullBooking());
    tx.club_slot_additional_services = { findMany: jest.fn().mockResolvedValue([config(1), config(2)]) };
    tx.club_services.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    tx.club_class_additional_services = {
      findMany: jest.fn().mockResolvedValue([link(1), link(2)]),
      upsert: jest.fn(),
    };
    tx.club_booking_additional_services.count = jest.fn().mockResolvedValue(0);
    tx.club_booking_additional_services.upsert = jest.fn();

    await service.adminUpdateBookingServices(10, { additionalServiceIds: [1, 2] });

    expect(tx.club_booking_additional_services.upsert).toHaveBeenCalledTimes(2);
    expect(tx.club_class_additional_services.upsert).toHaveBeenCalledTimes(2);
  });

  it('يعرض إجمالي الحصص المجانية المستخدمة والمتبقية للعضو', async () => {
    const prisma: any = {
      club_class_schedule_slots: {
        findUnique: jest.fn().mockResolvedValue({
          start_at: new Date('2099-08-05T15:00:00Z'),
          monthly_schedule: { class: { id: 3, name: 'Yoga' } },
        }),
      },
      club_members: { findFirst: jest.fn().mockResolvedValue({ id: 22 }) },
      club_subscriptions: {
        findMany: jest.fn().mockResolvedValue([
          { id: 1, subscription_number: 'S-1', subscription_type: 'Gold', subscription_start_date: '2099-01-01', subscription_end_date: '2099-12-31', sessions_count: 8, sessions_used: 3 },
          { id: 2, subscription_number: 'S-2', subscription_type: 'Bonus', subscription_start_date: '2099-01-01', subscription_end_date: '2099-12-31', sessions_count: 2, sessions_used: 1 },
        ]),
      },
      club_class_bookings: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const result = await new ClassBookingsService(prisma).adminMemberFreeSessions(5, 22);

    expect(result).toEqual(expect.objectContaining({
      hasFreeSessions: true,
      total: 10,
      used: 4,
      remaining: 6,
    }));
  });

  it('يحسب الحجوزات المكتملة القديمة لنفس الكلاس ضمن الحصص المستخدمة', async () => {
    const prisma: any = {
      club_class_schedule_slots: {
        findUnique: jest.fn().mockResolvedValue({
          start_at: new Date('2099-08-05T15:00:00Z'),
          monthly_schedule: { class: { id: 3, name: 'Yoga' } },
        }),
      },
      club_members: { findFirst: jest.fn().mockResolvedValue({ id: 22 }) },
      club_subscriptions: {
        findMany: jest.fn().mockResolvedValue([{
          id: 1,
          subscription_number: 'S-1',
          subscription_type: 'Gold',
          subscription_start_date: '2099-01-01',
          subscription_end_date: '2099-12-31',
          sessions_count: 1,
          sessions_used: 0,
        }]),
      },
      club_class_bookings: {
        findMany: jest.fn().mockResolvedValue([{
          slot: { start_at: new Date('2099-07-19T15:00:00Z') },
        }]),
      },
    };

    const result = await new ClassBookingsService(prisma).adminMemberFreeSessions(5, 22);

    expect(result).toEqual(expect.objectContaining({ total: 1, used: 1, remaining: 0 }));
    expect(prisma.club_class_bookings.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        member_id: 22,
        status: 'completed',
        slot: { monthly_schedule: { class_id: 3 } },
      }),
    }));
  });

  it('يخصم حصة مجانية واحدة عند تحويل حجز العضو إلى مكتمل', async () => {
    const booking = {
      id: 10,
      slot_id: 5,
      user_id: null,
      member_id: 22,
      status: 'confirmed',
      slot: { start_at: new Date('2099-08-05T15:00:00Z') },
    };
    const tx: any = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      club_class_bookings: {
        findUnique: jest.fn()
          .mockResolvedValueOnce({ slot_id: 5 })
          .mockResolvedValueOnce(booking)
          .mockResolvedValueOnce(fullBooking({ member_id: 22 })),
        update: jest.fn(),
      },
      club_subscriptions: {
        findMany: jest.fn().mockResolvedValue([{
          id: 30,
          sessions_count: 5,
          sessions_used: 2,
          is_linked_to_sessions: false,
        }]),
        update: jest.fn(),
      },
      club_booking_additional_services: { updateMany: jest.fn() },
    };
    const prisma: any = { $transaction: jest.fn((callback: any) => callback(tx)) };

    await new ClassBookingsService(prisma).adminTransitionBooking(10, 'completed');

    expect(tx.club_subscriptions.update).toHaveBeenCalledWith({
      where: { id: 30 },
      data: { sessions_used: 3 },
    });
  });

  it('يستخدم أقفال FOR UPDATE قبل حساب السعة لمنع تجاوز سعة الكلاس والخدمة', async () => {
    const { service, tx } = harness({ configs: [config(1)], links: [link(1)] });
    await service.createBooking(7, { slotId: 5, additionalServiceIds: [1] });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(3);
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.club_class_bookings.count.mock.invocationCallOrder[0],
    );
    expect(tx.$queryRaw.mock.invocationCallOrder[2]).toBeLessThan(
      tx.club_booking_additional_services.count.mock.invocationCallOrder[0],
    );
  });

  it('يضيف عضو التطبيق إلى الانتظار عندما تكتمل سعة الحصة', async () => {
    const bookedAt = new Date('2099-07-20T10:00:00Z');
    const waitBooking = fullBooking({
      id: 11,
      user_id: null,
      member_id: 22,
      status: 'wait',
      booked_at: bookedAt,
    });
    const tx: any = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      club_class_schedule_slots: { findUnique: jest.fn().mockResolvedValue(slotBase) },
      club_class_bookings: {
        findUnique: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(waitBooking),
        count: jest.fn().mockResolvedValueOnce(2).mockResolvedValueOnce(1),
        create: jest.fn().mockResolvedValue({ id: 11, booked_at: bookedAt }),
        update: jest.fn(),
      },
    };
    const prisma: any = {
      club_members: { findFirst: jest.fn().mockResolvedValue({ id: 22 }) },
      club_class_schedule_slots: {
        findUnique: jest.fn().mockResolvedValue({
          start_at: slotBase.start_at,
          monthly_schedule: { class: { id: 3, name: 'Yoga' } },
        }),
      },
      club_subscriptions: { findMany: jest.fn().mockResolvedValue([]) },
      club_class_bookings: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn((callback: any) => callback(tx)),
    };

    const result = await new ClassBookingsService(prisma).createMemberAppBooking(70, 22, 5);

    expect(result).toEqual(expect.objectContaining({
      status: 'wait',
      code: 'CLASS_FULL_WAITLISTED',
      waitlistPosition: 1,
    }));
    expect(tx.club_class_bookings.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ slot_id: 5, member_id: 22, status: 'wait' }),
    });
  });

  it('يرقي أول عضو في الانتظار عند إلغاء حجز مؤكد من التطبيق', async () => {
    const confirmed = {
      id: 10,
      slot_id: 5,
      member_id: 22,
      status: 'confirmed',
      slot: slotBase,
    };
    const cancelled = fullBooking({ member_id: 22, user_id: null, status: 'cancelled' });
    const tx: any = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      club_class_bookings: {
        findUnique: jest.fn()
          .mockResolvedValueOnce({ slot_id: 5 })
          .mockResolvedValueOnce(confirmed)
          .mockResolvedValueOnce(cancelled),
        findFirst: jest.fn().mockResolvedValue({ id: 11, member_id: 23 }),
        update: jest.fn().mockResolvedValue({}),
      },
      club_booking_additional_services: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      club_members: { findUnique: jest.fn().mockResolvedValue({ app_user_id: 71 }) },
      club_notifications: { create: jest.fn().mockResolvedValue({ id: 1 }) },
    };
    const prisma: any = {
      club_members: { findFirst: jest.fn().mockResolvedValue({ id: 22 }) },
      $transaction: jest.fn((callback: any) => callback(tx)),
    };

    const result = await new ClassBookingsService(prisma).cancelMemberAppBooking(70, 22, 10);

    expect(result).toEqual(expect.objectContaining({
      code: 'BOOKING_CANCELLED',
      promotedBookingId: 11,
    }));
    expect(tx.club_class_bookings.update).toHaveBeenCalledWith({
      where: { id: 11 },
      data: { status: 'confirmed' },
    });
    expect(tx.club_class_bookings.findFirst).toHaveBeenCalledWith({
      where: { slot_id: 5, status: 'wait' },
      orderBy: [{ booked_at: 'asc' }, { id: 'asc' }],
    });
    expect(tx.club_notifications.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ booking_id: 11, member_id: 23, to_user: 71 }),
    });
  });

  it('يرقي أقدم حجز انتظار ويرسل إشعارًا عند الإلغاء من شاشة الإدارة', async () => {
    const confirmed = {
      id: 10,
      slot_id: 5,
      user_id: null,
      member_id: 22,
      status: 'confirmed',
      slot: { start_at: slotBase.start_at },
    };
    const tx: any = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      club_class_bookings: {
        findUnique: jest.fn()
          .mockResolvedValueOnce({ slot_id: 5 })
          .mockResolvedValueOnce(confirmed)
          .mockResolvedValueOnce(fullBooking({ id: 10, member_id: 22, status: 'cancelled' })),
        findFirst: jest.fn().mockResolvedValue({ id: 11, member_id: 23, user_id: null }),
        update: jest.fn().mockResolvedValue({}),
      },
      club_booking_additional_services: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      club_members: { findUnique: jest.fn().mockResolvedValue({ app_user_id: 71 }) },
      club_notifications: { create: jest.fn().mockResolvedValue({ id: 1 }) },
    };
    const prisma: any = { $transaction: jest.fn((callback: any) => callback(tx)) };

    await new ClassBookingsService(prisma).adminTransitionBooking(10, 'cancelled');

    expect(tx.club_class_bookings.findFirst).toHaveBeenCalledWith({
      where: { slot_id: 5, status: 'wait' },
      orderBy: [{ booked_at: 'asc' }, { id: 'asc' }],
    });
    expect(tx.club_class_bookings.update).toHaveBeenCalledWith({
      where: { id: 11 },
      data: { status: 'confirmed' },
    });
    expect(tx.club_notifications.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'booking_confirmed',
        booking_id: 11,
        member_id: 23,
        to_user: 71,
      }),
    });
  });

  it('يرسل اسم الخدمة والمدرب داخل مواعيد الحصص', async () => {
    const prisma: any = {
      club_class_schedule_slots: {
        findMany: jest.fn().mockResolvedValue([{
          ...slotBase,
          monthly_schedule: {
            ...slotBase.monthly_schedule,
            class: {
              id: 3,
              name: 'Yoga',
              name_en: 'Yoga',
              code: 'yoga',
              additional_services: [],
            },
            trainer: { id: 4, name: 'Coach', specialization: 'Yoga' },
          },
          _count: { bookings: 0 },
          bookings: [{ id: 91 }],
          additional_services: [],
        }]),
      },
    };

    const result = await new ClassBookingsService(prisma).availableSlots({ month: 8, year: 2099 });

    expect(result[0]).toEqual(expect.objectContaining({
      service: { id: 3, name: 'Yoga', category: 'class' },
      trainer: expect.objectContaining({ id: 4, name: 'Coach' }),
      waitingBookingsCount: 1,
    }));
  });
});
