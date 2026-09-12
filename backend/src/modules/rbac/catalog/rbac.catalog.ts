import { buildMosClubModule } from './mos-rbac.builder';

/**
 * RBAC CATALOG — the single source of truth for the permissionable resource tree
 * and the standard action set. MOS club tree is generated from the sidebar menu
 * (frontend/src/lib/mos-menu.ts) via mos-rbac.builder.ts.
 *
 * Consumed by:
 *   - prisma/seed-rbac.ts          (seeds rbac_resources / rbac_actions / rbac_resource_actions)
 *   - controllers (@RequiresPermission keys must match resource `key`s here)
 *   - MenuService / MeController   (filtered nav + route→key map for the frontend)
 *
 * Keep keys STABLE — they are stored in the DB and referenced across the codebase.
 */

export type ActionKey =
  | 'view'
  | 'create'
  | 'update'
  | 'delete'
  | 'approve'
  | 'reject'
  | 'export'
  | 'print'
  | 'audit'
  | 'configure'
  | 'execute'
  | 'manage'
  | 'use';

export interface ActionDef {
  key: ActionKey;
  labelAr: string;
  labelEn: string;
  sensitive: boolean;
  sortOrder: number;
}

/** The fixed matrix columns + a few special actions (only shown where applicable). */
export const ACTIONS: ActionDef[] = [
  { key: 'view', labelAr: 'عرض', labelEn: 'View', sensitive: false, sortOrder: 1 },
  { key: 'create', labelAr: 'إضافة', labelEn: 'Create', sensitive: false, sortOrder: 2 },
  { key: 'update', labelAr: 'تعديل', labelEn: 'Update', sensitive: false, sortOrder: 3 },
  { key: 'delete', labelAr: 'حذف', labelEn: 'Delete', sensitive: true, sortOrder: 4 },
  { key: 'approve', labelAr: 'اعتماد', labelEn: 'Approve', sensitive: true, sortOrder: 5 },
  { key: 'reject', labelAr: 'رفض', labelEn: 'Reject', sensitive: true, sortOrder: 6 },
  { key: 'export', labelAr: 'تصدير', labelEn: 'Export', sensitive: false, sortOrder: 7 },
  { key: 'print', labelAr: 'طباعة', labelEn: 'Print', sensitive: false, sortOrder: 8 },
  { key: 'audit', labelAr: 'سجل التدقيق', labelEn: 'Audit', sensitive: false, sortOrder: 9 },
  { key: 'configure', labelAr: 'إعدادات', labelEn: 'Configure', sensitive: true, sortOrder: 10 },
  // Special actions — only attached to resources that need them.
  { key: 'execute', labelAr: 'تنفيذ', labelEn: 'Execute', sensitive: false, sortOrder: 11 },
  { key: 'manage', labelAr: 'إدارة', labelEn: 'Manage', sensitive: true, sortOrder: 12 },
  { key: 'use', labelAr: 'استخدام', labelEn: 'Use', sensitive: false, sortOrder: 13 },
];

export const SENSITIVE_ACTIONS = new Set<ActionKey>(
  ACTIONS.filter((a) => a.sensitive).map((a) => a.key),
);

/** Action presets by resource archetype (keeps the tree below readable). */
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
const RECORD: ActionKey[] = ['view', 'update', 'audit']; // single-record screens (e.g. company data)

export type ResType = 'module' | 'group' | 'page';

export interface ResourceNode {
  key: string;
  nameAr: string;
  nameEn?: string;
  type: ResType;
  route?: string;
  icon?: string;
  actions: ActionKey[];
  children?: ResourceNode[];
}

/** Collect page resource keys already defined in prior modules (avoids cross-module duplicates). */
export function collectPageKeys(tree: ResourceNode[]): Set<string> {
  const used = new Set<string>();
  const walk = (nodes: ResourceNode[]) => {
    for (const n of nodes) {
      if (n.type === 'page') used.add(n.key);
      if (n.children?.length) walk(n.children);
    }
  };
  walk(tree);
  return used;
}

/**
 * Resource tree. Modules carry the FULL standard action set so a top-level grant
 * inherits down per-action; pages carry a tailored subset (archetype preset).
 */
