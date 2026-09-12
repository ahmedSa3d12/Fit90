import type { ColumnDef } from '@tanstack/react-table';
import { Check, Sparkles, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/common/data-table';
import { PageHeader } from '@/components/common/page-header';
import { StatCard } from '@/components/common/stat-card';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useClubT } from '@/hooks/use-club-t';
import { api, apiError } from '@/lib/api';
import { usePaginatedList } from '@/lib/api-hooks';
import { mosMenuLabel } from '@/lib/mos-menu-utils';
import { useAuth } from '@/store/auth';
import { useLocale } from '@/store/locale';
import { useListQuery } from '@/lib/use-list-query';

type ApprovalRow = {
  id: number;
  title: string;
  entityType?: string | null;
  description?: string | null;
  status?: string;
  requestedBy?: string | null;
  reviewedBy?: string | null;
  createdAt?: string;
};

const TABS = [
  { value: 'pending', labelKey: 'mos.pending' },
  { value: 'approved', labelKey: 'mos.approved' },
  { value: 'declined', labelKey: 'mos.declined' },
  { value: 'all', labelKey: 'mos.all' },
] as const;

export function MosApprovalsPage() {
  const ct = useClubT();
  const { t } = useLocale();
  const { user } = useAuth();
  const title = mosMenuLabel(t, 'approveDecline');
  const { params, setParams } = useListQuery();
  const [tab, setTab] = useState<(typeof TABS)[number]['value']>('pending');

  const listParams = useMemo(
    () => ({ ...params, filters: { ...params.filters, ...(tab !== 'all' ? { status: tab } : {}) } }),
    [params, tab],
  );

  const { data, isLoading, isError, refetch } = usePaginatedList<ApprovalRow>(
    'club-mos/entities/approve-decline',
    listParams,
  );

  const rows = data?.data ?? [];
  const pending = rows.filter((r) => r.status === 'pending').length;

  const review = async (id: number, status: 'approved' | 'declined') => {
    try {
      await api.patch(`/club-mos/entities/approve-decline/${id}/${status}`, {
        reviewedBy: user?.name ?? 'Admin',
      });
      toast.success(ct('common.success'));
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const columns = useMemo<ColumnDef<ApprovalRow>[]>(
    () => [
      { accessorKey: 'title', header: ct('mos.title') },
      { accessorKey: 'entityType', header: ct('mos.type'), cell: ({ getValue }) => getValue() ?? '—' },
      { accessorKey: 'requestedBy', header: ct('mos.requestedBy'), cell: ({ getValue }) => getValue() ?? '—' },
      { accessorKey: 'status', header: ct('common.status') },
      {
        id: 'actions',
        header: ct('common.actions'),
        cell: ({ row }) =>
          row.original.status === 'pending' ? (
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="outline"
                className="h-8 border-emerald-500/40 text-emerald-600 hover:bg-emerald-500/10"
                onClick={() => void review(row.original.id, 'approved')}
              >
                <Check className="size-3.5" /> Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 border-destructive/40 text-destructive hover:bg-destructive/10"
                onClick={() => void review(row.original.id, 'declined')}
              >
                <X className="size-3.5" /> Decline
              </Button>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">{row.original.reviewedBy ?? '—'}</span>
          ),
      },
    ],
    [ct, user?.name],
  );

  return (
    <div className="space-y-6">
      <PageHeader title={title} eyebrow={t('nav.sections.club')} description="Review and action pending club requests." />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard title={ct('mos.pending')} value={pending} icon={<Sparkles className="size-5" />} />
        <StatCard title={ct('mos.totalLoaded')} value={rows.length} colorIndex={2} />
        <StatCard title={ct('mos.tab')} value={tab} colorIndex={3} />
      </div>

      <Card className="overflow-hidden border-border/60 shadow-sm">
        <div className="h-0.5 bg-gradient-to-l from-primary/50 via-primary to-primary/30" />
        <CardContent className="pt-6">
          <div className="mb-4 flex flex-wrap gap-2">
            {TABS.map((item) => (
              <Button
                key={item.value}
                size="sm"
                variant={tab === item.value ? 'brand' : 'outline'}
                onClick={() => setTab(item.value)}
              >
                {ct(item.labelKey)}
              </Button>
            ))}
          </div>
          <DataTable
            columns={columns}
            data={rows}
            total={data?.total ?? rows.length}
            page={params.page}
            pageSize={params.pageSize}
            onPageChange={(p) => setParams({ page: p })}
            onPageSizeChange={(s) => setParams({ pageSize: s, page: 1 })}
            search={params.search}
            onSearchChange={(s) => setParams({ search: s, page: 1 })}
            isLoading={isLoading}
            isError={isError}
            onRetry={() => void refetch()}
          />
        </CardContent>
      </Card>
    </div>
  );
}
