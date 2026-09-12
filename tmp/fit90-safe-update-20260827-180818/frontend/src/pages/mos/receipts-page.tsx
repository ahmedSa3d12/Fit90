import type { ColumnDef } from '@tanstack/react-table';
import { useQuery } from '@tanstack/react-query';
import { Plus, Receipt } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/common/data-table';
import { PageHeader } from '@/components/common/page-header';
import { StatCard } from '@/components/common/stat-card';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useClubT } from '@/hooks/use-club-t';
import { api, apiError } from '@/lib/api';
import { useMutationWithToast, usePaginatedList } from '@/lib/api-hooks';
import { confirm } from '@/lib/confirm';
import { mosMenuLabel } from '@/lib/mos-menu-utils';
import { useLocale } from '@/store/locale';
import { useListQuery } from '@/lib/use-list-query';
import { RowActions, SELECT_CLS } from '../club/fitness/shared';

interface ReceiptRow {
  id: number;
  receiptNumber: string;
  memberName: string;
  amount: number;
  receiptDate: string;
  paymentMethod: string | null;
  status: string;
  description: string | null;
}

interface ReceiptStats {
  total: number;
  paid: number;
  pending: number;
  totalAmount: number;
}

const EMPTY = {
  memberName: '',
  amount: '',
  receiptDate: new Date().toISOString().slice(0, 10),
  paymentMethod: 'cash',
  description: '',
};

export function MosReceiptsPage() {
  const ct = useClubT();
  const { t } = useLocale();
  const title = mosMenuLabel(t, 'receipts');
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, refetch } = usePaginatedList<ReceiptRow>('club-receipts', params);

  const { data: stats } = useQuery({
    queryKey: ['club-receipts', 'statistics'],
    queryFn: async () => {
      const { data: s } = await api.get<ReceiptStats>('/club-receipts/statistics');
      return s;
    },
  });

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ ...EMPTY });

  const deleteMutation = useMutationWithToast(
    (id: number) => api.delete(`/club-receipts/${id}`),
    { success: ct('common.success'), invalidate: ['club-receipts'] },
  );

  const columns = useMemo<ColumnDef<ReceiptRow>[]>(
    () => [
      { accessorKey: 'receiptNumber', header: '#' },
      { accessorKey: 'memberName', header: ct('common.customer') },
      { accessorKey: 'amount', header: ct('common.amount') },
      { accessorKey: 'receiptDate', header: ct('common.dateFrom') },
      { accessorKey: 'paymentMethod', header: 'Method', cell: ({ getValue }) => getValue() ?? '—' },
      { accessorKey: 'status', header: ct('common.status') },
      {
        id: 'actions',
        header: ct('common.actions'),
        cell: ({ row }) => (
          <RowActions
            editLabel={ct('common.edit')}
            deleteLabel={ct('common.delete')}
            onEdit={() => {
              setEditId(row.original.id);
              setForm({
                memberName: row.original.memberName,
                amount: String(row.original.amount),
                receiptDate: row.original.receiptDate,
                paymentMethod: row.original.paymentMethod ?? 'cash',
                description: row.original.description ?? '',
              });
              setOpen(true);
            }}
            onDelete={() => {
              void confirm({ title: ct('common.delete'), description: ct('common.confirmDelete') }).then((ok) => {
                if (ok) deleteMutation.mutate(row.original.id);
              });
            }}
          />
        ),
      },
    ],
    [ct, deleteMutation],
  );

  const save = async () => {
    if (!form.memberName.trim() || !form.amount) {
      toast.error(ct('members.fillRequired'));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        memberName: form.memberName.trim(),
        amount: Number(form.amount),
        receiptDate: form.receiptDate,
        paymentMethod: form.paymentMethod as 'cash' | 'card' | 'bank' | 'online',
        description: form.description || undefined,
      };
      if (editId) await api.put(`/club-receipts/${editId}`, payload);
      else await api.post('/club-receipts', payload);
      toast.success(ct('common.success'));
      setOpen(false);
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        eyebrow={t('nav.sections.club')}
        actions={
          <Button variant="brand" onClick={() => { setEditId(null); setForm({ ...EMPTY }); setOpen(true); }}>
            <Plus className="size-4" /> {ct('common.add')}
          </Button>
        }
      />
      {stats && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard title={ct('mos.totalReceipts')} value={stats.total} icon={<Receipt className="size-5" />} />
          <StatCard title={ct('mos.paid')} value={stats.paid} />
          <StatCard title={ct('mos.pending')} value={stats.pending} />
          <StatCard title={ct('mos.amountMonth')} value={stats.totalAmount.toLocaleString()} />
        </div>
      )}
      <Card className="overflow-hidden shadow-sm">
        <div className="h-0.5 bg-gradient-to-l from-amber-500/60 via-primary to-emerald-500/40" />
        <CardContent className="pt-6">
          <DataTable
            columns={columns}
            data={data?.data ?? []}
            total={data?.total ?? 0}
            page={params.page}
            pageSize={params.pageSize}
            onPageChange={(p) => setParams({ page: p })}
            onPageSizeChange={(s) => setParams({ pageSize: s, page: 1 })}
            search={params.search}
            onSearchChange={(s) => setParams({ search: s, page: 1 })}
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
              <Label>{ct('common.customer')} *</Label>
              <Input value={form.memberName} onChange={(e) => setForm((f) => ({ ...f, memberName: e.target.value }))} />
            </div>
            <div className="grid gap-2">
              <Label>{ct('common.amount')} *</Label>
              <Input type="number" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
            </div>
            <div className="grid gap-2">
              <Label>{ct('common.dateFrom')}</Label>
              <Input type="date" value={form.receiptDate} onChange={(e) => setForm((f) => ({ ...f, receiptDate: e.target.value }))} />
            </div>
            <div className="grid gap-2">
              <Label>{ct('mos.payment')}</Label>
              <select className={SELECT_CLS} value={form.paymentMethod} onChange={(e) => setForm((f) => ({ ...f, paymentMethod: e.target.value }))}>
                <option value="cash">{ct('mos.cash')}</option>
                <option value="card">{ct('mos.card')}</option>
                <option value="bank">{ct('mos.bank')}</option>
                <option value="online">{ct('mos.online')}</option>
              </select>
            </div>
            <div className="grid gap-2">
              <Label>{ct('common.notes')}</Label>
              <Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{ct('common.cancel')}</Button>
            <Button variant="brand" disabled={saving} onClick={() => void save()}>{saving ? ct('common.saving') : ct('common.save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