const HR_MODULE: ResourceNode = {
    key: 'hr',
    nameAr: 'الموارد البشرية',
    nameEn: 'HR',
    type: 'module',
    icon: 'Briefcase',
    actions: ALL,
    children: [
      {
        key: 'org',
        nameAr: 'الهيكل التنظيمي',
        nameEn: 'Organization',
        type: 'group',
        icon: 'Building2',
        actions: ALL,
        children: [
          { key: 'org.branches', nameAr: 'الفروع', nameEn: 'Branches', type: 'page', route: '/org/branches', actions: LIST },
          { key: 'org.departments', nameAr: 'المسميات الوظيفية', nameEn: 'Job titles', type: 'page', route: '/org/job-titles', actions: LIST },
        ],
      },
      {
        key: 'employees',
        nameAr: 'الموظفون',
        nameEn: 'Employees',
        type: 'group',
        icon: 'Users',
        actions: ALL,
        children: [
          { key: 'employees.list', nameAr: 'قائمة الموظفين', nameEn: 'Employees list', type: 'page', route: '/employees', actions: LIST },
          { key: 'employees.new', nameAr: 'إضافة موظف', nameEn: 'New employee', type: 'page', route: '/employees/new', actions: LIST },
        ],
      },
      {
        key: 'attendance',
        nameAr: 'الحضور والانصراف',
        nameEn: 'Attendance',
        type: 'group',
        icon: 'Fingerprint',
        actions: ALL,
        children: [
          { key: 'attendance.board', nameAr: 'لوحة الحضور', nameEn: 'Attendance board', type: 'page', route: '/attendance', actions: ['view', 'update', 'export', 'print', 'audit'] },
          { key: 'attendance.devices', nameAr: 'أجهزة البصمة', nameEn: 'Devices', type: 'page', route: '/attendance/devices', actions: LIST },
          { key: 'attendance.settings', nameAr: 'إعدادات الدوام', nameEn: 'Attendance settings', type: 'page', route: '/attendance/settings', actions: SETTINGS },
          { key: 'attendance.rules', nameAr: 'قواعد الدوام', nameEn: 'Attendance rules', type: 'page', route: '/attendance/rules', actions: SETTINGS },
        ],
      },
      {
        key: 'reports',
        nameAr: 'التقارير',
        nameEn: 'Reports',
        type: 'group',
        icon: 'BarChart3',
        actions: ['view', 'export', 'print', 'audit', 'configure'],
        children: [
          { key: 'reports.hub', nameAr: 'مركز التقارير', nameEn: 'Reports hub', type: 'page', route: '/reports', actions: REPORT },
        ],
      },
    ],
};

export const RESOURCE_TREE: ResourceNode[] = [
  HR_MODULE,
  buildMosClubModule(collectPageKeys([HR_MODULE])),
  {
    key: 'app-management',
    nameAr: 'إدارة التطبيق',
    nameEn: 'App Management',
    type: 'module',
    icon: 'Smartphone',
    actions: ALL,
    children: [
      { key: 'app-management.about', nameAr: 'عن التطبيق', nameEn: 'About App', type: 'page', route: '/app/about', actions: RECORD },
      { key: 'app-management.ads', nameAr: 'إدارة الإعلانات', nameEn: 'Ads', type: 'page', route: '/app/ads', actions: RECORD },
      { key: 'app-management.complaints', nameAr: 'الشكاوى والاقتراحات', nameEn: 'Complaints & Suggestions', type: 'page', route: '/app/complaints', actions: RECORD },
      { key: 'app-management.offers', nameAr: 'إدارة العروض', nameEn: 'Offers', type: 'page', route: '/app/offers', actions: RECORD },
      { key: 'app-management.invitations', nameAr: 'الدعوات', nameEn: 'Invitations', type: 'page', route: '/app/invitations', actions: RECORD },
    ],
  },
];

// ---------------------------------------------------------------------------------------
//  Derived helpers (pure)
// ---------------------------------------------------------------------------------------

export interface FlatResource {
  key: string;
  parentKey: string | null;
  nameAr: string;
  nameEn?: string;
  type: ResType;
  route?: string;
  icon?: string;
  actions: ActionKey[];
  sortOrder: number;
}

/** Depth-first flatten with parent links + stable sort order. */
export function flattenCatalog(tree: ResourceNode[] = RESOURCE_TREE): FlatResource[] {
  const out: FlatResource[] = [];
  const walk = (nodes: ResourceNode[], parentKey: string | null) => {
    nodes.forEach((n, i) => {
      out.push({
        key: n.key,
        parentKey,
        nameAr: n.nameAr,
        nameEn: n.nameEn,
        type: n.type,
        route: n.route,
        icon: n.icon,
        actions: n.actions,
        sortOrder: i + 1,
      });
      if (n.children?.length) walk(n.children, n.key);
    });
  };
  walk(tree, null);
  return out;
}

/** parentKey map for the inheritance engine: childKey -> parentKey|null. */
export function buildAncestry(flat: FlatResource[] = flattenCatalog()): Map<string, string | null> {
  return new Map(flat.map((r) => [r.key, r.parentKey]));
}

/** Map of React route -> resource keys (only permissioned routes; duplicates allowed). */
export function buildRouteMap(flat: FlatResource[] = flattenCatalog()): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const r of flat) {
    if (!r.route) continue;
    if (!map[r.route]) map[r.route] = [];
    if (!map[r.route].includes(r.key)) map[r.route].push(r.key);
  }
  return map;
}

/** Convenience: a permission key is `${resourceKey}:${actionKey}`. */
export const permKey = (resourceKey: string, action: ActionKey | string) =>
  `${resourceKey}:${action}`;
