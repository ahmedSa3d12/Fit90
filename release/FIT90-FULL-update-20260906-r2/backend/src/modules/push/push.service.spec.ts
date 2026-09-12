import { PushService } from './push.service';

describe('PushService staff notifications', () => {
  it('links the staff event to its title, body, and route', async () => {
    const prisma = {
      users: {
        findUnique: jest.fn().mockResolvedValue({ user_id: 7, device_token: '' }),
      },
      tbl_notifications: {
        create: jest.fn().mockResolvedValue({ id: 42 }),
      },
      users_notifications: {
        create: jest.fn().mockResolvedValue({ id: 9 }),
      },
    };
    const service = new PushService(prisma as never);

    const result = await service.sendToUsers(
      [7],
      'مهمة جديدة',
      'تم إسناد مهمة إليك',
      1,
      '/mos/tasks',
    );

    expect(result).toEqual({ sent: 0, skipped: 1 });
    expect(prisma.users_notifications.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        notify_id_fk: 42,
        url: '/mos/tasks',
        type: 1,
      }),
    });
    const call = prisma.users_notifications.create.mock.calls[0][0];
    expect(JSON.parse(call.data.message)).toEqual({
      title: 'مهمة جديدة',
      body: 'تم إسناد مهمة إليك',
      url: '/mos/tasks',
    });
  });
});
