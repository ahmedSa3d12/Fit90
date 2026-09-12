import type { MosMenuItem } from '@/lib/mos-menu';

export function mosMenuLabel(t: (key: string) => string, key: string): string {
  if (!key) return '';
  const label = t(`nav.mos.${key}`);
  return label !== `nav.mos.${key}` ? label : key.replace(/_/g, ' ');
}

export function filterMosMenu(items: MosMenuItem[], canRoute: (path: string) => boolean): MosMenuItem[] {
  return items
    .map((item) => {
      if (item.children?.length) {
        const children = filterMosMenu(item.children, canRoute);
        if (!children.length) return null;
        return { ...item, children };
      }
      if (item.path && !canRoute(item.path.split('?')[0] ?? item.path)) return null;
      return item;
    })
    .filter(Boolean) as MosMenuItem[];
}

/** A permissioned sidebar stays empty until its permission set is available. */
export function visibleMosMenu(
  items: MosMenuItem[],
  permissionsReady: boolean,
  canRoute: (path: string) => boolean,
): MosMenuItem[] {
  return permissionsReady ? filterMosMenu(items, canRoute) : [];
}

/** Flatten menu leaves for active-path matching. */
export function mosMenuPaths(items: MosMenuItem[]): string[] {
  const out: string[] = [];
  for (const item of items) {
    if (item.path) out.push(item.path);
    if (item.children) out.push(...mosMenuPaths(item.children));
  }
  return out;
}

function pathMatchesLocation(menuPath: string, pathname: string, search: string): boolean {
  const q = search || '';
  const full = pathname + q;
  const [base, query] = menuPath.split('?');
  if (query) return full === menuPath;
  if (pathname === base) return !q;
  return pathname.startsWith(base + '/');
}

export function activeMosMenuPath(pathname: string, items: MosMenuItem[], search = ''): string {
  const paths = mosMenuPaths(items).sort((a, b) => b.length - a.length);
  return paths.find((p) => pathMatchesLocation(p, pathname, search)) ?? '';
}

/** Branch keys that must stay open to reveal `activePath`. */
export function ancestorBranchKeys(activePath: string, items: MosMenuItem[]): string[] {
  if (!activePath) return [];
  const keys: string[] = [];

  const walk = (nodes: MosMenuItem[], trail: string[]): boolean => {
    for (const node of nodes) {
      const nextTrail = [...trail, node.key];
      if (node.path === activePath) {
        keys.push(...trail);
        return true;
      }
      if (node.children?.length && walk(node.children, nextTrail)) {
        keys.push(...trail);
        return true;
      }
    }
    return false;
  };

  walk(items, []);
  return [...new Set(keys)];
}

export function hasActiveInTree(item: MosMenuItem, activePath: string): boolean {
  if (!activePath) return false;
  if (item.path === activePath) return true;
  return (item.children ?? []).some((c) => hasActiveInTree(c, activePath));
}

/** Branch keys from root down to `key` (inclusive). */
export function branchPathToKey(key: string, items: MosMenuItem[], trail: string[] = []): string[] | null {
  for (const node of items) {
    const path = [...trail, node.key];
    if (node.key === key) return path;
    if (node.children?.length) {
      const found = branchPathToKey(key, node.children, path);
      if (found) return found;
    }
  }
  return null;
}

/** Accordion toggle: only one open branch chain at a time across all levels. */
export function toggleMosBranch(
  openKeys: Set<string>,
  key: string,
  item: MosMenuItem,
  activePath: string,
  menuRoot: MosMenuItem[],
): Set<string> {
  const selfActive = hasActiveInTree(item, activePath);
  const pathToKey = branchPathToKey(key, menuRoot) ?? [key];

  if (openKeys.has(key) && !selfActive) {
    return new Set(ancestorBranchKeys(activePath, menuRoot));
  }

  return new Set(pathToKey);
}

/** Filter menu tree by search query (matches localized label). */
export function searchMosMenu(
  items: MosMenuItem[],
  query: string,
  labelOf: (key: string) => string,
): MosMenuItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;

  const walk = (nodes: MosMenuItem[]): MosMenuItem[] => {
    const out: MosMenuItem[] = [];
    for (const node of nodes) {
      const label = labelOf(node.key).toLowerCase();
      if (node.children?.length) {
        const children = walk(node.children);
        if (children.length || label.includes(q)) {
          out.push({ ...node, children: children.length ? children : node.children });
        }
      } else if (label.includes(q)) {
        out.push(node);
      }
    }
    return out;
  };

  return walk(items);
}
