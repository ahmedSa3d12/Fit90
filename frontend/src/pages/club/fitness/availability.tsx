import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { CalendarPlus, Plus } from 'lucide-react';
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
import { useFitnessT } from '@/hooks/use-fitness-t';
import { api, apiError } from '@/lib/api';
import { confirm } from '@/lib/confirm';
import { SELECT_CLS } from './shared';

type ModuleType = 'Class' | 'Spa' | 'InBody';

const MODULE_TYPES: ModuleType[] = ['Class', 'Spa', 'InBody'];

const MODULE_LABEL_KEYS: Record<ModuleType, string> = {
  Class: 'availability.class',
  Spa: 'availability.spa',
  InBody: 'availability.inbody',
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface AvailabilityRow {
  id: number;
  moduleType: ModuleType;
  branchId: number | null;
  trainerId: number | null;
  serviceId: number | null;
  slotDate: string;
  startTime: string;
  endTime: string;
  capacity: number;
  bookedCount: number;
  isActive: boolean;
}

interface WeekdayTemplate {
  enabled: boolean;
  startTime: string;
  endTime: string;
}

const emptyTemplates = (): WeekdayTemplate[] =>
  WEEKDAYS.map(() => ({ enabled: false, startTime: '09:00', endTime: '10:00' }));

export function AvailabilityPage() {
  const ft = useFitnessT();
  const [moduleType, setModuleType] = useState<ModuleType>('Class');
  const { data: branches } = useBranches();

  const {
    data: slots,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['availability', moduleType],
    queryFn: async () => {
      const { data } = await api.get<AvailabilityRow[]>('/availability', {
        params: { moduleType },
      });
      return data;
    },
  });

  const branchName = (id: number | null) =>
    id != null ? (branches ?? []).find((b) => b.id === id)?.name ?? '—' : '—';
  const branchOptions = (branches ?? []).map((b) => ({ value: String(b.id), label: b.name ?? '—' }));

  // --- Add slot dialog ---
  const [slotOpen, setSlotOpen] = useState(false);
  const [savingSlot, setSavingSlot] = useState(false);
  const [slotForm, setSlotForm] = useState({
    slotDate: '',
    startTime: '09:00',
    endTime: '10:00',
    capacity: '1',
    branchId: '',
  });

  const openSlot = () => {
    setSlotForm({
      slotDate: '',
      startTime: '09:00',
      endTime: '10:00',
      capacity: '1',
      branchId: branches?.[0] ? String(branches[0].id) : '',
    });
    setSlotOpen(true);
  };

  const saveSlot = async () => {
    if (!slotForm.slotDate || !slotForm.startTime || !slotForm.endTime) {
      toast.error(ft('availability.slotRequired'));
      return;
    }
    setSavingSlot(true);
    try {
      await api.post('/availability', {
        moduleType,
        slotDate: slotForm.slotDate,
        startTime: slotForm.startTime,
        endTime: slotForm.endTime,
        capacity: slotForm.capacity ? Number(slotForm.capacity) : undefined,
        branchId: slotForm.branchId ? Number(slotForm.branchId) : undefined,
      });
      toast.success(ft('common.success'));
      setSlotOpen(false);
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSavingSlot(false);
    }
  };

  // --- Add monthly schedule dialog ---
  const [monthOpen, setMonthOpen] = useState(false);
  const [savingMonth, setSavingMonth] = useState(false);
  const [monthForm, setMonthForm] = useState({ month: '', capacity: '1' });
  const [templates, setTemplates] = useState<WeekdayTemplate[]>(emptyTemplates);

  const openMonth = () => {
    setMonthForm({ month: '', capacity: '1' });
    setTemplates(emptyTemplates());
    setMonthOpen(true);
  };

  const setTemplate = (i: number, patch: Partial<WeekdayTemplate>) => {
    setTemplates((prev) => prev.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
  };

  const saveMonth = async () => {
    if (!monthForm.month) {
      toast.error(ft('availability.monthRequired'));
      return;
    }
    const selected = templates
      .map((t, weekday) => ({ ...t, weekday }))
      .filter((t) => t.enabled);
    if (selected.length === 0) {
      toast.error(ft('availability.weekdayRequired'));
      return;
    }
    setSavingMonth(true);
    try {
      const { data } = await api.post<{ created: number }>('/availability/generate-month', {
        moduleType,
        month: monthForm.month,
        capacity: monthForm.capacity ? Number(monthForm.capacity) : undefined,
        templates: selected.map((t) => ({
          weekday: t.weekday,
          startTime: t.startTime,
          endTime: t.endTime,
        })),
      });
      toast.success(ft('availability.created', { count: data.created }));
      setMonthOpen(false);
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSavingMonth(false);
    }
  };

  const deleteSlot = async (row: AvailabilityRow) => {
    const ok = await confirm({ title: ft('availability.deleteConfirm'), variant: 'destructive' });
    if (!ok) return;
    try {
      await api.delete(`/availability/${row.id}`);
      toast.success(ft('common.success'));
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const columns = useMemo<ColumnDef<AvailabilityRow>[]>(
    () => [
      { accessorKey: 'slotDate', header: ft('availability.date'), cell: ({ getValue }) => <span className="nums">{getValue() as string}</span> },
      { accessorKey: 'startTime', header: ft('availability.startTime'), cell: ({ getValue }) => <span className="nums">{getValue() as string}</span> },
      { accessorKey: 'endTime', header: ft('availability.endTime'), cell: ({ getValue }) => <span className="nums">{getValue() as string}</span> },
      { accessorKey: 'capacity', header: ft('availability.capacity'), cell: ({ getValue }) => <span className="nums">{getValue() as number}</span> },
      { accessorKey: 'bookedCount', header: ft('availability.booked'), cell: ({ getValue }) => <span className="nums">{getValue() as number}</span> },
      {
        accessorKey: 'branchId',
        header: ft('common.branch'),
        cell: ({ row }) => branchName(row.original.branchId),
      },
      {
        id: 'actions',
        header: ft('common.actions'),
        cell: ({ row }) => (
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive"
            onClick={() => void deleteSlot(row.original)}
          >
            {ft('common.delete')}
          </Button>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [branches, ft],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={ft('availability.title')}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={openMonth}>
              <CalendarPlus className="size-4" /> {ft('availability.addMonthly')}
            </Button>
            <Button variant="brand" onClick={openSlot}>
              <Plus className="size-4" /> {ft('availability.addSlot')}
            </Button>
          </div>
        }
      />

      <div className="flex gap-2">
        {MODULE_TYPES.map((m) => (
          <Button
            key={m}
            variant={m === moduleType ? 'brand' : 'outline'}
            size="sm"
            onClick={() => setModuleType(m)}
          >
            {ft(MODULE_LABEL_KEYS[m])}
          </Button>
        ))}
      </div>

      <DataTable
        columns={columns}
        data={slots ?? []}
        total={slots?.length ?? 0}
        page={1}
        pageSize={slots?.length || 1}
        onPageChange={() => {}}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
        emptyTitle={ft('availability.empty')}
      />

      {/* Add slot dialog */}
      <Dialog open={slotOpen} onOpenChange={setSlotOpen}>
        <DialogContent className="sm:max-w-md" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{ft('availability.addSlot')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-2">
              <Label>{ft('availability.date')}</Label>
              <Input
                type="date"
                className="nums"
                value={slotForm.slotDate}
                onChange={(e) => setSlotForm((f) => ({ ...f, slotDate: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>{ft('availability.startTime')}</Label>
                <Input
                  type="time"
                  className="nums"
                  value={slotForm.startTime}
                  onChange={(e) => setSlotForm((f) => ({ ...f, startTime: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label>{ft('availability.endTime')}</Label>
                <Input
                  type="time"
                  className="nums"
                  value={slotForm.endTime}
                  onChange={(e) => setSlotForm((f) => ({ ...f, endTime: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>{ft('availability.capacity')}</Label>
                <Input
                  type="number"
                  className="nums"
                  value={slotForm.capacity}
                  onChange={(e) => setSlotForm((f) => ({ ...f, capacity: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label>{ft('common.branch')}</Label>
                <select
                  className={SELECT_CLS}
                  value={slotForm.branchId}
                  onChange={(e) => setSlotForm((f) => ({ ...f, branchId: e.target.value }))}
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSlotOpen(false)}>
              {ft('common.cancel')}
            </Button>
            <Button variant="brand" onClick={() => void saveSlot()} disabled={savingSlot}>
              {ft('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add monthly schedule dialog */}
      <Dialog open={monthOpen} onOpenChange={setMonthOpen}>
        <DialogContent className="sm:max-w-lg" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{ft('availability.addMonthly')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>{ft('availability.month')}</Label>
                <Input
                  type="month"
                  className="nums"
                  value={monthForm.month}
                  onChange={(e) => setMonthForm((f) => ({ ...f, month: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label>{ft('availability.capacity')}</Label>
                <Input
                  type="number"
                  className="nums"
                  value={monthForm.capacity}
                  onChange={(e) => setMonthForm((f) => ({ ...f, capacity: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>{ft('availability.weekdays')}</Label>
              <div className="grid gap-2">
                {templates.map((t, i) => (
                  <div key={WEEKDAYS[i]} className="flex items-center gap-3">
                    <label className="flex w-16 items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={t.enabled}
                        onChange={(e) => setTemplate(i, { enabled: e.target.checked })}
                      />
                      {ft(`availability.day${i}`)}
                    </label>
                    {t.enabled && (
                      <div className="flex flex-1 gap-2">
                        <Input
                          type="time"
                          className="nums"
                          value={t.startTime}
                          onChange={(e) => setTemplate(i, { startTime: e.target.value })}
                        />
                        <Input
                          type="time"
                          className="nums"
                          value={t.endTime}
                          onChange={(e) => setTemplate(i, { endTime: e.target.value })}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMonthOpen(false)}>
              {ft('common.cancel')}
            </Button>
            <Button variant="brand" onClick={() => void saveMonth()} disabled={savingMonth}>
              {ft('availability.addMonthly')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
