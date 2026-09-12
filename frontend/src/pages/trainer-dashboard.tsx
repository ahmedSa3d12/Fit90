import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  CreditCard,
  Dumbbell,
  Phone,
  Target,
  Users,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/common/page-header';
import { ClubStatCard } from '@/components/club/stat-card';
import { ErrorState } from '@/components/common/states';
import { PageSkeleton } from '@/components/common/page-skeleton';
import { TargetCommissionCard } from '@/components/dashboard/target-commission-card';
import { uploadUrl } from '@/components/employees/use-uploads';
import { api } from '@/lib/api';
import { initials, toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';

interface TrainerSubscription {
  id: number;
  memberId: number | null;
  memberCode: string | null;
  memberName: string;
  memberPhone: string | null;
  subscriptionNumber: string;
  subscriptionType: string | null;
  startDate: string;
  endDate: string;
  sessionsTotal: number | null;
  sessionsUsed: number;
  sessionsRemaining: number;
  status: string;
}

interface TrainerAppointment {
  id: string;
  source: string;
  kind: string;
  className: string | null;
  title: string;
  category: string;
  date: string;
  startTime: string;
  endTime: string;
  status: string;
  memberNames: string[];
  bookingsCount: number;
  capacity: number;
}

type AppointmentFilter = 'all' | 'class' | 'personal_training' | 'spa' | 'nutrition';

interface TrainerDashboardData {
  month: string;
  trainer: {
    id: number;
    employeeId: number;
    name: string;
    specialization: string | null;
    imageUrl: string | null;
    target: string | null;
    commissionRate: string | null;
  };
  summary: {
    assignedMembers: number;
    activeSubscriptions: number;
    sessionsTotal: number;
    sessionsUsed: number;
    sessionsRemaining: number;
    monthAppointments: number;
    completedAppointments: number;
    remainingAppointments: number;
    monthlySubscriptions: number;
    totalSales: number;
    collected: number;
    outstanding: number;
    target: number;
    targetRemaining: number;
    targetAchievement: number;
    commissionRate: number;
    commissionAmount: number;
  };
  subscriptions: TrainerSubscription[];
  appointments: TrainerAppointment[];
}

function defaultMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function dateLabel(value: string, locale: string): string {
  const parsed = new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(locale === 'ar' ? 'ar-EG' : 'en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

function statusBadge(status: string, ui: (text: string) => string) {
  if (status === 'completed') return <Badge variant="success">{ui('تمت')}</Badge>;
  if (status === 'cancelled') return <Badge variant="destructive">{ui('ملغاة')}</Badge>;
  if (status === 'active') return <Badge variant="success">{ui('نشط')}</Badge>;
  if (status === 'expired') return <Badge variant="secondary">{ui('منتهي')}</Badge>;
  if (status === 'frozen') return <Badge variant="warning">{ui('مجمد')}</Badge>;
  return <Badge variant="default">{ui('قادمة')}</Badge>;
}

function appointmentKind(item: TrainerAppointment): AppointmentFilter {
  if (item.kind === 'class' || item.source === 'class') return 'class';
  if (item.kind === 'personal_training' || item.category === 'personal_training') return 'personal_training';
  if (item.kind === 'spa' || item.category === 'spa') return 'spa';
  if (item.kind === 'nutrition' || item.category === 'nutrition') return 'nutrition';
  return 'all';
}

function appointmentKindLabel(kind: AppointmentFilter, ui: (text: string) => string): string {
  if (kind === 'class') return ui('كلاس');
  if (kind === 'personal_training') return ui('تدريب شخصي');
  if (kind === 'spa') return ui('SPA');
  if (kind === 'nutrition') return ui('تغذية');
  return ui('موعد');
}

export function TrainerDashboardPage() {
  const { ui, locale } = useLocale();
  const [month, setMonth] = useState(defaultMonth());
  const [appointmentFilter, setAppointmentFilter] = useState<AppointmentFilter>('all');
  const query = useQuery({
    queryKey: ['me', 'trainer-dashboard', month],
    queryFn: async () => (await api.get<TrainerDashboardData>('/me/trainer-dashboard', { params: { month } })).data,
  });

  if (query.isLoading) return <PageSkeleton />;
  if (query.isError || !query.data) return <ErrorState onRetry={() => void query.refetch()} />;

  const { trainer, summary, subscriptions, appointments } = query.data;
  const performanceCard = summary.target > 0 ? (
    <TargetCommissionCard
      target={summary.target}
      collected={summary.collected}
      outstanding={summary.outstanding}
      subscriptions={summary.monthlySubscriptions}
      commissionRate={summary.commissionRate}
      commissionAmount={summary.commissionAmount}
      targetAchievement={summary.targetAchievement}
      targetRemaining={summary.targetRemaining}
      locale={locale}
      ui={ui}
    />
  ) : null;
  const progress = summary.sessionsTotal > 0
    ? Math.min(100, Math.round((summary.sessionsUsed / summary.sessionsTotal) * 100))
    : 0;
  const today = new Date().toISOString().slice(0, 10);
  const filteredAppointments = appointmentFilter === 'all'
    ? appointments
    : appointments.filter((item) => appointmentKind(item) === appointmentFilter);
  const upcoming = filteredAppointments.filter((item) => item.date >= today && item.status !== 'completed').slice(0, 8);
  const appointmentFilters: { id: AppointmentFilter; label: string; count: number }[] = [
    { id: 'all', label: ui('الكل'), count: appointments.length },
    { id: 'class', label: ui('كلاسات'), count: appointments.filter((item) => appointmentKind(item) === 'class').length },
    { id: 'personal_training', label: ui('تدريب شخصي'), count: appointments.filter((item) => appointmentKind(item) === 'personal_training').length },
    { id: 'spa', label: ui('SPA'), count: appointments.filter((item) => appointmentKind(item) === 'spa').length },
    { id: 'nutrition', label: ui('تغذية'), count: appointments.filter((item) => appointmentKind(item) === 'nutrition').length },
  ];

  return (
    <div className="space-y-6">
      {performanceCard}
      <PageHeader
        title={ui('لوحة المدرب')}
        description={ui('ملخص اشتراكاتك وحصصك ومواعيدك في مكان واحد')}
        actions={(
          <div className="flex items-center gap-2 rounded-xl border bg-card px-3 py-2 shadow-sm">
            <CalendarDays className="size-4 text-primary" />
            <Input
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value || defaultMonth())}
              className="h-8 w-40 border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
              aria-label={ui('الشهر')}
            />
          </div>
        )}
      />

      <Card className="relative overflow-hidden border-primary/20 bg-gradient-to-l from-primary/10 via-card to-card">
        <div className="pointer-events-none absolute -start-20 -top-24 size-64 rounded-full bg-primary/10 blur-3xl" />
        <CardContent className="relative flex flex-col gap-5 p-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <Avatar className="size-20 border-4 border-background shadow-lg">
              <AvatarImage src={uploadUrl(trainer.imageUrl) ?? undefined} alt="" />
              <AvatarFallback className="bg-primary text-xl font-bold text-primary-foreground">
                {initials(trainer.name)}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="text-sm text-muted-foreground">{ui('مرحباً بك')}</p>
              <h2 className="mt-1 text-2xl font-bold">{trainer.name}</h2>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge>{trainer.specialization ?? ui('مدرب')}</Badge>
                <span className="text-xs text-muted-foreground">{ui('بياناتك محدثة من ملف الموظف')}</span>
              </div>
            </div>
          </div>
          {trainer.target && (
            <div className="flex min-w-48 items-center gap-3 rounded-xl border border-primary/20 bg-background/75 p-4 backdrop-blur">
              <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Target className="size-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{ui('التارجت الشهري')}</p>
                <p className="mt-1 text-xl font-bold nums">{toArabicDigits(trainer.target)}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <ClubStatCard label={ui('المشتركين التابعين لك')} value={summary.assignedMembers} icon={Users} tone="members" />
        <ClubStatCard label={ui('الاشتراكات التابعة لك')} value={summary.activeSubscriptions} icon={CreditCard} tone="primary" />
        <ClubStatCard label={ui('حصص الشهر')} value={summary.monthAppointments} icon={Dumbbell} tone="classes" />
        <ClubStatCard label={ui('الحصص المتبقية')} value={summary.remainingAppointments} icon={Clock3} tone="alert" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1.25fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2"><Target className="size-5 text-primary" />{ui('استهلاك حصص الاشتراكات')}</span>
              <span className="text-sm font-normal text-muted-foreground nums">{toArabicDigits(progress)}%</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="h-3 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-gradient-to-l from-primary to-emerald-500 transition-all" style={{ width: `${progress}%` }} />
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-xl bg-muted/50 p-3"><p className="text-xs text-muted-foreground">{ui('الإجمالي')}</p><p className="mt-1 text-xl font-bold nums">{toArabicDigits(summary.sessionsTotal)}</p></div>
              <div className="rounded-xl bg-success/10 p-3"><p className="text-xs text-muted-foreground">{ui('تم أخذها')}</p><p className="mt-1 text-xl font-bold text-success nums">{toArabicDigits(summary.sessionsUsed)}</p></div>
              <div className="rounded-xl bg-warning/10 p-3"><p className="text-xs text-muted-foreground">{ui('المتبقي')}</p><p className="mt-1 text-xl font-bold text-warning nums">{toArabicDigits(summary.sessionsRemaining)}</p></div>
            </div>
            <div className="flex items-center justify-between border-t pt-4 text-sm">
              <span className="flex items-center gap-2 text-muted-foreground"><CheckCircle2 className="size-4 text-success" />{ui('مواعيد مكتملة هذا الشهر')}</span>
              <strong className="nums">{toArabicDigits(summary.completedAppointments)}</strong>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><CalendarDays className="size-5 text-primary" />{ui('المواعيد القادمة')}</CardTitle>
          </CardHeader>
          <CardContent>
            {upcoming.length === 0 ? (
              <div className="flex min-h-52 flex-col items-center justify-center text-center text-muted-foreground">
                <CalendarDays className="mb-3 size-10 opacity-40" />
                <p>{ui('لا توجد مواعيد قادمة في هذا الشهر')}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {upcoming.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-4 rounded-xl border border-border/60 bg-muted/20 p-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary">{appointmentKindLabel(appointmentKind(item), ui)}</Badge>
                        <p className="font-semibold">{appointmentKind(item) === 'class' ? `${ui('الكلاس')}: ${item.className ?? ui('غير محدد')}` : appointmentKindLabel(appointmentKind(item), ui)}</p>
                        {statusBadge(item.status, ui)}
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {item.memberNames.length ? item.memberNames.join('، ') : ui('لا يوجد حجز حتى الآن')} · {ui('الحجوزات')} {toArabicDigits(item.bookingsCount)} / {toArabicDigits(item.capacity)}
                      </p>
                    </div>
                    <div className="shrink-0 text-end">
                      <p className="text-sm font-medium">{dateLabel(item.date, locale)}</p>
                      <p className="mt-1 text-xs text-primary nums">{item.startTime.slice(0, 5)} – {item.endTime.slice(0, 5)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><CreditCard className="size-5 text-primary" />{ui('الاشتراكات التابعة لك')}</CardTitle>
        </CardHeader>
        <CardContent>
          {subscriptions.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">{ui('لا توجد اشتراكات مرتبطة بك خلال الشهر المحدد')}</div>
          ) : (
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full min-w-[850px] text-sm">
                <thead className="bg-muted/60 text-muted-foreground">
                  <tr>{[ui('المشترك'), ui('رقم الاشتراك'), ui('نوع الاشتراك'), ui('الفترة'), ui('الحصص'), ui('الحالة')].map((heading) => <th key={heading} className="p-3 text-start font-medium">{heading}</th>)}</tr>
                </thead>
                <tbody>
                  {subscriptions.map((subscription) => (
                    <tr key={subscription.id} className="border-t transition-colors hover:bg-muted/30">
                      <td className="p-3"><p className="font-semibold">{subscription.memberName}</p><p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><Phone className="size-3" />{subscription.memberPhone ?? '—'} · {subscription.memberCode ?? '—'}</p></td>
                      <td className="p-3 font-medium nums">{subscription.subscriptionNumber}</td>
                      <td className="p-3">{subscription.subscriptionType ?? '—'}</td>
                      <td className="p-3"><p>{dateLabel(subscription.startDate, locale)}</p><p className="text-xs text-muted-foreground">{ui('حتى')} {dateLabel(subscription.endDate, locale)}</p></td>
                      <td className="p-3"><div className="flex gap-2"><Badge variant="success">{ui('مأخوذ')} {toArabicDigits(subscription.sessionsUsed)}</Badge><Badge variant="warning">{ui('باقي')} {toArabicDigits(subscription.sessionsRemaining)}</Badge></div></td>
                      <td className="p-3">{statusBadge(subscription.status, ui)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="space-y-4">
            <CardTitle className="flex items-center gap-2"><Dumbbell className="size-5 text-primary" />{ui('كل حصص ومواعيد الشهر')}</CardTitle>
            <div className="flex flex-wrap gap-2">
              {appointmentFilters.map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  onClick={() => setAppointmentFilter(filter.id)}
                  className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${appointmentFilter === filter.id ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-muted/40 text-muted-foreground hover:bg-muted'}`}
                >
                  {filter.label} <span className="ms-1 nums">{toArabicDigits(filter.count)}</span>
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredAppointments.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">{ui('لا توجد حصص أو مواعيد خلال الشهر المحدد')}</div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {filteredAppointments.map((item) => {
                const kind = appointmentKind(item);
                return (
                <div key={item.id} className="rounded-xl border border-border/60 bg-muted/20 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <Badge variant="secondary">{appointmentKindLabel(kind, ui)}</Badge>
                      <p className="mt-2 font-semibold">{kind === 'class' ? `${ui('الكلاس')}: ${item.className ?? ui('غير محدد')}` : appointmentKindLabel(kind, ui)}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{kind === 'class' ? ui('حصة كلاس') : ui('موعد مقدم خدمة')}</p>
                    </div>
                    {statusBadge(item.status, ui)}
                  </div>
                  <div className="mt-4 flex items-center justify-between border-t pt-3 text-sm"><span>{dateLabel(item.date, locale)}</span><span className="text-primary nums">{item.startTime.slice(0, 5)} – {item.endTime.slice(0, 5)}</span></div>
                  <p className="mt-2 text-xs text-muted-foreground">{ui('الحجوزات')}: <span className="font-medium text-foreground nums">{toArabicDigits(item.bookingsCount)} / {toArabicDigits(item.capacity)}</span></p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">{item.memberNames.length ? item.memberNames.join('، ') : ui('لا يوجد حجز حتى الآن')}</p>
                </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
