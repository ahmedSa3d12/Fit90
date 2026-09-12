import { formatNum } from '@/lib/formatters';
import type { Locale } from '@/store/locale';
import type { RbacAction, RbacNode } from '@/types/rbac';

/** Localized catalog node title (Arabic / English from RBAC catalog). */
export function rbacNodeName(node: Pick<RbacNode, 'nameAr' | 'nameEn'>, locale: Locale): string {
  if (locale === 'en' && node.nameEn) return node.nameEn;
  return node.nameAr;
}

/** Localized matrix action column label. */
export function rbacActionLabel(action: Pick<RbacAction, 'labelAr' | 'labelEn'>, locale: Locale): string {
  return locale === 'en' ? action.labelEn : action.labelAr;
}

/** Localized role display name. */
export function rbacRoleName(
  role: { nameAr: string; nameEn?: string | null },
  locale: Locale,
): string {
  if (locale === 'en' && role.nameEn) return role.nameEn;
  return role.nameAr;
}

/** Unsaved-change hint beside the matrix toolbar. */
export function unsavedChangesHint(count: number, locale: Locale, ui: (text: string) => string): string {
  const n = formatNum(count, locale);
  if (locale === 'en') return `(${n} unsaved changes)`;
  return `(${n} ${ui('تغيير غير محفوظ')})`;
}
