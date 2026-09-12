import assert from 'node:assert/strict';
import test from 'node:test';
import { canUseTableOutputAction } from './export-permission.ts';

const routeMap = {
  '/club/members': ['club.members', 'mos.membershipManagement.membersData'],
};

test('blocks Excel export when a page-specific resource denies it', () => {
  assert.equal(
    canUseTableOutputAction({
      pathname: '/club/members',
      action: 'export',
      routeMap,
      grantedKeys: ['club.members:export'],
      isReady: true,
      hasError: false,
      superAdmin: false,
    }),
    false,
  );
});

test('blocks printing even when every resource grants it', () => {
  assert.equal(
    canUseTableOutputAction({
      pathname: '/club/members',
      action: 'print',
      routeMap,
      grantedKeys: ['club.members:print', 'mos.membershipManagement.membersData:print'],
      isReady: true,
      hasError: false,
      superAdmin: false,
    }),
    false,
  );
});

test('keeps output unavailable while permission data is loading or failed', () => {
  for (const [isReady, hasError] of [
    [false, false],
    [true, true],
  ]) {
    assert.equal(
      canUseTableOutputAction({
        pathname: '/club/members',
        action: 'export',
        routeMap,
        grantedKeys: ['club.members:export', 'mos.membershipManagement.membersData:export'],
        isReady,
        hasError,
        superAdmin: false,
      }),
      false,
    );
  }
});

test('blocks output for super-admins and unmapped utility pages too', () => {
  assert.equal(
    canUseTableOutputAction({
      pathname: '/club/members',
      action: 'export',
      routeMap,
      grantedKeys: [],
      isReady: false,
      hasError: true,
      superAdmin: true,
    }),
    false,
  );
  assert.equal(
    canUseTableOutputAction({
      pathname: '/utility',
      action: 'print',
      routeMap,
      grantedKeys: [],
      isReady: true,
      hasError: false,
      superAdmin: false,
    }),
    false,
  );
});
