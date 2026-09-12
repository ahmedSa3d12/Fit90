import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  it('promotes a general-manager account to system admin on login', async () => {
    const prisma = {
      users: {
        findFirst: jest.fn().mockResolvedValue({
          user_id: 7,
          username: 'dr.fadi elsewesy',
          password: await bcrypt.hash('102030', 4),
          approved: 1,
          level: 2,
          emp_code: 39,
          name: 'dr.fadi elsewesy',
          image: null,
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      employees: {
        findUnique: jest.fn().mockResolvedValue({
          branch_id_fk: 1,
          emp_type: 1,
          mosma_wazefy_code: 1,
        }),
      },
    };
    const jwt = { signAsync: jest.fn().mockResolvedValue('token') };
    const config = { get: jest.fn().mockReturnValue('secret') };
    const service = new AuthService(prisma as never, jwt as never, config as never);

    const result = await service.login('dr.fadi elsewesy', '102030');

    expect(result.user.level).toBe(1);
    expect(prisma.users.update).toHaveBeenCalledWith({
      where: { user_id: 7 },
      data: { level: 1 },
    });
  });
});
