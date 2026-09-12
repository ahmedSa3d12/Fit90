import type { CellContext, ColumnDef } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/common/data-table';
import { PageHeader } from '@/components/common/page-header';
import { StatusBadge } from '@/components/common/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useClubT } from '@/hooks/use-club-t';
import { api, apiError } from '@/lib/api';
import { useArrayResource, usePaginatedList } from '@/lib/api-hooks';
import { confirm } from '@/lib/confirm';
import { useListQuery } from '@/lib/use-list-query';
import { useLocale } from '@/store/locale';
import { RowActions, SELECT_CLS } from '../club/fitness/shared';

interface ClassType {
  id: number;
  name: string;
}

interface ClassService {
  id: number;
  name: string;
  classTypeId: number | null;
  price: string;
  isActive: boolean;
}

export function MosClassServicesPage() {
  const ct = useClubT();
  const { t } = useLocale();
  const { params, setParams } = useListQuery();
  const { data: classTypes } = useArrayResource<ClassType>('club-mos/lookups/class_type');
  const { data, isLoading, isError, refetch } = usePaginatedList<ClassService>('scheduling/services', {
    ...params,
    filters: { ...params.filters, category: 'class' },
  });
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ classTypeId: '', name: '', price: '', isActive: 'true' });

  const classNames = useMemo(
    () => new Map((classTypes ?? []).map((item) => [item.id, item.name])),
    [classTypes],
  );

  const openCreate = () => {
    setEditId(null);
    setForm({ classTypeId: '', name: '', price: '', isActive: 'true' });
    setOpen(true);
  };

  const openEdit = (row: ClassService) => {
    setEditId(row.id);
    setForm({
      classTypeId: row.classTypeId ? String(row.classTypeId) : '',
      name: row.name,
      price: row.price ?? '',
      isActive: row.isActive ? 'true' : 'false',
    });
    setOpen(true);
  };

  const remove = async (row: ClassService) => {
    const ok = await confirm({
      title: ct('common.delete'),
      description: ct('common.confirmDelete'),
      variant: 'destructive',
    });
    if (!ok) return;
    try {
      await api.delete(`/scheduling/services/${row.id}`);
      toast.success(ct('common.success'));
      void refetch();
    } catch (error) {
      toast.error(apiError(error));
    }
  };

  const columns = useMemo<ColumnDef<ClassService>[]>(
    () => [
      {
        id: 'className',
        header: t('nav.mos.className'),
        cell: ({ row }: CellContext<ClassService, unknown>) =>
          row.original.classTypeId ? (classNames.get(row.original.classTypeId) ?? '—') : '—',
      },
      { accessorKey: 'name', header: t('nav.mos.serviceName') },
      { accessorKey: 'price', header: t('nav.mos.price') },
      {
        accessorKey: 'isActive',
        header: t('nav.mos.status'),
        cell: ({ row }: CellContext<ClassService, unknown>) => (
          <StatusBadge
            status={row.original.isActive ? 'active' : 'suspended'}
            label={row.original.isActive ? t('nav.mos.active') : t('nav.mos.inactive')}
          />
        ),
      },
      {
        id: 'actions',
        header: ct('common.actions'),
        cell: ({ row }: CellContext<ClassService, unknown>) => (
          <RowActions
            inline
            editLabel={ct('common.edit')}
            deleteLabel={ct('common.delete')}
            onEdit={() => openEdit(row.original)}
            onDelete={() => void remove(row.original)}
          />
        ),
      },
    ],
    [classNames, ct, t],
  );

  const save = async () => {
    if (!form.classTypeId || !form.name.trim() || form.price === '') {
      toast.error(ct('members.fillRequired'));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        classTypeId: Number(form.classTypeId),
        name: form.name.trim(),
        price: form.price,
        isActive: form.isActive === 'true',
        category: 'class',
      };
      if (editId) await api.put(`/scheduling/services/${editId}`, payload);
      else await api.post('/scheduling/services', payload);
      toast.success(ct('common.success'));
      setOpen(false);
      void refetch();
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('nav.mos.class_services')}
        eyebrow={t('nav.mos.management')}
        actions={<Button variant="brand" onClick={openCreate}><Plus className="size-4" /> {ct('common.add')}</Button>}
      />
      <Card className="overflow-hidden border-border/60 shadow-sm">
        <div className="h-0.5 bg-gradient-to-l from-violet-500/60 via-primary to-emerald-500/40" />
        <CardContent className="pt-6">
          <DataTable
            columns={columns}
            data={data?.data ?? []}
            total={data?.total ?? 0}
            page={params.page}
            pageSize={params.pageSize}
            onPageChange={(page) => setParams({ page })}
            onPageSizeChange={(pageSize) => setParams({ pageSize, page: 1 })}
            search={params.search}
            onSearchChange={(search) => setParams({ search, page: 1 })}
            isLoading={isLoading}
            isError={isError}
            onRetry={() => void refetch()}
          />
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editId ? ct('common.edit') : ct('common.add')}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>{t('nav.mos.className')} *</Label>
              <select
                className={SELECT_CLS}
                value={form.classTypeId}
                onChange={(event) => setForm((current) => ({ ...current, classTypeId: event.target.value }))}
              >
                <option value="">—</option>
                {(classTypes ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </div>
            <div className="grid gap-2">
              <Label>{t('nav.mos.serviceName')} *</Label>
              <Input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
            </div>
            <div className="grid gap-2">
              <Label>{t('nav.mos.price')} *</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.price}
                onChange={(event) => setForm((current) => ({ ...current, price: event.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label>{t('nav.mos.status')} *</Label>
              <select
                className={SELECT_CLS}
                value={form.isActive}
                onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.value }))}
              >
                <option value="true">{t('nav.mos.active')}</option>
                <option value="false">{t('nav.mos.inactive')}</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{ct('common.cancel')}</Button>
            <Button variant="brand" disabled={saving} onClick={() => void save()}>
              {saving ? ct('common.saving') : ct('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
