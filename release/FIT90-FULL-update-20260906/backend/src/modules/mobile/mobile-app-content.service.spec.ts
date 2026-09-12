import { NotFoundException } from '@nestjs/common';
import { MobileAppContentService } from './mobile-app-content.service';

describe('MobileAppContentService InBody API', () => {
  const member = { id: 15, member_code: 'M00015', name: 'Test Member', branch_id: 1 };
  const first = {
    id: 2,
    member_id: 15,
    measurement_date: '2026-07-21',
    weight: { toString: () => '75.50' },
    body_fat: { toString: () => '24.10' },
    muscle_mass: { toString: () => '31.25' },
    bmi: { toString: () => '26.20' },
    staff_name: 'Nutritionist',
    file_url: '/uploads/inbody/result.pdf',
    notes: null,
    nutrition_plan: {
      goal: 'Weight loss',
      dailyCalories: 1800,
      waterLiters: 3,
      fileUrl: 'club/nutrition/nutrition-20260722.pdf',
      meals: [{ name: 'Breakfast', time: '08:00', foods: 'Eggs', notes: '' }],
    },
    created_at: new Date('2026-07-21T08:00:00Z'),
    updated_at: new Date('2026-07-21T08:00:00Z'),
  };

  function setup(rows = [first]) {
    const prisma = {
      club_members: { findFirst: jest.fn().mockResolvedValue(member) },
      club_inbody_measurements: {
        findMany: jest.fn().mockResolvedValue(rows),
        findFirst: jest.fn().mockResolvedValue(rows[0] ?? null),
      },
    };
    const config = { get: jest.fn().mockImplementation((key: string) => key === 'publicUploadBase' ? '/uploads' : undefined) };
    const service = new MobileAppContentService(prisma as any, {} as any, config as any, {} as any);
    return { prisma, service };
  }

  it('returns only the signed-in member history and exposes the latest nutrition plan', async () => {
    const { prisma, service } = setup();
    const result = await service.inbodyMeasurements(90, 15);

    expect(prisma.club_members.findFirst).toHaveBeenCalledWith({
      where: { id: 15, app_user_id: 90, is_deleted: false, is_active: true },
      select: { id: true, member_code: true, name: true, branch_id: true },
    });
    expect(prisma.club_inbody_measurements.findMany).toHaveBeenCalledWith({
      where: { member_id: 15 },
      orderBy: [{ measurement_date: 'desc' }, { id: 'desc' }],
    });
    expect(result.latestMeasurement).toMatchObject({ id: 2, weight: 75.5, bodyFat: 24.1 });
    expect(result.nutritionPlan).toEqual({
      measurementId: 2,
      measurementDate: '2026-07-21',
      plan: {
        ...first.nutrition_plan,
        file: {
          path: 'club/nutrition/nutrition-20260722.pdf',
          url: '/uploads/club/nutrition/nutrition-20260722.pdf',
          fileName: 'nutrition-20260722.pdf',
          contentType: 'application/pdf',
        },
      },
    });
    expect(result.latestMeasurement?.nutritionPlan).toEqual(result.nutritionPlan!.plan);
  });

  it('does not return a measurement belonging to another member', async () => {
    const { prisma, service } = setup([]);
    prisma.club_inbody_measurements.findFirst.mockResolvedValue(null);

    await expect(service.inbodyMeasurement(90, 15, 999)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.club_inbody_measurements.findFirst).toHaveBeenCalledWith({
      where: { id: 999, member_id: 15 },
    });
  });
});

