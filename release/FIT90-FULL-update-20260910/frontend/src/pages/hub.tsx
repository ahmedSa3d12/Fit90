import { useMemo } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/common/page-header';
import { QuickAccessGrid } from '@/components/hub/quick-access';
import { SectionDashboard } from '@/components/hub/section-insights';
import { useSectionQuickAccess } from '@/hooks/use-section-quick-access';
import { CLUB_ROUTES as CR } from '@/lib/club-routes';
import {
  NAV_SECTIONS,
  navSectionDescKey,
  translateNavRoute,
  navSectionKey,
  sectionRoutePaths,
  type NavSection,
} from '@/lib/nav';
import { usePermission } from '@/hooks/use-permission';
import { useLocale } from '@/store/locale';

/** Default shortcuts shown until the user builds visit history. */
const SECTION_FALLBACK: Record<string, string[]> = {
  club: [CR.members.reception, CR.members.management, CR.subscriptions.list, CR.lockers.list],
  hr: ['/employees', '/attendance', '/payroll/runs', '/reports'],
  settings: ['/users', '/admin/roles', '/settings/gym-policies', '/company'],
};

export function DepartmentHubPage() {
  const { section: sectionId } = useParams<{ section: string }>();
  const { t } = useLocale();
  const { canRoute, isReady } = usePermission();

  const section: NavSection | undefined = NAV_SECTIONS.find((s) => s.id === sectionId);
  if (!section) return <Navigate to="/dashboard" replace />;

  const allowed = useMemo(() => {
    const paths = sectionRoutePaths(section.id);
    if (!isReady) return paths;
    return paths.filter((to) => canRoute(to));
  }, [section.id, isReady, canRoute]);
  const fallback = SECTION_FALLBACK[section.id] ?? [];
  const quickRoutes = useSectionQuickAccess(section.id, allowed, fallback);
  const pinned = quickRoutes.map((to) => ({ to, label: translateNavRoute(t, to) }));

  const desc = t(navSectionDescKey(section.id));

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={t('nav.modules')}
        title={t(navSectionKey(section.id))}
        description={desc !== navSectionDescKey(section.id) ? desc : undefined}
      />

      {pinned.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-bold text-muted-foreground">{t('hub.quickActions')}</h2>
          <QuickAccessGrid items={pinned} />
        </section>
      )}

      <SectionDashboard sectionId={section.id} />
    </div>
  );
}
