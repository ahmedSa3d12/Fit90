import type { ColumnDef } from '@tanstack/react-table';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Coins, Sparkles, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/common/data-table';
import { PageHeader } from '@/components/common/page-header';
import { StatCard } from '@/components/common/stat-card';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useClubT } from '@/hooks/use-club-t';
import { useBranches } from '@/hooks/use-branches';
import { api, apiError } from '@/lib/api';
import { confirm } from '@/lib/confirm';
import { mosMenuLabel } from '@/lib/mos-menu-utils';
import { formatMoney, formatNum, localToday } from '@/lib/formatters';
import { useLocale } from '@/store/locale';
import { SELECT_CLS } from '../club/fitness/shared';

const KIND_OPTIONS = [
  { value: 'sales_percentage', label: 'Sales — Percentage' },
  { value: 'sales_range', label: 'Sales — Range' },
  { value: 'sales_target', label: 'Sales — Target' },
  { value: 'trainer_percentage', label: 'Trainer — Percentage' },
  { value: 'trainer_range', label: 'Trainer — Range' },
  { value: 'trainer_target', label: 'Trainer — Target' },
  { value: 'instructor_class_rate', label: 'Instructor — Class Rate' },
  { value: 'package_commission', label: 'Package Commission' },
  { value: 'fixed_trainer_commission', label: 'Fixed Trainer Commission' },
] as const;

interface CommissionRow {
  personName?: string;
  base?: number;
  rate?: number;
  commission?: number;
  [k: string]: unknown;
}

interface CalcResponse {
  totalCommission?: number;
  total?: number;
  rows?: CommissionRow[];
}

interface CommissionRule {
  id: number;
  name?: string;
  isActive?: boolean;
  config?: Record<string, unknown>;
  [k: string]: unknown;
}

/** Config fields we render as numeric inputs (rules store the rest as-is). */
const RULE_NUMERIC_FIELDS = ['percentage', 'rate', 'amount', 'target', 'min', 'max'] as const;

