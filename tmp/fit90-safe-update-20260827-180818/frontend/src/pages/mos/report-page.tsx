import type { ColumnDef } from '@tanstack/react-table';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DataTable } from '@/components/common/data-table';
import { StatCard } from '@/components/common/stat-card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { downloadCsv, ReportShell } from '@/components/reports/report-shell';
import { useClubT } from '@/hooks/use-club-t';
import { api } from '@/lib/api';
import { mosMenuLabel } from '@/lib/mos-menu-utils';
import { useLocale } from '@/store/locale';
import { listQueryToApiParams, useListQuery } from '@/lib/use-list-query';
import { localizeMosReportLabel, localizeMosReportValue } from '@/lib/mos-report-labels';
import { MosReportChart } from './mos-report-chart';

interface ReportPayload {
  key: string;
  title: string;
  summary: Record<string, number | string>;
  columns: { key: string; label: string }[];
  rows: Record<string, unknown>[];
  total?: number;
  page?: number;
  pageSize?: number;
}

const REPORTS_WITH_SEARCH = new Set([
  'all',
  'birthdays',
  'benefitsConsumption',
  'salesCommission',
  'customPackagesCommission',
]);
const REPORTS_WITHOUT_DATE_FILTER = new Set(['birthdays', 'packagesUntil']);

export function MosReportPage({ reportKey, titleKey }: { reportKey: string; titleKey: string }) {
  const ct = useClubT();
  const { locale, t } = useLocale();
  const title = mosMenuLabel(t, titleKey) || reportKey;
  const { params, setParams } = useListQuery();
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['mos-report', reportKey, params, dateFrom, dateTo],
    queryFn: async () => {
      const { data: res } = await api.get<ReportPayload>(`/club-mos/reports/${reportKey}`, {
        params: {
          ...listQueryToApiParams(params),
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
        },
      });
      return res;
    },
  });

  const columns = useMemo<ColumnDef<Record<string, unknown>>[]>(() => {
    const reportColumns: ColumnDef<Record<string, unknown>>[] = (data?.columns ?? []).map((c) => ({
        accessorKey: c.key,
        header: localizeMosReportLabel(locale, c.key, c.label),
        cell: ({ getValue }) => {
          const v = getValue();
          return localizeMosReportValue(locale, v);
        },
      }));

    return reportColumns;
  }, [data?.columns, locale]);

  const exportCsv = () => {
    if (!data?.columns?.length) return;
    const headers = data.columns.map((c) => localizeMosReportLabel(locale, c.key, c.label));
    const rows: (string | number)[][] = (data.rows ?? []).map((r) =>
      data.columns.map((c) => {
        const v = r[c.key];
        if (v == null) return '';
        if (typeof v === 'number') return v;
        if (typeof v === 'string') return localizeMosReportValue(locale, v);
        return JSON.stringify(v);
      }),
    );
    downloadCsv(`mos-${reportKey}.csv`, [headers, ...rows]);
  };

  const stats = data?.summary ? Object.entries(data.summary).slice(0, 4) : [];

  return (
    <ReportShell
      title={title}
      description={t('nav.mos.reports')}
      onExport={data?.rows?.length ? exportCsv : undefined}
      extraActions={
        reportKey === 'expenses' ? (
          <Button variant="brand" asChild>
            <Link to="/mos/accounts/expenses">
              <Plus className="size-4" />
              {locale === 'ar' ? 'إضافة مصروف' : 'Add expense'}
            </Link>
          </Button>
        ) : undefined
      }
      filters={REPORTS_WITHOUT_DATE_FILTER.has(reportKey) ? undefined : (
        <div className="flex flex-wrap items-end gap-4">
          <div className="grid gap-2">
            <Label>{ct('common.dateFrom')}</Label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>{ct('common.dateTo')}</Label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
          <Button variant="brand" onClick={() => void refetch()}>{ct('common.search')}</Button>
        </div>
      )}
      stats={
        stats.length > 0
          ? stats.map(([k, v]) => (
              <StatCard
                key={k}
                title={localizeMosReportLabel(locale, k)}
                value={localizeMosReportValue(locale, v)}
              />
            ))
          : undefined
      }
    >
      {data && !['profit', 'newRenewed', 'salesPersonClosingRatio', 'salesCommission', 'customPackagesCommission', 'multipleAttendancePerDay', 'overAttendance', 'benefitsConsumption'].includes(reportKey) && (
        <div className="mb-6"><MosReportChart reportKey={reportKey} data={data} locale={locale} /></div>
      )}
      <DataTable
        columns={columns}
        data={data?.rows ?? []}
        total={data?.total ?? data?.rows?.length ?? 0}
        page={params.page}
        pageSize={params.pageSize}
        onPageChange={(p) => setParams({ page: p })}
        onPageSizeChange={(s) => setParams({ pageSize: s, page: 1 })}
        search={REPORTS_WITH_SEARCH.has(reportKey) ? params.search : undefined}
        onSearchChange={
          REPORTS_WITH_SEARCH.has(reportKey)
            ? (s) => setParams({ search: s, page: 1 })
            : undefined
        }
        searchPlaceholder={
          reportKey === 'birthdays'
            ? (locale === 'ar' ? 'بحث باسم العضو…' : 'Search by member name…')
            : reportKey === 'customPackagesCommission'
            ? (locale === 'ar' ? 'بحث باسم المدرب…' : 'Search by trainer name…')
            : reportKey === 'salesCommission'
              ? (locale === 'ar' ? 'بحث باسم موظف المبيعات…' : 'Search by sales employee name…')
              : undefined
        }
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
      />
    </ReportShell>
  );
}
