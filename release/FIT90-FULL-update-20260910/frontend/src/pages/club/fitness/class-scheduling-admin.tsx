import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, CalendarDays, CalendarRange, ChevronLeft, ChevronRight, ClipboardList, Clock3, Pencil, Plus, Settings2, TicketCheck, TicketPlus, Users } from 'lucide-react';
import { Children, cloneElement, isValidElement, useState, type ReactElement, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { PageHeader } from '@/components/common/page-header';
import { StatusBadge } from '@/components/common/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { api, apiError } from '@/lib/api';
import { useArrayResource } from '@/lib/api-hooks';
import { useUi } from '@/store/locale';
import { SELECT_CLS, useFitnessResourceList } from './shared';

type MonthlySchedule = {
  id: number; month: number; year: number; status: string; published_at?: string | null;
  class: { id: number; name: string; class_name?: string }; trainer: { id: number; name: string };
  slots?: Slot[]; _count?: { slots: number };
};
type Slot = {
  id: number; start_at: string; end_at: string; booking_start_at?: string | null; booking_end_at?: string | null; capacity: number; status: string;
};
type AdditionalService = {
  id: number; name: string; description: string | null; durationMin: number; status: 'active' | 'inactive';
};
type Booking = {
  id: number; status: string; bookedAt: string; user: { user_id: number; name: string | null; email: string | null };
  additionalServices: Array<{ serviceId: number; name: string; status: string }>;
};
type AdminClassBooking = { id: number; status: string; bookedAt: string; member: { id: number; name: string; member_code?: string | null; phone?: string | null } | null; slot: { id: number; startAt: string; endAt: string }; class: { id: number; name: string }; trainer: { id: number; name: string }; additionalServices?: Array<{ serviceId: number; name: string; status: string }> };
type SlotAdditionalService = { id: number | null; serviceId: number; name: string; capacity: number; isRequired: boolean; isActive: boolean; serviceIsActive: boolean };
type AvailableSlot = {
  id: number; startAt: string; endAt: string; capacity: number; confirmedBookingsCount: number; waitingBookingsCount: number;
  bookingStartAt?: string | null; bookingEndAt?: string | null;
  remainingCapacity: number; bookingStatus: string; class: { id: number; name: string }; trainer: { id: number; name: string };
};
type SlotBookingDetail = {
  id: number; status: string; bookedAt: string; cancelledAt?: string | null;
  member: { id: number; name: string; member_code?: string | null; phone?: string | null } | null;
  additionalServices?: Array<{ serviceId: number; name: string; status: string }>;
};
type ClassServiceOption = { id: number; name: string; classTypeId: number | null; isActive: boolean };
type ClassTypeOption = { id: number; name: string };
type TrainerOption = { id: number; name: string; isActive: boolean };
type MemberOption = { id: number; name: string; memberCode: string; phone?: string | null };
type MemberFreeSessions = {
  class: { id: number; name: string };
  hasFreeSessions: boolean;
  total: number;
  used: number;
  remaining: number;
};

const normalizeSchedule = (schedule: MonthlySchedule): MonthlySchedule => ({
  ...schedule,
  class: { ...schedule.class, class_name: schedule.class.name },
});

const statusLabel = (status: string) => ({
  draft: 'مسودة', published: 'منشور', archived: 'مؤرشف', available: 'متاح', unavailable: 'غير متاح',
  cancelled: 'ملغي', confirmed: 'مؤكد', wait: 'انتظار', completed: 'مكتمل', no_show: 'لم يحضر',
  booking_not_started: 'لم يبدأ الحجز بعد', booking_available: 'الحجز متاح', booking_closed: 'انتهت فترة الحجز',
  fully_booked: 'مكتمل العدد', class_started: 'بدأ الكلاس',
}[status] ?? status);

const schedulingLocale = (): string => document.documentElement.lang === 'en' ? 'en-US' : 'ar-EG';

/**
 * This module predates the keyed locale files and contains a large amount of
 * inline Arabic copy. Keep it compatible with the application's existing
 * exact-copy translator so every label, table heading and dialog follows the
 * active locale without duplicating the scheduling screens.
 */
function translateSchedulingNode(node: ReactNode, ui: (text: string) => string): ReactNode {
  if (typeof node === 'string') return ui(node);
  if (Array.isArray(node)) return node.map((child) => translateSchedulingNode(child, ui));
  if (!isValidElement(node)) return node;

  const element = node as ReactElement<Record<string, unknown>>;
  const props = element.props;
  const translatedProps: Record<string, unknown> = {};
  for (const property of ['placeholder', 'title', 'aria-label', 'description', 'label', 'text'] as const) {
    if (typeof props[property] === 'string') translatedProps[property] = ui(props[property] as string);
  }
  if ('children' in props) {
    translatedProps.children = Children.map(props.children as ReactNode, (child) =>
      translateSchedulingNode(child, ui),
    );
  }
  return cloneElement(element, translatedProps);
}

function SchedulingTranslation({ children }: { children: ReactNode }) {
  const ui = useUi();
  return <>{translateSchedulingNode(children, ui)}</>;
}

function MonthlyScheduleCalendar({ scheduleId }: { scheduleId: number }) {
  const ui = useUi();
  const { data, refetch, isFetching } = useQuery({
    queryKey: ['admin-class-schedule-calendar', scheduleId],
    queryFn: async () => normalizeSchedule((await api.get<MonthlySchedule>(`/admin/class-schedules/${scheduleId}`)).data),
  });
  const [selectedDate, setSelectedDate] = useState('');
  const [editingSlot, setEditingSlot] = useState<Slot | null>(null);
  const emptySlot = () => ({ startTime: '18:00', endTime: '19:00', bookingStartAt: '', bookingEndAt: '', capacity: '20' });
  const [slotRows, setSlotRows] = useState([emptySlot()]);
  const [editRow, setEditRow] = useState(emptySlot());
  const [repeatWeekly, setRepeatWeekly] = useState(true);
  if (!data) return <Empty text="جارٍ تحميل التقويم..." />;

  const daysCount = new Date(data.year, data.month, 0).getDate();
  const firstDay = new Date(data.year, data.month - 1, 1).getDay();
  const dateKey = (day: number) => `${data.year}-${String(data.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const slotsForDate = (date: string) => (data.slots ?? []).filter((item) => {
    const value = new Date(item.start_at);
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}` === date;
  });
  const saveSlots = async () => {
    if (!selectedDate) return;
    try {
      for (const slot of slotRows) {
        const classStart = new Date(`${selectedDate}T${slot.startTime}:00`);
        const classEnd = new Date(`${selectedDate}T${slot.endTime}:00`);
        const bookingStart = slot.bookingStartAt ? new Date(slot.bookingStartAt) : null;
        const bookingEnd = slot.bookingEndAt ? new Date(slot.bookingEndAt) : null;
        if (classEnd <= classStart) {
          toast.error(ui('يجب أن تكون نهاية الكلاس بعد بدايته.'));
          return;
        }
        if ((bookingStart == null) !== (bookingEnd == null)) {
          toast.error(ui('حدد تاريخ ووقت فتح وغلق الحجز معًا.'));
          return;
        }
        if (bookingStart && bookingEnd && bookingEnd <= bookingStart) {
          toast.error(ui('يجب أن يكون تاريخ غلق الحجز بعد تاريخ فتح الحجز.'));
          return;
        }
        if (bookingEnd && bookingEnd > classStart) {
          toast.error(ui(`يجب أن يكون غلق الحجز قبل بداية الكلاس يوم ${selectedDate} الساعة ${slot.startTime}.`));
          return;
        }
        const startAt = classStart.toISOString();
        const endAt = classEnd.toISOString();
        const bookingStartAt = bookingStart?.toISOString();
        const bookingEndAt = bookingEnd?.toISOString();
        if (repeatWeekly) {
          if (!bookingStartAt || !bookingEndAt) {
            toast.error(ui('حدد تاريخ ووقت فتح وغلق الحجز للمواعيد الأسبوعية.'));
            return;
          }
          await api.post(`/admin/class-schedules/${scheduleId}/recurring-slots`, {
            weekDays: [new Date(`${selectedDate}T12:00:00`).getDay()],
            startTime: slot.startTime,
            endTime: slot.endTime,
            templateStartAt: startAt,
            bookingStartAt,
            bookingEndAt,
            capacity: Number(slot.capacity),
            status: 'available',
          });
        } else {
          await api.post(`/admin/class-schedules/${scheduleId}/slots`, {
            startAt,
            endAt,
            bookingStartAt,
            bookingEndAt,
            capacity: Number(slot.capacity),
            status: 'available',
          });
        }
      }
      toast.success(ui(repeatWeekly ? 'تم تطبيق مواعيد اليوم على كل الأيام المماثلة في الشهر' : `تمت إضافة ${slotRows.length} موعد`));
      await refetch();
      setSelectedDate('');
      setSlotRows([emptySlot()]);
    } catch (error) { toast.error(apiError(error)); }
  };
  const updateSlotRow = (index: number, key: keyof ReturnType<typeof emptySlot>, value: string) => setSlotRows((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: value } : row));
  const toLocalDateTimeInput = (value?: string | null) => {
    if (!value) return '';
    const date = new Date(value);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  };
  const beginEditSlot = (slot: Slot) => {
    setSelectedDate('');
    setEditingSlot(slot);
    setEditRow({
      startTime: toLocalDateTimeInput(slot.start_at),
      endTime: toLocalDateTimeInput(slot.end_at),
      bookingStartAt: toLocalDateTimeInput(slot.booking_start_at),
      bookingEndAt: toLocalDateTimeInput(slot.booking_end_at),
      capacity: String(slot.capacity),
    });
  };
  const saveEditedSlot = async () => {
    if (!editingSlot || !editRow.startTime || !editRow.endTime) return;
    try {
      await api.patch(`/admin/class-schedule-slots/${editingSlot.id}`, {
        startAt: new Date(editRow.startTime).toISOString(),
        endAt: new Date(editRow.endTime).toISOString(),
        bookingStartAt: editRow.bookingStartAt ? new Date(editRow.bookingStartAt).toISOString() : undefined,
        bookingEndAt: editRow.bookingEndAt ? new Date(editRow.bookingEndAt).toISOString() : undefined,
        capacity: Number(editRow.capacity),
      });
      toast.success(ui('تم تعديل الموعد'));
      setEditingSlot(null);
      await refetch();
    } catch (error) { toast.error(apiError(error)); }
  };

  return <SchedulingTranslation><Card className="border-primary/30">
    <CardHeader><CardTitle>تقويم {data.class.name} — {data.month}/{data.year}</CardTitle></CardHeader>
    <CardContent className="space-y-5">
      <div className="grid grid-cols-7 gap-2 text-center text-sm">
        {['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'].map((day) => <div key={day} className="py-2 font-semibold text-muted-foreground">{day}</div>)}
        {Array.from({ length: firstDay }).map((_, index) => <div key={`empty-${index}`} />)}
        {Array.from({ length: daysCount }, (_, index) => index + 1).map((day) => {
          const date = dateKey(day); const count = slotsForDate(date).length;
          return <button key={day} type="button" onClick={() => { setSelectedDate(date); setSlotRows([emptySlot()]); }} className={`min-h-24 rounded-xl border p-2 text-start transition hover:border-primary ${selectedDate === date ? 'border-primary bg-primary/10' : 'bg-card'}`}>
            <span className="font-bold">{day}</span>
            {count > 0 && <div className="mt-2 space-y-1">
              {slotsForDate(date).slice(0, 3).map((slot) => <div key={slot.id} className="rounded-md bg-primary/15 px-2 py-1 text-xs font-semibold text-primary">
                {new Date(slot.start_at).toLocaleTimeString(schedulingLocale(), { hour: '2-digit', minute: '2-digit' })}
              </div>)}
              {count > 3 && <div className="text-xs text-muted-foreground">+ {count - 3} مواعيد أخرى</div>}
            </div>}
          </button>;
        })}
      </div>
      <Dialog open={Boolean(selectedDate)} onOpenChange={(open) => { if (!open) setSelectedDate(''); }}>
        <DialogContent size="form" aria-describedby={undefined}>
          <DialogHeader><DialogTitle>إضافة مواعيد يوم {selectedDate}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {slotRows.map((slot, index) => <div key={index} className="space-y-3 rounded-xl border bg-muted/20 p-4">
              <div className="flex items-center justify-between"><b>الموعد {index + 1}</b>{slotRows.length > 1 && <Button size="sm" variant="destructive" onClick={() => setSlotRows((rows) => rows.filter((_, rowIndex) => rowIndex !== index))}>حذف</Button>}</div>
              <div className="grid gap-3 md:grid-cols-5">
                <div><Label>من</Label><Input type="time" value={slot.startTime} onChange={(e) => updateSlotRow(index, 'startTime', e.target.value)} /></div>
                <div><Label>إلى</Label><Input type="time" value={slot.endTime} onChange={(e) => updateSlotRow(index, 'endTime', e.target.value)} /></div>
                <div><Label>تاريخ ووقت فتح الحجز</Label><Input type="datetime-local" max={`${selectedDate}T${slot.startTime}`} value={slot.bookingStartAt} onChange={(e) => updateSlotRow(index, 'bookingStartAt', e.target.value)} /></div>
                <div><Label>تاريخ ووقت غلق الحجز</Label><Input type="datetime-local" min={slot.bookingStartAt || undefined} max={`${selectedDate}T${slot.startTime}`} value={slot.bookingEndAt} onChange={(e) => updateSlotRow(index, 'bookingEndAt', e.target.value)} /></div>
                <div><Label>السعة</Label><Input type="number" min="1" value={slot.capacity} onChange={(e) => updateSlotRow(index, 'capacity', e.target.value)} /></div>
              </div>
            </div>)}
            <Button variant="outline" onClick={() => setSlotRows((rows) => [...rows, emptySlot()])}><Plus className="me-1 size-4" />إضافة موعد آخر</Button>
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border bg-primary/5 p-4">
              <input type="checkbox" className="mt-1 size-4 accent-primary" checked={repeatWeekly} onChange={(e) => setRepeatWeekly(e.target.checked)} />
              <span><b>تكرار أسبوعي تلقائي</b><small className="mt-1 block text-muted-foreground">يُطبّق كل موعد على نفس يوم الأسبوع طوال الشهر، مع الحفاظ على نفس فرق فتح وغلق الحجز من موعد الكلاس.</small></span>
            </label>
            {slotsForDate(selectedDate).length > 0 && <div className="space-y-2"><b>المواعيد المسجلة بالفعل</b>{slotsForDate(selectedDate).map((item) => <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border p-3"><span>{new Date(item.start_at).toLocaleTimeString(schedulingLocale(), { hour: '2-digit', minute: '2-digit' })} — {new Date(item.end_at).toLocaleTimeString(schedulingLocale(), { hour: '2-digit', minute: '2-digit' })} · السعة {item.capacity}</span><Button size="sm" variant="outline" onClick={() => beginEditSlot(item)}><Pencil className="me-1 size-3.5" />تعديل</Button></div>)}</div>}
            <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setSelectedDate('')}>إلغاء</Button><Button disabled={isFetching} onClick={() => void saveSlots()}>{repeatWeekly ? 'حفظ وتطبيق أسبوعيًا' : 'حفظ كل مواعيد اليوم'}</Button></div>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={editingSlot != null} onOpenChange={(open) => { if (!open) setEditingSlot(null); }}>
        <DialogContent size="form" aria-describedby={undefined}>
          <DialogHeader><DialogTitle>تعديل الموعد</DialogTitle></DialogHeader>
          <div className="grid gap-3 md:grid-cols-5">
            <div><Label>من</Label><Input type="datetime-local" value={editRow.startTime} onChange={(e) => setEditRow({ ...editRow, startTime: e.target.value })} /></div>
            <div><Label>إلى</Label><Input type="datetime-local" value={editRow.endTime} onChange={(e) => setEditRow({ ...editRow, endTime: e.target.value })} /></div>
            <div><Label>فتح الحجز</Label><Input type="datetime-local" value={editRow.bookingStartAt} onChange={(e) => setEditRow({ ...editRow, bookingStartAt: e.target.value })} /></div>
            <div><Label>غلق الحجز</Label><Input type="datetime-local" value={editRow.bookingEndAt} onChange={(e) => setEditRow({ ...editRow, bookingEndAt: e.target.value })} /></div>
            <div><Label>السعة</Label><Input type="number" min="1" value={editRow.capacity} onChange={(e) => setEditRow({ ...editRow, capacity: e.target.value })} /></div>
          </div>
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setEditingSlot(null)}>إلغاء</Button><Button disabled={isFetching} onClick={() => void saveEditedSlot()}>حفظ التعديل</Button></div>
        </DialogContent>
      </Dialog>
    </CardContent>
  </Card></SchedulingTranslation>;
}

