import { ClubWellnessService } from './club-wellness.service';

describe('ClubWellnessService InBody nutrition plans', () => {
  const measurement = {
    id: 7,
    member_id: 46,
    measurement_date: '2026-07-21',
    weight: null,
    body_fat: null,
    muscle_mass: null,
    bmi: null,
    staff_name: null,
    file_url: null,
    notes: null,
    nutrition_plan: null,
    created_at: new Date(),
    updated_at: new Date(),
  };

  it('returns the member name and code in the measurements table', async () => {
    const prisma: any = {
      club_inbody_measurements: {
        findMany: jest.fn().mockResolvedValue([measurement]),
        count: jest.fn().mockResolvedValue(1),
      },
      club_members: {
        findMany: jest.fn().mockResolvedValue([{ id: 46, name: 'Ali', member_code: 'A000046', phone: '01007699116' }]),
      },
    };
    const service = new ClubWellnessService(prisma, {} as any, {} as any);

    const result = await service.listInbodyMeasurements({ page: 1, pageSize: 20, skip: 0, take: 20 } as any);

    expect(result.data[0]).toEqual(expect.objectContaining({
      memberId: 46,
      memberName: 'Ali',
      memberCode: 'A000046',
      memberPhone: '01007699116',
    }));
  });

  it('saves a structured nutrition plan on the InBody measurement', async () => {
    const prisma: any = {
      club_inbody_measurements: {
        findUnique: jest.fn().mockResolvedValue(measurement),
        update: jest.fn().mockResolvedValue(measurement),
      },
      club_members: {
        findUnique: jest.fn().mockResolvedValue({ id: 46, name: 'Ali', member_code: 'A000046', phone: '01007699116' }),
      },
    };
    const service = new ClubWellnessService(prisma, {} as any, {} as any);

    await service.updateInbodyNutritionPlan(7, {
      goal: 'خسارة وزن',
      dailyCalories: 1800,
      waterLiters: 3,
      notes: 'متابعة أسبوعية',
      fileUrl: 'club/nutrition/nutrition-plan.pdf',
      meals: [{ name: 'الإفطار', time: '08:00', foods: 'بيض وخبز', notes: 'بدون سكر' }],
    });

    expect(prisma.club_inbody_measurements.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: {
        nutrition_plan: expect.objectContaining({
          goal: 'خسارة وزن',
          dailyCalories: 1800,
          waterLiters: 3,
          notes: 'متابعة أسبوعية',
          fileUrl: 'club/nutrition/nutrition-plan.pdf',
          meals: [{ name: 'الإفطار', time: '08:00', foods: 'بيض وخبز', notes: 'بدون سكر' }],
        }),
      },
    });
  });
});
