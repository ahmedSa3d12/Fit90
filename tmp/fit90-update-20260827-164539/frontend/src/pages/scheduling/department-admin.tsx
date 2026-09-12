import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, CalendarRange, ChevronLeft, ChevronRight, Clock3, Pencil, Plus, TicketPlus, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { StatusBadge } from '@/components/common/status-badge';
import { MemberSearchCombobox } from '@/components/club/member-search-combobox';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useFitnessT } from '@/hooks/use-fitness-t';
import { api, apiError } from '@/lib/api';
import { useUi } from '@/store/locale';
import type { ClubMemberListItem } from '@/types/club';
import { SELECT_CLS, useFitnessResourceList } from '../club/fitness/shared';
import { useSchedulingProviders } from './providers';
import type { BookingRow, Category, ScheduleRow, ServiceRow } from './shared';
import type { MonthlyPlan } from './monthly-schedule-launcher';

type BookingDetails = BookingRow & {
  memberCode?: string | null;
  memberPhone?: string | null;
  employeeName?: string | null;
  createdAt?: string;
};

type AppointmentAdditionalOption = {
  serviceId: number;
  name: string;
  description?: string | null;
  price?: string;
  isRequired: boolean;
  selected?: boolean;
};

type MemberSpaFreeSessions = {
  service: { id: number; name: string };
  hasFreeSessions: boolean;
  total: number;
  used: number;
  remaining: number;
  sources: Array<{ subscriptionId: number; subscriptionName: string }>;
};

const EMPTY_ADDITIONAL_OPTIONS: AppointmentAdditionalOption[] = [];

const dateLocale = () => (document.documentElement.lang === 'en' ? 'en-US' : 'ar-EG');
const monthRange = (month: string, year: string) => {
  const numericMonth = Number(month);
  const numericYear = Number(year);
  const last = new Date(numericYear, numericMonth, 0).getDate();
  return {
    dateFrom: `${numericYear}-${String(numericMonth).padStart(2, '0')}-01`,
    dateTo: `${numericYear}-${String(numericMonth).padStart(2, '0')}-${String(last).padStart(2, '0')}`,
  };
};
const slotDateTime = (slot: ScheduleRow) => new Date(`${slot.slotDate}T${slot.startTime}`);
const statusText = (status: string, ui: (value: string) => string) => ({
  booking_not_started: ui('لم يبدأ الحجز بعد'),
  booking_available: ui('الحجز متاح'),
  booking_closed: ui('انتهت فترة الحجز'),
  fully_booked: ui('مكتمل العدد'),
  cancelled: ui('ملغي'),
  appointment_started: ui('بدأ الموعد'),
  unavailable: ui('غير متاح'),
  pending: ui('قيد الانتظار'),
  confirmed: ui('مؤكد'),
  wait: ui('انتظار'),
  completed: ui('مكتمل'),
  no_show: ui('لم يحضر'),
}[status] ?? status);

function bookingStatus(slot: ScheduleRow) {
  if (slot.status === 'cancelled' || slot.status === 'hidden') return slot.status === 'cancelled' ? 'cancelled' : 'unavailable';
  const now = new Date();
  if (now >= slotDateTime(slot)) return 'appointment_started';
  if (slot.bookingStartAt && now < new Date(slot.bookingStartAt)) return 'booking_not_started';
  if (slot.bookingEndAt && now > new Date(slot.bookingEndAt)) return 'booking_closed';
  if (slot.remaining <= 0) return 'fully_booked';
  return 'booking_available';
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">{text}</div>;
}

function useDepartmentOptions(category: Category) {
  const { items: allServices } = useFitnessResourceList<ServiceRow>('scheduling/services');
  const { providers, isLoading: providersLoading } = useSchedulingProviders(category);
  return {
    services: allServices.filter((service) => service.isActive && service.category === category),
    providers,
    providersLoading,
  };
}

function Filters({
  category,
  value,
  onChange,
  onApply,
}: {
  category: Category;
  value: { serviceId: string; employeeId: string; month: string; year: string };
  onChange: (value: { serviceId: string; employeeId: string; month: string; year: string }) => void;
  onApply: () => void;
}) {
  const ft = useFitnessT();
  const ui = useUi();
  const { services, providers, providersLoading } = useDepartmentOptions(category);
  const serviceLabel = category === 'personal_training' ? ft('sched.class') : ft('sched.service');
  const providerLabel = category === 'nutrition'
    ? ft('sched.nutritionSpecialist')
    : category === 'personal_training'
      ? ft('sched.trainer')
      : ft('sched.serviceProvider');
  const allProvidersLabel = category === 'personal_training'
    ? ft('sched.allTrainers')
    : ui('كل مقدمي الخدمة');
  return <Card><CardContent className="grid gap-3 pt-6 md:grid-cols-5">
    <div><Label>{serviceLabel}</Label><select className={SELECT_CLS} value={value.serviceId} onChange={(event) => onChange({ ...value, serviceId: event.target.value })}><option value="">{category === 'personal_training' ? ft('sched.allClasses') : ui('كل الخدمات')}</option>{services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}</select></div>
    <div><Label>{providerLabel}</Label><select className={SELECT_CLS} value={value.employeeId} onChange={(event) => onChange({ ...value, employeeId: event.target.value })}><option value="">{providersLoading ? ft('sched.loadingProviders') : allProvidersLabel}</option>{providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}</select></div>
    <div><Label>{ft('sched.month')}</Label><Input type="number" min="1" max="12" value={value.month} onChange={(event) => onChange({ ...value, month: event.target.value })} /></div>
    <div><Label>{ft('sched.year')}</Label><Input type="number" min="2000" value={value.year} onChange={(event) => onChange({ ...value, year: event.target.value })} /></div>
    <Button className="self-end" onClick={onApply}>{ui('بحث')}</Button>
  </CardContent></Card>;
}

