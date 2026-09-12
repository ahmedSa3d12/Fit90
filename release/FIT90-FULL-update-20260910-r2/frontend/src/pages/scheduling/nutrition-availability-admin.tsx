import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarPlus, Clock3, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { MemberSearchCombobox } from '@/components/club/member-search-combobox';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, apiError } from '@/lib/api';
import { confirm } from '@/lib/confirm';
import { useUi } from '@/store/locale';
import type { ClubMemberListItem } from '@/types/club';
import { SELECT_CLS, useFitnessResourceList } from '../club/fitness/shared';
import { useSchedulingProviders } from './providers';
import type { ServiceRow } from './shared';

type AttendanceWindow = {
  id: number;
  trainerId: number | null;
  slotDate: string;
  startTime: string;
  endTime: string;
};

type AvailableTime = { windowId: number; startTime: string; endTime: string };
type TimesResponse = {
  service: { id: number; name: string; durationMin: number; price: string; entitlementKey: string | null };
  trainerId: number;
  date: string;
  times: AvailableTime[];
};
type Eligibility = {
  total: number;
  used: number;
  reserved: number;
  remaining: number;
  coverageType: 'subscription' | 'pay_at_branch';
  paymentStatus: 'not_required' | 'due_at_branch';
  amountDue: string;
  sources: Array<{ subscriptionId: number; subscriptionNumber: string; subscriptionName: string }>;
};
type WeeklyTemplate = { id: number; weekday: number; startTime: string; endTime: string };

const WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const today = () => new Date().toISOString().slice(0, 10);
const currentMonth = () => today().slice(0, 7);
const monthRange = (month: string) => {
  const [year, numericMonth] = month.split('-').map(Number);
  const lastDay = new Date(year, numericMonth, 0).getDate();
  return { dateFrom: `${month}-01`, dateTo: `${month}-${String(lastDay).padStart(2, '0')}` };
};
const displayTime = (value: string) => value.slice(0, 5);

