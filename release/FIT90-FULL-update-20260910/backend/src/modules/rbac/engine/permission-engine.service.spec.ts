import { PermissionEngineService } from './permission-engine.service';

describe('PermissionEngineService', () => {
  it('applies an explicit deny to a user with a super-admin role', async () => {
    const cache = { get: jest.fn(), set: jest.fn(), invalidateUser: jest.fn(), invalidateUsers: jest.fn(), invalidateAll: jest.fn() };
    const prisma = {
      users: { findUnique: jest.fn().mockResolvedValue({ level: 2 }) },
      rbac_user_roles: {
        findMany: jest.fn().mockResolvedValue([{ role_id: 7, role: { is_super_admin: true } }]),
      },
      rbac_resources: {
        findMany: jest.fn().mockResolvedValue([{ id: 1, key: 'mos.membershipManagement.membersData' }]),
      },
      rbac_actions: { findMany: jest.fn().mockResolvedValue([{ id: 2, key: 'export' }]) },
      rbac_user_exceptions: {
        findMany: jest.fn().mockResolvedValue([{ resource_id: 1, action_id: 2, effect: 'deny' }]),
      },
    };
    const service = new PermissionEngineService(prisma as never, cache as never);

    const effective = await service.getEffective(41);

    expect(effective.superAdmin).toBe(false);
    expect(effective.keys.has('mos.membershipManagement.membersData:export')).toBe(false);
    expect(effective.keys.has('mos.membershipManagement.membersData:view')).toBe(true);
  });
});
