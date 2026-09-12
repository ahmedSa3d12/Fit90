import assert from 'node:assert/strict';
import test from 'node:test';
import { canConvertLead } from './lead-conversion.ts';

test('allows conversion only for a lead with a phone that was not converted yet', () => {
  assert.equal(canConvertLead({ phone: '01012345678', status: 'new' }), true);
  assert.equal(canConvertLead({ phone: null, status: 'new' }), false);
  assert.equal(canConvertLead({ phone: '01012345678', status: 'converted' }), false);
});