function RuleEditor({ rule, onSaved }: { rule: CommissionRule; onSaved: () => void }) {
  const ct = useClubT();
  const [name, setName] = useState(rule.name ?? '');
  const [isActive, setIsActive] = useState(rule.isActive ?? true);
  const [config, setConfig] = useState<Record<string, string>>(() => {
    const cfg = rule.config ?? {};
    const out: Record<string, string> = {};
    for (const f of RULE_NUMERIC_FIELDS) {
      if (cfg[f] != null) out[f] = String(cfg[f]);
    }
    return out;
  });
  const [saving, setSaving] = useState(false);

  const presentFields = useMemo(
    () => RULE_NUMERIC_FIELDS.filter((f) => f in config),
    [config],
  );

  const save = async () => {
    setSaving(true);
    try {
      const nextConfig: Record<string, unknown> = { ...(rule.config ?? {}) };
      for (const f of presentFields) {
        const raw = config[f]?.trim();
        nextConfig[f] = raw === '' || raw == null ? null : Number(raw);
      }
      await api.put(`/club-mos/commissions/rules/${rule.id}`, {
        name,
        isActive,
        config: nextConfig,
      });
      toast.success(ct('common.success'));
      onSaved();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-border/60 p-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="grid gap-1.5">
          <Label className="text-xs text-muted-foreground">{ct('common.name')}</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        {presentFields.map((f) => (
          <div key={f} className="grid gap-1.5">
            <Label className="text-xs capitalize text-muted-foreground">{f}</Label>
            <Input
              type="number"
              value={config[f] ?? ''}
              onChange={(e) => setConfig((prev) => ({ ...prev, [f]: e.target.value }))}
            />
          </div>
        ))}
        <div className="grid gap-1.5">
          <Label className="text-xs text-muted-foreground">{ct('common.status')}</Label>
          <label className="flex h-10 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="size-4"
            />
            {isActive ? ct('common.active') : ct('common.inactive')}
          </label>
        </div>
      </div>
      <div className="mt-4 flex justify-end">
        <Button variant="brand" size="sm" disabled={saving} onClick={() => void save()}>
          {saving ? ct('common.saving') : ct('common.save')}
        </Button>
      </div>
    </div>
  );
}

export function MosCommissionPage({
  defaultKind,
  rulesFocus,
  titleKey,
}: {
  defaultKind?: string;
  rulesFocus?: boolean;
  titleKey?: string;
} = {}) {
  const ct = useClubT();
  const { t, locale } = useLocale();
  const { data: branches } = useBranches();

  const [kind, setKind] = useState<string>(defaultKind ?? KIND_OPTIONS[0].value);
  const [from, setFrom] = useState<string>(localToday());
  const [to, setTo] = useState<string>(localToday());
  const [branchId, setBranchId] = useState<string>('');
  const [rulesOpen, setRulesOpen] = useState(rulesFocus ?? false);
  const [paying, setPaying] = useState(false);

  const calc = useQuery({
    queryKey: ['mos-commission-calc', kind, from, to, branchId],
    queryFn: async () => {
      const { data } = await api.get<CalcResponse>('/club-mos/commissions/calculate', {
        params: {
          kind,
          from: from || undefined,
          to: to || undefined,
          branchId: branchId || undefined,
        },
      });
      return data;
    },
    enabled: Boolean(kind) && !rulesFocus,
  });

  const rules = useQuery({
    queryKey: ['mos-commission-rules', kind],
    queryFn: async () => {
      const { data } = await api.get<CommissionRule[] | { data: CommissionRule[] }>(
        '/club-mos/commissions/rules',
        { params: defaultKind || kind ? { kind: defaultKind ?? kind } : undefined },
      );
      const list = Array.isArray(data) ? data : (data?.data ?? []);
      if (defaultKind) return list.filter((r) => String(r.kind ?? '') === defaultKind || !r.kind);
      return list;
    },
    enabled: rulesOpen,
  });

  const rows = calc.data?.rows ?? [];
  const totalCommission =
    calc.data?.totalCommission ??
    calc.data?.total ??
    rows.reduce((sum, r) => sum + (Number(r.commission) || 0), 0);

  const columns = useMemo<ColumnDef<CommissionRow>[]>(
    () => [
      {
        accessorKey: 'personName',
        header: ct('common.name'),
        cell: ({ getValue }) => (getValue() as string) || '—',
      },
      {
        accessorKey: 'base',
        header: 'Base',
        cell: ({ getValue }) => {
          const v = getValue();
          return v == null ? '—' : formatMoney(v as number, undefined, locale);
        },
      },
      {
        accessorKey: 'rate',
        header: 'Rate',
        cell: ({ getValue }) => {
          const v = getValue();
          return v == null ? '—' : formatNum(v as number, locale);
        },
      },
      {
        accessorKey: 'commission',
        header: 'Commission',
        cell: ({ getValue }) => {
          const v = getValue();
          return v == null ? '—' : formatMoney(v as number, undefined, locale);
        },
      },
    ],
    [ct, locale],
  );

  const confirmPayout = async () => {
    const ok = await confirm({
      title: 'Confirm payout',
      description: `Pay out ${formatMoney(totalCommission, undefined, locale)} for the selected period?`,
    });
    if (!ok) return;
    setPaying(true);
    try {
      await api.post('/club-mos/commissions/payout', {
        kind,
        from: from || undefined,
        to: to || undefined,
        branchId: branchId || undefined,
      });
      toast.success(ct('common.success'));
      void calc.refetch();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setPaying(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={titleKey ? mosMenuLabel(t, titleKey) : 'Commissions'}
        eyebrow={t('nav.sections.club')}
        description={
          rulesFocus
            ? 'Configure commission rules for this category.'
            : 'Calculate and confirm staff commission payouts.'
        }
      />

      {!rulesFocus && (
        <>
          <Card className="overflow-hidden border-border/60 shadow-sm">
            <div className="h-0.5 bg-gradient-to-l from-primary/50 via-primary to-primary/30" />
            <CardContent className="pt-6">
              <div className="flex flex-wrap items-end gap-4">
                <div className="grid gap-1.5">
                  <Label>{ct('mos.kind')}</Label>
                  <select
                    className={SELECT_CLS + ' w-56'}
                    value={kind}
                    onChange={(e) => setKind(e.target.value)}
                  >
                    {KIND_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-1.5">
                  <Label>{ct('common.dateFrom')}</Label>
                  <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                </div>
                <div className="grid gap-1.5">
                  <Label>{ct('common.dateTo')}</Label>
                  <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
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
                <Button variant="brand" onClick={() => void calc.refetch()}>
                  {ct('common.search')}
                </Button>
                <Button
                  variant="outline"
                  disabled={paying || !rows.length}
                  onClick={() => void confirmPayout()}
                >
                  <Coins className="size-4" /> {paying ? ct('common.saving') : 'Confirm payout'}
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard
              title={ct('mos.totalCommission')}
              value={formatMoney(totalCommission, undefined, locale)}
              icon={<Coins className="size-5" />}
            />
            <StatCard title={ct('mos.people')} value={rows.length} colorIndex={2} icon={<Users className="size-5" />} />
            <StatCard
              title={ct('mos.selectedKind')}
              value={KIND_OPTIONS.find((o) => o.value === kind)?.label ?? kind}
              colorIndex={3}
              icon={<Sparkles className="size-5" />}
            />
          </div>

          <Card className="overflow-hidden border-border/60 shadow-sm">
            <CardContent className="pt-6">
              <DataTable
                columns={columns}
                data={rows}
                total={rows.length}
                page={1}
                pageSize={rows.length || 10}
                onPageChange={() => {}}
                onPageSizeChange={() => {}}
                isLoading={calc.isLoading}
                isError={calc.isError}
                onRetry={() => void calc.refetch()}
              />
            </CardContent>
          </Card>
        </>
      )}

      <Card className="overflow-hidden border-border/60 shadow-sm">
        <CardContent className="pt-6">
          {!rulesFocus && (
            <button
              type="button"
              className="mb-4 flex w-full items-center gap-2 text-left text-sm font-semibold"
              onClick={() => setRulesOpen((v) => !v)}
            >
              {rulesOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
              Rules
            </button>
          )}
          {(rulesFocus || rulesOpen) && (
            <div className="space-y-4">
              {rules.isLoading && (
                <p className="text-sm text-muted-foreground">{ct('common.loading')}</p>
              )}
              {rules.isError && (
                <p className="text-sm text-destructive">{apiError(rules.error)}</p>
              )}
              {rules.data?.length === 0 && !rules.isLoading && (
                <p className="text-sm text-muted-foreground">{ct('common.noData')}</p>
              )}
              {(rules.data ?? []).map((rule) => (
                <RuleEditor key={rule.id} rule={rule} onSaved={() => void rules.refetch()} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
