import { format, parseISO, isValid } from 'date-fns';
import { ar, enUS } from 'date-fns/locale';
import { formatDigits } from '@/lib/utils';
import type { Locale } from '@/store/locale';

const STORAGE_KEY = 'one80_locale';

export function getStoredLocale(): Locale {
  try {
    const l = localStorage.getItem(STORAGE_KEY);
    return l === 'en' ? 'en' : 'ar';
  } catch {
    return 'ar';
  }
}

function dateFnsLocale(locale: Locale) {
  return locale === 'en' ? enUS : ar;
}

export function formatMoney(
  value: number | string | null | undefined,
  currency?: string,
  locale: Locale = getStoredLocale(),
): string {
  if (value == null || value === '') return '—';
  const n = typeof value === 'string' ? parseFloat(value) : value;
  if (Number.isNaN(n)) return '—';
  const numLocale = locale === 'en' ? 'en-US' : 'ar-EG';
  const curr = currency ?? (locale === 'en' ? 'EGP' : 'ج.م');
  const formatted = new Intl.NumberFormat(numLocale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
  return `${formatDigits(formatted, locale)} ${curr}`;
}

export function formatNum(
  value: number | string | null | undefined,
  locale: Locale = getStoredLocale(),
): string {
  if (value == null || value === '') return '—';
  const n = typeof value === 'string' ? parseFloat(value) : value;
  if (Number.isNaN(n)) return '—';
  const numLocale = locale === 'en' ? 'en-US' : 'ar-EG';
  return formatDigits(new Intl.NumberFormat(numLocale).format(n), locale);
}

/** YYYY-MM-DD from the LOCAL calendar day (never use toISOString().slice(0,10) — it shifts to UTC) */
export function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Today's date as YYYY-MM-DD in the user's local timezone */
export function localToday(): string {
  return localDateStr(new Date());
}

export function formatDate(
  value: string | Date | null | undefined,
  pattern = 'yyyy/MM/dd',
  locale: Locale = getStoredLocale(),
): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? parseISO(value) : value;
  if (!isValid(d)) return '—';
  return formatDigits(format(d, pattern, { locale: dateFnsLocale(locale) }), locale);
}

/** Hijri display placeholder — derived from Gregorian for UI parity with legacy dual-date fields */
export function formatHijriDisplay(
  gregorian: string | null | undefined,
  locale: Locale = getStoredLocale(),
): string {
  if (!gregorian) return '—';
  return formatDigits(gregorian, locale);
}

export function formatTime(
  value: string | null | undefined,
  locale: Locale = getStoredLocale(),
): string {
  if (!value) return '—';
  return formatDigits(value, locale);
}

/** 12-hour clock with localised AM/PM: "6:00 م" (ar) / "6:00 PM" (en). */
export function formatHm(
  value: string | null | undefined,
  locale: Locale = getStoredLocale(),
): string {
  if (!value) return '—';
  const [hStr, mStr = '00'] = value.split(':');
  const h = parseInt(hStr, 10);
  if (Number.isNaN(h)) return formatDigits(value, locale);
  const isAr = locale !== 'en';
  const meridiem = h < 12 ? (isAr ? 'ص' : 'AM') : (isAr ? 'م' : 'PM');
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const hm = `${h12}:${mStr.padStart(2, '0').slice(0, 2)}`;
  return `${formatDigits(hm, locale)} ${meridiem}`;
}
