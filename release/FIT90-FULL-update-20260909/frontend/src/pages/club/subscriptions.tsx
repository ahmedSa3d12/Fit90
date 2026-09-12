import type { ColumnDef } from '@tanstack/react-table';
import { useLocation } from 'react-router-dom';
import {
  CreditCard,
  FileText,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Repeat,
  Snowflake,
  Sun,
  Undo2,
  Printer,
  User,
  CalendarDays,
  Wallet,
  Sparkles,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { DataTable } from '@/components/common/data-table';
import { FilterBar, type FilterField } from '@/components/common/filter-bar';
import { PageHeader } from '@/components/common/page-header';
import { StatusBadge } from '@/components/common/status-badge';
import { ErrorState } from '@/components/common/states';
import { ClubStatCard } from '@/components/club/stat-card';
import { DialogFormGrid, DialogFormSection, DialogFormSummary, FormDialogBody, FormDialogFooter, FormDialogHeader, FORM_DIALOG_CONTENT_CLASS } from '@/components/common/dialog-form-layout';
import { FieldWrapper } from '@/components/common/form-fields';
import { MemberSearchCombobox } from '@/components/club/member-search-combobox';
import { SubscriptionTypeSelect, TransferPlanPicker } from '@/components/club/subscription-type-select';
import { SubscriptionInvoicePrint } from '@/components/club/subscription-invoice-print';
import { useOutputPermissions } from '@/hooks/use-output-permissions';
import { SubscriptionRefundsWorkspace } from '@/pages/club/subscription-refunds';
import {
  SubscriptionPaymentPanel,
  subscriptionNetValue,
  type SubscriptionPaymentReceiptRow,
} from '@/components/club/subscription-payment-panel';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useBranches } from '@/hooks/use-branches';
import { useClubT } from '@/hooks/use-club-t';
import { useLocale } from '@/store/locale';
import { useAuth } from '@/store/auth';
import { translateNavRoute } from '@/lib/nav';
import { api, apiError } from '@/lib/api';
import { localToday, formatMoney } from '@/lib/formatters';
import { useArrayResource, usePaginatedList } from '@/lib/api-hooks';
import { confirm, confirmWithPreview, afterMenuClose } from '@/lib/confirm';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import type { ClubSubscriptionsView } from '@/lib/club-routes';
import type { ClubMemberListItem, ClubSubscriptionListItem, ClubSubscriptionStatistics, ClubSubscriptionType } from '@/types/club';

const selectCls = 'flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm';
type BenefitKey = 'iceBath' | 'medicalFreeze' | 'inBody' | 'massage' | 'freeDays' | 'nutritionSessions' | 'ptSessions' | 'fitnessSessions' | 'freeze' | 'invitations';
const benefitKeys: BenefitKey[] = ['iceBath', 'medicalFreeze', 'inBody', 'massage', 'freeDays', 'nutritionSessions', 'ptSessions', 'fitnessSessions', 'freeze', 'invitations'];
const emptyBenefits = (): Record<BenefitKey, number> =>
  Object.fromEntries(benefitKeys.map((key) => [key, 0])) as Record<BenefitKey, number>;
const typeBenefits = (type?: ClubSubscriptionType): Record<BenefitKey, number> =>
  Object.fromEntries(benefitKeys.map((key) => [key, Math.max(0, Number(type?.benefits?.[key] ?? 0))])) as Record<BenefitKey, number>;

function resolveBranchName(
  branches: { id: number; name: string | null }[] | undefined,
  branchId: number,
  userBranchId?: number,
): string {
  if (!branchId) return '—';
  const name = branches?.find((b) => b.id === branchId)?.name?.trim();
  if (name) return name;
  if (userBranchId === branchId) return branches === undefined ? '…' : '—';
  return branches === undefined ? '…' : '—';
}

/** Add N days to a YYYY-MM-DD string using local time (no UTC shift). */
function addDaysLocal(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, (m ?? 1) - 1, (d ?? 1) + days);
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${dt.getFullYear()}-${mm}-${dd}`;
}

function TransferDetail({
  label,
  value,
  numeric = false,
}: {
  label: string;
  value: string | number | null | undefined;
  numeric?: boolean;
}) {
  const display = value == null || value === '' ? '—' : String(value);
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 truncate font-semibold ${numeric ? 'nums' : ''}`} title={display}>
        {numeric ? toArabicDigits(display) : display}
      </p>
    </div>
  );
}

interface ReceiptRow extends SubscriptionPaymentReceiptRow {
  memberName: string;
  subscriptionId?: number | null;
}

interface MemberTransferHistoryRow {
  id: number;
  subscriptionId: number;
  fromMemberId: number | null;
  fromMemberName: string | null;
  toMemberId: number | null;
  toMemberName: string | null;
  actorName: string | null;
  reason: string | null;
  transferDate: string;
}

export interface ClubSubscriptionsPageProps {
  singleView?: ClubSubscriptionsView;
  openCreateOnMount?: boolean;
  filterSpecial?: boolean;
  filterTimeBased?: boolean;
  reportFocus?: 'expired' | 'outstanding' | 'expiring';
}

