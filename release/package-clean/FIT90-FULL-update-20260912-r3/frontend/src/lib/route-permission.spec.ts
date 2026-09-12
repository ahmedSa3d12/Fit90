import assert from 'node:assert/strict';
import test from 'node:test';
import { canAccessRoute } from './route-permission.ts';

test('does not allow an unmapped route to appear in a permissioned menu', () => {
  assert.equal(
    canAccessRoute({
      pathname: '/employees',
      routeMap: {},
      grantedKeys: [],
      superAdmin: false,
      allowUnmapped: false,
    }),
    false,
  );
});

test('allows only a mapped route with its explicit view permission in a menu', () => {
  assert.equal(
    canAccessRoute({
      pathname: '/employees',
      routeMap: { '/employees': ['employees.list'] },
      grantedKeys: ['employees.list:view'],
      superAdmin: false,
      allowUnmapped: false,
    }),
    true,
  );
});

test('keeps unmapped personal utility routes available outside the menu', () => {
  assert.equal(
    canAccessRoute({
      pathname: '/profile',
      routeMap: {},
      grantedKeys: [],
      superAdmin: false,
      allowUnmapped: true,
    }),
    true,
  );
});
