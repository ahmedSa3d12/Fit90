import type { CellContext, ColumnDef } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/common/data-table';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useClubT } from '@/hooks/use-club-t';
import { api, apiError } from '@/lib/api';
import { clientPaginate, useArrayResource, useMutationWithToast } from '@/lib/api-hooks';
import { confirm } from '@/lib/confirm';
import { formatNum } from '@/lib/formatters';
import { mosMenuLabel } from '@/lib/mos-menu-utils';
import { useLocale } from '@/store/locale';
import { useListQuery } from '@/lib/use-list-query';
import { RowActions } from '../club/fitness/shared';
import type { MosLookupRouteConfig } from './route-config';

interface LookupRow {
  id: number;
  name: string;
  nameEn?: string | null;
  code?: string | null;
  sortOrder?: number;
  isActive?: boolean;
  price?: number;
}

export function MosLookupPage({ config }: { config: MosLookupRouteConfig }) {
  const ct = useClubT();
  const { t, isRtl, locale } = useLocale();
  const title = mosMenuLabel(t, config.titleKey);
  const nameLabel = config.nameLabelKey ? t(config.nameLabelKey) : ct('common.name');
  const resource = `club-mos/lookups/${config.category}`;
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, refetch } = useArrayResource<LookupRow>(resource);

  const paged = useMemo(
    () =>
      clientPaginate(data ?? [], params, {
        search: (row, q) =>
          (row.name ?? '').toLowerCase().includes(q) ||
          (row.nameEn ?? '').toLowerCase().includes(q),
      }),
    [data, params],
  );

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', nameEn: '', code: '', price: '' });

  const deleteMutation = useMutationWithToast(
    (id: number) => api.delete(`/club-mos/lookups/${config.category}/${id}`),
    { success: ct('common.success'), invalidate: [resource] },
  );

  const columns = useMemo<ColumnDef<LookupRow>[]>(
    () => [
      { accessorKey: 'name', header: nameLabel },
      { accessorKey: 'nameEn', header: 'English', cell: ({ getValue }: CellContext<LookupRow, unknown>) => getValue() ?? '—' },
      { accessorKey: 'code', header: 'Code', cell: ({ getValue }: CellContext<LookupRow, unknown>) => getValue() ?? '—' },
      {
        accessorKey: 'price',
        header: isRtl ? 'السعر' : 'Price',
        cell: ({ getValue }: CellContext<LookupRow, unknown>) => formatNum(Number(getValue() ?? 0), locale),
      },
      {
        id: 'actions',
        header: ct('common.actions'),
        cell: ({ row }: CellContext<LookupRow, unknown>) => (
          <RowActions
            inline={config.nameOnly}
            editLabel={ct('common.edit')}
            deleteLabel={ct('common.delete')}
            onEdit={() => {
              setEditId(row.original.id);
              setForm({
                name: row.original.name,
                nameEn: row.original.nameEn ?? '',
                code: row.original.code ?? '',
                price: String(row.original.price ?? ''),
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
    ].filter(
      (column) => {
        if (!('accessorKey' in column)) return true;
        if (column.accessorKey === 'price') return Boolean(config.hasPrice);
        return !config.nameOnly || column.accessorKey === 'name';
      },
    ),
    [ct, config.hasPrice, config.nameOnly, deleteMutation, isRtl, locale, nameLabel],
  );

  const save = async () => {
    if (!form.name.trim()) {
      toast.error(ct('members.fillRequired'));
      return;
    }
    if (config.hasPrice && form.price.trim() !== '' && (!Number.isFinite(Number(form.price)) || Number(form.price) < 0)) {
      toast.error(isRtl ? 'يرجى إدخال سعر صحيح' : 'Please enter a valid price');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        ...(!config.nameOnly && {
          nameEn: form.nameEn.trim() || undefined,
          code: form.code.trim() || undefined,
        }),
        ...(config.hasPrice && { price: Number(form.price || 0) }),
      };
      if (editId) await api.put(`/club-mos/lookups/${config.category}/${editId}`, payload);
      else await api.post(`/club-mos/lookups/${config.category}`, payload);
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
        description={t('nav.mos.dataList')}
        eyebrow={t('nav.sections.club')}
        actions={
          <Button
            variant="brand"
            onClick={() => {
              setEditId(null);
              setForm({ name: '', nameEn: '', code: '', price: '' });
              setOpen(true);
            }}
          >
            <Plus className="size-4" /> {ct('common.add')}
          </Button>
        }
      />
      <Card className="overflow-hidden border-border/60 shadow-sm">
        <div className="h-0.5 bg-gradient-to-l from-violet-500/60 via-primary to-emerald-500/40" />
        <CardContent className="pt-6">
          <DataTable
            columns={columns}
            data={paged.data}
            total={paged.total}
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
          <DialogHeader>
            <DialogTitle>{editId ? ct('common.edit') : ct('common.add')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>{nameLabel} *</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            {!config.nameOnly && (
              <>
                <div className="grid gap-2">
                  <Label>{ct('mos.english')}</Label>
                  <Input value={form.nameEn} onChange={(e) => setForm((f) => ({ ...f, nameEn: e.target.value }))} />
                </div>
                <div className="grid gap-2">
                  <Label>{ct('mos.code')}</Label>
                  <Input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} />
                </div>
              </>
            )}
            {config.hasPrice && (
              <div className="grid gap-2">
                <Label>{isRtl ? 'السعر' : 'Price'}</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.price}
                  onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                />
              </div>
            )}
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
