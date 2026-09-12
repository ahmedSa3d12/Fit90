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

/**
 * Output actions are disabled system-wide. This stays separate from RBAC so
 * even a system administrator cannot re-enable Excel export or browser print.
 */
export function canUseTableOutputAction(input: TableOutputPermissionInput): boolean {
  void input;
  return false;
}
