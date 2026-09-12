import { PermissionsGuard } from './permissions.guard';

describe('PermissionsGuard', () => {
  it('allows a level-1 user through a legacy page check without an explicit page grant', async () => {
    const reflector = {
      getAllAndOverride: jest
        .fn()
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(undefined)
        .mockReturnValueOnce('/employees'),
    };
    const prisma = { pages: { findFirst: jest.fn() }, permissions: { findUnique: jest.fn() } };
    const engine = { canAny: jest.fn() };
    const guard = new PermissionsGuard(reflector as never, prisma as never, engine as never);
    const context = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({ getRequest: () => ({ user: { sub: 7, level: 1 } }) }),
    };

    await expect(guard.canActivate(context as never)).resolves.toBe(true);
    expect(prisma.pages.findFirst).not.toHaveBeenCalled();
  });
});
