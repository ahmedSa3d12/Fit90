/**
 * Builds the MOS-aligned RBAC resource tree from the sidebar menu snapshot.
 * Page keys reuse stable API keys (club.*, admin.*, employees.*) where controllers
 * already enforce them; MOS-only screens use hierarchical mos.* keys.
 */
import type { ActionKey, ResourceNode } from './rbac.catalog';
import { MOS_MENU_SNAPSHOT, type MosMenuSnapshotItem } from './mos-menu.snapshot';
import { MOS_LABELS_AR, MOS_LABELS_EN } from './mos-labels';

const ALL: ActionKey[] = [
  'view',
  'create',
  'update',
  'delete',
  'approve',
  'reject',
  'export',
  'print',
  'audit',
  'configure',
];
const LIST: ActionKey[] = ['view', 'create', 'update', 'delete', 'export', 'print', 'audit'];
const APPROVAL: ActionKey[] = [
  'view',
  'create',
  'update',
  'delete',
  'approve',
  'reject',
  'export',
  'print',
  'audit',
];
const REPORT: ActionKey[] = ['view', 'export', 'print'];
const SETTINGS: ActionKey[] = ['view', 'update', 'configure', 'audit'];
const RECORD: ActionKey[] = ['view', 'update', 'audit'];

/** Top-level group label overrides (MOS nav vs RBAC display). */
const GROUP_LABEL_OVERRIDES: Record<string, { ar: string; en: string }> = {
  admin: { ar: 'إدارة النظام', en: 'System Administration' },
};

/** Page label overrides where MOS nav text differs from RBAC screen title. */
const PAGE_LABEL_OVERRIDES: Record<string, { ar: string; en: string }> = {
  roles: { ar: 'الأدوار والصلاحيات', en: 'Roles & permissions' },
  gymSettings: { ar: 'بيانات الشركة', en: 'Company data' },
};

/** Routes that map to existing controller resource keys (stable DB/API keys). */
const LEGACY_ROUTE: Record<string, { key: string; actions: ActionKey[] }> = {
  '/dashboard': { key: 'club.dashboard', actions: REPORT },
  '/club/reception': { key: 'club.members', actions: LIST },
  '/club/members': { key: 'club.members', actions: LIST },
  '/club/members/attendance': { key: 'club.members', actions: LIST },
  '/club/subscriptions': { key: 'club.subscriptions', actions: APPROVAL },
  '/club/subscriptions/settings': { key: 'club.subscriptions', actions: APPROVAL },
  '/club/subscriptions/transfers': { key: 'club.subscriptions', actions: APPROVAL },
  '/club/subscriptions/member-form': { key: 'club.subscriptions', actions: SETTINGS },
  '/settings/customer-sources': { key: 'club.subscriptions', actions: LIST },
  '/club/lost-found': { key: 'club.lost_found', actions: LIST },
  '/club/fitness/classes': { key: 'club.fitness', actions: LIST },
  '/club/fitness/class-booking': { key: 'club.fitness', actions: LIST },
  '/club/fitness/spa-bookings': { key: 'club.fitness', actions: LIST },
  '/club/fitness/spa-services': { key: 'club.fitness', actions: LIST },
  '/club/fitness/scheduling': { key: 'club.fitness', actions: LIST },
  '/club/fitness/availability': { key: 'club.fitness', actions: LIST },
  '/club/fitness/inbody-bookings': { key: 'club.fitness', actions: LIST },
  '/club/fitness/inbody': { key: 'club.fitness', actions: LIST },
  '/club/fitness/trainers': { key: 'club.fitness', actions: LIST },
  '/employees': { key: 'employees.list', actions: LIST },
  '/employees/new': { key: 'employees.new', actions: LIST },
  '/org/branches': { key: 'org.branches', actions: LIST },
  '/org/job-titles': { key: 'org.departments', actions: LIST },
  '/club/subscriptions/refunds': { key: 'club.subscriptions', actions: APPROVAL },
  '/settings/gym-policies': { key: 'admin.gym-policies', actions: SETTINGS },
  '/settings/sales-staff': { key: 'club.subscriptions', actions: LIST },
  '/attendance': { key: 'attendance.board', actions: ['view', 'update', 'export', 'print', 'audit'] },
  '/admin/exceptions': { key: 'admin.exceptions', actions: ['view', 'manage', 'audit'] },
  '/admin/roles': { key: 'admin.roles', actions: ['view', 'manage', 'audit'] },
  '/users': { key: 'admin.users', actions: ['view', 'create', 'update', 'delete', 'audit'] },
  '/company': { key: 'admin.company', actions: RECORD },
  // These pages moved visually from Additional Management to App Management.
  // Preserve their existing permission keys so current role grants keep working.
  '/mos/management/faqs': { key: 'mos.additionalManagement.faqs', actions: LIST },
  '/mos/management/exercises': { key: 'mos.additionalManagement.exercises', actions: LIST },
  '/mos/management/gym-rules': { key: 'mos.additionalManagement.gymRules', actions: LIST },
  '/mos/management/notifications-Templates': {
    key: 'mos.additionalManagement.notificationsTemplates',
    actions: LIST,
  },
};

