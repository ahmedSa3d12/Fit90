import assert from 'node:assert/strict';
import test from 'node:test';
import { memberPrimarySaveAction } from './member-form-actions.ts';

test('shows only the save-and-add-subscription action for a new member', () => {
  assert.equal(memberPrimarySaveAction(null), 'save-and-add-subscription');
});

test('keeps the save-changes action when editing an existing member', () => {
  assert.equal(memberPrimarySaveAction(42), 'save-changes');
});
