import type { ColumnDef } from '@tanstack/react-table';
import { Plus, PackageCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/common/data-table';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useBranches } from '@/hooks/use-branches';
import { useClubT } from '@/hooks/use-club-t';
import { api, apiError } from '@/lib/api';
import { useMutationWithToast, usePaginatedList } from '@/lib/api-hooks';
import { confirm } from '@/lib/confirm';
import { useListQuery } from '@/lib/use-list-query';
import { useAuth } from '@/store/auth';
import { useLocale } from '@/store/locale';
import { RowActions, SELECT_CLS } from './fitness/shared';

export interface LostFoundRow {
  id: number;
  itemName: string;
  description: string | null;
  staffName: string | null;
  foundDate: string;
  foundTime: string | null;
  actionTaken: string | null;
  branchId: number | null;
  status: 'stored' | 'delivered';
  deliveredTo: string | null;
  deliveredPhone: string | null;
  deliveredAt: string | null;
  deliveredNote: string | null;
  ageDays: number | null;
  isStale: boolean;
}

const EMPTY_FORM = {
  itemName: '',
  description: '',
  staffName: '',
  foundDate: '',
  foundTime: '',
  actionTaken: '',
  branchId: '',
};

function resolveBranchName(
  branches: { id: number; name: string | null }[] | undefined,
  branchId: number,
): string {
  if (!branchId) return '—';
  return branches?.find((b) => b.id === branchId)?.name?.trim() || (branches === undefined ? '…' : '—');
}

export function LostFoundPage() {
  const ct = useClubT();
  const { isRtl } = useLocale();
  const { user } = useAuth();
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, refetch } = usePaginatedList<LostFoundRow>('lost-found', params);
  const { data: branches } = useBranches();

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });

  const formBranchName = useMemo(
    () => resolveBranchName(branches, form.branchId ? Number(form.branchId) : 0),
    [branches, form.branchId],
  );

  const [deliverRow, setDeliverRow] = useState<LostFoundRow | null>(null);
  const [detailsRow, setDetailsRow] = useState<LostFoundRow | null>(null);
  const [deliverForm, setDeliverForm] = useState({ deliveredTo: '', deliveredPhone: '', deliveredNote: '' });
  const [delivering, setDelivering] = useState(false);

  const deleteMutation = useMutationWithToast(
    (id: number) => api.delete(`/lost-found/${id}`),
    { success: ct('common.success'), invalidate: ['lost-found'] },
  );

  const lockedBranchId = user?.branch && user.branch > 0 ? user.branch : (branches?.[0]?.id ?? 0);
  const lockedStaffName = user?.name?.trim() || '';

  const openCreate = () => {
    setEditId(null);
    setForm({
      ...EMPTY_FORM,
      staffName: lockedStaffName,
      branchId: lockedBranchId ? String(lockedBranchId) : '',
    });
    setOpen(true);
  };

  const openEdit = (row: LostFoundRow) => {
    setEditId(row.id);
    setForm({
      itemName: row.itemName,
      description: row.description ?? '',
      staffName: row.staffName || lockedStaffName,
      foundDate: row.foundDate,
      foundTime: row.foundTime ?? '',
      actionTaken: row.actionTaken ?? '',
      branchId: row.branchId != null ? String(row.branchId) : (lockedBranchId ? String(lockedBranchId) : ''),
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.itemName.trim() || !form.foundDate) {
      toast.error(ct('lostFound.itemRequired'));
      return;
    }
    setSaving(true);
    try {
      const branchId = form.branchId ? Number(form.branchId) : lockedBranchId || undefined;
      const payload = {
        itemName: form.itemName.trim(),
        description: form.description || undefined,
        staffName: form.staffName || lockedStaffName || undefined,
        foundDate: form.foundDate,
        foundTime: form.foundTime || undefined,
        actionTaken: form.actionTaken || undefined,
        branchId,
      };
      if (editId) await api.put(`/lost-found/${editId}`, payload);
      else await api.post('/lost-found', payload);
      toast.success(ct('common.success'));
      setOpen(false);
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const openDeliver = (row: LostFoundRow) => {
    setDeliverRow(row);
    setDeliverForm({ deliveredTo: '', deliveredPhone: '', deliveredNote: '' });
  };

  const submitDeliver = async () => {
    if (!deliverRow) return;
    if (!deliverForm.deliveredTo.trim()) {
      toast.error(ct('lostFound.recipientRequired'));
      return;
    }
    setDelivering(true);
    try {
      await api.patch(`/lost-found/${deliverRow.id}/deliver`, {
        deliveredTo: deliverForm.deliveredTo.trim(),
        deliveredPhone: deliverForm.deliveredPhone || undefined,
        deliveredNote: deliverForm.deliveredNote || undefined,
      });
      toast.success(ct('common.success'));
      setDeliverRow(null);
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setDelivering(false);
    }
  };

  const columns = useMemo<ColumnDef<LostFoundRow>[]>(
    () => [
      { accessorKey: 'itemName', header: ct('lostFound.item') },
      { accessorKey: 'staffName', header: ct('lostFound.staff'), cell: ({ getValue }) => (getValue() as string) || '—' },
      { accessorKey: 'foundDate', header: ct('lostFound.date') },
      { accessorKey: 'foundTime', header: ct('lostFound.time'), cell: ({ getValue }) => (getValue() as string) || '—' },
      {
        accessorKey: 'ageDays',
        header: ct('lostFound.age'),
        cell: ({ row }) => {
          const days = row.original.ageDays;
          return (
            <div className="flex items-center gap-1.5">
              <span className="nums">{days != null ? ct('lostFound.days', { count: days }) : '—'}</span>
              {row.original.isStale && (
                <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                  {ct('lostFound.stale')}
                </span>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: 'status',
        header: ct('lostFound.status'),
        cell: ({ getValue }) => {
          const s = getValue() as string;
          return (
            <span
              className={
                'inline-flex rounded-full px-2 py-0.5 text-xs font-medium ' +
                (s === 'delivered' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700')
              }
            >
              {s === 'delivered' ? ct('lostFound.delivered') : ct('lostFound.stored')}
            </span>
          );
        },
      },
      {
        id: 'actions',
        header: ct('common.actions'),
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            {row.original.status !== 'delivered' && (
              <Button variant="ghost" size="sm" onClick={() => openDeliver(row.original)} title={ct('lostFound.deliver')}>
                <PackageCheck className="size-4" />
              </Button>
            )}
            <RowActions
              detailsLabel={ct('lostFound.details')}
              editLabel={ct('common.edit')}
              deleteLabel={ct('common.delete')}
              onDetails={() => setDetailsRow(row.original)}
              onEdit={() => openEdit(row.original)}
              onDelete={() =>
                void confirm({ title: ct('lostFound.deleteConfirm'), variant: 'destructive' }).then((ok) => {
                  if (ok) deleteMutation.mutate(row.original.id);
                })
              }
            />
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deleteMutation, ct],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={ct('lostFound.title')}
        actions={
          <Button variant="brand" onClick={openCreate}>
            <Plus className="size-4" /> {ct('lostFound.newItem')}
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
        searchPlaceholder={ct('lostFound.searchPlaceholder')}
        searchClassName="min-w-[320px] max-w-xl"
        toolbar={
          <select
            className={SELECT_CLS + ' h-9 !w-[190px] shrink-0'}
            value={params.filters.status ?? ''}
            onChange={(event) => setParams({ filters: { status: event.target.value }, page: 1 })}
            aria-label={ct('lostFound.status')}
          >
            <option value="">{ct('lostFound.allStatuses')}</option>
            <option value="stored">{ct('lostFound.stored')}</option>
            <option value="delivered">{ct('lostFound.delivered')}</option>
          </select>
        }
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
        emptyTitle={ct('lostFound.empty')}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{editId ? ct('common.edit') : ct('lostFound.newItem')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-2">
              <Label>{ct('lostFound.item')}</Label>
              <Input value={form.itemName} onChange={(e) => setForm((f) => ({ ...f, itemName: e.target.value }))} />
            </div>
            <div className="grid gap-2">
              <Label>{ct('lostFound.description')}</Label>
              <Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>{ct('lostFound.date')}</Label>
                <Input type="date" value={form.foundDate} onChange={(e) => setForm((f) => ({ ...f, foundDate: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>{ct('lostFound.time')}</Label>
                <Input type="time" value={form.foundTime} onChange={(e) => setForm((f) => ({ ...f, foundTime: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>{ct('lostFound.staff')}</Label>
                <Input className="bg-muted" value={form.staffName || lockedStaffName || '—'} readOnly />
              </div>
              <div className="grid gap-2">
                <Label>{ct('lostFound.branch')}</Label>
                <Input className="bg-muted" value={formBranchName} readOnly />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>{ct('lostFound.actionTaken')}</Label>
              <Input value={form.actionTaken} onChange={(e) => setForm((f) => ({ ...f, actionTaken: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{ct('common.cancel')}</Button>
            <Button variant="brand" onClick={() => void save()} disabled={saving}>{ct('common.save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={detailsRow != null} onOpenChange={(openDetails) => !openDetails && setDetailsRow(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{ct('lostFound.details')}{detailsRow ? ` — ${detailsRow.itemName}` : ''}</DialogTitle>
          </DialogHeader>
          {detailsRow && (() => {
            const deliveredAt = detailsRow.deliveredAt ? new Date(detailsRow.deliveredAt) : null;
            const hasValidDeliveryDate = deliveredAt != null && !Number.isNaN(deliveredAt.getTime());
            const detail = (label: string, value: string | number | null | undefined, wide = false) => (
              <div className={`grid gap-1 rounded-lg border border-border/70 bg-muted/20 p-3 ${wide ? 'sm:col-span-2' : ''}`}>
                <span className="text-xs font-medium text-muted-foreground">{label}</span>
                <span className="whitespace-pre-wrap text-sm">{value == null || value === '' ? '—' : String(value)}</span>
              </div>
            );
            return (
              <div className="space-y-5 py-2">
                <div className="grid gap-3 sm:grid-cols-2">
                  {detail(ct('lostFound.item'), detailsRow.itemName)}
                  {detail(ct('lostFound.status'), detailsRow.status === 'delivered' ? ct('lostFound.delivered') : ct('lostFound.stored'))}
                  {detail(ct('lostFound.description'), detailsRow.description, true)}
                  {detail(ct('lostFound.staff'), detailsRow.staffName)}
                  {detail(ct('lostFound.branch'), resolveBranchName(branches, detailsRow.branchId ?? 0))}
                  {detail(ct('lostFound.date'), detailsRow.foundDate)}
                  {detail(ct('lostFound.time'), detailsRow.foundTime)}
                  {detail(ct('lostFound.actionTaken'), detailsRow.actionTaken, true)}
                </div>

                {detailsRow.status === 'delivered' && (
                  <section className="space-y-3 rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4">
                    <h3 className="font-semibold text-emerald-700 dark:text-emerald-300">{ct('lostFound.deliveryDetails')}</h3>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {detail(ct('lostFound.deliveredTo'), detailsRow.deliveredTo)}
                      {detail(ct('lostFound.phone'), detailsRow.deliveredPhone)}
                      {detail(
                        ct('lostFound.deliveryDate'),
                        hasValidDeliveryDate ? deliveredAt.toLocaleDateString(isRtl ? 'ar-EG' : 'en-CA') : detailsRow.deliveredAt,
                      )}
                      {detail(
                        ct('lostFound.deliveryTime'),
                        hasValidDeliveryDate ? deliveredAt.toLocaleTimeString(isRtl ? 'ar-EG' : 'en-US', { hour: '2-digit', minute: '2-digit' }) : null,
                      )}
                      {detail(ct('lostFound.deliveryNote'), detailsRow.deliveredNote, true)}
                    </div>
                  </section>
                )}
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailsRow(null)}>{ct('common.close')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deliverRow} onOpenChange={(o) => !o && setDeliverRow(null)}>
        <DialogContent className="sm:max-w-md" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{ct('lostFound.deliver')}{deliverRow ? ` — ${deliverRow.itemName}` : ''}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-2">
              <Label>{ct('lostFound.deliveredTo')}</Label>
              <Input value={deliverForm.deliveredTo} onChange={(e) => setDeliverForm((f) => ({ ...f, deliveredTo: e.target.value }))} />
            </div>
            <div className="grid gap-2">
              <Label>{ct('lostFound.phone')}</Label>
              <Input value={deliverForm.deliveredPhone} onChange={(e) => setDeliverForm((f) => ({ ...f, deliveredPhone: e.target.value }))} />
            </div>
            <div className="grid gap-2">
              <Label>{ct('lostFound.note')}</Label>
              <Input value={deliverForm.deliveredNote} onChange={(e) => setDeliverForm((f) => ({ ...f, deliveredNote: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeliverRow(null)}>{ct('common.cancel')}</Button>
            <Button variant="brand" onClick={() => void submitDeliver()} disabled={delivering}>{ct('lostFound.confirmDelivery')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
