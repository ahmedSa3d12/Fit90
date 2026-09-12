import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarPlus, Clock3, Plus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { StatusBadge } from '@/components/common/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useFitnessT } from '@/hooks/use-fitness-t';
import { api, apiError } from '@/lib/api';
import { useUi } from '@/store/locale';
import { SELECT_CLS, useFitnessResourceList } from '../club/fitness/shared';
import type { Category, ServiceRow } from './shared';
import { useSchedulingProviders } from './providers';

type MonthlyPlan = {
  id: number;
  service_id: number;
  employee_id: number;
  month: number;
  year: number;
  status: 'draft' | 'published' | 'archived';
  service: { id: number; name: string; category: Category };
  trainer: { id: number; name: string };
  _count?: { slots: number };
  slots?: RawSlot[];
};

type RawSlot = {
  id: number;
  slot_date: string;
  start_time: string;
  end_time: string;
  booking_start_at?: string | null;
  booking_end_at?: string | null;
  capacity: number;
  status: string;
};

const emptySlot = () => ({ startTime: '18:00', endTime: '19:00', bookingStartAt: '', bookingEndAt: '', capacity: '20' });

export function MonthlyPlanCalendar({ plan, onChanged }: { plan: MonthlyPlan; onChanged: () => void }) {
  const ui = useUi();
  const [selectedDate, setSelectedDate] = useState('');
  const [slotRows, setSlotRows] = useState([emptySlot()]);
  const [repeatWeekly, setRepeatWeekly] = useState(true);
  const [saving, setSaving] = useState(false);
  const { data, refetch, isLoading } = useQuery({
    queryKey: ['service-monthly-schedule', plan.id],
    queryFn: async () => (await api.get<MonthlyPlan>(`/scheduling/monthly-schedules/${plan.id}`)).data,
  });
  const current = data ?? plan;
  const slots = current.slots ?? [];
  const daysCount = new Date(current.year, current.month, 0).getDate();
  const firstDay = new Date(current.year, current.month - 1, 1).getDay();
  const dateKey = (day: number) => `${current.year}-${String(current.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const slotsForDate = (date: string) => slots.filter((slot) => slot.slot_date === date);
  const updateRow = (index: number, key: keyof ReturnType<typeof emptySlot>, value: string) => {
    setSlotRows((rows) => rows.map((row, rowIndex) => (rowIndex === index ? { ...row, [key]: value } : row)));
  };

  const saveSlots = async () => {
    if (!selectedDate || current.status === 'archived') return;
    setSaving(true);
    try {
      for (const row of slotRows) {
        const templateStart = new Date(`${selectedDate}T${row.startTime}:00`);
        const templateEnd = new Date(`${selectedDate}T${row.endTime}:00`);
        const bookingStart = row.bookingStartAt ? new Date(row.bookingStartAt) : null;
        const bookingEnd = row.bookingEndAt ? new Date(row.bookingEndAt) : null;
        if (templateEnd <= templateStart) throw new Error(ui('يجب أن تكون نهاية الموعد بعد بدايته.'));
        if ((bookingStart == null) !== (bookingEnd == null)) throw new Error(ui('حدد تاريخ ووقت فتح وغلق الحجز معًا.'));
        if (bookingStart && bookingEnd && bookingEnd <= bookingStart) throw new Error(ui('يجب أن يكون تاريخ غلق الحجز بعد تاريخ فتح الحجز.'));
        if (bookingEnd && bookingEnd > templateStart) throw new Error(ui('يجب أن يكون غلق الحجز قبل بداية الموعد.'));
        if (repeatWeekly && (!bookingStart || !bookingEnd)) throw new Error(ui('حدد تاريخ ووقت فتح وغلق الحجز للمواعيد الأسبوعية.'));

        if (repeatWeekly) {
          await api.post('/scheduling/schedules/generate/recurring', {
            monthlyScheduleId: current.id,
            serviceId: current.service_id,
            employeeId: current.employee_id,
            weekdays: [new Date(`${selectedDate}T12:00:00`).getDay()],
            dateFrom: dateKey(1),
            dateTo: dateKey(daysCount),
            templateDate: selectedDate,
            startTime: row.startTime,
            endTime: row.endTime,
            bookingStartAt: bookingStart?.toISOString(),
            bookingEndAt: bookingEnd?.toISOString(),
            capacity: Number(row.capacity),
          });
        } else {
          await api.post('/scheduling/schedules', {
            monthlyScheduleId: current.id,
            serviceId: current.service_id,
            employeeId: current.employee_id,
            slotDate: selectedDate,
            startTime: row.startTime,
            endTime: row.endTime,
            bookingStartAt: bookingStart?.toISOString(),
            bookingEndAt: bookingEnd?.toISOString(),
            capacity: Number(row.capacity),
          });
        }
      }
      toast.success(ui(repeatWeekly ? 'تم تطبيق مواعيد اليوم على كل الأيام المماثلة في الشهر' : `تمت إضافة ${slotRows.length} موعد`));
      setSelectedDate('');
      setSlotRows([emptySlot()]);
      await refetch();
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error && !('response' in error) ? error.message : apiError(error));
    } finally {
      setSaving(false);
    }
  };

  if (isLoading && !data) return <Empty text={ui('جارٍ تحميل التقويم...')} />;
  return (
    <Card className="border-primary/30">
      <CardHeader><CardTitle>{ui('تقويم')} {current.service.name} — {current.month}/{current.year}</CardTitle></CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-7 gap-2 text-center text-sm">
          {['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'].map((day) => <div key={day} className="py-2 font-semibold text-muted-foreground">{ui(day)}</div>)}
          {Array.from({ length: firstDay }).map((_, index) => <div key={`empty-${index}`} />)}
          {Array.from({ length: daysCount }, (_, index) => index + 1).map((day) => {
            const date = dateKey(day);
            const count = slotsForDate(date).length;
            return <button key={day} type="button" disabled={current.status === 'archived'} onClick={() => { setSelectedDate(date); setSlotRows([emptySlot()]); }} className={`min-h-24 rounded-xl border p-2 text-start transition hover:border-primary disabled:cursor-not-allowed disabled:opacity-60 ${selectedDate === date ? 'border-primary bg-primary/10' : 'bg-card'}`}><span className="font-bold">{day}</span>{count > 0 && <div className="mt-3 rounded-md bg-primary/15 px-2 py-1 text-xs text-primary">{count} {ui('موعد')}</div>}</button>;
          })}
        </div>
        <Dialog open={Boolean(selectedDate)} onOpenChange={(open) => !open && setSelectedDate('')}>
          <DialogContent size="form" aria-describedby={undefined}>
            <DialogHeader><DialogTitle>{ui('إضافة مواعيد يوم')} {selectedDate}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              {slotRows.map((slot, index) => <div key={index} className="space-y-3 rounded-xl border bg-muted/20 p-4">
                <div className="flex items-center justify-between"><b>{ui('الموعد')} {index + 1}</b>{slotRows.length > 1 && <Button size="sm" variant="destructive" onClick={() => setSlotRows((rows) => rows.filter((_, rowIndex) => rowIndex !== index))}>{ui('حذف')}</Button>}</div>
                <div className="grid gap-3 md:grid-cols-5">
                  <div><Label>{ui('من')}</Label><Input type="time" value={slot.startTime} onChange={(event) => updateRow(index, 'startTime', event.target.value)} /></div>
                  <div><Label>{ui('إلى')}</Label><Input type="time" value={slot.endTime} onChange={(event) => updateRow(index, 'endTime', event.target.value)} /></div>
                  <div><Label>{ui('تاريخ ووقت فتح الحجز')}</Label><Input type="datetime-local" max={`${selectedDate}T${slot.startTime}`} value={slot.bookingStartAt} onChange={(event) => updateRow(index, 'bookingStartAt', event.target.value)} /></div>
                  <div><Label>{ui('تاريخ ووقت غلق الحجز')}</Label><Input type="datetime-local" min={slot.bookingStartAt || undefined} max={`${selectedDate}T${slot.startTime}`} value={slot.bookingEndAt} onChange={(event) => updateRow(index, 'bookingEndAt', event.target.value)} /></div>
                  <div><Label>{ui('السعة')}</Label><Input type="number" min="1" value={slot.capacity} onChange={(event) => updateRow(index, 'capacity', event.target.value)} /></div>
                </div>
              </div>)}
              <Button variant="outline" onClick={() => setSlotRows((rows) => [...rows, emptySlot()])}><Plus className="me-1 size-4" />{ui('إضافة موعد آخر')}</Button>
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border bg-primary/5 p-4"><input type="checkbox" className="mt-1 size-4 accent-primary" checked={repeatWeekly} onChange={(event) => setRepeatWeekly(event.target.checked)} /><span><b>{ui('تكرار أسبوعي تلقائي')}</b><small className="mt-1 block text-muted-foreground">{ui('يُطبّق كل موعد على نفس يوم الأسبوع طوال الشهر، مع الحفاظ على نفس فرق فتح وغلق الحجز من موعد الخدمة.')}</small></span></label>
              {slotsForDate(selectedDate).length > 0 && <div className="space-y-2"><b>{ui('المواعيد المسجلة بالفعل')}</b>{slotsForDate(selectedDate).map((slot) => <div key={slot.id} className="rounded-lg border p-3">{slot.start_time.slice(0, 5)} — {slot.end_time.slice(0, 5)} · {ui('السعة')} {slot.capacity}</div>)}</div>}
              <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setSelectedDate('')}>{ui('إلغاء')}</Button><Button disabled={saving} onClick={() => void saveSlots()}>{repeatWeekly ? ui('حفظ وتطبيق أسبوعيًا') : ui('حفظ كل مواعيد اليوم')}</Button></div>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">{text}</div>;
}

function MonthlyPlanViewDialog({ planId, onClose }: { planId: number | null; onClose: () => void }) {
  const ui = useUi();
  const ft = useFitnessT();
  const { data, isLoading } = useQuery({
    queryKey: ['service-monthly-schedule-view', planId],
    enabled: planId != null,
    queryFn: async () => (await api.get<MonthlyPlan>(`/scheduling/monthly-schedules/${planId}`)).data,
  });
  const daysCount = data ? new Date(data.year, data.month, 0).getDate() : 0;
  const firstDay = data ? new Date(data.year, data.month - 1, 1).getDay() : 0;
  const dateKey = (day: number) => data ? `${data.year}-${String(data.month).padStart(2, '0')}-${String(day).padStart(2, '0')}` : '';
  const slotsByDate = new Map<string, RawSlot[]>();
  (data?.slots ?? []).forEach((slot) => slotsByDate.set(slot.slot_date, [...(slotsByDate.get(slot.slot_date) ?? []), slot]));
  return <Dialog open={planId != null} onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent size="xl" aria-describedby={undefined}>
      <DialogHeader><DialogTitle>{ui('عرض الجدول الشهري')}</DialogTitle></DialogHeader>
      {isLoading || !data ? <Empty text={ui('جارٍ تحميل الجدول...')} /> : <div className="space-y-4">
        <div className="grid gap-3 rounded-xl border bg-muted/20 p-4 sm:grid-cols-4">
          <div><span className="text-sm text-muted-foreground">{ui('الخدمة')}</span><p className="font-bold">{data.service.name}</p></div>
          <div><span className="text-sm text-muted-foreground">{ui('مقدم الخدمة')}</span><p className="font-bold">{data.trainer.name}</p></div>
          <div><span className="text-sm text-muted-foreground">{ui('الشهر')}</span><p className="font-bold">{data.month}/{data.year}</p></div>
          <div><span className="text-sm text-muted-foreground">{ui('الحالة')}</span><p className="font-bold">{ft(`sched.${data.status}`)}</p></div>
        </div>
        <div className="max-h-[60vh] overflow-auto rounded-xl border">
          <div className="grid min-w-[1050px] grid-cols-7 text-sm">
            {['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'].map((day) => <div key={day} className="sticky top-0 z-10 border-b border-e bg-muted p-3 text-center font-bold">{ui(day)}</div>)}
            {Array.from({ length: firstDay }).map((_, index) => <div key={`empty-${index}`} className="min-h-36 border-b border-e bg-muted/10" />)}
            {Array.from({ length: daysCount }, (_, index) => index + 1).map((day) => {
              const daySlots = slotsByDate.get(dateKey(day)) ?? [];
              return <div key={day} className="min-h-36 border-b border-e bg-card p-2">
                <div className="mb-2 flex items-center justify-between"><span className="flex size-7 items-center justify-center rounded-full bg-muted font-bold">{day}</span>{daySlots.length > 0 && <span className="text-xs text-muted-foreground">{daySlots.length} {ui('موعد')}</span>}</div>
                <div className="space-y-2">{daySlots.map((slot) => <div key={slot.id} className={`rounded-lg border p-2 ${slot.status === 'available' ? 'border-emerald-500/35 bg-emerald-500/10' : 'border-red-500/35 bg-red-500/10'}`}>
                  <p className="font-bold"><Clock3 className="me-1 inline size-3.5" />{slot.start_time.slice(0, 5)} — {slot.end_time.slice(0, 5)}</p>
                  <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-muted-foreground"><span>{ui('السعة')} {slot.capacity}</span><span>{slot.status === 'available' ? ui('متاح') : ui('ملغي')}</span></div>
                </div>)}</div>
              </div>;
            })}
          </div>
          {(data.slots ?? []).length === 0 && <div className="border-t p-5 text-center text-sm text-muted-foreground">{ui('لا توجد مواعيد مسجلة في أيام هذا الشهر.')}</div>}
        </div>
        <div className="flex justify-end"><Button variant="outline" onClick={onClose}>{ui('إغلاق')}</Button></div>
      </div>}
    </DialogContent>
  </Dialog>;
}

export function MonthlyScheduleLauncher({ category }: { category: Category }) {
  const ft = useFitnessT();
  const ui = useUi();
  const qc = useQueryClient();
  const now = new Date();
  const [form, setForm] = useState({ serviceId: '', employeeId: '', month: String(now.getMonth() + 1), year: String(now.getFullYear()) });
  const [activeId, setActiveId] = useState<number | null>(null);
  const [viewId, setViewId] = useState<number | null>(null);
  const { items: allServices } = useFitnessResourceList<ServiceRow>('scheduling/services');
  const { providers, isLoading: providersLoading } = useSchedulingProviders(category);
  const services = allServices.filter((service) => service.isActive && service.category === category);
  const serviceLabel = category === 'personal_training' ? ft('sched.class') : ft('sched.service');
  const providerLabel = category === 'nutrition'
    ? ft('sched.nutritionSpecialist')
    : category === 'personal_training'
      ? ft('sched.trainer')
      : ft('sched.serviceProvider');
  const providerPlaceholder = category === 'personal_training'
    ? ft('sched.selectTrainer')
    : ft('sched.selectProvider');
  const queryKey = ['service-monthly-schedules', category];
  const { data: plans = [], isLoading } = useQuery({ queryKey, queryFn: async () => (await api.get<MonthlyPlan[]>('/scheduling/monthly-schedules', { params: { category } })).data });
  const active = plans.find((plan) => plan.id === activeId) ?? null;
  const refresh = () => qc.invalidateQueries({ queryKey });

  const create = async () => {
    if (!form.serviceId || !form.employeeId) return;
    try {
      const response = await api.post<MonthlyPlan>('/scheduling/monthly-schedules', { category, serviceId: Number(form.serviceId), employeeId: Number(form.employeeId), month: Number(form.month), year: Number(form.year) });
      setActiveId(response.data.id);
      toast.success(ft('sched.monthlyScheduleCreated'));
      await refresh();
    } catch (error) { toast.error(apiError(error)); }
  };
  const action = async (plan: MonthlyPlan, name: 'publish' | 'archive' | 'delete') => {
    try {
      if (name === 'delete') await api.delete(`/scheduling/monthly-schedules/${plan.id}`); else await api.patch(`/scheduling/monthly-schedules/${plan.id}/${name}`);
      if (name === 'delete' && activeId === plan.id) setActiveId(null);
      toast.success(ft('sched.updated'));
      await refresh();
    } catch (error) { toast.error(apiError(error)); }
  };

  return <div className="space-y-5">
    <Card><CardHeader><CardTitle>{ft('sched.createMonthlySchedule')}</CardTitle></CardHeader><CardContent className="grid gap-3 md:grid-cols-5">
      <div><Label>{serviceLabel}</Label><select className={SELECT_CLS} value={form.serviceId} onChange={(event) => setForm({ ...form, serviceId: event.target.value })}><option value="">{category === 'personal_training' ? ft('sched.selectClass') : ft('sched.selectService')}</option>{services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}</select></div>
      <div><Label>{providerLabel}</Label><select className={SELECT_CLS} value={form.employeeId} onChange={(event) => setForm({ ...form, employeeId: event.target.value })}><option value="">{providersLoading ? ft('sched.loadingProviders') : providerPlaceholder}</option>{providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}</select></div>
      <div><Label>{ft('sched.month')}</Label><Input type="number" min="1" max="12" value={form.month} onChange={(event) => setForm({ ...form, month: event.target.value })} /></div>
      <div><Label>{ft('sched.year')}</Label><Input type="number" min="2000" value={form.year} onChange={(event) => setForm({ ...form, year: event.target.value })} /></div>
      <Button className="self-end" disabled={!form.serviceId || !form.employeeId} onClick={() => void create()}><CalendarPlus className="me-1 size-4" />{ui('إنشاء')}</Button>
    </CardContent></Card>
    {plans.some((plan) => plan.status === 'draft') && <Card><CardContent className="flex flex-wrap items-center gap-2 pt-6"><span className="font-semibold">{ui('فتح تقويم جدول')}:</span>{plans.filter((plan) => plan.status === 'draft').map((plan) => <Button key={plan.id} variant={activeId === plan.id ? 'default' : 'outline'} onClick={() => setActiveId(plan.id)}>{plan.service.name} · {plan.month}/{plan.year} · {plan.trainer.name}</Button>)}</CardContent></Card>}
    {active && <MonthlyPlanCalendar plan={active} onChanged={() => void refresh()} />}
    <MonthlyPlanViewDialog planId={viewId} onClose={() => setViewId(null)} />
    {isLoading ? <Empty text={ui('جارٍ التحميل...')} /> : plans.length === 0 ? <Empty text={ui('لا توجد بيانات')} /> : <div className="overflow-x-auto rounded-xl border"><table className="w-full text-sm"><thead className="bg-muted/60"><tr>{['#', serviceLabel, providerLabel, ft('sched.month'), ft('sched.totalSchedules'), ft('sched.status'), ft('sched.actions')].map((heading) => <th key={heading} className="p-3 text-start">{heading}</th>)}</tr></thead><tbody>{plans.map((plan) => <tr key={plan.id} className="border-t"><td className="p-3">{plan.id}</td><td className="p-3 font-semibold">{plan.service.name}</td><td className="p-3">{plan.trainer.name}</td><td className="p-3">{plan.month}/{plan.year}</td><td className="p-3">{plan._count?.slots ?? plan.slots?.length ?? 0}</td><td className="p-3"><StatusBadge status={plan.status === 'published' ? 'active' : plan.status === 'archived' ? 'expired' : 'pending'} label={ft(`sched.${plan.status}`)} /></td><td className="p-3"><div className="flex flex-wrap gap-2">{plan.status === 'draft' && <Button size="sm" onClick={() => void action(plan, 'publish')}>{ft('sched.publish')}</Button>}<Button size="sm" variant="outline" onClick={() => setViewId(plan.id)}>{ui('عرض الجدول')}</Button>{plan.status !== 'archived' && <Button size="sm" variant="outline" onClick={() => void action(plan, 'archive')}>{ft('sched.archive')}</Button>}{plan.status === 'draft' && <Button size="sm" variant="destructive" onClick={() => void action(plan, 'delete')}>{ft('sched.delete')}</Button>}</div></td></tr>)}</tbody></table></div>}
  </div>;
}

export type { MonthlyPlan };
