import { useQuery } from '@tanstack/react-query';
import { CalendarClock, CalendarX, Gauge, Users } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { StatusBadge, type StatusKey } from '@/components/common/status-badge';
import { useFitnessT } from '@/hooks/use-fitness-t';
import { api } from '@/lib/api';
import { formatDate, formatHm } from '@/lib/formatters';
import { toArabicDigits } from '@/lib/utils';
import { BOOKING_BADGE, type BookingStatus } from './shared';

interface Summary {
  totals: { schedules: number; bookings: number; cancelled: number; totalCapacity: number; totalBooked: number; occupancyPct: number };
  bookingsByStatus: { status: string; count: number }[];
  mostBookedServices: { serviceId: number; name: string; count: number }[];
  mostActiveCoaches: { employeeId: number | null; name: string; count: number }[];
  upcoming: { id: number; memberName: string | null; serviceName: string | null; date: string; startTime: string | null; status: string }[];
  cancelled: { id: number; memberName: string | null; serviceName: string | null; date: string; startTime: string | null }[];
}

export function SchedulingDashboardPage() {
  const ft = useFitnessT();
  const { data } = useQuery({
    queryKey: ['scheduling-dashboard'],
    queryFn: async () => (await api.get<Summary>('/scheduling/dashboard')).data,
  });
  const t = data?.totals;

  const stats = [
    { icon: CalendarClock, label: ft('sched.totalSchedules'), value: t?.schedules ?? 0 },
    { icon: Users, label: ft('sched.totalBookings'), value: t?.bookings ?? 0 },
    { icon: Gauge, label: ft('sched.occupancy'), value: `${toArabicDigits(t?.occupancyPct ?? 0)}%`, raw: true },
    { icon: CalendarX, label: ft('sched.recentCancelled'), value: t?.cancelled ?? 0 },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={ft('sched.dashboard')} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="flex items-center gap-4 p-5">
              <div className="rounded-xl bg-primary/10 p-3 text-primary">
                <s.icon className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{s.label}</p>
                <p className="nums text-2xl font-bold">{s.raw ? s.value : toArabicDigits(s.value as number)}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <LeaderCard title={ft('sched.mostBooked')} rows={(data?.mostBookedServices ?? []).map((r) => ({ name: r.name, count: r.count }))} />
        <LeaderCard title={ft('sched.topCoaches')} rows={(data?.mostActiveCoaches ?? []).map((r) => ({ name: r.name, count: r.count }))} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="p-4">
            <h3 className="mb-3 font-semibold">{ft('sched.upcoming')}</h3>
            <div className="space-y-2">
              {(data?.upcoming ?? []).length === 0 && <p className="text-sm text-muted-foreground">{ft('sched.noClasses')}</p>}
              {(data?.upcoming ?? []).map((b) => (
                <div key={b.id} className="flex items-center justify-between rounded-lg border p-2 text-sm">
                  <div>
                    <p className="font-medium">{b.serviceName ?? '—'}</p>
                    <p className="text-xs text-muted-foreground">{b.memberName ?? '—'}</p>
                  </div>
                  <div className="text-end">
                    <p className="nums">{formatDate(b.date, 'EEE d MMM')}</p>
                    <p className="nums text-xs text-muted-foreground">{b.startTime ? formatHm(b.startTime) : ''}</p>
                  </div>
                  <StatusBadge
                    status={(BOOKING_BADGE[b.status as BookingStatus] ?? 'info') as StatusKey}
                    label={ft(`sched.${b.status === 'no_show' ? 'noShow' : b.status}`)}
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <h3 className="mb-3 font-semibold">{ft('sched.recentCancelled')}</h3>
            <div className="space-y-2">
              {(data?.cancelled ?? []).length === 0 && <p className="text-sm text-muted-foreground">{ft('sched.noClasses')}</p>}
              {(data?.cancelled ?? []).map((b) => (
                <div key={b.id} className="flex items-center justify-between rounded-lg border p-2 text-sm">
                  <div>
                    <p className="font-medium">{b.serviceName ?? '—'}</p>
                    <p className="text-xs text-muted-foreground">{b.memberName ?? '—'}</p>
                  </div>
                  <p className="nums text-xs text-muted-foreground">{formatDate(b.date, 'EEE d MMM')}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function LeaderCard({ title, rows }: { title: string; rows: { name: string; count: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <Card>
      <CardContent className="p-4">
        <h3 className="mb-3 font-semibold">{title}</h3>
        <div className="space-y-2">
          {rows.length === 0 && <p className="text-sm text-muted-foreground">—</p>}
          {rows.map((r, i) => (
            <div key={i} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="truncate">{r.name}</span>
                <span className="nums font-medium">{toArabicDigits(r.count)}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${(r.count / max) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
