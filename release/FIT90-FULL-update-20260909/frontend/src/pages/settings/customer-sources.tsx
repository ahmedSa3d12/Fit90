import type { ColumnDef } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/common/data-table';
import { PageHeader } from '@/components/common/page-header';
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
import { useClubT } from '@/hooks/use-club-t';
import { api, apiError } from '@/lib/api';
import { clientPaginate, useArrayResource, useMutationWithToast } from '@/lib/api-hooks';
import { confirm } from '@/lib/confirm';
import { useListQuery } from '@/lib/use-list-query';
import { RowActions } from '../club/fitness/shared';

interface CustomerSourceRow {
  id: number;
  name: string;
  isActive: boolean;
}

export function CustomerSourcesPage() {
  const ct = useClubT();
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, refetch } = useArrayResource<CustomerSourceRow>('club-customer-sources');

  const paged = useMemo(
    () =>
      clientPaginate(data ?? [], params, {
        search: (row, q) => (row.name ?? '').toLowerCase().includes(q),
      }),
    [data, params],
  );

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', isActive: true });

  const deleteMutation = useMutationWithToast(
    (id: number) => api.delete(`/club-customer-sources/${id}`),
    { success: ct('common.success'), invalidate: ['club-customer-sources'] },
  );

  const openCreate = () => {
    setEditId(null);
    setForm({ name: '', isActive: true });
    setOpen(true);
  };

  const openEdit = (row: CustomerSourceRow) => {
    setEditId(row.id);
    setForm({ name: row.name, isActive: row.isActive });
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast.error(ct('members.fillRequired'));
      return;
    }
    setSaving(true);
    try {
      const payload = { name: form.name.trim(), isActive: form.isActive };
      if (editId) await api.put(`/club-customer-sources/${editId}`, payload);
      else await api.post('/club-customer-sources', payload);
      toast.success(ct('common.success'));
      setOpen(false);
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const columns = useMemo<ColumnDef<CustomerSourceRow>[]>(
    () => [
      { accessorKey: 'name', header: ct('common.name') },
      {
        accessorKey: 'isActive',
        header: ct('customerSources.active'),
        cell: ({ getValue }) => ((getValue() as boolean) ? ct('customerSources.yes') : ct('customerSources.no')),
      },
      {
        id: 'actions',
        header: ct('common.actions'),
        cell: ({ row }) => (
          <RowActions
            editLabel={ct('common.edit')}
            deleteLabel={ct('common.delete')}
            onEdit={() => openEdit(row.original)}
            onDelete={() =>
              void confirm({ title: ct('customerSources.deleteConfirm'), variant: 'destructive' }).then((ok) => {
                if (ok) deleteMutation.mutate(row.original.id);
              })
            }
          />
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deleteMutation, ct],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={ct('customerSources.title')}
        description={ct('customerSources.desc')}
        actions={
          <Button variant="brand" onClick={openCreate}>
            <Plus className="size-4" /> {ct('customerSources.newSource')}
          </Button>
        }
      />
      <DataTable
        columns={columns}
        data={paged.data}
        total={paged.total}
        page={params.page}
        pageSize={params.pageSize}
        onPageChange={(page) => setParams({ page })}
        onPageSizeChange={(pageSize) => setParams({ pageSize, page: 1 })}
        search={params.search}
        onSearchChange={(search) => setParams({ search, page: 1 })}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
        emptyTitle={ct('customerSources.empty')}
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{editId ? ct('common.edit') : ct('customerSources.newSource')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-2">
              <Label>{ct('common.name')}</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
              />
              {ct('customerSources.active')}
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{ct('common.cancel')}</Button>
            <Button variant="brand" onClick={() => void save()} disabled={saving}>{ct('common.save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
