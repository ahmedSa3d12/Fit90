import { INCOME_REPORTS } from './income.reports';

describe('medicalMembershipsIncome report', () => {
  it('counts receipts for subscriptions whose package category is medical', async () => {
    const prisma = {
      club_receipts: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 1,
            receipt_number: 'R-100',
            subscription_id: 10,
            member_name: 'Fallback member',
            amount: 250,
            receipt_date: '2026-07-29',
            subscription: {
              subscription_type: 'Clinic package',
              customer_name: 'Clinic member',
            },
          },
        ]),
      },
    };

    const result = await INCOME_REPORTS.medicalMembershipsIncome(
      prisma as never,
      {
        branchId: 2,
        dateFrom: '2026-07-01',
        dateTo: '2026-07-31',
        page: 1,
        pageSize: 20,
        skip: 0,
        take: 20,
      } as never,
    );

    expect(prisma.club_receipts.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          subscription: { is: { type: { is: { package_category: 'medical' } } } },
          branch_id: 2,
          receipt_date: { gte: '2026-07-01', lte: '2026-07-31' },
        },
      }),
    );
    expect(result.summary).toEqual({ total: 250, count: 1 });
    expect(result.rows).toEqual([
      {
        receiptNumber: 'R-100',
        subscriptionType: 'Clinic package',
        memberName: 'Clinic member',
        amount: 250,
        receiptDate: '2026-07-29',
      },
    ]);
  });
});
