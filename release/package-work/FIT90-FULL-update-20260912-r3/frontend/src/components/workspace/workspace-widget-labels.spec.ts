import assert from 'node:assert/strict';
import test from 'node:test';
import { workspaceWidgetTitle } from './workspace-widget-labels.ts';

test('resolves workspace widget titles using the active locale translation', () => {
  const title = workspaceWidgetTitle('treasury_today', (text) =>
    text === 'خزينة اليوم' ? "Today's treasury" : text,
  );

  assert.equal(title, "Today's treasury");
  assert.equal(workspaceWidgetTitle('treasury_today', (text) => text), 'خزينة اليوم');
  assert.equal(workspaceWidgetTitle('pos_shift', (text) => text), 'وردية نقطة البيع');
});
