import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';

test('selecting an administration expands every nested page group while preserving other administrations', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { expandSelectedModule } = await vite.ssrLoadModule('/src/lib/rbac-resolve.ts');
    const membership = {
      key: 'membership',
      type: 'module',
      nameAr: 'إدارة العضوية',
      nameEn: null,
      route: null,
      icon: null,
      sortOrder: 1,
      actions: ['view'],
      children: [
        {
          key: 'membership.members',
          type: 'group',
          nameAr: 'الأعضاء',
          nameEn: null,
          route: null,
          icon: null,
          sortOrder: 1,
          actions: [],
          children: [
            {
              key: 'membership.members.list',
              type: 'page',
              nameAr: 'بيانات الأعضاء',
              nameEn: null,
              route: '/members',
              icon: null,
              sortOrder: 1,
              actions: ['view'],
              children: [],
            },
          ],
        },
      ],
    };

    const next = expandSelectedModule(
      new Set(['membership', 'membership.members', 'finance', 'finance.invoices']),
      membership,
    );

    assert.deepEqual([...next].sort(), ['finance', 'finance.invoices']);
  } finally {
    await vite.close();
  }
});
