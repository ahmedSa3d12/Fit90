import { ClubMembersService } from './club-members.service';

describe('ClubMembersService.create', () => {
  it('holds the member-code lock until the member row has been inserted', async () => {
    const order: string[] = [];
    const tx = {
      $queryRaw: async (parts: TemplateStringsArray) => {
        const sql = parts.join('');
        if (sql.includes('GET_LOCK')) order.push('lock');
        if (sql.includes('MAX(')) return [{ maxNum: 7 }];
        if (sql.includes('RELEASE_LOCK')) order.push('release');
        return [];
      },
      club_members: {
        create: async () => {
          order.push('create');
          return {
            id: 8,
            member_code: 'MIG-8',
            name: 'عضو تجريبي',
            phone: '01012345678',
            gender: 'male',
            branch_id: 1,
            is_active: true,
            is_deleted: false,
            created_at: new Date(),
            updated_at: new Date(),
          };
        },
      },
    };
    const prisma = {
      club_members: { findFirst: async () => null },
      tbl_branches: { findUnique: async () => ({ branch_id: 1 }) },
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    };
    const service = new ClubMembersService(
      prisma as any,
      { log: async () => undefined } as any,
      {} as any,
    );

    await service.create(
      {
        name: 'عضو تجريبي',
        phone: '01012345678',
        gender: 'male',
        branchId: 1,
        autoCreateUser: false,
      },
      { sub: 1 } as any,
    );

    expect(order).toEqual(['lock', 'create', 'release']);
  });
});
