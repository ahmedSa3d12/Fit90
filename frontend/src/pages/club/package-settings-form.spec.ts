import assert from 'node:assert/strict';
import test from 'node:test';
import { hasRequiredSubscriptionTypeFields } from './package-settings-form.ts';

test('allows saving a subscription type without the legacy package type', () => {
  assert.equal(
    hasRequiredSubscriptionTypeFields({
      nameAr: 'ذهبية',
      nameEn: 'Gold',
      durationValue: '30',
      price: '500',
      packageType: '',
    }),
    true,
  );
});
