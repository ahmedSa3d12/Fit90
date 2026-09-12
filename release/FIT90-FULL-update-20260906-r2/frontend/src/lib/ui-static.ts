import uiMap from '@/locales/ui-map.json';
import { getStoredLocale } from '@/lib/formatters';
import { translateUiText } from '@/lib/ui-translate';

/** Translate Arabic UI copy using the current locale from localStorage (safe at module scope). */
export function uiStatic(text: string): string {
  if (!text) return text;
  try {
    return translateUiText(text, getStoredLocale(), uiMap as Record<string, string>);
  } catch {
    return text;
  }
}

/** Build select options with labels translated at read time. */
export function uiOptions<T extends string>(
  items: readonly { value: T; label: string }[],
): { value: T; label: string }[] {
  return items.map((item) => ({ ...item, label: uiStatic(item.label) }));
}

/** Build a list of translated labels. */
export function uiLabels(labels: readonly string[]): string[] {
  return labels.map((label) => uiStatic(label));
}
