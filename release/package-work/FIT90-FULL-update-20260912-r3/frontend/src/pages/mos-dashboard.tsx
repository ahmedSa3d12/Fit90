import { useIsFetching, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  Coins,
  LayoutDashboard,
  Plus,
  RefreshCw,
  Sparkles,
  Target,
  TrendingUp,
  UserPlus,
  Users,
  Zap,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useMemo, useState, type ReactNode } from 'react';
import { BannerClockWidget } from '@/components/common/banner-clock-widget';
import { ChartCard, CHART_COLORS, chartColor } from '@/components/common/chart-card';
import { ErrorState } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useClubT } from '@/hooks/use-club-t';
import { useBranches } from '@/hooks/use-branches';
import { api, apiError } from '@/lib/api';
import { formatMoney, formatNum } from '@/lib/formatters';
import { cn, toArabicDigits, withAlpha } from '@/lib/utils';
import { useAuth } from '@/store/auth';
import { useLocale, type Locale } from '@/store/locale';

type Tab = 'analytics' | 'sales' | 'trainers';

const RANGE_OPTIONS = [
  { value: '30', labelKey: 'mosDashboard.last30Days' },
  { value: '90', labelKey: 'mosDashboard.last90Days' },
  { value: '180', labelKey: 'mosDashboard.last6Months' },
] as const;

const CHART_GRID = 'hsl(var(--border))';
const TOOLTIP_STYLE = {
  borderRadius: 12,
  border: '1px solid hsl(var(--border))',
  background: 'hsl(var(--card))',
  boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
};

