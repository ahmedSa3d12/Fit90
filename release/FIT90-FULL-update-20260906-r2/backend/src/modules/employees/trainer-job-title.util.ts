export function normalizeArabicJobTitle(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[ًٌٍَُِّْـ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ');
}

export function isTrainerJobTitle(value?: string | null): boolean {
  if (!value) return false;
  return normalizeArabicJobTitle(value).includes('مدرب');
}

export function isNutritionJobTitle(value?: string | null): boolean {
  if (!value) return false;
  const title = normalizeArabicJobTitle(value);
  return title.includes('اخصائي تغذيه') || title.includes('تغذيه');
}

export function isSalesJobTitle(value?: string | null): boolean {
  if (!value) return false;
  const title = normalizeArabicJobTitle(value);
  return title.includes('اخصائي مبيعات') || title.includes('موظف مبيعات') || title.includes('مندوب مبيعات');
}