export function ClubSubscriptionsPage({
  singleView,
  openCreateOnMount,
  filterSpecial,
  filterTimeBased,
  reportFocus,
}: ClubSubscriptionsPageProps = {}) {
  const ct = useClubT();
  const { ui, t } = useLocale();
  const { user } = useAuth();
  const qc = useQueryClient();
  const location = useLocation();
  const initialFilters: Record<string, string> | undefined = filterSpecial
    ? { isSpecial: 'true' }
    : filterTimeBased
      ? { isTimeBased: 'true' }
      : undefined;
  const { params, setParams } = useListQuery(initialFilters ? { filters: initialFilters } : undefined);
  const { data, isLoading, isError, error, refetch } = usePaginatedList<ClubSubscriptionListItem>(
    'club-subscriptions',
    params,
  );
  const { data: branches } = useBranches();
  const { data: subTypesRaw, refetch: refetchTypes } = useArrayResource<{
    id: number;
    name: string;
    price: number;
    days: number;
    isSpecialOffer?: boolean;
    applyToAllBranches?: boolean;
    branchIds?: number[];
    branchId?: number | null;
    isLinkedToSessions?: boolean;
    sessionsCount?: number | null;
    benefits?: Record<string, number>;
  }>('club-subscription-types');
  const [walkIn, setWalkIn] = useState(false);
  const [selectedMember, setSelectedMember] = useState<ClubMemberListItem | null>(null);
  const showNewSubButton = !singleView || singleView === 'subs';
  const { data: receipts, refetch: refetchReceipts } = useArrayResource<ReceiptRow>('club-receipts');
  const { data: transfers, refetch: refetchTransfers } = useArrayResource<{
    id: number;
    subscription_id: number;
    from_subscription_type: string | null;
    to_subscription_type: string;
    transfer_date: string;
    to_value: number;
  }>('club-subscription-transfers');

  const { data: stats } = useQuery({
    queryKey: ['club-subscriptions', 'statistics', filterSpecial ? 'special' : 'all'],
    queryFn: async () => {
      const { data: s } = await api.get<ClubSubscriptionStatistics>('/club-subscriptions/statistics', {
        params: filterSpecial ? { isSpecial: 'true' } : undefined,
      });
      return s;
    },
  });

  const { data: expired } = useQuery({
    queryKey: ['club-subscriptions', 'expired'],
    queryFn: async () => {
      const { data: r } = await api.get<{ data: ClubSubscriptionListItem[]; count: number }>(
        '/club-subscriptions/expired-report',
      );
      return r;
    },
  });

  // Subscriptions expiring within the next 7 days (uses endDateFrom/endDateTo range).
  const expiringRange = useMemo(() => {
    const from = localToday();
    const to = addDaysLocal(from, 7);
    return { from, to };
  }, []);
  const { data: expiring } = useQuery({
    queryKey: ['club-subscriptions', 'expiring', expiringRange.from, expiringRange.to],
    enabled: reportFocus === 'expiring',
    queryFn: async () => {
      const { data: r } = await api.get<{ data: ClubSubscriptionListItem[]; total: number }>(
        '/club-subscriptions',
        {
          params: {
            endDateFrom: expiringRange.from,
            endDateTo: expiringRange.to,
            status: 'active',
            pageSize: 100,
          },
        },
      );
      return r;
    },
  });

  const statusOptions = useMemo(
    () => [
      { value: 'active', label: ct('common.active') },
      { value: 'expired', label: ct('common.expired') },
      { value: 'upcoming', label: ct('common.upcoming') },
      { value: 'frozen', label: ct('subscriptions.frozen') },
    ],
    [ct],
  );
  const branchOptions = (branches ?? []).map((b) => ({ value: String(b.id), label: b.name ?? '—' }));
  const filters: FilterField[] = [
    { key: 'branch', label: ct('common.branch'), type: 'select', options: branchOptions },
    { key: 'status', label: ct('common.status'), type: 'select', options: statusOptions },
  ];

  const [tab, setTab] = useState<ClubSubscriptionsView>(
    singleView ?? (reportFocus ? 'reports' : 'subs'),
  );
  const [reportFilters, setReportFilters] = useState({ dateFrom: '', dateTo: '', status: 'all' });
  const [appliedReportFilters, setAppliedReportFilters] = useState(reportFilters);
  const [reportSearch, setReportSearch] = useState('');
  const [reportPage, setReportPage] = useState(1);
  const [reportPageSize, setReportPageSize] = useState(20);
  const [outParams, setOutParams] = useState({ page: 1, pageSize: 20, search: '' });
  const { data: reportData, isLoading: isReportLoading, isError: isReportError, refetch: refetchReport } = useQuery({
    queryKey: ['club-subscriptions', 'report', appliedReportFilters, reportPage, reportPageSize, reportSearch],
    enabled: tab === 'reports',
    queryFn: async () => {
      const { data: result } = await api.get<{ data: ClubSubscriptionListItem[], total: number }>('/club-subscriptions', {
        params: {
          startDateFrom: appliedReportFilters.dateFrom || undefined,
          startDateTo: appliedReportFilters.dateTo || undefined,
          status: appliedReportFilters.status === 'all' ? undefined : appliedReportFilters.status,
          search: reportSearch || undefined,
          page: reportPage,
          pageSize: reportPageSize,
        },
      });
      return result;
    },
  });
  const { data: outstanding, isLoading: isOutstandingLoading, isError: isOutstandingError, refetch: refetchOutstanding } = useQuery({
    queryKey: ['club-subscriptions', 'outstanding', outParams],
    queryFn: async () => {
      const { data: r } = await api.get<{ subscriptions: ClubSubscriptionListItem[]; summary: { count: number } }>(
        '/club-subscriptions/outstanding-report',
        { params: { search: outParams.search || undefined, page: outParams.page, pageSize: outParams.pageSize } }
      );
      return r;
    },
    enabled: reportFocus === 'outstanding' || tab === 'outstanding',
  });
  const [dialogOpen, setDialogOpen] = useState(!!openCreateOnMount);
  const [editSubId, setEditSubId] = useState<number | null>(null);
  const [editOriginal, setEditOriginal] = useState<{ startDate: string; typeId: string } | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [printSub, setPrintSub] = useState<ClubSubscriptionListItem | null>(null);
  const { canPrint } = useOutputPermissions();
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferSection, setTransferSection] = useState<'plan' | 'member'>('plan');
  const [memberTransferOpen, setMemberTransferOpen] = useState(false);
  const [memberTransferSubscriptionId, setMemberTransferSubscriptionId] = useState('');
  const [memberTransferPreset, setMemberTransferPreset] = useState<ClubSubscriptionListItem | null>(null);
  const [memberTransferTarget, setMemberTransferTarget] = useState<ClubMemberListItem | null>(null);
  const [memberTransferReason, setMemberTransferReason] = useState('');
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMaxRemaining, setPaymentMaxRemaining] = useState(0);
  const [paymentSub, setPaymentSub] = useState<ClubSubscriptionListItem | null>(null);
  const [editRemainingAmount, setEditRemainingAmount] = useState<number | null>(null);
  const [freezeOpen, setFreezeOpen] = useState(false);
  const [freezeForm, setFreezeForm] = useState({ reason: '' });
  const [renewOpen, setRenewOpen] = useState(false);
  const [renewForm, setRenewForm] = useState({ paidAmount: '', paymentMethod: 'cash' });

  const memberTransferSourceId = Number(memberTransferSubscriptionId);
  const {
    data: memberTransferSource,
    isFetching: loadingMemberTransferSource,
    isError: memberTransferSourceError,
  } = useQuery({
    queryKey: ['club-subscriptions', 'member-transfer-source', memberTransferSourceId],
    enabled: memberTransferOpen && Number.isInteger(memberTransferSourceId) && memberTransferSourceId > 0,
    queryFn: async () => {
      const { data: subscription } = await api.get<ClubSubscriptionListItem>(
        `/club-subscriptions/${memberTransferSourceId}`,
      );
      return subscription;
    },
    retry: false,
  });

  const { data: memberTransferHistory = [], refetch: refetchMemberTransferHistory } = useQuery({
    queryKey: ['club-subscriptions', 'member-transfer-history'],
    enabled: tab === 'transfers',
    queryFn: async () => {
      const { data: result } = await api.get<{ data: MemberTransferHistoryRow[] }>(
        '/club-subscriptions/member-transfer-history',
      );
      return result.data ?? [];
    },
  });
  const memberTransferDetails = memberTransferPreset ?? memberTransferSource ?? null;

  const [form, setForm] = useState({
    branchId: 0,
    memberId: '',
    customerName: '',
    subscriptionTypeId: '',
    startDate: localToday(),
    endDate: '',
    subscriptionValue: '',
    paidAmount: '',
    paymentMethod: 'cash',
    gender: 'male' as 'male' | 'female',
    isSpecial: false,
    isTimeBased: false,
    timeFrom: '06:00',
    timeTo: '22:00',
    discountEnabled: false,
    discountValue: '',
    isLinkedToSessions: false,
    sessionsCount: '',
    receiptNumber: '',
    benefits: emptyBenefits(),
  });

  const formBranchName = useMemo(
    () => resolveBranchName(branches, form.branchId, user?.branch),
    [branches, form.branchId, user?.branch],
  );
  const historySubId =
    paymentOpen && selectedId != null
      ? selectedId
      : dialogOpen && editSubId != null
        ? editSubId
        : null;

  const { data: subscriptionReceipts = [], isLoading: loadingSubscriptionReceipts } = useQuery({
    queryKey: ['club-receipts', 'by-subscription', historySubId],
    queryFn: async () => {
      const { data } = await api.get<{ data: ReceiptRow[] }>('/club-receipts', {
        params: { subscriptionId: historySubId, pageSize: 100, page: 1 },
      });
      return data.data ?? [];
    },
    enabled: historySubId != null,
  });

  const formNetValue = useMemo(() => {
    const value = Number(form.subscriptionValue) || 0;
    const discount = form.discountEnabled ? Number(form.discountValue) || 0 : 0;
    return Math.max(0, value - discount);
  }, [form.subscriptionValue, form.discountEnabled, form.discountValue]);
  const formRemaining = useMemo(() => {
    const paid = Number(form.paidAmount) || 0;
    return Math.max(0, formNetValue - paid);
  }, [formNetValue, form.paidAmount]);
  const subTypes = useMemo(() => {
    let types = subTypesRaw ?? [];
    if (filterSpecial) {
      types = types.filter((type) => type.isSpecialOffer);
    }
    const branchId = form.branchId || selectedMember?.branchId;
    if (branchId) {
      types = types.filter((type) => {
        if (type.applyToAllBranches) return true;
        if (type.branchIds?.includes(branchId)) return true;
        return type.branchId === branchId;
      });
    }
    return types;
  }, [subTypesRaw, filterSpecial, form.branchId, selectedMember?.branchId]);
  const [receiptForm, setReceiptForm] = useState({ memberName: '', amount: '', memberCode: '', subscriptionId: '' });
  const [transferForm, setTransferForm] = useState({
    subscriptionId: '',
    toSubscriptionTypeId: '',
    toStartDate: localToday(),
    toEndDate: '',
    toValue: '',
  });

  const pageTitle = filterSpecial
    ? translateNavRoute(t, '/club/subscriptions/special')
    : filterTimeBased
      ? translateNavRoute(t, '/club/subscriptions/time-based')
      : ct('subscriptions.title');

  useEffect(() => {
    if (filterSpecial) setParams({ filters: { isSpecial: 'true' }, page: 1 });
    else if (filterTimeBased) setParams({ filters: { isTimeBased: 'true' }, page: 1 });
  }, [filterSpecial, filterTimeBased, setParams]);

  // Arriving from the member form's «حفظ وإضافة اشتراك»: preselect that member and open the dialog.
  useEffect(() => {
    const prefill = (location.state as { prefillMember?: ClubMemberListItem } | null)?.prefillMember;
    if (!prefill) return;
    window.history.replaceState({}, '');
    setEditSubId(null);
    setWalkIn(false);
    setSelectedMember(prefill);
    const branchId =
      (user?.branch && user.branch > 0 ? user.branch : undefined) ??
      prefill.branchId ??
      branches?.[0]?.id ??
      0;
    setForm((f) => ({
      ...f,
      memberId: String(prefill.id),
      customerName: prefill.name,
      gender: prefill.gender ?? f.gender,
      branchId,
    }));
    setDialogOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Lock branch to the logged-in employee when the create dialog opens empty.
  useEffect(() => {
    if (!dialogOpen || editSubId) return;
    if (form.branchId) return;
    const branchId = user?.branch && user.branch > 0 ? user.branch : (branches?.[0]?.id ?? 0);
    if (!branchId) return;
    setForm((f) => (f.branchId ? f : { ...f, branchId }));
  }, [dialogOpen, editSubId, form.branchId, user?.branch, branches]);

  useEffect(() => {
    if (!form.subscriptionTypeId || !form.startDate) return;
    const type = subTypes?.find((t) => t.id === Number(form.subscriptionTypeId));
    if (!type) return;
    setForm((f) => ({
      ...f,
      subscriptionValue: String(type.price),
      isLinkedToSessions: !!type.isLinkedToSessions,
      sessionsCount: type.isLinkedToSessions && type.sessionsCount != null ? String(type.sessionsCount) : '',
      // Session packages have no calendar end date.
      endDate: type.isLinkedToSessions ? '' : addDaysLocal(f.startDate, type.days),
    }));
  }, [form.subscriptionTypeId, form.startDate, subTypes]);

  useEffect(() => {
    if (!transferForm.toSubscriptionTypeId || !transferForm.toStartDate) return;
    const type = subTypes?.find((t) => t.id === Number(transferForm.toSubscriptionTypeId));
    if (!type) return;
    setTransferForm((f) => ({
      ...f,
      toEndDate: type.isLinkedToSessions ? '' : addDaysLocal(f.toStartDate, type.days),
      toValue: String(type.price),
    }));
  }, [transferForm.toSubscriptionTypeId, transferForm.toStartDate, subTypes]);

  const invalidateAll = () => {
    void refetch();
    void refetchReceipts();
    void refetchTransfers();
    void refetchMemberTransferHistory();
    void refetchTypes();
    void qc.invalidateQueries({ queryKey: ['club-subscriptions'] });
    void qc.invalidateQueries({ queryKey: ['club-subscriptions', 'outstanding'] });
  };

  const openCreate = () => {
    const branchId = user?.branch && user.branch > 0 ? user.branch : (branches?.[0]?.id ?? 0);
    setEditSubId(null);
    setForm({
      branchId,
      memberId: '',
      customerName: '',
      subscriptionTypeId: '',
      startDate: localToday(),
      endDate: '',
      subscriptionValue: '',
      paidAmount: '',
      paymentMethod: 'cash',
      gender: 'male',
        isSpecial: false,
      isTimeBased: false,
      timeFrom: '06:00',
      timeTo: '22:00',
      discountEnabled: false,
      discountValue: '',
      isLinkedToSessions: false,
      sessionsCount: '',
      receiptNumber: '',
      benefits: emptyBenefits(),
    });
    setEditRemainingAmount(null);
    setWalkIn(false);
    setSelectedMember(null);
    setDialogOpen(true);
  };

  const openEdit = async (row: ClubSubscriptionListItem) => {
    setEditSubId(row.id);
    setForm({
      branchId: row.branchId ?? branches?.[0]?.id ?? 0,
      memberId: row.memberId ? String(row.memberId) : '',
      customerName: row.customerName ?? '',
      subscriptionTypeId: row.subscriptionTypeId ? String(row.subscriptionTypeId) : '',
      startDate: row.subscriptionStartDate,
      endDate: row.isLinkedToSessions ? '' : row.subscriptionEndDate,
      subscriptionValue: String(row.subscriptionValue ?? ''),
      paidAmount: String(row.paidAmount ?? ''),
      paymentMethod: (row.paymentMethod as typeof form.paymentMethod) ?? 'cash',
      gender: (row.gender as 'male' | 'female') ?? 'male',
      isSpecial: !!row.isSpecial,
      isTimeBased: !!row.isTimeBased,
      timeFrom: row.timeFrom ?? '06:00',
      timeTo: row.timeTo ?? '22:00',
      discountEnabled: !!row.discountEnabled,
      discountValue: row.discountValue ? String(row.discountValue) : '',
      isLinkedToSessions: !!row.isLinkedToSessions,
      sessionsCount: row.sessionsCount ? String(row.sessionsCount) : '',
      receiptNumber: '',
      benefits: row.benefits && Object.keys(row.benefits).length
        ? Object.fromEntries(benefitKeys.map((key) => [key, Math.max(0, Number(row.benefits?.[key] ?? 0))])) as Record<BenefitKey, number>
        : typeBenefits(subTypesRaw?.find((type) => type.id === row.subscriptionTypeId) as ClubSubscriptionType | undefined),
    });
    setEditRemainingAmount(row.remainingAmount);
    setWalkIn(!row.memberId);
    if (row.memberId) {
      try {
        const { data } = await api.get<ClubMemberListItem>(`/club-members/${row.memberId}`);
        setSelectedMember(data);
      } catch {
        setSelectedMember(null);
      }
    } else {
      setSelectedMember(null);
    }
    setEditOriginal({
      startDate: row.subscriptionStartDate,
      typeId: row.subscriptionTypeId ? String(row.subscriptionTypeId) : '',
    });
    setDialogOpen(true);
  };

  const saveSub = async () => {
    if (!form.customerName.trim() && !form.memberId) {
      toast.error(ct('subscriptions.customerName'));
      return;
    }
    if (!form.subscriptionTypeId) {
      toast.error(ct('subscriptions.subType'));
      return;
    }
    const effectiveBranchId =
      form.branchId ||
      (user?.branch && user.branch > 0 ? user.branch : undefined) ||
      selectedMember?.branchId ||
      branches?.[0]?.id;
    if (!effectiveBranchId) {
      toast.error(ct('common.branch'));
      return;
    }
    const employeeId = user?.emp_code ?? selectedMember?.employeeId ?? undefined;
    setSaving(true);
    try {
      if (editSubId) {
        const common = {
          branchId: effectiveBranchId,
          memberId: form.memberId ? Number(form.memberId) : undefined,
          customerName: form.customerName || undefined,
          subscriptionTypeId: form.subscriptionTypeId ? Number(form.subscriptionTypeId) : undefined,
          paymentMethod: form.paymentMethod,
          gender: form.gender,
          guardianName: selectedMember?.guardianName || undefined,
          guardianPhone: selectedMember?.guardianPhone || undefined,
          employeeId,
          salesId: selectedMember?.salesId ?? undefined,
          isSpecial: form.isSpecial,
          isTimeBased: form.isTimeBased,
          timeFrom: form.isTimeBased ? form.timeFrom : undefined,
          timeTo: form.isTimeBased ? form.timeTo : undefined,
          discountEnabled: form.discountEnabled,
          discountValue: form.discountEnabled && form.discountValue ? Number(form.discountValue) : 0,
          isLinkedToSessions: form.isLinkedToSessions,
          sessionsCount: form.isLinkedToSessions && form.sessionsCount ? Number(form.sessionsCount) : undefined,
          benefits: form.benefits,
        };
        const selectedType = subTypes?.find((t) => t.id === Number(form.subscriptionTypeId));
        const datesChanged =
          !!editOriginal &&
          (editOriginal.startDate !== form.startDate || editOriginal.typeId !== form.subscriptionTypeId);
        await api.put(`/club-subscriptions/${editSubId}`, {
          ...common,
          ...(datesChanged && selectedType
            ? {
                subscriptionStartDate: form.startDate,
                // Backend forces open-ended end for session packages.
                ...(selectedType.isLinkedToSessions
                  ? {}
                  : { subscriptionEndDate: addDaysLocal(form.startDate, selectedType.days) }),
                subscriptionType: selectedType.name,
                subscriptionValue: selectedType.price,
                isLinkedToSessions: !!selectedType.isLinkedToSessions,
                sessionsCount: selectedType.isLinkedToSessions
                  ? selectedType.sessionsCount ?? undefined
                  : undefined,
              }
            : {}),
        });
      } else {
        await api.post('/club-subscriptions', {
          branchId: effectiveBranchId,
          memberId: form.memberId ? Number(form.memberId) : undefined,
          customerName: form.customerName || undefined,
          subscriptionTypeId: form.subscriptionTypeId ? Number(form.subscriptionTypeId) : undefined,
          paymentMethod: form.paymentMethod,
          guardianName: selectedMember?.guardianName || undefined,
          guardianPhone: selectedMember?.guardianPhone || undefined,
          employeeId,
          salesId: selectedMember?.salesId ?? undefined,
          startDate: form.startDate,
          paidAmount: form.paidAmount ? Number(form.paidAmount) : 0,
          isSpecial: filterSpecial || form.isSpecial,
          receiptNumber: form.receiptNumber.trim() || undefined,
          benefits: form.benefits,
        });
      }
      toast.success(ct('common.success'));
      setDialogOpen(false);
      setEditSubId(null);
      invalidateAll();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const openPayment = (sub: ClubSubscriptionListItem) => {
    setSelectedId(sub.id);
    setPaymentSub(sub);
    setPaymentMaxRemaining(sub.remainingAmount);
    setPaymentAmount('');
    setPaymentOpen(true);
  };

  const openMemberTransfer = (sub: ClubSubscriptionListItem) => {
    setMemberTransferSubscriptionId(String(sub.id));
    setMemberTransferPreset(sub);
    setMemberTransferTarget(null);
    setMemberTransferReason('');
    setMemberTransferOpen(true);
  };

  const pay = async () => {
    if (!selectedId) return;
    const amount = Number(paymentAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error(ct('subscriptions.invalidAmount'));
      return;
    }
    if (paymentMaxRemaining > 0 && amount > paymentMaxRemaining) {
      toast.error(ct('subscriptions.amountExceedsRemaining'));
      return;
    }
    setSaving(true);
    try {
      const { data: result } = await api.patch<{
        subscription: ClubSubscriptionListItem;
        paymentAmount: number;
      }>(`/club-subscriptions/${selectedId}/payment`, { paymentAmount: amount });
      if (result.subscription) {
        setPaymentSub(result.subscription);
        setPaymentMaxRemaining(result.subscription.remainingAmount);
      }
      void qc.invalidateQueries({ queryKey: ['club-receipts', 'by-subscription', selectedId] });
      toast.success(ct('common.success'));
      setPaymentOpen(false);
      setPaymentSub(null);
      invalidateAll();
      void refetchOutstanding();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const openRenew = (row: ClubSubscriptionListItem) => {
    setSelectedId(row.id);
    const net = subscriptionNetValue(row);
    setRenewForm({
      paidAmount: String(net),
      paymentMethod: (row.paymentMethod as string) || 'cash',
    });
    setRenewOpen(true);
  };

  const renewSub = useMemo(
    () => (renewOpen && selectedId != null ? (data?.data ?? []).find((s) => s.id === selectedId) ?? null : null),
    [renewOpen, selectedId, data?.data],
  );
  const renewNetValue = renewSub ? subscriptionNetValue(renewSub) : 0;
  const renewPaidNow = Math.max(0, Number(renewForm.paidAmount) || 0);
  const renewRemaining = Math.max(0, renewNetValue - renewPaidNow);

  const submitRenew = async () => {
    if (!selectedId) return;
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
      await api.patch(`/club-subscriptions/${selectedId}/renew`, body);
      toast.success(ct('common.success'));
      setRenewOpen(false);
      invalidateAll();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const openFreeze = (id: number) => {
    setSelectedId(id);
    setFreezeForm({ reason: '' });
    setFreezeOpen(true);
  };

  const submitFreeze = async () => {
    if (!selectedId) return;
    setSaving(true);
    try {
      await api.post(`/club-subscriptions/${selectedId}/freeze`, {
        reason: freezeForm.reason.trim() || undefined,
      });
      toast.success(ct('common.success'));
      setFreezeOpen(false);
      invalidateAll();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const unfreeze = async (id: number) => {
    const ok = await confirm({ title: ct('subscriptions.unfreezeConfirm') });
    if (!ok) return;
    try {
      await api.post(`/club-subscriptions/${id}/unfreeze`, {});
      toast.success(ct('common.success'));
      invalidateAll();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const remove = async (id: number) => {
    const ok = await confirm({ title: ct('subscriptions.deleteConfirm'), variant: 'destructive', confirmLabel: ct('common.delete') });
    if (!ok) return;
    try {
      await api.delete(`/club-subscriptions/${id}`);
      toast.success(ct('common.success'));
      invalidateAll();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const saveTransfer = async () => {
    const subId = Number(transferForm.subscriptionId);
    const typeId = Number(transferForm.toSubscriptionTypeId);
    const toType = subTypes?.find((t) => t.id === typeId);
    const fromSub = (data?.data ?? []).find((s) => s.id === subId);
    if (!subId || !typeId || !transferForm.toStartDate) {
      toast.error(ct('members.fillRequired'));
      return;
    }
    if (
      fromSub &&
      Boolean(fromSub.isLinkedToSessions) !== Boolean(toType?.isLinkedToSessions)
    ) {
      toast.error(ct('subscriptions.transferKindMismatch'));
      return;
    }
    if (!toType?.isLinkedToSessions && !transferForm.toEndDate) {
      toast.error(ct('members.fillRequired'));
      return;
    }
    setSaving(true);
    try {
      await api.post('/club-subscription-transfers', {
        subscriptionId: subId,
        toSubscriptionTypeId: typeId,
        toStartDate: transferForm.toStartDate,
        // Backend replaces this with open-ended for session packages.
        toEndDate: transferForm.toEndDate || transferForm.toStartDate,
      });
      toast.success(ct('common.success'));
      setTransferOpen(false);
      invalidateAll();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const saveMemberTransfer = async () => {
    if (!memberTransferSourceId || !memberTransferDetails || !memberTransferTarget || !memberTransferReason.trim()) {
      toast.error(ct('members.fillRequired'));
      return;
    }
    if (memberTransferDetails.memberId === memberTransferTarget.id) {
      toast.error(ct('subscriptions.memberTransferSameMember'));
      return;
    }
    const ok = await confirm({
      title: ct('subscriptions.memberTransferConfirm'),
      description: `${memberTransferDetails.customerName ?? '—'} → ${memberTransferTarget.name}`,
      confirmLabel: ct('subscriptions.memberTransfer'),
    });
    if (!ok) return;

    setSaving(true);
    try {
      await api.patch(`/club-subscriptions/${memberTransferSourceId}/transfer-member`, {
        memberId: memberTransferTarget.id,
        reason: memberTransferReason.trim(),
      });
      toast.success(ct('common.success'));
      setMemberTransferOpen(false);
      setMemberTransferSubscriptionId('');
      setMemberTransferPreset(null);
      setMemberTransferTarget(null);
      setMemberTransferReason('');
      invalidateAll();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const saveReceipt = async () => {
    if (!receiptForm.memberName.trim() || !receiptForm.amount) {
      toast.error(ct('members.fillRequired'));
      return;
    }
    const receiptAmount = Number(receiptForm.amount);
    if (!Number.isFinite(receiptAmount) || receiptAmount <= 0) {
      toast.error(ct('subscriptions.invalidAmount'));
      return;
    }
    setSaving(true);
    try {
      let memberId: number | undefined;
      if (receiptForm.memberCode.trim()) {
        const q = receiptForm.memberCode.trim();
        const { data: list } = await api.get<{ data: ClubMemberListItem[] }>('/club-members', {
          params: { search: q, pageSize: 5 },
        });
        const exact = list.data.find((m) => m.memberCode === q || m.cardNumber === q);
        if (!exact) {
          toast.error(ct('members.noMemberFound'));
          return;
        }
        memberId = exact.id;
      }
      await api.post('/club-receipts', {
        memberName: receiptForm.memberName,
        amount: receiptAmount,
        memberId,
        subscriptionId: receiptForm.subscriptionId ? Number(receiptForm.subscriptionId) : undefined,
      });
      toast.success(ct('common.success'));
      setReceiptOpen(false);
      invalidateAll();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const subColumns = useMemo<ColumnDef<ClubSubscriptionListItem>[]>(
    () => [
      { id: 'index', header: ct('common.index'), cell: ({ row }) => toArabicDigits((params.page - 1) * params.pageSize + row.index + 1) },
      { accessorKey: 'subscriptionNumber', header: ct('subscriptions.subNumber') },
      { accessorKey: 'customerName', header: ct('subscriptions.customerName'), cell: ({ getValue }) => getValue() ?? '—' },
      {
        accessorKey: 'customerPhone',
        header: ct('members.phone'),
        cell: ({ getValue }) => {
          const phone = getValue() as string | null;
          return phone ? <span className="nums" dir="ltr">{phone}</span> : '-';
        },
      },
     { accessorKey: 'subscriptionType', header: ct('subscriptions.subType'), cell: ({ getValue }) => getValue() ?? '—' },
      { accessorKey: 'subscriptionValue', header: ct('subscriptions.value'), cell: ({ getValue }) => <span className="nums" dir="ltr">{String(getValue() as number)}</span> },
      { accessorKey: 'remainingAmount', header: ct('subscriptions.remaining'), cell: ({ getValue }) => <span className="nums" dir="ltr">{String(getValue() as number)}</span> },
      {
        accessorKey: 'status',
        header: ct('common.status'),
        cell: ({ row }) => {
          const status = row.original.status as string;
          if (status === 'frozen') {
            return <StatusBadge status="info" label={ct('subscriptions.frozen')} />;
          }
          const map: Record<string, 'active' | 'expired' | 'pending'> = {
            active: 'active',
            expired: 'expired',
            upcoming: 'pending',
          };
          return <StatusBadge status={map[status] ?? 'pending'} />;
        },
      },
      {
        id: 'actions',
        header: ct('common.actions'),
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => afterMenuClose(() => void openEdit(row.original))}>
                <Pencil className="size-4" /> {ct('subscriptions.editSub')}
              </DropdownMenuItem>
              {canPrint && (
                <DropdownMenuItem onSelect={() => afterMenuClose(() => setPrintSub(row.original))}>
                  <Printer className="size-4" /> {ct('subscriptions.printInvoice')}
                </DropdownMenuItem>
              )}
              {row.original.remainingAmount > 0 && (
                <DropdownMenuItem onSelect={() => afterMenuClose(() => openPayment(row.original))}>
                  <CreditCard className="size-4" /> {ct('subscriptions.pay')}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={() => afterMenuClose(() => openRenew(row.original))}><RefreshCw className="size-4" /> {ct('subscriptions.renew')}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => afterMenuClose(() => openMemberTransfer(row.original))}>
                <Repeat className="size-4" /> {ct('subscriptions.memberTransfer')}
              </DropdownMenuItem>
              {(row.original.status as string) === 'frozen' ? (
                <DropdownMenuItem onSelect={() => void unfreeze(row.original.id)}><Sun className="size-4" /> {ct('subscriptions.unfreeze')}</DropdownMenuItem>
              ) : (
                (row.original.status as string) === 'active' && (
                  <DropdownMenuItem onSelect={() => afterMenuClose(() => openFreeze(row.original.id))}><Snowflake className="size-4" /> {ct('subscriptions.freeze')}</DropdownMenuItem>
                )
              )}
              <DropdownMenuItem className="text-destructive" onSelect={() => void remove(row.original.id)}>{ct('common.delete')}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    [ct, params.page, params.pageSize],
  );

  if (isError) {
    return (
      <div className="space-y-6">
        <PageHeader title={ui(pageTitle)} description={ct('subscriptions.description')} />
        <ErrorState message={apiError(error)} onRetry={() => void refetch()} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={ui(pageTitle)}
        description={ct('subscriptions.description')}
        actions={showNewSubButton ? (
          <Button variant="brand" onClick={openCreate}><Plus className="size-4" /> {ct('subscriptions.newSub')}</Button>
        ) : undefined}
      />

      {stats && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <ClubStatCard label={ct('subscriptions.totalSubs')} value={stats.total} />
          <ClubStatCard label={ct('common.active')} value={stats.active} />
          <ClubStatCard label={ct('subscriptions.totalPaid')} value={stats.totalPaid} />
          <ClubStatCard label={ct('subscriptions.totalRemaining')} value={stats.totalRemaining} />
        </div>
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v as ClubSubscriptionsView)}>
        {!singleView && !reportFocus && (
        <TabsList className="flex h-auto flex-wrap gap-1">
          <TabsTrigger value="subs"><CreditCard className="size-4" /> {ct('subscriptions.tabSubs')}</TabsTrigger>
          <TabsTrigger value="receipts"><FileText className="size-4" /> {ct('subscriptions.tabReceipts')}</TabsTrigger>
          <TabsTrigger value="refunds"><Undo2 className="size-4" /> مستردات الاشتراك</TabsTrigger>
          <TabsTrigger value="transfers"><Repeat className="size-4" /> تحويل الاشتراكات</TabsTrigger>
          <TabsTrigger value="outstanding"><Wallet className="size-4" /> المبالغ المستحقة</TabsTrigger>
          <TabsTrigger value="reports">{ct('subscriptions.tabReports')}</TabsTrigger>
        </TabsList>
        )}

        <TabsContent value="subs" className="space-y-4 pt-4">
          <FilterBar
            fields={filters}
            preserveParams={filterSpecial ? ['isSpecial'] : filterTimeBased ? ['isTimeBased'] : []}
          />
          <DataTable
            columns={subColumns}
            data={data?.data ?? []}
            total={data?.total ?? 0}
            page={params.page}
            pageSize={params.pageSize}
            onPageChange={(page) => setParams({ page })}
            onPageSizeChange={(pageSize) => setParams({ pageSize, page: 1 })}
            search={params.search}
            onSearchChange={(search) => setParams({ search, page: 1 })}
            isLoading={isLoading}
            isError={isError}
            onRetry={() => void refetch()}
            emptyTitle={ct('subscriptions.emptySubs')}
          />
        </TabsContent>

        <TabsContent value="receipts" className="space-y-4 pt-4">
          <Button variant="outline" onClick={() => { setReceiptForm({ memberName: '', amount: '', memberCode: '', subscriptionId: '' }); setReceiptOpen(true); }}>
            <Plus className="size-4" /> {ct('subscriptions.newReceipt')}
          </Button>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="p-3 text-start">{ct('subscriptions.receiptNumber')}</th>
                  <th className="p-3 text-start">{ct('common.customer')}</th>
                  <th className="p-3 text-start">{ct('subscriptions.receiptAmount')}</th>
                  <th className="p-3 text-start">{ct('subscriptions.receiptDate')}</th>
                </tr>
              </thead>
              <tbody>
                {(receipts ?? []).length === 0 && (
                  <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">{ct('common.noData')}</td></tr>
                )}
                {(receipts ?? []).map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="p-3 nums">{r.receiptNumber}</td>
                    <td className="p-3">{r.memberName}</td>
                    <td className="p-3 nums">{toArabicDigits(r.amount)}</td>
                    <td className="p-3 nums">{toArabicDigits(r.receiptDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="refunds" className="space-y-4 pt-4">
          <SubscriptionRefundsWorkspace />
        </TabsContent>

        <TabsContent value="transfers" className="space-y-4 pt-4">
          <Tabs value={transferSection} onValueChange={(value) => setTransferSection(value as 'plan' | 'member')}>
            <TabsList className="grid h-auto w-full max-w-xl grid-cols-2 gap-1">
              <TabsTrigger value="plan"><Repeat className="size-4" /> {ct('subscriptions.planTransferTab')}</TabsTrigger>
              <TabsTrigger value="member"><User className="size-4" /> {ct('subscriptions.subscriptionTransferTab')}</TabsTrigger>
            </TabsList>

            <TabsContent value="plan" className="space-y-4 pt-4">
              <Button variant="outline" onClick={() => setTransferOpen(true)}>
                <Plus className="size-4" /> {ct('subscriptions.newTransfer')}
              </Button>
              <div className="overflow-x-auto rounded-xl border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="p-3 text-start">{ct('subscriptions.subscriptionId')}</th>
                      <th className="p-3 text-start">{ct('subscriptions.transferFrom')}</th>
                      <th className="p-3 text-start">{ct('subscriptions.transferTo')}</th>
                      <th className="p-3 text-start">{ct('subscriptions.transferDate')}</th>
                      <th className="p-3 text-start">{ct('subscriptions.value')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(transfers ?? []).length === 0 && (
                      <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">{ct('common.noData')}</td></tr>
                    )}
                    {(transfers ?? []).map((t) => (
                      <tr key={t.id} className="border-t">
                        <td className="p-3 nums">{toArabicDigits(t.subscription_id)}</td>
                        <td className="p-3">{t.from_subscription_type ?? '—'}</td>
                        <td className="p-3">{t.to_subscription_type}</td>
                        <td className="p-3 nums">{toArabicDigits(t.transfer_date)}</td>
                        <td className="p-3 nums">{toArabicDigits(Number(t.to_value))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </TabsContent>

            <TabsContent value="member" className="space-y-4 pt-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">{ct('subscriptions.subscriptionTransferHint')}</p>
                <Button
                  variant="outline"
                  onClick={() => {
                    setMemberTransferSubscriptionId('');
                    setMemberTransferPreset(null);
                    setMemberTransferTarget(null);
                    setMemberTransferReason('');
                    setMemberTransferOpen(true);
                  }}
                >
                  <Plus className="size-4" /> {ct('subscriptions.memberTransfer')}
                </Button>
              </div>
              <div className="overflow-x-auto rounded-xl border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="p-3 text-start">{ct('subscriptions.subscriptionId')}</th>
                      <th className="p-3 text-start">{ct('subscriptions.fromMember')}</th>
                      <th className="p-3 text-start">{ct('subscriptions.toMember')}</th>
                      <th className="p-3 text-start">{ct('subscriptions.transferReason')}</th>
                      <th className="p-3 text-start">{ct('subscriptions.transferDate')}</th>
                      <th className="p-3 text-start">{ct('subscriptions.transferredBy')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {memberTransferHistory.length === 0 && (
                      <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">{ct('common.noData')}</td></tr>
                    )}
                    {memberTransferHistory.map((row) => (
                      <tr key={row.id} className="border-t">
                        <td className="p-3 nums">{toArabicDigits(row.subscriptionId)}</td>
                        <td className="p-3">{row.fromMemberName ?? '—'}</td>
                        <td className="p-3">{row.toMemberName ?? '—'}</td>
                        <td className="max-w-64 truncate p-3" title={row.reason ?? undefined}>{row.reason ?? '—'}</td>
                        <td className="p-3 nums">{toArabicDigits(new Date(row.transferDate).toLocaleString())}</td>
                        <td className="p-3">{row.actorName ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </TabsContent>
          </Tabs>
        </TabsContent>

        <TabsContent value="outstanding" className="space-y-4 pt-4">
          <h3 className="font-medium">المبالغ المستحقة</h3>
          <DataTable
            columns={[
              { accessorKey: 'customerName', header: ct('subscriptions.customerName') },
              { accessorKey: 'subscriptionType', header: ct('subscriptions.subType') },
              { accessorKey: 'remainingAmount', header: ct('subscriptions.remaining'), cell: ({ getValue }) => <div className="nums" dir="ltr">{String(getValue())}</div> },
              {
                id: 'actions',
                header: ct('common.actions'),
                cell: ({ row }) => (
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => openPayment(row.original)}><CreditCard className="size-4" /> {ct('subscriptions.pay')}</Button>
                    <Button size="sm" variant="ghost" onClick={() => void openEdit(row.original)}><Pencil className="size-4" /> {ct('common.edit')}</Button>
                  </div>
                ),
              },
            ]}
            data={outstanding?.subscriptions ?? []}
            total={outstanding?.summary?.count ?? (outstanding?.subscriptions ?? []).length}
            page={outParams.page}
            pageSize={outParams.pageSize}
            onPageChange={(p) => setOutParams((prev) => ({ ...prev, page: p }))}
            onPageSizeChange={(s) => setOutParams((prev) => ({ ...prev, pageSize: s, page: 1 }))}
            search={outParams.search}
            onSearchChange={(s) => setOutParams((prev) => ({ ...prev, search: s, page: 1 }))}
            isLoading={isOutstandingLoading}
            isError={isOutstandingError}
            onRetry={() => void refetchOutstanding()}
          />
        </TabsContent>

        <TabsContent value="reports" className="space-y-6 pt-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="grid gap-2">
              <Label>{ct('common.dateFrom')}</Label>
              <Input
                type="date"
                className="nums"
                dir="ltr"
                value={reportFilters.dateFrom}
                onChange={(e) => setReportFilters((f) => ({ ...f, dateFrom: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label>{ct('common.dateTo')}</Label>
              <Input
                type="date"
                className="nums"
                dir="ltr"
                value={reportFilters.dateTo}
                onChange={(e) => setReportFilters((f) => ({ ...f, dateTo: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label>{ct('common.status')}</Label>
              <select
                className={selectCls}
                value={reportFilters.status}
                onChange={(e) => setReportFilters((f) => ({ ...f, status: e.target.value }))}
              >
                <option value="all">{ui('الكل')}</option>
                <option value="active">{ct('common.active')}</option>
                <option value="expired">{ct('common.expired')}</option>
                <option value="upcoming">{ct('common.upcoming')}</option>
                <option value="frozen">{ct('subscriptions.frozen')}</option>
              </select>
            </div>
            <Button
              variant="brand"
              onClick={() => { setReportPage(1); setAppliedReportFilters(reportFilters); }}
              disabled={isReportLoading}
            >
              {ct('common.search')}
            </Button>
          </div>

          <DataTable
            columns={[
              { accessorKey: 'memberCode', header: ct('members.memberCode'), cell: ({ row }) => <div className="nums">{(row.original as any).memberCode ?? '—'}</div> },
              { accessorKey: 'customerName', header: ct('common.name'), cell: ({ getValue }) => getValue() ?? '—' },
              { accessorKey: 'customerPhone', header: ct('common.phone'), cell: ({ getValue }) => <div className="nums" dir="ltr">{String(getValue() ?? '—')}</div> },
              { accessorKey: 'subscriptionType', header: ct('subscriptions.subType'), cell: ({ getValue }) => getValue() ?? '—' },
              { accessorKey: 'subscriptionStartDate', header: ct('subscriptions.startDate'), cell: ({ getValue }) => <div className="nums">{String(getValue())}</div> },
              {
                id: 'status',
                header: ct('common.status'),
                cell: ({ row }) => (
                  <StatusBadge
                    status={
                      (row.original.status as string) === 'frozen'
                        ? 'info'
                        : (row.original.status as string) === 'active'
                          ? 'active'
                          : (row.original.status as string) === 'expired'
                            ? 'expired'
                            : 'pending'
                    }
                    label={(row.original.status as string) === 'frozen' ? ct('subscriptions.frozen') : undefined}
                  />
                ),
              },
            ]}
            data={reportData?.data ?? []}
            total={reportData?.total ?? 0}
            page={reportPage}
            pageSize={reportPageSize}
            onPageChange={setReportPage}
            onPageSizeChange={(s) => { setReportPageSize(s); setReportPage(1); }}
            search={reportSearch}
            onSearchChange={(s) => { setReportSearch(s); setReportPage(1); }}
            isLoading={isReportLoading}
            isError={isReportError}
            onRetry={() => void refetchReport()}
          />
        </TabsContent>
      </Tabs>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className={FORM_DIALOG_CONTENT_CLASS} aria-describedby={undefined}>
          <FormDialogHeader>
            <DialogTitle>{editSubId ? ct('subscriptions.editSub') : ct('subscriptions.newSub')}</DialogTitle>
          </FormDialogHeader>

          <FormDialogBody>
            <DialogFormSection title={ct('subscriptions.sectionCustomer')} icon={User}>
              <DialogFormGrid>
                <FieldWrapper label={ct('common.branch')} required>
                  <Input className="bg-muted" value={formBranchName} readOnly />
                </FieldWrapper>
                <FieldWrapper label={ct('members.registeredBy')}>
                  <Input className="bg-muted" value={user?.name ?? '—'} readOnly />
                </FieldWrapper>
              </DialogFormGrid>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border bg-background px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted/40">
                  <input
                    type="checkbox"
                    className="size-3.5 rounded accent-primary"
                    checked={walkIn}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setWalkIn(checked);
                      if (checked) {
                        setForm((f) => ({ ...f, memberId: '', customerName: f.customerName }));
                        setSelectedMember(null);
                      }
                    }}
                  />
                  {ct('subscriptions.walkInCustomer')}
                </label>
              </div>
              {walkIn ? (
                <FieldWrapper label={ct('subscriptions.customerName')} required>
                  <Input
                    value={form.customerName}
                    onChange={(e) => setForm((f) => ({ ...f, customerName: e.target.value }))}
                    placeholder={ct('subscriptions.customerName')}
                  />
                </FieldWrapper>
              ) : (
                <FieldWrapper label={ct('subscriptions.customerName')} required>
                  <MemberSearchCombobox
                    selectedMember={selectedMember}
                    onSelect={(member) => {
                      setSelectedMember(member);
                      setForm((f) => ({
                        ...f,
                        memberId: String(member.id),
                        customerName: member.name,
                        gender: member.gender ?? f.gender,
                      }));
                    }}
                    onClear={() => {
                      setSelectedMember(null);
                      setForm((f) => ({ ...f, memberId: '', customerName: '' }));
                    }}
                  />
                </FieldWrapper>
              )}
              {selectedMember && !walkIn && (
                <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm">
                  <span className="font-medium">{selectedMember.name}</span>
                  <span className="nums text-muted-foreground font-mono ms-2">{selectedMember.memberCode}</span>
                  {selectedMember.phone && (
                    <span className="nums text-muted-foreground"> · {toArabicDigits(selectedMember.phone)}</span>
                  )}
                </div>
              )}
            </DialogFormSection>

            <DialogFormSection title={ct('subscriptions.sectionSubscription')} icon={CalendarDays}>
              <DialogFormGrid>
                <FieldWrapper label={ct('subscriptions.subType')} required>
                  <SubscriptionTypeSelect
                    types={(subTypes ?? []) as ClubSubscriptionType[]}
                    mode="all"
                    value={form.subscriptionTypeId}
                    onChange={(typeId) => {
                      const selectedType = subTypes?.find((type) => type.id === Number(typeId));
                      setForm((f) => ({
                        ...f,
                        subscriptionTypeId: typeId,
                        benefits: typeBenefits(selectedType as ClubSubscriptionType | undefined),
                      }));
                    }}
                  />
                </FieldWrapper>
                <FieldWrapper label={ct('subscriptions.startDate')} required>
                  <Input type="date" className="nums" dir="ltr" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} />
                </FieldWrapper>
                {(() => {
                  const selectedType = subTypes?.find((t) => t.id === Number(form.subscriptionTypeId));
                  if (!selectedType) return null;
                  if (selectedType.isLinkedToSessions) {
                    return (
                      <FieldWrapper label={ct('packages.sessionsCount')}>
                        <Input
                          className="nums bg-muted"
                          value={`${toArabicDigits(selectedType.sessionsCount ?? (Number(form.sessionsCount) || 0))} ${ct('packages.sessionsUnit')}`}
                          readOnly
                        />
                      </FieldWrapper>
                    );
                  }
                  return (
                    <FieldWrapper label={ct('subscriptions.endDate')}>
                      <Input type="date" className="nums bg-muted" dir="ltr" value={form.endDate} readOnly />
                    </FieldWrapper>
                  );
                })()}
              </DialogFormGrid>
            </DialogFormSection>

            {form.subscriptionTypeId && (
              <DialogFormSection title={ct('packages.sectionBenefits')} icon={Sparkles}>
                <p className="text-xs text-muted-foreground">
                  {ct('subscriptions.personalBenefitsHint')}
                </p>
                <DialogFormGrid columns={3}>
                  {benefitKeys.map((key) => (
                    <FieldWrapper key={key} label={ct(`packages.benefit_${key}`)}>
                      <div className="flex items-center overflow-hidden rounded-md border bg-background">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => setForm((current) => ({
                            ...current,
                            benefits: { ...current.benefits, [key]: Math.max(0, current.benefits[key] - 1) },
                          }))}
                        >
                          −
                        </Button>
                        <Input
                          className="nums border-0 text-center shadow-none"
                          type="number"
                          min={0}
                          value={form.benefits[key]}
                          onChange={(event) => setForm((current) => ({
                            ...current,
                            benefits: { ...current.benefits, [key]: Math.max(0, Number(event.target.value) || 0) },
                          }))}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => setForm((current) => ({
                            ...current,
                            benefits: { ...current.benefits, [key]: current.benefits[key] + 1 },
                          }))}
                        >
                          +
                        </Button>
                      </div>
                    </FieldWrapper>
                  ))}
                </DialogFormGrid>
              </DialogFormSection>
            )}

            <DialogFormSection title={ct('subscriptions.sectionPayment')} icon={Wallet}>
              <DialogFormGrid>
                <FieldWrapper label={ct('subscriptions.paymentMethod')}>
                  <select
                    className={selectCls}
                    value={form.paymentMethod}
                    onChange={(e) => setForm((f) => ({ ...f, paymentMethod: e.target.value as typeof form.paymentMethod }))}
                  >
                    <option value="cash">{ct('payments.cash')}</option>
                    <option value="card">{ct('payments.card')}</option>
                    <option value="bank">{ct('payments.bank')}</option>
                    <option value="online">{ct('payments.online')}</option>
                    <option value="visa">{ct('payments.visa')}</option>
                    <option value="transfer">{ct('payments.transfer')}</option>
                    <option value="wallet">{ct('payments.wallet')}</option>
                  </select>
                </FieldWrapper>
                <FieldWrapper label={ct('subscriptions.receiptNumber')}>
                  <Input
                    className="nums"
                    dir="ltr"
                    value={form.receiptNumber}
                    onChange={(e) => setForm((f) => ({ ...f, receiptNumber: e.target.value }))}
                  />
                </FieldWrapper>
                {!editSubId && (
                  <FieldWrapper label={ct('subscriptions.paid')}>
                    <Input
                      className="nums"
                      type="number"
                      min={0}
                      step="any"
                      value={form.paidAmount}
                      onChange={(e) => setForm((f) => ({ ...f, paidAmount: e.target.value }))}
                    />
                  </FieldWrapper>
                )}
              </DialogFormGrid>
              {editSubId ? (
                <SubscriptionPaymentPanel
                  value={formNetValue}
                  paid={Number(form.paidAmount) || 0}
                  remaining={editRemainingAmount ?? 0}
                  receipts={subscriptionReceipts}
                  loading={loadingSubscriptionReceipts}
                />
              ) : (
                <DialogFormSummary
                  items={[
                    { label: ct('subscriptions.value'), value: toArabicDigits(form.subscriptionValue || 0) },
                    {
                      label: ct('subscriptions.paid'),
                      value: toArabicDigits(form.paidAmount || 0),
                      accent: 'success',
                    },
                    {
                      label: ct('subscriptions.remaining'),
                      value: toArabicDigits(formRemaining),
                      accent: 'warning',
                    },
                  ]}
                />
              )}
            </DialogFormSection>
          </FormDialogBody>

          <FormDialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{ct('common.cancel')}</Button>
            <Button variant="brand" onClick={() => void saveSub()} disabled={saving}>{saving ? ct('common.saving') : ct('common.save')}</Button>
          </FormDialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={paymentOpen}
        onOpenChange={(open) => {
          setPaymentOpen(open);
          if (!open) setPaymentSub(null);
        }}
      >
        <DialogContent size="lg" aria-describedby={undefined}>
          <DialogHeader><DialogTitle>{ct('subscriptions.paymentTitle')}</DialogTitle></DialogHeader>
          {paymentSub && (
            <SubscriptionPaymentPanel
              value={subscriptionNetValue(paymentSub)}
              paid={paymentSub.paidAmount}
              remaining={paymentMaxRemaining}
              receipts={subscriptionReceipts}
              loading={loadingSubscriptionReceipts}
            />
          )}
          <FieldWrapper label={ct('common.amount')} hint={ct('subscriptions.partialPaymentHint')}>
            <Input
              className="nums text-lg"
              type="number"
              min={0}
              max={paymentMaxRemaining > 0 ? paymentMaxRemaining : undefined}
              step="any"
              placeholder="0"
              value={paymentAmount}
              onChange={(e) => setPaymentAmount(e.target.value)}
            />
          </FieldWrapper>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setPaymentOpen(false)}>{ct('common.cancel')}</Button>
            <Button variant="brand" onClick={() => void pay()} disabled={saving}>{ct('subscriptions.pay')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent size="md" aria-describedby={undefined}>
          <DialogHeader><DialogTitle>{ct('subscriptions.newTransfer')}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <Input className="nums" placeholder={ct('subscriptions.subscriptionId')} value={transferForm.subscriptionId} onChange={(e) => setTransferForm((f) => ({ ...f, subscriptionId: e.target.value, toSubscriptionTypeId: '' }))} />
            <div className="grid gap-2">
              <Label>{ct('subscriptions.transferToType')}</Label>
              {(() => {
                const fromSub = (data?.data ?? []).find(
                  (s) => s.id === Number(transferForm.subscriptionId),
                );
                if (!transferForm.subscriptionId || !fromSub) {
                  return (
                    <p className="rounded-xl border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
                      {ct('subscriptions.subscriptionId')}
                    </p>
                  );
                }
                return (
                  <TransferPlanPicker
                    types={(subTypes ?? []) as ClubSubscriptionType[]}
                    sourceIsSessions={Boolean(fromSub.isLinkedToSessions)}
                    excludeTypeId={fromSub.subscriptionTypeId}
                    value={transferForm.toSubscriptionTypeId}
                    onChange={(typeId) =>
                      setTransferForm((f) => ({ ...f, toSubscriptionTypeId: typeId }))
                    }
                  />
                );
              })()}
            </div>
            <Input type="date" value={transferForm.toStartDate} onChange={(e) => setTransferForm((f) => ({ ...f, toStartDate: e.target.value }))} />
            {subTypes?.find((t) => t.id === Number(transferForm.toSubscriptionTypeId))?.isLinkedToSessions ? (
              <Input className="bg-muted" value={ct('subscriptions.noEndDate')} readOnly />
            ) : (
              <Input type="date" className="bg-muted" value={transferForm.toEndDate} readOnly />
            )}
            <Input className="nums bg-muted" value={transferForm.toValue} readOnly placeholder={ct('subscriptions.transferToValue')} />
          </div>
          <DialogFooter>
            <Button variant="brand" onClick={() => void saveTransfer()} disabled={saving}>{ct('common.save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={memberTransferOpen} onOpenChange={setMemberTransferOpen}>
        <DialogContent size="xl" aria-describedby={undefined}>
          <DialogHeader><DialogTitle>{ct('subscriptions.memberTransfer')}</DialogTitle></DialogHeader>
          <div className="grid gap-5">
            <div className="grid gap-2">
              <Label>{ct('subscriptions.sourceSubscription')}</Label>
              <Input
                className="nums"
                inputMode="numeric"
                placeholder={ct('subscriptions.subscriptionId')}
                value={memberTransferSubscriptionId}
                onChange={(e) => {
                  setMemberTransferSubscriptionId(e.target.value.replace(/\D/g, ''));
                  setMemberTransferPreset(null);
                  setMemberTransferTarget(null);
                }}
              />
            </div>

            {loadingMemberTransferSource && (
              <p className="rounded-xl border border-dashed p-3 text-sm text-muted-foreground">
                {ct('common.loading')}
              </p>
            )}
            {memberTransferSourceError && memberTransferSubscriptionId && (
              <p className="rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                {ct('subscriptions.subscriptionNotFound')}
              </p>
            )}
            {memberTransferDetails && (
              <>
                <section className="overflow-hidden rounded-2xl border border-primary/20">
                  <div className="flex items-center gap-2 bg-primary/10 px-4 py-3 font-semibold text-primary">
                    <CreditCard className="size-4" /> {ct('subscriptions.transferSubscriptionData')}
                  </div>
                  <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
                    <TransferDetail label={ct('subscriptions.subNumber')} value={memberTransferDetails.subscriptionNumber} numeric />
                    <TransferDetail label={ct('subscriptions.subType')} value={memberTransferDetails.subscriptionType} />
                    <TransferDetail label={ct('common.status')} value={memberTransferDetails.status} />
                    <TransferDetail label={ct('subscriptions.value')} value={formatMoney(memberTransferDetails.subscriptionValue)} numeric />
                    <TransferDetail label={ct('subscriptions.startDate')} value={memberTransferDetails.subscriptionStartDate} numeric />
                    <TransferDetail label={ct('subscriptions.endDate')} value={memberTransferDetails.subscriptionEndDate} numeric />
                    <TransferDetail label={ct('subscriptions.paid')} value={formatMoney(memberTransferDetails.paidAmount)} numeric />
                    <TransferDetail label={ct('subscriptions.remaining')} value={formatMoney(memberTransferDetails.remainingAmount)} numeric />
                  </div>
                </section>

                <section className="overflow-hidden rounded-2xl border">
                  <div className="flex items-center gap-2 bg-muted/60 px-4 py-3 font-semibold">
                    <User className="size-4 text-muted-foreground" /> {ct('subscriptions.transferFromMemberData')}
                  </div>
                  <div className="grid gap-4 p-4 sm:grid-cols-3">
                    <TransferDetail label={ct('common.name')} value={memberTransferDetails.customerName} />
                    <TransferDetail label={ct('members.memberCode')} value={memberTransferDetails.memberCode} numeric />
                    <TransferDetail label={ct('members.phone')} value={memberTransferDetails.customerPhone} numeric />
                  </div>
                </section>
              </>
            )}

            <section className="overflow-hidden rounded-2xl border border-emerald-500/20">
              <div className="flex items-center gap-2 bg-emerald-500/10 px-4 py-3 font-semibold text-emerald-700 dark:text-emerald-400">
                <Repeat className="size-4" /> {ct('subscriptions.transferToMemberData')}
              </div>
              <div className="grid gap-4 p-4">
                <div className="grid gap-2">
                  <Label>{ct('subscriptions.toMember')}</Label>
                  <MemberSearchCombobox
                    selectedMember={memberTransferTarget}
                    onSelect={setMemberTransferTarget}
                    onClear={() => setMemberTransferTarget(null)}
                    disabled={!memberTransferDetails}
                  />
                </div>
                {memberTransferTarget && (
                  <div className="grid gap-4 rounded-xl bg-emerald-500/5 p-4 sm:grid-cols-3">
                    <TransferDetail label={ct('common.name')} value={memberTransferTarget.name} />
                    <TransferDetail label={ct('members.memberCode')} value={memberTransferTarget.memberCode} numeric />
                    <TransferDetail label={ct('members.phone')} value={memberTransferTarget.phone} numeric />
                  </div>
                )}
                <div className="grid gap-2">
                  <Label>{ct('subscriptions.transferReason')} <span className="text-destructive">*</span></Label>
                  <Textarea
                    rows={3}
                    maxLength={1000}
                    value={memberTransferReason}
                    onChange={(event) => setMemberTransferReason(event.target.value)}
                    placeholder={ct('subscriptions.transferReasonPlaceholder')}
                    disabled={!memberTransferDetails}
                  />
                </div>
              </div>
            </section>

            <p className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-muted-foreground">
              {ct('subscriptions.subscriptionTransferKeepsData')}
            </p>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setMemberTransferOpen(false)}>{ct('common.cancel')}</Button>
            <Button
              variant="brand"
              onClick={() => void saveMemberTransfer()}
              disabled={saving || !memberTransferDetails || !memberTransferTarget || !memberTransferReason.trim()}
            >
              {saving ? ct('common.saving') : ct('subscriptions.memberTransfer')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={receiptOpen} onOpenChange={setReceiptOpen}>
        <DialogContent size="sm" aria-describedby={undefined}>
          <DialogHeader><DialogTitle>{ct('subscriptions.newReceipt')}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <Input placeholder={ct('subscriptions.customerName')} value={receiptForm.memberName} onChange={(e) => setReceiptForm((f) => ({ ...f, memberName: e.target.value }))} />
            <Input className="nums" type="number" min={0} step="any" placeholder={ct('common.amount')} value={receiptForm.amount} onChange={(e) => setReceiptForm((f) => ({ ...f, amount: e.target.value }))} />
            <Input className="font-mono" dir="ltr" placeholder={ct('subscriptions.memberIdOptional')} value={receiptForm.memberCode} onChange={(e) => setReceiptForm((f) => ({ ...f, memberCode: e.target.value }))} />
            <Input className="nums" placeholder={ct('subscriptions.subscriptionId')} value={receiptForm.subscriptionId} onChange={(e) => setReceiptForm((f) => ({ ...f, subscriptionId: e.target.value }))} />
          </div>
          <DialogFooter>
            <Button variant="brand" onClick={() => void saveReceipt()} disabled={saving}>{ct('common.save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={freezeOpen} onOpenChange={setFreezeOpen}>
        <DialogContent size="sm" aria-describedby={undefined}>
          <DialogHeader><DialogTitle>{ct('subscriptions.freezeTitle')}</DialogTitle></DialogHeader>
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
            <Button variant="outline" onClick={() => setFreezeOpen(false)}>{ct('common.cancel')}</Button>
            <Button variant="brand" onClick={() => void submitFreeze()} disabled={saving}>
              {saving ? ct('common.saving') : ct('subscriptions.freeze')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={renewOpen} onOpenChange={setRenewOpen}>
        <DialogContent size="md" aria-describedby={undefined}>
          <DialogHeader><DialogTitle>{ct('subscriptions.renewTitle')}</DialogTitle></DialogHeader>
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
            <Button variant="outline" onClick={() => setRenewOpen(false)}>{ct('common.cancel')}</Button>
            <Button variant="brand" onClick={() => void submitRenew()} disabled={saving}>
              {saving ? ct('common.saving') : ct('subscriptions.renew')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {canPrint && <SubscriptionInvoicePrint
        open={!!printSub}
        onOpenChange={(open) => !open && setPrintSub(null)}
        subscription={printSub}
      />}
    </div>
  );
}