function monthInputValue(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function ChartGradients() {
  return (
    <defs>
      <linearGradient id="dashAreaPrimary" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={CHART_COLORS[0]} stopOpacity={0.35} />
        <stop offset="100%" stopColor={CHART_COLORS[0]} stopOpacity={0} />
      </linearGradient>
      <linearGradient id="dashAreaMoney" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={CHART_COLORS[4]} stopOpacity={0.4} />
        <stop offset="100%" stopColor={CHART_COLORS[4]} stopOpacity={0} />
      </linearGradient>
      <linearGradient id="dashBarPrimary" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={CHART_COLORS[0]} />
        <stop offset="100%" stopColor={CHART_COLORS[1]} />
      </linearGradient>
    </defs>
  );
}

function AchievementRing({
  percent,
  label,
  sublabel,
  size = 140,
  accent = CHART_COLORS[0],
}: {
  percent: number;
  label: string;
  sublabel?: string;
  size?: number;
  accent?: string;
}) {
  const clamped = Math.min(100, Math.max(0, percent));
  const R = size * 0.37;
  const C = 2 * Math.PI * R;
  const offset = C * (1 - clamped / 100);
  const cx = size / 2;

  return (
    <div className="flex flex-col items-center py-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90" aria-hidden>
          <circle cx={cx} cy={cx} r={R} fill="none" stroke="hsl(var(--muted))" strokeWidth={size * 0.07} />
          <circle
            cx={cx}
            cy={cx}
            r={R}
            fill="none"
            stroke={accent}
            strokeWidth={size * 0.07}
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={offset}
            className="transition-all duration-700 ease-out"
            style={{ filter: `drop-shadow(0 0 6px ${withAlpha(accent, 0.45)})` }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-2xl font-bold nums text-foreground">{toArabicDigits(clamped.toFixed(1))}%</span>
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
        </div>
      </div>
      {sublabel && <p className="mt-2 max-w-[200px] truncate text-center text-xs text-muted-foreground">{sublabel}</p>}
    </div>
  );
}

function DashboardHero({
  name,
  loading,
  kpis,
  locale,
  quickActions,
}: {
  name: string;
  loading?: boolean;
  kpis?: {
    totalMembers: number;
    activeMembers: number;
    pendingLeads: number;
    subscriptionRevenue: number;
    classRevenue: number;
    personalTrainingRevenue: number;
    nutritionRevenue: number;
    spaRevenue: number;
  };
  locale: Locale;
  quickActions: { to: string; label: string; icon: typeof Plus }[];
}) {
  const ct = useClubT();
  const { ui } = useLocale();
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? ct('mosDashboard.greetingMorning') : hour < 17 ? ct('mosDashboard.greetingAfternoon') : ct('mosDashboard.greetingEvening');

  const heroStats = [
    { label: ct('dashboard.totalMembers'), value: kpis?.totalMembers ?? 0, icon: Users, to: '/club/members', tone: 'text-sky-400', surface: 'border-sky-400/35 from-sky-500/40 via-cyan-500/20 to-card', iconSurface: 'bg-sky-500/20 ring-sky-400/35', glow: 'bg-sky-400/25' },
    { label: ct('dashboard.activeMembers'), value: kpis?.activeMembers ?? 0, icon: Activity, to: '/club/members?isActive=true', tone: 'text-emerald-400', surface: 'border-emerald-400/35 from-emerald-500/40 via-teal-500/20 to-card', iconSurface: 'bg-emerald-500/20 ring-emerald-400/35', glow: 'bg-emerald-400/25' },
    { label: ct('mosDashboard.potentialMembers'), value: kpis?.pendingLeads ?? 0, icon: UserPlus, to: '/mos/potential-members', tone: 'text-indigo-400', surface: 'border-indigo-400/35 from-indigo-500/40 via-blue-500/20 to-card', iconSurface: 'bg-indigo-500/20 ring-indigo-400/35', glow: 'bg-indigo-400/25' },
    { label: ct('dashboard.subscriptionRevenue'), value: formatMoney(kpis?.subscriptionRevenue ?? 0, undefined, locale), icon: Coins, isMoney: true, to: '/mos/reports/membershipsIncome', tone: 'text-amber-400', surface: 'border-amber-400/35 from-amber-500/40 via-orange-500/20 to-card', iconSurface: 'bg-amber-500/20 ring-amber-400/35', glow: 'bg-amber-400/25' },
    { label: ct('dashboard.classRevenue'), value: formatMoney(kpis?.classRevenue ?? 0, undefined, locale), icon: CalendarDays, isMoney: true, to: '/scheduling/classes?tab=bookings', tone: 'text-violet-400', surface: 'border-violet-400/35 from-violet-500/40 via-fuchsia-500/20 to-card', iconSurface: 'bg-violet-500/20 ring-violet-400/35', glow: 'bg-violet-400/25' },
    { label: ct('dashboard.personalTrainingRevenue'), value: formatMoney(kpis?.personalTrainingRevenue ?? 0, undefined, locale), icon: TrendingUp, isMoney: true, to: '/scheduling/personal-training?tab=bookings', tone: 'text-rose-400', surface: 'border-rose-400/35 from-rose-500/40 via-red-500/20 to-card', iconSurface: 'bg-rose-500/20 ring-rose-400/35', glow: 'bg-rose-400/25' },
    { label: ct('dashboard.nutritionRevenue'), value: formatMoney(kpis?.nutritionRevenue ?? 0, undefined, locale), icon: Activity, isMoney: true, to: '/scheduling/nutrition?tab=bookings', tone: 'text-lime-400', surface: 'border-lime-400/35 from-lime-500/40 via-emerald-500/20 to-card', iconSurface: 'bg-lime-500/20 ring-lime-400/35', glow: 'bg-lime-400/25' },
    { label: ct('dashboard.spaRevenue'), value: formatMoney(kpis?.spaRevenue ?? 0, undefined, locale), icon: Sparkles, isMoney: true, to: '/scheduling/spa?tab=bookings', tone: 'text-cyan-400', surface: 'border-cyan-400/35 from-cyan-500/40 via-blue-500/20 to-card', iconSurface: 'bg-cyan-500/20 ring-cyan-400/35', glow: 'bg-cyan-400/25' },
  ];

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-3xl bg-[linear-gradient(125deg,#15171d_0%,#2b2225_36%,#80171d_62%,#d32b32_100%)] shadow-xl ring-1 ring-red-300/20">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
            backgroundSize: '24px 24px',
          }}
        />
        <div className="pointer-events-none absolute -end-20 -top-20 size-80 rounded-full bg-red-400/45 blur-3xl" />
        <div className="pointer-events-none absolute end-1/4 top-1/3 size-56 rounded-full bg-brand-600/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 start-1/4 size-64 rounded-full bg-sky-400/10 blur-3xl" />

        <div className="relative grid gap-6 p-6 md:p-8 xl:grid-cols-[minmax(0,1fr)_minmax(300px,390px)] xl:items-center">
          <div className="min-w-0 space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="banner-glass inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold text-white/90">
                <Sparkles className="size-3.5" />
                FIT90
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-500/20 px-2.5 py-1 text-xs font-medium text-emerald-100">
                <Zap className="size-3" />
                {ct('mosDashboard.live')}
              </span>
            </div>

            <div>
              <p className="text-base font-medium text-white/75">{greeting}</p>
              <h1 className="mt-1 text-3xl font-bold tracking-tight text-white md:text-4xl">{ui(name)}</h1>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/70 md:text-base">{ct('mosDashboard.heroSubtitle')}</p>
            </div>

            <div className="flex flex-wrap gap-2">
              {quickActions.map(({ to, label, icon: Icon }) => (
                <Link key={to} to={to} className="dash-quick-chip">
                  <Icon className="size-4" />
                  {label}
                </Link>
              ))}
            </div>
          </div>

          <div className="min-w-0">
            <BannerClockWidget />
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {heroStats.map(({ label, value, icon: Icon, isMoney, to, tone, surface, iconSurface, glow }) => (
          <Link
            key={label}
            to={to}
            className={cn('group relative overflow-hidden rounded-2xl border bg-gradient-to-br p-4 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:brightness-110 hover:shadow-lg', surface)}
          >
            <div className={cn('pointer-events-none absolute -end-8 -top-10 size-28 rounded-full blur-2xl transition-transform duration-300 group-hover:scale-125', glow)} />
            <div className="relative flex items-start justify-between gap-3">
              <div className="min-w-0">
              {loading ? (
                <>
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="mt-3 h-8 w-24" />
                </>
              ) : (
                <>
                    <p className="text-xs font-semibold text-foreground/75">{label}</p>
                    <p
                      className={cn('mt-2 font-bold leading-tight text-foreground nums', isMoney ? 'whitespace-nowrap text-xl md:text-2xl' : 'text-2xl md:text-3xl')}
                      dir={isMoney ? 'ltr' : undefined}
                    >
                    {typeof value === 'number' ? formatNum(value, locale) : value}
                  </p>
                </>
              )}
              </div>
              <div className={cn('flex size-11 shrink-0 items-center justify-center rounded-xl shadow-sm ring-1 backdrop-blur-sm transition-transform group-hover:scale-105', tone, iconSurface)}>
                <Icon className="size-5" />
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function InsightTile({
  label,
  value,
  href,
  tone,
  loading,
}: {
  label: string;
  value: string | number;
  href: string;
  tone: string;
  loading?: boolean;
}) {
  return (
    <Link to={href} className="dash-insight-tile group block">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.08] transition group-hover:opacity-[0.14]"
        style={{ background: `linear-gradient(135deg, ${tone} 0%, transparent 60%)` }}
      />
      <div className="relative flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          {loading ? (
            <Skeleton className="mt-2 h-7 w-20" />
          ) : (
            <p className="mt-1 text-xl font-bold nums" style={{ color: tone }}>
              {value}
            </p>
          )}
        </div>
        <ArrowUpRight className="size-4 shrink-0 text-muted-foreground transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" />
      </div>
    </Link>
  );
}

function SegmentedTabs({
  tab,
  setTab,
  labels,
}: {
  tab: Tab;
  setTab: (t: Tab) => void;
  labels: { analytics: string; sales: string; trainers: string };
}) {
  const items: { id: Tab; icon: typeof LayoutDashboard; label: string }[] = [
    { id: 'analytics', icon: LayoutDashboard, label: labels.analytics },
    { id: 'sales', icon: BarChart3, label: labels.sales },
    { id: 'trainers', icon: Activity, label: labels.trainers },
  ];

  return (
    <div className="dash-segment" role="tablist">
      {items.map(({ id, icon: Icon, label }) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={tab === id}
          data-active={tab === id}
          onClick={() => setTab(id)}
          className="dash-segment-btn"
        >
          <Icon className="size-4" />
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
  );
}

function FilterSelect({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        'h-9 rounded-lg border border-border/70 bg-background/80 px-3 text-xs font-medium shadow-sm backdrop-blur-sm transition focus:outline-none focus:ring-2 focus:ring-primary/30',
        className,
      )}
      {...props}
    />
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-12">
        <Skeleton className="h-80 rounded-2xl lg:col-span-8" />
        <Skeleton className="h-80 rounded-2xl lg:col-span-4" />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-64 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    </div>
  );
}

function AnalyticsTab({ days, branchId }: { days: string; branchId: string }) {
  const ct = useClubT();
  const { locale } = useLocale();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['mos-dashboard-analytics', days, branchId],
    queryFn: async () => {
      const { data: res } = await api.get('/club-mos/dashboard/analytics', {
        params: { days, branchId: branchId !== 'all' ? branchId : undefined },
      });
      return res;
    },
  });

  if (isError) return <ErrorState message={apiError(error)} onRetry={() => void refetch()} />;
  if (isLoading) return <DashboardSkeleton />;

  const progressData =
    data?.membersProgress?.map((m: { month: string; oldMembers: number; newMembers: number; renewed: number; notRenewed: number }) => ({
      month: m.month.slice(5),
      old: m.oldMembers,
      new: m.newMembers,
      renewed: m.renewed,
      notRenewed: m.notRenewed,
    })) ?? [];

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <InsightTile
          label={ct('mosDashboard.pendingLeads')}
          value={formatNum(data?.kpis?.pendingLeads ?? 0, locale)}
          href="/mos/potential-members"
          tone="#8B5CF6"
        />
        <InsightTile
          label={ct('mosDashboard.openDebt')}
          value={formatMoney(data?.kpis?.openDebtTotal ?? 0, undefined, locale)}
          href="/mos/debts"
          tone="#E5736B"
        />
        <InsightTile
          label={ct('mosDashboard.subscriptions')}
          value={formatNum(data?.kpis?.subscriptionsInRange ?? 0, locale)}
          href="/club/subscriptions"
          tone="#1E6BA8"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <ChartCard
          title={ct('mosDashboard.membersProgress')}
          description={ct('mosDashboard.membersProgressHint')}
          icon={TrendingUp}
          isEmpty={!progressData.length}
          height={300}
          className="dash-panel lg:col-span-8"
        >
          <LineChart data={progressData}>
            <ChartGradients />
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="new" name={ct('mosDashboard.newMembers')} stroke={CHART_COLORS[2]} strokeWidth={2.5} dot={false} />
            <Line type="monotone" dataKey="renewed" name={ct('mosDashboard.renewed')} stroke={CHART_COLORS[1]} strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="old" name={ct('mosDashboard.oldMembers')} stroke={CHART_COLORS[0]} strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="notRenewed" name={ct('mosDashboard.notRenewed')} stroke={CHART_COLORS[3]} strokeWidth={2} strokeDasharray="4 4" dot={false} />
          </LineChart>
        </ChartCard>

        <div className="dash-panel flex flex-col gap-3 p-5 lg:col-span-4">
          <h3 className="text-sm font-semibold">{ct('mosDashboard.attendance')}</h3>
          <p className="text-xs text-muted-foreground">{ct('mosDashboard.attendanceHint')}</p>
          <div className="min-h-[240px] flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.attendanceByHour ?? []}>
                <ChartGradients />
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} vertical={false} />
                <XAxis dataKey="hour" tickFormatter={(h) => `${h}h`} tick={{ fontSize: 9 }} interval={3} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={28} />
                <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={(h) => `${h}:00`} />
                <Bar dataKey="count" fill="url(#dashBarPrimary)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title={ct('mosDashboard.money')} icon={Coins} isEmpty={!data?.moneyByDay?.length} height={260} className="dash-panel">
          <AreaChart data={data?.moneyByDay ?? []}>
            <ChartGradients />
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} vertical={false} />
            <XAxis dataKey="date" tickFormatter={(d) => String(d).slice(8)} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={36} />
            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => formatMoney(v, undefined, locale)} />
            <Area type="monotone" dataKey="amount" stroke={CHART_COLORS[4]} fill="url(#dashAreaMoney)" strokeWidth={2} />
          </AreaChart>
        </ChartCard>

        <ChartCard title={ct('mosDashboard.incomeByPackage')} isEmpty={!data?.incomeByPackage?.length} height={260} className="dash-panel">
          <BarChart data={data?.incomeByPackage ?? []}>
            <ChartGradients />
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 9 }} interval={0} angle={-15} textAnchor="end" height={48} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={40} />
            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => formatMoney(v, undefined, locale)} />
            <Bar dataKey="income" fill="url(#dashBarPrimary)" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ChartCard>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <ChartCard title={ct('mosDashboard.sources')} isEmpty={!data?.sourceOfKnowledge?.length} height={240} className="dash-panel">
          <BarChart data={data?.sourceOfKnowledge ?? []} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={CHART_GRID} />
            <XAxis type="number" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" width={72} tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Bar dataKey="count" fill={CHART_COLORS[5]} radius={[0, 4, 4, 0]} />
          </BarChart>
        </ChartCard>

        <ChartCard title={ct('mosDashboard.debts')} isEmpty={!data?.debtBuckets?.some((b: { count: number }) => b.count > 0)} height={240} className="dash-panel">
          <PieChart>
            <Pie
              data={data?.debtBuckets?.filter((b: { count: number }) => b.count > 0) ?? []}
              dataKey="count"
              nameKey="label"
              cx="50%"
              cy="50%"
              innerRadius={48}
              outerRadius={72}
              paddingAngle={2}
            >
              {(data?.debtBuckets ?? []).map((_: unknown, i: number) => (
                <Cell key={i} fill={chartColor(i)} stroke="transparent" />
              ))}
            </Pie>
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
          </PieChart>
        </ChartCard>

        <ChartCard title={ct('mosDashboard.packages')} isEmpty={!data?.packages?.length} height={240} className="dash-panel">
          <BarChart data={data?.packages?.slice(0, 5) ?? []}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 8 }} interval={0} angle={-20} textAnchor="end" height={44} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={28} />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Bar dataKey="count" fill={CHART_COLORS[6]} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ChartCard>
      </div>
    </div>
  );
}

