import type { ColumnDef } from '@tanstack/react-table';
import { useQuery } from '@tanstack/react-query';
import { Banknote, CreditCard, Wallet } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/common/data-table';
import { PageHeader } from '@/components/common/page-header';
import { StatCard } from '@/components/common/stat-card';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useClubT } from '@/hooks/use-club-t';
import { useBranches } from '@/hooks/use-branches';
import { api, apiError } from '@/lib/api';
import { formatMoney, localToday } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import { SELECT_CLS } from '../club/fitness/shared';

type Method = 'cash' | 'card' | 'other';

interface ClosingSummary {
  cash?: number;
  card?: number;
  other?: number;
  byMethod?: { method: string; expected?: number; count?: number }[];
}

interface ClosingRecord {
  id: number;
  closingDate?: string;
  totalCash?: number;
  totalCard?: number;
  totalOther?: number;
  notes?: string;
  [k: string]: unknown;
}

const METHOD_META: { key: Method; label: string; icon: JSX.Element; colorIndex: number }[] = [
  { key: 'cash', label: 'Cash', icon: <Banknote className="size-5" />, colorIndex: 0 },
  { key: 'card', label: 'Card', icon: <CreditCard className="size-5" />, colorIndex: 3 },
  { key: 'other', label: 'Other', icon: <Wallet className="size-5" />, colorIndex: 5 },
];