export function NutritionBookingDialog({
  open,
  onClose,
  onDone,
  initialTrainerId,
  initialDate,
  initialWindowId,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
  initialTrainerId?: number;
  initialDate?: string;
  initialWindowId?: number;
}) {
  const ui = useUi();
  const { items: allServices } = useFitnessResourceList<ServiceRow>('scheduling/services');
  const services = allServices.filter((service) => service.category === 'nutrition' && service.isActive);
  const { providers } = useSchedulingProviders('nutrition');
  const [member, setMember] = useState<ClubMemberListItem | null>(null);
  const [serviceId, setServiceId] = useState('');
  const [trainerId, setTrainerId] = useState('');
  const [date, setDate] = useState(today());
  const [selectedTime, setSelectedTime] = useState<AvailableTime | null>(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (initialTrainerId != null) setTrainerId(String(initialTrainerId));
    if (initialDate) setDate(initialDate);
    setSelectedTime(null);
  }, [open, initialTrainerId, initialDate, initialWindowId]);

  const timesQuery = useQuery({
    queryKey: ['nutrition-available-times', serviceId, trainerId, date],
    enabled: open && Boolean(serviceId && trainerId && date),
    queryFn: async () => (await api.get<TimesResponse>('/availability/nutrition-times', {
      params: { serviceId, trainerId, date },
    })).data,
  });
  const eligibilityQuery = useQuery({
    queryKey: ['nutrition-eligibility', member?.id, serviceId, date],
    enabled: open && member != null && Boolean(serviceId && date),
    queryFn: async () => (await api.get<Eligibility>('/scheduling/bookings/nutrition/eligibility', {
      params: { memberId: member!.id, serviceId, date },
    })).data,
  });
  const eligibility = eligibilityQuery.data;
  const availableTimes = (timesQuery.data?.times ?? []).filter((candidate) => (
    initialWindowId == null || candidate.windowId === initialWindowId
  ));

  const save = async () => {
    if (!member || !serviceId || !selectedTime) return;
    setSaving(true);
    try {
      const { data } = await api.post<{ coverageType: string; remaining: number }>('/scheduling/bookings/nutrition', {
        availabilitySlotId: selectedTime.windowId,
        serviceId: Number(serviceId),
        memberId: member.id,
        startTime: selectedTime.startTime,
        status: 'confirmed',
        notes: notes.trim() || undefined,
      });
      toast.success(ui(data.coverageType === 'subscription'
        ? `تم تأكيد الحجز من الاشتراك، والمتبقي ${data.remaining}`
        : 'تم تأكيد الحجز — الدفع عند الحضور'));
      onDone();
      onClose();
    } catch (cause) {
      const status = (cause as { response?: { status?: number } })?.response?.status;
      if (status === 409) {
        setSelectedTime(null);
        await timesQuery.refetch();
        toast.error(ui('هذا الموعد حُجز للتو. اختر موعدًا آخر من القائمة المحدثة.'));
      } else {
        toast.error(ui(apiError(cause)));
      }
    } finally {
      setSaving(false);
    }
  };

  return <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
    <DialogContent size="lg" aria-describedby={undefined}>
      <DialogHeader><DialogTitle>{ui('حجز موعد تغذية')}</DialogTitle></DialogHeader>
      <div className="space-y-5">
        <div><Label>{ui('العضو')}</Label><MemberSearchCombobox selectedMember={member} onSelect={setMember} onClear={() => setMember(null)} disabled={saving} /></div>
        <div className="grid gap-4 md:grid-cols-3">
          <div><Label>{ui('الخدمة')}</Label><select className={SELECT_CLS} value={serviceId} onChange={(event) => { setServiceId(event.target.value); setSelectedTime(null); }}><option value="">{ui('اختر الخدمة')}</option>{services.map((service) => <option key={service.id} value={service.id}>{service.name} — {service.durationMin} {ui('دقيقة')}</option>)}</select></div>
          <div><Label>{ui('أخصائي التغذية')}</Label><select className={SELECT_CLS} value={trainerId} disabled={initialTrainerId != null} onChange={(event) => { setTrainerId(event.target.value); setSelectedTime(null); }}><option value="">{ui('اختر أخصائي التغذية')}</option>{providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}</select></div>
          <div><Label>{ui('التاريخ')}</Label><Input type="date" value={date} disabled={Boolean(initialDate)} onChange={(event) => { setDate(event.target.value); setSelectedTime(null); }} /></div>
        </div>

        {member && serviceId && eligibilityQuery.isFetching && <p className="text-sm text-muted-foreground">{ui('جارٍ فحص رصيد الاشتراك...')}</p>}
        {eligibility && <div className={`rounded-xl border p-4 ${eligibility.coverageType === 'subscription' ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-amber-500/50 bg-amber-500/10'}`}>
          {eligibility.coverageType === 'subscription'
            ? <><p className="font-semibold text-emerald-700 dark:text-emerald-300">{ui('الخدمة متاحة ضمن الاشتراك')}</p><div className="mt-3 grid grid-cols-3 gap-2 text-center"><div className="rounded-lg bg-background p-2"><small>{ui('الإجمالي')}</small><b className="block text-lg">{eligibility.total}</b></div><div className="rounded-lg bg-background p-2"><small>{ui('المستخدم والمحجوز')}</small><b className="block text-lg">{eligibility.used + eligibility.reserved}</b></div><div className="rounded-lg bg-background p-2"><small>{ui('المتبقي')}</small><b className="block text-lg text-emerald-600">{eligibility.remaining}</b></div></div></>
            : <><p className="font-semibold text-amber-800 dark:text-amber-200">{ui('لا يوجد رصيد متاح لهذه الخدمة')}</p><p className="mt-1 text-sm">{ui('يمكن إكمال الحجز والدفع عند الحضور')}. {ui('القيمة المستحقة')}: <b>{Number(eligibility.amountDue).toFixed(2)}</b></p></>}
        </div>}

        <div>
          <Label>{ui('المواعيد المتاحة')}</Label>
          {!serviceId || !trainerId || !date
            ? <p className="mt-2 text-sm text-muted-foreground">{ui('اختر الخدمة والأخصائي والتاريخ لعرض المواعيد')}</p>
            : timesQuery.isFetching
              ? <p className="mt-2 text-sm text-muted-foreground">{ui('جارٍ تحميل المواعيد المتاحة...')}</p>
              : availableTimes.length === 0
                ? <p className="mt-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">{ui('لا توجد مواعيد متاحة في هذا اليوم')}</p>
                : <div className="mt-2 flex flex-wrap gap-2">{availableTimes.map((time) => <Button key={`${time.windowId}-${time.startTime}`} type="button" variant={selectedTime?.windowId === time.windowId && selectedTime.startTime === time.startTime ? 'default' : 'outline'} onClick={() => setSelectedTime(time)}><Clock3 className="me-1.5 size-4" />{displayTime(time.startTime)} – {displayTime(time.endTime)}</Button>)}</div>}
        </div>
        <div><Label>{ui('ملاحظات')}</Label><Input value={notes} onChange={(event) => setNotes(event.target.value)} /></div>
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>{ui('إلغاء')}</Button><Button disabled={saving || !member || !selectedTime || eligibilityQuery.isFetching} onClick={() => void save()}>{saving ? ui('جارٍ الحفظ...') : ui('تأكيد الحجز')}</Button></div>
      </div>
    </DialogContent>
  </Dialog>;
}

