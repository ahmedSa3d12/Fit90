import { WorkspaceService } from './workspace.service';

describe('WorkspaceService', () => {
  it('opens the private Spa dashboard for a Spa specialist account', async () => {
    const engine: any = {
      getEffective: jest.fn().mockResolvedValue({ superAdmin: false, keys: new Set() }),
    };
    const prisma: any = {
      users: { findUnique: jest.fn().mockResolvedValue({ emp_code: 19, level: 2 }) },
      employees: { findUnique: jest.fn().mockResolvedValue({ mosma_wazefy_n: 'اخصائى سبا' }) },
    };

    const workspace = await new WorkspaceService(engine, prisma).getWorkspace(90);

    expect(workspace).toEqual({
      homeRoute: '/spa/dashboard',
      roleHint: 'spa_specialist',
      widgets: ['spa_schedule', 'spa_bookings', 'spa_target'],
    });
  });
});
