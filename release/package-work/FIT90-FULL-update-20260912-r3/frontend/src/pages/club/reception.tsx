import {
  AlertTriangle,
  ArrowRightLeft,
  Calendar,
  CheckCircle2,
  CreditCard,
  Heart,
  Info,
  Mail,
  MapPin,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Snowflake,
  Sun,
  Undo2,
  User,
  XCircle,
  Briefcase,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Maximize2, Minimize2 } from 'lucide-react';
import { MemberAvatar } from '@/components/club/member-avatar';
import { TransferPlanPicker } from '@/components/club/transfer-plan-picker';
import { useBranches } from '@/hooks/use-branches';
import { PageHeader } from '@/components/common/page-header';
import { FieldWrapper } from '@/components/common/form-fields';
import {
  SubscriptionPaymentPanel,
  subscriptionNetValue,
  type SubscriptionPaymentReceiptRow,
} from '@/components/club/subscription-payment-panel';
import { WorkspaceWidgets } from '@/components/workspace/workspace-widgets';
import { StatusBadge } from '@/components/common/status-badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { DialogFormSummary } from '@/components/common/dialog-form-layout';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useClubT } from '@/hooks/use-club-t';
import { api, apiError } from '@/lib/api';
import { useArrayResource } from '@/lib/api-hooks';
import { searchClubMembers } from '@/lib/club-member-search';
import { confirm, confirmWithPreview } from '@/lib/confirm';
import { formatMoney, localToday } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import type { ClubMemberListItem, ClubSubscriptionListItem, ClubSubscriptionType } from '@/types/club';
import type {
  CheckInResponse,
  ClubSearchHit,
  EntitlementReason,
  EntitlementResult,
  RecentCheckIn,
} from '@/types/gym-ops';

const selectCls =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

