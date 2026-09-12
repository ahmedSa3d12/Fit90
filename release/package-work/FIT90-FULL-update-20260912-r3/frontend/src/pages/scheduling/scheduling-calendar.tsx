import { CalendarDays, ChevronLeft, ChevronRight, Clock, Plus, Repeat, Wand2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useFitnessT } from '@/hooks/use-fitness-t';
import { useLocale } from '@/store/locale';
import { api, apiError } from '@/lib/api';
import { useFitnessResourceList, SELECT_CLS } from '../club/fitness/shared';
import { formatDate, formatHm, localDateStr, localToday } from '@/lib/formatters';
import { cn, toArabicDigits, withAlpha } from '@/lib/utils';
import {
  CATEGORY_DRAG_HINT,
  CATEGORY_LABEL,
  CATEGORY_WEEK_LABEL,
  type Category,
  type ScheduleRow,
  type ServiceRow,
  type TrainerRow,
} from './shared';
import { useSchedulingProviders } from './providers';

type ViewMode = 'month' | 'week' | 'day';

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
const startOfWeek = (d: Date) => addDays(d, -d.getDay());
const weekDays = (d: Date) => Array.from({ length: 7 }, (_, i) => localDateStr(addDays(startOfWeek(d), i)));
function monthGrid(d: Date) {
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  const gs = startOfWeek(first);
  return Array.from({ length: 42 }, (_, i) => localDateStr(addDays(gs, i)));
}

// ── week time-grid (Google-Calendar style) ───────────────────────────────────
const GRID_START = 6; // 6 AM
const GRID_END = 23; // 11 PM
const HOUR_H = 56; // px per hour
const hhToMin = (t: string) => {
  const [h, m] = t.split(':');
  return parseInt(h, 10) * 60 + parseInt(m ?? '0', 10);
};

