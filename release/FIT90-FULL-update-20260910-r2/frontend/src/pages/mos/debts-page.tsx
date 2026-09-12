import { ClubSubscriptionsPage } from '@/pages/club/subscriptions';
import { PageHeader } from '@/components/common/page-header';
import { mosMenuLabel } from '@/lib/mos-menu-utils';
import { useLocale } from '@/store/locale';

export function MosDebtsPage() {
  const { t } = useLocale();
  const title = mosMenuLabel(t, 'debts');

  return (
    <div className="space-y-6">
      <PageHeader title={title} />
      <ClubSubscriptionsPage singleView="outstanding" />
    </div>
  );
}
