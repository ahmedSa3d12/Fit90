import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { KeyRound, Pencil, Plus, Trash2, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Combobox } from '@/components/common/combobox';
import { DataTable } from '@/components/common/data-table';
import { ListPageShell } from '@/components/common/list-page-shell';
import { StatusBadge } from '@/components/common/status-badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useBranches } from '@/hooks/use-branches';
import { api, apiError } from '@/lib/api';
import { clientPaginate, useArrayResource, useMutationWithToast } from '@/lib/api-hooks';
import { confirm } from '@/lib/confirm';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import type { EmployeeListItem } from '@/types/employees';
import { useLocale } from '@/store/locale';
import { uiStatic } from '@/lib/ui-static';

interface UserRow {
  user_id: number;
  username: string | null;
  name: string | null;
  email: string | null;
  level: number | null;
  branch_id_fk: number | null;
  emp_code: number | null;
  approved: number | null;
  level_label?: string;
}

const LEVEL_OPTIONS = [
  { value: '1', label: uiStatic('مدير على النظام') },
  { value: '2', label: uiStatic('موظف على النظام') },
  { value: '3', label: uiStatic('مدير فرع-ادارة') },
];

const LEVEL_LABELS: Record<number, string> = {
  1: uiStatic('مدير على النظام'),
  2: uiStatic('موظف على النظام'),
  3: uiStatic('مدير فرع-ادارة'),
};

const emptyForm = {
  username: '',
  fullname: '',
  email: '',
  password: '',
  level: '1',
  empCode: '',
};

