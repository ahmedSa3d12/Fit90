import type { ColumnDef } from '@tanstack/react-table';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, ChevronLeft, ChevronRight, Clock, List, User } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/common/data-table';
import { PageHeader } from '@/components/common/page-header';
import { StatusBadge } from '@/components/common/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { chartColor } from '@/components/common/chart-card';
import { useFitnessT } from '@/hooks/use-fitness-t';
import { useLocale } from '@/store/locale';
import { api, apiError } from '@/lib/api';
import { usePaginatedList } from '@/lib/api-hooks';
import { formatDate, formatHm, localDateStr, localToday } from '@/lib/formatters';
import { useListQuery } from '@/lib/use-list-query';
import { cn, toArabicDigits, withAlpha } from '@/lib/utils';
import type { ClubClassRow } from '@/types/fitness';

interface CalendarEvent {
  id: number;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  trainerName: string;
  enrollmentCount: number;
  maxCapacity: number;
}

type ViewMode = 'month' | 'week' | 'day' | 'list';

// ── date helpers (all yyyy-mm-dd on the local timezone) ───────────────────────
function addDays(anchor: Date, n: number): Date {
  const d = new Date(anchor);
  d.setDate(d.getDate() + n);
  return d;
}
function startOfWeek(anchor: Date): Date {
  return addDays(anchor, -anchor.getDay());
}
function weekDays(anchor: Date): string[] {
  const s = startOfWeek(anchor);
  return Array.from({ length: 7 }, (_, i) => localDateStr(addDays(s, i)));
}
/** 6×7 grid covering the month that `anchor` falls in (leading/trailing days included). */
function monthGrid(anchor: Date): string[] {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const gridStart = startOfWeek(first);
  return Array.from({ length: 42 }, (_, i) => localDateStr(addDays(gridStart, i)));
}

/** Stable colour per class so the calendar reads as a colour-coded board. */
function eventColor(ev: { title: string; trainerName?: string }): string {
  const key = ev.title || ev.trainerName || '';
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return chartColor(h);
}

