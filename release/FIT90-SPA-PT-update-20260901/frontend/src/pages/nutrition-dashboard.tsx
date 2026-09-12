import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { CalendarDays, CheckCircle2, Clock3, Salad, Target, UserRoundCheck, Users } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ClubStatCard } from '@/components/club/stat-card';
import { PageHeader } from '@/components/common/page-header';
import { ErrorState } from '@/components/common/states';
import { PageSkeleton } from '@/components/common/page-skeleton';
import { uploadUrl } from '@/components/employees/use-uploads';
import { api, apiError } from '@/lib/api';
import { initials, toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';

interface NutritionDashboardData {
  month: string;
  employee: { id: number; providerId: number; name: string; jobTitle: string | null; imageUrl: string | null; target: string | null };
  summary: { scheduleSlots: number; bookings: number; completed: number; remaining: number; customers: number; availableSlots: number; target: number; targetAchievement: number };
  appointments: Array<{ id: string; scheduleId: number; serviceName: string; date: string; startTime: string; endTime: string; memberId: number | null; memberName: string | null; status: string; notes: string | null }>;
}

function currentMonth() { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`; }
function dateText(value: string, locale: string) { return new Date(`${value}T12:00:00`).toLocaleDateString(locale === 'ar' ? 'ar-EG' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short' }); }
function appointmentBadge(status: string, ui: (text: string) => string) { if (status === 'completed') return <Badge variant="success">{ui('مكتمل')}</Badge>; if (status === 'confirmed') return <Badge>{ui('مؤكد')}</Badge>; if (status === 'pending') return <Badge variant="warning">{ui('منتظر')}</Badge>; if (status === 'no_show') return <Badge variant="destructive">{ui('لم يحضر')}</Badge>; return <Badge variant="secondary">{ui('متاح')}</Badge>; }

export function NutritionDashboardPage() {
  const { ui, locale } = useLocale();
  const [month, setMonth] = useState(currentMonth());
  const query = useQuery({
    queryKey: ['me', 'nutrition-dashboard', month],
    queryFn: async () => (await api.get<NutritionDashboardData>('/me/nutrition-dashboard', { params: { month } })).data,
    retry: 4,
    retryDelay: (attempt) => Math.min(2_000 * (attempt + 1), 5_000),
    refetchOnMount: 'always',
  });
  if (query.isLoading) return <PageSkeleton />;
  if (query.isError || !query.data) {
    return <ErrorState message={apiError(query.error, ui('تعذر تحميل بيانات لوحة التغذية'))} onRetry={() => void query.refetch()} />;
  }
  const { employee, summary, appointments } = query.data;
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = appointments.filter(item => item.date >= today && item.status !== 'completed');

  return <div className="space-y-6">
    <PageHeader title={ui('لوحة أخصائي التغذية')} description={ui('جدولك ومواعيدك وحجوزات العملاء الخاصة بك')} actions={<div className="flex items-center gap-2 rounded-xl border bg-card px-3 py-2"><CalendarDays className="size-4 text-primary" /><Input type="month" value={month} onChange={(e) => setMonth(e.target.value || currentMonth())} className="h-8 w-40 border-0 bg-transparent p-0 shadow-none focus-visible:ring-0" /></div>} />

    <Card className="overflow-hidden border-emerald-500/20 bg-gradient-to-l from-emerald-500/10 via-card to-card"><CardContent className="flex flex-col gap-5 p-6 md:flex-row md:items-center md:justify-between"><div className="flex items-center gap-4"><Avatar className="size-20 border-4 border-background shadow-lg"><AvatarImage src={uploadUrl(employee.imageUrl) ?? undefined} /><AvatarFallback className="bg-emerald-600 text-xl font-bold text-white">{initials(employee.name)}</AvatarFallback></Avatar><div><p className="text-sm text-muted-foreground">{ui('مرحباً بك')}</p><h2 className="mt-1 text-2xl font-bold">{employee.name}</h2><Badge className="mt-2 bg-emerald-500/10 text-emerald-600">{employee.jobTitle ?? ui('أخصائي تغذية')}</Badge></div></div>{employee.target && <div className="flex min-w-52 items-center gap-3 rounded-xl border border-emerald-500/20 bg-background/80 p-4"><Target className="size-7 text-emerald-600" /><div><p className="text-xs text-muted-foreground">{ui('تارجت الجلسات')}</p><p className="mt-1 text-xl font-bold nums">{toArabicDigits(employee.target)}</p><p className="text-xs text-emerald-600">{ui('تم تحقيق')} {toArabicDigits(summary.targetAchievement)}%</p></div></div>}</CardContent></Card>

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6"><ClubStatCard label={ui('مواعيد الجدول')} value={summary.scheduleSlots} icon={CalendarDays} tone="classes" /><ClubStatCard label={ui('الحجوزات')} value={summary.bookings} icon={UserRoundCheck} tone="primary" /><ClubStatCard label={ui('جلسات مكتملة')} value={summary.completed} icon={CheckCircle2} tone="profit" /><ClubStatCard label={ui('جلسات متبقية')} value={summary.remaining} icon={Clock3} tone="alert" /><ClubStatCard label={ui('العملاء')} value={summary.customers} icon={Users} tone="members" /><ClubStatCard label={ui('مواعيد متاحة')} value={summary.availableSlots} icon={Salad} tone="spa" /></div>

    <div className="grid gap-6 xl:grid-cols-[1.15fr_.85fr]"><Card><CardHeader><CardTitle className="flex items-center gap-2"><CalendarDays className="size-5 text-emerald-600" />{ui('جدول وحجوزات الشهر')}</CardTitle></CardHeader><CardContent>{appointments.length === 0 ? <div className="py-14 text-center text-muted-foreground">{ui('لا توجد مواعيد تغذية خلال الشهر المحدد')}</div> : <div className="space-y-3">{appointments.map(item => <div key={item.id} className="rounded-xl border border-border/60 bg-muted/20 p-4"><div className="flex items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{item.serviceName}</p>{appointmentBadge(item.status, ui)}</div><p className="mt-1 text-sm text-muted-foreground">{item.memberName ?? ui('موعد متاح بدون حجز')}</p></div><div className="shrink-0 text-end"><p className="text-sm font-medium">{dateText(item.date, locale)}</p><p className="mt-1 text-xs text-emerald-600 nums">{item.startTime.slice(0, 5)} – {item.endTime.slice(0, 5)}</p></div></div>{item.notes && <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">{item.notes}</p>}</div>)}</div>}</CardContent></Card><Card><CardHeader><CardTitle className="flex items-center gap-2"><Clock3 className="size-5 text-primary" />{ui('المواعيد القادمة')}</CardTitle></CardHeader><CardContent>{upcoming.length === 0 ? <div className="py-14 text-center text-muted-foreground">{ui('لا توجد مواعيد قادمة')}</div> : <div className="space-y-2">{upcoming.slice(0, 10).map(item => <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl border p-3"><div className="min-w-0"><p className="truncate font-medium">{item.memberName ?? ui('متاح للحجز')}</p><p className="mt-1 truncate text-xs text-muted-foreground">{item.serviceName}</p></div><div className="shrink-0 text-end"><p className="text-sm">{dateText(item.date, locale)}</p><p className="text-xs text-primary nums">{item.startTime.slice(0, 5)}</p></div></div>)}</div>}</CardContent></Card></div>
  </div>;
}
