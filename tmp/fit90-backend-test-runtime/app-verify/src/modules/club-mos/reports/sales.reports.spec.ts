import { SALES_REPORTS } from './sales.reports';

describe('customPackagesCommission report', () => {
  it('calculates paid membership commission per trainer employee', async () => {
    const prisma = {
      department_jobs: {
        findMany: jest.fn().mockResolvedValue([
          { id: 6 },
          { id: 13 },
        ]),
      },
      employees: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 10,
            emp_code: 1010,
            employee: 'Coach One',
            mosma_wazefy_n: 'مدرب',
            employee_target: 1000,
            employee_commission: 10,
          },
          {
            id: 20,
            emp_code: 2020,
            employee: 'Coach Two',
            mosma_wazefy_n: 'مدرب لياقة',
            employee_target: 2000,
            employee_commission: 5,
          },
        ]),
      },
      club_trainers: {
        findMany: jest.fn().mockResolvedValue([
          { id: 110, employee_id: 10 },
          { id: 120, employee_id: 20 },
        ]),
      },
      club_members: {
        findMany: jest.fn().mockResolvedValue([
          { id: 1, trainer_id: 110 },
          { id: 2, trainer_id: 120 },
        ]),
      },
      club_subscriptions: {
        findMany: jest.fn().mockResolvedValue([
          { member_id: 1, subscription_value: 1000, paid_amount: 400, remaining_amount: 600 },
          { member_id: 1, subscription_value: 500, paid_amount: 500, remaining_amount: 0 },
          { member_id: 2, subscription_value: 2000, paid_amount: 1000, remaining_amount: 1000 },
        ]),
      },
    };

    const result = await SALES_REPORTS.customPackagesCommission(
      prisma as never,
      {
        branchId: 1,
        dateFrom: '2026-07-01',
        dateTo: '2026-07-31',
        page: 1,
        pageSize: 25,
        skip: 0,
        take: 25,
      } as never,
    );

    expect(result.summary).toEqual({
      totalCommission: 140,
      totalTarget: 3000,
      totalCollected: 1900,
      trainersCount: 2,
    });
    expect(result).toMatchObject({ total: 2, page: 1, pageSize: 25 });
    expect(result.rows).toEqual([
      expect.objectContaining({
        trainer: 'Coach One',
        subscriptionsCount: 2,
        totalSales: 1500,
        collected: 900,
        commissionPercentage: 10,
        commission: 90,
      }),
      expect.objectContaining({
        trainer: 'Coach Two',
        subscriptionsCount: 1,
        totalSales: 2000,
        collected: 1000,
        commissionPercentage: 5,
        commission: 50,
      }),
    ]);
    expect(result.rows).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ trainer: 'Sales Employee' })]),
    );
    expect(prisma.club_subscriptions.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          member_id: { in: [1, 2] },
          branch_id: 1,
          registration_date: { gte: '2026-07-01', lte: '2026-07-31' },
        }),
      }),
    );
  });
});
