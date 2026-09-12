import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Banknote, CalendarDays, CreditCard, Target, TrendingUp, Users, WalletCards } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ClubStatCard } from '@/components/club/stat-card';
import { PageHeader } from '@/components/common/page-header';
import { ErrorState } from '@/components/common/states';
import { PageSkeleton } from '@/components/common/page-skeleton';
import { TargetCommissionCard } from '@/components/dashboard/target-commission-card';
import { uploadUrl } from '@/components/employees/use-uploads';
import { api, apiError } from '@/lib/api';
import { initials, toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';

interface SalesDashboardData {
  month: string;
  employee: { id: number; name: string; jobTitle: string | null; imageUrl: string | null; target: string | null; commissionRate: string | null };
  summary: { subscriptions: number; customers: number; totalSales: number; collected: number; outstanding: number; target: number; targetRemaining: number; targetAchievement: number; commissionRate: number; commissionAmount: number };
  subscriptions: Array<{ id: number; customerName: string; subscriptionNumber: string; subscriptionType: string | null; registrationDate: string; startDate: string; endDate: string; value: number; paid: number; remaining: number; status: string; paymentMethod: string | null }>;
}

function currentMonth() { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`; }
function money(value: number, locale: string) { return new Intl.NumberFormat(locale === 'ar' ? 'ar-EG' : 'en-US', { maximumFractionDigits: 2 }).format(value); }
function dateText(value: string, locale: string) { return new Date(`${value}T12:00:00`).toLocaleDateString(locale === 'ar' ? 'ar-EG' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); }

export function SalesDashboardPage() {
  const { ui, locale } = useLocale();
  const [month, setMonth] = useState(currentMonth());
  const query = useQuery({
    queryKey: ['me', 'sales-dashboard', month],
    queryFn: async () => (await api.get<SalesDashboardData>('/me/sales-dashboard', { params: { month } })).data,
    retry: 4,
    retryDelay: (attempt) => Math.min(2_000 * (attempt + 1), 5_000),
    refetchOnMount: 'always',
  });
  if (query.isLoading) return <PageSkeleton />;
  if (query.isError || !query.data) {
    return <ErrorState message={apiError(query.error, ui('تعذر تحميل بيانات لوحة المبيعات'))} onRetry={() => void query.refetch()} />;
  }
  const { employee, summary, subscriptions } = query.data;
  const performanceCard = summary.target > 0 ? (
    <TargetCommissionCard
      target={summary.target}
      collected={summary.collected}
      outstanding={summary.outstanding}
      subscriptions={summary.subscriptions}
      commissionRate={summary.commissionRate}
      commissionAmount={summary.commissionAmount}
      targetAchievement={summary.targetAchievement}
      targetRemaining={summary.targetRemaining}
      locale={locale}
      ui={ui}
    />
  ) : null;

  return <div className="space-y-6">
    {performanceCard}
    <PageHeader title={ui('لوحة موظف المبيعات')} description={ui('متابعة التارجت والاشتراكات والتحصيلات الخاصة بك')} actions={<div className="flex items-center gap-2 rounded-xl border bg-card px-3 py-2"><CalendarDays className="size-4 text-primary" /><Input type="month" value={month} onChange={(e) => setMonth(e.target.value || currentMonth())} className="h-8 w-40 border-0 bg-transparent p-0 shadow-none focus-visible:ring-0" /></div>} />

    <Card className="overflow-hidden border-primary/20 bg-gradient-to-l from-primary/10 via-card to-card"><CardContent className="flex flex-col gap-5 p-6 md:flex-row md:items-center md:justify-between"><div className="flex items-center gap-4"><Avatar className="size-20 border-4 border-background shadow-lg"><AvatarImage src={uploadUrl(employee.imageUrl) ?? undefined} /><AvatarFallback className="bg-primary text-xl font-bold text-primary-foreground">{initials(employee.name)}</AvatarFallback></Avatar><div><p className="text-sm text-muted-foreground">{ui('مرحباً بك')}</p><h2 className="mt-1 text-2xl font-bold">{employee.name}</h2><Badge className="mt-2">{employee.jobTitle ?? ui('أخصائي مبيعات')}</Badge></div></div><div className="min-w-64 rounded-xl border border-primary/20 bg-background/80 p-4"><div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">{ui('تحقيق التارجت')}</span><strong className="text-primary nums">{toArabicDigits(summary.targetAchievement)}%</strong></div><div className="mt-3 h-3 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-gradient-to-l from-primary to-emerald-500" style={{ width: `${summary.targetAchievement}%` }} /></div><div className="mt-3 flex justify-between text-xs"><span>{ui('المبيعات')}: {money(summary.totalSales, locale)}</span><span>{ui('التارجت')}: {money(summary.target, locale)}</span></div></div></CardContent></Card>

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5"><ClubStatCard label={ui('اشتراكات الشهر')} value={summary.subscriptions} icon={CreditCard} tone="primary" /><ClubStatCard label={ui('العملاء')} value={summary.customers} icon={Users} tone="members" /><ClubStatCard label={ui('إجمالي المبيعات')} value={money(summary.totalSales, locale)} icon={TrendingUp} tone="revenue" /><ClubStatCard label={ui('المحصل')} value={money(summary.collected, locale)} icon={Banknote} tone="profit" /><ClubStatCard label={ui('المتبقي للتحصيل')} value={money(summary.outstanding, locale)} icon={WalletCards} tone="alert" /></div>

    <Card><CardHeader><CardTitle className="flex items-center gap-2"><Target className="size-5 text-primary" />{ui('اشتراكاتك خلال الشهر')}</CardTitle></CardHeader><CardContent>{subscriptions.length === 0 ? <div className="py-14 text-center text-muted-foreground">{ui('لا توجد اشتراكات مسجلة باسمك خلال الشهر المحدد')}</div> : <div className="overflow-x-auto rounded-xl border"><table className="w-full min-w-[950px] text-sm"><thead className="bg-muted/60 text-muted-foreground"><tr>{[ui('العميل'), ui('رقم الاشتراك'), ui('نوع الاشتراك'), ui('تاريخ التسجيل'), ui('قيمة الاشتراك'), ui('المحصل'), ui('المتبقي'), ui('الحالة')].map(h => <th key={h} className="p-3 text-start font-medium">{h}</th>)}</tr></thead><tbody>{subscriptions.map(item => <tr key={item.id} className="border-t hover:bg-muted/30"><td className="p-3 font-semibold">{item.customerName}</td><td className="p-3 nums">{item.subscriptionNumber}</td><td className="p-3">{item.subscriptionType ?? '—'}</td><td className="p-3">{dateText(item.registrationDate, locale)}</td><td className="p-3 font-semibold nums">{money(item.value, locale)}</td><td className="p-3 text-success nums">{money(item.paid, locale)}</td><td className="p-3 text-warning nums">{money(item.remaining, locale)}</td><td className="p-3"><Badge variant={item.status === 'active' ? 'success' : 'secondary'}>{ui(item.status === 'active' ? 'نشط' : item.status)}</Badge></td></tr>)}</tbody></table></div>}</CardContent></Card>
  </div>;
}