export function FitnessSchedulingPage() {
  const ft = useFitnessT();
  const qc = useQueryClient();
  const { isRtl, locale } = useLocale();
  const PrevIcon = isRtl ? ChevronRight : ChevronLeft;
  const NextIcon = isRtl ? ChevronLeft : ChevronRight;
  const today = localToday();

  const [view, setView] = useState<ViewMode>('week');
  const [anchor, setAnchor] = useState(() => new Date());
  const [selected, setSelected] = useState<CalendarEvent | null>(null);

  // Visible date span for the active calendar view.
  const span = useMemo(() => {
    if (view === 'month') {
      const g = monthGrid(anchor);
      return { from: g[0]!, to: g[41]!, days: g };
    }
    if (view === 'day') {
      const d = localDateStr(anchor);
      return { from: d, to: d, days: [d] };
    }
    const days = weekDays(anchor);
    return { from: days[0]!, to: days[6]!, days };
  }, [view, anchor]);

  const { params, setParams } = useListQuery({
    filters: { status: 'scheduled', dateFrom: today },
    pageSize: 50,
  });
  const { data, isLoading, isError, refetch } = usePaginatedList<ClubClassRow>('club-classes', params);

  const { data: events, refetch: refetchCalendar } = useQuery({
    queryKey: ['club-calendar', span.from, span.to],
    queryFn: async () => {
      const { data: r } = await api.get<CalendarEvent[]>('/club/calendar/events', {
        params: { from: span.from, to: span.to },
      });
      return r;
    },
    enabled: view !== 'list',
  });

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of events ?? []) {
      const list = map.get(e.date) ?? [];
      list.push(e);
      map.set(e.date, list);
    }
    for (const [, list] of map) list.sort((a, b) => a.startTime.localeCompare(b.startTime));
    return map;
  }, [events]);

  const sorted = useMemo(() => {
    const rows = [...(data?.data ?? [])];
    rows.sort((a, b) => {
      const d = a.classDate.localeCompare(b.classDate);
      return d !== 0 ? d : a.startTime.localeCompare(b.startTime);
    });
    return rows;
  }, [data?.data]);

  const step = (dir: 1 | -1) => {
    setAnchor((d) =>
      view === 'month'
        ? new Date(d.getFullYear(), d.getMonth() + dir, 1)
        : addDays(d, view === 'day' ? dir : dir * 7),
    );
  };

  const moveEvent = async (id: number, newDate: string) => {
    try {
      await api.patch(`/club/calendar/classes/${id}/move`, { classDate: newDate });
      toast.success(ft('scheduling.moved'));
      void refetchCalendar();
      void qc.invalidateQueries({ queryKey: ['club-classes'] });
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const rangeLabel = useMemo(() => {
    if (view === 'month') return formatDate(localDateStr(anchor), 'MMMM yyyy', locale);
    if (view === 'day') return formatDate(span.from, 'EEEE, d MMMM yyyy', locale);
    return `${formatDate(span.from, 'd MMM', locale)} — ${formatDate(span.to, 'd MMM yyyy', locale)}`;
  }, [view, span.from, span.to, anchor, locale]);

  const weekdayLabels = useMemo(
    () => weekDays(new Date(2023, 0, 1)).map((d) => formatDate(d, 'EEE', locale)),
    [locale],
  );

  const columns = useMemo<ColumnDef<ClubClassRow>[]>(
    () => [
      {
        accessorKey: 'classDate',
        header: ft('common.date'),
        cell: ({ getValue }) => (
          <span className="flex items-center gap-2">
            <CalendarDays className="size-4 text-primary" />
            {formatDate(getValue() as string, 'EEE d MMM', locale)}
          </span>
        ),
      },
      {
        accessorKey: 'startTime',
        header: ft('classes.startTime'),
        cell: ({ row }) => (
          <span className="nums">
            {formatHm(row.original.startTime, locale)} – {formatHm(row.original.endTime, locale)}
          </span>
        ),
      },
      { accessorKey: 'className', header: ft('classes.className') },
      {
        accessorKey: 'trainer',
        header: ft('common.trainer'),
        cell: ({ row }) => row.original.trainer?.name ?? '—',
      },
      {
        accessorKey: 'enrollmentCount',
        header: ft('common.enrolled'),
        cell: ({ row }) => (
          <span className="nums">
            {toArabicDigits(row.original.enrollmentCount)} / {toArabicDigits(row.original.maxCapacity)}
          </span>
        ),
      },
      {
        accessorKey: 'status',
        header: ft('common.status'),
        cell: ({ row }) => <StatusBadge status={row.original.status === 'scheduled' ? 'pending' : 'active'} />,
      },
    ],
    [ft, locale],
  );

  const VIEWS: ViewMode[] = ['month', 'week', 'day', 'list'];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader title={ft('scheduling.title')} description={ft('scheduling.upcoming')} />
        <div className="inline-flex rounded-lg border bg-card p-1">
          {VIEWS.map((v) => (
            <Button
              key={v}
              variant={view === v ? 'default' : 'ghost'}
              size="sm"
              className="h-8"
              onClick={() => setView(v)}
            >
              {v === 'list' ? <List className="me-1 h-4 w-4" /> : <CalendarDays className="me-1 h-4 w-4" />}
              {ft(`scheduling.${v}`)}
            </Button>
          ))}
        </div>
      </div>

      {view === 'list' ? (
        <DataTable
          columns={columns}
          data={sorted}
          total={data?.total ?? 0}
          page={params.page}
          pageSize={params.pageSize}
          onPageChange={(page) => setParams({ page })}
          isLoading={isLoading}
          isError={isError}
          onRetry={() => void refetch()}
        />
      ) : (
        <Card>
          <CardContent className="p-3 sm:p-4">
            {/* toolbar */}
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => step(-1)}>
                  <PrevIcon className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => step(1)}>
                  <NextIcon className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" className="h-9" onClick={() => setAnchor(new Date())}>
                  {ft('scheduling.today')}
                </Button>
              </div>
              <p className="text-base font-semibold">{rangeLabel}</p>
            </div>

            {view === 'month' && (
              <MonthView
                days={span.days}
                anchorMonth={anchor.getMonth()}
                today={today}
                weekdayLabels={weekdayLabels}
                eventsByDate={eventsByDate}
                onPick={(d) => {
                  setAnchor(new Date(`${d}T12:00:00`));
                  setView('day');
                }}
                onEvent={setSelected}
                onDropEvent={moveEvent}
                locale={locale}
              />
            )}
            {view === 'week' && (
              <WeekView
                days={span.days}
                today={today}
                eventsByDate={eventsByDate}
                onEvent={setSelected}
                onDropEvent={moveEvent}
                locale={locale}
                noClasses={ft('scheduling.noClasses')}
              />
            )}
            {view === 'day' && (
              <DayView
                events={eventsByDate.get(span.days[0]!) ?? []}
                onEvent={setSelected}
                locale={locale}
                emptyText={ft('scheduling.noClasses')}
              />
            )}

            <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              {ft('scheduling.dragHint')}
            </p>
          </CardContent>
        </Card>
      )}

      <EventDialog
        event={selected}
        onClose={() => setSelected(null)}
        locale={locale}
        t={{
          trainer: ft('scheduling.trainer'),
          capacity: ft('scheduling.capacity'),
        }}
      />
    </div>
  );
}

