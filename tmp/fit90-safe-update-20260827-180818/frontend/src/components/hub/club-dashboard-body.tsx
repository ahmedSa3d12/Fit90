import { Activity, ArrowLeft, CreditCard, DollarSign, Lock, TrendingUp, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Cell, Legend, Pie, PieChart, Tooltip } from 'recharts';
import { ErrorState } from '@/components/common/states';
import { ChartCard, CHART_COLORS } from '@/components/common/chart-card';
import { ClubStatCard } from '@/components/club/stat-card';
import { WorkspaceWidgets } from '@/components/workspace/workspace-widgets';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useBranches } from '@/hooks/use-branches';
import { useClubT } from '@/hooks/use-club-t';
import { api, apiError } from '@/lib/api';
import { localDateStr, localToday } from '@/lib/formatters';
import { toArabicDigits } from '@/lib/utils';
import type { ClubDashboardSummary } from '@/types/club';

const selectCls =
  'flex h-10 w-full max-w-xs rounded-md border border-input bg-background px-3 text-sm shadow-sm';

export function ClubDashboardBody({ embedded }: { embedded?: boolean }) {
  const ct = useClubT();
  const { data: branches } = useBranches();
  const [branchId, setBranchId] = useState('all');
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    return localDateStr(new Date(d.getFullYear(), d.getMonth(), 1));
  });
  const [endDate, setEndDate] = useState(() => localToday());

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['club-dashboard', 'summary', branchId, startDate, endDate],
    queryFn: async () => {
      const { data: s } = await api.get<ClubDashboardSummary>('/club-dashboard/summary', {
        params: { startDate, endDate, branchId: branchId !== 'all' ? branchId : undefined },
      });
      return s;
    },
  });

  const branchOptions = useMemo(
    () => [{ value: 'all', label: ct('common.allBranches') }, ...(branches ?? []).map((b) => ({ value: String(b.id), label: b.name ?? '—' }))],
    [branches, ct],
  );

  const quickLinks = [
    { to: '/club/members', label: ct('dashboard.quickMembers'), icon: Users },
    { to: '/club/subscriptions', label: ct('dashboard.quickSubscriptions'), icon: CreditCard },
    { to: '/club/lockers', label: ct('dashboard.quickLockers'), icon: Lock },
  ];

  if (isError) {
    return <ErrorState message={apiError(error)} onRetry={() => void refetch()} />;
  }

  return (
    <div className="space-y-6">
      <WorkspaceWidgets />

      <div className="flex flex-wrap items-end gap-4 rounded-xl border bg-card/50 p-4">
        <div className="grid gap-1.5">
          <Label>{ct('common.branch')}</Label>
          <select className={selectCls} value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            {branchOptions.map((b) => (
              <option key={b.value} value={b.value}>{b.label}</option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label>{ct('common.dateFrom')}</Label>
          <Input type="date" className="w-40" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label>{ct('common.dateTo')}</Label>
          <Input type="date" className="w-40" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
      </div>

      {!embedded && (
        <div className="flex flex-wrap gap-2">
          {quickLinks.map(({ to, label, icon: Icon }) => (
            <Button key={to} variant="outline" size="sm" asChild>
              <Link to={to}><Icon className="size-4" />{label}<ArrowLeft className="size-3 rotate-180" /></Link>
            </Button>
          ))}
        </div>
      )}

      {isLoading && <p className="text-muted-foreground">{ct('common.loading')}</p>}

      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <ClubStatCard icon={Users} label={ct('dashboard.totalMembers')} value={data.totalMembers.total} />
            <ClubStatCard icon={Activity} label={ct('dashboard.activeMembers')} value={data.totalMembers.active} />
            <ClubStatCard icon={DollarSign} label={ct('dashboard.monthlyRevenue')} value={data.monthlyRevenue} />
            <ClubStatCard icon={TrendingUp} label={ct('dashboard.attendanceRate')} value={data.attendanceRate} suffix="%" />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <ClubStatCard icon={DollarSign} label={ct('dashboard.netProfit')} value={data.netProfit} />
            <ClubStatCard icon={Users} label={ct('dashboard.newMembersMonth')} value={data.totalMembers.newThisMonth} />
            <ClubStatCard icon={DollarSign} label={ct('dashboard.subscriptionRevenue')} value={data.subscriptionRevenue} />
            <ClubStatCard icon={Lock} label={ct('dashboard.lockerRevenue')} value={data.lockerRevenue} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <ClubStatCard icon={Users} label={ct('dashboard.trainersCount')} value={data.trainers} />
            <ClubStatCard icon={Activity} label={ct('dashboard.classesToday')} value={data.classesToday ?? 0} />
            <ClubStatCard icon={DollarSign} label={ct('dashboard.spaRevenue')} value={data.spaRevenue ?? 0} />
            <ClubStatCard icon={DollarSign} label={ct('dashboard.classRevenue')} value={data.classRevenue ?? 0} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border bg-card p-5 shadow-sm">
              <h3 className="mb-4 font-semibold">{ct('dashboard.alerts')}</h3>
              <ul className="space-y-3 text-sm">
                <li className="flex justify-between border-b pb-2">
                  <span>{ct('dashboard.expiredSubs')}</span>
                  <span className="nums font-medium text-destructive">{toArabicDigits(data.alerts.expiredSubscriptions)}</span>
                </li>
                <li className="flex justify-between border-b pb-2">
                  <span>{ct('dashboard.pendingRenewals')}</span>
                  <span className="nums font-medium text-amber-600">{toArabicDigits(data.alerts.pendingRenewals)}</span>
                </li>
                <li className="flex justify-between">
                  <span>{ct('dashboard.newMembersAlert')}</span>
                  <span className="nums font-medium text-success">{toArabicDigits(data.alerts.newMembers)}</span>
                </li>
              </ul>
            </div>
            <ChartCard
              title={ct('dashboard.subDistribution')}
              icon={TrendingUp}
              height={240}
              isEmpty={
                ![
                  data.subscriptionDistribution.monthly,
                  data.subscriptionDistribution.quarterly,
                  data.subscriptionDistribution.halfYearly,
                  data.subscriptionDistribution.yearly,
                ].some((v) => v > 0)
              }
              emptyText={ct('common.noData')}
            >
              <PieChart>
                <Pie
                  data={[
                    { name: ct('dashboard.monthly'), value: data.subscriptionDistribution.monthly },
                    { name: ct('dashboard.quarterly'), value: data.subscriptionDistribution.quarterly },
                    { name: ct('dashboard.halfYearly'), value: data.subscriptionDistribution.halfYearly },
                    { name: ct('dashboard.yearly'), value: data.subscriptionDistribution.yearly },
                  ].filter((d) => d.value > 0)}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={3}
                >
                  {[0, 1, 2, 3].map((i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => toArabicDigits(v)} />
                <Legend />
              </PieChart>
            </ChartCard>
          </div>

          <div className="rounded-xl border bg-card p-5 shadow-sm">
            <h3 className="mb-4 font-semibold">{ct('dashboard.recentActivity')}</h3>
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">{ct('dashboard.newMembersList')}</p>
                <ul className="space-y-2">
                  {data.recentActivities.members.length === 0 && <li className="text-sm text-muted-foreground">{ct('common.noData')}</li>}
                  {data.recentActivities.members.map((m) => (
                    <li key={m.code} className="flex justify-between text-sm">
                      <span>{m.label}</span>
                      <span className="nums text-muted-foreground">{m.code}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">{ct('dashboard.recentPayments')}</p>
                <ul className="space-y-2">
                  {data.recentActivities.payments.length === 0 && <li className="text-sm text-muted-foreground">{ct('common.noData')}</li>}
                  {data.recentActivities.payments.map((p) => (
                    <li key={p.receiptNumber} className="flex justify-between text-sm">
                      <span>{p.label}</span>
                      <span className="nums font-medium">{toArabicDigits(p.amount)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {!data.expensesAvailable && (
            <p className="text-xs text-muted-foreground">{ct('dashboard.expensesNote')}</p>
          )}
        </>
      )}
    </div>
  );
}

// hmr-ping
