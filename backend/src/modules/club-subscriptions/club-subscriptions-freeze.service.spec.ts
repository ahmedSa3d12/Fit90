import { ClubSubscriptionsService } from './club-subscriptions.service';

const activeSubscription = {
  id: 3,
  branch_id: 1,
  status: 'frozen',
  subscription_start_date: '2026-09-01',
  subscription_end_date: '2026-09-30',
  is_linked_to_sessions: false,
  sessions_count: null,
  sessions_used: null,
};

describe('ClubSubscriptionsService timed freezes', () => {
  it('automatically unfreezes the day after the selected end date and extends by the selected days', async () => {
    const prisma: any = {
      club_subscription_freezes: {
        findMany: jest.fn().mockResolvedValue([{ subscription_id: 3, freeze_end_date: '2026-09-16' }]),
        findFirst: jest.fn().mockResolvedValue({
          id: 8,
          subscription_id: 3,
          freeze_start_date: '2026-09-10',
          freeze_end_date: '2026-09-16',
          original_end_date: '2026-09-30',
          is_active: true,
        }),
        update: jest.fn(),
      },
      club_subscriptions: {
        findUnique: jest.fn().mockResolvedValue(activeSubscription),
        update: jest.fn().mockResolvedValue(activeSubscription),
      },
      $transaction: jest.fn(async (callback: (tx: any) => Promise<unknown>) => callback(prisma)),
    };
    const audit = { log: jest.fn() } as any;
    const service = new ClubSubscriptionsService(
      prisma,
      {} as any,
      {} as any,
      audit,
      {} as any,
      { isBranchAllowed: jest.fn().mockReturnValue(true) } as any,
    );

    await service.completeDueFreezes('2026-09-17');

    expect(prisma.club_subscription_freezes.update).toHaveBeenCalledWith({
      where: { id: 8 },
      data: { is_active: false, freeze_end_date: '2026-09-17', actual_days: 7 },
    });
    expect(prisma.club_subscriptions.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 3 },
      data: expect.objectContaining({ subscription_end_date: '2026-10-07', status: 'active' }),
    }));
  });
});
