import type { ColumnDef } from '@tanstack/react-table';
import { FileText, History, Plus, Upload } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/common/data-table';
import { FilterBar, type FilterField } from '@/components/common/filter-bar';
import { PageHeader } from '@/components/common/page-header';
import { MemberSearchCombobox } from '@/components/club/member-search-combobox';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useFitnessT } from '@/hooks/use-fitness-t';
import { api, apiError } from '@/lib/api';
import { formatDate, localToday } from '@/lib/formatters';
import { usePaginatedList } from '@/lib/api-hooks';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import type { ClubMemberListItem } from '@/types/club';
import type { InbodyRecordRow } from './shared';

const EMPTY = {
  memberId: '',
  memberName: '',
  recordDate: localToday(),
  staffName: '',
  weight: '',
  bodyFat: '',
  muscleMass: '',
  bmi: '',
  notes: '',
  fileUrl: '',
};

export function InBodyRecordsPage() {
  const ft = useFitnessT();
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, refetch } = usePaginatedList<InbodyRecordRow>('scheduling/inbody-records', params);

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [selectedMember, setSelectedMember] = useState<ClubMemberListItem | null>(null);
  const [historyFor, setHistoryFor] = useState<InbodyRecordRow | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const filters: FilterField[] = [
    { key: 'dateFrom', label: ft('sched.dateFrom'), type: 'text' },
    { key: 'dateTo', label: ft('sched.dateTo'), type: 'text' },
  ];

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data: r } = await api.post('/uploads/inbody', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setForm((s) => ({ ...s, fileUrl: r.url }));
      toast.success(ft('sched.upload'));
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setUploading(false);
    }
  };

  const openCreate = () => {
    setForm(EMPTY);
    setSelectedMember(null);
    setOpen(true);
  };

  const save = async () => {
    if (!form.memberId) {
      toast.error(ft('sched.pickMember'));
      return;
    }
    setSaving(true);
    try {
      await api.post('/scheduling/inbody-records', {
        memberId: Number(form.memberId),
        memberName: form.memberName || null,
        recordDate: form.recordDate,
        staffName: form.staffName || null,
        weight: form.weight || undefined,
        bodyFat: form.bodyFat || undefined,
        muscleMass: form.muscleMass || undefined,
        bmi: form.bmi || undefined,
        notes: form.notes || null,
        fileUrl: form.fileUrl || null,
      });
      toast.success(ft('sched.saved'));
      setOpen(false);
      setForm(EMPTY);
      setSelectedMember(null);
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const columns = useMemo<ColumnDef<InbodyRecordRow>[]>(
    () => [
      {
        accessorKey: 'recordDate',
        header: ft('sched.recordDate'),
        cell: ({ row }) => formatDate(row.original.recordDate, 'EEE d MMM yyyy'),
      },
      { accessorKey: 'memberName', header: ft('sched.member'), cell: ({ row }) => row.original.memberName ?? `#${row.original.memberId}` },
      { accessorKey: 'staffName', header: ft('sched.staff'), cell: ({ row }) => row.original.staffName ?? '—' },
      { accessorKey: 'weight', header: ft('sched.weight'), cell: ({ row }) => (row.original.weight ? toArabicDigits(row.original.weight) : '—') },
      { accessorKey: 'bodyFat', header: ft('sched.bodyFat'), cell: ({ row }) => (row.original.bodyFat ? toArabicDigits(row.original.bodyFat) : '—') },
      { accessorKey: 'bmi', header: ft('sched.bmi'), cell: ({ row }) => (row.original.bmi ? toArabicDigits(row.original.bmi) : '—') },
      {
        id: 'file',
        header: ft('sched.file'),
        cell: ({ row }) =>
          row.original.fileUrl ? (
            <a href={row.original.fileUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
              <FileText className="h-4 w-4" />
            </a>
          ) : (
            '—'
          ),
      },
      {
        id: 'actions',
        header: ft('sched.actions'),
        cell: ({ row }) => (
          <Button variant="ghost" size="sm" onClick={() => setHistoryFor(row.original)}>
            <History className="me-1 h-4 w-4" /> {ft('sched.history')}
          </Button>
        ),
      },
    ],
    [ft],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader title={ft('sched.inbodyRecords')} />
        <Button onClick={openCreate}>
          <Plus className="me-1 h-4 w-4" /> {ft('sched.newService')}
        </Button>
      </div>

      <FilterBar fields={filters} />

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        total={data?.total ?? 0}
        page={params.page}
        pageSize={params.pageSize}
        onPageChange={(page) => setParams({ page })}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
      />

      {/* create */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{ft('sched.inbodyRecords')}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-1.5">
              <Label>{ft('sched.member')}</Label>
              <MemberSearchCombobox
                selectedMember={selectedMember}
                onSelect={(member) => {
                  setSelectedMember(member);
                  setForm({ ...form, memberId: String(member.id), memberName: member.name });
                }}
                onClear={() => {
                  setSelectedMember(null);
                  setForm({ ...form, memberId: '', memberName: '' });
                }}
                disabled={saving}
              />
              {selectedMember && (
                <p className="text-xs text-muted-foreground nums">{selectedMember.memberCode}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>{ft('sched.recordDate')}</Label>
              <Input type="date" value={form.recordDate} onChange={(e) => setForm({ ...form, recordDate: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>{ft('sched.staff')}</Label>
              <Input value={form.staffName} onChange={(e) => setForm({ ...form, staffName: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>{ft('sched.weight')}</Label>
              <Input type="number" value={form.weight} onChange={(e) => setForm({ ...form, weight: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>{ft('sched.bodyFat')}</Label>
              <Input type="number" value={form.bodyFat} onChange={(e) => setForm({ ...form, bodyFat: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>{ft('sched.muscle')}</Label>
              <Input type="number" value={form.muscleMass} onChange={(e) => setForm({ ...form, muscleMass: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>{ft('sched.bmi')}</Label>
              <Input type="number" value={form.bmi} onChange={(e) => setForm({ ...form, bmi: e.target.value })} />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>{ft('sched.file')}</Label>
              <div className="flex items-center gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*,application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void upload(file);
                  }}
                />
                <Button type="button" variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>
                  <Upload className="me-1 h-4 w-4" /> {ft('sched.upload')}
                </Button>
                {form.fileUrl && (
                  <a href={form.fileUrl} target="_blank" rel="noreferrer" className="text-sm text-primary hover:underline">
                    <FileText className="inline h-4 w-4" />
                  </a>
                )}
              </div>
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>{ft('sched.notes')}</Label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {ft('sched.cancel')}
            </Button>
            <Button onClick={() => void save()} disabled={saving}>
              {ft('sched.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {historyFor && <HistoryDialog record={historyFor} onClose={() => setHistoryFor(null)} ft={ft} />}
    </div>
  );
}

function HistoryDialog({ record, onClose, ft }: { record: InbodyRecordRow; onClose: () => void; ft: (k: string) => string }) {
  const { data } = usePaginatedList<InbodyRecordRow>(
    'scheduling/inbody-records',
    { page: 1, pageSize: 100, filters: { memberId: String(record.memberId) }, search: '', sort: '', order: 'desc' } as never,
  );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {ft('sched.history')} — {record.memberName ?? `#${record.memberId}`}
          </DialogTitle>
        </DialogHeader>
        <div className="max-h-96 space-y-2 overflow-auto">
          {(data?.data ?? []).map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded-lg border p-2 text-sm">
              <span className="nums font-medium">{formatDate(r.recordDate, 'd MMM yyyy')}</span>
              <span className="nums text-muted-foreground">
                {r.weight ? `${toArabicDigits(r.weight)} · ` : ''}
                {r.bmi ? `BMI ${toArabicDigits(r.bmi)}` : ''}
              </span>
              {r.fileUrl && (
                <a href={r.fileUrl} target="_blank" rel="noreferrer" className="text-primary">
                  <FileText className="h-4 w-4" />
                </a>
              )}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