function SlotBookingDialog({ slot, onClose, onDone }: { slot: ScheduleRow | null; onClose: () => void; onDone: () => void }) {
  const ui = useUi();
  const [member, setMember] = useState<ClubMemberListItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectedAdditionalIds, setSelectedAdditionalIds] = useState<number[]>([]);
  const { data: additionalOptions = EMPTY_ADDITIONAL_OPTIONS } = useQuery({
    queryKey: ['spa-schedule-additional-options', slot?.id],
    enabled: slot?.category === 'spa',
    queryFn: async () => (
      await api.get<AppointmentAdditionalOption[]>(`/scheduling/spa-additional-services/schedules/${slot!.id}`)
    ).data,
  });
  const { data: spaFreeSessions, isFetching: spaFreeSessionsLoading } = useQuery({
    queryKey: ['member-spa-free-sessions', slot?.id, member?.id],
    enabled: slot?.category === 'spa' && member != null,
    queryFn: async () => (
      await api.get<MemberSpaFreeSessions>(`/scheduling/bookings/schedules/${slot!.id}/members/${member!.id}/free-spa-sessions`)
    ).data,
  });
  useEffect(() => {
    setSelectedAdditionalIds(additionalOptions.filter((option) => option.isRequired).map((option) => option.serviceId));
  }, [additionalOptions, slot?.id]);
  const save = async () => {
    if (!slot || !member) return;
    setSaving(true);
    try {
      const status = slot.remaining > 0 ? 'confirmed' : 'wait';
      await api.post('/scheduling/bookings', {
        scheduleId: slot.id,
        memberId: member.id,
        memberName: member.name,
        status,
        ...(slot.category === 'spa' ? { additionalServiceIds: selectedAdditionalIds } : {}),
      });
      toast.success(ui(status === 'confirmed' ? 'تم تأكيد الحجز' : 'تمت إضافة العضو إلى قائمة الانتظار'));
      onDone();
    } catch (error) { toast.error(apiError(error)); } finally { setSaving(false); }
  };
  return <Dialog open={slot != null} onOpenChange={(open) => !open && onClose()}><DialogContent size="md" aria-describedby={undefined}><DialogHeader><DialogTitle>{ui('بيانات الحجز')}</DialogTitle></DialogHeader>{slot && <div className="space-y-4">
    <div className="rounded-xl border bg-muted/20 p-4"><b>{slot.serviceName}</b><p>{slot.employeeName} · {slotDateTime(slot).toLocaleString(dateLocale())}</p><p className="mt-1 text-sm">{ui('الحالة المتوقعة')}: <b>{statusText(slot.remaining > 0 ? 'confirmed' : 'wait', ui)}</b></p></div>
    <div><Label>{ui('بحث باسم العضو أو الكود أو الهاتف')}</Label><MemberSearchCombobox selectedMember={member} onSelect={setMember} onClear={() => setMember(null)} disabled={saving} /></div>
    {slot.category === 'spa' && member && <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">{spaFreeSessionsLoading ? <p className="text-sm text-muted-foreground">{ui('جارٍ تحميل رصيد جلسات السبا المجانية...')}</p> : spaFreeSessions?.hasFreeSessions ? <><div className="mb-3 flex items-center justify-between gap-3"><p className="font-semibold">{ui('رصيد جلسات السبا المجانية')}</p><span className="text-sm text-muted-foreground">{spaFreeSessions.sources.map((source) => source.subscriptionName).join('، ')}</span></div><div className="grid grid-cols-3 gap-2 text-center"><div className="rounded-lg bg-background p-3"><p className="text-xs text-muted-foreground">{ui('الإجمالي')}</p><p className="mt-1 text-xl font-bold">{spaFreeSessions.total}</p></div><div className="rounded-lg bg-background p-3"><p className="text-xs text-muted-foreground">{ui('المستخدمة')}</p><p className="mt-1 text-xl font-bold">{spaFreeSessions.used}</p></div><div className="rounded-lg bg-background p-3"><p className="text-xs text-muted-foreground">{ui('المتبقية')}</p><p className="mt-1 text-xl font-bold text-primary">{spaFreeSessions.remaining}</p></div></div></> : <p className="text-sm text-muted-foreground">{ui('لا توجد جلسات سبا مجانية متاحة لهذا العضو.')}</p>}</div>}
    {additionalOptions.length > 0 && <div className="space-y-1"><Label>{ui('الخدمة الإضافية')}</Label><select className={SELECT_CLS} value={selectedAdditionalIds[0] ?? ''} disabled={saving} onChange={(event) => setSelectedAdditionalIds(event.target.value ? [Number(event.target.value)] : [])}><option value="">{ui('اختر الخدمة الإضافية')}</option>{additionalOptions.map((option) => <option key={option.serviceId} value={option.serviceId}>{option.name}{option.price != null ? ` - ${Number(option.price).toFixed(2)}` : ''}</option>)}</select></div>}
    <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>{ui('إلغاء')}</Button><Button disabled={!member || saving} onClick={() => void save()}>{ui(slot.remaining > 0 ? 'تأكيد الحجز' : 'إضافة إلى الانتظار')}</Button></div>
  </div>}</DialogContent></Dialog>;
}

