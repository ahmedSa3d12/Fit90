import assert from 'node:assert/strict';
import test from 'node:test';
import { potentialLeadToMemberPrefill } from './member-potential-prefill.ts';

test('copies the available potential-member fields into a new member form', () => {
  const prefill = potentialLeadToMemberPrefill({
    id: 14,
    name: 'Roda',
    phone: '01275053220',
    email: 'roda@example.com',
    gender: 'female',
    branchId: 3,
    sourceId: 8,
    assignedTo: 21,
    notes: 'Called yesterday',
  });

  assert.deepEqual(prefill, {
    name: 'Roda',
    email: 'roda@example.com',
    gender: 'female',
    branchId: 3,
    sourceId: '8',
    salesId: 21,
    notes: 'Called yesterday',
  });
});
