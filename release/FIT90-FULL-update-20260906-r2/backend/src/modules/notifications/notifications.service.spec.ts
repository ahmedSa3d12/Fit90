import { NotificationsService } from './notifications.service';

describe('NotificationsService staff inbox', () => {
  it('returns linked content and falls back to the sender for legacy events', async () => {
    const prisma = {
      tbl_notifications: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 2,
            from_user: 1,
            to_user: 7,
            n_code: null,
            seen: 0,
            date_ar: '2026-07-29',
            time_ar: '14:00',
          },
          {
            id: 1,
            from_user: 3,
            to_user: 7,
            n_code: null,
            seen: 0,
            date_ar: '2026-07-28',
            time_ar: '09:00',
          },
        ]),
      },
      tbl_sys_notifications_settings: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      users_notifications: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 10,
            notify_id_fk: 2,
            message: JSON.stringify({
              title: 'مهمة جديدة',
              body: 'راجع المهمة المرسلة',
              url: '/mos/tasks',
            }),
            url: '/mos/tasks',
          },
        ]),
      },
      users: {
        findMany: jest.fn().mockResolvedValue([
          { user_id: 1, name: 'مدير النظام' },
          { user_id: 3, name: 'موظف الاستقبال' },
        ]),
      },
    };
    const service = new NotificationsService(prisma as never);

    const result = await service.list(7);

    expect(result[0]).toMatchObject({
      id: 2,
      title: 'مهمة جديدة',
      body: 'راجع المهمة المرسلة',
      url: '/mos/tasks',
      read: false,
    });
    expect(result[1]).toMatchObject({
      id: 1,
      title: 'إشعار من موظف الاستقبال',
      body: '',
      url: null,
    });
  });
});
