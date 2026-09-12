import type { ColumnDef } from '@tanstack/react-table';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Eye, ListTodo, Pencil, Plus, Save, Search, Send, Timer, XCircle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Combobox } from '@/components/common/combobox';
import { DataTable } from '@/components/common/data-table';
import { PageHeader } from '@/components/common/page-header';
import { StatCard } from '@/components/common/stat-card';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useClubT } from '@/hooks/use-club-t';
import { api } from '@/lib/api';
import { useMutationWithToast, usePaginatedList } from '@/lib/api-hooks';
import { mosMenuLabel } from '@/lib/mos-menu-utils';
import { useListQuery } from '@/lib/use-list-query';
import { useAuth } from '@/store/auth';
import { useLocale } from '@/store/locale';

interface TaskRow {
  id: number;
  title: string;
  description?: string | null;
  taskType?: string | null;
  status: string;
  assignedTo?: number | null;
  fromEmployee?: string | null;
  toEmployee?: string | null;
  startDate?: string | null;
  dueDate?: string | null;
  createdAt?: string | null;
}

interface Assignee {
  employeeId: number;
  userId: number;
  name: string;
  department?: string | null;
  jobTitle?: string | null;
}
interface TaskStats { total: number; sent: number; inProgress: number; completed: number; cancelled: number }

const today = () => new Date().toISOString().slice(0, 10);
const emptyForm = () => ({ assigneeUserId: '', title: '', description: '', startDate: today(), endDate: '' });

