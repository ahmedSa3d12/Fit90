import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarPlus, Clock3, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { StatusBadge } from '@/components/common/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, apiError } from '@/lib/api';
import { useUi } from '@/store/locale';
import { confirm } from '@/lib/confirm';
import { SELECT_CLS } from '../club/fitness/shared';
import { useSchedulingProviders } from './providers';
import type { Category } from './shared';

type NutritionWindow = {
  id: number;
  slot_date: string;
  start_time: string;
  end_time: string;
  booking_start_at?: string | null;
  booking_end_at?: string | null;
  is_active: boolean;
  booked_count: number;
  bookingCount?: number;
  cancelled_at?: string | null;
  cancellation_reason?: string | null;
  capacity?: number;
};

type NutritionMonthlyPlan = {
  id: number;
  employee_id: number;
  employeeId: number;
  month: number;
  year: number;
  status: 'draft' | 'published' | 'archived';
  trainer: { id: number; name: string };
  _count?: { windows: number };
  windows?: NutritionWindow[];
};

const weekdays = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const emptyWindow = () => ({ startTime: '15:00', endTime: '20:00', bookingStartAt: '', bookingEndAt: '', capacity: '1' });
const dateKey = (year: number, month: number, day: number) => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

function Empty({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">{text}</div>;
}

function NutritionPlanCalendar({ plan, category, onChanged }: { plan: NutritionMonthlyPlan; category: Extract<Category, 'nutrition' | 'spa' | 'personal_training'>; onChanged: () => void }) {
  const ui = useUi();
  const [selectedDate, setSelectedDate] = useState('');
  const [rows, setRows] = useState([emptyWindow()]);
  const [repeatWeekly, setRepeatWeekly] = useState(true);
  const [editingWindowId, setEditingWindowId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['nutrition-monthly-plan', plan.id],
    queryFn: async () => (await api.get<NutritionMonthlyPlan>(`/scheduling/provider-monthly-availability/${plan.id}`)).data,
  });
  const current = data ?? plan;
  const windows = current.windows ?? [];
  const daysCount = new Date(current.year, current.month, 0).getDate();
  const firstDay = new Date(current.year, current.month - 1, 1).getDay();
  const windowsForDate = (date: string) => windows.filter((window) => window.slot_date === date);
  const updateRow = (index: number, key: keyof ReturnType<typeof emptyWindow>, value: string) => {
    setRows((items) => items.map((item, rowIndex) => rowIndex === index ? { ...item, [key]: value } : item));
  };

  const save = async () => {
    if (!selectedDate || current.status !== 'draft') return;
    setSaving(true);
    try {
      for (const row of rows) {
        if (!row.startTime || !row.endTime || row.endTime <= row.startTime) throw new Error(ui('تأكد أن نهاية فترة الحضور بعد بدايتها'));
        if (category === 'personal_training' && (!row.capacity || Number(row.capacity) < 1)) throw new Error(ui('السعة يجب أن تكون 1 على الأقل'));
        if ((row.bookingStartAt === '') !== (row.bookingEndAt === '')) throw new Error(ui('حددي فتح وغلق الحجز معًا أو اتركيهما فارغين'));
        if (row.bookingStartAt && row.bookingEndAt && row.bookingEndAt <= row.bookingStartAt) throw new Error(ui('غلق الحجز يجب أن يكون بعد فتحه'));
        const payload = {
          slotDate: selectedDate,
          startTime: row.startTime,
          endTime: row.endTime,
          repeatWeekly: editingWindowId == null ? repeatWeekly : false,
          bookingStartAt: row.bookingStartAt ? new Date(row.bookingStartAt).toISOString() : undefined,
          bookingEndAt: row.bookingEndAt ? new Date(row.bookingEndAt).toISOString() : undefined,
          ...(category === 'personal_training' ? { capacity: Number(row.capacity) } : {}),
        };
        if (editingWindowId != null) {
          await api.patch('/scheduling/provider-monthly-availability/' + current.id + '/windows/' + editingWindowId, payload);
        } else {
          await api.post('/scheduling/provider-monthly-availability/' + current.id + '/windows', payload);
        }
      }
      toast.success(ui(repeatWeekly ? 'تم تطبيق فترات الحضور أسبوعيًا طوال الشهر' : 'تمت إضافة فترات الحضور'));
      setSelectedDate('');
      setRows([emptyWindow()]);
      setEditingWindowId(null);
      await refetch();
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error && !('response' in error) ? error.message : apiError(error));
    } finally {
      setSaving(false);
    }
  };

  const editWindow = (window: NutritionWindow) => {
    setSelectedDate(window.slot_date);
    setEditingWindowId(window.id);
    setRepeatWeekly(false);
    setRows([{
      startTime: window.start_time.slice(0, 5),
      endTime: window.end_time.slice(0, 5),
      bookingStartAt: window.booking_start_at?.slice(0, 16) ?? '',
      bookingEndAt: window.booking_end_at?.slice(0, 16) ?? '',
      capacity: String(window.capacity ?? 1),
    }]);
  };

  const removeWindow = async (window: NutritionWindow) => {
    if (!(await confirm({ title: ui('حذف فترة الحضور'), description: `${window.slot_date} · ${window.start_time.slice(0, 5)}–${window.end_time.slice(0, 5)}`, variant: 'destructive' }))) return;
    try {
      await api.delete(`/scheduling/provider-monthly-availability/${current.id}/windows/${window.id}`);
      toast.success(ui('تم حذف فترة الحضور'));
      await refetch();
      onChanged();
    } catch (error) { toast.error(ui(apiError(error))); }
  };

  if (isLoading && !data) return <Empty text={ui('جارٍ تحميل التقويم...')} />;
  return <Card className="border-primary/30">
    <CardHeader><CardTitle>{ui('تقويم حضور')} {current.trainer.name} — {current.month}/{current.year}</CardTitle></CardHeader>
    <CardContent className="space-y-5">
      <div className="grid grid-cols-7 gap-2 text-center text-sm">
        {weekdays.map((day) => <div key={day} className="py-2 font-semibold text-muted-foreground">{day}</div>)}
        {Array.from({ length: firstDay }).map((_, index) => <div key={`empty-${index}`} />)}
        {Array.from({ length: daysCount }, (_, index) => index + 1).map((day) => {
          const date = dateKey(current.year, current.month, day);
          const dayWindows = windowsForDate(date);
          return <button key={day} type="button" disabled={current.status !== 'draft'} onClick={() => { setSelectedDate(date); setRows([emptyWindow()]); }} className={`min-h-24 rounded-xl border p-2 text-start transition hover:border-primary disabled:cursor-default disabled:opacity-75 ${selectedDate === date ? 'border-primary bg-primary/10' : 'bg-card'}`}>
            <span className="font-bold">{day}</span>
            {dayWindows.length > 0 && <div className="mt-3 space-y-1">{dayWindows.slice(0, 2).map((window) => <div key={window.id} className="rounded-md bg-primary/15 px-2 py-1 text-xs text-primary">{window.start_time.slice(0, 5)}–{window.end_time.slice(0, 5)}</div>)}</div>}
          </button>;
        })}
      </div>
      <Dialog open={Boolean(selectedDate)} onOpenChange={(open) => !open && setSelectedDate('')}>
        <DialogContent size="form" aria-describedby={undefined}>
          <DialogHeader><DialogTitle>{ui('إضافة فترات حضور يوم')} {selectedDate}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {rows.map((row, index) => <div key={index} className="space-y-3 rounded-xl border bg-muted/20 p-4">
              <div className="flex items-center justify-between"><b>فترة الحضور {index + 1}</b>{rows.length > 1 && <Button size="sm" variant="destructive" onClick={() => setRows((items) => items.filter((_, rowIndex) => rowIndex !== index))}>حذف</Button>}</div>
              <div className={`grid gap-3 ${category === 'personal_training' ? 'md:grid-cols-5' : 'md:grid-cols-4'}`}>
                <div><Label>{ui('من')}</Label><Input type="time" value={row.startTime} onChange={(event) => updateRow(index, 'startTime', event.target.value)} /></div>
                <div><Label>{ui('إلى')}</Label><Input type="time" value={row.endTime} onChange={(event) => updateRow(index, 'endTime', event.target.value)} /></div>
                {category === 'personal_training' && <div><Label>{ui('السعة')}</Label><Input type="number" min="1" value={row.capacity} onChange={(event) => updateRow(index, 'capacity', event.target.value)} /></div>}
                <div><Label>{ui('فتح الحجز (اختياري)')}</Label><Input type="datetime-local" value={row.bookingStartAt} onChange={(event) => updateRow(index, 'bookingStartAt', event.target.value)} /></div>
                <div><Label>{ui('غلق الحجز (اختياري)')}</Label><Input type="datetime-local" min={row.bookingStartAt || undefined} value={row.bookingEndAt} onChange={(event) => updateRow(index, 'bookingEndAt', event.target.value)} /></div>
              </div>
            </div>)}
            <Button variant="outline" onClick={() => setRows((items) => [...items, emptyWindow()])}><Plus className="me-1 size-4" />{ui('إضافة فترة أخرى')}</Button>
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border bg-primary/5 p-4"><input type="checkbox" className="mt-1 size-4 accent-primary" checked={repeatWeekly} onChange={(event) => setRepeatWeekly(event.target.checked)} /><span><b>{ui('تكرار أسبوعي تلقائي')}</b><small className="mt-1 block text-muted-foreground">{ui('يتم تكرار نفس فترة حضور الأخصائي في نفس يوم الأسبوع حتى نهاية الشهر.')}</small></span></label>
            {windowsForDate(selectedDate).length > 0 && <div className="space-y-2"><b>فترات الحضور المسجلة</b>{windowsForDate(selectedDate).map((window) => <div key={window.id} className="flex items-center justify-between rounded-lg border p-3">
              <span>{window.start_time.slice(0, 5)} — {window.end_time.slice(0, 5)}{category === 'personal_training' ? ` · ${ui('السعة')} ${window.capacity ?? 1}` : ''} · {window.bookingCount ?? 0} {ui('حجز')}</span>
              <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => editWindow(window)}>{ui('تعديل')}</Button><Button variant="ghost" size="icon" className="text-destructive" onClick={() => void removeWindow(window)}><Trash2 className="size-4" /></Button></div>
            </div>)}</div>}
            <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setSelectedDate('')}>{ui('إلغاء')}</Button><Button disabled={saving} onClick={() => void save()}>{ui(repeatWeekly ? 'حفظ وتطبيق أسبوعيًا' : 'حفظ فترات اليوم')}</Button></div>
          </div>
        </DialogContent>
      </Dialog>
    </CardContent>
  </Card>;
}

