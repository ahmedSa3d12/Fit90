import { buildMosClubModule } from './mos-rbac.builder';

describe('buildMosClubModule', () => {
  it('groups membership debts and member reports under Membership Management with stable resource keys', () => {
    const module = buildMosClubModule();
    const membership = module.children?.find((node) => node.key === 'mos.membershipManagement');

    expect(membership?.children).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ route: '/mos/debts', key: 'mos.extra.debts' }),
        expect.objectContaining({ route: '/mos/reports/blockedMembers', key: 'mos.reports.blockedMembers' }),
        expect.objectContaining({ route: '/mos/reports/members', key: 'mos.reports.members' }),
      ]),
    );
  });
});
