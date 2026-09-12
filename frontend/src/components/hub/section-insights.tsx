import { ClubDashboardBody } from '@/components/hub/club-dashboard-body';
import { SettingsDashboardBody } from '@/components/hub/settings-dashboard-body';
import { HrSectionDashboard } from '@/pages/dashboard';

export function SectionDashboard({ sectionId }: { sectionId: string }) {
  switch (sectionId) {
    case 'club':
      return <ClubDashboardBody embedded />;
    case 'hr':
      return <HrSectionDashboard />;
    case 'settings':
      return <SettingsDashboardBody />;
    default:
      return null;
  }
}
