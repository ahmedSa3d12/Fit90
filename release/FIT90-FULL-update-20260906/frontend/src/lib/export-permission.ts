export type TableOutputAction = 'export' | 'print';

interface TableOutputPermissionInput {
  pathname: string;
  action: TableOutputAction;
  routeMap: Record<string, string | string[]>;
  grantedKeys: readonly string[];
  isReady: boolean;
  hasError: boolean;
  superAdmin: boolean;
}

function resourceKeysForPath(
  pathname: string,
  routeMap: Record<string, string | string[]>,
): string[] {
  let matchedKeys: string[] = [];
  let matchedLength = -1;

  for (const [route, resourceKeys] of Object.entries(routeMap)) {
    if ((pathname === route || pathname.startsWith(`${route}/`)) && route.length > matchedLength) {
      matchedKeys = Array.isArray(resourceKeys) ? resourceKeys : [resourceKeys];
      matchedLength = route.length;
    }
  }

  return matchedKeys;
}

/**
 * Resolves client-side output permission for the current route. When a route
 * belongs to more than one resource, every resource must explicitly allow the
 * action so a page-specific deny cannot be bypassed through a broad resource.
 */
export function canUseTableOutputAction({
  pathname,
  action,
  routeMap,
  grantedKeys,
  isReady,
  hasError,
  superAdmin,
}: TableOutputPermissionInput): boolean {
  if (superAdmin) return true;
  if (!isReady || hasError) return false;

  const resourceKeys = resourceKeysForPath(pathname, routeMap);
  if (!resourceKeys.length) return true;

  const granted = new Set(grantedKeys);
  return resourceKeys.every((resourceKey) => granted.has(`${resourceKey}:${action}`));
}
