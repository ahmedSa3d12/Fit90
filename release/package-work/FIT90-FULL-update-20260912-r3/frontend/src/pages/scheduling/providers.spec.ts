import assert from 'node:assert/strict';
import test from 'node:test';
import { providerJobTitleForCategory } from '../../lib/provider-job-title.ts';

test('uses the spa-specialist job title for Spa providers', () => {
  assert.equal(providerJobTitleForCategory('spa'), 'أخصائي سبا');
});

test('keeps the existing provider titles for nutrition and personal training', () => {
  assert.equal(providerJobTitleForCategory('nutrition'), 'أخصائي تغذية');
  assert.equal(providerJobTitleForCategory('personal_training'), 'مدرب');
});

test('uses the general provider roster only for categories without a job-title rule', () => {
  assert.equal(providerJobTitleForCategory('classes'), null);
});
