import { useLocation } from 'react-router-dom';
import { canUseTableOutputAction } from '@/lib/export-permission';
import { usePermission } from '@/hooks/use-permission';

/** Output permissions for the resource that owns the current route. */
export function useOutputPermissions() {
  const { pathname } = useLocation();
  const permission = usePermission();
  const input = {
    pathname,
    routeMap: permission.routeMap,
    grantedKeys: permission.keys,
    isReady: permission.isReady,
    hasError: permission.hasError,
    superAdmin: permission.superAdmin,
  };

  return {
    canExport: canUseTableOutputAction({ ...input, action: 'export' }),
    canPrint: canUseTableOutputAction({ ...input, action: 'print' }),
  };
}
