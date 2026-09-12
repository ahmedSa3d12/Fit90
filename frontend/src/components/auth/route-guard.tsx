import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { ErrorState } from '@/components/common/states';
import { PageSkeleton } from '@/components/common/page-skeleton';
import { usePermission, useHomeRoute } from '@/hooks/use-permission';

/**
 * Blocks direct navigation to a page the user lacks View on. Waits for the permission
 * set to load (avoids a flash of forbidden content), then redirects mapped-but-denied
 * routes to /dashboard. Unmapped routes (utility pages) pass through.
 */
export function RouteGuard({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const { canRoute, isReady, hasError, retry } = usePermission();
  const { homeRoute, isLoading: homeLoading } = useHomeRoute();

  if (!isReady || homeLoading) return <PageSkeleton />;
  if (hasError) {
    return (
      <div className="p-6">
        <ErrorState onRetry={retry} />
      </div>
    );
  }
  if (!canRoute(pathname)) return <Navigate to={homeRoute} replace />;
  return <>{children}</>;
}
