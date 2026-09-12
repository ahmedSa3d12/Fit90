import type { ColumnDef } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/common/data-table';
import { FilterBar, type FilterField } from '@/components/common/filter-bar';
import { PageHeader } from '@/components/common/page-header';
import { StatusBadge, type StatusKey } from '@/components/common/status-badge';
import { MemberSearchCombobox } from '@/components/club/member-search-combobox';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useFitnessT } from '@/hooks/use-fitness-t';
import { api, apiError } from '@/lib/api';
import { formatDate, formatHm, localToday } from '@/lib/formatters';
import { usePaginatedList } from '@/lib/api-hooks';
import { useListQuery } from '@/lib/use-list-query';
import type { ClubMemberListItem } from '@/types/club';
import { SELECT_CLS, useFitnessResourceList } from '../club/fitness/shared';
import {
  BOOKING_BADGE,
  BOOKING_STATUSES,
  CATEGORY_LABEL,
  type BookingRow,
  type Category,
  type ScheduleRow,
} from './shared';

const EMPTY_BOOKING_FORM = {
  scheduleId: '',
  memberId: '',
  memberName: '',
  status: 'confirmed',
  notes: '',
};

export function BookingsPage({
  category,
  serviceId,
  embedded = false,
}: {
  category?: Category;
  serviceId?: number;
  embedded?: boolean;
}) {
  const ft = useFitnessT();
  const { params, setParams } = useListQuery(category ? { filters: { category } } : undefined);
  // Pin category / service when scoped; otherwise list every booking (combined).
  const listParams = {
    ...params,
    filters: {
      ...params.filters,
      ...(category ? { category } : {}),
      ...(serviceId != null ? { serviceId: String(serviceId) } : {}),
    },
  };
  const { data, isLoading, isError, refetch } = usePaginatedList<BookingRow>('scheduling/bookings', listParams);

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_BOOKING_FORM);
  const [selectedMember, setSelectedMember] = useState<ClubMemberListItem | null>(null);

  const filters: FilterField[] = [
    {
      key: 'status',
      label: ft('sched.status'),
      type: 'select',
      options: BOOKING_STATUSES.map((s) => ({ value: s, label: ft(`sched.${s === 'no_show' ? 'noShow' : s}`) })),
    },
    { key: 'dateFrom', label: ft('sched.dateFrom'), type: 'text' },
    { key: 'dateTo', label: ft('sched.dateTo'), type: 'text' },
  ];

  const statusMut = async (id: number, status: string) => {
    try {
      await api.patch(`/scheduling/bookings/${id}`, { status });
      toast.success(ft('sched.updated'));
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const openCreate = () => {
    setForm(EMPTY_BOOKING_FORM);
    setSelectedMember(null);
    setOpen(true);
  };

  const columns = useMemo<ColumnDef<BookingRow>[]>(
    () => [
      { accessorKey: 'bookingNumber', header: ft('sched.bookingNumber') },
      { accessorKey: 'memberName', header: ft('sched.member'), cell: ({ row }) => row.original.memberName ?? '—' },
      { accessorKey: 'serviceName', header: ft('sched.service'), cell: ({ row }) => row.original.serviceName ?? '—' },
      {
        accessorKey: 'bookingDate',
        header: ft('sched.date'),
        cell: ({ row }) => (
          <span className="nums">
            {formatDate(row.original.bookingDate, 'EEE d MMM')}
            {row.original.startTime ? ` · ${formatHm(row.original.startTime)}` : ''}
          </span>
        ),
      },
      {
        accessorKey: 'status',
        header: ft('sched.status'),
        cell: ({ row }) => (
          <StatusBadge
            status={(BOOKING_BADGE[row.original.status] ?? 'info') as StatusKey}
            label={ft(`sched.${row.original.status === 'no_show' ? 'noShow' : row.original.status}`)}
          />
        ),
      },
      {
        id: 'actions',
        header: ft('sched.actions'),
        cell: ({ row }) => (
          <select
            className={SELECT_CLS + ' h-8 w-36'}
            value={row.original.status}
            onChange={(e) => void statusMut(row.original.id, e.target.value)}
          >
            {BOOKING_STATUSES.map((s) => (
              <option key={s} value={s}>
                {ft(`sched.${s === 'no_show' ? 'noShow' : s}`)}
              </option>
            ))}
          </select>
        ),
      },
    ],
    [ft],
  );

  return (
    <div className={embedded ? 'space-y-4' : 'space-y-6'}>
      <div className={`flex flex-wrap items-start gap-3 ${embedded ? 'justify-end' : 'justify-between'}`}>
        {!embedded && (
          <PageHeader
            title={`${ft('sched.bookingsTitle')}${category ? ` — ${ft(CATEGORY_LABEL[category])}` : ''}`}
          />
        )}
        <div className="flex gap-2">
          <Button onClick={openCreate}>
            <Plus className="me-1 h-4 w-4" /> {ft('sched.newBooking')}
          </Button>
        </div>
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

      {open && (
        <NewBookingDialog
          category={category}
          serviceId={serviceId}
          onClose={() => setOpen(false)}
          onDone={() => {
            setOpen(false);
            setForm(EMPTY_BOOKING_FORM);
            setSelectedMember(null);
            void refetch();
          }}
          form={form}
          setForm={setForm}
          selectedMember={selectedMember}
          setSelectedMember={setSelectedMember}
          saving={saving}
          setSaving={setSaving}
          ft={ft}
        />
      )}
    </div>
  );
}

function NewBookingDialog({
  category,
  serviceId,
  onClose,
  onDone,
  form,
  setForm,
  selectedMember,
  setSelectedMember,
  saving,
  setSaving,
  ft,
}: {
  category?: Category;
  serviceId?: number;
  onClose: () => void;
  onDone: () => void;
  form: typeof EMPTY_BOOKING_FORM;
  setForm: (f: typeof EMPTY_BOOKING_FORM) => void;
  selectedMember: ClubMemberListItem | null;
  setSelectedMember: (m: ClubMemberListItem | null) => void;
  saving: boolean;
  setSaving: (b: boolean) => void;
  ft: (k: string) => string;
}) {
  const today = localToday();
  const { items: slots } = useFitnessResourceList<ScheduleRow>(
    `scheduling/schedules?category=${category}${serviceId != null ? `&serviceId=${serviceId}` : ''}&status=available&bookable=true&dateFrom=${today}`,
  );

  const submit = async () => {
    if (!form.scheduleId) {
      toast.error(ft('sched.pickSlot'));
      return;
    }
    if (!form.memberId) {
      toast.error(ft('sched.pickMember'));
      return;
    }
    setSaving(true);
    try {
      await api.post('/scheduling/bookings', {
        scheduleId: Number(form.scheduleId),
        memberId: Number(form.memberId),
        memberName: form.memberName || null,
        status: form.status,
        notes: form.notes || null,
      });
      toast.success(ft('sched.created'));
      onDone();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{ft('sched.newBooking')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>{ft('sched.pickSlot')}</Label>
            <select
              className={SELECT_CLS}
              value={form.scheduleId}
              onChange={(e) => setForm({ ...form, scheduleId: e.target.value })}
            >
              <option value="">—</option>
              {slots
                .filter((s) => s.remaining > 0)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {formatDate(s.slotDate, 'EEE d MMM')} · {formatHm(s.startTime)} · {s.serviceName} (
                    {s.remaining} {ft('sched.available')})
                  </option>
                ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label>{ft('sched.member')}</Label>
            <MemberSearchCombobox
              selectedMember={selectedMember}
              onSelect={(member) => {
                setSelectedMember(member);
                setForm({
                  ...form,
                  memberId: String(member.id),
                  memberName: member.name,
                });
              }}
              onClear={() => {
                setSelectedMember(null);
                setForm({ ...form, memberId: '', memberName: '' });
              }}
              disabled={saving}
            />
            {selectedMember && (
              <p className="text-xs text-muted-foreground nums">
                {selectedMember.memberCode}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>{ft('sched.status')}</Label>
              <select
                className={SELECT_CLS}
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
              >
                {BOOKING_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {ft(`sched.${s === 'no_show' ? 'noShow' : s}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>{ft('sched.notes')}</Label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {ft('sched.cancel')}
          </Button>
          <Button onClick={() => void submit()} disabled={saving}>
            {ft('sched.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