export function NutritionAvailabilityAdmin() {
  const ui = useUi();
  const qc = useQueryClient();
  const { providers } = useSchedulingProviders('nutrition');
  const [month, setMonth] = useState(currentMonth());
  const [trainerId, setTrainerId] = useState('');
  const [templates, setTemplates] = useState<WeeklyTemplate[]>([{ id: 1, weekday: 0, startTime: '15:00', endTime: '20:00' }]);
  const [saving, setSaving] = useState(false);
  const [bookingOpen, setBookingOpen] = useState(false);
  const range = useMemo(() => monthRange(month), [month]);
  const attendanceQuery = useQuery({
    queryKey: ['nutrition-attendance', month, trainerId],
    enabled: Boolean(month),
    queryFn: async () => (await api.get<AttendanceWindow[]>('/availability', {
      params: { moduleType: 'nutrition', ...range, ...(trainerId ? { trainerId } : {}) },
    })).data,
  });
  const providerNames = useMemo(() => new Map(providers.map((provider) => [provider.id, provider.name])), [providers]);

  const updateTemplate = (id: number, patch: Partial<WeeklyTemplate>) => setTemplates((rows) => rows.map((row) => row.id === id ? { ...row, ...patch } : row));
  const addTemplate = () => setTemplates((rows) => [...rows, { id: Date.now(), weekday: 0, startTime: '15:00', endTime: '20:00' }]);
  const removeTemplate = (id: number) => setTemplates((rows) => rows.filter((row) => row.id !== id));

  const generate = async () => {
    if (!trainerId) { toast.error(ui('اختر أخصائي التغذية')); return; }
    if (templates.some((row) => !row.startTime || !row.endTime || row.endTime <= row.startTime)) { toast.error(ui('تأكد أن نهاية كل فترة بعد بدايتها')); return; }
    setSaving(true);
    try {
      const { data } = await api.post<{ created: number }>('/availability/generate-month', {
        moduleType: 'nutrition', month, trainerId: Number(trainerId), capacity: 1,
        templates: templates.map(({ weekday, startTime, endTime }) => ({ weekday, startTime, endTime })),
      });
      toast.success(ui(`تم إنشاء ${data.created} فترة حضور للأخصائي خلال الشهر`));
      await attendanceQuery.refetch();
    } catch (cause) { toast.error(ui(apiError(cause))); } finally { setSaving(false); }
  };
  const removeWindow = async (row: AttendanceWindow) => {
    if (!(await confirm({ title: ui('حذف فترة الحضور'), description: `${row.slotDate} · ${displayTime(row.startTime)}–${displayTime(row.endTime)}`, variant: 'destructive' }))) return;
    try { await api.delete(`/availability/${row.id}`); toast.success(ui('تم حذف فترة الحضور')); await attendanceQuery.refetch(); } catch (cause) { toast.error(ui(apiError(cause))); }
  };

  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-2xl font-bold">{ui('حضور أخصائي التغذية')}</h2><p className="text-sm text-muted-foreground">{ui('حدد ساعات حضور الأخصائي فقط. الخدمة ومدتها يختارهما العميل عند الحجز.')}</p></div><Button onClick={() => setBookingOpen(true)}><CalendarPlus className="me-2 size-4" />{ui('حجز موعد تغذية')}</Button></div>
    <Card><CardHeader><CardTitle>{ui('إنشاء جدول حضور الشهر')}</CardTitle></CardHeader><CardContent className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2"><div><Label>{ui('الشهر')}</Label><Input type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></div><div><Label>{ui('أخصائي التغذية')}</Label><select className={SELECT_CLS} value={trainerId} onChange={(event) => setTrainerId(event.target.value)}><option value="">{ui('اختر أخصائي التغذية')}</option>{providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}</select></div></div>
      <div className="space-y-3">{templates.map((row) => <div key={row.id} className="grid items-end gap-3 rounded-xl border p-3 md:grid-cols-[1fr_1fr_1fr_auto]"><div><Label>{ui('اليوم')}</Label><select className={SELECT_CLS} value={row.weekday} onChange={(event) => updateTemplate(row.id, { weekday: Number(event.target.value) })}>{WEEKDAYS.map((day, index) => <option key={day} value={index}>{ui(day)}</option>)}</select></div><div><Label>{ui('من الساعة')}</Label><Input type="time" value={row.startTime} onChange={(event) => updateTemplate(row.id, { startTime: event.target.value })} /></div><div><Label>{ui('إلى الساعة')}</Label><Input type="time" value={row.endTime} onChange={(event) => updateTemplate(row.id, { endTime: event.target.value })} /></div><Button variant="ghost" size="icon" disabled={templates.length === 1} onClick={() => removeTemplate(row.id)}><Trash2 className="size-4" /></Button></div>)}</div>
      <div className="flex flex-wrap justify-between gap-2"><Button variant="outline" onClick={addTemplate}><Plus className="me-2 size-4" />{ui('إضافة يوم آخر')}</Button><Button disabled={saving || !month || !trainerId} onClick={() => void generate()}>{saving ? ui('جارٍ الإنشاء...') : ui('إنشاء جدول الشهر')}</Button></div>
    </CardContent></Card>
    <Card><CardHeader><CardTitle>{ui('فترات الحضور في الشهر')}</CardTitle></CardHeader><CardContent>{attendanceQuery.isFetching ? <p className="text-muted-foreground">{ui('جارٍ التحميل...')}</p> : (attendanceQuery.data?.length ?? 0) === 0 ? <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">{ui('لم يتم إنشاء فترات حضور لهذا الشهر')}</div> : <div className="overflow-x-auto rounded-xl border"><table className="w-full text-sm"><thead className="bg-muted"><tr><th className="p-3 text-start">{ui('التاريخ')}</th><th className="p-3 text-start">{ui('اليوم')}</th><th className="p-3 text-start">{ui('الأخصائي')}</th><th className="p-3 text-start">{ui('فترة الحضور')}</th><th className="p-3 text-start">{ui('الإجراءات')}</th></tr></thead><tbody>{attendanceQuery.data!.map((row) => { const day = new Date(`${row.slotDate}T12:00:00`).getDay(); return <tr key={row.id} className="border-t"><td className="p-3 font-medium">{row.slotDate}</td><td className="p-3">{ui(WEEKDAYS[day])}</td><td className="p-3">{row.trainerId ? providerNames.get(row.trainerId) ?? row.trainerId : '—'}</td><td className="p-3">{displayTime(row.startTime)} – {displayTime(row.endTime)}</td><td className="p-3"><Button variant="ghost" size="icon" className="text-destructive" onClick={() => void removeWindow(row)}><Trash2 className="size-4" /></Button></td></tr>; })}</tbody></table></div>}</CardContent></Card>
    <NutritionBookingDialog open={bookingOpen} onClose={() => setBookingOpen(false)} onDone={() => { void qc.invalidateQueries({ queryKey: ['nutrition-attendance'] }); }} />
  </div>;
}
