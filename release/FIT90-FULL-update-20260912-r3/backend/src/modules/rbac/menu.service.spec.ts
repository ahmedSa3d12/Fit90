import { MenuService } from './menu.service';

describe('MenuService', () => {
  it('returns the complete page tree to a level-1 system administrator without page grants', async () => {
    const prisma = {
      users: { findUnique: jest.fn().mockResolvedValue({ level: 1 }) },
      permissions: { findMany: jest.fn().mockResolvedValue([]) },
      pages: {
        findMany: jest.fn().mockResolvedValue([
          { page_id: 1, page_title: 'لوحة المعلومات', page_link: '/dashboard', page_icon_code: 'home', page_order: 1, group_id_fk: 0, bg_color: null, color: null },
          { page_id: 2, page_title: 'الموظفون', page_link: '/employees', page_icon_code: 'users', page_order: 2, group_id_fk: 1, bg_color: null, color: null },
        ]),
      },
    };
    const service = new MenuService(prisma as never);

    await expect(service.getMenu(7)).resolves.toEqual([
      {
        id: 1,
        title: 'لوحة المعلومات',
        link: '/dashboard',
        icon: 'home',
        order: 1,
        bgColor: null,
        color: null,
        children: [
          {
            id: 2,
            title: 'الموظفون',
            link: '/employees',
            icon: 'users',
            order: 2,
            bgColor: null,
            color: null,
            children: [],
          },
        ],
      },
    ]);
    expect(prisma.permissions.findMany).not.toHaveBeenCalled();
  });
});
