import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, CalendarRange, ChevronLeft, ChevronRight, Clock3, Pencil, Plus, TicketPlus, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { StatusBadge } from '@/components/common/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, apiError } from '@/lib/api';
import { useUi } from '@/store/locale';
import { SELECT_CLS } from '../club/fitness/shared';
import { NutritionBookingDialog } from './nutrition-availability-admin';
import { useSchedulingProviders } from './providers';
import type { BookingRow } from './shared';

type NutritionWindow = {
  id: number;
  slot_date: string;
  start_time: string;
  end_time: string;
  booking_start_at?: string | null;
  booking_end_at?: string | null;
  is_active: boolean;
  bookingCount?: number;
  booked_count?: number;
  cancelled_at?: string | null;
  cancellation_reason?: string | null;
};

type NutritionPlan = {
  id: number;
  employee_id: number;
  employeeId: number;
  month: number;
  year: number;
  status: 'draft' | 'published' | 'archived';
  trainer: { id: number; name: string };
  windows?: NutritionWindow[];
};

type BoardWindow = NutritionWindow & {
  planId: number;
  trainerId: number;
  trainerName: string;
};

type BookingDetails = BookingRow & {
  memberCode?: string | null;
  memberPhone?: string | null;
  createdAt?: string;
};

type WindowState = 'booking_available' | 'booking_not_started' | 'booking_closed' | 'cancelled' | 'appointment_started';
type WindowEditor = {
  mode: 'add' | 'edit';
  planId: string;
  windowId: number | null;
  slotDate: string;
  startTime: string;
  endTime: string;
  bookingStartAt: string;
  bookingEndAt: string;
};

const weekdays = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const dateLocale = () => typeof document !== 'undefined' && document.documentElement.lang === 'en' ? 'en-US' : 'ar-EG';
const dateKey = (year: number, month: number, day: number) => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
const time = (value: string | null | undefined) => value?.slice(0, 5) ?? '';

function stateOf(window: BoardWindow): WindowState {
  if (!window.is_active || window.cancelled_at) return 'cancelled';
  const now = new Date();
  const startsAt = new Date(`${window.slot_date}T${time(window.start_time)}:00`);
  if (now >= startsAt) return 'appointment_started';
  if (window.booking_start_at && now < new Date(window.booking_start_at)) return 'booking_not_started';
  if (window.booking_end_at && now > new Date(window.booking_end_at)) return 'booking_closed';
  return 'booking_available';
}

function stateLabel(state: WindowState, ui: (value: string) => string) {
  return {
    booking_available: ui('الحجز متاح'),
    booking_not_started: ui('لم يبدأ الحجز بعد'),
    booking_closed: ui('انتهت فترة الحجز'),
    cancelled: ui('ملغي'),
    appointment_started: ui('بدأ الموعد'),
  }[state];
}

function tone(state: WindowState) {
  if (state === 'booking_available') return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
  if (state === 'booking_not_started') return 'border-sky-500/45 bg-sky-500/15 text-sky-700 dark:text-sky-300';
  if (state === 'booking_closed') return 'border-rose-500/45 bg-rose-500/15 text-rose-700 dark:text-rose-300';
  if (state === 'cancelled') return 'border-red-600/60 bg-red-600/20 text-red-700 dark:text-red-200';
  return 'border-slate-500/35 bg-slate-500/10 text-slate-600 dark:text-slate-300';
}