function SalesTab({ month, salesStaffId, approvedOnly }: { month: string; salesStaffId: string; approvedOnly: boolean }) {
  const ct = useClubT();
  const { locale } = useLocale();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['mos-dashboard-sales', month, salesStaffId, approvedOnly],
    queryFn: async () => {
      const { data: res } = await api.get('/club-mos/dashboard/sales', {
        params: { month, salesStaffId: salesStaffId !== 'all' ? salesStaffId : undefined, approvedOnly },
      });
      return res;
    },
  });

  if (isError) return <ErrorState message={apiError(error)} onRetry={() => void refetch()} />;
  if (isLoading) return <DashboardSkeleton />;

  const summaryChart =
    data?.staff?.map((s: { name: string; target: number; achieved: number }) => ({
      name: s.name.split(' ')[0],
      target: s.target,
      achieved: s.achieved,
    })) ?? [];

  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="dash-gauge-card lg:col-span-4">
          <div className="relative p-6 text-center">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{ct('mosDashboard.wholeTarget')}</p>
            <p className="text-sm font-medium text-primary">{month}</p>
            <AchievementRing
              percent={data?.wholeTarget?.percent ?? 0}
              label={ct('mosDashboard.achievement')}
              sublabel={`${formatMoney(data?.wholeTarget?.achieved ?? 0, undefined, locale)} / ${formatMoney(data?.wholeTarget?.target ?? 0, undefined, locale)}`}
              accent={CHART_COLORS[0]}
            />
          </div>
        </div>

        <ChartCard
          title={ct('mosDashboard.salesSummary')}
          description={month}
          icon={BarChart3}
          isEmpty={!summaryChart.length}
          height={300}
          className="dash-panel lg:col-span-8"
          action={
            <Button variant="outline" size="sm" className="gap-1" asChild>
              <Link to="/mos/sales-schedule">
                {ct('mosDashboard.salesSchedule')}
                <ArrowUpRight className="size-3.5" />
              </Link>
            </Button>
          }
        >
          <BarChart data={summaryChart} barGap={4}>
            <ChartGradients />
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={44} />
            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => formatMoney(v, undefined, locale)} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="target" name={ct('mosDashboard.target')} fill={withAlpha(CHART_COLORS[2], 0.35)} radius={[4, 4, 0, 0]} />
            <Bar dataKey="achieved" name={ct('mosDashboard.achieved')} fill="url(#dashBarPrimary)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ChartCard>
      </div>

      {data?.staff?.length > 1 && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {data.staff.map((s: { id: number; name: string; percent: number; achieved: number }) => (
            <div key={s.id} className="dash-gauge-card p-4">
              <p className="truncate text-center text-sm font-semibold">{s.name}</p>
              <AchievementRing percent={s.percent} label={ct('mosDashboard.achievement')} sublabel={formatMoney(s.achieved, undefined, locale)} size={120} accent={CHART_COLORS[1]} />
            </div>
          ))}
        </div>
      )}

      <ChartCard title={ct('mosDashboard.salesDayByDay')} description={month} isEmpty={!data?.dailySales?.length} height={260} className="dash-panel">
        <AreaChart data={data?.dailySales ?? []}>
          <ChartGradients />
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} vertical={false} />
          <XAxis dataKey="day" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={40} />
          <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => formatMoney(v, undefined, locale)} />
          <Area type="monotone" dataKey="amount" stroke={CHART_COLORS[0]} fill="url(#dashAreaPrimary)" strokeWidth={2} />
        </AreaChart>
      </ChartCard>
    </div>
  );
}

