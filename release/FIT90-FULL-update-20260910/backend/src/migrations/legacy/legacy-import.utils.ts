const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const PHONE_PATTERN = /^(01\d{9}|201\d{9})$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function normalizeDigits(value: string): string {
  return value
    .replace(/[٠-٩]/g, (digit) => String(ARABIC_DIGITS.indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String(PERSIAN_DIGITS.indexOf(digit)));
}

export function normalizeLegacyText(value: unknown): string | null {
  if (value == null) return null;
  const normalized = String(value)
    .normalize('NFKC')
    .replace(/[\u00A0\u2000-\u200B\uFEFF]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized || null;
}

export function assertLocalDatabaseUrl(databaseUrl: string | undefined): void {
  if (!databaseUrl?.trim()) throw new Error('يجب ضبط اتصال قاعدة بيانات محلية');
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error('اتصال قاعدة البيانات غير صالح للاستخدام المحلي');
  }
  const host = url.hostname.toLowerCase();
  const databaseName = url.pathname.toLowerCase();
  if (!['localhost', '127.0.0.1', '[::1]', '::1'].includes(host)) {
    throw new Error('الاستيراد مسموح فقط على قاعدة بيانات محلية');
  }
  if (host.includes('prod') || databaseName.includes('prod') || databaseName.includes('production')) {
    throw new Error('لا يمكن تشغيل الاستيراد على بيئة إنتاج');
  }
}

export function normalizeEgyptPhone(value: unknown): string | null {
  const text = normalizeLegacyText(value);
  if (!text) return null;
  let phone = normalizeDigits(text).replace(/[\s\-()+]/g, '');
  if (!PHONE_PATTERN.test(phone)) return null;
  if (phone.startsWith('201')) phone = `0${phone.slice(2)}`;
  return /^01\d{9}$/.test(phone) ? phone : null;
}

function formatDate(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function parseLegacyDate(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return formatDate(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }
  if (typeof value === 'number' && Number.isFinite(value) && value > 1 && value < 100000) {
    const epoch = Date.UTC(1899, 11, 30);
    const date = new Date(epoch + Math.floor(value) * 86_400_000);
    return formatDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
  }
  const text = normalizeLegacyText(value);
  if (!text || !ISO_DATE_PATTERN.test(text)) return null;
  const [year, month, day] = text.split('-').map(Number);
  return formatDate(year, month, day);
}

export function escapeSpreadsheetFormula(value: string): string {
  return /^[=+@-]/.test(value) ? `'${value}` : value;
}
