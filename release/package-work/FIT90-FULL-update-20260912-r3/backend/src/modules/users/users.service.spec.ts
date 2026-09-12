import { UsersService } from './users.service';

describe('UsersService.remove', () => {
  it('removes the user’s legacy permissions, RBAC roles, and RBAC exceptions together', async () => {
    const legacyPermissions = { operation: 'legacy-permissions' };
    const rbacRoles = { operation: 'rbac-roles' };
    const rbacExceptions = { operation: 'rbac-exceptions' };
    const deleteUser = { operation: 'delete-user' };
    const prisma = {
      users: {
        findUnique: jest.fn().mockResolvedValue({ user_id: 45 }),
        delete: jest.fn().mockReturnValue(deleteUser),
      },
      permissions: { deleteMany: jest.fn().mockReturnValue(legacyPermissions) },
      rbac_user_roles: { deleteMany: jest.fn().mockReturnValue(rbacRoles) },
      rbac_user_exceptions: { deleteMany: jest.fn().mockReturnValue(rbacExceptions) },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    const permissionEngine = { invalidateUser: jest.fn() };
    const service = new UsersService(prisma as any, permissionEngine as any);

    await service.remove(45);

    expect(prisma.$transaction).toHaveBeenCalledWith([
      legacyPermissions,
      rbacRoles,
      rbacExceptions,
      deleteUser,
    ]);
    expect(permissionEngine.invalidateUser).toHaveBeenCalledWith(45);
  });
});

describe('UsersService.update', () => {
  it('keeps the linked employee when editing a staff user without choosing a new employee', async () => {
    const prisma = {
      users: {
        findUnique: jest.fn().mockResolvedValue({ user_id: 45, level: 2 }),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({ user_id: 45, username: 'new-user', level: 2 }),
      },
      employees: { findFirst: jest.fn() },
    };
    const service = new UsersService(prisma as any, { invalidateUser: jest.fn() } as any);

    await service.update(45, { username: 'new-user', level: 2 });

    expect(prisma.employees.findFirst).not.toHaveBeenCalled();
  });
});