export function MosClosingPage() {
  const ct = useClubT();
  const { t, locale } = useLocale();
  const { data: branches } = useBranches();

  const [date, setDate] = useState<string>(localToday());
  const [branchId, setBranchId] = useState<string>('');
  const [actual, setActual] = useState<Record<Method, string>>({ cash: '', card: '', other: '' });
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const summary = useQuery({
    queryKey: ['mos-closing-summary', date, branchId],
    queryFn: async () => {
      const { data } = await api.get<ClosingSummary>('/club-mos/closing/summary', {
        params: { date: date || undefined, branchId: branchId || undefined },
      });
      return data;
    },
    enabled: Boolean(date),
  });

  const recent = useQuery({
    queryKey: ['mos-closing-list'],
    queryFn: async () => {
      const { data } = await api.get<ClosingRecord[] | { data: ClosingRecord[] }>('/club-mos/closing');
      return Array.isArray(data) ? data : (data?.data ?? []);
    },
  });

  const expected = useMemo<Record<Method, number>>(() => {
    const s = summary.data;
    const byMethod = new Map(
      (s?.byMethod ?? []).map((m) => [m.method?.toLowerCase(), Number(m.expected) || 0]),
    );
    return {
      cash: s?.cash ?? byMethod.get('cash') ?? 0,
      card: s?.card ?? byMethod.get('card') ?? 0,
      other: s?.other ?? byMethod.get('other') ?? 0,
    };
  }, [summary.data]);

  const variance = (m: Method): number => (Number(actual[m]) || 0) - expected[m];

  const byMethodRows = useMemo(
    () =>
      METHOD_META.map((m) => ({
        method: m.label,
        expected: expected[m.key],
        actual: Number(actual[m.key]) || 0,
        variance: variance(m.key),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [expected, actual],
  );

  const byMethodColumns = useMemo<ColumnDef<(typeof byMethodRows)[number]>[]>(
    () => [
      { accessorKey: 'method', header: 'Method' },
      {
        accessorKey: 'expected',
        header: 'Expected',
        cell: ({ getValue }) => formatMoney(getValue() as number, undefined, locale),
      },
      {
        accessorKey: 'actual',
        header: 'Actual',
        cell: ({ getValue }) => formatMoney(getValue() as number, undefined, locale),
      },
      {
        accessorKey: 'variance',
        header: 'Variance',
        cell: ({ getValue }) => {
          const v = getValue() as number;
          return (
            <span className={cn(v < 0 ? 'text-destructive' : v > 0 ? 'text-emerald-600' : '')}>
              {formatMoney(v, undefined, locale)}
            </span>
          );
        },
      },
    ],
    [locale],
  );

  const recentColumns = useMemo<ColumnDef<ClosingRecord>[]>(
    () => [
      {
        accessorKey: 'closingDate',
        header: 'Date',
        cell: ({ getValue }) => (getValue() as string) || '—',
      },
      {
        accessorKey: 'totalCash',
        header: 'Cash',
        cell: ({ getValue }) => formatMoney(getValue() as number, undefined, locale),
      },
      {
        accessorKey: 'totalCard',
        header: 'Card',
        cell: ({ getValue }) => formatMoney(getValue() as number, undefined, locale),
      },
      {
        accessorKey: 'totalOther',
        header: 'Other',
        cell: ({ getValue }) => formatMoney(getValue() as number, undefined, locale),
      },
      {
        accessorKey: 'notes',
        header: ct('common.notes'),
        cell: ({ getValue }) => (getValue() as string) || '—',
      },
    ],
    [ct, locale],
  );

  const save = async () => {
    setSaving(true);
    try {
      await api.post('/club-mos/closing', {
        closingDate: date,
        branchId: branchId || undefined,
        totalCash: Number(actual.cash) || 0,
        totalCard: Number(actual.card) || 0,
        totalOther: Number(actual.other) || 0,
        notes: notes || undefined,
      });
      toast.success(ct('common.success'));
      setActual({ cash: '', card: '', other: '' });
      setNotes('');
      void recent.refetch();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={ct('mos.dailyClosing')}
        eyebrow={t('nav.sections.club')}
        description="Reconcile expected revenue against counted totals for the day."
      />

      <Card className="overflow-hidden border-border/60 shadow-sm">
        <div className="h-0.5 bg-gradient-to-l from-primary/50 via-primary to-primary/30" />
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-end gap-4">
            <div className="grid gap-1.5">
              <Label>{ct('mos.date')}</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>{ct('common.branch')}</Label>
              <select
                className={SELECT_CLS + ' w-48'}
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
              >
                <option value="">{ct('common.allBranches')}</option>
                {(branches ?? []).map((b) => (
                  <option key={b.id} value={String(b.id)}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <Button variant="brand" onClick={() => void summary.refetch()}>
              {ct('common.search')}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {METHOD_META.map((m) => (
          <StatCard
            key={m.key}
            title={`Expected ${m.label}`}
            value={formatMoney(expected[m.key], undefined, locale)}
            colorIndex={m.colorIndex}
            icon={m.icon}
            loading={summary.isLoading}
          />
        ))}
      </div>

      <Card className="overflow-hidden border-border/60 shadow-sm">
        <CardContent className="pt-6">
          <h2 className="mb-4 text-sm font-semibold">{ct('mos.countedTotals')}</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {METHOD_META.map((m) => {
              const v = variance(m.key);
              return (
                <div key={m.key} className="grid gap-1.5">
                  <Label>{m.label}</Label>
                  <Input
                    type="number"
                    value={actual[m.key]}
                    onChange={(e) =>
                      setActual((prev) => ({ ...prev, [m.key]: e.target.value }))
                    }
                    placeholder="0"
                  />
                  <p
                    className={cn(
                      'text-xs',
                      v < 0
                        ? 'text-destructive'
                        : v > 0
                          ? 'text-emerald-600'
                          : 'text-muted-foreground',
                    )}
                  >
                    Variance: {formatMoney(v, undefined, locale)}
                  </p>
                </div>
              );
            })}
          </div>
          <div className="mt-4 grid gap-1.5">
            <Label>{ct('common.notes')}</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>
          <div className="mt-4 flex justify-end">
            <Button variant="brand" disabled={saving} onClick={() => void save()}>
              {saving ? ct('common.saving') : 'Save closing'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-border/60 shadow-sm">
        <CardContent className="pt-6">
          <h2 className="mb-4 text-sm font-semibold">{ct('mos.byMethod')}</h2>
          <DataTable
            columns={byMethodColumns}
            data={byMethodRows}
            total={byMethodRows.length}
            page={1}
            pageSize={byMethodRows.length || 3}
            onPageChange={() => {}}
            isLoading={summary.isLoading}
            isError={summary.isError}
            onRetry={() => void summary.refetch()}
          />
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-border/60 shadow-sm">
        <CardContent className="pt-6">
          <h2 className="mb-4 text-sm font-semibold">{ct('mos.recentClosings')}</h2>
          <DataTable
            columns={recentColumns}
            data={recent.data ?? []}
            total={recent.data?.length ?? 0}
            page={1}
            pageSize={recent.data?.length || 10}
            onPageChange={() => {}}
            isLoading={recent.isLoading}
            isError={recent.isError}
            onRetry={() => void recent.refetch()}
          />
        </CardContent>
      </Card>
    </div>
  );
}
