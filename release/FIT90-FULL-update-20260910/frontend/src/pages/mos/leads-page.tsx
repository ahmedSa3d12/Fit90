import type { ColumnDef } from '@tanstack/react-table';
import { useQuery } from '@tanstack/react-query';
import { Pencil, Plus, UserPlus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/common/data-table';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useClubT } from '@/hooks/use-club-t';
import { api, apiError } from '@/lib/api';
import { useArrayResource, usePaginatedList } from '@/lib/api-hooks';
import { mosMenuLabel } from '@/lib/mos-menu-utils';
import { useLocale } from '@/store/locale';
import { useListQuery } from '@/lib/use-list-query';
import { SELECT_CLS } from '../club/fitness/shared';
import { canConvertLead } from './lead-conversion';

type LeadRow = {
  id: number;
  name: string;
  phone?: string | null;
  email?: string | null;
  sourceId?: number | null;
  assignedTo?: number | null;
  status?: string;
  followUpAt?: string | null;
  notes?: string | null;
};

const PIPELINE = [
  { key: 'new', ar: 'جديد', en: 'New' },
  { key: 'contacted', ar: 'تم التواصل', en: 'Contacted' },
  { key: 'qualified', ar: 'مؤهل', en: 'Qualified' },
  { key: 'converted', ar: 'تم التحويل', en: 'Converted' },
  { key: 'lost', ar: 'غير مهتم', en: 'Lost' },
] as const;

const EMPTY = {
  name: '',
  phone: '',
  email: '',
  assignedTo: '',
  sourceId: '',
  status: 'new',
  followUpAt: '',
  notes: '',
};

export function MosLeadsPage() {
  const ct = useClubT();
  const { t, isRtl } = useLocale();
  const title = mosMenuLabel(t, 'potMembers');
  const { params, setParams } = useListQuery({ pageSize: 10 });
  const { data, isLoading, isError, error, refetch } = usePaginatedList<LeadRow>('club-mos/entities/leads', params);
  const { data: salesReps } = useQuery({
    queryKey: ['employees', 'sales-reps'],
    queryFn: async () => {
      const { data: rows } = await api.get<Array<{ id: number; name: string | null }>>('/employees/sales-reps');
      return rows;
    },
  });
  const { data: customerSources } = useArrayResource<{ id: number; name: string }>('club-customer-sources');

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [saving, setSaving] = useState(false);
  const [convertingLeadId, setConvertingLeadId] = useState<number | null>(null);

  const leads = data?.data ?? [];

  const openCreate = () => {
    setEditId(null);
    setForm({ ...EMPTY });
    setOpen(true);
  };

  const openEdit = (lead: LeadRow) => {
    setEditId(lead.id);
    setForm({
      name: lead.name,
      phone: lead.phone ?? '',
      email: lead.email ?? '',
      assignedTo: lead.assignedTo != null ? String(lead.assignedTo) : '',
      sourceId: lead.sourceId != null ? String(lead.sourceId) : '',
      status: lead.status ?? 'new',
      followUpAt: lead.followUpAt ?? '',
      notes: lead.notes ?? '',
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
        phone: form.phone || undefined,
        email: form.email || undefined,
        assignedTo: form.assignedTo ? Number(form.assignedTo) : undefined,
        sourceId: form.sourceId ? Number(form.sourceId) : undefined,
        status: form.status,
        followUpAt: form.followUpAt || undefined,
        notes: form.notes || undefined,
      };
      if (editId) await api.put(`/club-mos/entities/leads/${editId}`, payload);
      else await api.post('/club-mos/entities/leads', payload);
      toast.success(ct('common.success'));
      setOpen(false);
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const statusLabel = (status?: string) => {
    const item = PIPELINE.find((option) => option.key === (status ?? 'new'));
    return item ? (isRtl ? item.ar : item.en) : (status ?? '—');
  };

  const convertLead = async (lead: LeadRow) => {
    if (!canConvertLead(lead)) {
      toast.error(ct('members.leadPhoneRequired'));
      return;
    }

    setConvertingLeadId(lead.id);
    try {
      const { data: duplicates } = await api.get<{ hasDuplicates: boolean }>('/club-members/check-duplicate', {
        params: { phone: lead.phone },
      });
      if (duplicates.hasDuplicates) {
        toast.error(ct('members.duplicatePhoneWarning'));
        return;
      }
      await api.post(`/club-mos/entities/leads/${lead.id}/convert`);
      toast.success(ct('members.leadConverted'));
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setConvertingLeadId(null);
    }
  };

  const columns = useMemo<ColumnDef<LeadRow, unknown>[]>(() => [
    {
      id: 'index',
      header: '#',
      cell: ({ row }) => <span className="nums">{(params.page - 1) * params.pageSize + row.index + 1}</span>,
    },
    { accessorKey: 'name', header: ct('common.name') },
    {
      accessorKey: 'phone',
      header: ct('common.phone'),
      cell: ({ getValue }) => <span className="nums" dir="ltr">{String(getValue() ?? '—')}</span>,
    },
    {
      accessorKey: 'email',
      header: ct('mos.email'),
      cell: ({ getValue }) => <span dir="ltr">{String(getValue() ?? '—')}</span>,
    },
    {
      accessorKey: 'assignedTo',
      header: ct('mos.salesEmployee'),
      cell: ({ getValue }) => {
        const employeeId = Number(getValue());
        return salesReps?.find((employee) => employee.id === employeeId)?.name ?? '—';
      },
    },
    {
      accessorKey: 'sourceId',
      header: ct('mos.knowledgeSource'),
      cell: ({ getValue }) => {
        const sourceId = Number(getValue());
        return customerSources?.find((source) => source.id === sourceId)?.name ?? '—';
      },
    },
    {
      accessorKey: 'status',
      header: ct('common.status'),
      cell: ({ row }) => <span>{statusLabel(row.original.status)}</span>,
    },
    {
      accessorKey: 'followUpAt',
      header: ct('mos.followUp'),
      cell: ({ getValue }) => <span className="nums">{String(getValue() ?? '—')}</span>,
    },
    {
      id: 'actions',
      header: ct('common.actions'),
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1">
          <Button variant="ghost" size="sm" onClick={() => openEdit(row.original)}>
            <Pencil className="size-4" /> {ct('common.edit')}
          </Button>
          {row.original.status !== 'converted' && (
            <Button
              variant="outline"
              size="sm"
              disabled={convertingLeadId === row.original.id}
              onClick={() => void convertLead(row.original)}
            >
              <UserPlus className="size-4" /> {ct('members.convertToMember')}
            </Button>
          )}
        </div>
      ),
    },
  ], [convertingLeadId, ct, customerSources, isRtl, params.page, params.pageSize, salesReps]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        eyebrow={t('nav.sections.club')}
        description={isRtl
          ? 'متابعة الأعضاء المحتملين خلال مراحل التواصل والتحويل إلى عضوية.'
          : 'Track potential members through your sales pipeline.'}
        actions={
          <Button variant="brand" onClick={openCreate}>
            <Plus className="size-4" /> {ct('common.add')}
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={leads}
        total={data?.total ?? 0}
        page={params.page}
        pageSize={params.pageSize}
        onPageChange={(page) => setParams({ page })}
        onPageSizeChange={(pageSize) => setParams({ pageSize, page: 1 })}
        isLoading={isLoading}
        isError={isError}
        errorMessage={apiError(error)}
        onRetry={() => void refetch()}
        search={params.search}
        onSearchChange={(search) => setParams({ search, page: 1 })}
        searchClassName="max-w-none basis-1/2"
        toolbar={
          <div className="basis-1/2 flex-1">
            <select
              className={SELECT_CLS + ' h-9 w-full'}
              value={params.filters.status ?? ''}
              onChange={(e) => setParams({ filters: { status: e.target.value }, page: 1 })}
              aria-label={ct('common.status')}
            >
              <option value="">{isRtl ? 'كل الحالات' : 'All statuses'}</option>
              {PIPELINE.map((item) => (
                <option key={item.key} value={item.key}>{isRtl ? item.ar : item.en}</option>
              ))}
            </select>
          </div>
        }
        emptyTitle={isRtl ? 'لا توجد بيانات' : 'No data'}
        enableExport={false}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editId ? ct('common.edit') : ct('common.add')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>{ct('common.name')} *</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>{ct('common.phone')}</Label>
                <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>{ct('mos.email')}</Label>
                <Input value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>{ct('mos.salesEmployee')}</Label>
                <select
                  className={SELECT_CLS}
                  value={form.assignedTo}
                  onChange={(e) => setForm((f) => ({ ...f, assignedTo: e.target.value }))}
                >
                  <option value="">—</option>
                  {(salesReps ?? []).map((employee) => (
                    <option key={employee.id} value={employee.id}>{employee.name ?? `#${employee.id}`}</option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2">
                <Label>{ct('mos.knowledgeSource')}</Label>
                <select
                  className={SELECT_CLS}
                  value={form.sourceId}
                  onChange={(e) => setForm((f) => ({ ...f, sourceId: e.target.value }))}
                >
                  <option value="">—</option>
                  {(customerSources ?? []).map((source) => (
                    <option key={source.id} value={source.id}>{source.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>{ct('common.status')}</Label>
                <select
                  className={SELECT_CLS}
                  value={form.status}
                  onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                >
                  {PIPELINE.map((p) => (
                    <option key={p.key} value={p.key}>{isRtl ? p.ar : p.en}</option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2">
                <Label>{ct('mos.followUp')}</Label>
                <Input type="date" value={form.followUpAt} onChange={(e) => setForm((f) => ({ ...f, followUpAt: e.target.value }))} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>{ct('common.notes')}</Label>
              <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={3} />
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
