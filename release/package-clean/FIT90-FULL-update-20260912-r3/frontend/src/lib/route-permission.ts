export interface RoutePermissionInput {
  pathname: string;
  routeMap: Record<string, string | string[]>;
  grantedKeys: readonly string[];
  superAdmin: boolean;
  allowUnmapped: boolean;
}

/** Resolves a route against the RBAC catalog with a caller-selected unmapped fallback. */
export function canAccessRoute({
  pathname,
  routeMap,
  grantedKeys,
  superAdmin,
  allowUnmapped,
}: RoutePermissionInput): boolean {
  if (superAdmin) return true;

  let bestKeys: string[] = [];
  let bestLen = -1;
  for (const [route, resourceKeys] of Object.entries(routeMap)) {
    const keysForRoute = Array.isArray(resourceKeys) ? resourceKeys : [resourceKeys];
    if ((pathname === route || pathname.startsWith(route + '/')) && route.length > bestLen) {
      bestLen = route.length;
      bestKeys = keysForRoute;
    }
  }

  if (!bestKeys.length) return allowUnmapped;
  return bestKeys.some((resourceKey) => grantedKeys.includes(`${resourceKey}:view`));
}