/** Extra system pages not in the MOS sidebar but still permissioned. */
const MOS_ADMIN_EXTRAS: MosMenuSnapshotItem[] = [
  { key: 'auditLog', path: '/admin/audit' },
  { key: 'formsSettings', path: '/settings/forms' },
];

const LEGACY_ROUTE_EXTRAS: Record<string, { key: string; actions: ActionKey[] }> = {
  '/admin/audit': { key: 'admin.audit', actions: ['view', 'export'] },
  '/settings/forms': { key: 'admin.forms', actions: SETTINGS },
};

const EXTRA_LABELS_AR: Record<string, string> = {
  auditLog: 'سجل التدقيق',
  formsSettings: 'إعدادات النماذج',
};
const EXTRA_LABELS_EN: Record<string, string> = {
  auditLog: 'Audit log',
  formsSettings: 'Forms settings',
};

function slugFromPath(path: string): string {
  const tail = path.split('/').filter(Boolean).pop() ?? 'page';
  return tail.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function itemKey(item: MosMenuSnapshotItem): string {
  if (item.key) return item.key;
  return item.path ? slugFromPath(item.path) : 'unnamed';
}

function hierarchicalKey(ancestors: string[], key: string): string {
  return `mos.${[...ancestors, key].join('.')}`;
}

function labelFor(key: string, fallback?: string): { ar: string; en: string } {
  const pageOverride = PAGE_LABEL_OVERRIDES[key];
  if (pageOverride) return pageOverride;
  const override = GROUP_LABEL_OVERRIDES[key];
  if (override) return override;
  return {
    ar: MOS_LABELS_AR[key] ?? EXTRA_LABELS_AR[key] ?? fallback ?? key,
    en: MOS_LABELS_EN[key] ?? EXTRA_LABELS_EN[key] ?? fallback ?? key,
  };
}

function actionsForMenuItem(
  topSection: string | null,
  ancestors: string[],
  key: string,
  path?: string,
): ActionKey[] {
  if (path && LEGACY_ROUTE[path]) return LEGACY_ROUTE[path].actions;
  if (path && LEGACY_ROUTE_EXTRAS[path]) return LEGACY_ROUTE_EXTRAS[path].actions;

  const section = topSection ?? ancestors[0] ?? '';
  if (section === 'reports' || ancestors.includes('reports')) return REPORT;
  if (section === 'dataList') return LIST;

  if (
    key === 'approveDecline' ||
    key === 'closingTransactions' ||
    key === 'employeesCommissions' ||
    path?.includes('approve-decline') ||
    path?.includes('closing-Transactions') ||
    path?.includes('Commissions')
  ) {
    return APPROVAL;
  }

  if (section === 'about') return RECORD;
  return LIST;
}

function resolveResourceKey(
  ancestors: string[],
  key: string,
  path: string | undefined,
  usedPageKeys: Set<string>,
): string {
  const legacy =
    (path && LEGACY_ROUTE[path]) || (path && LEGACY_ROUTE_EXTRAS[path]) || undefined;
  if (legacy && !usedPageKeys.has(legacy.key)) {
    usedPageKeys.add(legacy.key);
    return legacy.key;
  }
  const hKey = hierarchicalKey(ancestors, key);
  usedPageKeys.add(hKey);
  return hKey;
}

function walkMenu(
  items: MosMenuSnapshotItem[],
  ancestors: string[],
  topSection: string | null,
  usedPageKeys: Set<string>,
): ResourceNode[] {
  const nodes: ResourceNode[] = [];

  for (const item of items) {
    const key = itemKey(item);
    const labels = labelFor(key);
    const path = item.path;

    if (item.children?.length) {
      const childAncestors = [...ancestors, key];
      nodes.push({
        key: hierarchicalKey(ancestors, key),
        nameAr: labels.ar,
        nameEn: labels.en,
        type: ancestors.length === 0 ? 'group' : 'group',
        icon: item.icon,
        actions: ALL,
        children: walkMenu(item.children, childAncestors, topSection ?? key, usedPageKeys),
      });
      continue;
    }

    if (!path) continue;

    const resourceKey = resolveResourceKey(ancestors, key, path, usedPageKeys);
    nodes.push({
      key: resourceKey,
      nameAr: labels.ar,
      nameEn: labels.en,
      type: 'page',
      route: path,
      actions: actionsForMenuItem(topSection, ancestors, key, path),
    });
  }

  return nodes;
}

/** Full MOS club module for RESOURCE_TREE. */
export function buildMosClubModule(alreadyUsedKeys: Set<string> = new Set()): ResourceNode {
  const menu = [...MOS_MENU_SNAPSHOT];
  const adminIdx = menu.findIndex((m) => m.key === 'admin');
  if (adminIdx >= 0) {
    menu[adminIdx] = {
      ...menu[adminIdx],
      children: [...(menu[adminIdx].children ?? []), ...MOS_ADMIN_EXTRAS],
    };
  }

  const usedPageKeys = new Set(alreadyUsedKeys);

  return {
    key: 'mos',
    nameAr: 'إدارة النادي',
    nameEn: 'Club Management',
    type: 'module',
    icon: 'LayoutGrid',
    actions: ALL,
    children: walkMenu(menu, [], null, usedPageKeys),
  };
}
