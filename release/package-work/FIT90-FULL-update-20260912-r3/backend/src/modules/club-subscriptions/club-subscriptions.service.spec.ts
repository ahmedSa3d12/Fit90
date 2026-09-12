import { ClubSubscriptionsService } from './club-subscriptions.service';

describe('ClubSubscriptionsService.list', () => {
  it('includes the member code when building the subscription search filter', async () => {
    const prisma = {
      club_subscriptions: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      employees: { findMany: jest.fn().mockResolvedValue([]) },
      users: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new ClubSubscriptionsService(
      prisma as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { resolveListFilter: jest.fn().mockReturnValue(null) } as any,
    );

    await service.list({ search: 'MEM-204', page: 1, pageSize: 20, skip: 0, take: 20 } as any);

    expect(prisma.club_subscriptions.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            expect.objectContaining({
              OR: expect.arrayContaining([{ member: { member_code: { contains: 'MEM-204' } } }]),
            }),
          ]),
        }),
      }),
    );
  });
});