function WeekTimeGrid({
  days,
  today,
  byDate,
  locale,
  colorOf,
  onEvent,
  onAdd,
  onDrop,
  addLabel,
}: {
  days: string[];
  today: string;
  byDate: Map<string, ScheduleRow[]>;
  locale: 'ar' | 'en';
  colorOf: (r: ScheduleRow) => string;
  onEvent: (r: ScheduleRow) => void;
  onAdd: (day: string) => void;
  onDrop: (id: number, day: string) => void;
  addLabel: string;
}) {
  const hours: number[] = [];
  for (let h = GRID_START; h <= GRID_END; h++) hours.push(h);
  const bodyH = (GRID_END - GRID_START) * HOUR_H;

  // Auto-scroll to the earliest slot in view (fallback 8 AM) so events aren't
  // hidden below an empty morning.
  const scrollRef = useRef<HTMLDivElement>(null);
  const earliestMin = useMemo(() => {
    let min = Infinity;
    for (const day of days) for (const r of byDate.get(day) ?? []) min = Math.min(min, hhToMin(r.startTime));
    return Number.isFinite(min) ? min : 8 * 60;
  }, [days, byDate]);
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = Math.max(0, ((earliestMin - GRID_START * 60) / 60) * HOUR_H - 24);
    }
  }, [earliestMin]);

  return (
    <div className="overflow-hidden rounded-lg border">
      {/* header: time-gutter spacer (right in RTL) + day columns */}
      <div className="flex border-b bg-muted/30">
        <div className="w-14 shrink-0" />
        {days.map((day) => {
          const isToday = day === today;
          return (
            <div key={day} className={cn('flex-1 border-s p-2 text-center', isToday && 'bg-primary/5')}>
              <div className={cn('text-xs font-semibold', isToday ? 'text-primary' : 'text-muted-foreground')}>
                {formatDate(day, 'EEEE', locale)}
              </div>
              <div className={cn('nums text-sm font-bold', isToday && 'text-primary')}>
                {formatDate(day, 'd MMM', locale)}
              </div>
              <button
                type="button"
                onClick={() => onAdd(day)}
                className="mt-1 inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] text-primary transition hover:bg-primary/10"
              >
                <Plus className="h-3 w-3" /> {addLabel}
              </button>
            </div>
          );
        })}
      </div>

      {/* body */}
      <div ref={scrollRef} className="max-h-[68vh] overflow-y-auto">
        <div className="flex" style={{ height: bodyH }}>
          {/* time gutter (rightmost in RTL) */}
          <div className="relative w-14 shrink-0">
            {hours.map((h) => (
              <div
                key={h}
                className="nums absolute inset-x-0 -translate-y-1/2 pe-1 text-center text-[10px] text-muted-foreground"
                style={{ top: (h - GRID_START) * HOUR_H }}
              >
                {formatHm(`${String(h).padStart(2, '0')}:00`, locale)}
              </div>
            ))}
          </div>
          {days.map((day) => {
            const list = byDate.get(day) ?? [];
            const isToday = day === today;
            return (
              <div
                key={day}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const id = Number(e.dataTransfer.getData('slotId'));
                  if (id) onDrop(id, day);
                }}
                className={cn('relative flex-1 border-s', isToday && 'bg-primary/5')}
              >
                {hours.map((h) => (
                  <div
                    key={h}
                    className="absolute inset-x-0 border-t border-border/50"
                    style={{ top: (h - GRID_START) * HOUR_H, height: HOUR_H }}
                  />
                ))}
                {list.map((r) => {
                  const start = hhToMin(r.startTime);
                  const end = hhToMin(r.endTime);
                  const top = ((start - GRID_START * 60) / 60) * HOUR_H;
                  const height = Math.max(20, ((end - start) / 60) * HOUR_H - 2);
                  const color = colorOf(r);
                  return (
                    <button
                      key={r.id}
                      type="button"
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData('slotId', String(r.id))}
                      onClick={() => onEvent(r)}
                      style={{ top, height, backgroundColor: withAlpha(color, 0.16), borderInlineStartColor: color }}
                      className="absolute inset-x-1 overflow-hidden rounded-md border-s-2 px-1.5 py-0.5 text-start transition hover:brightness-110"
                    >
                      <span className="nums text-[11px] font-semibold" style={{ color }}>
                        {formatHm(r.startTime, locale)}
                      </span>
                      <span className="block truncate text-[11px] font-medium text-foreground">{r.serviceName}</span>
                      {height > 42 && r.employeeName ? (
                        <span className="block truncate text-[10px] text-muted-foreground">{r.employeeName}</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function SchedulingCalendarPage({
  category,
  serviceId,
  employeeId,
  monthlyScheduleId,
  initialDate,
  initialView = 'week',
  status,
  readOnly = false,
  embedded = false,
}: {
  category?: Category;
  serviceId?: number;
  employeeId?: number;
  monthlyScheduleId?: number;
  initialDate?: Date;
  initialView?: ViewMode;
  status?: 'available';
  readOnly?: boolean;
  embedded?: boolean;
}) {
  const ft = useFitnessT();
  const qc = useQueryClient();
  const { isRtl, locale } = useLocale();
  const PrevIcon = isRtl ? ChevronRight : ChevronLeft;
  const NextIcon = isRtl ? ChevronLeft : ChevronRight;
  const today = localToday();

  const [view, setView] = useState<ViewMode>(initialView);
  const [anchor, setAnchor] = useState(() => initialDate ?? new Date());
  const [selected, setSelected] = useState<ScheduleRow | null>(null);
  const [dialog, setDialog] = useState<null | 'slot' | 'recurring' | 'bulk'>(null);
  const [presetDate, setPresetDate] = useState<string | null>(null);

  useEffect(() => setView(initialView), [initialView]);
  useEffect(() => {
    if (initialDate) setAnchor(initialDate);
  }, [initialDate?.getFullYear(), initialDate?.getMonth()]);

  const openSlotOn = (day: string) => {
    setPresetDate(day);
    setDialog('slot');
  };

  const { items: services } = useFitnessResourceList<ServiceRow>('scheduling/services');
  const { providers: trainers } = useSchedulingProviders(category);
  const employeeLabel =
    category === 'nutrition'
      ? ft('sched.nutritionSpecialist')
      : category === 'personal_training'
        ? ft('sched.trainer')
        : ft('sched.employee');
  // New-slot dialog service list: just the pinned service, or every active
  // service in the category, or (in the combined "all" view) every active one.
  const categoryServices = useMemo(
    () =>
      serviceId != null
        ? services.filter((s) => s.id === serviceId)
        : services.filter((s) => s.isActive && (category == null || s.category === category)),
    [services, category, serviceId],
  );

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

  const queryKey = [
    'scheduling-calendar',
    category ?? 'all',
    serviceId ?? 'all',
    employeeId ?? 'all',
    monthlyScheduleId ?? 'all',
    status ?? 'all',
    span.from,
    span.to,
  ];
  const { data: rows, refetch } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data } = await api.get<ScheduleRow[]>('/scheduling/schedules/calendar', {
        params: {
          // serviceId wins; else category; else nothing → every service (combined).
          ...(serviceId != null ? { serviceId } : category != null ? { category } : {}),
          ...(employeeId != null ? { employeeId } : {}),
          ...(monthlyScheduleId != null ? { monthlyScheduleId } : {}),
          ...(status ? { status } : {}),
          dateFrom: span.from,
          dateTo: span.to,
        },
      });
      return data;
    },
  });

  const byDate = useMemo(() => {
    const m = new Map<string, ScheduleRow[]>();
    for (const r of rows ?? []) {
      const l = m.get(r.slotDate) ?? [];
      l.push(r);
      m.set(r.slotDate, l);
    }
    for (const [, l] of m) l.sort((a, b) => a.startTime.localeCompare(b.startTime));
    return m;
  }, [rows]);

  const refresh = () => {
    void refetch();
    void qc.invalidateQueries({ queryKey: ['scheduling-calendar', category] });
    if (monthlyScheduleId != null) {
      void qc.invalidateQueries({ queryKey: ['service-monthly-schedules', category] });
    }
  };

  const step = (dir: 1 | -1) =>
    setAnchor((d) =>
      view === 'month'
        ? new Date(d.getFullYear(), d.getMonth() + dir, 1)
        : addDays(d, view === 'day' ? dir : dir * 7),
    );

  const rangeLabel = useMemo(() => {
    if (view === 'month') return formatDate(localDateStr(anchor), 'MMMM yyyy', locale);
    if (view === 'day') return formatDate(span.from, 'EEEE, d MMMM yyyy', locale);
    return `${formatDate(span.from, 'd MMM', locale)} — ${formatDate(span.to, 'd MMM yyyy', locale)}`;
  }, [view, span.from, span.to, anchor, locale]);

  const weekdayLabels = useMemo(
    () => weekDays(new Date(2023, 0, 1)).map((d) => formatDate(d, 'EEE', locale)),
    [locale],
  );

  const colorOf = (r: ScheduleRow) => r.color ?? '#1E6BA8';

  const Chip = ({ r }: { r: ScheduleRow }) => (
    <button
      type="button"
      draggable={!readOnly}
      onDragStart={(e) => e.dataTransfer.setData('slotId', String(r.id))}
      onClick={() => setSelected(r)}
      style={{ backgroundColor: withAlpha(colorOf(r), 0.14), borderInlineStartColor: colorOf(r) }}
      className="w-full truncate rounded-md border-s-2 px-2 py-1 text-start text-[11px] transition hover:brightness-110"
      title={`${formatHm(r.startTime, locale)} ${r.serviceName} · ${r.employeeName ?? ''}`}
    >
      <span className="nums font-semibold" style={{ color: colorOf(r) }}>
        {formatHm(r.startTime, locale)}
      </span>{' '}
      <span className="font-medium text-foreground">{r.serviceName}</span>
    </button>
  );

  const onDrop = async (id: number, date: string) => {
    try {
      await api.put(`/scheduling/schedules/${id}`, { slotDate: date });
      toast.success(ft('sched.updated'));
      refresh();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  return (
    <div className={embedded ? 'space-y-4' : 'space-y-6'}>
      <div className={cn('flex flex-wrap items-start gap-3', embedded ? 'justify-end' : 'justify-between')}>
        {!embedded && (
          <PageHeader
            title={`${ft('sched.title')}${category != null ? ` — ${ft(CATEGORY_LABEL[category])}` : ''}`}
          />
        )}
        <div className="flex flex-wrap gap-2">
          <div className="inline-flex rounded-lg border bg-card p-1">
            {(['month', 'week', 'day'] as ViewMode[]).map((v) => (
              <Button key={v} variant={view === v ? 'default' : 'ghost'} size="sm" className="h-8" onClick={() => setView(v)}>
                {ft(`sched.${v}`)}
              </Button>
            ))}
          </div>
          {!readOnly && (
            <>
              <Button size="sm" variant="outline" onClick={() => setDialog('recurring')}>
                <Repeat className="me-1 h-4 w-4" /> {ft('sched.recurring')}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setDialog('bulk')}>
                <Wand2 className="me-1 h-4 w-4" /> {ft('sched.bulk')}
              </Button>
              <Button size="sm" onClick={() => setDialog('slot')}>
                <Plus className="me-1 h-4 w-4" /> {ft('sched.newSlot')}
              </Button>
            </>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="p-3 sm:p-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => step(-1)}>
                <PrevIcon className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => step(1)}>
                <NextIcon className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" className="h-9" onClick={() => setAnchor(new Date())}>
                {ft('sched.today')}
              </Button>
            </div>
            <div className="text-end">
              <p className="text-base font-semibold">{rangeLabel}</p>
              {view === 'week' && (
                <p className="nums text-xs text-muted-foreground">
                  {ft(category ? CATEGORY_WEEK_LABEL[category] : 'sched.appointmentsThisWeek')}:{' '}
                  {toArabicDigits(rows?.length ?? 0)}
                </p>
              )}
            </div>
          </div>

          {view === 'month' ? (
            <div className="overflow-hidden rounded-lg border">
              <div className="grid grid-cols-7 border-b bg-muted/40">
                {weekdayLabels.map((w) => (
                  <div key={w} className="px-2 py-2 text-center text-xs font-semibold text-muted-foreground">
                    {w}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {span.days.map((day, i) => {
                  const inMonth = new Date(`${day}T12:00:00`).getMonth() === anchor.getMonth();
                  const list = byDate.get(day) ?? [];
                  return (
                    <div
                      key={day}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const id = Number(e.dataTransfer.getData('slotId'));
                        if (id && !readOnly) void onDrop(id, day);
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
                        onClick={() => {
                          setAnchor(new Date(`${day}T12:00:00`));
                          setView('day');
                        }}
                        className={cn(
                          'mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium hover:bg-muted',
                          day === today && 'bg-primary text-primary-foreground hover:bg-primary',
                          !inMonth && 'text-muted-foreground/60',
                        )}
                      >
                        {formatDate(day, 'd', locale)}
                      </button>
                      <div className="space-y-1">
                        {list.slice(0, 3).map((r) => (
                          <Chip key={r.id} r={r} />
                        ))}
                        {list.length > 3 && (
                          <p className="px-1 text-[11px] text-muted-foreground">+{toArabicDigits(list.length - 3)}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : view === 'week' ? (
            <WeekTimeGrid
              days={span.days}
              today={today}
              byDate={byDate}
              locale={locale}
              colorOf={colorOf}
              onEvent={setSelected}
              onAdd={openSlotOn}
              onDrop={(id, day) => void onDrop(id, day)}
              addLabel={ft('sched.add')}
            />
          ) : (
            <DayAgenda list={byDate.get(span.days[0]!) ?? []} locale={locale} onPick={setSelected} empty={ft('sched.noSlots')} />
          )}

          <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />{' '}
            {ft(category ? CATEGORY_DRAG_HINT[category] : 'sched.appointmentDragHint')}
          </p>
        </CardContent>
      </Card>

      {/* details */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-sm">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: colorOf(selected) }} />
                  {selected.serviceName}
                </DialogTitle>
              </DialogHeader>
              <dl className="space-y-2 text-sm">
                <p>{formatDate(selected.slotDate, 'EEEE, d MMMM yyyy', locale)}</p>
                <p className="nums">
                  {formatHm(selected.startTime, locale)} – {formatHm(selected.endTime, locale)}
                </p>
                <p>
                  {employeeLabel}: {selected.employeeName ?? '—'}
                </p>
                <p className="nums">
                  {ft('sched.capacity')}: {toArabicDigits(selected.bookedCount)} / {toArabicDigits(selected.capacity)}
                </p>
                <p>
                  {ft('sched.status')}: {ft(`sched.${selected.status}`)}
                </p>
              </dl>
              <DialogFooter>
                {!readOnly && <Button
                  variant="destructive"
                  onClick={async () => {
                    try {
                      await api.delete(`/scheduling/schedules/${selected.id}`);
                      toast.success(ft('sched.deleted'));
                      setSelected(null);
                      refresh();
                    } catch (e) {
                      toast.error(apiError(e));
                    }
                  }}
                >
                  {ft('sched.delete')}
                </Button>}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {!readOnly && <SlotDialogs
        mode={dialog}
        presetDate={presetDate}
        presetServiceId={serviceId}
        presetEmployeeId={employeeId}
        monthlyScheduleId={monthlyScheduleId}
        onClose={() => {
          setDialog(null);
          setPresetDate(null);
        }}
        onDone={refresh}
        services={categoryServices}
        trainers={trainers}
        employeeLabel={employeeLabel}
        ft={ft}
      />}
    </div>
  );
}

function DayAgenda({
  list,
  locale,
  onPick,
  empty,
}: {
  list: ScheduleRow[];
  locale: 'ar' | 'en';
  onPick: (r: ScheduleRow) => void;
  empty: string;
}) {
  if (list.length === 0) {
    return (
      <div className="flex min-h-[200px] flex-col items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
        <CalendarDays className="mb-2 h-8 w-8 opacity-40" />
        {empty}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {list.map((r) => {
        const color = r.color ?? '#1E6BA8';
        const full = r.bookedCount >= r.capacity;
        return (
          <button
            key={r.id}
            type="button"
            onClick={() => onPick(r)}
            style={{ borderInlineStartColor: color }}
            className="flex w-full items-center gap-4 rounded-lg border border-s-4 bg-card p-3 text-start transition-colors hover:bg-muted/50"
          >
            <div className="nums w-24 shrink-0 text-sm font-semibold" style={{ color }}>
              {formatHm(r.startTime, locale)}
              <span className="block text-xs font-normal text-muted-foreground">{formatHm(r.endTime, locale)}</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{r.serviceName}</p>
              <p className="truncate text-xs text-muted-foreground">{r.employeeName ?? '—'}</p>
            </div>
            <span
              className={cn(
                'nums shrink-0 rounded-full px-2 py-0.5 text-xs font-medium',
                full ? 'bg-destructive/15 text-destructive' : 'bg-muted text-muted-foreground',
              )}
            >
              {toArabicDigits(r.bookedCount)}/{toArabicDigits(r.capacity)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

const WEEKDAY_KEYS = [0, 1, 2, 3, 4, 5, 6];

function SlotDialogs({
  mode,
  presetDate,
  presetServiceId,
  presetEmployeeId,
  monthlyScheduleId,
  onClose,
  onDone,
  services,
  trainers,
  employeeLabel,
  ft,
}: {
  mode: null | 'slot' | 'recurring' | 'bulk';
  presetDate?: string | null;
  presetServiceId?: number;
  presetEmployeeId?: number;
  monthlyScheduleId?: number;
  onClose: () => void;
  onDone: () => void;
  services: ServiceRow[];
  trainers: TrainerRow[];
  employeeLabel: string;
  ft: (k: string, v?: Record<string, string | number>) => string;
}) {
  const [saving, setSaving] = useState(false);
  const [f, setF] = useState<Record<string, string>>({});
  const [weekdays, setWeekdays] = useState<number[]>([1]);
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));
  const val = (k: string, d = '') => f[k] ?? d;

  // Prefill the slot date + pinned service when the dialog opens.
  useEffect(() => {
    if (!mode) {
      setF({});
      return;
    }
    setF((s) => ({
      ...s,
      ...(presetDate ? { slotDate: presetDate } : {}),
      ...(presetServiceId != null ? { serviceId: String(presetServiceId) } : {}),
      ...(presetEmployeeId != null ? { employeeId: String(presetEmployeeId) } : {}),
    }));
  }, [mode, presetDate, presetServiceId, presetEmployeeId]);

  const toggleDay = (d: number) =>
    setWeekdays((w) => (w.includes(d) ? w.filter((x) => x !== d) : [...w, d]));

  const submit = async () => {
    if (!val('serviceId')) {
      toast.error(ft('sched.service'));
      return;
    }
    if (mode === 'slot' && (!val('bookingStartAt') || !val('bookingEndAt'))) {
      toast.error(ft('sched.bookingWindowPairRequired'));
      return;
    }
    if (
      mode === 'slot' &&
      new Date(val('bookingEndAt')).getTime() <= new Date(val('bookingStartAt')).getTime()
    ) {
      toast.error(ft('sched.bookingWindowOrderInvalid'));
      return;
    }
    setSaving(true);
    try {
      const common = {
        monthlyScheduleId,
        serviceId: Number(val('serviceId')),
        employeeId: val('employeeId') ? Number(val('employeeId')) : null,
        roomId: val('roomId') ? Number(val('roomId')) : null,
        capacity: val('capacity') ? Number(val('capacity')) : undefined,
        bookingStartAt: val('bookingStartAt') ? new Date(val('bookingStartAt')).toISOString() : undefined,
        bookingEndAt: val('bookingEndAt') ? new Date(val('bookingEndAt')).toISOString() : undefined,
      };
      if (mode === 'slot') {
        await api.post('/scheduling/schedules', {
          ...common,
          slotDate: val('slotDate'),
          startTime: val('startTime'),
          endTime: val('endTime'),
          bookingStartAt: new Date(val('bookingStartAt')).toISOString(),
          bookingEndAt: new Date(val('bookingEndAt')).toISOString(),
        });
        toast.success(ft('sched.created'));
      } else if (mode === 'recurring') {
        const r = await api.post('/scheduling/schedules/generate/recurring', {
          ...common,
          weekdays,
          dateFrom: val('dateFrom'),
          dateTo: val('dateTo'),
          startTime: val('startTime'),
          endTime: val('endTime'),
        });
        toast.success(ft('sched.generatedSlots', { n: r.data?.created ?? 0 }));
      } else if (mode === 'bulk') {
        const r = await api.post('/scheduling/schedules/generate/bulk', {
          ...common,
          weekdays,
          dateFrom: val('dateFrom'),
          dateTo: val('dateTo'),
          workStart: val('workStart'),
          workEnd: val('workEnd'),
          durationMin: Number(val('durationMin')) || 30,
          breakMin: Number(val('breakMin')) || 0,
        });
        toast.success(ft('sched.generatedSlots', { n: r.data?.created ?? 0 }));
      }
      onDone();
      onClose();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const title =
    mode === 'slot' ? ft('sched.newSlot') : mode === 'recurring' ? ft('sched.recurring') : ft('sched.bulk');

  return (
    <Dialog open={!!mode} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 space-y-1.5">
            <Label>{ft('sched.service')}</Label>
            <select className={SELECT_CLS} value={val('serviceId')} onChange={(e) => set('serviceId', e.target.value)}>
              <option value="">—</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>{employeeLabel}</Label>
            <select className={SELECT_CLS} value={val('employeeId')} onChange={(e) => set('employeeId', e.target.value)}>
              <option value="">—</option>
              {trainers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>{ft('sched.capacity')}</Label>
            <Input type="number" value={val('capacity')} onChange={(e) => set('capacity', e.target.value)} />
          </div>

          {mode === 'slot' && (
            <>
              <div className="space-y-1.5">
                <Label>{ft('sched.date')}</Label>
                <Input type="date" value={val('slotDate')} onChange={(e) => set('slotDate', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>{ft('sched.room')}</Label>
                <Input type="number" value={val('roomId')} onChange={(e) => set('roomId', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>{ft('sched.startTime')}</Label>
                <Input type="time" value={val('startTime')} onChange={(e) => set('startTime', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>{ft('sched.endTime')}</Label>
                <Input type="time" value={val('endTime')} onChange={(e) => set('endTime', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>{ft('sched.bookingStartAt')}</Label>
                <Input
                  className="cursor-pointer nums"
                  type="datetime-local"
                  value={val('bookingStartAt')}
                  onClick={(e) => e.currentTarget.showPicker?.()}
                  onChange={(e) => set('bookingStartAt', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{ft('sched.bookingEndAt')}</Label>
                <Input
                  className="cursor-pointer nums"
                  type="datetime-local"
                  min={val('bookingStartAt')}
                  value={val('bookingEndAt')}
                  onClick={(e) => e.currentTarget.showPicker?.()}
                  onChange={(e) => set('bookingEndAt', e.target.value)}
                />
              </div>
            </>
          )}

          {(mode === 'recurring' || mode === 'bulk') && (
            <>
              <div className="space-y-1.5">
                <Label>{ft('sched.dateFrom')}</Label>
                <Input type="date" value={val('dateFrom')} onChange={(e) => set('dateFrom', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>{ft('sched.dateTo')}</Label>
                <Input type="date" value={val('dateTo')} onChange={(e) => set('dateTo', e.target.value)} />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>{ft('sched.weekdays')}</Label>
                <div className="flex flex-wrap gap-1.5">
                  {WEEKDAY_KEYS.map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => toggleDay(d)}
                      className={cn(
                        'h-8 w-10 rounded-md border text-xs font-medium transition',
                        weekdays.includes(d) ? 'border-primary bg-primary text-primary-foreground' : 'bg-card',
                      )}
                    >
                      {formatDate(localDateStr(new Date(2023, 0, 1 + d)), 'EEE')}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {mode === 'recurring' && (
            <>
              <div className="space-y-1.5">
                <Label>{ft('sched.startTime')}</Label>
                <Input type="time" value={val('startTime')} onChange={(e) => set('startTime', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>{ft('sched.endTime')}</Label>
                <Input type="time" value={val('endTime')} onChange={(e) => set('endTime', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>{ft('sched.bookingStart')}</Label>
                <Input type="datetime-local" value={val('bookingStartAt')} onChange={(e) => set('bookingStartAt', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>{ft('sched.bookingEnd')}</Label>
                <Input type="datetime-local" value={val('bookingEndAt')} onChange={(e) => set('bookingEndAt', e.target.value)} />
              </div>
            </>
          )}

          {mode === 'bulk' && (
            <>
              <div className="space-y-1.5">
                <Label>{ft('sched.workStart')}</Label>
                <Input type="time" value={val('workStart')} onChange={(e) => set('workStart', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>{ft('sched.workEnd')}</Label>
                <Input type="time" value={val('workEnd')} onChange={(e) => set('workEnd', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>{ft('sched.duration')}</Label>
                <Input type="number" value={val('durationMin')} onChange={(e) => set('durationMin', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>{ft('sched.breakMin')}</Label>
                <Input type="number" value={val('breakMin')} onChange={(e) => set('breakMin', e.target.value)} />
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {ft('sched.cancel')}
          </Button>
          <Button onClick={() => void submit()} disabled={saving}>
            {mode === 'slot' ? ft('sched.save') : ft('sched.generate')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
