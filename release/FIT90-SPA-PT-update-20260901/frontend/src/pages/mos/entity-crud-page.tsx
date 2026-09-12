import type { ColumnDef } from '@tanstack/react-table';
import { useQuery } from '@tanstack/react-query';
import { FileText, Loader2, Plus, Search, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { DataTable } from '@/components/common/data-table';
import { PageHeader } from '@/components/common/page-header';
import { StatCard } from '@/components/common/stat-card';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useClubT } from '@/hooks/use-club-t';
import { api, apiError } from '@/lib/api';
import { useMutationWithToast, usePaginatedList } from '@/lib/api-hooks';
import { confirm } from '@/lib/confirm';
import { mosMenuLabel } from '@/lib/mos-menu-utils';
import { useLocale } from '@/store/locale';
import { useListQuery } from '@/lib/use-list-query';
import { UploadField } from '@/components/employees/upload-fields';
import { RowActions, SELECT_CLS } from '../club/fitness/shared';
import type { MosEntityRouteConfig, MosFieldDef } from './route-config';

type Row = Record<string, unknown> & { id: number };
type PersonSearchResult = {
  key: string;
  name: string;
  phone: string;
  source: 'member' | 'lead';
};

function CallMemberSearch({
  value,
  onChange,
  onSelect,
  isRtl,
}: {
  value: string;
  onChange: (value: string) => void;
  onSelect: (name: string, phone: string) => void;
  isRtl: boolean;
}) {
  const [results, setResults] = useState<PersonSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const skipNextSearch = useRef(false);

  useEffect(() => {
    if (skipNextSearch.current) {
      skipNextSearch.current = false;
      return;
    }
    const query = value.trim();
    if (query.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    const timer = window.setTimeout(() => {
      setLoading(true);
      void Promise.all([
        api.get<{ hits?: Array<{ id: number; name: string; phone?: string | null }> } | Array<{ id: number; name: string; phone?: string | null }>>('/club/search', { params: { q: query } }),
        api.get<{ data: Array<{ id: number; name: string; phone?: string | null }> }>('/club-mos/entities/leads', { params: { search: query, page: 1, pageSize: 8 } }),
      ]).then(([membersResponse, leadsResponse]) => {
        const memberData = Array.isArray(membersResponse.data)
          ? membersResponse.data
          : (membersResponse.data.hits ?? []);
        const members = memberData.map((item) => ({
          key: `member-${item.id}`,
          name: item.name,
          phone: item.phone ?? '',
          source: 'member' as const,
        }));
        const leads = (leadsResponse.data.data ?? []).map((item) => ({
          key: `lead-${item.id}`,
          name: item.name,
          phone: item.phone ?? '',
          source: 'lead' as const,
        }));
        const combined = [...members, ...leads].filter(
          (item, index, all) => all.findIndex((candidate) => candidate.name === item.name && candidate.phone === item.phone) === index,
        );
        setResults(combined);
        setOpen(combined.length > 0);
      }).catch(() => {
        setResults([]);
        setOpen(false);
      }).finally(() => setLoading(false));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [value]);

  return (
    <div className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          className="ps-9 pe-9"
          placeholder={isRtl ? 'ابحث باسم العضو أو رقم الهاتف…' : 'Search members or leads…'}
          autoComplete="off"
        />
        {loading && <Loader2 className="absolute end-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
      </div>
      {open && (
        <div className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border bg-popover p-1 shadow-lg">
          {results.map((result) => (
            <button
              key={result.key}
              type="button"
              className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-start hover:bg-muted"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                skipNextSearch.current = true;
                onSelect(result.name, result.phone);
                setOpen(false);
              }}
            >
              <span>
                <span className="block text-sm font-medium">{result.name}</span>
                <span className="nums block text-xs text-muted-foreground" dir="ltr">{result.phone || '—'}</span>
              </span>
              <span className="rounded-full bg-muted px-2 py-1 text-[11px] text-muted-foreground">
                {result.source === 'member'
                  ? (isRtl ? 'عضو بالنظام' : 'System member')
                  : (isRtl ? 'عضو محتمل' : 'Potential member')}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function emptyForm(fields: MosFieldDef[]): Record<string, string> {
  return Object.fromEntries(fields.map((f) => [f.key, '']));
}

function FieldInput({
  field,
  value,
  onChange,
  label,
}: {
  field: MosFieldDef;
  value: string;
  onChange: (v: string) => void;
  label: string;
}) {
  if (field.type === 'textarea') {
    return <Textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} />;
  }
  if (field.type === 'select' && field.options) {
    return (
      <select className={SELECT_CLS} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {field.options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    );
  }
  if (field.type === 'image' || field.type === 'file') {
    return (
      <UploadField
        category="club-content"
        value={value || null}
        onChange={(path) => onChange(path ?? '')}
        accept={field.type === 'image' ? 'image/*' : 'image/*,.pdf,.doc,.docx'}
        preview={field.type === 'image'}
        label={label}
      />
    );
  }
  return (
    <Input
      type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : field.type === 'time' ? 'time' : 'text'}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={label}
    />
  );
}

export function MosEntityCrudPage({ config }: { config: MosEntityRouteConfig }) {
  const ct = useClubT();
  const { t, isRtl } = useLocale();
  const { pathname } = useLocation();
  const title = mosMenuLabel(t, config.titleKey);
  const resource = `club-mos/entities/${config.entityKey}`;
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, refetch } = usePaginatedList<Row>(resource, params);
  const dateFilters = config.entityKey === 'expenses'
    ? {
        dateFrom: params.filters.dateFrom || undefined,
        dateTo: params.filters.dateTo || undefined,
      }
    : {};

  const { data: stats } = useQuery({
    queryKey: [resource, 'statistics', dateFilters],
    queryFn: async () => {
      const { data: s } = await api.get<{ total: number; byStatus: Record<string, number> }>(
        `/club-mos/entities/${config.entityKey}/statistics`,
        { params: dateFilters },
      );
      return s;
    },
  });

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(() => emptyForm(config.fields));
  const [detailsRow, setDetailsRow] = useState<Row | null>(null);

  const deleteMutation = useMutationWithToast(
    (id: number) => api.delete(`/club-mos/entities/${config.entityKey}/${id}`),
    { success: ct('common.success'), invalidate: [resource] },
  );

  const listColumns = useMemo(() => {
    const keys = config.fields.slice(0, 5).map((f) => f.key);
    if (!keys.includes('status') && config.fields.some((f) => f.key === 'status')) keys.push('status');
    return keys;
  }, [config.fields]);

  const columns = useMemo<ColumnDef<Row>[]>(
    () => [
      ...listColumns.map((key) => ({
        accessorKey: key,
        header: (() => {
          const field = config.fields.find((item) => item.key === key);
          return field?.labelKey
            ? ct(field.labelKey)
            : key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase());
        })(),
        cell: ({ getValue }: { getValue: () => unknown }) => {
          const v = getValue();
          if (v == null || v === '') return '—';
          if (key === 'imageUrl' && typeof v === 'string') {
            const url = v.startsWith('http') || v.startsWith('/') ? v : `/uploads/${v}`;
            if (!/\.(?:jpe?g|png|gif|webp|svg)(?:$|\?)/i.test(url)) {
              return (
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-primary hover:underline"
                >
                  <FileText className="size-4" />
                  {ct('common.view')}
                </a>
              );
            }
            return (
              <img src={url} alt="" className="size-10 rounded-md border object-cover" />
            );
          }
          if (typeof v === 'object') return JSON.stringify(v);
          return String(v);
        },
      })),
      {
        id: 'actions',
        header: ct('common.actions'),
        cell: ({ row }) => (
          <RowActions
            detailsLabel={isRtl ? 'تفاصيل' : 'Details'}
            editLabel={ct('common.edit')}
            deleteLabel={ct('common.delete')}
            onDetails={config.entityKey === 'calls' ? () => setDetailsRow(row.original) : undefined}
            onEdit={() => openEdit(row.original)}
            onDelete={() => {
              void confirm({
                title: ct('common.delete'),
                description: ct('common.confirmDelete'),
              }).then((ok) => {
                if (ok) deleteMutation.mutate(row.original.id);
              });
            }}
          />
        ),
      },
    ],
    [listColumns, ct, deleteMutation, config.entityKey, config.fields, isRtl],
  );

  const callFieldLabels: Record<string, string> = isRtl
    ? {
        memberName: 'اسم العضو', phone: 'رقم الهاتف', callDate: 'تاريخ المكالمة',
        callTime: 'وقت المكالمة', subject: 'موضوع المكالمة', outcome: 'نتيجة المكالمة',
        staffName: 'الموظف', notes: 'الملاحظات',
      }
    : {
        memberName: 'Member name', phone: 'Phone', callDate: 'Call date',
        callTime: 'Call time', subject: 'Subject', outcome: 'Outcome',
        staffName: 'Staff member', notes: 'Notes',
      };

  const openCreate = () => {
    setEditId(null);
    setForm(emptyForm(config.fields));
    setOpen(true);
  };

  const openEdit = (row: Row) => {
    setEditId(row.id);
    const next = emptyForm(config.fields);
    for (const f of config.fields) {
      const v = row[f.key];
      next[f.key] = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    }
    setForm(next);
    setOpen(true);
  };

  const save = async () => {
    for (const f of config.fields) {
      if (f.required && !form[f.key]?.trim()) {
        toast.error(ct('members.fillRequired'));
        return;
      }
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {};
      for (const f of config.fields) {
        const raw = form[f.key]?.trim();
        if (!raw) continue;
        if (f.type === 'number') payload[f.key] = Number(raw);
        else if (f.type === 'json') {
          try {
            payload[f.key] = JSON.parse(raw);
          } catch {
            toast.error(ct('mos.invalidJsonConfig'));
            setSaving(false);
            return;
          }
        } else payload[f.key] = raw;
      }
      if (editId) await api.put(`/club-mos/entities/${config.entityKey}/${editId}`, payload);
      else await api.post(`/club-mos/entities/${config.entityKey}`, payload);
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
        eyebrow={pathname.startsWith('/app/') ? t('nav.sections.app-management') : t('nav.sections.club')}
        actions={
          <Button variant="brand" onClick={openCreate}>
            <Plus className="size-4" /> {ct('common.add')}
          </Button>
        }
      />

      {stats && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard title={ct('mos.total')} value={stats.total} icon={<Sparkles className="size-5" />} />
          {Object.entries(stats.byStatus).slice(0, 3).map(([k, v]) => (
            <StatCard key={k} title={k} value={v} />
          ))}
        </div>
      )}

      <Card className="overflow-hidden border-border/60 shadow-sm">
        <div className="h-0.5 bg-gradient-to-l from-primary/50 via-primary to-primary/30" />
        <CardContent className="pt-6">
          {config.entityKey === 'expenses' && (
            <div className="mb-6 grid gap-4 rounded-xl border border-border/60 bg-muted/20 p-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="expenses-date-from">{ct('common.dateFrom')}</Label>
                <Input
                  id="expenses-date-from"
                  type="date"
                  dir="ltr"
                  value={params.filters.dateFrom ?? ''}
                  max={params.filters.dateTo || undefined}
                  onChange={(event) => setParams({
                    page: 1,
                    filters: { dateFrom: event.target.value },
                  })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="expenses-date-to">{ct('common.dateTo')}</Label>
                <Input
                  id="expenses-date-to"
                  type="date"
                  dir="ltr"
                  value={params.filters.dateTo ?? ''}
                  min={params.filters.dateFrom || undefined}
                  onChange={(event) => setParams({
                    page: 1,
                    filters: { dateTo: event.target.value },
                  })}
                />
              </div>
            </div>
          )}
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
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editId ? ct('common.edit') : ct('common.add')} — {title}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            {config.fields.map((f) => {
              const fieldLabel = f.labelKey
                ? ct(f.labelKey)
                : f.key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase());
              return (
                <div key={f.key} className="grid gap-2">
                  <Label>
                    {fieldLabel}
                    {f.required ? ' *' : ''}
                  </Label>
                  {config.entityKey === 'calls' && f.key === 'memberName' ? (
                    <CallMemberSearch
                      value={form.memberName ?? ''}
                      isRtl={isRtl}
                      onChange={(memberName) => setForm((prev) => ({ ...prev, memberName }))}
                      onSelect={(memberName, phone) => setForm((prev) => ({ ...prev, memberName, phone }))}
                    />
                  ) : (
                    <FieldInput
                      field={f}
                      value={form[f.key] ?? ''}
                      onChange={(v) => setForm((prev) => ({ ...prev, [f.key]: v }))}
                      label={fieldLabel}
                    />
                  )}
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{ct('common.cancel')}</Button>
            <Button variant="brand" disabled={saving} onClick={() => void save()}>
              {saving ? ct('common.saving') : ct('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={detailsRow != null} onOpenChange={(value) => !value && setDetailsRow(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{isRtl ? 'تفاصيل المكالمة' : 'Call details'}</DialogTitle>
          </DialogHeader>
          {detailsRow && (
            <div className="grid gap-3 py-2 sm:grid-cols-2">
              {config.fields.map((field) => {
                const value = detailsRow[field.key];
                return (
                  <div
                    key={field.key}
                    className={field.key === 'notes' ? 'grid gap-1 rounded-lg border p-3 sm:col-span-2' : 'grid gap-1 rounded-lg border p-3'}
                  >
                    <span className="text-xs font-medium text-muted-foreground">
                      {callFieldLabels[field.key] ?? field.key}
                    </span>
                    <span className="whitespace-pre-wrap text-sm">{value == null || value === '' ? '—' : String(value)}</span>
                  </div>
                );
              })}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailsRow(null)}>
              {isRtl ? 'إغلاق' : 'Close'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
