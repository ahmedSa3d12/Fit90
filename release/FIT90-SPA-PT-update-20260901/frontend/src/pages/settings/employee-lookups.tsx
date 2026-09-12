import type { ColumnDef } from '@tanstack/react-table';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/common/data-table';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useClubT } from '@/hooks/use-club-t';
import { api, apiError } from '@/lib/api';
import { clientPaginate, useLookups } from '@/lib/api-hooks';
import { confirm } from '@/lib/confirm';
import { useListQuery } from '@/lib/use-list-query';
import { useLocale } from '@/store/locale';

type LookupType = 'nationality' | 'religion' | 'social_status';
type LookupRow = { id: number; title: string };

const LABELS: Record<LookupType, { ar: string; en: string; singularAr: string; singularEn: string }> = {
  nationality: { ar: 'الجنسيات', en: 'Nationalities', singularAr: 'جنسية', singularEn: 'nationality' },
  religion: { ar: 'الديانات', en: 'Religions', singularAr: 'ديانة', singularEn: 'religion' },
  social_status: { ar: 'الحالات الاجتماعية', en: 'Marital Statuses', singularAr: 'حالة اجتماعية', singularEn: 'marital status' },
};

function EmployeeLookupPage({ type }: { type: LookupType }) {
  const ct = useClubT();
  const { isRtl } = useLocale();
  const labels = LABELS[type];
  const title = isRtl ? labels.ar : labels.en;
  const singular = isRtl ? labels.singularAr : labels.singularEn;
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, refetch } = useLookups(type);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const paged = useMemo(
    () => clientPaginate(data ?? [], params, { search: (row, q) => row.title.toLowerCase().includes(q) }),
    [data, params],
  );

  const save = async () => {
    if (!name.trim()) return toast.error(isRtl ? 'الاسم مطلوب' : 'Name is required');
    setSaving(true);
    try {
      if (editId) await api.patch(`/lookups/${type}/${editId}`, { title: name.trim() });
      else await api.post(`/lookups/${type}`, { title: name.trim() });
      toast.success(ct('common.success'));
      setOpen(false);
      void refetch();
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row: LookupRow) => {
    const ok = await confirm({
      title: isRtl ? `حذف ${singular}` : `Delete ${singular}`,
      description: isRtl ? `هل تريد حذف «${row.title}»؟` : `Delete “${row.title}”?`,
      variant: 'destructive',
    });
    if (!ok) return;
    try {
      await api.delete(`/lookups/${type}/${row.id}`);
      toast.success(ct('common.success'));
      void refetch();
    } catch (error) {
      toast.error(apiError(error));
    }
  };

  const columns = useMemo<ColumnDef<LookupRow>[]>(() => [
    { accessorKey: 'title', header: ct('common.name') },
    {
      id: 'actions',
      header: ct('common.actions'),
      cell: ({ row }) => (
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={() => { setEditId(row.original.id); setName(row.original.title); setOpen(true); }}>
            <Pencil className="size-4" /> {ct('common.edit')}
          </Button>
          <Button variant="ghost" size="sm" className="text-destructive" onClick={() => void remove(row.original)}>
            <Trash2 className="size-4" /> {ct('common.delete')}
          </Button>
        </div>
      ),
    },
  ], [ct, isRtl, singular]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        description={isRtl ? `إدارة قائمة ${title} المستخدمة في بيانات الموظفين.` : `Manage the ${title.toLowerCase()} list used in employee records.`}
        actions={<Button variant="brand" onClick={() => { setEditId(null); setName(''); setOpen(true); }}><Plus className="size-4" />{isRtl ? `إضافة ${singular}` : `Add ${singular}`}</Button>}
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
        emptyTitle={isRtl ? 'لا توجد بيانات' : 'No data'}
        enableExport={false}
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{editId ? ct('common.edit') : (isRtl ? `إضافة ${singular}` : `Add ${singular}`)}</DialogTitle></DialogHeader>
          <div className="grid gap-2 py-2"><Label>{ct('common.name')}</Label><Input value={name} onChange={(event) => setName(event.target.value)} /></div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{ct('common.cancel')}</Button>
            <Button variant="brand" disabled={saving} onClick={() => void save()}>{ct(saving ? 'common.saving' : 'common.save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export const NationalitiesSettingsPage = () => <EmployeeLookupPage type="nationality" />;
export const ReligionsSettingsPage = () => <EmployeeLookupPage type="religion" />;
export const SocialStatusesSettingsPage = () => <EmployeeLookupPage type="social_status" />;
