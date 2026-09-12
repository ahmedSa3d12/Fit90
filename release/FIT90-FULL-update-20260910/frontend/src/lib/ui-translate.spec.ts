import assert from 'node:assert/strict';
import test from 'node:test';
import uiMap from '../locales/ui-map.json' with { type: 'json' };
import { translateUiText } from './ui-translate.ts';

test('translates reception UI copy into English', () => {
  const map = uiMap as Record<string, string>;

  assert.equal(
    translateUiText('ابحث عن العضو — تفتح بطاقته مع الاشتراكات والإجراءات فورًا', 'en', map),
    'Find a member — open their profile, memberships, and actions instantly.',
  );
  assert.equal(translateUiText('بحث سريع عن العضو', 'en', map), 'Quick member search');
  assert.equal(
    translateUiText('اكتب الاسم أو الموبايل أو الكود أو الباركود ثم Enter', 'en', map),
    'Enter the name, mobile number, code, or barcode, then press Enter.',
  );
  assert.equal(translateUiText('إيصال اليوم', 'en', map), "Today's receipts");
});
