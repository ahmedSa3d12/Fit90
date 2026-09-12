import { ClubTrainersService } from './club-trainers.service';

const trainerRow = {
  id: 1,
  employee_id: 10,
  name: 'أحمد',
  email: null,
  phone: '01000000000',
  specialization: 'مدرب',
  experience: null,
  bio: null,
  image_url: null,
  rating_avg: 0,
  is_active: true,
  created_at: new Date('2026-09-09T00:00:00.000Z'),
  updated_at: new Date('2026-09-09T00:00:00.000Z'),
};

describe('ClubTrainersService provider groups', () => {
  const employeeScope: any = { isSelfOnly: () => false };

  it('lists gym trainers only when their provider profile is linked to an employee', async () => {
    const prisma: any = {
      club_trainers: {
        findMany: jest.fn().mockResolvedValue([trainerRow]),
        count: jest.fn().mockResolvedValue(1),
      },
    };
    const service = new ClubTrainersService(prisma, employeeScope);

    await service.list({ page: 1, pageSize: 25, skip: 0, take: 25, providerType: 'gym' } as any);

    expect(prisma.club_trainers.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        AND: expect.arrayContaining([
          { is_deleted: false },
          { employee_id: { not: null } },
        ]),
      },
    }));
  });

  it('lists external trainers only when their provider profile is not linked to an employee', async () => {
    const prisma: any = {
      club_trainers: {
        findMany: jest.fn().mockResolvedValue([{ ...trainerRow, employee_id: null }]),
        count: jest.fn().mockResolvedValue(1),
      },
    };
    const service = new ClubTrainersService(prisma, employeeScope);

    await service.list({ page: 1, pageSize: 25, skip: 0, take: 25, providerType: 'external' } as any);

    expect(prisma.club_trainers.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        AND: expect.arrayContaining([
          { is_deleted: false },
          { employee_id: null },
        ]),
      },
    }));
  });

  it('creates missing SPA specialists as active providers', async () => {
    const spaEmployee = { id: 23, employee: 'منى', email: null, phone: '01011111111' };
    const prisma: any = {
      department_jobs: { findMany: jest.fn().mockResolvedValue([{ id: 6 }]) },
      employees: { findMany: jest.fn().mockResolvedValue([spaEmployee]) },
      club_trainers: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ ...trainerRow, id: 8, employee_id: 23, name: 'منى', specialization: 'أخصائي سبا' }),
      },
    };
    const service = new ClubTrainersService(prisma, employeeScope);

    const providers = await service.syncProvidersByJobTitle('أخصائي سبا');

    expect(prisma.club_trainers.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        employee_id: 23,
        name: 'منى',
        specialization: 'أخصائي سبا',
        is_active: true,
      }),
    });
    expect(providers).toEqual([expect.objectContaining({ id: 8, employeeId: 23 })]);
  });
});
