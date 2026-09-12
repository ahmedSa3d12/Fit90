import assert from 'node:assert/strict';
import test from 'node:test';
import { leadDetailValue } from './lead-details.ts';

test('shows an em dash for a missing lead detail', () => {
  assert.equal(leadDetailValue(null), '—');
  assert.equal(leadDetailValue('   '), '—');
});

test('keeps supplied lead detail text', () => {
  assert.equal(leadDetailValue('lead@example.test'), 'lead@example.test');
});