function ScheduleViewDialog({ scheduleId, onClose }: { scheduleId: number | null; onClose: () => void }) {
  const ui = useUi();
  const queryClient = useQueryClient();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['admin-class-schedule-view', scheduleId],
    enabled: scheduleId != null,
    queryFn: async () => normalizeSchedule((await api.get<MonthlySchedule>(`/admin/class-schedules/${scheduleId}`)).data),
  });
  const emptyPublishedSlot = () => ({ startAt: '', endAt: '', bookingStartAt: '', bookingEndAt: '', capacity: '20' });
  const [showAddSlot, setShowAddSlot] = useState(false);
  const [newSlot, setNewSlot] = useState(emptyPublishedSlot);
  const [savingSlot, setSavingSlot] = useState(false);
  const addPublishedSlot = async () => {
    if (!scheduleId || !data || data.status !== 'published') return;
    if (!newSlot.startAt || !newSlot.endAt) {
      toast.error(ui('حدد تاريخ ووقت بداية ونهاية الموعد.'));
      return;
    }
    setSavingSlot(true);
    try {
      await api.post(`/admin/class-schedules/${scheduleId}/slots`, {
        startAt: new Date(newSlot.startAt).toISOString(),
        endAt: new Date(newSlot.endAt).toISOString(),
        bookingStartAt: newSlot.bookingStartAt ? new Date(newSlot.bookingStartAt).toISOString() : undefined,
        bookingEndAt: newSlot.bookingEndAt ? new Date(newSlot.bookingEndAt).toISOString() : undefined,
        capacity: Number(newSlot.capacity),
        status: 'available',
      });
      toast.success(ui('تمت إضافة الموعد للجدول المنشور.'));
      setNewSlot(emptyPublishedSlot());
      setShowAddSlot(false);
      await refetch();
      await queryClient.invalidateQueries({ queryKey: ['admin-class-monthly-schedules'] });
      await queryClient.invalidateQueries({ queryKey: ['available-class-slots'] });
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setSavingSlot(false);
    }
  };
  const calendarDaysCount = data ? new Date(data.year, data.month, 0).getDate() : 0;
  const calendarFirstDay = data ? new Date(data.year, data.month - 1, 1).getDay() : 0;
  const calendarDateKey = (day: number) => data
    ? `${data.year}-${String(data.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    : '';
  const slotCalendarDateKey = (value: string) => {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date(value));
    const part = (type: string) => parts.find((item) => item.type === type)?.value ?? '';
    return `${part('year')}-${part('month')}-${part('day')}`;
  };
  const calendarSlotsByDate = new Map<string, Slot[]>();
  (data?.slots ?? []).forEach((slot) => {
    const key = slotCalendarDateKey(slot.start_at);
    calendarSlotsByDate.set(key, [...(calendarSlotsByDate.get(key) ?? []), slot]);
  });
  return <SchedulingTranslation><Dialog open={scheduleId != null} onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent size="xl" aria-describedby={undefined}>
      <DialogHeader><DialogTitle>عرض الجدول الشهري</DialogTitle></DialogHeader>
      {isLoading || !data ? <Empty text="جارٍ تحميل الجدول..." /> : <div className="space-y-5">
        <div className="grid gap-3 rounded-xl border bg-muted/20 p-4 sm:grid-cols-4">
          <div><span className="text-sm text-muted-foreground">نوع الكلاس</span><p className="font-bold">{data.class.name}</p></div>
          <div><span className="text-sm text-muted-foreground">المدرب</span><p className="font-bold">{data.trainer.name}</p></div>
          <div><span className="text-sm text-muted-foreground">الشهر</span><p className="font-bold">{data.month}/{data.year}</p></div>
          <div><span className="text-sm text-muted-foreground">الحالة</span><p className="font-bold">{statusLabel(data.status)}</p></div>
        </div>
        {data.status === 'published' && <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><p className="font-bold">إضافة موعد للجدول المنشور</p><p className="text-sm text-muted-foreground">سيظهر الموعد الجديد مباشرة ضمن المواعيد المتاحة للحجز.</p></div>
            <Button onClick={() => setShowAddSlot((value) => !value)}><Plus className="me-1 size-4" />{showAddSlot ? 'إخفاء النموذج' : 'إضافة ميعاد'}</Button>
          </div>
          {showAddSlot && <div className="mt-4 space-y-4 border-t pt-4">
            <div className="grid gap-3 md:grid-cols-5">
              <div><Label>بداية الموعد</Label><Input className="cursor-pointer" type="datetime-local" value={newSlot.startAt} onClick={(event) => event.currentTarget.showPicker?.()} onChange={(event) => setNewSlot({ ...newSlot, startAt: event.target.value })} /></div>
              <div><Label>نهاية الموعد</Label><Input className="cursor-pointer" type="datetime-local" value={newSlot.endAt} onClick={(event) => event.currentTarget.showPicker?.()} onChange={(event) => setNewSlot({ ...newSlot, endAt: event.target.value })} /></div>
              <div><Label>فتح الحجز</Label><Input className="cursor-pointer" type="datetime-local" value={newSlot.bookingStartAt} onClick={(event) => event.currentTarget.showPicker?.()} onChange={(event) => setNewSlot({ ...newSlot, bookingStartAt: event.target.value })} /></div>
              <div><Label>غلق الحجز</Label><Input className="cursor-pointer" type="datetime-local" value={newSlot.bookingEndAt} onClick={(event) => event.currentTarget.showPicker?.()} onChange={(event) => setNewSlot({ ...newSlot, bookingEndAt: event.target.value })} /></div>
              <div><Label>السعة</Label><Input type="number" min="1" value={newSlot.capacity} onChange={(event) => setNewSlot({ ...newSlot, capacity: event.target.value })} /></div>
            </div>
            <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => { setShowAddSlot(false); setNewSlot(emptyPublishedSlot()); }}>إلغاء</Button><Button disabled={savingSlot} onClick={() => void addPublishedSlot()}>{savingSlot ? 'جارٍ الحفظ...' : 'حفظ الموعد'}</Button></div>
          </div>}
        </div>}
        <div className="max-h-[58vh] overflow-auto rounded-xl border">
          <div className="grid min-w-[1050px] grid-cols-7 text-sm">
            {['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'].map((day) => <div key={day} className="sticky top-0 z-10 border-b border-e bg-muted p-3 text-center font-bold">{day}</div>)}
            {Array.from({ length: calendarFirstDay }).map((_, index) => <div key={`empty-${index}`} className="min-h-36 border-b border-e bg-muted/10" />)}
            {Array.from({ length: calendarDaysCount }, (_, index) => index + 1).map((day) => {
              const daySlots = calendarSlotsByDate.get(calendarDateKey(day)) ?? [];
              return <div key={day} className="min-h-36 border-b border-e bg-card p-2">
                <div className="mb-2 flex items-center justify-between">
                  <span className="flex size-7 items-center justify-center rounded-full bg-muted font-bold">{day}</span>
                  {daySlots.length > 0 && <span className="text-xs text-muted-foreground">{daySlots.length} موعد</span>}
                </div>
                <div className="space-y-2">
                  {daySlots.map((slot) => <div key={slot.id} className={`rounded-lg border p-2 ${slot.status === 'available' ? 'border-emerald-500/35 bg-emerald-500/10' : 'border-red-500/35 bg-red-500/10'}`}>
                    <p className="font-bold"><Clock3 className="me-1 inline size-3.5" />{new Date(slot.start_at).toLocaleTimeString(schedulingLocale(), { hour: '2-digit', minute: '2-digit' })} — {new Date(slot.end_at).toLocaleTimeString(schedulingLocale(), { hour: '2-digit', minute: '2-digit' })}</p>
                    <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-muted-foreground"><span>السعة {slot.capacity}</span><span>{statusLabel(slot.status)}</span></div>
                  </div>)}
                </div>
              </div>;
            })}
          </div>
          {(data.slots ?? []).length === 0 && <div className="border-t p-5 text-center text-sm text-muted-foreground">لا توجد مواعيد مسجلة في أيام هذا الشهر.</div>}
        </div>
        <div className="flex justify-end"><Button variant="outline" onClick={onClose}>إغلاق</Button></div>
      </div>}
    </DialogContent>
  </Dialog></SchedulingTranslation>;
}

const links = [
  { to: '/club/fitness/class-scheduling/monthly', title: 'الجداول الشهرية', text: 'إنشاء ونشر وأرشفة جداول الكلاسات', icon: CalendarRange },
  { to: '/club/fitness/class-scheduling/slots', title: 'إدارة المواعيد', text: 'إضافة ومراجعة مواعيد كل جدول', icon: CalendarDays },
  { to: '/club/fitness/class-scheduling/services', title: 'الخدمات الإضافية', text: 'إدارة الخدمات وربطها بالكلاسات والمواعيد', icon: Settings2 },
  { to: '/club/fitness/class-scheduling/bookings', title: 'حجوزات الكلاسات', text: 'عرض الحجوزات وتحديث حالاتها', icon: TicketCheck },
  { to: '/club/fitness/class-scheduling/available', title: 'المواعيد المتاحة', text: 'معاينة السعة وحالة فتح الحجز', icon: ClipboardList },
];

function Shell({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <SchedulingTranslation><div className="space-y-6"><PageHeader title={title} description={description} />{children}</div></SchedulingTranslation>;
}

function Empty({ text = 'لا توجد بيانات' }: { text?: string }) {
  return <div className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">{text}</div>;
}

export function ClassSchedulingAdminHomePage() {
  return <ClassScheduleSlotsAdminPage showShortcuts />;
}

export function ClassMonthlySchedulesAdminPage() {
  const ui = useUi();
  const qc = useQueryClient();
  const [calendarScheduleId, setCalendarScheduleId] = useState<number | null>(null);
  const [viewScheduleId, setViewScheduleId] = useState<number | null>(null);
  const { data: classTypes = [] } = useArrayResource<ClassTypeOption>('club-mos/lookups/class_type');
  const { items: allTrainers } = useFitnessResourceList<TrainerOption>('club-trainers');
  const trainers = allTrainers.filter((trainer) => trainer.isActive);
  const [form, setForm] = useState({ classId: '', trainerId: '', month: String(new Date().getMonth() + 1), year: String(new Date().getFullYear()) });
  const { data = [], isLoading } = useQuery({ queryKey: ['admin-class-monthly-schedules'], queryFn: async () => (await api.get<MonthlySchedule[]>('/admin/class-schedules')).data.map(normalizeSchedule) });
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin-class-monthly-schedules'] });
  const create = async () => {
    try {
      const { data: created } = await api.post<MonthlySchedule>('/admin/class-schedules', Object.fromEntries(Object.entries(form).map(([k, v]) => [k, Number(v)])));
      setCalendarScheduleId(created.id);
      toast.success(ui('تم إنشاء الجدول الشهري')); void refresh();
    } catch (e) { toast.error(apiError(e)); }
  };
  const action = async (id: number, name: 'publish' | 'archive' | 'delete') => {
    try {
      if (name === 'delete') await api.delete(`/admin/class-schedules/${id}`); else await api.patch(`/admin/class-schedules/${id}/${name}`);
      toast.success(ui('تم تحديث الجدول')); void refresh();
    } catch (e) { toast.error(apiError(e)); }
  };
  return (
    <Shell title="الجداول الشهرية" description="أنشئ جدولًا للكلاس والمدرب ثم أضف مواعيده وانشره.">
      <Card><CardHeader><CardTitle>إنشاء جدول جديد</CardTitle></CardHeader><CardContent className="grid gap-3 md:grid-cols-5">
        <div className="space-y-1"><Label>نوع الكلاس</Label><select className={SELECT_CLS} value={form.classId} onChange={(e) => setForm({ ...form, classId: e.target.value })}><option value="">اختر نوع الكلاس</option>{classTypes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
        <div className="space-y-1"><Label>اسم المدرب</Label><select className={SELECT_CLS} value={form.trainerId} onChange={(e) => setForm({ ...form, trainerId: e.target.value })}><option value="">اختر المدرب</option>{trainers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
        {([['month', 'الشهر'], ['year', 'السنة']] as const).map(([key, label]) => <div key={key} className="space-y-1"><Label>{label}</Label><Input type="number" value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} /></div>)}
        <Button className="self-end" onClick={() => void create()}><Plus className="me-1 size-4" />إنشاء</Button>
      </CardContent></Card>
      {data.some((item) => item.status === 'draft') && <Card><CardContent className="flex flex-wrap items-center gap-2 pt-6"><span className="font-semibold">فتح تقويم جدول:</span>{data.filter((item) => item.status === 'draft').map((item) => <Button key={item.id} variant={calendarScheduleId === item.id ? 'default' : 'outline'} onClick={() => setCalendarScheduleId(item.id)}>{item.class.name} · {item.month}/{item.year} · {item.trainer.name}</Button>)}</CardContent></Card>}
      {calendarScheduleId && <MonthlyScheduleCalendar scheduleId={calendarScheduleId} />}
      <ScheduleViewDialog scheduleId={viewScheduleId} onClose={() => setViewScheduleId(null)} />
      {isLoading ? <Empty text="جارٍ التحميل..." /> : data.length === 0 ? <Empty /> : <div className="overflow-x-auto rounded-xl border"><table className="w-full text-sm"><thead className="bg-muted/60"><tr>{['#', 'الكلاس', 'المدرب', 'الشهر', 'المواعيد', 'الحالة', 'الإجراءات'].map((h) => <th key={h} className="p-3 text-start">{h}</th>)}</tr></thead><tbody>{data.map((row) => <tr key={row.id} className="border-t"><td className="p-3">{row.id}</td><td className="p-3">{row.class.class_name}</td><td className="p-3">{row.trainer.name}</td><td className="p-3">{row.month}/{row.year}</td><td className="p-3">{row._count?.slots ?? row.slots?.length ?? 0}</td><td className="p-3"><StatusBadge status={row.status === 'published' ? 'active' : row.status === 'archived' ? 'expired' : 'pending'} label={statusLabel(row.status)} /></td><td className="p-3"><div className="flex gap-2">{row.status === 'draft' && <Button size="sm" onClick={() => void action(row.id, 'publish')}>نشر</Button>}<Button size="sm" variant="outline" onClick={() => setViewScheduleId(row.id)}>عرض الجدول</Button>{row.status !== 'archived' && <Button size="sm" variant="outline" onClick={() => void action(row.id, 'archive')}>أرشفة</Button>}{row.status === 'draft' && <Button size="sm" variant="destructive" onClick={() => void action(row.id, 'delete')}>حذف</Button>}</div></td></tr>)}</tbody></table></div>}
    </Shell>
  );
}

export function ClassScheduleSlotsAdminPage({ showShortcuts = false }: { showShortcuts?: boolean } = {}) {
  const ui = useUi();
  const qc = useQueryClient();
  const { data: classTypes = [] } = useArrayResource<ClassTypeOption>('club-mos/lookups/class_type');
  const { items: allTrainers } = useFitnessResourceList<TrainerOption>('club-trainers');
  const trainers = allTrainers.filter((trainer) => trainer.isActive);
  const now = new Date();
  const currentFilters = { classId: '', trainerId: '', month: String(now.getMonth() + 1), year: String(now.getFullYear()) };
  const [filters, setFilters] = useState(currentFilters);
  const [applied, setApplied] = useState<typeof filters>({ ...currentFilters });
  const [draftScheduleId, setDraftScheduleId] = useState<number | null>(null);
  const [creatingDraft, setCreatingDraft] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<AvailableSlot | null>(null);
  const [bookingSlot, setBookingSlot] = useState<AvailableSlot | null>(null);
  const [editSlot, setEditSlot] = useState<AvailableSlot | null>(null);
  const [detailsSlot, setDetailsSlot] = useState<AvailableSlot | null>(null);
  const [editForm, setEditForm] = useState({ startAt: '', endAt: '', bookingStartAt: '', bookingEndAt: '', capacity: '1' });
  const [draftSlotDate, setDraftSlotDate] = useState('');
  const [draftSlotForm, setDraftSlotForm] = useState({ startTime: '18:00', endTime: '19:00', bookingStartAt: '', bookingEndAt: '', capacity: '20' });
  const [repeatDraftSlotWeekly, setRepeatDraftSlotWeekly] = useState(false);
  const [savingDraftSlot, setSavingDraftSlot] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [selectedMember, setSelectedMember] = useState<MemberOption | null>(null);
  const { data: slots = [], isFetching, refetch } = useQuery({
    queryKey: ['admin-search-class-slots', applied],
    enabled: applied != null,
    queryFn: async () => {
      const params = new URLSearchParams();
      Object.entries(applied ?? {}).forEach(([key, value]) => { if (value) params.set(key, value); });
      params.set('includeCancelled', 'true');
      return (await api.get<AvailableSlot[]>(`/class-schedules/available-slots?${params}`)).data;
    },
  });
  const { data: matchingSchedules = [], isFetching: matchingSchedulesLoading } = useQuery({
    queryKey: ['admin-board-class-monthly-schedule', applied],
    enabled: Boolean(applied.classId && applied.trainerId),
    queryFn: async () => (await api.get<MonthlySchedule[]>('/admin/class-schedules', {
      params: {
        classId: Number(applied.classId),
        trainerId: Number(applied.trainerId),
        month: Number(applied.month),
        year: Number(applied.year),
      },
    })).data.map(normalizeSchedule),
  });
  const matchingSchedule = matchingSchedules[0] ?? null;
  const boardDraftScheduleId = matchingSchedule?.status === 'draft'
    ? matchingSchedule.id
    : draftScheduleId;
  const { data: boardDraftSchedule, refetch: refetchBoardDraft, isFetching: boardDraftLoading } = useQuery({
    queryKey: ['admin-board-draft-schedule-details', boardDraftScheduleId],
    enabled: boardDraftScheduleId != null,
    queryFn: async () => normalizeSchedule((await api.get<MonthlySchedule>(`/admin/class-schedules/${boardDraftScheduleId}`)).data),
  });
  const search = () => {
    setDraftScheduleId(null);
    setApplied({ ...filters });
    if (JSON.stringify(applied) === JSON.stringify(filters)) void refetch();
  };
  const bookingLabel: Record<string, string> = {
    booking_not_started: 'لم يبدأ الحجز بعد', booking_available: 'الحجز متاح', booking_closed: 'انتهت فترة الحجز',
    fully_booked: 'مكتمل العدد', wait: 'قائمة انتظار', cancelled: 'ملغي', class_started: 'بدأ الكلاس', unavailable: 'غير متاح',
  };
  const { data: members = [], isFetching: membersLoading } = useQuery({
    queryKey: ['booking-member-search', memberSearch],
    enabled: bookingSlot != null,
    queryFn: async () => (await api.get<{ data: MemberOption[] }>('/club-members', { params: { search: memberSearch, page: 1, pageSize: 20, isActive: true } })).data.data,
  });
  const { data: freeSessions, isFetching: freeSessionsLoading } = useQuery({
    queryKey: ['member-class-free-sessions', bookingSlot?.id, selectedMember?.id],
    enabled: bookingSlot != null && selectedMember != null,
    queryFn: async () => (await api.get<MemberFreeSessions>(`/admin/class-schedule-slots/${bookingSlot!.id}/members/${selectedMember!.id}/free-sessions`)).data,
  });
  const { data: slotBookings = [], isFetching: bookingsLoading } = useQuery({
    queryKey: ['admin-slot-bookings', detailsSlot?.id],
    enabled: detailsSlot != null,
    queryFn: async () => (await api.get<SlotBookingDetail[]>(`/admin/class-schedule-slots/${detailsSlot!.id}/bookings`)).data,
    refetchOnMount: 'always',
  });
  const toLocalInput = (value?: string | null) => {
    if (!value) return '';
    const date = new Date(value);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  };
  const openEdit = (slot: AvailableSlot) => {
    setEditSlot(slot);
    setEditForm({
      startAt: toLocalInput(slot.startAt),
      endAt: toLocalInput(slot.endAt),
      bookingStartAt: toLocalInput(slot.bookingStartAt),
      bookingEndAt: toLocalInput(slot.bookingEndAt),
      capacity: String(slot.capacity),
    });
  };
  const saveEdit = async () => {
    if (!editSlot) return;
    try {
      await api.patch(`/admin/class-schedule-slots/${editSlot.id}`, {
        startAt: new Date(editForm.startAt).toISOString(),
        endAt: new Date(editForm.endAt).toISOString(),
        bookingStartAt: editForm.bookingStartAt ? new Date(editForm.bookingStartAt).toISOString() : undefined,
        bookingEndAt: editForm.bookingEndAt ? new Date(editForm.bookingEndAt).toISOString() : undefined,
        capacity: Number(editForm.capacity),
      });
      toast.success(ui('تم تعديل الموعد'));
      setEditSlot(null);
      setSelectedSlot(null);
      await refetch();
      if (boardDraftScheduleId) await refetchBoardDraft();
    } catch (error) { toast.error(apiError(error)); }
  };
  const saveDraftSlot = async () => {
    if (!boardDraftScheduleId || !draftSlotDate) return;
    const startAt = new Date(`${draftSlotDate}T${draftSlotForm.startTime}:00`);
    const endAt = new Date(`${draftSlotDate}T${draftSlotForm.endTime}:00`);
    if (endAt <= startAt) {
      toast.error(ui('يجب أن تكون نهاية الكلاس بعد بدايته.'));
      return;
    }
    if (Boolean(draftSlotForm.bookingStartAt) !== Boolean(draftSlotForm.bookingEndAt)) {
      toast.error(ui('حدد تاريخ ووقت فتح وغلق الحجز معًا.'));
      return;
    }
    if (repeatDraftSlotWeekly && (!draftSlotForm.bookingStartAt || !draftSlotForm.bookingEndAt)) {
      toast.error(ui('حدد تاريخ ووقت فتح وغلق الحجز لتطبيق الموعد أسبوعيًا.'));
      return;
    }
    setSavingDraftSlot(true);
    try {
      if (repeatDraftSlotWeekly) {
        await api.post(`/admin/class-schedules/${boardDraftScheduleId}/recurring-slots`, {
          weekDays: [new Date(`${draftSlotDate}T12:00:00`).getDay()],
          startTime: draftSlotForm.startTime,
          endTime: draftSlotForm.endTime,
          templateStartAt: startAt.toISOString(),
          bookingStartAt: new Date(draftSlotForm.bookingStartAt).toISOString(),
          bookingEndAt: new Date(draftSlotForm.bookingEndAt).toISOString(),
          capacity: Number(draftSlotForm.capacity),
          status: 'available',
        });
      } else {
        await api.post(`/admin/class-schedules/${boardDraftScheduleId}/slots`, {
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
          bookingStartAt: draftSlotForm.bookingStartAt ? new Date(draftSlotForm.bookingStartAt).toISOString() : undefined,
          bookingEndAt: draftSlotForm.bookingEndAt ? new Date(draftSlotForm.bookingEndAt).toISOString() : undefined,
          capacity: Number(draftSlotForm.capacity),
          status: 'available',
        });
      }
      toast.success(ui(repeatDraftSlotWeekly ? 'تم تطبيق الموعد أسبوعيًا على الشهر' : 'تمت إضافة الموعد'));
      setDraftSlotDate('');
      setDraftSlotForm({ startTime: '18:00', endTime: '19:00', bookingStartAt: '', bookingEndAt: '', capacity: '20' });
      setRepeatDraftSlotWeekly(false);
      await refetchBoardDraft();
    } catch (error) { toast.error(apiError(error)); } finally { setSavingDraftSlot(false); }
  };
  const cancelSlot = async (slot: AvailableSlot) => {
    if (!window.confirm(ui('هل تريد إلغاء هذا الموعد وإشعار كل الأعضاء الحاجزين؟'))) return;
    try {
      const { data } = await api.patch<{ notifiedBookingsCount: number }>(`/admin/class-schedule-slots/${slot.id}/cancel`);
      toast.success(ui(`تم إلغاء الموعد وإشعار ${data.notifiedBookingsCount} عضو`));
      if (detailsSlot?.id === slot.id) setDetailsSlot(null);
      setSelectedSlot(null);
      await refetch();
    } catch (error) { toast.error(apiError(error)); }
  };
  const openBooking = (slot: AvailableSlot) => {
    if (!['booking_available', 'fully_booked'].includes(slot.bookingStatus)) {
      toast.error(ui(bookingLabel[slot.bookingStatus] ?? 'الحجز غير متاح حاليًا'));
      return;
    }
    setSelectedMember(null); setMemberSearch(''); setBookingSlot(slot);
  };
  const confirmBooking = async () => {
    if (!bookingSlot || !selectedMember) { toast.error(ui('اختر اسم العضو أولًا')); return; }
    try {
      const { data } = await api.post<{ status: 'confirmed' | 'wait' }>(`/admin/class-schedule-slots/${bookingSlot.id}/bookings`, { memberId: selectedMember.id });
      toast.success(ui(data.status === 'confirmed' ? 'تم تأكيد الحجز' : 'تمت إضافة العضو إلى قائمة الانتظار'));
      setBookingSlot(null);
      await refetch();
      await qc.invalidateQueries({ queryKey: ['admin-slot-bookings', bookingSlot.id] });
    } catch (error) { toast.error(apiError(error)); }
  };
  const cancelMemberBooking = async (booking: SlotBookingDetail) => {
    if (!window.confirm(ui(`هل تريد إلغاء حجز ${booking.member?.name ?? 'هذا العضو'}؟`))) return;
    try {
      await api.patch(`/admin/bookings/${booking.id}/cancel`);
      toast.success(ui('تم إلغاء الحجز وتحديث قائمة الانتظار'));
      await qc.invalidateQueries({ queryKey: ['admin-slot-bookings', detailsSlot?.id] });
      await refetch();
    } catch (error) { toast.error(apiError(error)); }
  };
  const completeMemberBooking = async (booking: SlotBookingDetail) => {
    try {
      await api.patch(`/admin/bookings/${booking.id}/complete`);
      toast.success(ui('تم تأكيد الحضور وتحويل الحجز إلى مكتمل'));
      await qc.invalidateQueries({ queryKey: ['admin-slot-bookings', detailsSlot?.id] });
      await refetch();
    } catch (error) { toast.error(apiError(error)); }
  };
  const openOrCreateDraft = async () => {
    if (!applied.classId || !applied.trainerId) {
      toast.error(ui('اختر نوع الكلاس والمدرب أولًا ثم اضغط عرض الجدول'));
      return;
    }
    if (matchingSchedule) {
      if (matchingSchedule.status === 'draft') {
        setDraftScheduleId(matchingSchedule.id);
        return;
      }
      toast.error(ui(matchingSchedule.status === 'published'
        ? 'جدول هذا الشهر منشور بالفعل، ويمكن إدارة مواعيده من التقويم.'
        : 'جدول هذا الشهر مؤرشف ولا يمكن تعديل مواعيده.'));
      return;
    }
    setCreatingDraft(true);
    try {
      const { data: created } = await api.post<MonthlySchedule>('/admin/class-schedules', {
        classId: Number(applied.classId),
        trainerId: Number(applied.trainerId),
        month: Number(applied.month),
        year: Number(applied.year),
      });
      setDraftScheduleId(created.id);
      toast.success(ui('تم إنشاء جدول الشهر كمسودة ويمكنك إضافة المواعيد الآن'));
      await qc.invalidateQueries({ queryKey: ['admin-board-class-monthly-schedule'] });
      await qc.invalidateQueries({ queryKey: ['admin-class-monthly-schedules'] });
    } catch (error) { toast.error(apiError(error)); } finally { setCreatingDraft(false); }
  };
  const appliedMonth = Number(applied.month) || now.getMonth() + 1;
  const appliedYear = Number(applied.year) || now.getFullYear();
  const daysCount = new Date(appliedYear, appliedMonth, 0).getDate();
  const firstDay = new Date(appliedYear, appliedMonth - 1, 1).getDay();
  const dateKey = (day: number) => `${appliedYear}-${String(appliedMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const slotDateKey = (value: string) => {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date(value));
    const part = (type: string) => parts.find((item) => item.type === type)?.value ?? '';
    return `${part('year')}-${part('month')}-${part('day')}`;
  };
  const displayedMonthStart = new Date(appliedYear, appliedMonth - 1, 1);
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const isPastMonth = displayedMonthStart < currentMonthStart;
  const showingDraft = !isPastMonth && matchingSchedule?.status === 'draft' && boardDraftSchedule?.id === matchingSchedule.id;
  const draftSlots: AvailableSlot[] = showingDraft
    ? (boardDraftSchedule.slots ?? []).map((slot) => ({
        id: slot.id,
        startAt: slot.start_at,
        endAt: slot.end_at,
        bookingStartAt: slot.booking_start_at,
        bookingEndAt: slot.booking_end_at,
        capacity: slot.capacity,
        confirmedBookingsCount: 0,
        waitingBookingsCount: 0,
        remainingCapacity: slot.capacity,
        bookingStatus: slot.status === 'cancelled' ? 'cancelled' : 'unavailable',
        class: boardDraftSchedule.class,
        trainer: boardDraftSchedule.trainer,
      }))
    : [];
  const displayedSlots = showingDraft ? draftSlots : slots;
  const slotsByDate = new Map<string, AvailableSlot[]>();
  displayedSlots.forEach((slot) => {
    const key = slotDateKey(slot.startAt);
    slotsByDate.set(key, [...(slotsByDate.get(key) ?? []), slot]);
  });
  const changeMonth = (offset: number) => {
    const date = new Date(appliedYear, appliedMonth - 1 + offset, 1);
    const next = { ...applied, month: String(date.getMonth() + 1), year: String(date.getFullYear()) };
    setFilters(next);
    setApplied({ ...next });
    setDraftScheduleId(null);
  };
  const slotTone = (status: string) => {
    if (status === 'booking_available') return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
    if (status === 'fully_booked') return 'border-orange-500/45 bg-orange-500/15 text-orange-700 dark:text-orange-300';
    if (status === 'wait') return 'border-violet-500/45 bg-violet-500/15 text-violet-700 dark:text-violet-300';
    if (status === 'booking_closed') return 'border-rose-500/45 bg-rose-500/15 text-rose-700 dark:text-rose-300';
    if (status === 'booking_not_started') return 'border-sky-500/45 bg-sky-500/15 text-sky-700 dark:text-sky-300';
    if (status === 'cancelled') return 'border-red-600/60 bg-red-600/20 text-red-700 dark:text-red-200';
    if (status === 'unavailable') return 'border-slate-500/35 bg-slate-500/10 text-slate-600 dark:text-slate-300';
    return 'border-border bg-muted/70 text-muted-foreground';
  };
  const visualSlotStatus = (slot: AvailableSlot) => slot.bookingStatus === 'fully_booked' && slot.waitingBookingsCount > 0 ? 'wait' : slot.bookingStatus;
  const visualSlotLabel = (slot: AvailableSlot) => visualSlotStatus(slot) === 'wait'
    ? `قائمة انتظار (${slot.waitingBookingsCount})`
    : bookingLabel[slot.bookingStatus] ?? slot.bookingStatus;
  const availableCount = displayedSlots.filter((slot) => slot.bookingStatus === 'booking_available').length;
  const fullCount = displayedSlots.filter((slot) => slot.bookingStatus === 'fully_booked').length;
  const selectedClassName = classTypes.find((item) => item.id === Number(applied.classId))?.name;
  const selectedTrainerName = trainers.find((item) => item.id === Number(applied.trainerId))?.name;
  const monthOffset = (appliedYear - now.getFullYear()) * 12 + appliedMonth - (now.getMonth() + 1);
  const displayedMonthLabel = monthOffset === 0
    ? 'الشهر الحالي'
    : monthOffset === 1
      ? 'الشهر التالي'
      : monthOffset === -1
        ? 'الشهر السابق'
        : new Date(appliedYear, appliedMonth - 1, 1).toLocaleDateString(schedulingLocale(), { month: 'long', year: 'numeric' });
  return <Shell title="نظام حجز الكلاسات" description="اختر الكلاس والمدرب واعرض مواعيد الشهر، ثم اضغط على أي موعد للحجز أو التعديل أو إدارة الحجوزات.">
    <Card className="border-primary/25 shadow-sm"><CardContent className="grid gap-3 pt-6 md:grid-cols-5">
      <div><Label>نوع الكلاس</Label><select className={SELECT_CLS} value={filters.classId} onChange={(e) => setFilters({ ...filters, classId: e.target.value })}><option value="">كل أنواع الكلاسات</option>{classTypes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
      <div><Label>اسم المدرب</Label><select className={SELECT_CLS} value={filters.trainerId} onChange={(e) => setFilters({ ...filters, trainerId: e.target.value })}><option value="">كل المدربين</option>{trainers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
      <div><Label>الشهر</Label><Input type="number" min="1" max="12" value={filters.month} onChange={(e) => setFilters({ ...filters, month: e.target.value })} /></div>
      <div><Label>السنة</Label><Input type="number" min="2000" max="2100" value={filters.year} onChange={(e) => setFilters({ ...filters, year: e.target.value })} /></div>
      <Button className="self-end" onClick={search}><CalendarDays className="me-2 size-4" />عرض الجدول</Button>
    </CardContent></Card>

    <Card className="border-primary/30 bg-gradient-to-l from-primary/10 via-card to-card">
      <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-6">
        <div>
          <p className="font-bold">إعداد جدول {new Date(appliedYear, appliedMonth - 1, 1).toLocaleDateString(schedulingLocale(), { month: 'long', year: 'numeric' })}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {!applied.classId || !applied.trainerId
              ? 'اختر كلاسًا ومدربًا لعمل جدول جديد للشهر المعروض.'
              : matchingSchedulesLoading
                ? 'جارٍ التحقق من الجدول الشهري...'
                : matchingSchedule
                  ? `${matchingSchedule.class.name} · ${matchingSchedule.trainer.name} · الحالة: ${statusLabel(matchingSchedule.status)}`
                  : `${selectedClassName ?? 'الكلاس المحدد'} · ${selectedTrainerName ?? 'المدرب المحدد'} · لا توجد مسودة لهذا الشهر`}
          </p>
        </div>
        <Button disabled={!applied.classId || !applied.trainerId || matchingSchedulesLoading || creatingDraft || matchingSchedule != null} onClick={() => void openOrCreateDraft()}>
          <Plus className="me-2 size-4" />
          {creatingDraft ? 'جارٍ إنشاء المسودة...' : matchingSchedule?.status === 'draft' ? 'المسودة معروضة في الجدول' : matchingSchedule?.status === 'published' ? 'الجدول منشور' : matchingSchedule?.status === 'archived' ? 'الجدول مؤرشف' : 'إنشاء جدول الشهر كمسودة'}
        </Button>
      </CardContent>
    </Card>

    <div className="grid gap-3 sm:grid-cols-3">
      <Card><CardContent className="flex items-center justify-between pt-6"><div><p className="text-sm text-muted-foreground">إجمالي المواعيد</p><p className="mt-1 text-2xl font-bold">{displayedSlots.length}</p></div><CalendarRange className="size-8 text-primary" /></CardContent></Card>
      <Card><CardContent className="flex items-center justify-between pt-6"><div><p className="text-sm text-muted-foreground">الحجز متاح</p><p className="mt-1 text-2xl font-bold text-emerald-600">{availableCount}</p></div><TicketPlus className="size-8 text-emerald-500" /></CardContent></Card>
      <Card><CardContent className="flex items-center justify-between pt-6"><div><p className="text-sm text-muted-foreground">مكتمل العدد</p><p className="mt-1 text-2xl font-bold text-amber-600">{fullCount}</p></div><Users className="size-8 text-amber-500" /></CardContent></Card>
    </div>

    <Card className="overflow-hidden">
      <CardHeader className="border-b bg-muted/20">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>{new Date(appliedYear, appliedMonth - 1, 1).toLocaleDateString(schedulingLocale(), { month: 'long', year: 'numeric' })}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">{isPastMonth ? 'هذا شهر سابق: المواعيد متاحة للعرض فقط ولا يمكن تعديلها أو الحجز فيها.' : matchingSchedule?.status === 'draft' ? 'مواعيد مسودة الشهر معروضة داخل هذا الجدول؛ اضغط على أي موعد لتعديله.' : 'اضغط على الموعد لفتح كل إجراءات الحجز والإدارة.'}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="icon" variant="outline" aria-label="الشهر السابق" onClick={() => changeMonth(-1)}><ChevronRight className="size-4" /></Button>
            <Button variant="outline" className="pointer-events-none">{displayedMonthLabel}</Button>
            <Button size="icon" variant="outline" aria-label="الشهر التالي" onClick={() => changeMonth(1)}><ChevronLeft className="size-4" /></Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-4 pt-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-2"><i className="size-2.5 rounded-full bg-emerald-500" />الحجز متاح</span>
          <span className="flex items-center gap-2"><i className="size-2.5 rounded-full bg-orange-500" />مكتمل العدد</span>
          <span className="flex items-center gap-2"><i className="size-2.5 rounded-full bg-violet-500" />قائمة انتظار</span>
          <span className="flex items-center gap-2"><i className="size-2.5 rounded-full bg-rose-500" />الحجز مغلق</span>
          <span className="flex items-center gap-2"><i className="size-2.5 rounded-full bg-sky-500" />لم يبدأ الحجز</span>
          <span className="flex items-center gap-2"><i className="size-2.5 rounded-full bg-red-600" />موعد ملغي</span>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {(isFetching || boardDraftLoading) && <div className="border-b bg-primary/5 p-3 text-center text-sm text-primary">جارٍ تحميل مواعيد الشهر...</div>}
        <div className="overflow-x-auto">
          <div className="grid min-w-[1050px] grid-cols-7 border-s border-t text-sm">
            {['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'].map((day) => <div key={day} className="border-b border-e bg-muted/40 p-3 text-center font-bold">{day}</div>)}
            {Array.from({ length: firstDay }).map((_, index) => <div key={`empty-${index}`} className="min-h-44 border-b border-e bg-muted/10" />)}
            {Array.from({ length: daysCount }, (_, index) => index + 1).map((day) => {
              const daySlots = slotsByDate.get(dateKey(day)) ?? [];
              return <div key={day} className="min-h-44 border-b border-e bg-card p-2 align-top">
                <div className="mb-2 flex items-center justify-between">
                  <span className="flex size-7 items-center justify-center rounded-full bg-muted font-bold">{day}</span>
                  <div className="flex items-center gap-1">
                    {daySlots.length > 0 && <span className="text-xs text-muted-foreground">{daySlots.length} موعد</span>}
                    {showingDraft && <Button size="icon" variant="ghost" className="size-7" aria-label={`إضافة موعد يوم ${day}`} onClick={() => setDraftSlotDate(dateKey(day))}><Plus className="size-4" /></Button>}
                  </div>
                </div>
                <div className="space-y-2">{daySlots.map((slot) => <button key={slot.id} type="button" onClick={() => showingDraft ? openEdit(slot) : setSelectedSlot(slot)} className={`w-full rounded-lg border p-2 text-start transition hover:-translate-y-0.5 hover:shadow-md ${showingDraft ? 'border-amber-500/45 bg-amber-500/10 text-amber-700 dark:text-amber-300' : slotTone(visualSlotStatus(slot))}`}>
                  <span className="flex items-center gap-1 font-bold"><Clock3 className="size-3.5" />{new Date(slot.startAt).toLocaleTimeString(schedulingLocale(), { hour: '2-digit', minute: '2-digit' })}</span>
                  <span className="mt-1 block truncate text-xs font-semibold">{slot.class.name}</span>
                  <span className="block truncate text-[11px] opacity-80">{slot.trainer.name}</span>
                  <span className="mt-1 block text-[10px]">{showingDraft ? `مسودة · السعة ${slot.capacity} · اضغط للتعديل` : `${visualSlotLabel(slot)} · متبقي ${slot.remainingCapacity}`}</span>
                </button>)}</div>
              </div>;
            })}
          </div>
        </div>
        {!isFetching && !boardDraftLoading && displayedSlots.length === 0 && <div className="border-t p-8 text-center text-muted-foreground">{matchingSchedule?.status === 'draft' ? 'مسودة هذا الشهر لا تحتوي على مواعيد حتى الآن.' : 'لا توجد مواعيد منشورة مطابقة للاختيارات في هذا الشهر.'}</div>}
      </CardContent>
    </Card>

    {showShortcuts && <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">{links.map(({ to, title, icon: Icon }) => <Link key={to} to={to}><Card className="h-full transition hover:border-primary/50"><CardContent className="flex items-center gap-3 pt-6"><span className="rounded-lg bg-primary/10 p-2 text-primary"><Icon className="size-4" /></span><span className="font-semibold">{title}</span></CardContent></Card></Link>)}</div>}

    <Dialog open={selectedSlot != null} onOpenChange={(open) => { if (!open) setSelectedSlot(null); }}>
      <DialogContent size="md" aria-describedby={undefined}>
        <DialogHeader><DialogTitle>إدارة الموعد</DialogTitle></DialogHeader>
        {selectedSlot && <div className="space-y-5">
          <div className="rounded-2xl border bg-gradient-to-br from-primary/10 to-transparent p-5">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xl font-bold">{selectedSlot.class.name}</p><p className="mt-1 text-muted-foreground">المدرب: {selectedSlot.trainer.name}</p></div><span className={`rounded-full border px-3 py-1 text-xs font-bold ${slotTone(visualSlotStatus(selectedSlot))}`}>{visualSlotLabel(selectedSlot)}</span></div>
            <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3"><div className="rounded-lg bg-background/70 p-3"><span className="text-muted-foreground">التاريخ</span><b className="mt-1 block">{new Date(selectedSlot.startAt).toLocaleDateString(schedulingLocale())}</b></div><div className="rounded-lg bg-background/70 p-3"><span className="text-muted-foreground">الوقت</span><b className="mt-1 block">{new Date(selectedSlot.startAt).toLocaleTimeString(schedulingLocale(), { hour: '2-digit', minute: '2-digit' })} - {new Date(selectedSlot.endAt).toLocaleTimeString(schedulingLocale(), { hour: '2-digit', minute: '2-digit' })}</b></div><div className="rounded-lg bg-background/70 p-3"><span className="text-muted-foreground">السعة</span><b className="mt-1 block">{selectedSlot.confirmedBookingsCount} / {selectedSlot.capacity} · متبقي {selectedSlot.remainingCapacity} · انتظار {selectedSlot.waitingBookingsCount}</b></div></div>
          </div>
          {isPastMonth ? <div className="rounded-xl border bg-muted/30 p-4 text-center text-sm text-muted-foreground">هذا الموعد للعرض فقط لأن الشهر سابق. لا يمكن الحجز أو التعديل أو الإلغاء.</div> : <div className="grid gap-3 sm:grid-cols-2">
            <Button disabled={!['booking_available', 'fully_booked'].includes(selectedSlot.bookingStatus)} onClick={() => { const slot = selectedSlot; setSelectedSlot(null); openBooking(slot); }}><TicketPlus className="me-2 size-4" />{selectedSlot.bookingStatus === 'fully_booked' ? 'إضافة لقائمة الانتظار' : 'حجز عضو'}</Button>
            <Button variant="outline" disabled={selectedSlot.bookingStatus === 'cancelled'} onClick={() => { const slot = selectedSlot; setSelectedSlot(null); openEdit(slot); }}><Pencil className="me-2 size-4" />تعديل الموعد</Button>
            <Button variant="outline" onClick={() => { const slot = selectedSlot; setSelectedSlot(null); setDetailsSlot(slot); void qc.invalidateQueries({ queryKey: ['admin-slot-bookings', slot.id] }); }}><Users className="me-2 size-4" />الحجوزات وإلغاؤها</Button>
            <Button variant="destructive" disabled={selectedSlot.bookingStatus === 'cancelled'} onClick={() => void cancelSlot(selectedSlot)}><Ban className="me-2 size-4" />إلغاء الموعد بالكامل</Button>
          </div>}
        </div>}
      </DialogContent>
    </Dialog>
    <Dialog open={bookingSlot != null} onOpenChange={(open) => { if (!open) setBookingSlot(null); }}><DialogContent size="md" aria-describedby={undefined}><DialogHeader><DialogTitle>بيانات الحجز</DialogTitle></DialogHeader>{bookingSlot && <div className="space-y-4"><div className="rounded-xl border bg-muted/20 p-4"><b>{bookingSlot.class.name}</b><p>{bookingSlot.trainer.name} · {new Date(bookingSlot.startAt).toLocaleString(schedulingLocale())}</p><p className="mt-1 text-sm">الحالة المتوقعة: <b>{statusLabel(bookingSlot.remainingCapacity > 0 ? 'confirmed' : 'wait')}</b></p></div><div><Label>بحث باسم العضو أو الكود أو الهاتف</Label><Input value={memberSearch} onChange={(e) => setMemberSearch(e.target.value)} placeholder="اكتب اسم العضو..." /></div><div className="max-h-64 space-y-2 overflow-y-auto">{membersLoading ? <p>جارٍ البحث...</p> : members.map((member) => <button type="button" key={member.id} onClick={() => setSelectedMember(member)} className={`flex w-full justify-between rounded-lg border p-3 text-start ${selectedMember?.id === member.id ? 'border-primary bg-primary/10' : ''}`}><span><b>{member.name}</b><small className="block text-muted-foreground">{member.memberCode} {member.phone ? `· ${member.phone}` : ''}</small></span>{selectedMember?.id === member.id && <span className="text-primary">تم الاختيار</span>}</button>)}</div>{selectedMember && <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">{freeSessionsLoading ? <p className="text-sm text-muted-foreground">جارٍ تحميل رصيد الحصص المجانية...</p> : freeSessions?.hasFreeSessions ? <><div className="mb-3 flex items-center justify-between gap-3"><p className="font-semibold">رصيد الحصص المجانية للكلاس</p><span className="text-sm text-muted-foreground">{freeSessions.class.name}</span></div><div className="grid grid-cols-3 gap-2 text-center"><div className="rounded-lg bg-background p-3"><p className="text-xs text-muted-foreground">الإجمالي</p><p className="mt-1 text-xl font-bold">{freeSessions.total}</p></div><div className="rounded-lg bg-background p-3"><p className="text-xs text-muted-foreground">المستخدمة</p><p className="mt-1 text-xl font-bold">{freeSessions.used}</p></div><div className="rounded-lg bg-background p-3"><p className="text-xs text-muted-foreground">المتبقية</p><p className="mt-1 text-xl font-bold text-primary">{freeSessions.remaining}</p></div></div></> : <p className="text-sm text-muted-foreground">لا توجد حصص مجانية متاحة لهذا العضو للكلاس.</p>}</div>}<div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setBookingSlot(null)}>إلغاء</Button><Button disabled={!selectedMember} onClick={() => void confirmBooking()}>تأكيد الحجز</Button></div></div>}</DialogContent></Dialog>
    <Dialog open={editSlot != null} onOpenChange={(open) => { if (!open) setEditSlot(null); }}>
      <DialogContent size="form" aria-describedby={undefined}>
        <DialogHeader><DialogTitle>تعديل الموعد</DialogTitle></DialogHeader>
        <div className="grid gap-4 md:grid-cols-2">
          <div><Label>بداية الكلاس</Label><Input type="datetime-local" value={editForm.startAt} onChange={(e) => setEditForm({ ...editForm, startAt: e.target.value })} /></div>
          <div><Label>نهاية الكلاس</Label><Input type="datetime-local" value={editForm.endAt} onChange={(e) => setEditForm({ ...editForm, endAt: e.target.value })} /></div>
          <div><Label>فتح الحجز</Label><Input type="datetime-local" value={editForm.bookingStartAt} onChange={(e) => setEditForm({ ...editForm, bookingStartAt: e.target.value })} /></div>
          <div><Label>غلق الحجز</Label><Input type="datetime-local" value={editForm.bookingEndAt} onChange={(e) => setEditForm({ ...editForm, bookingEndAt: e.target.value })} /></div>
          <div><Label>السعة</Label><Input type="number" min="1" value={editForm.capacity} onChange={(e) => setEditForm({ ...editForm, capacity: e.target.value })} /></div>
        </div>
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setEditSlot(null)}>إلغاء</Button><Button onClick={() => void saveEdit()}>حفظ التعديل</Button></div>
      </DialogContent>
    </Dialog>
    <Dialog open={Boolean(draftSlotDate)} onOpenChange={(open) => { if (!open) { setDraftSlotDate(''); setRepeatDraftSlotWeekly(false); } }}>
      <DialogContent size="form" aria-describedby={undefined}>
        <DialogHeader><DialogTitle>إضافة موعد يوم {draftSlotDate}</DialogTitle></DialogHeader>
        <div className="grid gap-4 md:grid-cols-5">
          <div><Label>من</Label><Input type="time" value={draftSlotForm.startTime} onChange={(e) => setDraftSlotForm({ ...draftSlotForm, startTime: e.target.value })} /></div>
          <div><Label>إلى</Label><Input type="time" value={draftSlotForm.endTime} onChange={(e) => setDraftSlotForm({ ...draftSlotForm, endTime: e.target.value })} /></div>
          <div><Label>فتح الحجز</Label><Input type="datetime-local" value={draftSlotForm.bookingStartAt} onChange={(e) => setDraftSlotForm({ ...draftSlotForm, bookingStartAt: e.target.value })} /></div>
          <div><Label>غلق الحجز</Label><Input type="datetime-local" value={draftSlotForm.bookingEndAt} onChange={(e) => setDraftSlotForm({ ...draftSlotForm, bookingEndAt: e.target.value })} /></div>
          <div><Label>السعة</Label><Input type="number" min="1" value={draftSlotForm.capacity} onChange={(e) => setDraftSlotForm({ ...draftSlotForm, capacity: e.target.value })} /></div>
        </div>
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border bg-primary/5 p-4">
          <input type="checkbox" className="mt-1 size-4 accent-primary" checked={repeatDraftSlotWeekly} onChange={(e) => setRepeatDraftSlotWeekly(e.target.checked)} />
          <span><b>تطبيق الموعد أسبوعيًا</b><small className="mt-1 block text-muted-foreground">يُضاف الموعد في نفس يوم الأسبوع طوال الشهر بنفس الوقت والسعة وفترة الحجز.</small></span>
        </label>
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => { setDraftSlotDate(''); setRepeatDraftSlotWeekly(false); }}>إلغاء</Button><Button disabled={savingDraftSlot} onClick={() => void saveDraftSlot()}>{savingDraftSlot ? 'جارٍ الحفظ...' : repeatDraftSlotWeekly ? 'إضافة وتطبيق أسبوعيًا' : 'إضافة الموعد'}</Button></div>
      </DialogContent>
    </Dialog>
    <Dialog open={detailsSlot != null} onOpenChange={(open) => { if (!open) setDetailsSlot(null); }}>
      <DialogContent size="lg" aria-describedby={undefined}>
        <DialogHeader><DialogTitle>تفاصيل الحجوزات</DialogTitle></DialogHeader>
        {detailsSlot && <div className="rounded-xl border bg-muted/20 p-4"><b>{detailsSlot.class.name}</b><p>{detailsSlot.trainer.name} · {new Date(detailsSlot.startAt).toLocaleString(schedulingLocale())}</p></div>}
        {bookingsLoading ? <Empty text="جارٍ تحميل الحجوزات..." /> : slotBookings.length === 0 ? <Empty text="لا يوجد أعضاء حجزوا هذا الموعد" /> : <div className="max-h-[55vh] overflow-y-auto rounded-xl border"><table className="w-full text-sm"><thead className="sticky top-0 bg-muted"><tr>{['العضو', 'الكود', 'الهاتف', 'الخدمات الإضافية', 'تاريخ الحجز', 'الحالة', 'الإجراءات'].map((heading) => <th key={heading} className="p-3 text-start">{heading}</th>)}</tr></thead><tbody>{slotBookings.map((booking) => <tr key={booking.id} className="border-t"><td className="p-3 font-semibold">{booking.member?.name ?? 'غير محدد'}</td><td className="p-3">{booking.member?.member_code ?? '—'}</td><td className="p-3" dir="ltr">{booking.member?.phone ?? '—'}</td><td className="p-3">{(booking.additionalServices ?? []).filter((service) => service.status !== 'cancelled').map((service) => service.name).join('، ') || '—'}</td><td className="p-3">{new Date(booking.bookedAt).toLocaleString(schedulingLocale())}</td><td className="p-3"><StatusBadge status={booking.status === 'confirmed' ? 'active' : booking.status === 'cancelled' ? 'expired' : 'pending'} label={statusLabel(booking.status)} /></td><td className="p-3"><div className="flex flex-wrap gap-2">{booking.status === 'confirmed' && <Button size="sm" onClick={() => void completeMemberBooking(booking)}>تأكيد الحضور</Button>}{['confirmed', 'wait'].includes(booking.status) && <Button size="sm" variant="destructive" onClick={() => void cancelMemberBooking(booking)}>إلغاء الحجز</Button>}{!['confirmed', 'wait'].includes(booking.status) && '—'}</div></td></tr>)}</tbody></table></div>}
      </DialogContent>
    </Dialog>
  </Shell>;
}

function LegacyClassScheduleSlotsAdminPage() {
  const ui = useUi();
  const [scheduleId, setScheduleId] = useState('');
  const [activeId, setActiveId] = useState<number | null>(null);
  const [form, setForm] = useState({ startAt: '', endAt: '', bookingStartAt: '', bookingEndAt: '', capacity: '20' });
  const [recurring, setRecurring] = useState({ weekDays: '0,2,4', startTime: '18:00', endTime: '19:00', bookingStartAt: '', minutesBefore: '60', capacity: '20' });
  const { data, refetch, isFetching } = useQuery({ queryKey: ['admin-class-schedule', activeId], enabled: activeId != null, queryFn: async () => normalizeSchedule((await api.get<MonthlySchedule>(`/admin/class-schedules/${activeId}`)).data) });
  const load = () => { const id = Number(scheduleId); if (id > 0) setActiveId(id); };
  const add = async () => {
    if (!activeId) return;
    const iso = (value: string) => value ? new Date(value).toISOString() : undefined;
    try { await api.post(`/admin/class-schedules/${activeId}/slots`, { startAt: iso(form.startAt), endAt: iso(form.endAt), bookingStartAt: iso(form.bookingStartAt), bookingEndAt: iso(form.bookingEndAt), capacity: Number(form.capacity), status: 'available' }); toast.success(ui('تمت إضافة الموعد')); void refetch(); } catch (e) { toast.error(apiError(e)); }
  };
  const copyPrevious = async () => { if (!activeId) return; try { const { data: report } = await api.post(`/admin/class-schedules/${activeId}/copy-previous-month`); toast.success(ui(`تم نسخ ${report.copiedSlotsCount} موعد`)); void refetch(); } catch (e) { toast.error(apiError(e)); } };
  const createRecurring = async () => { if (!activeId) return; try { await api.post(`/admin/class-schedules/${activeId}/recurring-slots`, { weekDays: recurring.weekDays.split(',').map(Number), startTime: recurring.startTime, endTime: recurring.endTime, bookingStartAt: new Date(recurring.bookingStartAt).toISOString(), bookingEndRule: { type: 'minutes_before_class', value: Number(recurring.minutesBefore) }, capacity: Number(recurring.capacity), status: 'available' }); toast.success(ui('تم إنشاء المواعيد المتكررة')); void refetch(); } catch (e) { toast.error(apiError(e)); } };
  const cancel = async (id: number) => { try { await api.patch(`/admin/class-schedule-slots/${id}/cancel`); toast.success(ui('تم إلغاء الموعد')); void refetch(); } catch (e) { toast.error(apiError(e)); } };
  return <Shell title="إدارة المواعيد" description="حمّل جدولًا برقم الجدول، ثم راجع مواعيده أو أضف موعدًا جديدًا."><Card><CardContent className="flex gap-2 pt-6"><Input type="number" placeholder="رقم الجدول" value={scheduleId} onChange={(e) => setScheduleId(e.target.value)} /><Button onClick={load}>عرض الجدول</Button></CardContent></Card>{data && <><Card><CardHeader><CardTitle>{data.class.class_name} · {data.month}/{data.year}</CardTitle></CardHeader><CardContent className="space-y-4"><div className="grid gap-3 md:grid-cols-5">{(['startAt', 'endAt', 'bookingStartAt', 'bookingEndAt'] as const).map((key) => <div key={key} className="space-y-1"><Label>{key}</Label><Input type="datetime-local" value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} /></div>)}<div className="space-y-1"><Label>السعة</Label><Input type="number" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} /></div></div><div className="flex gap-2"><Button onClick={() => void add()}><Plus className="me-1 size-4" />إضافة موعد</Button><Button variant="outline" onClick={() => void copyPrevious()}>نسخ الشهر السابق</Button></div><div className="space-y-2">{data.slots?.map((slot) => <div key={slot.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"><div><b>#{slot.id}</b> · {new Date(slot.start_at).toLocaleString(schedulingLocale())} — {new Date(slot.end_at).toLocaleTimeString(schedulingLocale())} · السعة {slot.capacity}</div><div className="flex items-center gap-2"><StatusBadge status={slot.status === 'available' ? 'active' : 'expired'} label={statusLabel(slot.status)} />{slot.status !== 'cancelled' && <Button size="sm" variant="destructive" onClick={() => void cancel(slot.id)}>إلغاء</Button>}</div></div>)}</div></CardContent></Card><Card><CardHeader><CardTitle>إنشاء مواعيد متكررة</CardTitle></CardHeader><CardContent className="grid gap-3 md:grid-cols-6"><Input placeholder="الأيام 0,2,4" value={recurring.weekDays} onChange={(e) => setRecurring({ ...recurring, weekDays: e.target.value })} /><Input type="time" value={recurring.startTime} onChange={(e) => setRecurring({ ...recurring, startTime: e.target.value })} /><Input type="time" value={recurring.endTime} onChange={(e) => setRecurring({ ...recurring, endTime: e.target.value })} /><Input type="datetime-local" value={recurring.bookingStartAt} onChange={(e) => setRecurring({ ...recurring, bookingStartAt: e.target.value })} /><Input type="number" placeholder="دقائق قبل الكلاس" value={recurring.minutesBefore} onChange={(e) => setRecurring({ ...recurring, minutesBefore: e.target.value })} /><Button onClick={() => void createRecurring()}>إنشاء المتكرر</Button></CardContent></Card></>}{isFetching && <Empty text="جارٍ تحميل الجدول..." />}</Shell>;
}

export function ClassAdditionalServicesAdminPage() {
  const ui = useUi();
  const qc = useQueryClient(); const [name, setName] = useState(''); const [description, setDescription] = useState(''); const [classLink, setClassLink] = useState({ classId: '', serviceId: '' }); const [slotSetup, setSlotSetup] = useState({ slotId: '', serviceId: '', capacity: '1' });
  const { data = [] } = useQuery({ queryKey: ['admin-additional-services'], queryFn: async () => (await api.get<AdditionalService[]>('/admin/additional-services?status=all')).data });
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin-additional-services'] });
  const create = async () => { try { await api.post('/admin/additional-services', { name, description, durationMin: 60, isActive: true }); setName(''); setDescription(''); toast.success(ui('تمت إضافة الخدمة')); void refresh(); } catch (e) { toast.error(apiError(e)); } };
  const toggle = async (row: AdditionalService) => { try { await api.patch(`/admin/additional-services/${row.id}/status`, { status: row.status === 'active' ? 'inactive' : 'active' }); void refresh(); } catch (e) { toast.error(apiError(e)); } };
  const linkClass = async () => { try { await api.post(`/admin/classes/${Number(classLink.classId)}/additional-services`, { serviceId: Number(classLink.serviceId), isRequired: false, isActive: true }); toast.success(ui('تم ربط الخدمة بالكلاس')); } catch (e) { toast.error(apiError(e)); } };
  const setupSlot = async () => { try { await api.put(`/admin/class-schedule-slots/${Number(slotSetup.slotId)}/additional-services`, { services: [{ serviceId: Number(slotSetup.serviceId), capacity: Number(slotSetup.capacity), isRequired: false, isActive: true }] }); toast.success(ui('تم إعداد خدمة الموعد')); } catch (e) { toast.error(apiError(e)); } };
  return <Shell title="الخدمات الإضافية" description="إدارة الخدمات التي يمكن ربطها بالكلاسات والمواعيد."><Card><CardContent className="grid gap-3 pt-6 md:grid-cols-[1fr_2fr_auto]"><Input placeholder="اسم الخدمة" value={name} onChange={(e) => setName(e.target.value)} /><Input placeholder="الوصف" value={description} onChange={(e) => setDescription(e.target.value)} /><Button disabled={!name.trim()} onClick={() => void create()}><Plus className="me-1 size-4" />إضافة</Button></CardContent></Card><div className="grid gap-4 lg:grid-cols-2"><Card><CardHeader><CardTitle>ربط خدمة بكلاس</CardTitle></CardHeader><CardContent className="flex gap-2"><Input type="number" placeholder="رقم الكلاس" value={classLink.classId} onChange={(e) => setClassLink({ ...classLink, classId: e.target.value })} /><Input type="number" placeholder="رقم الخدمة" value={classLink.serviceId} onChange={(e) => setClassLink({ ...classLink, serviceId: e.target.value })} /><Button onClick={() => void linkClass()}>ربط</Button></CardContent></Card><Card><CardHeader><CardTitle>إعداد خدمة على موعد</CardTitle></CardHeader><CardContent className="flex gap-2"><Input type="number" placeholder="رقم الموعد" value={slotSetup.slotId} onChange={(e) => setSlotSetup({ ...slotSetup, slotId: e.target.value })} /><Input type="number" placeholder="رقم الخدمة" value={slotSetup.serviceId} onChange={(e) => setSlotSetup({ ...slotSetup, serviceId: e.target.value })} /><Input type="number" placeholder="السعة" value={slotSetup.capacity} onChange={(e) => setSlotSetup({ ...slotSetup, capacity: e.target.value })} /><Button onClick={() => void setupSlot()}>حفظ</Button></CardContent></Card></div><div className="grid gap-3 md:grid-cols-2">{data.map((row) => <Card key={row.id}><CardContent className="flex items-center justify-between gap-3 pt-6"><div><p className="font-bold">{row.name}</p><p className="text-sm text-muted-foreground">{row.description || 'بدون وصف'}</p></div><Button variant="outline" onClick={() => void toggle(row)}>{row.status === 'active' ? 'تعطيل' : 'تفعيل'}</Button></CardContent></Card>)}</div></Shell>;
}

export function ClassBookingsAdminPage() {
  const ui = useUi();
  const qc = useQueryClient();
  const { data: classTypes = [] } = useArrayResource<ClassTypeOption>('club-mos/lookups/class_type');
  const { items: allTrainers } = useFitnessResourceList<TrainerOption>('club-trainers');
  const now = new Date(); const [filters, setFilters] = useState({ classId: '', trainerId: '', month: String(now.getMonth() + 1), year: String(now.getFullYear()) }); const [applied, setApplied] = useState('');
  const { data = [], refetch, isFetching, isError, error } = useQuery({ queryKey: ['admin-class-bookings-search', applied], enabled: Boolean(applied), queryFn: async () => (await api.get<AdminClassBooking[]>(`/admin/class-bookings?${applied}`)).data });
  const [servicesBooking, setServicesBooking] = useState<AdminClassBooking | null>(null);
  const [selectedServiceIds, setSelectedServiceIds] = useState<number[]>([]);
  const [isSavingServices, setIsSavingServices] = useState(false);
  const { data: slotServices = [], isFetching: isLoadingServices } = useQuery({
    queryKey: ['admin-slot-additional-services', servicesBooking?.slot.id],
    enabled: Boolean(servicesBooking),
    queryFn: async () => (await api.get<SlotAdditionalService[]>(`/admin/class-schedule-slots/${servicesBooking!.slot.id}/additional-services`)).data,
  });
  const { data: classServices = [], isFetching: isLoadingClassServices } = useQuery({
    queryKey: ['class-services-for-booking', servicesBooking?.class.id],
    enabled: Boolean(servicesBooking),
    queryFn: async () => {
      const response = await api.get<{ data: ClassServiceOption[] }>('/scheduling/services', {
        params: { category: 'class', active: 'true', page: 1, pageSize: 200 },
      });
      return response.data.data.filter((service) => service.classTypeId === servicesBooking!.class.id);
    },
  });
  const search = () => { const params = new URLSearchParams(); Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value); }); setApplied(params.toString()); };
  const openServices = (booking: AdminClassBooking) => {
    setServicesBooking(booking);
    setSelectedServiceIds((booking.additionalServices ?? []).filter((item) => item.status === 'confirmed').map((item) => item.serviceId));
  };
  const configuredServiceById = new Map(slotServices.map((service) => [service.serviceId, service]));
  const visibleSlotServices: SlotAdditionalService[] = classServices.map((service) => {
    const configured = configuredServiceById.get(service.id);
    return {
      id: configured?.id ?? null,
      serviceId: service.id,
      name: service.name,
      capacity: configured?.capacity ?? 0,
      isRequired: configured?.isRequired ?? false,
      isActive: true,
      serviceIsActive: service.isActive,
    };
  });
  const requiredServiceIds = visibleSlotServices.filter((service) => service.isRequired).map((service) => service.serviceId);
  const visibleServiceIds = new Set(visibleSlotServices.map((service) => service.serviceId));
  const effectiveSelectedServiceIds = [...new Set([...selectedServiceIds.filter((id) => visibleServiceIds.has(id)), ...requiredServiceIds])];
  const saveServices = async () => {
    if (!servicesBooking) return;
    setIsSavingServices(true);
    try {
      const additionalServiceIds = effectiveSelectedServiceIds;
      await api.patch(`/admin/bookings/${servicesBooking.id}/additional-services`, { additionalServiceIds });
      toast.success(ui('تم حفظ الخدمات الإضافية للحجز'));
      setServicesBooking(null);
      await refetch();
      await qc.invalidateQueries({ queryKey: ['admin-slot-bookings'] });
    } catch (e) { toast.error(apiError(e)); } finally { setIsSavingServices(false); }
  };
  const transition = async (id: number, action: 'cancel' | 'complete') => { try { await api.patch(`/admin/bookings/${id}/${action}`); toast.success(ui(action === 'complete' ? 'تم تأكيد الحضور' : 'تم إلغاء الحجز')); await refetch(); await qc.invalidateQueries({ queryKey: ['admin-slot-bookings'] }); } catch (e) { toast.error(apiError(e)); } };
  return <Shell title="حجوزات الكلاسات" description="ابحث بالكلاس والمدرب والشهر، ثم راجع الحجوزات وأكّد الحضور أو ألغِ الحجز.">
    <Card><CardContent className="grid gap-3 pt-6 md:grid-cols-5">
      <div><Label>نوع الكلاس</Label><select className={SELECT_CLS} value={filters.classId} onChange={(e) => setFilters({ ...filters, classId: e.target.value })}><option value="">كل الكلاسات</option>{classTypes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
      <div><Label>اسم المدرب</Label><select className={SELECT_CLS} value={filters.trainerId} onChange={(e) => setFilters({ ...filters, trainerId: e.target.value })}><option value="">كل المدربين</option>{allTrainers.filter((item) => item.isActive).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
      <div><Label>الشهر</Label><Input type="number" min="1" max="12" value={filters.month} onChange={(e) => setFilters({ ...filters, month: e.target.value })} /></div>
      <div><Label>السنة</Label><Input type="number" value={filters.year} onChange={(e) => setFilters({ ...filters, year: e.target.value })} /></div>
      <Button className="self-end" onClick={search}>بحث</Button>
    </CardContent></Card>
    {isFetching ? <Empty text="جارٍ تحميل الحجوزات..." /> : isError ? <Empty text={apiError(error)} /> : !applied ? <Empty text="حدد بيانات البحث واضغط بحث" /> : data.length === 0 ? <Empty text="لا توجد حجوزات مطابقة" /> :
      <div className="overflow-x-auto rounded-xl border"><table className="w-full text-sm">
        <thead className="bg-muted/60"><tr>{['العضو', 'الكلاس', 'المدرب', 'الموعد', 'الخدمات الإضافية', 'الحالة', 'الإجراءات'].map((heading) => <th key={heading} className="p-3 text-start">{heading}</th>)}</tr></thead>
        <tbody>{data.map((row) => <tr key={row.id} className="border-t">
          <td className="p-3"><b>{row.member?.name ?? 'غير محدد'}</b>{row.member?.member_code && <small className="block text-muted-foreground">{row.member.member_code}</small>}</td>
          <td className="p-3">{row.class.name}</td>
          <td className="p-3">{row.trainer.name}</td>
          <td className="p-3">{new Date(row.slot.startAt).toLocaleString(schedulingLocale())}</td>
          <td className="p-3">{(row.additionalServices ?? []).filter((item) => item.status !== 'cancelled').map((item) => item.name).join('، ') || '—'}</td>
          <td className="p-3"><StatusBadge status={row.status === 'confirmed' ? 'active' : row.status === 'cancelled' ? 'expired' : 'pending'} label={statusLabel(row.status)} /></td>
          <td className="p-3"><div className="flex flex-wrap gap-2">
            {row.status === 'confirmed' && <Button size="sm" variant="outline" onClick={() => openServices(row)}>خدمة إضافية</Button>}
            {row.status === 'confirmed' && <Button size="sm" onClick={() => void transition(row.id, 'complete')}>تأكيد الحضور</Button>}
            {['confirmed', 'wait'].includes(row.status) && <Button size="sm" variant="destructive" onClick={() => void transition(row.id, 'cancel')}>إلغاء</Button>}
          </div></td>
        </tr>)}</tbody>
      </table></div>}
    <Dialog open={Boolean(servicesBooking)} onOpenChange={(open) => { if (!open && !isSavingServices) setServicesBooking(null); }}>
      <DialogContent className="sm:max-w-lg" aria-describedby={undefined}>
        <DialogHeader><DialogTitle>الخدمات الإضافية للحجز</DialogTitle></DialogHeader>
        {servicesBooking && <div className="space-y-4">
          <div className="rounded-lg bg-muted/60 p-3 text-sm">
            <b>{servicesBooking.member?.name ?? 'غير محدد'}</b>
            <span className="mx-2 text-muted-foreground">·</span>{servicesBooking.class.name}
          </div>
          {isLoadingServices || isLoadingClassServices ? <Empty text="جارٍ تحميل الخدمات..." /> : visibleSlotServices.length === 0 ? <Empty text="لا توجد خدمات تابعة لهذا الكلاس" /> :
            <div className="space-y-2">
              <Label>الخدمات المتاحة للكلاس</Label>
              <select
                multiple
                className={`${SELECT_CLS} h-40 py-2`}
                value={effectiveSelectedServiceIds.map(String)}
                onChange={(event) => {
                  const ids = Array.from(event.currentTarget.selectedOptions, (option) => Number(option.value));
                  setSelectedServiceIds([...new Set([...ids, ...requiredServiceIds])]);
                }}
              >
                {visibleSlotServices.map((service) => <option key={service.serviceId} value={service.serviceId}>{service.name}{service.isRequired ? ' (إجبارية)' : ''}</option>)}
              </select>
              <p className="text-xs text-muted-foreground">يمكن اختيار أكثر من خدمة باستخدام Ctrl مع الضغط على الخدمات.</p>
            </div>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={isSavingServices} onClick={() => setServicesBooking(null)}>إلغاء</Button>
            <Button disabled={isSavingServices || isLoadingServices || isLoadingClassServices} onClick={() => void saveServices()}>{isSavingServices ? 'جارٍ الحفظ...' : 'حفظ الخدمات'}</Button>
          </div>
        </div>}
      </DialogContent>
    </Dialog>
  </Shell>;
}

export function AvailableClassSlotsAdminPage() {
  useUi();
  const { data: classTypes = [] } = useArrayResource<ClassTypeOption>('club-mos/lookups/class_type');
  const { items: allTrainers } = useFitnessResourceList<TrainerOption>('club-trainers');
  const [filters, setFilters] = useState({ classId: '', trainerId: '', month: '', year: '' }); const [applied, setApplied] = useState('');
  const { data = [], isFetching } = useQuery({ queryKey: ['available-class-slots', applied], queryFn: async () => (await api.get<AvailableSlot[]>(`/class-schedules/available-slots${applied ? `?${applied}` : ''}`)).data });
  const apply = () => { const p = new URLSearchParams(); Object.entries(filters).forEach(([k, v]) => v && p.set(k, v)); setApplied(p.toString()); };
  return <Shell title="المواعيد المتاحة" description="معاينة المواعيد المنشورة وحالة الحجز والسعة المتبقية."><Card><CardContent className="grid gap-3 pt-6 md:grid-cols-5"><div><Label>نوع الكلاس</Label><select className={SELECT_CLS} value={filters.classId} onChange={(e) => setFilters({ ...filters, classId: e.target.value })}><option value="">كل الكلاسات</option>{classTypes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div><div><Label>اسم المدرب</Label><select className={SELECT_CLS} value={filters.trainerId} onChange={(e) => setFilters({ ...filters, trainerId: e.target.value })}><option value="">كل المدربين</option>{allTrainers.filter((item) => item.isActive).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div><div><Label>الشهر</Label><Input type="number" min="1" max="12" value={filters.month} onChange={(e) => setFilters({ ...filters, month: e.target.value })} /></div><div><Label>السنة</Label><Input type="number" min="2000" value={filters.year} onChange={(e) => setFilters({ ...filters, year: e.target.value })} /></div><Button className="self-end" onClick={apply}>تطبيق</Button></CardContent></Card>{isFetching ? <Empty text="جارٍ التحميل..." /> : data.length === 0 ? <Empty /> : <div className="grid gap-3 lg:grid-cols-2">{data.map((slot) => <Card key={slot.id}><CardContent className="space-y-2 pt-6"><div className="flex justify-between"><b>{slot.class.name}</b><StatusBadge status={slot.bookingStatus === 'booking_available' ? 'active' : 'pending'} label={statusLabel(slot.bookingStatus)} /></div><p>{slot.trainer.name} · {new Date(slot.startAt).toLocaleString(schedulingLocale())}</p><p className="text-sm text-muted-foreground">المؤكد: {slot.confirmedBookingsCount} · المتبقي: {slot.remainingCapacity} · السعة: {slot.capacity}</p></CardContent></Card>)}</div>}</Shell>;
}