function TrainersTab({ month, trainerId, approvedOnly }: { month: string; trainerId: string; approvedOnly: boolean }) {
  const ct = useClubT();
  const { locale } = useLocale();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['mos-dashboard-trainers', month, trainerId, approvedOnly],
    queryFn: async () => {
      const { data: res } = await api.get('/club-mos/dashboard/trainers', {
        params: { month, trainerId: trainerId !== 'all' ? trainerId : undefined, approvedOnly },
      });
      return res;
    },
  });

  if (isError) return <ErrorState message={apiError(error)} onRetry={() => void refetch()} />;
  if (isLoading) return <DashboardSkeleton />;

  const summaryChart =
    data?.trainers?.map((t: { name: string; target: number; achieved: number }) => ({
      name: t.name.split(' ')[0],
      target: t.target,
      achieved: t.achieved,
    })) ?? [];

  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="dash-gauge-card lg:col-span-4">
          <div className="relative p-6 text-center">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{ct('mosDashboard.wholeTarget')}</p>
            <p className="text-sm font-medium text-primary">{month}</p>
            <AchievementRing
              percent={data?.wholeTarget?.percent ?? 0}
              label={ct('mosDashboard.achievement')}
              sublabel={`${formatNum(data?.wholeTarget?.achieved ?? 0, locale)} / ${formatNum(data?.wholeTarget?.target ?? 0, locale)} ${ct('mosDashboard.classes')}`}
              accent={CHART_COLORS[4]}
            />
          </div>
        </div>

        <ChartCard title={ct('mosDashboard.trainerSummary')} description={month} icon={Activity} isEmpty={!summaryChart.length} height={300} className="dash-panel lg:col-span-8">
          <BarChart data={summaryChart} barGap={4}>
            <ChartGradients />
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={32} />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="target" name={ct('mosDashboard.target')} fill={withAlpha(CHART_COLORS[2], 0.35)} radius={[4, 4, 0, 0]} />
            <Bar dataKey="achieved" name={ct('mosDashboard.achieved')} fill="url(#dashBarPrimary)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ChartCard>
      </div>

      {data?.trainers?.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {data.trainers.map((t: { id: number; name: string; percent: number; revenue: number }) => (
            <div key={t.id} className="dash-gauge-card p-4">
              <p className="truncate text-center text-sm font-semibold">{t.name}</p>
              <AchievementRing percent={t.percent} label={ct('mosDashboard.achievement')} sublabel={formatMoney(t.revenue, undefined, locale)} size={120} accent={CHART_COLORS[4]} />
            </div>
          ))}
        </div>
      )}

      <ChartCard title={ct('mosDashboard.enrollmentsDayByDay')} description={month} isEmpty={!data?.dailySales?.length} height={260} className="dash-panel">
        <AreaChart data={data?.dailySales ?? []}>
          <ChartGradients />
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} vertical={false} />
          <XAxis dataKey="day" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={28} />
          <Tooltip contentStyle={TOOLTIP_STYLE} />
          <Area type="monotone" dataKey="count" stroke={CHART_COLORS[4]} fill="url(#dashAreaMoney)" strokeWidth={2} />
        </AreaChart>
      </ChartCard>
    </div>
  );
}