function addDaysLocal(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

type RefundPreview = {
  subscriptionId: number;
  stopDate: string;
  remainingDays: number;
  remainingSessions: number | null;
  refundBasis: 'days' | 'sessions';
  refundAmount: number;
  originalValue: number;
  totalDays: number;
  consumedDays: number;
  consumedValue: number;
};

function EntitlementBanner({ entitlement }: { entitlement: EntitlementResult }) {
  const { ui, locale } = useLocale();
  const blocking = entitlement.reasons.filter((r) => r.severity === 'block');
  const warnings = [...entitlement.warnings, ...entitlement.reasons.filter((r) => r.severity === 'warn')];
  const outstanding = entitlement.activeSubscription?.remainingAmount ?? 0;

  const reasonLabel = (r: EntitlementReason) => {
    if (r.code === 'outstanding_balance' && outstanding > 0) {
      return `${ui('عليه مبلغ متبقٍ')}: ${formatMoney(outstanding, undefined, locale)}`;
    }
    return locale === 'en' ? r.messageEn : r.messageAr;
  };

  if (entitlement.allowed && warnings.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2.5 text-sm text-emerald-800 dark:text-emerald-200">
        <CheckCircle2 className="size-5 shrink-0" />
        <span>{ui('مسموح بالدخول — اشتراك نشط')}</span>
      </div>
    );
  }

  if (!entitlement.allowed) {
    return (
      <div className="space-y-2 rounded-xl border border-destructive/35 bg-destructive/10 px-3 py-2.5">
        <div className="flex items-center gap-2 font-medium text-destructive">
          <XCircle className="size-5" />
          <span>{ui('الدخول مرفوض')}</span>
        </div>
        <ul className="list-inside list-disc text-sm text-destructive/90">
          {blocking.map((r) => (
            <li key={r.code}>{reasonLabel(r)}</li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="space-y-1 rounded-xl border border-amber-500/35 bg-amber-500/10 px-3 py-2.5 text-sm">
      <div className="flex items-center gap-2 font-medium text-amber-800 dark:text-amber-200">
        <AlertTriangle className="size-5" />
        <span>{ui('مسموح مع تحذيرات')}</span>
      </div>
      <ul className="list-inside list-disc text-amber-900/80 dark:text-amber-100/80">
        {warnings.map((r) => (
          <li key={r.code}>{reasonLabel(r)}</li>
        ))}
      </ul>
    </div>
  );
}

export function ClubReceptionPage() {
  const { ui } = useLocale();
  const ct = useClubT();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);
  const tabletMode = searchParams.get('tablet') === '1';
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [memberOpen, setMemberOpen] = useState(false);
  const [entitlement, setEntitlement] = useState<EntitlementResult | null>(null);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [overrideSubId, setOverrideSubId] = useState<number | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paySubId, setPaySubId] = useState<number | null>(null);
  const [payMaxRemaining, setPayMaxRemaining] = useState(0);
  const [payAmount, setPayAmount] = useState('');
  const [freezeOpen, setFreezeOpen] = useState(false);
  const [freezeSubId, setFreezeSubId] = useState<number | null>(null);
  const [freezeForm, setFreezeForm] = useState({ reason: '' });
  const [renewOpen, setRenewOpen] = useState(false);
  const [renewSubId, setRenewSubId] = useState<number | null>(null);
  const [renewForm, setRenewForm] = useState({ paidAmount: '', paymentMethod: 'cash' });
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundSubId, setRefundSubId] = useState<number | null>(null);
  const [refundStopDate, setRefundStopDate] = useState(localToday());
  const [refundReason, setRefundReason] = useState('');
  const [refundNotes, setRefundNotes] = useState('');
  const [refundPreview, setRefundPreview] = useState<RefundPreview | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferSubId, setTransferSubId] = useState<number | null>(null);
  const [transferForm, setTransferForm] = useState({
    toSubscriptionTypeId: '',
    toStartDate: localToday(),
    toEndDate: '',
    toValue: '',
  });
  const [transferCreditPreview, setTransferCreditPreview] = useState<RefundPreview | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: subTypes } = useArrayResource<ClubSubscriptionType>('club-subscription-types');
  const { data: trainers } = useArrayResource<{ id: number; name: string }>('club-trainers');
  const { data: customerSources } = useArrayResource<{ id: number; name: string }>('club-customer-sources');
  const { data: branches } = useBranches();

  useEffect(() => {
    if (tabletMode) {
      document.documentElement.classList.add('reception-tablet');
    } else {
      document.documentElement.classList.remove('reception-tablet');
    }
    return () => document.documentElement.classList.remove('reception-tablet');
  }, [tabletMode]);

  const toggleTablet = () => {
    if (tabletMode) {
      searchParams.delete('tablet');
    } else {
      searchParams.set('tablet', '1');
    }
    setSearchParams(searchParams, { replace: true });
  };

  const { data: recent } = useQuery({
    queryKey: ['club-recent-checkins'],
    queryFn: async () => {
      const { data } = await api.get<RecentCheckIn[]>('/club/search/recent-checkins', { params: { limit: 20 } });
      return data;
    },
    refetchInterval: 60_000,
  });

  const { data: searchResult, isFetching: searching } = useQuery({
    queryKey: ['club-universal-search', query],
    enabled: query.trim().length >= 2 && !memberOpen,
    queryFn: () => searchClubMembers(query),
  });

  const { data: member, refetch: refetchMember, isFetching: loadingMember } = useQuery({
    queryKey: ['club-reception-member', selectedId],
    enabled: selectedId != null,
    queryFn: async () => {
      const { data: m } = await api.get(`/club-members/${selectedId}`);
      return m as ClubMemberListItem;
    },
  });

  const { data: subs, refetch: refetchSubs, isFetching: loadingSubs } = useQuery({
    queryKey: ['club-reception-subs', selectedId],
    enabled: selectedId != null,
    queryFn: async () => {
      const { data: list } = await api.get<{ data: ClubSubscriptionListItem[] }>('/club-subscriptions', {
        params: { memberId: selectedId, pageSize: 50 },
      });
      return list.data;
    },
  });

  /** Active / frozen first; expired (and exhausted sessions) sink to the bottom. */
  const sortedSubs = useMemo(() => {
    const list = [...(subs ?? [])];
    const isExpiredLike = (s: ClubSubscriptionListItem) => {
      const st = String(s.status ?? '').toLowerCase();
      if (st === 'expired') return true;
      if (s.isLinkedToSessions) {
        const remaining = Math.max(0, (s.sessionsCount ?? 0) - (s.sessionsUsed ?? 0));
        if ((s.sessionsCount ?? 0) > 0 && remaining <= 0) return true;
      }
      return false;
    };
    const rank = (s: ClubSubscriptionListItem) => {
      if (isExpiredLike(s)) return 3;
      const st = String(s.status ?? '').toLowerCase();
      if (st === 'upcoming') return 2;
      if (st === 'frozen') return 1;
      return 0; // active
    };
    list.sort((a, b) => {
      const diff = rank(a) - rank(b);
      if (diff !== 0) return diff;
      return (b.id ?? 0) - (a.id ?? 0);
    });
    return list;
  }, [subs]);

  const paymentSub = useMemo(
    () => (paySubId != null ? (subs ?? []).find((s) => s.id === paySubId) ?? null : null),
    [paySubId, subs],
  );

  const renewSub = useMemo(
    () => (renewSubId != null ? (subs ?? []).find((s) => s.id === renewSubId) ?? null : null),
    [renewSubId, subs],
  );

  const refundSub = useMemo(
    () => (refundSubId != null ? (subs ?? []).find((s) => s.id === refundSubId) ?? null : null),
    [refundSubId, subs],
  );

  const transferSub = useMemo(
    () => (transferSubId != null ? (subs ?? []).find((s) => s.id === transferSubId) ?? null : null),
    [transferSubId, subs],
  );

  const transferTargetType = useMemo(
    () =>
      transferForm.toSubscriptionTypeId
        ? (subTypes ?? []).find((t) => t.id === Number(transferForm.toSubscriptionTypeId)) ?? null
        : null,
    [transferForm.toSubscriptionTypeId, subTypes],
  );

  const renewNetValue = renewSub ? subscriptionNetValue(renewSub) : 0;
  const renewPaidNow = Math.max(0, Number(renewForm.paidAmount) || 0);
  const renewRemaining = Math.max(0, renewNetValue - renewPaidNow);

  const transferNewPrice = Number(transferForm.toValue) || transferTargetType?.price || 0;
  const transferCredit = transferCreditPreview?.refundAmount ?? 0;
  const transferDiff = transferNewPrice - transferCredit;

  useEffect(() => {
    if (!transferOpen || !transferForm.toSubscriptionTypeId || !transferForm.toStartDate) return;
    const type = (subTypes ?? []).find((t) => t.id === Number(transferForm.toSubscriptionTypeId));
    if (!type) return;
    setTransferForm((f) => ({
      ...f,
      toEndDate: type.isLinkedToSessions ? '' : addDaysLocal(f.toStartDate, type.days),
      toValue: String(type.price),
    }));
  }, [transferOpen, transferForm.toSubscriptionTypeId, transferForm.toStartDate, subTypes]);

  useEffect(() => {
    if (!refundOpen || !refundSubId || !refundStopDate) {
      setRefundPreview(null);
      return;
    }
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const { data } = await api.post<{ preview?: RefundPreview } & RefundPreview>(
            '/club-subscription-refunds?dryRun=true',
            { subscriptionId: refundSubId, stopDate: refundStopDate },
          );
          const p = (data as { preview?: RefundPreview }).preview ?? data;
          if (p && typeof p === 'object' && 'refundAmount' in p) {
            setRefundPreview(p as RefundPreview);
          }
        } catch (e) {
          setRefundPreview(null);
          toast.error(apiError(e));
        }
      })();
    }, 300);
    return () => window.clearTimeout(timer);
  }, [refundOpen, refundSubId, refundStopDate]);

  useEffect(() => {
    if (!transferOpen || !transferSubId) {
      setTransferCreditPreview(null);
      return;
    }
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const { data } = await api.post<{ preview?: RefundPreview } & RefundPreview>(
            '/club-subscription-refunds?dryRun=true',
            { subscriptionId: transferSubId, stopDate: localToday() },
          );
          const p = (data as { preview?: RefundPreview }).preview ?? data;
          if (p && typeof p === 'object' && 'refundAmount' in p) {
            setTransferCreditPreview(p as RefundPreview);
          } else {
            setTransferCreditPreview(null);
          }
        } catch {
          // No refundable credit (unpaid / exhausted) — still allow transfer with 0 credit.
          setTransferCreditPreview(null);
        }
      })();
    }, 200);
    return () => window.clearTimeout(timer);
  }, [transferOpen, transferSubId]);

  const { data: subscriptionReceipts = [], isLoading: loadingSubscriptionReceipts } = useQuery({
    queryKey: ['club-receipts', 'by-subscription', paySubId],
    queryFn: async () => {
      const { data } = await api.get<{ data: SubscriptionPaymentReceiptRow[] }>('/club-receipts', {
        params: { subscriptionId: paySubId, pageSize: 100, page: 1 },
      });
      return data.data ?? [];
    },
    enabled: paymentOpen && paySubId != null,
  });

  const refreshEntitlement = async (memberId: number) => {
    try {
      const { data } = await api.get<EntitlementResult>('/club/entitlement/validate', {
        params: { memberId },
      });
      setEntitlement(data);
    } catch {
      setEntitlement(null);
    }
  };

  const selectMember = async (hit: ClubSearchHit) => {
    setSelectedId(hit.id);
    setQuery(hit.memberCode);
    setMemberOpen(true);
    await refreshEntitlement(hit.id);
  };

  const closeMemberPanel = (open: boolean) => {
    setMemberOpen(open);
    if (!open) {
      setSelectedId(null);
      setEntitlement(null);
      setQuery('');
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  };

  const runSearch = async () => {
    const q = query.trim();
    if (q.length < 2) {
      toast.error(ct('members.enterCode'));
      return;
    }
    try {
      // Always use the current input instead of a result cached for the
      // previously displayed member.
      const latestResult = await searchClubMembers(q);
      const nextMember = latestResult.topMatch ?? latestResult.hits?.[0];
      if (nextMember) {
        await selectMember(nextMember);
        return;
      }
    } catch (e) {
      toast.error(apiError(e));
      return;
    }
    toast.error(ct('members.noMemberFound'));
  };

  const checkIn = async (subscriptionId?: number, force = false) => {
    if (!selectedId) return;
    setSaving(true);
    try {
      const { data } = await api.post<CheckInResponse>('/club-attendance/check-in', {
        memberId: selectedId,
        subscriptionId,
        consumeSession: true,
        force,
        overrideReason: force ? overrideReason : undefined,
      });
      setEntitlement(data.entitlement);
      const sub = data.entitlement.activeSubscription;
      const detail =
        sub?.isLinkedToSessions && sub.sessionsRemaining != null
          ? `${ui('تبقّى')} ${sub.sessionsRemaining} ${ui('حصة')}`
          : (sub?.subscriptionType ?? '');
      const base = data.overridden
        ? ui('تم تسجيل الدخول (تجاوز)')
        : ct('members.checkInNamed', { name: data.attendance.memberName });
      toast.success(detail ? `${base} — ${detail}` : base);
      setOverrideOpen(false);
      setOverrideReason('');
      setOverrideSubId(null);
      void qc.invalidateQueries({ queryKey: ['club-recent-checkins'] });
      void refetchSubs();
    } catch (e) {
      const err = e as { response?: { data?: { entitlement?: EntitlementResult } } };
      const deniedEntitlement = err.response?.data?.entitlement;
      if (deniedEntitlement) setEntitlement(deniedEntitlement);
      if (!force && deniedEntitlement && deniedEntitlement.allowed === false) {
        setOverrideSubId(subscriptionId ?? null);
        setOverrideOpen(true);
      } else {
        toast.error(apiError(e));
      }
    } finally {
      setSaving(false);
    }
  };

  const pay = async () => {
    if (!paySubId) return;
    const amount = Number(payAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error(ui('أدخل مبلغاً صحيحاً'));
      return;
    }
    if (payMaxRemaining > 0 && amount > payMaxRemaining) {
      toast.error(ct('subscriptions.amountExceedsRemaining'));
      return;
    }
    setSaving(true);
    try {
      const { data: result } = await api.patch<{
        subscription: ClubSubscriptionListItem;
        paymentAmount: number;
      }>(`/club-subscriptions/${paySubId}/payment`, { paymentAmount: amount });
      if (result.subscription) {
        setPayMaxRemaining(result.subscription.remainingAmount);
      }
      void qc.invalidateQueries({ queryKey: ['club-receipts', 'by-subscription', paySubId] });
      toast.success(ct('common.success'));
      setPaymentOpen(false);
      void refetchSubs();
      if (selectedId) await refreshEntitlement(selectedId);
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const submitFreeze = async () => {
    if (!freezeSubId) return;
    setSaving(true);
    try {
      await api.post(`/club-subscriptions/${freezeSubId}/freeze`, {
        reason: freezeForm.reason.trim() || undefined,
      });
      toast.success(ct('common.success'));
      setFreezeOpen(false);
      void refetchSubs();
      if (selectedId) await refreshEntitlement(selectedId);
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const submitRenew = async () => {
    if (!renewSubId) return;
    const trimmed = renewForm.paidAmount.trim();
    const body: { paidAmount?: number; paymentMethod?: string } = {};
    if (trimmed) {
      const amount = Number(trimmed);
      if (!Number.isFinite(amount) || amount < 0) {
        toast.error(ct('subscriptions.invalidAmount'));
        return;
      }
      if (amount > renewNetValue) {
        toast.error(ct('subscriptions.amountExceedsRemaining'));
        return;
      }
      if (amount > 0) {
        body.paidAmount = amount;
        body.paymentMethod = renewForm.paymentMethod;
      }
    }
    setSaving(true);
    try {
      await api.patch(`/club-subscriptions/${renewSubId}/renew`, body);
      toast.success(ct('common.success'));
      setRenewOpen(false);
      void refetchSubs();
      if (selectedId) await refreshEntitlement(selectedId);
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const unfreeze = async (id: number) => {
    const ok = await confirm({ title: ct('subscriptions.unfreezeConfirm') });
    if (!ok) return;
    setSaving(true);
    try {
      await api.post(`/club-subscriptions/${id}/unfreeze`, {});
      toast.success(ct('common.success'));
      void refetchSubs();
      if (selectedId) await refreshEntitlement(selectedId);
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const submitRefund = async () => {
    if (!refundSubId || !refundPreview) return;
    setSaving(true);
    try {
      const ok = await confirmWithPreview(
        {
          title: ct('subscriptions.refundTitle'),
          description: ct('subscriptions.refundPayoutDesc'),
          confirmLabel: ct('subscriptions.refundPayoutAction'),
          variant: 'destructive',
        },
        async () => {
          const { data } = await api.post('/club-subscription-refunds?dryRun=true', {
            subscriptionId: refundSubId,
            stopDate: refundStopDate,
            reason: refundReason || undefined,
            notes: refundNotes || undefined,
          });
          return {
            rows: (data as { rows?: { label: string; after?: string }[] }).rows,
            warning: (data as { warning?: string }).warning ?? ct('subscriptions.refundPayoutWarning'),
          };
        },
        async () => {
          await api.post('/club-subscription-refunds', {
            subscriptionId: refundSubId,
            stopDate: refundStopDate,
            reason: refundReason || undefined,
            notes: refundNotes || undefined,
          });
        },
      );
      if (ok) {
        toast.success(ct('subscriptions.refundPayoutSuccess'));
        setRefundOpen(false);
        void refetchSubs();
        if (selectedId) await refreshEntitlement(selectedId);
      }
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const saveTransfer = async () => {
    if (!transferSubId || !transferForm.toSubscriptionTypeId || !transferForm.toStartDate) {
      toast.error(ct('members.fillRequired'));
      return;
    }
    if (
      Boolean(transferSub?.isLinkedToSessions) !== Boolean(transferTargetType?.isLinkedToSessions)
    ) {
      toast.error(ct('subscriptions.transferKindMismatch'));
      return;
    }
    if (!transferTargetType?.isLinkedToSessions && !transferForm.toEndDate) {
      toast.error(ct('members.fillRequired'));
      return;
    }
    setSaving(true);
    try {
      await api.post('/club-subscription-transfers', {
        subscriptionId: transferSubId,
        toSubscriptionTypeId: Number(transferForm.toSubscriptionTypeId),
        toStartDate: transferForm.toStartDate,
        toEndDate: transferForm.toEndDate || transferForm.toStartDate,
      });
      toast.success(ct('common.success'));
      setTransferOpen(false);
      void refetchSubs();
      if (selectedId) await refreshEntitlement(selectedId);
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const hits = searchResult?.hits ?? [];
  const showHits = !memberOpen && query.trim().length >= 2 && hits.length > 0;

  return (
    <div
      className={
        tabletMode
          ? 'reception-tablet-shell mx-auto min-h-[calc(100vh-4rem)] max-w-5xl space-y-6 p-4 md:p-8'
          : 'mx-auto max-w-5xl space-y-6'
      }
    >
      <div className="flex items-start justify-between gap-4">
        <PageHeader
          title={ui('الاستقبال')}
          description={ui('ابحث عن العضو — تفتح بطاقته مع الاشتراكات والإجراءات فورًا')}
        />
        <Button
          variant="outline"
          size="icon"
          onClick={toggleTablet}
          title={tabletMode ? ui('وضع عادي') : ui('وضع تابلت')}
        >
          {tabletMode ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
        </Button>
      </div>

      {!tabletMode && <WorkspaceWidgets />}

      <div
        className={cn(
          'relative overflow-hidden rounded-3xl border bg-card shadow-sm',
          tabletMode ? 'p-6 md:p-10' : 'p-5 md:p-8',
        )}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1.5 bg-brand-gradient" />
        <div className="mb-4 space-y-1">
          <h2 className="text-lg font-semibold tracking-tight">{ui('بحث سريع عن العضو')}</h2>
          <p className="text-sm text-muted-foreground">
            {ui('اكتب الاسم أو الموبايل أو الكود أو الباركود ثم اضغط زر الإدخال')}
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={inputRef}
              className={cn(tabletMode ? 'h-16 ps-12 text-xl' : 'h-14 ps-11 text-lg', 'rounded-2xl')}
              placeholder={ui('اسم · موبايل · كود · باركود · رقم قومي')}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                if (memberOpen) {
                  setMemberOpen(false);
                  setSelectedId(null);
                  setEntitlement(null);
                }
              }}
              onKeyDown={(e) => e.key === 'Enter' && void runSearch()}
              autoFocus
            />
          </div>
          <Button
            variant="brand"
            size="lg"
            className={cn('rounded-2xl px-8', tabletMode ? 'h-16' : 'h-14')}
            onClick={() => void runSearch()}
            disabled={searching}
          >
            <Search className="size-5" /> {ui('بحث')}
          </Button>
        </div>

        {showHits && (
          <div className="mt-4 max-h-72 space-y-2 overflow-y-auto rounded-2xl border bg-muted/20 p-2">
            {hits.map((h) => (
              <button
                key={h.id}
                type="button"
                onClick={() => void selectMember(h)}
                className="flex w-full items-center gap-3 rounded-xl border border-transparent bg-card px-3 py-3 text-start transition hover:border-primary/30 hover:bg-primary/5"
              >
                <MemberAvatar name={h.name} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{h.name}</p>
                  <p className="text-xs text-muted-foreground nums">
                    {h.memberCode}
                    {h.phone ? ` · ${h.phone}` : ''}
                  </p>
                </div>
                {h.activeSubscriptionType && (
                  <span className="hidden rounded-full bg-primary/10 px-2.5 py-1 text-xs text-primary sm:inline">
                    {h.activeSubscriptionType}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}


      </div>

      {memberOpen && (
        <div className="relative overflow-hidden rounded-3xl border bg-card p-6 md:p-8 shadow-sm space-y-6">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-1.5 bg-brand-gradient" />
          
          {/* Header of the Inline Card */}
          <div className="flex items-center justify-between border-b pb-4">
            <div className="flex items-center gap-3">
              <User className="size-6 text-primary" />
              <h2 className="text-xl font-bold tracking-tight">
                {ui('ملف العضو والتفاصيل')}
              </h2>
            </div>
            <Button
              variant="outline"
              size="icon"
              disabled={loadingMember || loadingSubs}
              onClick={() => {
                void refetchMember();
                void refetchSubs();
                if (selectedId) void refreshEntitlement(selectedId);
              }}
              className="size-8"
            >
              <RefreshCw className={cn('size-4', (loadingMember || loadingSubs) && 'animate-spin')} />
            </Button>
          </div>

          {/* Main content split layout */}
          <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6 items-start">
            
            {/* Right Sidebar: Profile & Personal Details Card */}
            <div className="space-y-4">
              <div className="rounded-2xl border bg-gradient-to-b from-card via-card to-muted/20 p-5 shadow-sm space-y-4 relative overflow-hidden">
                <div className="absolute top-0 inset-x-0 h-1.5 bg-brand-gradient" />
                
                {/* Avatar and Basic Header */}
                <div className="flex flex-col items-center text-center space-y-3 pt-2">
                  <MemberAvatar
                    name={member?.name}
                    profilePicture={member?.profilePicture}
                    size="lg"
                    className="size-20 text-2xl ring-2 ring-primary/20 shadow-md"
                  />
                  <div className="space-y-1">
                    <h3 className="text-lg font-bold leading-tight text-foreground">{member?.name ?? ui('جاري التحميل…')}</h3>
                    <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-mono font-medium bg-muted text-muted-foreground nums">
                      {member?.memberCode}
                    </span>
                  </div>
                </div>
                
                {/* Basic Details List */}
                <div className="border-t pt-4 space-y-2.5 text-xs">
                  <p className="font-semibold text-muted-foreground pb-1">{ui('البيانات الشخصية')}</p>
                  
                  {/* Branch */}
                  <div className="flex items-center justify-between gap-2 border-b border-border/40 pb-1.5">
                    <span className="text-muted-foreground flex items-center gap-1.5">
                      <MapPin className="size-3.5 text-muted-foreground/75" /> {ui('الفرع')}:
                    </span>
                    <span className="font-medium">{branches?.find((b) => b.id === member?.branchId)?.name ?? '—'}</span>
                  </div>

                  {/* Phone */}
                  {member?.phone && (
                    <div className="flex items-center justify-between gap-2 border-b border-border/40 pb-1.5">
                      <span className="text-muted-foreground flex items-center gap-1.5">
                        <Phone className="size-3.5 text-muted-foreground/75" /> {ui('الموبايل')}:
                      </span>
                      <span className="font-medium nums" dir="ltr">{member.phone}</span>
                    </div>
                  )}
                  
                  {/* Gender */}
                  <div className="flex items-center justify-between gap-2 border-b border-border/40 pb-1.5">
                    <span className="text-muted-foreground flex items-center gap-1.5">
                      <User className="size-3.5 text-muted-foreground/75" /> {ui('النوع')}:
                    </span>
                    <span className="font-medium">
                      {member?.gender === 'male' ? ct('common.male') : ct('common.female')}
                    </span>
                  </div>

                  {/* Date of Birth */}
                  {member?.dateOfBirth && (
                    <div className="flex items-center justify-between gap-2 border-b border-border/40 pb-1.5">
                      <span className="text-muted-foreground flex items-center gap-1.5">
                        <Calendar className="size-3.5 text-muted-foreground/75" /> {ui('تاريخ الميلاد')}:
                      </span>
                      <span className="font-medium nums">{member.dateOfBirth}</span>
                    </div>
                  )}

                  {/* National ID / Card Number */}
                  {member?.cardNumber && (
                    <div className="flex items-center justify-between gap-2 border-b border-border/40 pb-1.5">
                      <span className="text-muted-foreground flex items-center gap-1.5">
                        <CreditCard className="size-3.5 text-muted-foreground/75" /> {ui('الرقم القومي')}:
                      </span>
                      <span className="font-medium nums">{member.cardNumber}</span>
                    </div>
                  )}

                  {/* Email */}
                  {member?.email && (
                    <div className="flex flex-col gap-1 border-b border-border/40 pb-1.5">
                      <span className="text-muted-foreground flex items-center gap-1.5">
                        <Mail className="size-3.5 text-muted-foreground/75" /> {ui('البريد الإلكتروني')}:
                      </span>
                      <span className="font-medium truncate block max-w-full text-start text-muted-foreground" title={member.email}>
                        {member.email}
                      </span>
                    </div>
                  )}

                  {/* Address */}
                  {member?.address && (
                    <div className="flex flex-col gap-1 border-b border-border/40 pb-1.5">
                      <span className="text-muted-foreground flex items-center gap-1.5">
                        <MapPin className="size-3.5 text-muted-foreground/75" /> {ui('العنوان')}:
                      </span>
                      <span className="font-medium text-start leading-tight">{member.address}</span>
                    </div>
                  )}

                  {/* Marital Status */}
                  {member?.maritalStatus && (
                    <div className="flex items-center justify-between gap-2 border-b border-border/40 pb-1.5">
                      <span className="text-muted-foreground flex items-center gap-1.5">
                        <Info className="size-3.5 text-muted-foreground/75" /> {ui('الحالة الاجتماعية')}:
                      </span>
                      <span className="font-medium">
                        {member.maritalStatus === 'single'
                          ? ui('أعزب')
                          : member.maritalStatus === 'married'
                            ? ui('متزوج')
                            : member.maritalStatus === 'divorced'
                              ? ui('مطلق')
                              : member.maritalStatus === 'widowed'
                                ? ui('أرمل')
                                : member.maritalStatus}
                      </span>
                    </div>
                  )}

                  {/* Job Title */}
                  {member?.jobTitle && (
                    <div className="flex items-center justify-between gap-2 border-b border-border/40 pb-1.5">
                      <span className="text-muted-foreground flex items-center gap-1.5">
                        <Briefcase className="size-3.5 text-muted-foreground/75" /> {ui('الوظيفة')}:
                      </span>
                      <span className="font-medium">{member.jobTitle}</span>
                    </div>
                  )}
                </div>

                {/* Emergency Contact */}
                {(member?.emergencyName || member?.emergencyPhone) && (
                  <div className="border-t pt-3 space-y-2 text-xs">
                    <p className="font-semibold text-muted-foreground pb-0.5">{ui('اتصال الطوارئ')}</p>
                    
                    {member.emergencyName && (
                      <div className="flex items-center justify-between gap-2 border-b border-border/20 pb-1">
                        <span className="text-muted-foreground">{ui('الاسم')}:</span>
                        <span className="font-medium">{member.emergencyName}</span>
                      </div>
                    )}
                    
                    {member.emergencyPhone && (
                      <div className="flex items-center justify-between gap-2 border-b border-border/20 pb-1">
                        <span className="text-muted-foreground">{ui('الموبايل')}:</span>
                        <span className="font-medium nums" dir="ltr">{member.emergencyPhone}</span>
                      </div>
                    )}
                    
                    {member.emergencyRelation && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">{ui('الصلة')}:</span>
                        <span className="font-medium">{member.emergencyRelation}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Guardian Contact (If emergency is child) */}
                {(member?.guardianName || member?.guardianPhone) && (
                  <div className="border-t pt-3 space-y-2 text-xs">
                    <p className="font-semibold text-muted-foreground pb-0.5">{ui('بيانات ولي الأمر')}</p>
                    {member.guardianName && (
                      <div className="flex items-center justify-between gap-2 border-b border-border/20 pb-1">
                        <span className="text-muted-foreground">{ui('الاسم')}:</span>
                        <span className="font-medium">{member.guardianName}</span>
                      </div>
                    )}
                    {member.guardianPhone && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">{ui('الموبايل')}:</span>
                        <span className="font-medium nums" dir="ltr">{member.guardianPhone}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Trainer & Source */}
                {(member?.trainerId || member?.sourceId) && (
                  <div className="border-t pt-3 space-y-2 text-xs">
                    <p className="font-semibold text-muted-foreground pb-0.5">{ui('بيانات إدارية')}</p>
                    {member?.trainerId && (
                      <div className="flex items-center justify-between gap-2 border-b border-border/20 pb-1">
                        <span className="text-muted-foreground flex items-center gap-1">
                          <Heart className="size-3 text-muted-foreground/75" /> {ui('المدرب الشخصي')}:
                        </span>
                        <span className="font-medium">
                          {trainers?.find((t) => t.id === Number(member.trainerId))?.name ?? '—'}
                        </span>
                      </div>
                    )}
                    {member?.sourceId && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">{ui('مصدر التعارف')}:</span>
                        <span className="font-medium">
                          {customerSources?.find((s) => s.id === Number(member.sourceId))?.name ?? '—'}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Notes Section */}
                {member?.notes && (
                  <div className="border-t pt-3 space-y-1.5 text-xs">
                    <p className="font-semibold text-muted-foreground">{ui('ملاحظات إضافية')}</p>
                    <div className="bg-muted/30 p-2 rounded-xl border-s-2 border-primary/50 text-muted-foreground leading-relaxed italic text-start">
                      {member.notes}
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            {/* Left Column: Subscriptions & Actions Dashboard */}
            <div className="space-y-4 flex flex-col min-w-0">
              {/* Entitlement Status Banner */}
              {entitlement && (
                <div className="shrink-0">
                  <EntitlementBanner entitlement={entitlement} />
                </div>
              )}
              
              {/* Subscriptions Card & Table */}
              <div className="space-y-3 flex-1 flex flex-col min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <CreditCard className="size-4 text-primary" />
                    <h3 className="font-semibold">{ui('الاشتراكات وحالة الاشتراك الحالية')}</h3>
                    <span className="text-sm text-muted-foreground nums">
                      ({sortedSubs.length})
                    </span>
                  </div>
                </div>

                {sortedSubs.length === 0 && !loadingSubs ? (
                  <div className="rounded-2xl border border-dashed bg-muted/20 px-4 py-12 text-center text-sm text-muted-foreground flex flex-col items-center justify-center">
                    <CreditCard className="size-8 text-muted-foreground/60 mb-2" />
                    <span>{ui('لا توجد أي اشتراكات مسجلة لهذا العضو')}</span>
                  </div>
                ) : (
                  <div className="rounded-2xl border bg-card overflow-hidden shadow-sm flex flex-col">
                    <div className="overflow-x-auto w-full max-h-[480px]">
                      <table className="w-full text-sm border-collapse">
                        <thead className="bg-muted/50 sticky top-0 z-10 border-b">
                          <tr>
                            <th className="p-3 text-start font-semibold text-muted-foreground">{ui('نوع الاشتراك')}</th>
                            <th className="p-3 text-start font-semibold text-muted-foreground">{ui('الحالة')}</th>
                            <th className="p-3 text-start font-semibold text-muted-foreground">{ui('الصلاحية / الحصص')}</th>
                            <th className="p-3 text-start font-semibold text-muted-foreground">{ui('المالية')}</th>
                            <th className="p-3 text-end font-semibold text-muted-foreground">{ui('الإجراءات السريعة')}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/50">
                          {sortedSubs.map((s) => {
                            const sessions = !!s.isLinkedToSessions;
                            const remainingSessions = Math.max(0, (s.sessionsCount ?? 0) - (s.sessionsUsed ?? 0));
                            const status = s.status as string;
                            const active = status === 'active';
                            const frozen = status === 'frozen';
                            return (
                              <tr key={s.id} className="hover:bg-muted/20 transition-colors group">
                                {/* Subscription Type */}
                                <td className="p-3 font-semibold text-foreground/90 max-w-[170px] truncate" title={s.subscriptionType ?? ''}>
                                  {s.subscriptionType ?? '—'}
                                </td>
                                
                                {/* StatusBadge */}
                                <td className="p-3 align-middle">
                                  <StatusBadge
                                    status={
                                      frozen
                                        ? 'info'
                                        : active
                                          ? 'active'
                                          : status === 'expired'
                                            ? 'expired'
                                            : 'pending'
                                    }
                                    label={frozen ? ct('subscriptions.frozen') : undefined}
                                  />
                                </td>

                                {/* Validity info */}
                                <td className="p-3 align-middle font-medium nums">
                                  {sessions ? (
                                    <div className="flex flex-col gap-0.5">
                                      <span className="text-primary font-bold text-xs bg-primary/10 px-2 py-0.5 rounded-full w-fit">
                                        {remainingSessions} / {s.sessionsCount ?? 0} {ui('حصة')}
                                      </span>
                                      <span className="text-[10px] text-muted-foreground">
                                        {ui('المستهلك')}: {s.sessionsUsed ?? 0}
                                      </span>
                                    </div>
                                  ) : (
                                    <div className="flex flex-col text-xs gap-0.5">
                                      <span className="text-muted-foreground">{ui('تاريخ الانتهاء')}:</span>
                                      <span className="font-semibold text-foreground/80">{s.subscriptionEndDate}</span>
                                    </div>
                                  )}
                                </td>

                                {/* Financial details */}
                                <td className="p-3 align-middle text-xs">
                                  <div className="flex flex-col gap-1 font-medium nums">
                                    <div>
                                      <span className="text-muted-foreground">{ui('القيمة')}:</span>{' '}
                                      <span className="font-semibold text-foreground/90">{formatMoney(s.subscriptionValue)}</span>
                                    </div>
                                    {s.remainingAmount > 0 ? (
                                      <div className="text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full w-fit font-bold">
                                        <span>{ui('متبقي')}:</span>{' '}
                                        <span>{formatMoney(s.remainingAmount)}</span>
                                      </div>
                                    ) : (
                                      <div className="text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full w-fit">
                                        {ui('مدفوع بالكامل')}
                                      </div>
                                    )}
                                  </div>
                                </td>

                                {/* Action buttons */}
                                <td className="p-3 align-middle text-end">
                                  <div className="flex items-center justify-end gap-1.5 flex-wrap">
                                    {s.remainingAmount > 0 && (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-8 text-xs gap-1"
                                        onClick={() => {
                                          setPaySubId(s.id);
                                          setPayMaxRemaining(s.remainingAmount);
                                          setPayAmount(String(s.remainingAmount));
                                          setPaymentOpen(true);
                                        }}
                                      >
                                        {ct('subscriptions.pay')}
                                      </Button>
                                    )}

                                    {active && (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-8 text-xs gap-1"
                                        onClick={() => {
                                          setFreezeSubId(s.id);
                                          setFreezeForm({ reason: '' });
                                          setFreezeOpen(true);
                                        }}
                                      >
                                        <Snowflake className="size-3.5 text-sky-500" />
                                        {ct('subscriptions.freeze')}
                                      </Button>
                                    )}

                                    {frozen && (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-8 text-xs gap-1"
                                        disabled={saving}
                                        onClick={() => void unfreeze(s.id)}
                                      >
                                        <Sun className="size-3.5 text-amber-500" />
                                        {ct('subscriptions.unfreeze')}
                                      </Button>
                                    )}

                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-8 text-xs gap-1"
                                      onClick={() => {
                                        setRenewSubId(s.id);
                                        const net = subscriptionNetValue(s);
                                        setRenewForm({
                                          paidAmount: String(net),
                                          paymentMethod: (s.paymentMethod as string) || 'cash',
                                        });
                                        setRenewOpen(true);
                                      }}
                                    >
                                      <RefreshCw className="size-3.5" />
                                      {ct('subscriptions.renew')}
                                    </Button>

                                    {active && !frozen && (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-8 text-xs gap-1"
                                        onClick={() => {
                                          setTransferSubId(s.id);
                                          setTransferForm({
                                            toSubscriptionTypeId: '',
                                            toStartDate: localToday(),
                                            toEndDate: '',
                                            toValue: '',
                                          });
                                          setTransferCreditPreview(null);
                                          setTransferOpen(true);
                                        }}
                                      >
                                        <ArrowRightLeft className="size-3.5" />
                                        {ct('subscriptions.transferPlan')}
                                      </Button>
                                    )}

                                    {active && s.paidAmount > 0 && (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-8 text-xs gap-1 text-destructive hover:bg-destructive/5 hover:text-destructive"
                                        onClick={() => {
                                          setRefundSubId(s.id);
                                          setRefundStopDate(localToday());
                                          setRefundReason('');
                                          setRefundNotes('');
                                          setRefundPreview(null);
                                          setRefundOpen(true);
                                        }}
                                      >
                                        <Undo2 className="size-3.5" />
                                        {ct('subscriptions.refundAction')}
                                      </Button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>

          </div>

          {/* Footer of the Card */}
          <div className="border-t pt-4 flex justify-between items-center">
            <Button
              variant="outline"
              onClick={() => closeMemberPanel(false)}
              className="px-5"
            >
              {ui('إغلاق')}
            </Button>
            
            <Button
              variant="brand"
              disabled={!member}
              className="min-w-[12rem] gap-2 shadow-md shadow-primary/10"
              onClick={() => {
                if (!member) return;
                setMemberOpen(false);
                navigate('/club/subscriptions/new', { state: { prefillMember: member } });
              }}
            >
              <Plus className="size-4" />
              {ct('subscriptions.addNewSubscription')}
            </Button>
          </div>
        </div>
      )}

      <Dialog open={overrideOpen} onOpenChange={setOverrideOpen}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>{ui('تجاوز رفض الدخول')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2">
            <Label>{ui('سبب التجاوز (إلزامي)')}</Label>
            <Textarea value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} rows={3} />
          </div>
          <DialogFooter>
            <Button
              variant="brand"
              disabled={!overrideReason.trim() || saving}
              onClick={() => void checkIn(overrideSubId ?? undefined, true)}
            >
              {ui('تأكيد الدخول')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={paymentOpen}
        onOpenChange={(open) => {
          setPaymentOpen(open);
          if (!open) {
            setPaySubId(null);
            setPayMaxRemaining(0);
          }
        }}
      >
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>{ct('subscriptions.paymentTitle')}</DialogTitle>
          </DialogHeader>
          {paymentSub && (
            <SubscriptionPaymentPanel
              value={subscriptionNetValue(paymentSub)}
              paid={paymentSub.paidAmount}
              remaining={payMaxRemaining}
              receipts={subscriptionReceipts}
              loading={loadingSubscriptionReceipts}
            />
          )}
          <FieldWrapper label={ct('common.amount')} hint={ct('subscriptions.partialPaymentHint')}>
            <Input
              className="nums text-lg"
              type="number"
              min={0}
              max={payMaxRemaining > 0 ? payMaxRemaining : undefined}
              step="any"
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
            />
          </FieldWrapper>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setPaymentOpen(false)}>
              {ct('common.cancel')}
            </Button>
            <Button variant="brand" onClick={() => void pay()} disabled={saving}>
              {ct('subscriptions.pay')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={freezeOpen} onOpenChange={setFreezeOpen}>
        <DialogContent size="sm" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{ct('subscriptions.freezeTitle')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <p className="text-sm text-muted-foreground">{ct('subscriptions.freezePreserveHint')}</p>
            <div className="grid gap-2">
              <Label>{ct('subscriptions.freezeReason')}</Label>
              <Input
                value={freezeForm.reason}
                onChange={(e) => setFreezeForm((f) => ({ ...f, reason: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFreezeOpen(false)}>
              {ct('common.cancel')}
            </Button>
            <Button variant="brand" onClick={() => void submitFreeze()} disabled={saving}>
              {saving ? ct('common.saving') : ct('subscriptions.freeze')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={renewOpen}
        onOpenChange={(open) => {
          setRenewOpen(open);
          if (!open) setRenewSubId(null);
        }}
      >
        <DialogContent size="md" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{ct('subscriptions.renewTitle')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            {renewSub && (
              <DialogFormSummary
                items={[
                  {
                    label: ct('subscriptions.value'),
                    value: formatMoney(renewNetValue),
                  },
                  {
                    label: ct('subscriptions.paid'),
                    value: formatMoney(renewPaidNow),
                    accent: 'success',
                  },
                  {
                    label: ct('subscriptions.remaining'),
                    value: formatMoney(renewRemaining),
                    accent: 'warning',
                  },
                ]}
              />
            )}
            <div className="grid gap-2">
              <Label>{ct('subscriptions.renewPaidAmount')}</Label>
              <Input
                className="nums text-lg"
                type="number"
                min={0}
                max={renewNetValue > 0 ? renewNetValue : undefined}
                step="any"
                placeholder={ct('subscriptions.renewPaidHint')}
                value={renewForm.paidAmount}
                onChange={(e) => setRenewForm((f) => ({ ...f, paidAmount: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">{ct('subscriptions.partialPaymentHint')}</p>
            </div>
            <div className="grid gap-2">
              <Label>{ct('subscriptions.paymentMethod')}</Label>
              <select
                className={selectCls}
                value={renewForm.paymentMethod}
                onChange={(e) => setRenewForm((f) => ({ ...f, paymentMethod: e.target.value }))}
              >
                <option value="cash">{ct('subscriptions.methodCash')}</option>
                <option value="card">{ct('subscriptions.methodCard')}</option>
                <option value="bank">{ct('subscriptions.methodBank')}</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenewOpen(false)}>
              {ct('common.cancel')}
            </Button>
            <Button variant="brand" onClick={() => void submitRenew()} disabled={saving}>
              {saving ? ct('common.saving') : ct('subscriptions.renew')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={refundOpen}
        onOpenChange={(open) => {
          setRefundOpen(open);
          if (!open) {
            setRefundSubId(null);
            setRefundPreview(null);
          }
        }}
      >
        <DialogContent size="md" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{ct('subscriptions.refundTitle')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            {refundSub && (
              <p className="text-sm text-muted-foreground">
                {refundSub.subscriptionType ?? '—'} · {refundSub.subscriptionNumber}
              </p>
            )}
            <div className="grid gap-2">
              <Label>{ct('subscriptions.refundStopDate')}</Label>
              <Input
                type="date"
                className="nums"
                dir="ltr"
                value={refundStopDate}
                onChange={(e) => setRefundStopDate(e.target.value)}
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>{ct('subscriptions.refundReason')}</Label>
                <select
                  className={selectCls}
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                >
                  <option value="">—</option>
                  <option value="تراجع">{ct('subscriptions.reasonCancel')}</option>
                  <option value="مغادرة">{ct('subscriptions.reasonLeave')}</option>
                  <option value="أخرى">{ct('subscriptions.reasonOther')}</option>
                </select>
              </div>
              <div className="grid gap-2">
                <Label>{ct('subscriptions.refundNotes')}</Label>
                <Input value={refundNotes} onChange={(e) => setRefundNotes(e.target.value)} />
              </div>
            </div>

            {refundPreview && (
              <div className="space-y-3 rounded-2xl border border-primary/25 bg-primary/5 p-4">
                <p className="text-xs text-muted-foreground">
                  {refundPreview.refundBasis === 'sessions'
                    ? ct('subscriptions.refundCalcEquationSessions')
                    : ct('subscriptions.refundCalcEquation')}
                </p>
                <DialogFormSummary
                  items={[
                    {
                      label: ct('subscriptions.originalValue'),
                      value: formatMoney(refundPreview.originalValue),
                    },
                    {
                      label: ct('subscriptions.consumedValue'),
                      value: formatMoney(refundPreview.consumedValue),
                      accent: 'warning',
                    },
                    {
                      label: ct('subscriptions.refundAmount'),
                      value: formatMoney(refundPreview.refundAmount),
                      accent: 'success',
                    },
                  ]}
                />
                <div className="grid gap-1 text-sm nums text-muted-foreground">
                  {refundPreview.refundBasis === 'sessions' ? (
                    <p>
                      {ct('subscriptions.consumedSessions')}:{' '}
                      {Math.max(
                          0,
                          (refundSub?.sessionsCount ?? 0) - (refundPreview.remainingSessions ?? 0),
                        )}{' '}
                      / {refundSub?.sessionsCount ?? 0}
                    </p>
                  ) : (
                    <p>
                      {ct('subscriptions.consumedDays')}: {refundPreview.consumedDays} /{' '}
                      {refundPreview.totalDays} {ct('subscriptions.typeDays')}
                    </p>
                  )}
                  <p className="text-xs">{ct('subscriptions.refundPayoutWarning')}</p>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRefundOpen(false)}>
              {ct('common.cancel')}
            </Button>
            <Button
              variant="brand"
              disabled={saving || !refundPreview}
              onClick={() => void submitRefund()}
            >
              <Undo2 className="size-4" />
              {saving ? ct('common.saving') : ct('subscriptions.refundPayoutAction')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={transferOpen}
        onOpenChange={(open) => {
          setTransferOpen(open);
          if (!open) {
            setTransferSubId(null);
            setTransferCreditPreview(null);
          }
        }}
      >
        <DialogContent size="md" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{ct('subscriptions.transferPlan')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            {transferSub && (
              <div className="rounded-xl border bg-muted/20 px-3 py-2.5 text-sm">
                <p className="text-xs text-muted-foreground">{ct('subscriptions.transferCurrentPlan')}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <p className="font-medium">{transferSub.subscriptionType ?? '—'}</p>
                  <span
                    className={
                      transferSub.isLinkedToSessions
                        ? 'inline-flex items-center rounded-md bg-sky-500/10 px-2 py-0.5 text-[11px] font-medium text-sky-800 dark:text-sky-200'
                        : 'inline-flex items-center rounded-md bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-800 dark:text-emerald-200'
                    }
                  >
                    {transferSub.isLinkedToSessions
                      ? ct('packages.kindSessions')
                      : ct('packages.kindSubscription')}
                  </span>
                </div>
              </div>
            )}

            {transferCreditPreview && (
              <div className="space-y-2 rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4">
                <p className="text-xs text-muted-foreground">{ct('subscriptions.transferBalanceHint')}</p>
                <DialogFormSummary
                  items={[
                    {
                      label: ct('subscriptions.originalValue'),
                      value: formatMoney(transferCreditPreview.originalValue),
                    },
                    {
                      label: ct('subscriptions.consumedValue'),
                      value: formatMoney(transferCreditPreview.consumedValue),
                      accent: 'warning',
                    },
                    {
                      label: ct('subscriptions.transferCredit'),
                      value: formatMoney(transferCreditPreview.refundAmount),
                      accent: 'success',
                    },
                  ]}
                />
                <p className="text-xs nums text-muted-foreground">
                  {transferCreditPreview.refundBasis === 'sessions' ? (
                    <>
                      {ct('subscriptions.consumedSessions')}:{' '}
                      {Math.max(
                          0,
                          (transferSub?.sessionsCount ?? 0) -
                            (transferCreditPreview.remainingSessions ?? 0),
                        )}{' '}
                      / {transferSub?.sessionsCount ?? 0}
                    </>
                  ) : (
                    <>
                      {ct('subscriptions.consumedDays')}: {transferCreditPreview.consumedDays} /{' '}
                      {transferCreditPreview.totalDays}
                    </>
                  )}
                </p>
              </div>
            )}

            <div className="grid gap-2">
              <Label>{ct('subscriptions.transferToType')}</Label>
              <TransferPlanPicker
                types={subTypes ?? []}
                sourceIsSessions={Boolean(transferSub?.isLinkedToSessions)}
                excludeTypeId={transferSub?.subscriptionTypeId}
                value={transferForm.toSubscriptionTypeId}
                onChange={(typeId) =>
                  setTransferForm((f) => ({ ...f, toSubscriptionTypeId: typeId }))
                }
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>{ct('subscriptions.startDate')}</Label>
                <Input
                  type="date"
                  className="nums"
                  dir="ltr"
                  value={transferForm.toStartDate}
                  onChange={(e) => setTransferForm((f) => ({ ...f, toStartDate: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label>{ct('subscriptions.endDate')}</Label>
                {transferTargetType?.isLinkedToSessions ? (
                  <Input className="bg-muted" value={ct('subscriptions.noEndDate')} readOnly />
                ) : (
                  <Input type="date" className="nums bg-muted" dir="ltr" value={transferForm.toEndDate} readOnly />
                )}
              </div>
            </div>

            {transferTargetType && (
              <div className="space-y-2 rounded-2xl border border-primary/25 bg-primary/5 p-4">
                <DialogFormSummary
                  items={[
                    {
                      label: ct('subscriptions.transferNewPrice'),
                      value: formatMoney(transferNewPrice),
                    },
                    {
                      label: ct('subscriptions.transferCredit'),
                      value: formatMoney(transferCredit),
                      accent: 'success',
                    },
                    {
                      label:
                        transferDiff > 0
                          ? ct('subscriptions.transferPayMore')
                          : ct('subscriptions.transferCreditLeft'),
                      value: formatMoney(Math.abs(transferDiff)),
                      accent: transferDiff > 0 ? 'warning' : 'success',
                    },
                  ]}
                />
                <p className="text-xs text-muted-foreground">{ct('subscriptions.transferNoCashNote')}</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferOpen(false)}>
              {ct('common.cancel')}
            </Button>
            <Button variant="brand" onClick={() => void saveTransfer()} disabled={saving}>
              <ArrowRightLeft className="size-4" />
              {saving ? ct('common.saving') : ct('subscriptions.transferPlan')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