function NutritionPlanViewDialog({ planId, category, onClose }: { planId: number | null; category: Extract<Category, 'nutrition' | 'spa' | 'personal_training'>; onClose: () => void }) {
  const ui = useUi();
  const providerLabel = category === 'spa' ? ui('مقدم خدمة السبا') : category === 'personal_training' ? ui('مدرب التدريب الشخصي') : ui('أخصائي التغذية');
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['nutrition-monthly-plan-view', planId],
    enabled: planId != null,
    queryFn: async () => (await api.get<NutritionMonthlyPlan>(`/scheduling/provider-monthly-availability/${planId}`)).data,
  });
  const daysCount = data ? new Date(data.year, data.month, 0).getDate() : 0;
  const firstDay = data ? new Date(data.year, data.month - 1, 1).getDay() : 0;
  const byDate = new Map<string, NutritionWindow[]>();
  (data?.windows ?? []).forEach((window) => byDate.set(window.slot_date, [...(byDate.get(window.slot_date) ?? []), window]));
  const cancelWindow = async (attendance: NutritionWindow) => {
    if (planId == null) return;
    const reason = globalThis.prompt(ui('سبب إلغاء فترة الحضور'));
    if (!reason?.trim()) return;
    try {
      const response = await api.post<{ cancelledBookingsCount?: number }>('/scheduling/provider-monthly-availability/' + planId + '/windows/' + attendance.id + '/cancel', { reason: reason.trim() });
      toast.success(ui('تم إلغاء فترة الحضور و') + (response.data.cancelledBookingsCount ?? 0) + ' ' + ui('حجز مرتبط'));
      await refetch();
    } catch (error) { toast.error(ui(apiError(error))); }
  };
  return <Dialog open={planId != null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="xl" aria-describedby={undefined}>
      <DialogHeader><DialogTitle>{ui('عرض جدول حضور')} {providerLabel}</DialogTitle></DialogHeader>
      {isLoading || !data ? <Empty text={ui('جارٍ تحميل الجدول...')} /> : <div className="space-y-4">
        <div className="grid gap-3 rounded-xl border bg-muted/20 p-4 sm:grid-cols-3"><div><span className="text-sm text-muted-foreground">{providerLabel}</span><p className="font-bold">{data.trainer.name}</p></div><div><span className="text-sm text-muted-foreground">{ui('الشهر')}</span><p className="font-bold">{data.month}/{data.year}</p></div><div><span className="text-sm text-muted-foreground">{ui('الحالة')}</span><p className="font-bold">{ui(data.status === 'published' ? 'منشور' : data.status === 'archived' ? 'مؤرشف' : 'مسودة')}</p></div></div>
        <div className="max-h-[60vh] overflow-auto rounded-xl border"><div className="grid min-w-[1050px] grid-cols-7 text-sm">
          {weekdays.map((day) => <div key={day} className="sticky top-0 z-10 border-b border-e bg-muted p-3 text-center font-bold">{day}</div>)}
          {Array.from({ length: firstDay }).map((_, index) => <div key={`empty-${index}`} className="min-h-36 border-b border-e bg-muted/10" />)}
          {Array.from({ length: daysCount }, (_, index) => index + 1).map((day) => {
            const windows = byDate.get(dateKey(data.year, data.month, day)) ?? [];
            return <div key={day} className="min-h-36 border-b border-e bg-card p-2"><div className="mb-2 flex items-center justify-between"><span className="flex size-7 items-center justify-center rounded-full bg-muted font-bold">{day}</span>{windows.length > 0 && <span className="text-xs text-muted-foreground">{windows.length} فترة</span>}</div><div className="space-y-2">{windows.map((window) => <div key={window.id} className={'rounded-lg border p-2 ' + (window.cancelled_at ? 'border-red-500/35 bg-red-500/10' : 'border-emerald-500/35 bg-emerald-500/10')}>
              <p className="font-bold"><Clock3 className="me-1 inline size-3.5" />{window.start_time.slice(0, 5)} — {window.end_time.slice(0, 5)}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">{window.cancelled_at ? 'ملغي' : 'متاح للحجز'} · {window.bookingCount ?? 0} حجز</p>
              {data.status === 'published' && !window.cancelled_at && <Button className="mt-2" size="sm" variant="destructive" onClick={() => void cancelWindow(window)}>إلغاء الفترة</Button>}
            </div>)}</div></div>;
          })}
        </div></div>
        <div className="flex justify-end"><Button variant="outline" onClick={onClose}>إغلاق</Button></div>
      </div>}
    </DialogContent>
  </Dialog>;
}

