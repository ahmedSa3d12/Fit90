import { ForbiddenException } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import { MosEntityPermissionsGuard } from './mos-entity-permissions.guard';

function guardFor(allowedKeys: string[]) {
  const allowed = new Set(allowedKeys);
  return new MosEntityPermissionsGuard({
    canAny: async (_userId: number, candidates: string[]) => candidates.some((key) => allowed.has(key)),
  } as never);
}

function contextFor(key: string, method = 'GET') {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user: { sub: 86 }, params: { key }, method }),
    }),
  };
}

describe('MosEntityPermissionsGuard', () => {
  it('allows potential members when the user has its view permission', async () => {
    const guard = guardFor(['mos.extra.potMembers:view']);
    const context = {
      ...contextFor('leads'),
    };

    await expect(guard.canActivate(context as never)).resolves.toBe(true);
  });

  it('allows creating a call when the user has the calls-page create permission', async () => {
    const guard = guardFor(['mos.extra.calls:create']);

    await expect(guard.canActivate(contextFor('calls', 'POST') as never)).resolves.toBe(true);
  });

  it('does not allow potential-members permission to read calls', async () => {
    const guard = guardFor(['mos.extra.potMembers:view']);

    await expect(guard.canActivate(contextFor('calls') as never)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
