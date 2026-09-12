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
  assert.equal(translateUiText('بحث في الجدول…', 'en', map), 'Search table…');
  assert.equal(
    translateUiText('اكتب الاسم أو الموبايل أو الكود أو الباركود ثم اضغط زر الإدخال', 'en', map),
    'Enter the name, mobile number, code, or barcode, then press Enter.',
  );
  assert.equal(translateUiText('إيصال اليوم', 'en', map), "Today's receipts");
});

test('translates every Spa specialist dashboard label into English', () => {
  const map = uiMap as Record<string, string>;

  assert.equal(translateUiText('لوحة أخصائي السبا', 'en', map), 'Spa Specialist Dashboard');
  assert.equal(translateUiText('جدولك وحجوزات جلسات السبا والتارجت الخاص بك', 'en', map), 'Your schedule, Spa session bookings, and personal target');
  assert.equal(translateUiText('تارجت الجلسات', 'en', map), 'Session Target');
  assert.equal(translateUiText('تم تحقيق', 'en', map), 'Achieved');
  assert.equal(translateUiText('مواعيد الجدول', 'en', map), 'Scheduled Appointments');
  assert.equal(translateUiText('جلسات مكتملة', 'en', map), 'Completed Sessions');
  assert.equal(translateUiText('جلسات متبقية', 'en', map), 'Remaining Sessions');
  assert.equal(translateUiText('جدول وحجوزات الشهر', 'en', map), 'Monthly Schedule & Bookings');
  assert.equal(translateUiText('لا توجد مواعيد سبا خلال الشهر المحدد', 'en', map), 'No Spa appointments for the selected month');
});

test('translates the Spa booking calendar summary and instruction', () => {
  const map = uiMap as Record<string, string>;

  assert.equal(translateUiText('إجمالي المواعيد', 'en', map), 'Total Appointments');
  assert.equal(
    translateUiText('اضغط على أي موعد للحجز أو التعديل أو إدارة حجوزاته.', 'en', map),
    'Select any appointment to book, edit, or manage its bookings.',
  );
});