export function NutritionAppointmentsAdmin() {
  const ui = useUi();
  const qc = useQueryClient();
  const now = new Date();
  const initial = { employeeId: '', month: String(now.getMonth() + 1), year: String(now.getFullYear()) };
  const [filters, setFilters] = useState(initial);
  const [applied, setApplied] = useState(initial);
  const [selectedWindow, setSelectedWindow] = useState<BoardWindow | null>(null);
  const [bookingWindow, setBookingWindow] = useState<BoardWindow | null>(null);
  const [detailsWindow, setDetailsWindow] = useState<BoardWindow | null>(null);
  const [editor, setEditor] = useState<WindowEditor | null>(null);
  const [editorSaving, setEditorSaving] = useState(false);

  const [restoreBooking, setRestoreBooking] = useState<BookingDetails | null>(null);
  const [restoreReason, setRestoreReason] = useState('');
  const { providers, isLoading: providersLoading } = useSchedulingProviders('nutrition');

  const plansQueryKey = ['nutrition-booking-board', applied];
  const { data: plans = [], isFetching, refetch } = useQuery({
    queryKey: plansQueryKey,
    queryFn: async () => (await api.get<NutritionPlan[]>('/scheduling/provider-monthly-availability', {
      params: {
        status: 'published',
        month: Number(applied.month),
        year: Number(applied.year),
        ...(applied.employeeId ? { employeeId: Number(applied.employeeId) } : {}),
      },
    })).data,
  });

  const allWindows = useMemo<BoardWindow[]>(() => plans.flatMap((plan) => (plan.windows ?? []).map((window) => ({
    ...window,
    planId: plan.id,
    trainerId: plan.employeeId ?? plan.employee_id,
    trainerName: plan.trainer.name,
  }))), [plans]);

  const detailsQuery = useQuery({
    queryKey: ['nutrition-window-bookings', detailsWindow?.id],
    enabled: detailsWindow != null,
    queryFn: async () => {
      const response = await api.get<{ data: BookingDetails[] }>('/scheduling/bookings', {
        params: {
          category: 'nutrition',
          employeeId: detailsWindow!.trainerId,
          dateFrom: detailsWindow!.slot_date,
          dateTo: detailsWindow!.slot_date,
          page: 1,
          pageSize: 200,
        },
      });
      return response.data.data.filter((booking) => (
        time(booking.startTime) >= time(detailsWindow!.start_time)
        && time(booking.endTime) <= time(detailsWindow!.end_time)
      ));
    },
  });

  const appliedMonth = Number(applied.month) || now.getMonth() + 1;
  const appliedYear = Number(applied.year) || now.getFullYear();
  const daysCount = new Date(appliedYear, appliedMonth, 0).getDate();
  const firstDay = new Date(appliedYear, appliedMonth - 1, 1).getDay();
  const byDate = new Map<string, BoardWindow[]>();
  allWindows.forEach((window) => byDate.set(window.slot_date, [...(byDate.get(window.slot_date) ?? []), window]));
  const availableCount = allWindows.filter((window) => stateOf(window) === 'booking_available').length;
  const bookingCount = allWindows.reduce((total, window) => total + (window.bookingCount ?? window.booked_count ?? 0), 0);
  const monthOffset = (appliedYear - now.getFullYear()) * 12 + appliedMonth - (now.getMonth() + 1);
  const displayedMonthLabel = monthOffset === 0 ? ui('الشهر الحالي') : monthOffset === 1 ? ui('الشهر التالي') : monthOffset === -1 ? ui('الشهر السابق') : new Date(appliedYear, appliedMonth - 1, 1).toLocaleDateString(dateLocale(), { month: 'long', year: 'numeric' });

  const changeMonth = (offset: number) => {
    const date = new Date(appliedYear, appliedMonth - 1 + offset, 1);
    const next = { ...applied, month: String(date.getMonth() + 1), year: String(date.getFullYear()) };
    setFilters(next);
    setApplied(next);
  };

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ['nutrition-booking-board'] });
    await qc.invalidateQueries({ queryKey: ['nutrition-window-bookings'] });
    await qc.invalidateQueries({ queryKey: ['department-bookings', 'nutrition'] });
  };

  const openAdd = () => {
    if (plans.length === 0) {
      toast.error(ui('لا يوجد جدول منشور لإضافة موعد إليه'));
      return;
    }
    setEditor({
      mode: 'add', planId: String(plans[0]!.id), windowId: null,
      slotDate: dateKey(appliedYear, appliedMonth, 1), startTime: '15:00', endTime: '20:00',
      bookingStartAt: '', bookingEndAt: '',
    });
  };

  const openEdit = (window: BoardWindow) => {
    const activeBookings = window.bookingCount ?? window.booked_count ?? 0;
    if (activeBookings > 0) {
      toast.error(ui('غير مسموح بتعديل هذا الموعد لوجود حجوزات بالفعل'));
      return;
    }
    setSelectedWindow(null);
    setEditor({
      mode: 'edit', planId: String(window.planId), windowId: window.id,
      slotDate: window.slot_date, startTime: time(window.start_time), endTime: time(window.end_time),
      bookingStartAt: window.booking_start_at?.slice(0, 16) ?? '',
      bookingEndAt: window.booking_end_at?.slice(0, 16) ?? '',
    });
  };

  const saveWindow = async () => {
    if (!editor) return;
    if (!editor.planId || !editor.slotDate || !editor.startTime || !editor.endTime || editor.endTime <= editor.startTime) {
      toast.error(ui('تأكد أن نهاية فترة الحضور بعد بدايتها'));
      return;
    }
    if (Boolean(editor.bookingStartAt) !== Boolean(editor.bookingEndAt)) {
      toast.error(ui('حددي فتح وغلق الحجز معًا أو اتركيهما فارغين'));
      return;
    }
    if (editor.bookingStartAt && editor.bookingEndAt && editor.bookingEndAt <= editor.bookingStartAt) {
      toast.error(ui('غلق الحجز يجب أن يكون بعد فتحه'));
      return;
    }
    setEditorSaving(true);
    try {
      const payload = {
        slotDate: editor.slotDate,
        startTime: editor.startTime,
        endTime: editor.endTime,
        repeatWeekly: false,
        bookingStartAt: editor.bookingStartAt ? new Date(editor.bookingStartAt).toISOString() : undefined,
        bookingEndAt: editor.bookingEndAt ? new Date(editor.bookingEndAt).toISOString() : undefined,
      };
      if (editor.mode === 'edit') {
        await api.patch(`/scheduling/provider-monthly-availability/${editor.planId}/windows/${editor.windowId}`, payload);
        toast.success(ui('تم تعديل الموعد'));
      } else {
        await api.post(`/scheduling/provider-monthly-availability/${editor.planId}/windows`, payload);
        toast.success(ui('تمت إضافة الموعد إلى الجدول المنشور'));
      }
      setEditor(null);
      await refresh();
      await refetch();
    } catch (error) { toast.error(ui(apiError(error))); } finally { setEditorSaving(false); }
  };

  const transition = async (booking: BookingDetails, status: 'completed' | 'cancelled' | 'no_show') => {
    try {
      await api.patch('/scheduling/bookings/nutrition/' + booking.id + '/status', { status });
      toast.success(ui(status === 'completed' ? 'تم تأكيد الحضور' : status === 'no_show' ? 'تم تسجيل عدم الحضور وخصم الحصة' : 'تم إلغاء الحجز'));
      await refresh();
      await detailsQuery.refetch();
    } catch (error) { toast.error(ui(apiError(error))); }
  };

  const restoreEntitlement = async () => {
    if (!restoreBooking || !restoreReason.trim()) return;
    try {
      await api.post('/scheduling/bookings/nutrition/' + restoreBooking.id + '/restore-no-show', { reason: restoreReason.trim() });
      toast.success(ui('تم استرجاع الحصة للعميل'));
      setRestoreBooking(null);
      setRestoreReason('');
      await detailsQuery.refetch();
    } catch (error) { toast.error(ui(apiError(error))); }
  };

  const cancelAttendance = async (window: BoardWindow) => {
    const reason = globalThis.prompt(ui('سبب إلغاء فترة الحضور'));
    if (!reason?.trim()) return;
    try {
      const response = await api.post<{ cancelledBookingsCount?: number }>(
        '/scheduling/provider-monthly-availability/' + window.planId + '/windows/' + window.id + '/cancel',
        { reason: reason.trim() },
      );
      toast.success(ui('تم إلغاء فترة الحضور والحجوزات المرتبطة') + ` (${response.data.cancelledBookingsCount ?? 0})`);
      setSelectedWindow(null);
      await refresh();
      await refetch();
    } catch (error) { toast.error(ui(apiError(error))); }
  };

  const rows = detailsQuery.data ?? [];
  return <div className="space-y-5">
    <Card><CardContent className="grid gap-3 pt-6 md:grid-cols-4">
      <div><Label>{ui('أخصائي التغذية')}</Label><select className={SELECT_CLS} value={filters.employeeId} onChange={(event) => setFilters({ ...filters, employeeId: event.target.value })}><option value="">{providersLoading ? ui('جارٍ تحميل الأخصائيين...') : ui('كل أخصائيي التغذية')}</option>{providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}</select></div>
      <div><Label>{ui('الشهر')}</Label><Input type="number" min="1" max="12" value={filters.month} onChange={(event) => setFilters({ ...filters, month: event.target.value })} /></div>
      <div><Label>{ui('السنة')}</Label><Input type="number" min="2000" value={filters.year} onChange={(event) => setFilters({ ...filters, year: event.target.value })} /></div>
      <Button className="self-end" onClick={() => setApplied({ ...filters })}>{ui('بحث')}</Button>
    </CardContent></Card>


    <div className="grid gap-3 sm:grid-cols-3">
      <Card><CardContent className="flex items-center justify-between pt-6"><div><p className="text-sm text-muted-foreground">{ui('إجمالي فترات الحضور')}</p><p className="mt-1 text-2xl font-bold">{allWindows.length}</p></div><CalendarRange className="size-8 text-primary" /></CardContent></Card>
      <Card><CardContent className="flex items-center justify-between pt-6"><div><p className="text-sm text-muted-foreground">{ui('الحجز متاح')}</p><p className="mt-1 text-2xl font-bold text-emerald-600">{availableCount}</p></div><TicketPlus className="size-8 text-emerald-500" /></CardContent></Card>
      <Card><CardContent className="flex items-center justify-between pt-6"><div><p className="text-sm text-muted-foreground">{ui('إجمالي الحجوزات')}</p><p className="mt-1 text-2xl font-bold text-amber-600">{bookingCount}</p></div><Users className="size-8 text-amber-500" /></CardContent></Card>
    </div>

    <Card className="overflow-hidden">
      <div className="border-b bg-muted/20 p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-xl font-bold">{new Date(appliedYear, appliedMonth - 1, 1).toLocaleDateString(dateLocale(), { month: 'long', year: 'numeric' })}</h3><p className="mt-1 text-sm text-muted-foreground">{ui('اضغط على فترة حضور الأخصائي للحجز أو إدارة الحجوزات أو إلغاء الفترة.')}</p></div><div className="flex flex-wrap items-center gap-2"><Button onClick={openAdd}><Plus className="me-1.5 size-4" />{ui('إضافة موعد')}</Button><Button size="icon" variant="outline" aria-label={ui('الشهر السابق')} onClick={() => changeMonth(-1)}><ChevronRight className="size-4" /></Button><Button variant="outline" className="pointer-events-none">{displayedMonthLabel}</Button><Button size="icon" variant="outline" aria-label={ui('الشهر التالي')} onClick={() => changeMonth(1)}><ChevronLeft className="size-4" /></Button></div></div>
        <div className="mt-4 flex flex-wrap gap-4 text-xs text-muted-foreground"><span className="flex items-center gap-2"><i className="size-2.5 rounded-full bg-emerald-500" />{ui('الحجز متاح')}</span><span className="flex items-center gap-2"><i className="size-2.5 rounded-full bg-sky-500" />{ui('لم يبدأ الحجز')}</span><span className="flex items-center gap-2"><i className="size-2.5 rounded-full bg-rose-500" />{ui('الحجز مغلق')}</span><span className="flex items-center gap-2"><i className="size-2.5 rounded-full bg-red-600" />{ui('موعد ملغي')}</span><span className="flex items-center gap-2"><i className="size-2.5 rounded-full bg-slate-500" />{ui('بدأ الموعد')}</span></div>
      </div>
      {isFetching && <div className="border-b bg-primary/5 p-3 text-center text-sm text-primary">{ui('جارٍ تحميل مواعيد الشهر...')}</div>}
      <div className="overflow-x-auto"><div className="grid min-w-[1050px] grid-cols-7 border-s border-t text-sm">
        {weekdays.map((day) => <div key={day} className="border-b border-e bg-muted/40 p-3 text-center font-bold">{ui(day)}</div>)}
        {Array.from({ length: firstDay }).map((_, index) => <div key={`empty-${index}`} className="min-h-44 border-b border-e bg-muted/10" />)}
        {Array.from({ length: daysCount }, (_, index) => index + 1).map((day) => { const dayWindows = byDate.get(dateKey(appliedYear, appliedMonth, day)) ?? []; return <div key={day} className="min-h-44 border-b border-e bg-card p-2 align-top"><div className="mb-2 flex items-center justify-between"><span className="flex size-7 items-center justify-center rounded-full bg-muted font-bold">{day}</span>{dayWindows.length > 0 && <span className="text-xs text-muted-foreground">{dayWindows.length} {ui('موعد')}</span>}</div><div className="space-y-2">{dayWindows.map((window) => { const state = stateOf(window); return <button key={window.id} type="button" onClick={() => setSelectedWindow(window)} className={`w-full rounded-lg border p-2 text-start transition hover:-translate-y-0.5 hover:shadow-md ${tone(state)}`}><span className="flex items-center gap-1 font-bold"><Clock3 className="size-3.5" />{time(window.start_time)} - {time(window.end_time)}</span><span className="mt-1 block truncate text-xs font-semibold">{window.trainerName}</span><span className="mt-1 block text-[10px]">{stateLabel(state, ui)} · {window.bookingCount ?? window.booked_count ?? 0} {ui('حجز')}</span></button>; })}</div></div>; })}
      </div></div>
      {!isFetching && allWindows.length === 0 && <div className="border-t p-8 text-center text-muted-foreground">{ui('لا توجد فترات حضور منشورة مطابقة للاختيارات في هذا الشهر.')}</div>}
    </Card>

    <Dialog open={selectedWindow != null} onOpenChange={(open) => !open && setSelectedWindow(null)}><DialogContent size="md" aria-describedby={undefined}><DialogHeader><DialogTitle>{ui('إدارة الموعد')}</DialogTitle></DialogHeader>{selectedWindow && <div className="space-y-5"><div className="rounded-2xl border bg-gradient-to-br from-primary/10 to-transparent p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xl font-bold">{ui('فترة حضور أخصائي التغذية')}</p><p className="mt-1 text-muted-foreground">{selectedWindow.trainerName}</p></div><span className={`rounded-full border px-3 py-1 text-xs font-bold ${tone(stateOf(selectedWindow))}`}>{stateLabel(stateOf(selectedWindow), ui)}</span></div><div className="mt-4 grid gap-3 text-sm sm:grid-cols-3"><div className="rounded-lg bg-background/70 p-3"><span className="text-muted-foreground">{ui('التاريخ')}</span><b className="mt-1 block">{new Date(`${selectedWindow.slot_date}T12:00:00`).toLocaleDateString(dateLocale())}</b></div><div className="rounded-lg bg-background/70 p-3"><span className="text-muted-foreground">{ui('الوقت')}</span><b className="mt-1 block">{time(selectedWindow.start_time)} - {time(selectedWindow.end_time)}</b></div><div className="rounded-lg bg-background/70 p-3"><span className="text-muted-foreground">{ui('الحجوزات')}</span><b className="mt-1 block">{selectedWindow.bookingCount ?? selectedWindow.booked_count ?? 0}</b></div></div></div><div className="grid gap-3 sm:grid-cols-2"><Button disabled={stateOf(selectedWindow) !== 'booking_available'} onClick={() => { setBookingWindow(selectedWindow); setSelectedWindow(null); }}><TicketPlus className="me-2 size-4" />{ui('حجز عضو')}</Button><Button variant="outline" onClick={() => { setDetailsWindow(selectedWindow); setSelectedWindow(null); }}><Users className="me-2 size-4" />{ui('الحجوزات وإلغاؤها')}</Button><Button variant="outline" disabled={['cancelled', 'appointment_started'].includes(stateOf(selectedWindow))} onClick={() => openEdit(selectedWindow)}><Pencil className="me-2 size-4" />{ui('تعديل الموعد')}</Button><Button variant="destructive" disabled={['cancelled', 'appointment_started'].includes(stateOf(selectedWindow))} onClick={() => void cancelAttendance(selectedWindow)}><Ban className="me-2 size-4" />{ui('إلغاء الموعد بالكامل')}</Button></div></div>}</DialogContent></Dialog>

    <Dialog open={editor != null} onOpenChange={(open) => !open && setEditor(null)}><DialogContent size="md" aria-describedby={undefined}><DialogHeader><DialogTitle>{ui(editor?.mode === 'edit' ? 'تعديل الموعد' : 'إضافة موعد إلى الجدول المنشور')}</DialogTitle></DialogHeader>{editor && <div className="space-y-4"><div><Label>{ui('جدول أخصائي التغذية')}</Label><select className={SELECT_CLS} value={editor.planId} disabled={editor.mode === 'edit'} onChange={(event) => setEditor({ ...editor, planId: event.target.value })}>{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.trainer.name} · {plan.month}/{plan.year}</option>)}</select></div><div className="grid gap-3 sm:grid-cols-3"><div><Label>{ui('التاريخ')}</Label><Input type="date" value={editor.slotDate} onChange={(event) => setEditor({ ...editor, slotDate: event.target.value })} /></div><div><Label>{ui('من الساعة')}</Label><Input type="time" value={editor.startTime} onChange={(event) => setEditor({ ...editor, startTime: event.target.value })} /></div><div><Label>{ui('إلى الساعة')}</Label><Input type="time" value={editor.endTime} onChange={(event) => setEditor({ ...editor, endTime: event.target.value })} /></div></div><div className="grid gap-3 sm:grid-cols-2"><div><Label>{ui('فتح الحجز (اختياري)')}</Label><Input type="datetime-local" value={editor.bookingStartAt} onChange={(event) => setEditor({ ...editor, bookingStartAt: event.target.value })} /></div><div><Label>{ui('غلق الحجز (اختياري)')}</Label><Input type="datetime-local" min={editor.bookingStartAt || undefined} value={editor.bookingEndAt} onChange={(event) => setEditor({ ...editor, bookingEndAt: event.target.value })} /></div></div><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setEditor(null)}>{ui('إلغاء')}</Button><Button disabled={editorSaving} onClick={() => void saveWindow()}>{editorSaving ? ui('جارٍ الحفظ...') : ui('حفظ الموعد')}</Button></div></div>}</DialogContent></Dialog>

    <NutritionBookingDialog open={bookingWindow != null} initialTrainerId={bookingWindow?.trainerId} initialDate={bookingWindow?.slot_date} initialWindowId={bookingWindow?.id} onClose={() => setBookingWindow(null)} onDone={() => void refresh()} />


    <Dialog open={detailsWindow != null} onOpenChange={(open) => !open && setDetailsWindow(null)}><DialogContent size="xl" aria-describedby={undefined}><DialogHeader><DialogTitle>{ui('تفاصيل الحجوزات')}</DialogTitle></DialogHeader>{detailsWindow && <div className="rounded-xl border bg-muted/20 p-4"><b>{detailsWindow.trainerName}</b><p>{detailsWindow.slot_date} · {time(detailsWindow.start_time)} - {time(detailsWindow.end_time)}</p></div>}{detailsQuery.isFetching ? <div className="p-8 text-center text-muted-foreground">{ui('جارٍ تحميل الحجوزات...')}</div> : rows.length === 0 ? <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">{ui('لا يوجد أعضاء حجزوا هذا الموعد')}</div> : <div className="max-h-[55vh] overflow-y-auto rounded-xl border"><table className="w-full text-sm"><thead className="sticky top-0 bg-muted"><tr>{['العضو', 'الخدمة', 'الوقت', 'المدة', 'التغطية والدفع', 'الحالة', 'الإجراءات'].map((heading) => <th key={heading} className="p-3 text-start">{ui(heading)}</th>)}</tr></thead><tbody>{rows.map((booking) => <tr key={booking.id} className="border-t"><td className="p-3 font-semibold">{booking.memberName ?? ui('غير محدد')}</td><td className="p-3">{booking.serviceName}</td><td className="p-3">{time(booking.startTime)} - {time(booking.endTime)}</td><td className="p-3">{booking.durationMin ?? '—'} {booking.durationMin ? ui('دقيقة') : ''}</td><td className="p-3">{booking.coverageType === 'subscription' ? <span className="font-semibold text-emerald-600">{ui('من الاشتراك')}</span> : <span className="font-semibold text-amber-600">{ui('مدفوع عند الحضور')} · {booking.priceSnapshot == null ? '—' : Number(booking.priceSnapshot).toFixed(2)}</span>}{booking.entitlementRestoredAt && <small className="block text-muted-foreground">{ui('تم استرجاع الحصة')}</small>}</td><td className="p-3"><StatusBadge status={booking.status === 'confirmed' || booking.status === 'completed' ? 'active' : booking.status === 'cancelled' || booking.status === 'no_show' ? 'expired' : 'pending'} label={ui(booking.status === 'confirmed' ? 'مؤكد' : booking.status === 'completed' ? 'مكتمل' : booking.status === 'cancelled' ? 'ملغي' : booking.status === 'no_show' ? 'لم يحضر' : 'قيد الانتظار')} /></td><td className="p-3"><div className="flex flex-wrap gap-2">{['pending', 'confirmed'].includes(booking.status) && <Button size="sm" onClick={() => void transition(booking, 'completed')}>{ui('تأكيد الحضور')}</Button>}{['pending', 'confirmed'].includes(booking.status) && <Button size="sm" variant="outline" onClick={() => void transition(booking, 'no_show')}>{ui('لم يحضر')}</Button>}{booking.status === 'no_show' && booking.coverageType === 'subscription' && !booking.entitlementRestoredAt && <Button size="sm" variant="outline" onClick={() => { setRestoreBooking(booking); setRestoreReason(''); }}>{ui('استرجاع الحصة')}</Button>}{['pending', 'confirmed', 'wait'].includes(booking.status) && <Button size="sm" variant="destructive" onClick={() => void transition(booking, 'cancelled')}>{ui('إلغاء الحجز')}</Button>}</div></td></tr>)}</tbody></table></div>}</DialogContent></Dialog>

    <Dialog open={restoreBooking != null} onOpenChange={(open) => !open && setRestoreBooking(null)}><DialogContent size="md" aria-describedby={undefined}><DialogHeader><DialogTitle>{ui('استرجاع حصة عدم الحضور')}</DialogTitle></DialogHeader><p className="text-sm text-muted-foreground">{ui('اكتب سبب الاسترجاع. سيظل الحجز مسجلًا كعدم حضور، لكن الحصة ستعود إلى رصيد العميل.')}</p><div><Label>{ui('سبب الاسترجاع')}</Label><Input value={restoreReason} onChange={(event) => setRestoreReason(event.target.value)} /></div><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setRestoreBooking(null)}>{ui('إلغاء')}</Button><Button disabled={!restoreReason.trim()} onClick={() => void restoreEntitlement()}>{ui('تأكيد الاسترجاع')}</Button></div></DialogContent></Dialog>
  </div>;
}