export function NutritionMonthlyScheduleLauncher({ category = 'nutrition' }: { category?: Extract<Category, 'nutrition' | 'spa' | 'personal_training'> }) {
  const ui = useUi();
  const qc = useQueryClient();
  const now = new Date();
  const [form, setForm] = useState({ employeeId: '', month: String(now.getMonth() + 1), year: String(now.getFullYear()) });
  const [activeId, setActiveId] = useState<number | null>(null);
  const [viewId, setViewId] = useState<number | null>(null);
  const providerLabel = category === 'spa' ? ui('مقدم خدمة السبا') : category === 'personal_training' ? ui('مدرب التدريب الشخصي') : ui('أخصائي التغذية');
  const { providers, isLoading: providersLoading } = useSchedulingProviders(category);
  const queryKey = ['provider-monthly-plans', category];
  const { data: plans = [], isLoading } = useQuery({ queryKey, queryFn: async () => (await api.get<NutritionMonthlyPlan[]>('/scheduling/provider-monthly-availability', { params: { category } })).data });
  const active = plans.find((plan) => plan.id === activeId) ?? null;
  const refresh = () => qc.invalidateQueries({ queryKey });

  const create = async () => {
    if (!form.employeeId) return;
    try {
      const response = await api.post<NutritionMonthlyPlan>('/scheduling/provider-monthly-availability', { employeeId: Number(form.employeeId), month: Number(form.month), year: Number(form.year), category });
      setActiveId(response.data.id);
      toast.success('تم إنشاء مسودة جدول حضور الشهر');
      await refresh();
    } catch (error) { toast.error(ui(apiError(error))); }
  };
  const action = async (plan: NutritionMonthlyPlan, name: 'publish' | 'archive' | 'delete') => {
    try {
      if (name === 'delete') await api.delete(`/scheduling/provider-monthly-availability/${plan.id}`);
      else await api.patch(`/scheduling/provider-monthly-availability/${plan.id}/${name}`);
      if (name === 'delete' && activeId === plan.id) setActiveId(null);
      if (name === 'publish' && activeId === plan.id) setActiveId(null);
      await qc.invalidateQueries({ queryKey: ['nutrition-monthly-plan', plan.id] });
      toast.success(name === 'publish' ? 'تم نشر جدول الحضور' : name === 'archive' ? 'تمت أرشفة الجدول' : 'تم حذف المسودة');
      await refresh();
    } catch (error) { toast.error(ui(apiError(error))); }
  };

  return <div className="space-y-5">
    <Card><CardHeader><CardTitle>{ui('إنشاء جدول حضور شهري')}</CardTitle></CardHeader><CardContent className="grid gap-3 md:grid-cols-4">
      <div><Label>{providerLabel}</Label><select className={SELECT_CLS} value={form.employeeId} onChange={(event) => setForm({ ...form, employeeId: event.target.value })}><option value="">{ui(providersLoading ? 'جارٍ تحميل مقدمي الخدمة...' : 'اختر مقدم الخدمة')}</option>{providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}</select></div>
      <div><Label>{ui('الشهر')}</Label><Input type="number" min="1" max="12" value={form.month} onChange={(event) => setForm({ ...form, month: event.target.value })} /></div>
      <div><Label>{ui('السنة')}</Label><Input type="number" min="2000" value={form.year} onChange={(event) => setForm({ ...form, year: event.target.value })} /></div>
      <Button className="self-end" disabled={!form.employeeId} onClick={() => void create()}><CalendarPlus className="me-1 size-4" />{ui('إنشاء')}</Button>
    </CardContent></Card>
    {plans.some((plan) => plan.status === 'draft') && <Card><CardContent className="flex flex-wrap items-center gap-2 pt-6"><span className="font-semibold">{ui('فتح تقويم جدول')}:</span>{plans.filter((plan) => plan.status === 'draft').map((plan) => <Button key={plan.id} variant={activeId === plan.id ? 'default' : 'outline'} onClick={() => setActiveId(plan.id)}>{plan.month}/{plan.year} · {plan.trainer.name}</Button>)}</CardContent></Card>}
    {active && <NutritionPlanCalendar plan={active} category={category} onChanged={() => void refresh()} />}
    <NutritionPlanViewDialog planId={viewId} category={category} onClose={() => setViewId(null)} />
    {isLoading ? <Empty text={ui('جارٍ التحميل...')} /> : plans.length === 0 ? <Empty text={ui('لا توجد جداول شهرية')} /> : <div className="overflow-x-auto rounded-xl border"><table className="w-full text-sm"><thead className="bg-muted/60"><tr>{['#', 'مقدم الخدمة', 'الشهر', 'إجمالي فترات الحضور', 'الحالة', 'الإجراءات'].map((heading) => <th key={heading} className="p-3 text-start">{ui(heading)}</th>)}</tr></thead><tbody>{plans.map((plan) => <tr key={plan.id} className="border-t"><td className="p-3">{plan.id}</td><td className="p-3 font-semibold">{plan.trainer.name}</td><td className="p-3">{plan.month}/{plan.year}</td><td className="p-3">{plan._count?.windows ?? plan.windows?.length ?? 0}</td><td className="p-3"><StatusBadge status={plan.status === 'published' ? 'active' : plan.status === 'archived' ? 'expired' : 'pending'} label={ui(plan.status === 'published' ? 'منشور' : plan.status === 'archived' ? 'مؤرشف' : 'مسودة')} /></td><td className="p-3"><div className="flex flex-wrap gap-2">{plan.status === 'draft' && <Button size="sm" onClick={() => void action(plan, 'publish')}>{ui('نشر')}</Button>}<Button size="sm" variant="outline" onClick={() => setViewId(plan.id)}>{ui('عرض الجدول')}</Button>{plan.status === 'published' && <Button size="sm" variant="outline" onClick={() => void action(plan, 'archive')}>{ui('أرشفة')}</Button>}{plan.status === 'draft' && <Button size="sm" variant="destructive" onClick={() => void action(plan, 'delete')}>{ui('حذف')}</Button>}</div></td></tr>)}</tbody></table></div>}
  </div>;
}