// ── event chip ────────────────────────────────────────────────────────────────
function EventChip({
  ev,
  locale,
  onEvent,
  compact,
}: {
  ev: CalendarEvent;
  locale: 'ar' | 'en';
  onEvent: (e: CalendarEvent) => void;
  compact?: boolean;
}) {
  const color = eventColor(ev);
  return (
    <button
      type="button"
      draggable
      onDragStart={(e) => e.dataTransfer.setData('classId', String(ev.id))}
      onClick={() => onEvent(ev)}
      style={{ backgroundColor: withAlpha(color, 0.14), borderInlineStartColor: color }}
      className={cn(
        'w-full truncate rounded-md border-s-2 px-2 py-1 text-start transition hover:brightness-110',
        compact ? 'text-[11px]' : 'text-xs',
      )}
      title={`${formatHm(ev.startTime, locale)} ${ev.title} · ${ev.trainerName}`}
    >
      <span className="nums font-semibold" style={{ color }}>
        {formatHm(ev.startTime, locale)}
      </span>{' '}
      <span className="font-medium text-foreground">{ev.title}</span>
      {!compact && ev.trainerName ? (
        <span className="block truncate text-[11px] text-muted-foreground">{ev.trainerName}</span>
      ) : null}
    </button>
  );
}

// ── month view ──────────────────────────────────────────────────────────────
function MonthView(props: {
  days: string[];
  anchorMonth: number;
  today: string;
  weekdayLabels: string[];
  eventsByDate: Map<string, CalendarEvent[]>;
  onPick: (d: string) => void;
  onEvent: (e: CalendarEvent) => void;
  onDropEvent: (id: number, date: string) => void;
  locale: 'ar' | 'en';
}) {
  const { days, anchorMonth, today, weekdayLabels, eventsByDate, onPick, onEvent, onDropEvent, locale } = props;
  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="grid grid-cols-7 border-b bg-muted/40">
        {weekdayLabels.map((w) => (
          <div key={w} className="px-2 py-2 text-center text-xs font-semibold text-muted-foreground">
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day, i) => {
          const inMonth = new Date(`${day}T12:00:00`).getMonth() === anchorMonth;
          const list = eventsByDate.get(day) ?? [];
          const isToday = day === today;
          return (
            <div
              key={day}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const id = Number(e.dataTransfer.getData('classId'));
                if (id) onDropEvent(id, day);
              }}
              className={cn(
                'min-h-[104px] border-b border-e p-1.5',
                (i + 1) % 7 === 0 && 'border-e-0',
                i >= 35 && 'border-b-0',
                !inMonth && 'bg-muted/20',
              )}
            >
              <button
                type="button"
                onClick={() => onPick(day)}
                className={cn(
                  'mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium transition-colors hover:bg-muted',
                  isToday && 'bg-primary text-primary-foreground hover:bg-primary',
                  !inMonth && 'text-muted-foreground/60',
                )}
              >
                {formatDate(day, 'd', locale)}
              </button>
              <div className="space-y-1">
                {list.slice(0, 3).map((ev) => (
                  <EventChip key={ev.id} ev={ev} locale={locale} onEvent={onEvent} compact />
                ))}
                {list.length > 3 && (
                  <button
                    type="button"
                    onClick={() => onPick(day)}
                    className="w-full rounded px-1 text-start text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    +{toArabicDigits(list.length - 3)}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── week view ───────────────────────────────────────────────────────────────
function WeekView(props: {
  days: string[];
  today: string;
  eventsByDate: Map<string, CalendarEvent[]>;
  onEvent: (e: CalendarEvent) => void;
  onDropEvent: (id: number, date: string) => void;
  locale: 'ar' | 'en';
  noClasses: string;
}) {
  const { days, today, eventsByDate, onEvent, onDropEvent, locale, noClasses } = props;
  return (
    <div className="grid gap-2 sm:grid-cols-7">
      {days.map((day) => {
        const list = eventsByDate.get(day) ?? [];
        const isToday = day === today;
        return (
          <div
            key={day}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const id = Number(e.dataTransfer.getData('classId'));
              if (id) onDropEvent(id, day);
            }}
            className={cn(
              'flex min-h-[140px] flex-col rounded-lg border p-2',
              isToday ? 'border-primary bg-primary/5' : 'bg-card',
            )}
          >
            <div className="mb-2 flex items-baseline justify-between">
              <span className={cn('text-xs font-semibold', isToday ? 'text-primary' : 'text-muted-foreground')}>
                {formatDate(day, 'EEE', locale)}
              </span>
              <span className={cn('nums text-sm font-bold', isToday && 'text-primary')}>
                {formatDate(day, 'd', locale)}
              </span>
            </div>
            <div className="flex-1 space-y-1">
              {list.length === 0 ? (
                <p className="pt-4 text-center text-[11px] text-muted-foreground/60">{noClasses}</p>
              ) : (
                list.map((ev) => <EventChip key={ev.id} ev={ev} locale={locale} onEvent={onEvent} />)
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── day view (time-ordered agenda) ────────────────────────────────────────────
function DayView(props: {
  events: CalendarEvent[];
  onEvent: (e: CalendarEvent) => void;
  locale: 'ar' | 'en';
  emptyText: string;
}) {
  const { events, onEvent, locale, emptyText } = props;
  if (events.length === 0) {
    return (
      <div className="flex min-h-[200px] flex-col items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
        <CalendarDays className="mb-2 h-8 w-8 opacity-40" />
        {emptyText}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {events.map((ev) => {
        const color = eventColor(ev);
        const full = ev.enrollmentCount >= ev.maxCapacity;
        return (
          <button
            key={ev.id}
            type="button"
            onClick={() => onEvent(ev)}
            style={{ borderInlineStartColor: color }}
            className="flex w-full items-center gap-4 rounded-lg border border-s-4 bg-card p-3 text-start transition-colors hover:bg-muted/50"
          >
            <div className="nums w-24 shrink-0 text-sm font-semibold" style={{ color }}>
              {formatHm(ev.startTime, locale)}
              <span className="block text-xs font-normal text-muted-foreground">
                {formatHm(ev.endTime, locale)}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{ev.title}</p>
              <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                <User className="h-3 w-3" /> {ev.trainerName || '—'}
              </p>
            </div>
            <span
              className={cn(
                'nums shrink-0 rounded-full px-2 py-0.5 text-xs font-medium',
                full ? 'bg-destructive/15 text-destructive' : 'bg-muted text-muted-foreground',
              )}
            >
              {toArabicDigits(ev.enrollmentCount)}/{toArabicDigits(ev.maxCapacity)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ── event details dialog ──────────────────────────────────────────────────────
function EventDialog(props: {
  event: CalendarEvent | null;
  onClose: () => void;
  locale: 'ar' | 'en';
  t: { trainer: string; capacity: string };
}) {
  const { event, onClose, locale, t } = props;
  return (
    <Dialog open={!!event} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        {event && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <span
                  className="inline-block h-3 w-3 rounded-full"
                  style={{ backgroundColor: eventColor(event) }}
                />
                {event.title}
              </DialogTitle>
            </DialogHeader>
            <dl className="space-y-3 text-sm">
              <Row
                icon={<CalendarDays className="h-4 w-4" />}
                value={formatDate(event.date, 'EEEE, d MMMM yyyy', locale)}
              />
              <Row
                icon={<Clock className="h-4 w-4" />}
                value={`${formatHm(event.startTime, locale)} – ${formatHm(event.endTime, locale)}`}
              />
              <Row icon={<User className="h-4 w-4" />} label={t.trainer} value={event.trainerName || '—'} />
              <Row
                label={t.capacity}
                value={`${toArabicDigits(event.enrollmentCount)} / ${toArabicDigits(event.maxCapacity)}`}
              />
            </dl>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Row({ icon, label, value }: { icon?: React.ReactNode; label?: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      {icon ? <span className="text-muted-foreground">{icon}</span> : null}
      {label ? <span className="text-muted-foreground">{label}:</span> : null}
      <span className="font-medium">{value}</span>
    </div>
  );
}
