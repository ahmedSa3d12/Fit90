import type { ColumnDef } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { DataTable } from '@/components/common/data-table';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useBranches } from '@/hooks/use-branches';
import { useFitnessT } from '@/hooks/use-fitness-t';
import { api, apiError } from '@/lib/api';
import { useMutationWithToast, usePaginatedList } from '@/lib/api-hooks';
import { confirm } from '@/lib/confirm';
import { useListQuery } from '@/lib/use-list-query';
import { RowActions, SELECT_CLS } from './shared';

interface InbodyBookingRow {
  id: number;
  memberId: number | null;
  memberName: string | null;
  bookingDate: string;
  startTime: string | null;
  staffName: string | null;
  status: 'booked' | 'completed' | 'cancelled';
  notes: string | null;
  branchId: number | null;
}

const EMPTY = {
  memberName: '',
  bookingDate: '',
  slotId: '',
  startTime: '',
  staffName: '',
  status: 'booked',
  notes: '',
  branchId: '',
};

export function FitnessInbodyBookingsPage() {
  const ft = useFitnessT();
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, refetch } = usePaginatedList<InbodyBookingRow>('club-inbody-bookings', params);
  const { data: branches } = useBranches();
  const branchOptions = (branches ?? []).map((b) => ({ value: String(b.id), label: b.name ?? '—' }));

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ ...EMPTY });

  // Available-times ↔ booking linkage: load open InBody slots for the chosen date.
  const { data: availableSlots } = useQuery({
    queryKey: ['inbody-available', form.bookingDate],
    enabled: open && !!form.bookingDate,
    queryFn: async () => {
      const res = await api.get<
        Array<{ id: number; startTime: string; endTime: string; capacity: number; bookedCount: number }>
      >('/availability/available', { params: { moduleType: 'inbody', date: form.bookingDate } });
      return res.data;
    },
  });

  const deleteMutation = useMutationWithToast(
    (id: number) => api.delete(`/club-inbody-bookings/${id}`),
    { success: ft('common.success'), invalidate: ['club-inbody-bookings'] },
  );

  const openCreate = () => {
    setEditId(null);
    setForm({ ...EMPTY, branchId: branches?.[0] ? String(branches[0].id) : '' });
    setOpen(true);
  };

  const openEdit = (row: InbodyBookingRow) => {
    setEditId(row.id);
    setForm({
      memberName: row.memberName ?? '',
      bookingDate: row.bookingDate,
      slotId: '',
      startTime: row.startTime ?? '',
      staffName: row.staffName ?? '',
      status: row.status,
      notes: row.notes ?? '',
      branchId: row.branchId != null ? String(row.branchId) : '',
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.bookingDate) {
      toast.error(ft('inbodyBookings.dateRequired'));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        memberName: form.memberName || undefined,
        bookingDate: form.bookingDate,
        slotId: form.slotId ? Number(form.slotId) : undefined,
        startTime: form.startTime || undefined,
        staffName: form.staffName || undefined,
        status: form.status,
        notes: form.notes || undefined,
        branchId: form.branchId ? Number(form.branchId) : undefined,
      };
      if (editId) await api.put(`/club-inbody-bookings/${editId}`, payload);
      else await api.post('/club-inbody-bookings', payload);
      toast.success(ft('common.success'));
      setOpen(false);
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const columns = useMemo<ColumnDef<InbodyBookingRow>[]>(
    () => [
      { accessorKey: 'memberName', header: ft('inbodyBookings.member'), cell: ({ getValue }) => (getValue() as string) || '—' },
      { accessorKey: 'bookingDate', header: ft('inbodyBookings.date') },
      { accessorKey: 'startTime', header: ft('inbodyBookings.time'), cell: ({ getValue }) => (getValue() as string) || '—' },
      { accessorKey: 'staffName', header: ft('inbodyBookings.staff'), cell: ({ getValue }) => (getValue() as string) || '—' },
      {
        accessorKey: 'status',
        header: ft('inbodyBookings.status'),
        cell: ({ getValue }) => ft(`inbodyBookings.${getValue() as string}`),
      },
      {
        id: 'actions',
        header: ft('common.actions'),
        cell: ({ row }) => (
          <RowActions
            editLabel={ft('common.edit')}
            deleteLabel={ft('common.delete')}
            onEdit={() => openEdit(row.original)}
            onDelete={() =>
              void confirm({ title: ft('common.confirmDelete'), variant: 'destructive' }).then((ok) => {
                if (ok) deleteMutation.mutate(row.original.id);
              })
            }
          />
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deleteMutation, ft],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={ft('inbodyBookings.title')}
        actions={
          <Button variant="brand" onClick={openCreate}>
            <Plus className="size-4" /> {ft('inbodyBookings.newBooking')}
          </Button>
        }
      />
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
        emptyTitle={ft('inbodyBookings.empty')}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{editId ? ft('common.edit') : ft('inbodyBookings.newBooking')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-2">
              <Label>{ft('inbodyBookings.memberName')}</Label>
              <Input value={form.memberName} onChange={(e) => setForm((f) => ({ ...f, memberName: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>{ft('inbodyBookings.date')}</Label>
                <Input type="date" value={form.bookingDate} onChange={(e) => setForm((f) => ({ ...f, bookingDate: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>{ft('inbodyBookings.time')}</Label>
                <Input type="time" value={form.startTime} onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))} />
              </div>
            </div>
            {(availableSlots?.length ?? 0) > 0 && (
              <div className="grid gap-2">
                <Label>{ft('inbodyBookings.availableSlots')}</Label>
                <select
                  className={SELECT_CLS}
                  value={form.slotId}
                  onChange={(e) => {
                    const slot = (availableSlots ?? []).find((s) => String(s.id) === e.target.value);
                    setForm((f) => ({ ...f, slotId: e.target.value, startTime: slot ? slot.startTime : f.startTime }));
                  }}
                >
                  <option value="">{ft('inbodyBookings.pickSlot')}</option>
                  {(availableSlots ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.startTime}–{s.endTime} ({s.capacity - s.bookedCount} {ft('inbodyBookings.left')})
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="grid gap-2">
              <Label>{ft('inbodyBookings.staff')}</Label>
              <Input value={form.staffName} onChange={(e) => setForm((f) => ({ ...f, staffName: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>{ft('inbodyBookings.status')}</Label>
                <select className={SELECT_CLS} value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
                  <option value="booked">{ft('inbodyBookings.booked')}</option>
                  <option value="completed">{ft('inbodyBookings.completed')}</option>
                  <option value="cancelled">{ft('inbodyBookings.cancelled')}</option>
                </select>
              </div>
              <div className="grid gap-2">
                <Label>{ft('common.branch')}</Label>
                <select className={SELECT_CLS} value={form.branchId} onChange={(e) => setForm((f) => ({ ...f, branchId: e.target.value }))}>
                  <option value="">—</option>
                  {branchOptions.map((b) => (
                    <option key={b.value} value={b.value}>{b.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>{ft('inbodyBookings.notes')}</Label>
              <Input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{ft('common.cancel')}</Button>
            <Button variant="brand" onClick={() => void save()} disabled={saving}>{ft('common.save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
