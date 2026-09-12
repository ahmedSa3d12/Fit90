import { Construction } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { PageHeader } from '@/components/common/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { mosMenuLabel } from '@/lib/mos-menu-utils';
import { MOS_MENU } from '@/lib/mos-menu';
import { useLocale } from '@/store/locale';
import { MosEntityCrudPage } from './entity-crud-page';
import { MosLookupPage } from './lookup-page';
import { MosReportPage } from './report-page';
import { MosReceiptsPage } from './receipts-page';
import { MosDebtsPage } from './debts-page';
import { MosTasksPage } from './tasks-page';
import { MosAboutPage, MosSalesSchedulePage } from './misc-pages';
import { MosCommissionPage } from './commission-page';
import { MosClosingPage } from './closing-page';
import { MosLeadsPage } from './leads-page';
import { MosApprovalsPage } from './approvals-page';
import { MosClassServicesPage } from './class-services-page';
import { MosFreePrivateTrainingPage } from './free-private-training-page';
import { MosCustomerMessagingPage } from './customer-messaging-page';
import { resolveMosRoute } from './route-config';

function findMenuKey(pathname: string): string | null {
  const all = MOS_MENU;
  let found: string | null = null;
  let bestLen = -1;
  const walk = (items: typeof MOS_MENU) => {
    for (const item of items) {
      if (item.path && (pathname === item.path || pathname.startsWith(item.path + '/'))) {
        if (item.path.length > bestLen) {
          bestLen = item.path.length;
          found = item.key;
        }
      }
      if (item.children) walk(item.children);
    }
  };
  walk(all);
  return found;
}

function MosFallback({ pathname }: { pathname: string }) {
  const { t } = useLocale();
  const key = findMenuKey(pathname);
  const title = key ? mosMenuLabel(t, key) : pathname;
  return (
    <div className="mx-auto max-w-lg space-y-6">
      <PageHeader title={title} eyebrow={t('nav.sections.club')} />
      <Card className="overflow-hidden border-dashed border-primary/20">
        <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
          <Construction className="size-10 text-primary" />
          <p className="text-sm text-muted-foreground">
            This screen is in the MOS menu. Data will appear as related club records are added.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export function MosRouterPage() {
  const { pathname } = useLocation();
  const route = resolveMosRoute(pathname);

  if (!route) return <MosFallback pathname={pathname} />;

  switch (route.kind) {
    case 'entity':
      return <MosEntityCrudPage config={route} />;
    case 'lookup':
      return <MosLookupPage config={route} />;
    case 'report':
      return <MosReportPage reportKey={route.reportKey} titleKey={route.titleKey} />;
    case 'receipts':
      return <MosReceiptsPage />;
    case 'debts':
      return <MosDebtsPage />;
    case 'tasks':
      return <MosTasksPage />;
    case 'schedule':
      return <MosSalesSchedulePage />;
    case 'commission':
      if (route.kind !== 'commission') break;
      return (
        <MosCommissionPage
          defaultKind={route.defaultKind}
          rulesFocus={route.rulesFocus}
          titleKey={route.titleKey}
        />
      );
    case 'closing':
      return <MosClosingPage />;
    case 'leads':
      return <MosLeadsPage />;
    case 'approvals':
      return <MosApprovalsPage />;
    case 'class-services':
      return <MosClassServicesPage />;
    case 'free-private-training':
      return <MosFreePrivateTrainingPage />;
    case 'customer-messaging':
      return <MosCustomerMessagingPage />;
    case 'about':
      return <MosAboutPage />;
    default:
      return <MosFallback pathname={pathname} />;
  }
}
