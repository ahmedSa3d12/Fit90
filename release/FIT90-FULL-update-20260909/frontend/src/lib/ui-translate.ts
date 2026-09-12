import type { Locale } from '@/store/locale';

type PatternRule = [RegExp, (...groups: string[]) => string];

function translateLoadingFragment(ar: string): string {
  const map: Record<string, string> = {
    'التحميل': 'Loading',
    'التحميل…': 'Loading…',
    'الحفظ': 'Saving',
    'الحفظ…': 'Saving…',
    'الرفع': 'Uploading',
    'الرفع…': 'Uploading…',
  };
  if (map[ar]) return map[ar];
  return `Loading ${ar}`;
}

const DYNAMIC_PATTERNS: PatternRule[] = [
  [/^تمت إضافة (\d+) موعد$/, (n) => `${n} appointments added`],
  [/^تم نسخ (\d+) موعد$/, (n) => `${n} appointments copied`],
  [/^تم إلغاء الموعد وإشعار (\d+) عضو$/, (n) => `Appointment cancelled and ${n} members notified`],
  [/^تمت إضافة (\d+) موعد$/, (n) => `${n} slots added`],
  [/^تم نسخ (\d+) موعد$/, (n) => `${n} slots copied`],
  [/^تم إلغاء الموعد وإشعار (\d+) عضو$/, (n) => `Slot cancelled and ${n} members notified`],
  [/^يجب أن يكون غلق الحجز قبل بداية الكلاس يوم (.+) الساعة (.+)\.$/, (date, time) => `Booking must close before the class starts on ${date} at ${time}.`],
  [/^تمت إضافة (\d+) موعد$/, (n) => `${n} slots added`],
  [/^تم نسخ (\d+) موعد$/, (n) => `${n} slots copied`],
  [/^بحث في (.+)…$/, (x) => `Search in ${x}…`],
  [/^بحث ب(.+)…$/, (x) => `Search by ${x}…`],
  [/^بحث بال(.+)…$/, (x) => `Search by ${x}…`],
  [/^بحث (.+)…$/, (x) => `Search ${x}…`],
  [/^لا توجد بيانات في (.+)$/, (x) => `No data in ${x}`],
  [/^(.+) — قيد الإعداد على الخادم$/, (x) => `${x} — pending server setup`],
  [/^(.+) — الوحدة قيد الترحيل$/, (x) => `${x} — module pending migration`],
  [/^(.+) مطلوب$/, (x) => `${x} is required`],
  [/^إزالة (.+)$/, (x) => `Remove ${x}`],
  [/^الحد الأقصى (\d+) ميجابايت$/, (n) => `Maximum ${n} MB`],
  [/^جارٍ (.+)$/, (x) => translateLoadingFragment(x)],
  [/^مسموح \(موروث من: (.+)\)$/, (x) => `Allowed (inherited from: ${x})`],
  [/^رفض \(موروث من: (.+)\)$/, (x) => `Deny (inherited from: ${x})`],
  [/^سيتم حذف الدور «(.+)»\. لا يمكن حذف دور لديه مستخدمون\.$/, (x) => `Role «${x}» will be deleted. Roles with assigned users cannot be deleted.`],
  [/^(.+) \(نسخة\)$/, (x) => `${x} (copy)`],
  [/^هل تريد حذف «(.+)»؟$/, (x) => `Delete “${x}”?`],
  [/^هل تريد حذف الخدمة الإضافية «(.+)»؟$/, (x) => `Delete the additional service “${x}”?`],
  [/^مرحباً، (.+)$/, (x) => `Welcome, ${x}`],
  [/^موقع (.+)$/, (x) => `Location of ${x}`],
  [/^([\d,]+–[\d,]+) من ([\d,]+)$/, (a, b) => `${a} of ${b}`],
  [/^كود الموظف: (.+)$/, (x) => `Employee code: ${x}`],
];

/** Translate inline Arabic UI copy to English (exact map + dynamic patterns). */
export function translateUiText(
  text: string,
  locale: Locale,
  map: Record<string, string>,
): string {
  if (!text || locale === 'ar') return text;

  const exact = map[text];
  if (exact && exact !== text) return exact;

  for (const [re, build] of DYNAMIC_PATTERNS) {
    const match = text.match(re);
    if (match) return build(...match.slice(1));
  }

  return exact ?? text;
}