export function DepartmentAppointmentsAdmin({ category }: { category: Category }) {
  const ui = useUi();
  const qc = useQueryClient();
  const { services, providers } = useDepartmentOptions(category);
  const now = new Date();
  const initial = { serviceId: '', employeeId: '', month: String(now.getMonth() + 1), year: String(now.getFullYear()) };
  const [filters, setFilters] = useState(initial);
  const [applied, setApplied] = useState<typeof initial>({ ...initial });
  const [draftPlanId, setDraftPlanId] = useState<number | null>(null);
  const [creatingDraft, setCreatingDraft] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<ScheduleRow | null>(null);
  const [bookingSlot, setBookingSlot] = useState<ScheduleRow | null>(null);
  const [editSlot, setEditSlot] = useState<ScheduleRow | null>(null);
  const [detailsSlot, setDetailsSlot] = useState<ScheduleRow | null>(null);
  const [editForm, setEditForm] = useState({ slotDate: '', startTime: '', endTime: '', bookingStartAt: '', bookingEndAt: '', capacity: '1' });
  const [draftSlotDate, setDraftSlotDate] = useState('');
  const [draftSlotForm, setDraftSlotForm] = useState({ startTime: '18:00', endTime: '19:00', bookingStartAt: '', bookingEndAt: '', capacity: '20' });
  const [repeatDraftSlotWeekly, setRepeatDraftSlotWeekly] = useState(false);
  const [savingDraftSlot, setSavingDraftSlot] = useState(false);
  const { data: slots = [], isFetching, refetch } = useQuery({
    queryKey: ['department-appointments', category, applied],
    enabled: applied != null,
    queryFn: async () => {
      const range = monthRange(applied!.month, applied!.year);
      return (await api.get<ScheduleRow[]>('/scheduling/schedules/calendar', { params: { category, ...range, status: 'all', ...(applied!.serviceId ? { serviceId: applied!.serviceId } : {}), ...(applied!.employeeId ? { employeeId: applied!.employeeId } : {}) } })).data;
    },
  });
  const monthlyPlansQueryKey = ['service-monthly-schedules', category];
  const { data: monthlyPlans = [], isFetching: monthlyPlansLoading } = useQuery({
    queryKey: monthlyPlansQueryKey,
    queryFn: async () => (await api.get<MonthlyPlan[]>('/scheduling/monthly-schedules', { params: { category } })).data,
  });
  const matchingPlan = monthlyPlans.find((plan) =>
    plan.service_id === Number(applied.serviceId)
    && plan.employee_id === Number(applied.employeeId)
    && plan.month === Number(applied.month)
    && plan.year === Number(applied.year),
  ) ?? null;
  const boardDraftPlanId = matchingPlan?.status === 'draft' ? matchingPlan.id : draftPlanId;
  const { data: boardDraftPlan, refetch: refetchBoardDraft, isFetching: boardDraftLoading } = useQuery({
    queryKey: ['department-board-draft-plan', category, boardDraftPlanId],
    enabled: boardDraftPlanId != null,
    queryFn: async () => (await api.get<MonthlyPlan>(`/scheduling/monthly-schedules/${boardDraftPlanId}`)).data,
  });
  const { data: detailResponse, isFetching: detailsLoading } = useQuery({
    queryKey: ['department-slot-bookings', detailsSlot?.id],
    enabled: detailsSlot != null,
    queryFn: async () => (await api.get<{ data: BookingDetails[] }>('/scheduling/bookings', { params: { scheduleId: detailsSlot!.id, page: 1, pageSize: 200 } })).data,
  });
  const toLocalInput = (value?: string | null) => {
    if (!value) return '';
    const date = new Date(value);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  };
  const openEdit = (slot: ScheduleRow) => {
    setEditSlot(slot);
    setEditForm({ slotDate: slot.slotDate, startTime: slot.startTime.slice(0, 5), endTime: slot.endTime.slice(0, 5), bookingStartAt: toLocalInput(slot.bookingStartAt), bookingEndAt: toLocalInput(slot.bookingEndAt), capacity: String(slot.capacity) });
  };
  const saveEdit = async () => {
    if (!editSlot) return;
    try {
      await api.put(`/scheduling/schedules/${editSlot.id}`, { slotDate: editForm.slotDate, startTime: editForm.startTime, endTime: editForm.endTime, bookingStartAt: editForm.bookingStartAt ? new Date(editForm.bookingStartAt).toISOString() : undefined, bookingEndAt: editForm.bookingEndAt ? new Date(editForm.bookingEndAt).toISOString() : undefined, capacity: Number(editForm.capacity) });
      toast.success(ui('تم تعديل الموعد'));
      setEditSlot(null);
      setSelectedSlot(null);
      await refetch();
      if (boardDraftPlanId) await refetchBoardDraft();
    } catch (error) { toast.error(apiError(error)); }
  };
  const saveDraftSlot = async () => {
    if (!boardDraftPlan || !draftSlotDate) return;
    const templateStart = new Date(`${draftSlotDate}T${draftSlotForm.startTime}:00`);
    const templateEnd = new Date(`${draftSlotDate}T${draftSlotForm.endTime}:00`);
    const bookingStart = draftSlotForm.bookingStartAt ? new Date(draftSlotForm.bookingStartAt) : null;
    const bookingEnd = draftSlotForm.bookingEndAt ? new Date(draftSlotForm.bookingEndAt) : null;
    if (templateEnd <= templateStart) { toast.error(ui('يجب أن تكون نهاية الموعد بعد بدايته.')); return; }
    if ((bookingStart == null) !== (bookingEnd == null)) { toast.error(ui('حدد تاريخ ووقت فتح وغلق الحجز معًا.')); return; }
    if (repeatDraftSlotWeekly && (!bookingStart || !bookingEnd)) { toast.error(ui('حدد تاريخ ووقت فتح وغلق الحجز لتطبيق الموعد أسبوعيًا.')); return; }
    setSavingDraftSlot(true);
    try {
      if (repeatDraftSlotWeekly) {
        await api.post('/scheduling/schedules/generate/recurring', {
          monthlyScheduleId: boardDraftPlan.id,
          serviceId: boardDraftPlan.service_id,
          employeeId: boardDraftPlan.employee_id,
          weekdays: [new Date(`${draftSlotDate}T12:00:00`).getDay()],
          dateFrom: `${boardDraftPlan.year}-${String(boardDraftPlan.month).padStart(2, '0')}-01`,
          dateTo: `${boardDraftPlan.year}-${String(boardDraftPlan.month).padStart(2, '0')}-${String(new Date(boardDraftPlan.year, boardDraftPlan.month, 0).getDate()).padStart(2, '0')}`,
          templateDate: draftSlotDate,
          startTime: draftSlotForm.startTime,
          endTime: draftSlotForm.endTime,
          bookingStartAt: bookingStart?.toISOString(),
          bookingEndAt: bookingEnd?.toISOString(),
          capacity: Number(draftSlotForm.capacity),
        });
      } else {
        await api.post('/scheduling/schedules', {
          monthlyScheduleId: boardDraftPlan.id,
          serviceId: boardDraftPlan.service_id,
          employeeId: boardDraftPlan.employee_id,
          slotDate: draftSlotDate,
          startTime: draftSlotForm.startTime,
          endTime: draftSlotForm.endTime,
          bookingStartAt: bookingStart?.toISOString(),
          bookingEndAt: bookingEnd?.toISOString(),
          capacity: Number(draftSlotForm.capacity),
        });
      }
      toast.success(ui(repeatDraftSlotWeekly ? 'تم تطبيق الموعد أسبوعيًا على الشهر' : 'تمت إضافة الموعد'));
      setDraftSlotDate('');
      setDraftSlotForm({ startTime: '18:00', endTime: '19:00', bookingStartAt: '', bookingEndAt: '', capacity: '20' });
      setRepeatDraftSlotWeekly(false);
      await refetchBoardDraft();
      await qc.invalidateQueries({ queryKey: monthlyPlansQueryKey });
    } catch (error) { toast.error(apiError(error)); } finally { setSavingDraftSlot(false); }
  };
  const cancelSlot = async (slot: ScheduleRow) => {
    if (!window.confirm(ui('هل تريد إلغاء هذا الموعد وإلغاء حجوزاته؟'))) return;
    try {
      const { data } = await api.patch<{ notifiedBookingsCount: number }>(`/scheduling/schedules/${slot.id}/cancel`);
      toast.success(ui(`تم إلغاء الموعد وإشعار ${data.notifiedBookingsCount} عضو`));
      setDetailsSlot(null);
      setSelectedSlot(null);
      await refetch();
    } catch (error) { toast.error(apiError(error)); }
  };
  const cancelBooking = async (booking: BookingDetails) => {
    if (!window.confirm(ui(`هل تريد إلغاء حجز ${booking.memberName ?? 'هذا العضو'}؟`))) return;
    try {
      await api.patch(`/scheduling/bookings/${booking.id}`, { status: 'cancelled' });
      toast.success(ui('تم إلغاء الحجز وتحديث قائمة الانتظار'));
      await qc.invalidateQueries({ queryKey: ['department-slot-bookings', detailsSlot?.id] });
      await refetch();
    } catch (error) { toast.error(apiError(error)); }
  };
  const completeBooking = async (booking: BookingDetails) => {
    try {
      await api.patch(`/scheduling/bookings/${booking.id}`, { status: 'completed' });
      toast.success(ui('تم تأكيد الحضور وتحويل الحجز إلى مكتمل'));
      await qc.invalidateQueries({ queryKey: ['department-slot-bookings', detailsSlot?.id] });
      await refetch();
    } catch (error) { toast.error(apiError(error)); }
  };
  const openOrCreateDraft = async () => {
    if (!applied.serviceId || !applied.employeeId) {
      toast.error(ui('اختر الخدمة ومقدم الخدمة أولًا ثم اضغط بحث'));
      return;
    }
    if (matchingPlan) {
      if (matchingPlan.status === 'draft') {
        setDraftPlanId(matchingPlan.id);
        return;
      }
      toast.error(ui(matchingPlan.status === 'published'
        ? 'جدول هذا الشهر منشور بالفعل، ويمكن إدارة مواعيده من التقويم.'
        : 'جدول هذا الشهر مؤرشف ولا يمكن تعديل مواعيده.'));
      return;
    }
    setCreatingDraft(true);
    try {
      const { data: created } = await api.post<MonthlyPlan>('/scheduling/monthly-schedules', {
        category,
        serviceId: Number(applied.serviceId),
        employeeId: Number(applied.employeeId),
        month: Number(applied.month),
        year: Number(applied.year),
      });
      setDraftPlanId(created.id);
      toast.success(ui('تم إنشاء جدول الشهر كمسودة ويمكنك إضافة المواعيد الآن'));
      await qc.invalidateQueries({ queryKey: monthlyPlansQueryKey });
    } catch (error) { toast.error(apiError(error)); } finally { setCreatingDraft(false); }
  };
  const rows = detailResponse?.data ?? [];
  const publishedSlots = slots.filter((slot) => slot.status !== 'hidden');
  const appliedMonth = Number(applied.month) || now.getMonth() + 1;
  const appliedYear = Number(applied.year) || now.getFullYear();
  const daysCount = new Date(appliedYear, appliedMonth, 0).getDate();
  const firstDay = new Date(appliedYear, appliedMonth - 1, 1).getDay();
  const dateKey = (day: number) => `${appliedYear}-${String(appliedMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const displayedMonthStart = new Date(appliedYear, appliedMonth - 1, 1);
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const isPastMonth = displayedMonthStart < currentMonthStart;
  const showingDraft = !isPastMonth && matchingPlan?.status === 'draft' && boardDraftPlan?.id === matchingPlan.id;
  const draftSlots: ScheduleRow[] = showingDraft ? (boardDraftPlan.slots ?? []).map((slot) => ({
    id: slot.id,
    monthlyScheduleId: boardDraftPlan.id,
    serviceId: boardDraftPlan.service_id,
    serviceName: boardDraftPlan.service.name,
    category,
    color: null,
    employeeId: boardDraftPlan.employee_id,
    employeeName: boardDraftPlan.trainer.name,
    roomId: null,
    roomName: null,
    machineId: null,
    branchId: null,
    slotDate: slot.slot_date,
    startTime: slot.start_time,
    endTime: slot.end_time,
    bookingStartAt: slot.booking_start_at ?? null,
    bookingEndAt: slot.booking_end_at ?? null,
    capacity: slot.capacity,
    bookedCount: 0,
    waitingCount: 0,
    remaining: slot.capacity,
    status: slot.status,
    notes: null,
  })) : [];
  const displayedSlots = showingDraft ? draftSlots : publishedSlots;
  const slotsByDate = new Map<string, ScheduleRow[]>();
  displayedSlots.forEach((slot) => slotsByDate.set(slot.slotDate, [...(slotsByDate.get(slot.slotDate) ?? []), slot]));
  const changeMonth = (offset: number) => {
    const date = new Date(appliedYear, appliedMonth - 1 + offset, 1);
    const next = { ...applied, month: String(date.getMonth() + 1), year: String(date.getFullYear()) };
    setFilters(next);
    setApplied({ ...next });
    setDraftPlanId(null);
  };
  const visualSlotStatus = (slot: ScheduleRow) => (
    bookingStatus(slot) === 'fully_booked' && (slot.waitingCount ?? 0) > 0
      ? 'wait'
      : bookingStatus(slot)
  );
  const visualSlotLabel = (slot: ScheduleRow) => (
    visualSlotStatus(slot) === 'wait'
      ? `${ui('قائمة انتظار')} (${slot.waitingCount ?? 0})`
      : statusText(bookingStatus(slot), ui)
  );
  const slotTone = (slot: ScheduleRow) => {
    const state = visualSlotStatus(slot);
    if (state === 'booking_available') return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
    if (state === 'fully_booked') return 'border-orange-500/45 bg-orange-500/15 text-orange-700 dark:text-orange-300';
    if (state === 'wait') return 'border-violet-500/45 bg-violet-500/15 text-violet-700 dark:text-violet-300';
    if (state === 'booking_closed') return 'border-rose-500/45 bg-rose-500/15 text-rose-700 dark:text-rose-300';
    if (state === 'booking_not_started') return 'border-sky-500/45 bg-sky-500/15 text-sky-700 dark:text-sky-300';
    if (state === 'cancelled') return 'border-red-600/60 bg-red-600/20 text-red-700 dark:text-red-200';
    if (state === 'unavailable' || state === 'appointment_started') return 'border-slate-500/35 bg-slate-500/10 text-slate-600 dark:text-slate-300';
    return 'border-border bg-muted/70 text-muted-foreground';
  };
  const selectedServiceName = services.find((item) => item.id === Number(applied.serviceId))?.name;
  const selectedProviderName = providers.find((item) => item.id === Number(applied.employeeId))?.name;
  const monthlyPlanStatusText = (status: MonthlyPlan['status']) => ({
    draft: ui('مسودة'),
    published: ui('منشور'),
    archived: ui('مؤرشف'),
  }[status]);
  const availableCount = displayedSlots.filter((slot) => bookingStatus(slot) === 'booking_available').length;
  const fullCount = displayedSlots.filter((slot) => bookingStatus(slot) === 'fully_booked').length;
  const monthOffset = (appliedYear - now.getFullYear()) * 12 + appliedMonth - (now.getMonth() + 1);
  const displayedMonthLabel = monthOffset === 0 ? ui('الشهر الحالي') : monthOffset === 1 ? ui('الشهر التالي') : monthOffset === -1 ? ui('الشهر السابق') : new Date(appliedYear, appliedMonth - 1, 1).toLocaleDateString(dateLocale(), { month: 'long', year: 'numeric' });
  return <div className="space-y-5">
    <Filters category={category} value={filters} onChange={setFilters} onApply={() => { setDraftPlanId(null); setApplied({ ...filters }); if (JSON.stringify(applied) === JSON.stringify(filters)) void refetch(); }} />

    <Card className="border-primary/30 bg-gradient-to-l from-primary/10 via-card to-card">
      <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-6">
        <div>
          <p className="font-bold">{ui('إعداد جدول')} {new Date(appliedYear, appliedMonth - 1, 1).toLocaleDateString(dateLocale(), { month: 'long', year: 'numeric' })}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {!applied.serviceId || !applied.employeeId
              ? ui('اختر الخدمة ومقدم الخدمة لعمل جدول جديد للشهر المعروض.')
              : monthlyPlansLoading
                ? ui('جارٍ التحقق من الجدول الشهري...')
                : matchingPlan
                  ? `${matchingPlan.service.name} · ${matchingPlan.trainer.name} · ${ui('الحالة')}: ${monthlyPlanStatusText(matchingPlan.status)}`
                  : `${selectedServiceName ?? ui('الخدمة')} · ${selectedProviderName ?? ui('مقدم الخدمة')} · ${ui('لا توجد مسودة لهذا الشهر')}`}
          </p>
        </div>
        <Button disabled={!applied.serviceId || !applied.employeeId || monthlyPlansLoading || creatingDraft || matchingPlan != null} onClick={() => void openOrCreateDraft()}>
          <Plus className="me-2 size-4" />
          {creatingDraft ? ui('جارٍ إنشاء المسودة...') : matchingPlan?.status === 'draft' ? ui('المسودة معروضة في الجدول') : ui('إنشاء جدول كمسودة')}
        </Button>
      </CardContent>
    </Card>

    <div className="grid gap-3 sm:grid-cols-3">
      <Card><CardContent className="flex items-center justify-between pt-6"><div><p className="text-sm text-muted-foreground">{ui('إجمالي المواعيد')}</p><p className="mt-1 text-2xl font-bold">{displayedSlots.length}</p></div><CalendarRange className="size-8 text-primary" /></CardContent></Card>
      <Card><CardContent className="flex items-center justify-between pt-6"><div><p className="text-sm text-muted-foreground">{ui('الحجز متاح')}</p><p className="mt-1 text-2xl font-bold text-emerald-600">{availableCount}</p></div><TicketPlus className="size-8 text-emerald-500" /></CardContent></Card>
      <Card><CardContent className="flex items-center justify-between pt-6"><div><p className="text-sm text-muted-foreground">{ui('مكتمل العدد')}</p><p className="mt-1 text-2xl font-bold text-amber-600">{fullCount}</p></div><Users className="size-8 text-amber-500" /></CardContent></Card>
    </div>

    <Card className="overflow-hidden">
      <div className="border-b bg-muted/20 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h3 className="text-xl font-bold">{new Date(appliedYear, appliedMonth - 1, 1).toLocaleDateString(dateLocale(), { month: 'long', year: 'numeric' })}</h3><p className="mt-1 text-sm text-muted-foreground">{isPastMonth ? ui('هذا شهر سابق: المواعيد متاحة للعرض فقط ولا يمكن تعديلها أو الحجز فيها.') : showingDraft ? ui('مواعيد مسودة الشهر معروضة داخل هذا الجدول؛ اضغط على أي موعد لتعديله.') : ui('اضغط على أي موعد للحجز أو التعديل أو إدارة حجوزاته.')}</p></div>
          <div className="flex items-center gap-2">
            <Button size="icon" variant="outline" aria-label={ui('الشهر السابق')} onClick={() => changeMonth(-1)}><ChevronRight className="size-4" /></Button>
            <Button variant="outline" className="pointer-events-none">{displayedMonthLabel}</Button>
            <Button size="icon" variant="outline" aria-label={ui('الشهر التالي')} onClick={() => changeMonth(1)}><ChevronLeft className="size-4" /></Button>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-2"><i className="size-2.5 rounded-full bg-emerald-500" />{ui('الحجز متاح')}</span>
          <span className="flex items-center gap-2"><i className="size-2.5 rounded-full bg-orange-500" />{ui('مكتمل العدد')}</span>
          <span className="flex items-center gap-2"><i className="size-2.5 rounded-full bg-violet-500" />{ui('قائمة انتظار')}</span>
          <span className="flex items-center gap-2"><i className="size-2.5 rounded-full bg-rose-500" />{ui('الحجز مغلق')}</span>
          <span className="flex items-center gap-2"><i className="size-2.5 rounded-full bg-sky-500" />{ui('لم يبدأ الحجز')}</span>
          <span className="flex items-center gap-2"><i className="size-2.5 rounded-full bg-red-600" />{ui('موعد ملغي')}</span>
        </div>
      </div>
      {(isFetching || boardDraftLoading) && <div className="border-b bg-primary/5 p-3 text-center text-sm text-primary">{ui('جارٍ تحميل مواعيد الشهر...')}</div>}
      <div className="overflow-x-auto">
        <div className="grid min-w-[1050px] grid-cols-7 border-s border-t text-sm">
          {['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'].map((day) => <div key={day} className="border-b border-e bg-muted/40 p-3 text-center font-bold">{ui(day)}</div>)}
          {Array.from({ length: firstDay }).map((_, index) => <div key={`empty-${index}`} className="min-h-44 border-b border-e bg-muted/10" />)}
          {Array.from({ length: daysCount }, (_, index) => index + 1).map((day) => {
            const daySlots = slotsByDate.get(dateKey(day)) ?? [];
            return <div key={day} className="min-h-44 border-b border-e bg-card p-2 align-top">
              <div className="mb-2 flex items-center justify-between"><span className="flex size-7 items-center justify-center rounded-full bg-muted font-bold">{day}</span><div className="flex items-center gap-1">{daySlots.length > 0 && <span className="text-xs text-muted-foreground">{daySlots.length} {ui('موعد')}</span>}{showingDraft && <Button size="icon" variant="ghost" className="size-7" aria-label={`${ui('إضافة موعد يوم')} ${day}`} onClick={() => setDraftSlotDate(dateKey(day))}><Plus className="size-4" /></Button>}</div></div>
              <div className="space-y-2">{daySlots.map((slot) => <button key={slot.id} type="button" onClick={() => showingDraft ? openEdit(slot) : setSelectedSlot(slot)} className={`w-full rounded-lg border p-2 text-start transition hover:-translate-y-0.5 hover:shadow-md ${showingDraft ? 'border-amber-500/45 bg-amber-500/10 text-amber-700 dark:text-amber-300' : slotTone(slot)}`}>
                <span className="flex items-center gap-1 font-bold"><Clock3 className="size-3.5" />{slot.startTime.slice(0, 5)}</span>
                <span className="mt-1 block truncate text-xs font-semibold">{slot.serviceName}</span>
                <span className="block truncate text-[11px] opacity-80">{slot.employeeName ?? '—'}</span>
                <span className="mt-1 block text-[10px]">{showingDraft ? `${ui('مسودة')} · ${ui('السعة')} ${slot.capacity} · ${ui('اضغط للتعديل')}` : `${visualSlotLabel(slot)} · ${ui('متبقي')} ${slot.remaining}`}</span>
              </button>)}</div>
            </div>;
          })}
        </div>
      </div>
      {!isFetching && !boardDraftLoading && displayedSlots.length === 0 && <div className="border-t p-8 text-center text-muted-foreground">{ui(showingDraft ? 'مسودة هذا الشهر لا تحتوي على مواعيد حتى الآن.' : 'لا توجد مواعيد منشورة مطابقة للاختيارات في هذا الشهر.')}</div>}
    </Card>

    <Dialog open={selectedSlot != null} onOpenChange={(open) => !open && setSelectedSlot(null)}>
      <DialogContent size="md" aria-describedby={undefined}><DialogHeader><DialogTitle>{ui('إدارة الموعد')}</DialogTitle></DialogHeader>{selectedSlot && <div className="space-y-5">
        <div className="rounded-2xl border bg-gradient-to-br from-primary/10 to-transparent p-5">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xl font-bold">{selectedSlot.serviceName}</p><p className="mt-1 text-muted-foreground">{ui('مقدم الخدمة')}: {selectedSlot.employeeName ?? '—'}</p></div><span className={`rounded-full border px-3 py-1 text-xs font-bold ${slotTone(selectedSlot)}`}>{visualSlotLabel(selectedSlot)}</span></div>
          <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3"><div className="rounded-lg bg-background/70 p-3"><span className="text-muted-foreground">{ui('التاريخ')}</span><b className="mt-1 block">{new Date(`${selectedSlot.slotDate}T12:00:00`).toLocaleDateString(dateLocale())}</b></div><div className="rounded-lg bg-background/70 p-3"><span className="text-muted-foreground">{ui('الوقت')}</span><b className="mt-1 block">{selectedSlot.startTime.slice(0, 5)} - {selectedSlot.endTime.slice(0, 5)}</b></div><div className="rounded-lg bg-background/70 p-3"><span className="text-muted-foreground">{ui('السعة')}</span><b className="mt-1 block">{selectedSlot.bookedCount} / {selectedSlot.capacity} · {ui('متبقي')} {selectedSlot.remaining} · {ui('انتظار')} {selectedSlot.waitingCount ?? 0}</b></div></div>
        </div>
        {isPastMonth ? <div className="rounded-xl border bg-muted/30 p-4 text-center text-sm text-muted-foreground">{ui('هذا الموعد للعرض فقط لأن الشهر سابق. لا يمكن الحجز أو التعديل أو الإلغاء.')}</div> : <div className="grid gap-3 sm:grid-cols-2">
          <Button disabled={!['booking_available', 'fully_booked'].includes(bookingStatus(selectedSlot))} onClick={() => { const slot = selectedSlot; setSelectedSlot(null); setBookingSlot(slot); }}><TicketPlus className="me-2 size-4" />{ui(bookingStatus(selectedSlot) === 'fully_booked' ? 'إضافة لقائمة الانتظار' : 'حجز عضو')}</Button>
          <Button variant="outline" disabled={selectedSlot.status === 'cancelled'} onClick={() => { const slot = selectedSlot; setSelectedSlot(null); openEdit(slot); }}><Pencil className="me-2 size-4" />{ui('تعديل الموعد')}</Button>
          <Button variant="outline" onClick={() => { const slot = selectedSlot; setSelectedSlot(null); setDetailsSlot(slot); void qc.invalidateQueries({ queryKey: ['department-slot-bookings', slot.id] }); }}><Users className="me-2 size-4" />{ui('الحجوزات وإلغاؤها')}</Button>
          <Button variant="destructive" disabled={selectedSlot.status === 'cancelled'} onClick={() => void cancelSlot(selectedSlot)}><Ban className="me-2 size-4" />{ui('إلغاء الموعد بالكامل')}</Button>
        </div>}
      </div>}</DialogContent>
    </Dialog>
    <SlotBookingDialog slot={bookingSlot} onClose={() => setBookingSlot(null)} onDone={() => { setBookingSlot(null); void refetch(); }} />
    <Dialog open={editSlot != null} onOpenChange={(open) => !open && setEditSlot(null)}><DialogContent size="form" aria-describedby={undefined}><DialogHeader><DialogTitle>{ui('تعديل الموعد')}</DialogTitle></DialogHeader><div className="grid gap-4 md:grid-cols-2"><div><Label>{ui('التاريخ')}</Label><Input type="date" value={editForm.slotDate} onChange={(event) => setEditForm({ ...editForm, slotDate: event.target.value })} /></div><div><Label>{ui('السعة')}</Label><Input type="number" min="1" value={editForm.capacity} onChange={(event) => setEditForm({ ...editForm, capacity: event.target.value })} /></div><div><Label>{ui('بداية الموعد')}</Label><Input type="time" value={editForm.startTime} onChange={(event) => setEditForm({ ...editForm, startTime: event.target.value })} /></div><div><Label>{ui('نهاية الموعد')}</Label><Input type="time" value={editForm.endTime} onChange={(event) => setEditForm({ ...editForm, endTime: event.target.value })} /></div><div><Label>{ui('فتح الحجز')}</Label><Input type="datetime-local" value={editForm.bookingStartAt} onChange={(event) => setEditForm({ ...editForm, bookingStartAt: event.target.value })} /></div><div><Label>{ui('غلق الحجز')}</Label><Input type="datetime-local" value={editForm.bookingEndAt} onChange={(event) => setEditForm({ ...editForm, bookingEndAt: event.target.value })} /></div></div><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setEditSlot(null)}>{ui('إلغاء')}</Button><Button onClick={() => void saveEdit()}>{ui('حفظ التعديل')}</Button></div></DialogContent></Dialog>
    <Dialog open={Boolean(draftSlotDate)} onOpenChange={(open) => { if (!open) { setDraftSlotDate(''); setRepeatDraftSlotWeekly(false); } }}>
      <DialogContent size="form" aria-describedby={undefined}>
        <DialogHeader><DialogTitle>{ui('إضافة موعد يوم')} {draftSlotDate}</DialogTitle></DialogHeader>
        <div className="grid gap-4 md:grid-cols-5">
          <div><Label>{ui('من')}</Label><Input type="time" value={draftSlotForm.startTime} onChange={(event) => setDraftSlotForm({ ...draftSlotForm, startTime: event.target.value })} /></div>
          <div><Label>{ui('إلى')}</Label><Input type="time" value={draftSlotForm.endTime} onChange={(event) => setDraftSlotForm({ ...draftSlotForm, endTime: event.target.value })} /></div>
          <div><Label>{ui('فتح الحجز')}</Label><Input type="datetime-local" value={draftSlotForm.bookingStartAt} onChange={(event) => setDraftSlotForm({ ...draftSlotForm, bookingStartAt: event.target.value })} /></div>
          <div><Label>{ui('غلق الحجز')}</Label><Input type="datetime-local" value={draftSlotForm.bookingEndAt} onChange={(event) => setDraftSlotForm({ ...draftSlotForm, bookingEndAt: event.target.value })} /></div>
          <div><Label>{ui('السعة')}</Label><Input type="number" min="1" value={draftSlotForm.capacity} onChange={(event) => setDraftSlotForm({ ...draftSlotForm, capacity: event.target.value })} /></div>
        </div>
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border bg-primary/5 p-4"><input type="checkbox" className="mt-1 size-4 accent-primary" checked={repeatDraftSlotWeekly} onChange={(event) => setRepeatDraftSlotWeekly(event.target.checked)} /><span><b>{ui('تطبيق الموعد أسبوعيًا')}</b><small className="mt-1 block text-muted-foreground">{ui('يُضاف الموعد في نفس يوم الأسبوع طوال الشهر بنفس الوقت والسعة وفترة الحجز.')}</small></span></label>
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => { setDraftSlotDate(''); setRepeatDraftSlotWeekly(false); }}>{ui('إلغاء')}</Button><Button disabled={savingDraftSlot} onClick={() => void saveDraftSlot()}>{savingDraftSlot ? ui('جارٍ الحفظ...') : repeatDraftSlotWeekly ? ui('إضافة وتطبيق أسبوعيًا') : ui('إضافة الموعد')}</Button></div>
      </DialogContent>
    </Dialog>
    <Dialog open={detailsSlot != null} onOpenChange={(open) => !open && setDetailsSlot(null)}><DialogContent size="lg" aria-describedby={undefined}><DialogHeader><DialogTitle>{ui('تفاصيل الحجوزات')}</DialogTitle></DialogHeader>{detailsSlot && <div className="rounded-xl border bg-muted/20 p-4"><b>{detailsSlot.serviceName}</b><p>{detailsSlot.employeeName} · {slotDateTime(detailsSlot).toLocaleString(dateLocale())}</p></div>}{detailsLoading ? <Empty text={ui('جارٍ تحميل الحجوزات...')} /> : rows.length === 0 ? <Empty text={ui('لا يوجد أعضاء حجزوا هذا الموعد')} /> : <div className="max-h-[55vh] overflow-y-auto rounded-xl border"><table className="w-full text-sm"><thead className="sticky top-0 bg-muted"><tr>{['العضو', 'الكود', 'الهاتف', 'رقم الحجز', 'تاريخ الحجز', 'الحالة', 'الإجراءات'].map((heading) => <th key={heading} className="p-3 text-start">{ui(heading)}</th>)}</tr></thead><tbody>{rows.map((booking) => <tr key={booking.id} className="border-t"><td className="p-3 font-semibold">{booking.memberName ?? ui('غير محدد')}</td><td className="p-3">{booking.memberCode ?? '—'}</td><td className="p-3" dir="ltr">{booking.memberPhone ?? '—'}</td><td className="p-3">{booking.bookingNumber}</td><td className="p-3">{new Date(booking.createdAt ?? booking.bookingDate).toLocaleString(dateLocale())}</td><td className="p-3"><StatusBadge status={booking.status === 'confirmed' ? 'active' : booking.status === 'cancelled' ? 'expired' : 'pending'} label={statusText(booking.status, ui)} /></td><td className="p-3"><div className="flex flex-wrap gap-2">{booking.status === 'confirmed' && <Button size="sm" onClick={() => void completeBooking(booking)}>{ui('تأكيد الحضور')}</Button>}{['pending', 'confirmed', 'wait'].includes(booking.status) && <Button size="sm" variant="destructive" onClick={() => void cancelBooking(booking)}>{ui('إلغاء الحجز')}</Button>}{!['pending', 'confirmed', 'wait'].includes(booking.status) && '—'}</div></td></tr>)}</tbody></table></div>}</DialogContent></Dialog>
  </div>;
}

export function LegacyDepartmentBookingsAdmin({ category }: { category: Category }) {
  const ui = useUi();
  const now = new Date();
  const initial = { serviceId: '', employeeId: '', month: String(now.getMonth() + 1), year: String(now.getFullYear()) };
  const [filters, setFilters] = useState(initial);
  const [applied, setApplied] = useState<typeof initial | null>(null);
  const { data: response, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['department-bookings', category, applied],
    enabled: applied != null,
    queryFn: async () => {
      const range = monthRange(applied!.month, applied!.year);
      return (await api.get<{ data: BookingDetails[] }>('/scheduling/bookings', { params: { category, ...range, page: 1, pageSize: 200, ...(applied!.serviceId ? { serviceId: applied!.serviceId } : {}), ...(applied!.employeeId ? { employeeId: applied!.employeeId } : {}) } })).data;
    },
  });
  const transition = async (id: number, status: 'completed' | 'cancelled') => {
    try { await api.patch(`/scheduling/bookings/${id}`, { status }); toast.success(ui(status === 'completed' ? 'تم تأكيد الحضور' : 'تم إلغاء الحجز')); await refetch(); } catch (cause) { toast.error(apiError(cause)); }
  };
  const rows = response?.data ?? [];
  return <div className="space-y-5"><Filters category={category} value={filters} onChange={setFilters} onApply={() => setApplied({ ...filters })} />{isFetching ? <Empty text={ui('جارٍ تحميل الحجوزات...')} /> : isError ? <Empty text={apiError(error)} /> : applied == null ? <Empty text={ui('حدد بيانات البحث واضغط بحث')} /> : rows.length === 0 ? <Empty text={ui('لا توجد حجوزات مطابقة')} /> : <div className="overflow-x-auto rounded-xl border"><table className="w-full text-sm"><thead className="bg-muted/60"><tr>{['العضو', 'الخدمة', 'مقدم الخدمة', 'الموعد', 'رقم الحجز', 'الحالة', 'الإجراءات'].map((heading) => <th key={heading} className="p-3 text-start">{ui(heading)}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.id} className="border-t"><td className="p-3"><b>{row.memberName ?? ui('غير محدد')}</b>{row.memberCode && <small className="block text-muted-foreground">{row.memberCode}</small>}</td><td className="p-3">{row.serviceName}</td><td className="p-3">{row.employeeName ?? '—'}</td><td className="p-3">{new Date(`${row.bookingDate}T${row.startTime ?? '00:00'}`).toLocaleString(dateLocale())}</td><td className="p-3">{row.bookingNumber}</td><td className="p-3"><StatusBadge status={row.status === 'confirmed' || row.status === 'completed' ? 'active' : row.status === 'cancelled' ? 'expired' : 'pending'} label={statusText(row.status, ui)} /></td><td className="p-3"><div className="flex flex-wrap gap-2">{['pending', 'confirmed'].includes(row.status) && <Button size="sm" onClick={() => void transition(row.id, 'completed')}>{ui('تأكيد الحضور')}</Button>}{['pending', 'confirmed', 'wait'].includes(row.status) && <Button size="sm" variant="destructive" onClick={() => void transition(row.id, 'cancelled')}>{ui('إلغاء')}</Button>}</div></td></tr>)}</tbody></table></div>}</div>;
}

export function DepartmentBookingsAdmin({ category }: { category: Category }) {
  const ui = useUi();
  const now = new Date();
  const initial = { serviceId: '', employeeId: '', month: String(now.getMonth() + 1), year: String(now.getFullYear()) };
  const [filters, setFilters] = useState(initial);
  const [applied, setApplied] = useState<typeof initial | null>(null);
  const [servicesBooking, setServicesBooking] = useState<BookingDetails | null>(null);
  const [selectedServiceIds, setSelectedServiceIds] = useState<number[]>([]);
  const [restoreBooking, setRestoreBooking] = useState<BookingDetails | null>(null);
  const [restoreReason, setRestoreReason] = useState('');
  const { data: response, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['department-bookings', category, applied],
    enabled: applied != null,
    queryFn: async () => {
      const range = monthRange(applied!.month, applied!.year);
      return (await api.get<{ data: BookingDetails[] }>('/scheduling/bookings', {
        params: {
          category,
          ...range,
          page: 1,
          pageSize: 200,
          ...(applied!.serviceId ? { serviceId: applied!.serviceId } : {}),
          ...(applied!.employeeId ? { employeeId: applied!.employeeId } : {}),
        },
      })).data;
    },
  });
  const { data: bookingOptions = [], isFetching: optionsLoading } = useQuery({
    queryKey: ['spa-booking-additional-options', servicesBooking?.id],
    enabled: category === 'spa' && servicesBooking != null,
    queryFn: async () => (
      await api.get<AppointmentAdditionalOption[]>(`/scheduling/spa-additional-services/bookings/${servicesBooking!.id}`)
    ).data,
  });
  useEffect(() => {
    setSelectedServiceIds(bookingOptions.filter((option) => option.selected || option.isRequired).map((option) => option.serviceId));
  }, [bookingOptions, servicesBooking?.id]);

  const transition = async (id: number, status: 'completed' | 'cancelled' | 'no_show') => {
    try {
      const endpoint = category === 'nutrition'
        ? '/scheduling/bookings/nutrition/' + id + '/status'
        : '/scheduling/bookings/' + id;
      await api.patch(endpoint, { status });
      toast.success(ui(status === 'completed' ? 'تم تأكيد الحضور' : status === 'no_show' ? 'تم تسجيل عدم الحضور وخصم الحصة' : 'تم إلغاء الحجز'));
      await refetch();
    } catch (cause) { toast.error(apiError(cause)); }
  };
  const restoreEntitlement = async () => {
    if (!restoreBooking || !restoreReason.trim()) return;
    try {
      await api.post(`/scheduling/bookings/nutrition/${restoreBooking.id}/restore-no-show`, { reason: restoreReason.trim() });
      toast.success(ui('تم استرجاع الحصة للعميل'));
      setRestoreBooking(null);
      setRestoreReason('');
      await refetch();
    } catch (cause) { toast.error(apiError(cause)); }
  };
  const saveAdditionalServices = async () => {
    if (!servicesBooking) return;
    try {
      await api.put(`/scheduling/spa-additional-services/bookings/${servicesBooking.id}`, {
        additionalServiceIds: selectedServiceIds,
      });
      toast.success(ui('تم حفظ الخدمات الإضافية للحجز'));
      setServicesBooking(null);
      await refetch();
    } catch (cause) { toast.error(apiError(cause)); }
  };

  const rows = response?.data ?? [];
  const headings = [
    'العضو',
    'الخدمة',
    'مقدم الخدمة',
    'الموعد',
    ...(category === 'spa' ? ['الخدمات الإضافية'] : []),
    ...(category === 'nutrition' ? ['المدة', 'التغطية والدفع'] : []),
    'رقم الحجز',
    'الحالة',
    'الإجراءات',
  ];
  return <div className="space-y-5">
    <Filters category={category} value={filters} onChange={setFilters} onApply={() => setApplied({ ...filters })} />
    {isFetching ? <Empty text={ui('جارٍ تحميل الحجوزات...')} />
      : isError ? <Empty text={apiError(error)} />
        : applied == null ? <Empty text={ui('حدد بيانات البحث واضغط بحث')} />
          : rows.length === 0 ? <Empty text={ui('لا توجد حجوزات مطابقة')} />
            : <div className="overflow-x-auto rounded-xl border"><table className="w-full text-sm">
              <thead className="bg-muted/60"><tr>{headings.map((heading) => <th key={heading} className="p-3 text-start">{ui(heading)}</th>)}</tr></thead>
              <tbody>{rows.map((row) => <tr key={row.id} className="border-t">
                <td className="p-3"><b>{row.memberName ?? ui('غير محدد')}</b>{row.memberCode && <small className="block text-muted-foreground">{row.memberCode}</small>}</td>
                <td className="p-3">{row.serviceName}</td>
                <td className="p-3">{row.employeeName ?? '—'}</td>
                <td className="p-3">{new Date(`${row.bookingDate}T${row.startTime ?? '00:00'}`).toLocaleString(dateLocale())}</td>
                {category === 'spa' && <td className="p-3">{(row.additionalServices ?? []).filter((item) => item.status !== 'cancelled').map((item) => item.name).join('، ') || '—'}</td>}
                {category === 'nutrition' && <><td className="p-3">{row.durationMin ?? '—'} {row.durationMin ? ui('دقيقة') : ''}</td><td className="p-3">{row.coverageType === 'subscription' ? <span className="font-semibold text-emerald-600">{ui('من الاشتراك')}</span> : <span className="font-semibold text-amber-600">{ui('مدفوع عند الحضور')} · {row.priceSnapshot?.toFixed(2) ?? '—'}</span>}{row.entitlementRestoredAt && <small className="block text-muted-foreground">{ui('تم استرجاع الحصة')}</small>}</td></>}
                <td className="p-3">{row.bookingNumber}</td>
                <td className="p-3"><StatusBadge status={row.status === 'confirmed' || row.status === 'completed' ? 'active' : row.status === 'cancelled' ? 'expired' : 'pending'} label={statusText(row.status, ui)} /></td>
                <td className="p-3"><div className="flex flex-wrap gap-2">
                  {category === 'spa' && ['pending', 'confirmed', 'wait'].includes(row.status) && <Button size="sm" variant="outline" onClick={() => setServicesBooking(row)}>{ui('خدمة إضافية')}</Button>}
                  {['pending', 'confirmed'].includes(row.status) && <Button size="sm" onClick={() => void transition(row.id, 'completed')}>{ui('تأكيد الحضور')}</Button>}
                  {category === 'nutrition' && ['pending', 'confirmed'].includes(row.status) && <Button size="sm" variant="outline" onClick={() => void transition(row.id, 'no_show')}>{ui('لم يحضر')}</Button>}
                  {category === 'nutrition' && row.status === 'no_show' && row.coverageType === 'subscription' && !row.entitlementRestoredAt && <Button size="sm" variant="outline" onClick={() => { setRestoreBooking(row); setRestoreReason(''); }}>{ui('استرجاع الحصة')}</Button>}
                  {['pending', 'confirmed', 'wait'].includes(row.status) && <Button size="sm" variant="destructive" onClick={() => void transition(row.id, 'cancelled')}>{ui('إلغاء')}</Button>}
                </div></td>
              </tr>)}</tbody>
            </table></div>}
    <Dialog open={servicesBooking != null} onOpenChange={(open) => !open && setServicesBooking(null)}>
      <DialogContent size="md" aria-describedby={undefined}>
        <DialogHeader><DialogTitle>{ui('الخدمات الإضافية للحجز')}</DialogTitle></DialogHeader>
        {optionsLoading ? <Empty text={ui('جارٍ التحميل...')} />
          : bookingOptions.length === 0 ? <Empty text={ui('لا توجد خدمات إضافية مفعلة')} />
            : <div className="space-y-1"><Label>{ui('الخدمة الإضافية')}</Label><select className={SELECT_CLS} value={selectedServiceIds[0] ?? ''} onChange={(event) => setSelectedServiceIds(event.target.value ? [Number(event.target.value)] : [])}><option value="">{ui('اختر الخدمة الإضافية')}</option>{bookingOptions.map((option) => <option key={option.serviceId} value={option.serviceId}>{option.name}{option.price != null ? ` - ${Number(option.price).toFixed(2)}` : ''}</option>)}</select></div>}
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setServicesBooking(null)}>{ui('إلغاء')}</Button><Button disabled={bookingOptions.length === 0} onClick={() => void saveAdditionalServices()}>{ui('حفظ')}</Button></div>
      </DialogContent>
    </Dialog>
    <Dialog open={restoreBooking != null} onOpenChange={(open) => !open && setRestoreBooking(null)}>
      <DialogContent size="md" aria-describedby={undefined}>
        <DialogHeader><DialogTitle>{ui('استرجاع حصة عدم الحضور')}</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">{ui('اكتب سبب الاسترجاع. سيظل الحجز مسجلًا كعدم حضور، لكن الحصة ستعود إلى رصيد العميل.')}</p>
        <div><Label>{ui('سبب الاسترجاع')}</Label><Input value={restoreReason} onChange={(event) => setRestoreReason(event.target.value)} /></div>
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setRestoreBooking(null)}>{ui('إلغاء')}</Button><Button disabled={!restoreReason.trim()} onClick={() => void restoreEntitlement()}>{ui('تأكيد الاسترجاع')}</Button></div>
      </DialogContent>
    </Dialog>
  </div>;
}

export function DepartmentAvailableAppointmentsAdmin({ category }: { category: Category }) {
  const ui = useUi();
  const initial = { serviceId: '', employeeId: '', month: '', year: '' };
  const [filters, setFilters] = useState(initial);
  const [applied, setApplied] = useState(initial);
  const queryParams = useMemo(() => {
    const range = applied.month && applied.year ? monthRange(applied.month, applied.year) : {};
    return { category, status: 'available', ...range, ...(applied.serviceId ? { serviceId: applied.serviceId } : {}), ...(applied.employeeId ? { employeeId: applied.employeeId } : {}) };
  }, [applied, category]);
  const { data: slots = [], isFetching } = useQuery({ queryKey: ['department-available-appointments', queryParams], queryFn: async () => (await api.get<ScheduleRow[]>('/scheduling/schedules/calendar', { params: queryParams })).data });
  return <div className="space-y-5"><Filters category={category} value={filters} onChange={setFilters} onApply={() => setApplied({ ...filters })} />{isFetching ? <Empty text={ui('جارٍ التحميل...')} /> : slots.length === 0 ? <Empty text={ui('لا توجد بيانات')} /> : <div className="grid gap-3 lg:grid-cols-2">{slots.map((slot) => { const state = bookingStatus(slot); return <Card key={slot.id}><CardContent className="space-y-2 pt-6"><div className="flex justify-between gap-3"><b>{slot.serviceName}</b><StatusBadge status={state === 'booking_available' ? 'active' : 'pending'} label={statusText(state, ui)} /></div><p>{slot.employeeName ?? '—'} · {slotDateTime(slot).toLocaleString(dateLocale())}</p><p className="text-sm text-muted-foreground">{ui('المؤكد')}: {slot.bookedCount} · {ui('المتبقي')}: {slot.remaining} · {ui('السعة')}: {slot.capacity}</p></CardContent></Card>; })}</div>}</div>;
}
