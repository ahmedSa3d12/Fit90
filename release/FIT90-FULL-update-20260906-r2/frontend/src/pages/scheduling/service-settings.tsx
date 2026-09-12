import type { ColumnDef } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/common/data-table';
import { FilterBar, type FilterField } from '@/components/common/filter-bar';
import { PageHeader } from '@/components/common/page-header';
import { StatusBadge } from '@/components/common/status-badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useFitnessT } from '@/hooks/use-fitness-t';
import { api, apiError } from '@/lib/api';
import { formatMoney } from '@/lib/formatters';
import { usePaginatedList } from '@/lib/api-hooks';
import { confirm } from '@/lib/confirm';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import { RowActions, SELECT_CLS } from '../club/fitness/shared';
import {
  CATEGORIES,
  CATEGORY_LABEL,
  CATEGORY_SERVICE_SETTINGS_TITLE,
  type Category,
  type ServiceRow,
} from './shared';

const EMPTY = {
  name: '',
  category: 'class' as Category,
  description: '',
  entitlementKey: '' as '' | 'nutrition_session' | 'inbody',
  durationMin: '60',
  price: '0',
  capacity: '',
  color: '#1E6BA8',
  isActive: true,
};

export function ServiceSettingsPage({ category }: { category?: Category } = {}) {
  const ft = useFitnessT();
  const createLabel = category === 'personal_training' ? ft('sched.newClass') : ft('sched.newService');
  const { params, setParams } = useListQuery(category ? { filters: { category } } : undefined);
  const listParams = category
    ? { ...params, filters: { ...params.filters, category } }
    : params;
  const { data, isLoading, isError, refetch } = usePaginatedList<ServiceRow>('scheduling/services', listParams);

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY);

  const filters: FilterField[] = [
    ...(!category ? [{
      key: 'category',
      label: ft('sched.category'),
      type: 'select' as const,
      options: CATEGORIES.map((c) => ({ value: c, label: ft(CATEGORY_LABEL[c]) })),
    }] : []),
    {
      key: 'active',
      label: ft('sched.status'),
      type: 'select',
      options: [
        { value: 'true', label: ft('sched.active') },
        { value: 'false', label: ft('sched.inactive') },
      ],
    },
  ];

  const openCreate = () => {
    setEditId(null);
    setForm({ ...EMPTY, category: category ?? 'class' });
    setOpen(true);
  };
  const openEdit = (r: ServiceRow) => {
    setEditId(r.id);
    setForm({
      name: r.name,
      category: r.category,
      description: r.description ?? '',
      entitlementKey: r.entitlementKey ?? '',
      durationMin: String(r.durationMin),
      price: String(r.price),
      capacity: r.capacity == null ? '' : String(r.capacity),
      color: r.color ?? '#1E6BA8',
      isActive: r.isActive,
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast.error(ft('sched.name'));
      return;
    }
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        category: form.category,
        description: form.description || null,
        entitlementKey: form.category === 'nutrition' ? form.entitlementKey || null : null,
        durationMin: Number(form.durationMin) || 60,
        price: form.price || '0',
        capacity: form.capacity === '' ? null : Number(form.capacity),
        color: form.color,
        isActive: form.isActive,
      };
      if (editId) await api.put(`/scheduling/services/${editId}`, body);
      else await api.post('/scheduling/services', body);
      toast.success(ft('sched.saved'));
      setOpen(false);
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (r: ServiceRow) => {
    if (!(await confirm({ title: ft('sched.delete'), description: r.name, variant: 'destructive' }))) return;
    try {
      await api.delete(`/scheduling/services/${r.id}`);
      toast.success(ft('sched.deleted'));
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const columns = useMemo<ColumnDef<ServiceRow>[]>(
    () => [
      {
        accessorKey: 'name',
        header: ft('sched.name'),
        cell: ({ row }) => (
          <span className="flex items-center gap-2">
            <span
              className="inline-block h-3 w-3 shrink-0 rounded-full"
              style={{ backgroundColor: row.original.color ?? '#888' }}
            />
            {row.original.name}
          </span>
        ),
      },
      ...(!category ? [{
        accessorKey: 'category',
        header: ft('sched.category'),
        cell: ({ row }) => ft(CATEGORY_LABEL[row.original.category]),
      } as ColumnDef<ServiceRow>] : []),
      {
        accessorKey: 'durationMin',
        header: ft('sched.duration'),
        cell: ({ row }) => <span className="nums">{toArabicDigits(row.original.durationMin)}</span>,
      },
      {
        accessorKey: 'price',
        header: ft('sched.price'),
        cell: ({ row }) => formatMoney(row.original.price),
      },
      {
        accessorKey: 'capacity',
        header: ft('sched.capacity'),
        cell: ({ row }) =>
          row.original.capacity == null ? '—' : toArabicDigits(row.original.capacity),
      },
      {
        accessorKey: 'isActive',
        header: ft('sched.status'),
        cell: ({ row }) => (
          <StatusBadge
            status={row.original.isActive ? 'active' : 'expired'}
            label={row.original.isActive ? ft('sched.active') : ft('sched.inactive')}
          />
        ),
      },
      {
        id: 'actions',
        header: ft('sched.actions'),
        cell: ({ row }) => (
          <RowActions
            editLabel={ft('sched.edit')}
            deleteLabel={ft('sched.delete')}
            onEdit={() => openEdit(row.original)}
            onDelete={() => void remove(row.original)}
          />
        ),
      },
    ],
    [category, ft],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          title={category ? ft(CATEGORY_SERVICE_SETTINGS_TITLE[category]) : ft('sched.serviceSettings')}
        />
        <Button onClick={openCreate}>
          <Plus className="me-1 h-4 w-4" /> {createLabel}
        </Button>
      </div>

      <FilterBar fields={filters} />

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        total={data?.total ?? 0}
        page={params.page}
        pageSize={params.pageSize}
        onPageChange={(page) => setParams({ page })}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editId ? ft('sched.editService') : createLabel}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-1.5">
              <Label>{ft('sched.name')}</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            {!category && <div className="space-y-1.5">
              <Label>{ft('sched.category')}</Label>
              <select
                className={SELECT_CLS}
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value as Category })}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {ft(CATEGORY_LABEL[c])}
                  </option>
                ))}
              </select>
            </div>}
            <div className="space-y-1.5">
              <Label>{ft('sched.color')}</Label>
              <Input
                type="color"
                value={form.color}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
                className="h-10 p-1"
              />
            </div>
            {form.category === 'nutrition' && <div className="col-span-2 space-y-1.5">
              <Label>نوع الرصيد من الاشتراك</Label>
              <select className={SELECT_CLS} value={form.entitlementKey} onChange={(e) => setForm({ ...form, entitlementKey: e.target.value as '' | 'nutrition_session' | 'inbody' })}>
                <option value="">لا تخصم من الاشتراك (الخدمة مدفوعة)</option>
                <option value="nutrition_session">جلسة تغذية</option>
                <option value="inbody">قياس InBody</option>
              </select>
              <p className="text-xs text-muted-foreground">يُستخدم هذا الاختيار لفحص رصيد العميل قبل الحجز.</p>
            </div>}
            <div className="space-y-1.5">
              <Label>{ft('sched.duration')}</Label>
              <Input
                type="number"
                value={form.durationMin}
                onChange={(e) => setForm({ ...form, durationMin: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{ft('sched.price')}</Label>
              <Input
                type="number"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{ft('sched.capacity')}</Label>
              <Input
                type="number"
                value={form.capacity}
                onChange={(e) => setForm({ ...form, capacity: e.target.value })}
                placeholder="—"
              />
            </div>
            <div className="flex items-end gap-2">
              <input
                id="svc-active"
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                className="h-4 w-4"
              />
              <Label htmlFor="svc-active">{ft('sched.active')}</Label>
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>{ft('sched.description')}</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {ft('sched.cancel')}
            </Button>
            <Button onClick={() => void save()} disabled={saving}>
              {ft('sched.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