export function MosDashboardPage() {
  const ct = useClubT();
  const { locale, t } = useLocale();
  const { user } = useAuth();
  const { data: branches } = useBranches();
  const queryClient = useQueryClient();
  const dashboardRequests = useIsFetching({
    predicate: (query) => String(query.queryKey[0] ?? '').startsWith('mos-dashboard'),
  });
  const [tab, setTab] = useState<Tab>('analytics');
  const [days, setDays] = useState('30');
  const [branchId, setBranchId] = useState('all');
  const [month, setMonth] = useState(monthInputValue());
  const [salesStaffId, setSalesStaffId] = useState('all');
  const [trainerId, setTrainerId] = useState('all');
  const [approvedOnly, setApprovedOnly] = useState(false);

  const { data: heroData, isLoading: heroLoading } = useQuery({
    queryKey: ['mos-dashboard-analytics', days, branchId],
    queryFn: async () => {
      const { data: res } = await api.get('/club-mos/dashboard/analytics', {
        params: { days, branchId: branchId !== 'all' ? branchId : undefined },
      });
      return res;
    },
  });

  const { data: salesMeta } = useQuery({
    queryKey: ['mos-dashboard-sales-meta', month],
    queryFn: async () => (await api.get('/club-mos/dashboard/sales', { params: { month } })).data,
    enabled: tab === 'sales',
  });

  const { data: trainerMeta } = useQuery({
    queryKey: ['mos-dashboard-trainer-meta', month],
    queryFn: async () => (await api.get('/club-mos/dashboard/trainers', { params: { month } })).data,
    enabled: tab === 'trainers',
  });

  const branchOptions = useMemo(
    () => [{ value: 'all', label: ct('common.allBranches') }, ...(branches ?? []).map((b) => ({ value: String(b.id), label: b.name ?? '—' }))],
    [branches, ct],
  );

  const quickActions = [
    { to: '/club/subscriptions/new', label: ct('mosDashboard.quickNew'), icon: Plus },
    { to: '/mos/potential-members', label: ct('mosDashboard.quickPotential'), icon: UserPlus },
    { to: '/mos/sessions', label: ct('mosDashboard.quickOnePass'), icon: Activity },
    { to: '/club/members/attendance', label: ct('mosDashboard.quickAttendance'), icon: Users },
  ];

  const toolbar: ReactNode = (
    <div className="flex flex-wrap items-center gap-2">
      {tab === 'analytics' && (
        <>
          <FilterSelect value={days} onChange={(e) => setDays(e.target.value)}>
            {RANGE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{ct(o.labelKey)}</option>
            ))}
          </FilterSelect>
          <FilterSelect value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            {branchOptions.map((b) => (
              <option key={b.value} value={b.value}>{b.label}</option>
            ))}
          </FilterSelect>
        </>
      )}
      {(tab === 'sales' || tab === 'trainers') && (
        <>
          <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-background/60 px-2 py-1.5">
            <Checkbox id="approvedOnly" checked={approvedOnly} onCheckedChange={(v) => setApprovedOnly(v === true)} />
            <Label htmlFor="approvedOnly" className="cursor-pointer text-xs font-medium">{ct('mosDashboard.approvedOnly')}</Label>
          </div>
          <div className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-background/60 px-2">
            <CalendarDays className="size-3.5 text-muted-foreground" />
            <input type="month" className="h-8 bg-transparent text-xs font-medium outline-none" value={month} onChange={(e) => setMonth(e.target.value)} />
          </div>
          {tab === 'sales' && (
            <FilterSelect value={salesStaffId} onChange={(e) => setSalesStaffId(e.target.value)}>
              <option value="all">{ct('mosDashboard.allSales')}</option>
              {(salesMeta?.staff ?? []).map((s: { id: number; name: string }) => (
                <option key={s.id} value={String(s.id)}>{s.name}</option>
              ))}
            </FilterSelect>
          )}
          {tab === 'trainers' && (
            <FilterSelect value={trainerId} onChange={(e) => setTrainerId(e.target.value)}>
              <option value="all">{ct('mosDashboard.allTrainers')}</option>
              {(trainerMeta?.trainers ?? []).map((t: { id: number; name: string }) => (
                <option key={t.id} value={String(t.id)}>{t.name}</option>
              ))}
            </FilterSelect>
          )}
        </>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-9 gap-2"
        disabled={dashboardRequests > 0}
        onClick={() => void queryClient.invalidateQueries({
          predicate: (query) => String(query.queryKey[0] ?? '').startsWith('mos-dashboard'),
        })}
      >
        <RefreshCw className={cn('size-3.5', dashboardRequests > 0 && 'animate-spin')} />
        <span>{t('shared.refresh')}</span>
      </Button>
    </div>
  );

  return (
    <div className="space-y-6 pb-8">
      <DashboardHero
        name={user?.name ?? ct('dashboard.title')}
        loading={heroLoading}
        kpis={heroData?.kpis}
        locale={locale}
        quickActions={quickActions}
      />

      <div className="sticky top-2 z-10 -mx-1 flex flex-col gap-3 rounded-2xl border border-border/60 bg-background/90 p-3 shadow-md backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between dark:border-white/[0.08] dark:bg-background/90">
        <SegmentedTabs
          tab={tab}
          setTab={setTab}
          labels={{
            analytics: ct('mosDashboard.tabAnalytics'),
            sales: ct('mosDashboard.tabSales'),
            trainers: ct('mosDashboard.tabTrainers'),
          }}
        />
        {toolbar}
      </div>

      <div>
        {tab === 'analytics' && <AnalyticsTab days={days} branchId={branchId} />}
        {tab === 'sales' && <SalesTab month={month} salesStaffId={salesStaffId} approvedOnly={approvedOnly} />}
        {tab === 'trainers' && <TrainersTab month={month} trainerId={trainerId} approvedOnly={approvedOnly} />}
      </div>
    </div>
  );
}

export function DashboardPage() {
  return <MosDashboardPage />;
}
