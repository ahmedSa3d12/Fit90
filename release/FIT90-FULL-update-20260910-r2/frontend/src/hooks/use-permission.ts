import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { api } from '@/lib/api';
import { canAccessRoute } from '@/lib/route-permission';
import { useAuth } from '@/store/auth';

export interface MyPermissions {
  superAdmin: boolean;
  keys: string[];
  routeMap: Record<string, string | string[]>;
  scope: Record<string, string>;
}

export interface NavApiNode {
  key: string;
  nameAr: string;
  nameEn: string | null;
  route: string | null;
  icon: string | null;
  type: 'module' | 'group' | 'page';
  clickable: boolean;
  children: NavApiNode[];
}

export interface WorkspaceConfig {
  homeRoute: string;
  roleHint: string;
  widgets: string[];
}

/** The user's resolved permission set (cached; refetched on auth changes). */
export function useMyPermissions() {
  const status = useAuth((s) => s.status);
  return useQuery({
    queryKey: ['me', 'permissions'],
    queryFn: async () => (await api.get<MyPermissions>('/me/permissions')).data,
    enabled: status === 'authenticated',
    staleTime: 60_000,
  });
}

export function useNav() {
  const status = useAuth((s) => s.status);
  return useQuery({
    queryKey: ['me', 'nav'],
    queryFn: async () => (await api.get<NavApiNode[]>('/me/nav')).data,
    enabled: status === 'authenticated',
    staleTime: 60_000,
  });
}

export function useWorkspace() {
  const status = useAuth((s) => s.status);
  return useQuery({
    queryKey: ['me', 'workspace'],
    queryFn: async () => (await api.get<WorkspaceConfig>('/me/workspace')).data,
    enabled: status === 'authenticated',
    staleTime: 60_000,
  });
}

/** Role-aware landing route — super-admin → /dashboard, others → their workspace home. */
export function useHomeRoute() {
  const { data, isLoading } = useWorkspace();
  return {
    homeRoute: data?.homeRoute ?? '/profile',
    isLoading,
  };
}

export interface PermissionApi {
  /** True if the user holds `${resourceKey}:${action}` (or is super-admin). */
  can: (key: string) => boolean;
  /** Effective permission keys returned for the signed-in user. */
  keys: string[];
  /** True if the user holds View on the resource that owns `route` (unmapped routes are open). */
  canRoute: (pathname: string) => boolean;
  /** True only when a mapped route has an explicit View permission. */
  canMenuRoute: (pathname: string) => boolean;
  superAdmin: boolean;
  isReady: boolean;
  /** Permissions endpoint failed — routes stay blocked until retry succeeds. */
  hasError: boolean;
  retry: () => void;
  routeMap: Record<string, string | string[]>;
}

/** Synchronous permission helpers for components and the route guard. */
export function usePermission(): PermissionApi {
  const { data, isLoading, isError, refetch } = useMyPermissions();
  const keys = useMemo(() => new Set(data?.keys ?? []), [data]);
  const routeMap = data?.routeMap ?? {};

  const can = useCallback(
    (key: string) => !!data?.superAdmin || keys.has(key),
    [data?.superAdmin, keys],
  );

  const canRoute = useCallback(
    (pathname: string) => {
      if (!data) return false;
      return canAccessRoute({
        pathname,
        routeMap,
        grantedKeys: data.keys,
        superAdmin: data.superAdmin,
        allowUnmapped: true,
      });
    },
    [data, routeMap],
  );

  const canMenuRoute = useCallback(
    (pathname: string) => {
      if (!data) return false;
      return canAccessRoute({
        pathname,
        routeMap,
        grantedKeys: data.keys,
        superAdmin: data.superAdmin,
        allowUnmapped: false,
      });
    },
    [data, routeMap],
  );

  return {
    can,
    keys: data?.keys ?? [],
    canRoute,
    canMenuRoute,
    superAdmin: !!data?.superAdmin,
    isReady: !isLoading && (!!data || isError),
    hasError: isError,
    retry: () => void refetch(),
    routeMap,
  };
}
