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
import { useBranches } from '@/hooks/use-branches';
import { useClubT } from '@/hooks/use-club-t';
import { api, apiError } from '@/lib/api';
import { clientPaginate, useArrayResource, useMutationWithToast } from '@/lib/api-hooks';
import { confirm } from '@/lib/confirm';
import { useListQuery } from '@/lib/use-list-query';
import { RowActions, SELECT_CLS } from '../club/fitness/shared';

interface SalesStaffRow {
  id: number;
  name: string;
  phone: string | null;
  branchId: number | null;
  isActive: boolean;
}

export function SalesStaffPage() {
  const ct = useClubT();
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, refetch } = useArrayResource<SalesStaffRow>('club-sales-staff');
  const { data: branches } = useBranches();
  const branchOptions = (branches ?? []).map((b) => ({ value: String(b.id), label: b.name ?? '—' }));
  const branchName = (id: number | null) =>
    id != null ? (branches ?? []).find((b) => b.id === id)?.name ?? '—' : '—';

  const paged = useMemo(
    () =>
      clientPaginate(data ?? [], params, {
        search: (row, q) =>
          (row.name ?? '').toLowerCase().includes(q) || (row.phone ?? '').toLowerCase().includes(q),
      }),
    [data, params],
  );

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    phone: '',
    branchId: '',
    isActive: true,
  });

  const deleteMutation = useMutationWithToast(
    (id: number) => api.delete(`/club-sales-staff/${id}`),
    { success: ct('common.success'), invalidate: ['club-sales-staff'] },
  );

  const openCreate = () => {
    setEditId(null);
    setForm({
      name: '',
      phone: '',
      branchId: branches?.[0] ? String(branches[0].id) : '',
      isActive: true,
    });
    setOpen(true);
  };

  const openEdit = (row: SalesStaffRow) => {
    setEditId(row.id);
    setForm({
      name: row.name,
      phone: row.phone ?? '',
      branchId: row.branchId != null ? String(row.branchId) : '',
      isActive: row.isActive,
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast.error(ct('members.fillRequired'));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        phone: form.phone.trim() || undefined,
        branchId: form.branchId ? Number(form.branchId) : undefined,
        isActive: form.isActive,
      };
      if (editId) await api.put(`/club-sales-staff/${editId}`, payload);
      else await api.post('/club-sales-staff', payload);
      toast.success(ct('common.success'));
      setOpen(false);
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const columns = useMemo<ColumnDef<SalesStaffRow>[]>(
    () => [
      { accessorKey: 'name', header: ct('common.name') },
      {
        accessorKey: 'phone',
        header: ct('common.phone'),
        cell: ({ getValue }) => <span className="nums">{(getValue() as string | null) ?? '—'}</span>,
      },
      {
        accessorKey: 'branchId',
        header: ct('common.branch'),
        cell: ({ row }) => branchName(row.original.branchId),
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
              void confirm({ title: ct('salesStaff.deleteConfirm'), variant: 'destructive' }).then((ok) => {
                if (ok) deleteMutation.mutate(row.original.id);
              })
            }
          />
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [branches, ct],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={ct('salesStaff.title')}
        actions={
          <Button variant="brand" onClick={openCreate}>
            <Plus className="size-4" /> {ct('salesStaff.newStaff')}
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
        emptyTitle={ct('salesStaff.empty')}
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{editId ? ct('common.edit') : ct('salesStaff.newStaff')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-2">
              <Label>{ct('common.name')}</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="grid gap-2">
              <Label>{ct('common.phone')}</Label>
              <Input
                className="nums"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label>{ct('common.branch')}</Label>
              <select
                className={SELECT_CLS}
                value={form.branchId}
                onChange={(e) => setForm((f) => ({ ...f, branchId: e.target.value }))}
              >
                <option value="">—</option>
                {branchOptions.map((b) => (
                  <option key={b.value} value={b.value}>
                    {b.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {ct('common.cancel')}
            </Button>
            <Button variant="brand" onClick={() => void save()} disabled={saving}>
              {ct('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