describe('MobileAppContentService Flutter APIs', () => {
  const member = { id: 15, member_code: 'M00015', name: 'Test Member', branch_id: 2 };

  function setup() {
    const prisma = {
      club_members: { findFirst: jest.fn().mockResolvedValue(member), update: jest.fn() },
      club_content_items: { findMany: jest.fn(), findFirst: jest.fn() },
      club_subscriptions: { findMany: jest.fn().mockResolvedValue([]) },
      club_subscription_freezes: { findMany: jest.fn().mockResolvedValue([]) },
      club_notifications: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      club_trainers: { findMany: jest.fn().mockResolvedValue([]) },
      employees: { findMany: jest.fn().mockResolvedValue([]) },
      club_member_points_transactions: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { points: null } }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      club_subscription_types: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
      },
    };
    const service = new MobileAppContentService(
      prisma as any,
      {} as any,
      { get: jest.fn() } as any,
      {} as any,
    );
    return { prisma, service };
  }

  it('returns FAQ content using the public content source', async () => {
    const { prisma, service } = setup();
    prisma.club_content_items.findMany.mockResolvedValue([]);

    await expect(service.listContent('faqs')).resolves.toEqual({ data: [] });
    expect(prisma.club_content_items.findMany).toHaveBeenCalledWith({
      where: { content_type: 'faq', is_active: true, is_deleted: false },
      orderBy: [{ sort_order: 'asc' }, { id: 'desc' }],
    });
  });

  it('never reads another member subscriptions or freeze history', async () => {
    const { prisma, service } = setup();

    await service.subscriptions(90, 15);
    await service.freezeHistory(90, 15);

    expect(prisma.club_subscriptions.findMany.mock.calls[0][0].where).toEqual({ member_id: 15 });
    expect(prisma.club_subscription_freezes.findMany.mock.calls[0][0].where).toEqual({
      subscription: { member_id: 15 },
    });
  });

  it('limits notifications to the signed-in member and their branch', async () => {
    const { prisma, service } = setup();
    prisma.club_content_items.findMany.mockResolvedValue([]);

    await service.notifications(90, 15, '500');

    expect(prisma.club_notifications.findMany).toHaveBeenCalledWith({
      where: { member_id: 15, status: { in: ['sent', 'read'] } },
      orderBy: { id: 'desc' },
      take: 100,
    });
    expect(prisma.club_content_items.findMany.mock.calls[0][0].where.OR).toEqual([
      { branch_id: null },
      { branch_id: 2 },
    ]);
  });

  it('returns only active about-app content', async () => {
    const { prisma, service } = setup();
    prisma.club_content_items.findMany.mockResolvedValue([]);

    await expect(service.about()).resolves.toEqual({ data: [], updatedAt: null });
    expect(prisma.club_content_items.findMany).toHaveBeenCalledWith({
      where: {
        content_type: 'app_home_section',
        metadata: { path: '$.documentType', equals: 'about_app' },
        is_active: true,
        is_deleted: false,
      },
      orderBy: [{ sort_order: 'asc' }, { id: 'desc' }],
    });
  });

  it('filters the trainer directory by exact trainer titles and branch', async () => {
    const { prisma, service } = setup();
    prisma.club_trainers.findMany.mockResolvedValue([
      {
        id: 1,
        employee_id: 10,
        name: 'Coach A',
        specialization: 'مدرب لياقة',
        experience: '5 years',
        bio: null,
        image_url: null,
        rating_avg: { toString: () => '4.5' },
      },
      {
        id: 2,
        employee_id: 11,
        name: 'Nutritionist',
        specialization: 'أخصائي تغذية',
        experience: null,
        bio: null,
        image_url: null,
        rating_avg: { toString: () => '5' },
      },
    ]);
    prisma.employees.findMany.mockResolvedValue([
      {
        id: 10,
        employee: 'Coach A',
        mosma_wazefy_n: 'مدرب لياقة',
        branch_id_fk: 2,
        personal_photo: '/coach.jpg',
      },
      {
        id: 11,
        employee: 'Nutritionist',
        mosma_wazefy_n: 'أخصائي تغذية',
        branch_id_fk: 2,
        personal_photo: null,
      },
    ]);

    const result = await service.trainers('2');

    expect(result.count).toBe(1);
    expect(result.data[0]).toMatchObject({
      id: 1,
      jobTitle: 'مدرب لياقة',
      branchId: 2,
    });
  });

  it('calculates the signed-in member points from the immutable ledger', async () => {
    const { prisma, service } = setup();
    prisma.club_member_points_transactions.aggregate
      .mockResolvedValueOnce({ _sum: { points: 250 } })
      .mockResolvedValueOnce({ _sum: { points: 300 } })
      .mockResolvedValueOnce({ _sum: { points: -50 } });

    await expect(service.points(90, 15)).resolves.toEqual({
      memberId: 15,
      balance: 250,
      totalEarned: 300,
      totalRedeemed: 50,
    });
    expect(prisma.club_member_points_transactions.aggregate.mock.calls[0][0].where).toEqual({
      member_id: 15,
    });
  });

  it('lists only active app-visible subscription types available for the requested branch', async () => {
    const { prisma, service } = setup();
    prisma.club_subscription_types.findMany.mockResolvedValue([{
      id: 3,
      name: 'Quarterly',
      name_ar: 'اشتراك 3 شهور',
      name_en: 'Quarterly',
      description: 'Package',
      branch_id: null,
      apply_to_all_branches: true,
      branches: [],
      price: { toString: () => '3000.00' },
      min_price: null,
      days: 90,
      duration_value: 3,
      duration_type: 'months',
      package_category: 'regular',
      package_type: null,
      is_special_offer: false,
      is_for_students: false,
      offer_validity: null,
      availability_from: null,
      availability_to: null,
      invitations_count: 2,
      inbody_count: 1,
      wallet_points: 300,
      is_linked_to_sessions: false,
      sessions_count: null,
      allow_multiple_daily_entries: false,
      attendance_count: null,
      max_classes_per_day: null,
      is_linked_to_freeze: true,
      freeze_days: 2,
      min_freeze: 3,
      includes_spa: true,
      spa_count: 1,
      valid_upgrade_duration: null,
      access_area_ids: [],
      benefits: { freeze: 2 },
      week_planner: {},
      created_at: new Date('2026-07-01T00:00:00Z'),
      updated_at: new Date('2026-07-01T00:00:00Z'),
    }]);

    const result = await service.subscriptionTypes('2');

    expect(result).toEqual({
      data: [expect.objectContaining({
        id: 3,
        name: 'اشتراك 3 شهور',
        price: 3000,
        walletPoints: 300,
        availableForAllBranches: true,
      })],
      count: 1,
    });
    const where = prisma.club_subscription_types.findMany.mock.calls[0][0].where;
    expect(where).toEqual(expect.objectContaining({ is_active: true, show_in_app: true }));
    expect(where.AND[2].OR).toEqual([
      { apply_to_all_branches: true },
      { branch_id: 2 },
      { branches: { some: { branch_id: 2 } } },
    ]);
  });
});
