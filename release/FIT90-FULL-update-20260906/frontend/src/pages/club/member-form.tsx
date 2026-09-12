import { FileText, Printer } from 'lucide-react';
import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/common/page-header';
import { StatusBadge } from '@/components/common/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useClubT } from '@/hooks/use-club-t';
import { useOutputPermissions } from '@/hooks/use-output-permissions';
import { api } from '@/lib/api';
import { toArabicDigits } from '@/lib/utils';
import type { ClubMemberListItem } from '@/types/club';

interface FinancialSub {
  id: number;
  subscriptionNumber: string;
  subscriptionType: string | null;
  subscriptionValue: number;
  paidAmount: number;
  remainingAmount: number;
  status: string;
  subscriptionStartDate: string;
  subscriptionEndDate: string;
  // Session-linked subscriptions (present only when the backend exposes them).
  isLinkedToSessions?: boolean;
  sessionsCount?: number | null;
  sessionsUsed?: number | null;
}

interface FinancialReceipt {
  id: number;
  receiptNumber: string;
  amount: number;
  receiptDate: string;
}

export function ClubMemberFormPage() {
  const ct = useClubT();
  const { canPrint } = useOutputPermissions();
  const printRef = useRef<HTMLDivElement>(null);
  const [memberId, setMemberId] = useState('');
  const [searchCode, setSearchCode] = useState('');

  const { data, refetch, isFetching } = useQuery({
    queryKey: ['club-member-form', memberId],
    enabled: false,
    queryFn: async () => {
      const [{ data: member }, { data: financial }] = await Promise.all([
        api.get<ClubMemberListItem>(`/club-members/${memberId}`),
        api.get<{
          subscriptions: FinancialSub[];
          receipts: FinancialReceipt[];
          summary: { totalSubscriptions: number; totalPaidOnSubscriptions: number; totalRemaining: number };
          entitlements?: { hasInbody: boolean; hasSpa: boolean; hasSingleClasses: boolean };
        }>(`/club-members/${memberId}/financial-history`),
      ]);
      return { member, financial };
    },
  });

  const lookupByCode = async () => {
    if (!searchCode.trim()) return;
    const { data: list } = await api.get<{ data: ClubMemberListItem[] }>('/club-members', {
      params: { search: searchCode.trim(), pageSize: 1 },
    });
    const found = list.data?.[0];
    if (found) {
      setMemberId(String(found.id));
      setTimeout(() => void refetch(), 0);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={ct('subscriptions.memberForm')}
        description={ct('members.financialMemberId')}
        actions={
          data && canPrint && (
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="size-4" /> {ct('common.print')}
            </Button>
          )
        }
      />

      <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4 print:hidden">
        <div className="grid gap-2">
          <Label>{ct('members.memberCode')}</Label>
          <Input
            className="nums max-w-xs"
            value={searchCode}
            onChange={(e) => setSearchCode(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void lookupByCode()}
          />
        </div>
        <div className="grid gap-2">
          <Label>{ct('members.financialMemberId')}</Label>
          <Input className="nums max-w-xs" value={memberId} onChange={(e) => setMemberId(e.target.value)} />
        </div>
        <Button variant="brand" disabled={!memberId || isFetching} onClick={() => void refetch()}>
          <FileText className="size-4" /> {ct('members.loadFinancial')}
        </Button>
      </div>

      {data && (
        <div ref={printRef} className="rounded-xl border bg-card p-6 shadow-sm print:border-0 print:shadow-none">
          <div className="border-b pb-4 text-center">
            <p className="text-xs text-muted-foreground">FIT90 Club</p>
            <h2 className="text-2xl font-bold">{data.member.name}</h2>
            <p className="mt-1 font-mono text-sm nums">{data.member.memberCode}</p>
          </div>

          <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
            <p>
              <span className="text-muted-foreground">{ct('members.phone')}:</span>{' '}
              <span className="nums">{data.member.phone ? toArabicDigits(data.member.phone) : '—'}</span>
            </p>
            <p>
              <span className="text-muted-foreground">{ct('members.nationalId')}:</span>{' '}
              <span className="nums">{data.member.cardNumber ?? '—'}</span>
            </p>
            <p>
              <span className="text-muted-foreground">{ct('members.gender')}:</span>{' '}
              {data.member.gender === 'male' ? ct('common.male') : ct('common.female')}
            </p>
            <p>
              <span className="text-muted-foreground">{ct('members.membershipType')}:</span>{' '}
              {data.member.membershipType?.name ?? '—'}
            </p>
            <p>
              <span className="text-muted-foreground">{ct('common.branch')}:</span> {data.member.branchId}
            </p>
            <p>
              <span className="text-muted-foreground">{ct('common.status')}:</span>{' '}
              <StatusBadge status={data.member.isActive ? 'active' : 'suspended'} />
            </p>
          </div>

          <h3 className="mt-6 font-semibold">{ct('members.financialSummary')}</h3>
          <div className="mt-2 grid gap-2 text-sm sm:grid-cols-3">
            <p className="nums">
              {ct('members.totalSubs')}: {toArabicDigits(data.financial.summary.totalSubscriptions)}
            </p>
            <p className="nums">
              {ct('members.totalPaid')}: {toArabicDigits(data.financial.summary.totalPaidOnSubscriptions)}
            </p>
            <p className="nums">
              {ct('members.totalRemaining')}: {toArabicDigits(data.financial.summary.totalRemaining)}
            </p>
          </div>

          <h3 className="mt-6 font-semibold">{ct('members.services') !== 'members.services' ? ct('members.services') : 'Services'}</h3>
          <div className="mt-2 flex flex-wrap gap-2 text-sm">
            {[
              { label: 'InBody', on: !!data.financial.entitlements?.hasInbody },
              { label: 'Spa', on: !!data.financial.entitlements?.hasSpa },
              { label: 'Single classes', on: !!data.financial.entitlements?.hasSingleClasses },
            ].map((e) => (
              <span
                key={e.label}
                className={
                  'inline-flex items-center gap-1 rounded-full px-3 py-1 ' +
                  (e.on ? 'bg-emerald-100 text-emerald-700' : 'bg-muted text-muted-foreground')
                }
              >
                {e.on ? '✓' : '—'} {e.label}
              </span>
            ))}
          </div>

          <h3 className="mt-6 font-semibold">{ct('subscriptions.tabSubs')}</h3>
          <table className="mt-2 w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="p-2 text-start">{ct('subscriptions.subNumber')}</th>
                <th className="p-2 text-start">{ct('subscriptions.subType')}</th>
                <th className="p-2 text-start">{ct('subscriptions.value')}</th>
                <th className="p-2 text-start">{ct('subscriptions.remaining')}</th>
                <th className="p-2 text-start">{ct('subscriptions.typeSessions')}</th>
                <th className="p-2 text-start">{ct('common.status')}</th>
              </tr>
            </thead>
            <tbody>
              {(data.financial.subscriptions ?? []).map((s) => {
                const total = s.sessionsCount ?? 0;
                const used = s.sessionsUsed ?? 0;
                const showSessions = s.isLinkedToSessions && total > 0;
                return (
                <tr key={s.id} className="border-b">
                  <td className="p-2 nums">{s.subscriptionNumber}</td>
                  <td className="p-2">{s.subscriptionType ?? '—'}</td>
                  <td className="p-2 nums">{toArabicDigits(s.subscriptionValue)}</td>
                  <td className="p-2 nums">{toArabicDigits(s.remainingAmount)}</td>
                  <td className="p-2 nums">
                    {showSessions
                      ? ct('subscriptions.sessionsUsage', {
                          used: toArabicDigits(used),
                          total: toArabicDigits(total),
                          remaining: toArabicDigits(Math.max(total - used, 0)),
                        })
                      : '—'}
                  </td>
                  <td className="p-2">
                    <StatusBadge
                      status={s.status === 'active' ? 'active' : s.status === 'expired' ? 'expired' : 'pending'}
                    />
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>

          <h3 className="mt-6 font-semibold">{ct('subscriptions.tabReceipts')}</h3>
          <table className="mt-2 w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="p-2 text-start">{ct('subscriptions.receiptNumber')}</th>
                <th className="p-2 text-start">{ct('common.amount')}</th>
                <th className="p-2 text-start">{ct('subscriptions.receiptDate')}</th>
              </tr>
            </thead>
            <tbody>
              {(data.financial.receipts ?? []).map((r) => (
                <tr key={r.id} className="border-b">
                  <td className="p-2 nums">{r.receiptNumber}</td>
                  <td className="p-2 nums">{toArabicDigits(r.amount)}</td>
                  <td className="p-2 nums">{toArabicDigits(r.receiptDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