export function MosTasksPage() {
  const ct = useClubT();
  const { t, ui } = useLocale();
  const { user } = useAuth();
  const { params, setParams } = useListQuery();
  const [createOpen, setCreateOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskRow | null>(null);
  const [detailsTask, setDetailsTask] = useState<TaskRow | null>(null);
  const [form, setForm] = useState(emptyForm);

  const { data, isLoading, isError, refetch } = usePaginatedList<TaskRow>('club/automation/tasks', params);
  const { data: stats } = useQuery({
    queryKey: ['club/automation/task-stats'],
    queryFn: async () => (await api.get<TaskStats>('/club/automation/task-stats')).data,
  });
  const { data: assignees = [], isFetching: assigneesLoading } = useQuery({
    queryKey: ['club/automation/task-assignees'],
    queryFn: async () => (await api.get<Assignee[]>('/club/automation/task-assignees')).data,
    enabled: createOpen || editingTask != null,
  });
  const employeeOptions = useMemo(() => assignees.map((employee) => ({
    value: String(employee.userId),
    label: `${employee.name}${employee.jobTitle ? ` — ${employee.jobTitle}` : ''}`,
  })), [assignees]);

  const createTask = useMutationWithToast(
    () => api.post('/club/automation/tasks', { ...form, assigneeUserId: Number(form.assigneeUserId) }),
    {
      success: ui('تم إرسال المهمة والإشعار بنجاح'),
      invalidate: ['club/automation/tasks', 'club/automation/task-stats', 'notifications'],
      onSuccess: () => { setCreateOpen(false); setForm(emptyForm()); },
    },
  );
  const updateTask = useMutationWithToast(
    () => api.patch(`/club/automation/tasks/${editingTask?.id}`, { ...form, assigneeUserId: Number(form.assigneeUserId) }),
    {
      success: ui('تم تعديل المهمة بنجاح'),
      invalidate: ['club/automation/tasks', 'club/automation/task-stats'],
      onSuccess: () => { setEditingTask(null); setForm(emptyForm()); },
    },
  );
  const updateStatus = useMutationWithToast(
    ({ id, status }: { id: number; status: string }) => api.patch(`/club/automation/tasks/${id}/status`, null, { params: { status } }),
    { success: ui('تم حفظ حالة المهمة'), invalidate: ['club/automation/tasks', 'club/automation/task-stats'] },
  );

  const openEdit = (task: TaskRow) => {
    setForm({
      assigneeUserId: task.assignedTo?.toString() ?? '',
      title: task.title,
      description: task.description ?? '',
      startDate: task.startDate ?? today(),
      endDate: task.dueDate ?? '',
    });
    setEditingTask(task);
  };
  const statusLabel = (task: TaskRow) => ({ open: ui('المرسلة'), in_progress: ui('قيد التنفيذ'), completed: ui('مكتملة'), cancelled: ui('ملغاة') }[task.status] ?? task.status);

  const columns = useMemo<ColumnDef<TaskRow>[]>(() => [
    { accessorKey: 'title', header: ui('المهمة') },
    { accessorKey: 'fromEmployee', header: ui('من موظف'), cell: ({ getValue }) => getValue() ?? '—' },
    { accessorKey: 'toEmployee', header: ui('إلى موظف'), cell: ({ getValue }) => getValue() ?? '—' },
    { id: 'status', header: ui('الحالة'), cell: ({ row }) => <TaskStatusEditor task={row.original} saving={updateStatus.isPending} onSave={(status) => updateStatus.mutate({ id: row.original.id, status })} labels={{ sent: ui('المرسلة'), inProgress: ui('قيد التنفيذ'), completed: ui('مكتملة'), cancelled: ui('ملغاة'), save: ui('حفظ الحالة') }} /> },
    { accessorKey: 'createdAt', header: ui('التاريخ'), cell: ({ getValue }) => String(getValue() ?? '').slice(0, 10) || '—' },
    {
      id: 'actions', header: ui('الإجراء'), cell: ({ row }) => (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="icon" title={ui('تفاصيل')} aria-label={ui('تفاصيل')} onClick={() => setDetailsTask(row.original)}><Eye className="size-4" /></Button>
          <Button variant="outline" size="icon" title={ui('تعديل')} aria-label={ui('تعديل')} onClick={() => openEdit(row.original)}><Pencil className="size-4" /></Button>
        </div>
      ),
    },
  ], [ui, updateStatus]);

  const taskForm = (editing: boolean) => (
    <form className="grid gap-5" onSubmit={(event) => { event.preventDefault(); editing ? updateTask.mutate(undefined) : createTask.mutate(undefined); }}>
      <div className="grid gap-2"><Label>{ui('مرسل المهمة')}</Label><Input value={editing ? editingTask?.fromEmployee ?? user?.name ?? '—' : user?.name ?? '—'} disabled /></div>
      <div className="grid gap-2"><Label>{ui('تاريخ الإرسال')}</Label><Input value={editing ? editingTask?.createdAt?.slice(0, 10) ?? today() : today()} disabled dir="ltr" /></div>
      <div className="grid gap-2">
        <Label>{ui('الموظف المستلم')}</Label>
        <Combobox value={form.assigneeUserId} onValueChange={(value) => setForm({ ...form, assigneeUserId: value })} options={employeeOptions} placeholder={assigneesLoading ? ui('جارٍ تحميل الموظفين…') : ui('اختر الموظف')} searchPlaceholder={ui('ابحث باسم الموظف…')} emptyText={ui('لا يوجد موظفون مطابقون')} />
      </div>
      <div className="grid gap-2"><Label htmlFor="task-title">{ui('المهمة')}</Label><Input id="task-title" required maxLength={255} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></div>
      <div className="grid gap-2"><Label htmlFor="task-description">{ui('التفاصيل')}</Label><Textarea id="task-description" required rows={4} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2"><Label htmlFor="task-start">{ui('تاريخ البداية')}</Label><Input id="task-start" type="date" required value={form.startDate} onChange={(event) => setForm({ ...form, startDate: event.target.value })} dir="ltr" /></div>
        <div className="grid gap-2"><Label htmlFor="task-end">{ui('تاريخ الانتهاء')}</Label><Input id="task-end" type="date" required min={form.startDate} value={form.endDate} onChange={(event) => setForm({ ...form, endDate: event.target.value })} dir="ltr" /></div>
      </div>
      <DialogFooter><Button type="button" variant="outline" onClick={() => editing ? setEditingTask(null) : setCreateOpen(false)}>{ui('إلغاء')}</Button><Button type="submit" disabled={!form.assigneeUserId || createTask.isPending || updateTask.isPending}>{editing ? ui('حفظ التعديل') : ui('إرسال المهمة')}</Button></DialogFooter>
    </form>
  );

  return (
    <div className="space-y-6">
      <PageHeader title={mosMenuLabel(t, 'tasks')} eyebrow={t('nav.sections.club')} actions={<Button onClick={() => { setForm(emptyForm()); setCreateOpen(true); }}><Plus className="size-4" />{ui('إضافة مهمة')}</Button>} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard title={ui('الإجمالي')} value={stats?.total ?? 0} icon={<ListTodo className="size-5" />} />
        <StatCard title={ui('المرسلة')} value={stats?.sent ?? 0} icon={<Send className="size-5" />} />
        <StatCard title={ui('قيد التنفيذ')} value={stats?.inProgress ?? 0} icon={<Timer className="size-5" />} />
        <StatCard title={ui('مكتملة')} value={stats?.completed ?? 0} icon={<CheckCircle2 className="size-5" />} />
        <StatCard title={ui('ملغاة')} value={stats?.cancelled ?? 0} icon={<XCircle className="size-5" />} />
      </div>
      <Card className="overflow-hidden shadow-sm">
        <div className="h-0.5 bg-gradient-to-l from-sky-500/60 via-primary to-indigo-500/40" />
        <CardContent className="pt-6">
          <div className="mb-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
            <div className="relative"><Search className="pointer-events-none absolute end-3 top-3 size-4 text-muted-foreground" /><Input value={params.search} onChange={(event) => setParams({ search: event.target.value, page: 1 })} placeholder={ui('ابحث باسم المهمة أو الموظف…')} className="pe-10" /></div>
            <select className="h-10 rounded-[10px] border border-input bg-card px-3 text-sm" value={params.filters.status ?? ''} onChange={(event) => setParams({ filters: event.target.value ? { status: event.target.value } : {}, page: 1 })}>
              <option value="">{ui('كل الحالات')}</option><option value="open">{ui('المرسلة')}</option><option value="in_progress">{ui('قيد التنفيذ')}</option><option value="completed">{ui('مكتملة')}</option><option value="cancelled">{ui('ملغاة')}</option>
            </select>
          </div>
          <DataTable columns={columns} data={data?.data ?? []} total={data?.total ?? 0} page={params.page} pageSize={params.pageSize} onPageChange={(page) => setParams({ page })} onPageSizeChange={(pageSize) => setParams({ pageSize, page: 1 })} isLoading={isLoading} isError={isError} onRetry={() => void refetch()} />
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogContent size="md"><DialogHeader><DialogTitle>{ui('إضافة مهمة جديدة')}</DialogTitle><DialogDescription>{ui('سيصل إشعار إلى حساب الموظف المختار')}</DialogDescription></DialogHeader>{taskForm(false)}</DialogContent></Dialog>
      <Dialog open={editingTask != null} onOpenChange={(open) => !open && setEditingTask(null)}><DialogContent size="md"><DialogHeader><DialogTitle>{ui('تعديل المهمة')}</DialogTitle><DialogDescription>{ui('تعديل بيانات المهمة والموظف المستلم')}</DialogDescription></DialogHeader>{taskForm(true)}</DialogContent></Dialog>
      <Dialog open={detailsTask != null} onOpenChange={(open) => !open && setDetailsTask(null)}><DialogContent size="md"><DialogHeader><DialogTitle>{ui('تفاصيل المهمة')}</DialogTitle><DialogDescription>{detailsTask?.title}</DialogDescription></DialogHeader><div className="grid gap-4 sm:grid-cols-2"><Detail label={ui('من موظف')} value={detailsTask?.fromEmployee} /><Detail label={ui('إلى موظف')} value={detailsTask?.toEmployee} /><Detail label={ui('الحالة')} value={detailsTask ? statusLabel(detailsTask) : null} /><Detail label={ui('تاريخ الإرسال')} value={detailsTask?.createdAt?.slice(0, 10)} /><Detail label={ui('تاريخ البداية')} value={detailsTask?.startDate} /><Detail label={ui('تاريخ الانتهاء')} value={detailsTask?.dueDate} /><div className="sm:col-span-2"><Detail label={ui('التفاصيل')} value={detailsTask?.description} /></div></div><DialogFooter><Button onClick={() => setDetailsTask(null)}>{ui('إغلاق')}</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
}

function Detail({ label, value }: { label: string; value?: string | null }) {
  return <div className="rounded-xl border border-border bg-muted/20 p-4"><p className="mb-1 text-xs text-muted-foreground">{label}</p><p className="whitespace-pre-wrap font-medium">{value || '—'}</p></div>;
}

function TaskStatusEditor({ task, saving, onSave, labels }: { task: TaskRow; saving: boolean; onSave: (status: string) => void; labels: { sent: string; inProgress: string; completed: string; cancelled: string; save: string } }) {
  const [value, setValue] = useState(task.status);
  return (
    <div className="flex min-w-44 items-center gap-2">
      <select className="h-9 flex-1 rounded-lg border border-input bg-card px-2 text-sm" value={value} onChange={(event) => setValue(event.target.value)}>
        <option value="open">{labels.sent}</option>
        <option value="in_progress">{labels.inProgress}</option>
        <option value="completed">{labels.completed}</option>
        <option value="cancelled">{labels.cancelled}</option>
      </select>
      <Button type="button" size="icon" variant="outline" title={labels.save} aria-label={labels.save} disabled={saving || value === task.status} onClick={() => onSave(value)}><Save className="size-4" /></Button>
    </div>
  );
}
