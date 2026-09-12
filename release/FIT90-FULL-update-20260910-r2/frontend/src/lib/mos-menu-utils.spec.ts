import assert from 'node:assert/strict';
import test from 'node:test';
import { visibleMosMenu } from './mos-menu-utils.ts';

test('does not expose menu pages before permissions are ready', () => {
  const menu = [{ key: 'staffData', path: '/employees' }];

  assert.deepEqual(visibleMosMenu(menu, false, () => true), []);
});

test('keeps only pages allowed by the resolved permissions', () => {
  const menu = [
    { key: 'staffData', path: '/employees' },
    { key: 'members', path: '/club/members' },
  ];

  assert.deepEqual(visibleMosMenu(menu, true, (path) => path === '/club/members'), [
    { key: 'members', path: '/club/members' },
  ]);
});