export function UsersManagePage() {
  const { ui } = useLocale();
  const navigate = useNavigate();
  const { params, setParams } = useListQuery();
  const { data: users = [], isLoading, isError, error, refetch } = useArrayResource<UserRow>('users');
  const { data: branches = [] } = useBranches();
  // Employee directory for level 2/3 (the backend resolves name/branch from emp_code).
  const { data: rawEmployees = [] } = useEmployeeOptionsFull();

  const employeeOptions = useMemo(
    () =>
      rawEmployees.map((e) => ({
        value: String(e.emp_code),
        label: `${e.employee ?? '—'} (${toArabicDigits(e.emp_code ?? '')})`,
      })),
    [rawEmployees],
  );

  const branchName = (id: number | null) =>
    id != null ? (branches.find((b) => b.id === id)?.name ?? '—') : '—';

  const pageData = useMemo(
    () =>
      clientPaginate(users, params, {
        search: (u, q) =>
          (u.username ?? '').toLowerCase().includes(q) ||
          (u.name ?? '').toLowerCase().includes(q) ||
          (u.email ?? '').toLowerCase().includes(q),
      }),
    [users, params],
  );

  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [originalLevel, setOriginalLevel] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const deleteMutation = useMutationWithToast(
    (id: number) => api.delete(`/users/${id}`),
    { success: ui('تم حذف المستخدم'), invalidate: ['users'] },
  );

  const statusMutation = useMutationWithToast(
    (id: number) => api.patch(`/users/${id}/approved`),
    { success: ui('تم تحديث الحالة'), invalidate: ['users'] },
  );

  const stats = useMemo(
    () => [
      { title: ui('المستخدمون'), value: toArabicDigits(users.length), icon: <Users className="size-5" /> },
    ],
    [users],
  );

  const openCreate = () => {
    setEditId(null);
    setOriginalLevel(null);
    setForm(emptyForm);
    setFormOpen(true);
  };

  const openEdit = (row: UserRow) => {
    setEditId(row.user_id);
    setOriginalLevel(row.level);
    setForm({
      username: row.username ?? '',
      fullname: row.level === 1 ? (row.name ?? '') : '',
      email: row.email ?? '',
      password: '',
      level: row.level != null ? String(row.level) : '1',
      empCode: '',
    });
    setFormOpen(true);
  };

  const save = async () => {
    const level = parseInt(form.level, 10);
    if (form.username.trim().length < 5) {
      toast.error(ui('اسم المستخدم مطلوب (٥ أحرف على الأقل)'));
      return;
    }
    if (!editId && form.password.trim().length < 5) {
      toast.error(ui('كلمة المرور مطلوبة (٥ أحرف على الأقل)'));
      return;
    }
    if (form.password.trim() && form.password.trim().length < 5) {
      toast.error(ui('كلمة المرور يجب ألا تقل عن ٥ أحرف'));
      return;
    }
    if (level === 1 && !form.fullname.trim()) {
      toast.error(ui('الاسم الكامل مطلوب'));
      return;
    }
    if (level !== 1 && !form.empCode && (!editId || originalLevel !== level)) {
      toast.error(ui('اختر الموظف المرتبط بالحساب'));
      return;
    }

    const payload: Record<string, unknown> = {
      username: form.username.trim(),
      email: form.email.trim() || undefined,
      level,
      ...(level === 1
        ? { fullname: form.fullname.trim() }
        : form.empCode ? { empCode: parseInt(form.empCode, 10) } : {}),
      ...(form.password.trim() ? { password: form.password.trim() } : {}),
    };

    setSaving(true);
    try {
      if (editId) {
        await api.patch(`/users/${editId}`, payload);
      } else {
        await api.post('/users', payload);
      }
      toast.success(ui('تم حفظ المستخدم'));
      setFormOpen(false);
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (row: UserRow) => {
    const next = row.approved === 1 ? 0 : 1;
    const ok = await confirm({
      title: next === 1 ? ui('تفعيل المستخدم') : ui('إيقاف المستخدم'),
      description:
        next === 1
          ? ui('هل تريد تفعيل هذا المستخدم؟')
          : ui('هل تريد إيقاف هذا المستخدم عن الدخول؟'),
      confirmLabel: next === 1 ? ui('تفعيل') : ui('إيقاف'),
      variant: next === 1 ? 'default' : 'destructive',
    });
    if (ok) statusMutation.mutate(row.user_id);
  };

  const columns: ColumnDef<UserRow>[] = [
    {
      accessorKey: 'user_id',
      header: ui('م'),
      cell: ({ row }) => toArabicDigits((params.page - 1) * params.pageSize + row.index + 1),
    },
    { accessorKey: 'username', header: ui('اسم المستخدم') },
    { accessorKey: 'name', header: ui('الاسم'), cell: ({ getValue }) => (getValue() as string | null) || '—' },
    {
      accessorKey: 'email',
      header: ui('البريد'),
      cell: ({ getValue }) => (getValue() as string | null) || '—',
    },
    {
      accessorKey: 'level',
      header: ui('الصلاحية'),
      cell: ({ row }) =>
        row.original.level_label ?? LEVEL_LABELS[row.original.level ?? 0] ?? '—',
    },
    {
      accessorKey: 'branch_id_fk',
      header: ui('الفرع'),
      cell: ({ getValue }) => branchName(getValue() as number | null),
    },
    {
      accessorKey: 'approved',
      header: ui('الحالة'),
      cell: ({ row }) => (
        <button type="button" onClick={() => void toggleStatus(row.original)} aria-label={ui('تغيير الحالة')}>
          <StatusBadge
            status={row.original.approved === 1 ? 'active' : 'suspended'}
            label={row.original.approved === 1 ? ui('مُفعّل') : ui('موقوف')}
            className="cursor-pointer"
          />
        </button>
      ),
    },
    {
      id: 'actions',
      header: ui('الإجراءات'),
      cell: ({ row }) => (
        <div className="flex gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/admin/exceptions?user=${row.original.user_id}`)}
          >
            <KeyRound className="size-4" /> {ui('الصلاحيات')}
          </Button>
          <Button variant="ghost" size="icon" aria-label={ui('تعديل')} onClick={() => openEdit(row.original)}>
            <Pencil className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={ui('حذف')}
            onClick={async () => {
              const ok = await confirm({
                title: ui('حذف المستخدم'),
                description: ui('هل تريد حذف هذا المستخدم؟ سيتم حذف صلاحياته أيضاً.'),
                confirmLabel: 'حذف',
                variant: 'destructive',
              });
              if (ok) deleteMutation.mutate(row.original.user_id);
            }}
          >
            <Trash2 className="size-4 text-destructive" />
          </Button>
        </div>
      ),
    },
  ];

  const level = parseInt(form.level, 10);

  return (
    <>
      <ListPageShell
        title={ui('إدارة المستخدمين')}
        description={ui('إضافة وتعديل مستخدمي النظام وصلاحياتهم')}
        searchPlaceholder={ui('بحث بالاسم أو اسم المستخدم…')}
        stats={stats}
        statsLoading={isLoading}
        isError={isError}
        error={error}
        actions={
          <Button variant="brand" size="sm" onClick={openCreate}>
            <Plus className="size-4" /> {ui('إضافة مستخدم')}
          </Button>
        }
      >
        <DataTable
          columns={columns}
          data={pageData.data}
          total={pageData.total}
          page={params.page}
          pageSize={params.pageSize}
          onPageChange={(p) => setParams({ page: p })}
          onPageSizeChange={(s) => setParams({ pageSize: s, page: 1 })}
          isLoading={isLoading}
          isError={isError}
          onRetry={() => void refetch()}
          search={params.search}
          onSearchChange={(s) => setParams({ search: s, page: 1 })}
          emptyTitle={ui('لا يوجد مستخدمون')}
        />
      </ListPageShell>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{editId ? ui('تعديل مستخدم') : ui('إضافة مستخدم')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="user-username">{ui('اسم المستخدم')}</Label>
              <Input
                id="user-username"
                className="mt-1.5"
                value={form.username}
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
              />
            </div>
            <div>
              <Label>{ui('الصلاحية')}</Label>
              <div className="mt-1.5">
                <Combobox
                  value={form.level}
                  onValueChange={(v) => setForm((f) => ({ ...f, level: v }))}
                  options={LEVEL_OPTIONS}
                  placeholder={ui('الصلاحية…')}
                />
              </div>
            </div>
            {level === 1 ? (
              <div>
                <Label htmlFor="user-fullname">{ui('الاسم الكامل')}</Label>
                <Input
                  id="user-fullname"
                  className="mt-1.5"
                  value={form.fullname}
                  onChange={(e) => setForm((f) => ({ ...f, fullname: e.target.value }))}
                />
              </div>
            ) : (
              <div>
                <Label>{ui('الموظف المرتبط')}</Label>
                <div className="mt-1.5">
                  <Combobox
                    value={form.empCode}
                    onValueChange={(empCode) => setForm((f) => ({ ...f, empCode }))}
                    options={employeeOptions}
                    placeholder={ui('اختر الموظف…')}
                    searchPlaceholder={ui('بحث بالاسم أو الكود…')}
                  />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {editId
                    ? ui('اتركه فارغاً للحفاظ على الموظف المرتبط، أو اختر موظفاً لتغييره.')
                    : ui('يُشتق الاسم والفرع تلقائياً من بيانات الموظف.')}
                </p>
              </div>
            )}
            <div>
              <Label htmlFor="user-email">{ui('البريد الإلكتروني')}</Label>
              <Input
                id="user-email"
                type="email"
                className="mt-1.5"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="user-password">{editId ? ui('كلمة مرور جديدة (اختياري)') : ui('كلمة المرور')}</Label>
              <Input
                id="user-password"
                type="password"
                className="mt-1.5"
                autoComplete="new-password"
                value={form.password}
                placeholder={editId ? ui('اتركها فارغة للإبقاء عليها') : ''}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>{ui('إلغاء')}</Button>
            <Button onClick={() => void save()} disabled={saving}>
              {saving ? ui('جارٍ الحفظ…') : ui('حفظ')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Like useEmployeeOptions but returns raw items so we can key by emp_code. */
function useEmployeeOptionsFull() {
  return useQuery({
    queryKey: ['employees', 'user-options'],
    queryFn: async () => {
      const { data } = await api.get<{ data: EmployeeListItem[] }>('/employees', {
        params: { page: 1, pageSize: 500, status: 1 },
      });
      return data.data ?? [];
    },
    staleTime: 60_000,
  });
}
