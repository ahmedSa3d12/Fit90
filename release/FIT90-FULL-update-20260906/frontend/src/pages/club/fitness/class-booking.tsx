import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { PageHeader } from '@/components/common/page-header';
import { MemberSearchCombobox } from '@/components/club/member-search-combobox';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useFitnessT } from '@/hooks/use-fitness-t';
import { api, apiError } from '@/lib/api';
import { localToday } from '@/lib/formatters';
import { usePaginatedList } from '@/lib/api-hooks';
import type { ClubMemberListItem } from '@/types/club';
import type { ClubClassRow } from '@/types/fitness';
import { SELECT_CLS } from './shared';

const today = () => localToday();

export function FitnessClassBookingPage() {
  const ft = useFitnessT();
  const qc = useQueryClient();
  const { data } = usePaginatedList<ClubClassRow>('club-classes', {
    page: 1,
    pageSize: 100,
    search: '',
    filters: { status: 'scheduled', dateFrom: today(), dateOrder: 'asc' },
  });
  const upcoming = data?.data ?? [];

  const [classId, setClassId] = useState('');
  const [selectedMember, setSelectedMember] = useState<ClubMemberListItem | null>(null);
  const [saving, setSaving] = useState(false);

  const enroll = async () => {
    if (!classId || !selectedMember) {
      toast.error(!classId ? ft('classBooking.selectClass') : ft('sched.pickMember'));
      return;
    }
    setSaving(true);
    try {
      await api.post(`/club-classes/${classId}/enroll/${selectedMember.id}`);
      toast.success(ft('common.success'));
      setSelectedMember(null);
      void qc.invalidateQueries({ queryKey: ['club-classes'] });
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title={ft('classBooking.title')} />
      <div className="mx-auto max-w-md space-y-4 rounded-xl border bg-card p-6 shadow-sm">
        <div className="grid gap-2">
          <Label>{ft('classBooking.selectClass')}</Label>
          <select className={SELECT_CLS} value={classId} onChange={(e) => setClassId(e.target.value)}>
            <option value="">—</option>
            {upcoming.map((c) => (
              <option key={c.id} value={c.id}>
                {c.className} — {c.classDate} {c.startTime}
                {c.enrollmentCount >= c.maxCapacity ? ` (${ft('classes.full')})` : ''}
              </option>
            ))}
          </select>
          {upcoming.length === 0 && (
            <p className="text-sm text-muted-foreground">{ft('classBooking.noUpcoming')}</p>
          )}
        </div>
        <div className="grid gap-2">
          <Label>{ft('common.member')}</Label>
          <MemberSearchCombobox
            selectedMember={selectedMember}
            onSelect={setSelectedMember}
            onClear={() => setSelectedMember(null)}
            disabled={saving}
          />
        </div>
        <Button variant="brand" className="w-full" onClick={() => void enroll()} disabled={saving}>
          {ft('common.enroll')}
        </Button>
      </div>
    </div>
  );
}
