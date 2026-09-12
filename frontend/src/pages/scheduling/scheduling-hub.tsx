import { Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useFitnessT } from '@/hooks/use-fitness-t';
import { api, apiError } from '@/lib/api';
import { useFitnessResourceList, SELECT_CLS } from '../club/fitness/shared';
import { cn } from '@/lib/utils';
import { SchedulingWorkspacePage } from './scheduling-workspace';
import { CATEGORIES, CATEGORY_LABEL, type Category, type ServiceRow } from './shared';

/**
 * Dynamic scheduling hub. Instead of fixed per-category tabs, the left rail lists
 * every service ("class") — searchable, category-filterable, and extendable with
 * "add new class". Picking one opens its Schedule + Bookings on the right. New
 * services show up here immediately, so nothing is hard-coded.
 */
export function SchedulingHubPage() {
  const ft = useFitnessT();
  const [params, setParams] = useSearchParams();
  const { items: services, refetch } = useFitnessResourceList<ServiceRow>('scheduling/services');

  const [search, setSearch] = useState('');
  const [cat, setCat] = useState<Category | 'all'>('all');
  const [createOpen, setCreateOpen] = useState(false);

  const selectedId = params.get('service') ? Number(params.get('service')) : null;
  const selected = services.find((s) => s.id === selectedId) ?? null;

  const select = (id: number) => {
    const next = new URLSearchParams(params);
    next.set('service', String(id));
    next.delete('tab');
    setParams(next, { replace: false });
  };

  // Picking a category chip narrows the calendar to that category and drops any
  // single-service pin (so it shows every class in the category, combined).
  const pickCategory = (c: Category | 'all') => {
    setCat(c);
    if (params.get('service')) {
      const next = new URLSearchParams(params);
      next.delete('service');
      setParams(next, { replace: false });
    }
  };

  // Effective scope for the right pane: a single service, else a whole category,
  // else EVERYTHING in one calendar.
  const scope = selected
    ? { category: selected.category as Category | undefined, serviceId: selected.id, name: selected.name, color: selected.color }
    : cat !== 'all'
      ? { category: cat, serviceId: undefined, name: ft(CATEGORY_LABEL[cat]), color: undefined }
      : { category: undefined, serviceId: undefined, name: ft('sched.allClasses'), color: undefined };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return services
      .filter((s) => (cat === 'all' ? true : s.category === cat))
      .filter((s) => (q ? s.name.toLowerCase().includes(q) : true))
      .sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name));
  }, [services, search, cat]);

  return (
    <div className="space-y-5">
      <PageHeader title={ft('sched.title')} description={ft('sched.hubHint')} />

      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        {/* left rail — dynamic list of classes */}
        <Card className="flex h-fit max-h-[calc(100vh-12rem)] flex-col overflow-hidden p-0">
          <div className="border-b p-3">
            <Button className="mb-3 w-full" onClick={() => setCreateOpen(true)}>
              <Plus className="me-1.5 h-4 w-4" /> {ft('sched.newClass')}
            </Button>
            <div className="relative">
              <Search className="pointer-events-none absolute inset-y-0 start-2 my-auto h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={ft('sched.searchClasses')}
                className="ps-8"
              />
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              <FilterChip
                active={cat === 'all' && !selected}
                onClick={() => pickCategory('all')}
                label={ft('sched.all')}
              />
              {CATEGORIES.map((c) => (
                <FilterChip
                  key={c}
                  active={cat === c}
                  onClick={() => pickCategory(c)}
                  label={ft(CATEGORY_LABEL[c])}
                />
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {filtered.length === 0 ? (
              <p className="p-4 text-center text-sm text-muted-foreground">{ft('sched.noClasses')}</p>
            ) : (
              <ul className="space-y-1">
                {filtered.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => select(s.id)}
                      className={cn(
                        'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-start transition-colors',
                        s.id === selectedId ? 'bg-primary/10 ring-1 ring-primary/30' : 'hover:bg-muted',
                      )}
                    >
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: s.color ?? '#888' }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className={cn('block truncate text-sm font-medium', !s.isActive && 'text-muted-foreground')}>
                          {s.name}
                        </span>
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {ft(CATEGORY_LABEL[s.category])}
                          {!s.isActive ? ` · ${ft('sched.inactive')}` : ''}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>

        {/* right pane — always a calendar: everything by default, narrowed by
            the picked category or class. */}
        <div className="min-w-0">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              {selected && (
                <span
                  className="h-3.5 w-3.5 rounded-full"
                  style={{ backgroundColor: selected.color ?? '#888' }}
                />
              )}
              <h2 className="text-xl font-bold">{scope.name}</h2>
              {selected && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {ft(CATEGORY_LABEL[selected.category])}
                </span>
              )}
              {(selected || cat !== 'all') && (
                <button
                  type="button"
                  onClick={() => pickCategory('all')}
                  className="ms-1 text-xs text-primary hover:underline"
                >
                  {ft('sched.showAll')}
                </button>
              )}
            </div>
            {/* No `key` remount on scope change — the calendar reacts to the
                category/serviceId props and keeps the currently-viewed week. */}
            <SchedulingWorkspacePage
              category={scope.category}
              serviceId={scope.serviceId}
              serviceName={selected?.name}
              embedded
            />
          </div>
        </div>
      </div>

      {createOpen && (
        <CreateClassDialog
          onClose={() => setCreateOpen(false)}
          onCreated={async (id) => {
            setCreateOpen(false);
            await refetch();
            select(id);
          }}
          ft={ft}
        />
      )}
    </div>
  );
}

function FilterChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors',
        active ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-muted',
      )}
    >
      {label}
    </button>
  );
}

const EMPTY = {
  name: '',
  category: 'class' as Category,
  durationMin: '60',
  price: '0',
  capacity: '',
  color: '#1E6BA8',
};

function CreateClassDialog({
  onClose,
  onCreated,
  ft,
}: {
  onClose: () => void;
  onCreated: (id: number) => void;
  ft: (k: string) => string;
}) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.name.trim()) {
      toast.error(ft('sched.name'));
      return;
    }
    setSaving(true);
    try {
      const { data } = await api.post<{ id: number }>('/scheduling/services', {
        name: form.name.trim(),
        category: form.category,
        durationMin: Number(form.durationMin) || 60,
        price: form.price || '0',
        capacity: form.capacity === '' ? null : Number(form.capacity),
        color: form.color,
        isActive: true,
      });
      toast.success(ft('sched.saved'));
      onCreated(data.id);
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
          <DialogTitle>{ft('sched.newClass')}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 space-y-1.5">
            <Label>{ft('sched.name')}</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label>{ft('sched.category')}</Label>
            <select
              className={SELECT_CLS}
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value as Category })}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {ft(CATEGORY_LABEL[c])}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>{ft('sched.color')}</Label>
            <Input
              type="color"
              value={form.color}
              onChange={(e) => setForm({ ...form, color: e.target.value })}
              className="h-10 p-1"
            />
          </div>
          <div className="space-y-1.5">
            <Label>{ft('sched.duration')}</Label>
            <Input
              type="number"
              value={form.durationMin}
              onChange={(e) => setForm({ ...form, durationMin: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{ft('sched.price')}</Label>
            <Input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>{ft('sched.capacity')}</Label>
            <Input
              type="number"
              value={form.capacity}
              onChange={(e) => setForm({ ...form, capacity: e.target.value })}
              placeholder="—"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {ft('sched.cancel')}
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            {ft('sched.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
