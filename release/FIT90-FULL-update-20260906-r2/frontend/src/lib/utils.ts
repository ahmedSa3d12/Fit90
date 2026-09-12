import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { Locale } from '@/store/locale';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Convert a #RRGGBB hex to an rgba() string with the given alpha. */
export function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Convert Western digits to Arabic-Indic for Arabic locale display. */
const arabicDigits = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
const LOCALE_KEY = 'one80_locale';

export function toArabicDigits(value: string | number): string {
  // Use Western digits consistently across the application, including Arabic screens.
  // Normalize any existing Arabic-Indic digits so imported values render the same way.
  return String(value).replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));
}

export function formatDigits(value: string | number, locale: Locale = 'ar'): string {
  return locale === 'ar' ? toArabicDigits(value) : String(value);
}

/** @deprecated Use formatDigits(value, locale) */
export { toArabicDigits as toLocaleDigits };

export function initials(name?: string | null, locale: Locale = 'ar'): string {
  const fallback = locale === 'ar' ? '؟' : '?';
  if (!name) return fallback;
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return fallback;
  if (parts.length === 1) return parts[0].slice(0, 2);
  return (parts[0][0] ?? '') + (parts[1][0] ?? '');
}
