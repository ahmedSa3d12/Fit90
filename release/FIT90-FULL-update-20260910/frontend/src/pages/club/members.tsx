import type { ColumnDef } from '@tanstack/react-table';
import { Copy, LogIn, LogOut, MoreHorizontal, Pencil, Plus, Settings, Trash2, User, Wallet, X, Phone, Briefcase, Smartphone, PhoneCall } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { DataTable } from '@/components/common/data-table';
import { FilterBar, type FilterField } from '@/components/common/filter-bar';
import { PageHeader } from '@/components/common/page-header';
import { StatusBadge } from '@/components/common/status-badge';
import { ErrorState } from '@/components/common/states';
import { ClubStatCard } from '@/components/club/stat-card';
import { MemberCell } from '@/components/club/member-cell';
import { DialogFormGrid, DialogFormSection, DialogFormToggle } from '@/components/common/dialog-form-layout';
import { FieldWrapper } from '@/components/common/form-fields';
import { UploadField } from '@/components/employees/upload-fields';
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useBranches } from '@/hooks/use-branches';
import { useClubT } from '@/hooks/use-club-t';
import { api, apiError } from '@/lib/api';
import { useAuth } from '@/store/auth';
import {
  useArrayResource,
  useMutationWithToast,
  usePaginatedList,
} from '@/lib/api-hooks';
import { confirm, afterMenuClose } from '@/lib/confirm';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import { memberPrimarySaveAction } from './member-form-actions';
import type { ClubMembersView } from '@/lib/club-routes';
import type {
  ClubMemberCreateResponse,
  ClubMemberFormData,
  ClubMemberListItem,
  ClubMemberStatistics,
  ClubMembershipType,
} from '@/types/club';

const selectCls = 'flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm';

// Local extension of the shared form data with the extra FIT90 add-member fields
// (trainer, sales staff, source, emergency contact). Stored as strings in the
// form and converted on save.
type MemberFormData = ClubMemberFormData & {
  trainerId: string;
  sourceId: string;
  emergencyName: string;
  emergencyPhone: string;
  emergencyRelation: string;
  guardianName: string;
  guardianPhone: string;
};

// The member row from GET /club-members now returns these extra fields too.
type MemberRow = ClubMemberListItem & {
  trainerId?: number | null;
  sourceId?: number | null;
  emergencyName?: string | null;
  emergencyPhone?: string | null;
  emergencyRelation?: string | null;
  guardianName?: string | null;
  guardianPhone?: string | null;
};

const EMPTY_FORM: MemberFormData = {
  branchId: 0,
  name: '',
  phone: '',
  gender: 'male',
  cardNumber: '',
  email: '',
  dateOfBirth: '',
  address: '',
  maritalStatus: '',
  jobTitle: '',
  profilePicture: '',
  notes: '',
  isActive: true,
  autoCreateUser: true,
  employeeId: undefined,
  trainerId: '',
  sourceId: '',
  emergencyName: '',
  emergencyPhone: '',
  emergencyRelation: '',
  guardianName: '',
  guardianPhone: '',
};

function resolveBranchName(
  branches: { id: number; name: string | null }[] | undefined,
  branchId: number,
  userBranchId?: number,
  userBranchName?: string | null,
): string {
  if (!branchId) return '—';
  const name = branches?.find((b) => b.id === branchId)?.name?.trim();
  if (name) return name;
  if (userBranchName?.trim() && userBranchId === branchId) return userBranchName.trim();
  return branches === undefined ? '…' : '—';
}

interface AttendanceRow {
  id: number;
  memberName: string;
  memberCode: string;
  attendanceDate: string;
  checkInTime: string;
  checkOutTime: string | null;
  status: string;
  duration: number | null;
}

export interface ClubMembersPageProps {
  singleView?: ClubMembersView;
}

export function ClubMembersPage({ singleView }: ClubMembersPageProps = {}) {
  const ct = useClubT();
  const { user } = useAuth();
  const navigate = useNavigate();
  const genderOptions = useMemo(
    () => [
      { value: 'male', label: ct('common.male') },
      { value: 'female', label: ct('common.female') },
    ],
    [ct],
  );
  const statusOptions = useMemo(
    () => [
      { value: 'active', label: ct('common.active') },
      { value: 'inactive', label: ct('common.inactive') },
    ],
    [ct],
  );
  const [tab, setTab] = useState<ClubMembersView>(singleView ?? 'members');
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, error, refetch } = usePaginatedList<ClubMemberListItem>(
    'club-members',
    params,
  );
  const { data: branches } = useBranches();
  const { data: membershipTypes, refetch: refetchTypes } = useArrayResource<ClubMembershipType>('club-membership-types');
  const { data: trainers } = useArrayResource<{ id: number; name: string }>('club-trainers');
  const { data: salesReps } = useQuery({
    queryKey: ['employees', 'sales-reps'],
    queryFn: async () => {
      const { data } = await api.get<Array<{ id: number; name: string | null; empCode: number | null }>>('/employees/sales-reps');
      return data;
    },
  });
  const salesRepOptions = useMemo(
    () => (salesReps ?? []).map((e) => ({ value: String(e.id), label: e.name ?? `#${e.id}` })),
    [salesReps],
  );
  const { data: customerSources } = useArrayResource<{ id: number; name: string }>('club-customer-sources');
  const qc = useQueryClient();
  const attParams = useListQuery({ pageSize: 20 });
  const [attStartDate, setAttStartDate] = useState('');
  const [attEndDate, setAttEndDate] = useState('');
  const attApiParams = useMemo(() => ({
    ...attParams.params,
    filters: { ...attParams.params.filters, startDate: attStartDate, endDate: attEndDate }
  }), [attParams.params, attStartDate, attEndDate]);
  const {
    data: attendance,
    isLoading: attLoading,
    isError: attError,
    refetch: refetchAttendance,
  } = usePaginatedList<AttendanceRow>('club-attendance', attApiParams);
  const [financialId, setFinancialId] = useState('');
  const [typeOpen, setTypeOpen] = useState(false);
  const [typeEditId, setTypeEditId] = useState<number | null>(null);
  const [typeForm, setTypeForm] = useState({ name: '', price: '', durationDays: '' });
  const { data: financial, refetch: refetchFinancial } = useQuery({
    queryKey: ['club-members', 'financial', financialId],
    queryFn: async () => {
      const { data: f } = await api.get<{
        summary: {
          totalSubscriptions: number;
          totalPaidOnSubscriptions: number;
          totalRemaining: number;
        };
        timeline: Array<{
          kind: 'subscription' | 'receipt';
          sortDate: string;
          data: { subscriptionNumber?: string; receiptNumber?: string; paidAmount?: number; amount?: number };
        }>;
      }>(`/club-members/${financialId}/financial-history`);
      return f;
    },
    enabled: !!financialId,
  });
  const { data: stats } = useQuery({
    queryKey: ['club-members', 'statistics'],
    queryFn: async () => {
      const { data: s } = await api.get<ClubMemberStatistics>('/club-members/statistics');
      return s;
    },
  });
  const { data: attStats } = useQuery({
    queryKey: ['club-attendance', 'statistics'],
    queryFn: async () => {
      const { data: s } = await api.get<{
        todayCheckIns: number;
        todayCheckOuts: number;
        activeCheckIns: number;
        totalRecords: number;
      }>('/club-attendance/statistics');
      return s;
    },
    enabled: tab === 'attendance' || singleView === 'attendance',
  });

  const branchOptions = (branches ?? []).map((b) => ({ value: String(b.id), label: b.name ?? '—' }));

  const filters: FilterField[] = [
    { key: 'branch', label: ct('common.branch'), type: 'select', options: branchOptions },
    { key: 'status', label: ct('common.status'), type: 'select', options: statusOptions },
    { key: 'gender', label: ct('members.gender'), type: 'select', options: genderOptions },
  ];

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<MemberFormData>(EMPTY_FORM);

  const formBranchName = useMemo(
    () => resolveBranchName(branches, form.branchId, user?.branch),
    [branches, form.branchId, user?.branch],
  );
  const [saving, setSaving] = useState(false);
  const [generatedCredentials, setGeneratedCredentials] = useState<{ username: string; password: string } | null>(null);
  const [undoMemberId, setUndoMemberId] = useState<number | null>(null);
  const [editMemberCode, setEditMemberCode] = useState('');

  // Live duplicate check (NEW members only): debounced lookup of phone.
  type DuplicateHit = { field: 'phone' | 'cardNumber'; name: string; memberCode: string };
  const [dupHits, setDupHits] = useState<DuplicateHit[]>([]);
  const phoneHit = dupHits.find((h) => h.field === 'phone');

  useEffect(() => {
    // Only for creating a NEW member (never while editing an existing record).
    if (!dialogOpen || editId != null) {
      setDupHits([]);
      return;
    }
    const phone = form.phone.trim();
    if (!phone) {
      setDupHits([]);
      return;
    }
    let cancelled = false;
    const handle = setTimeout(() => {
      void (async () => {
        try {
          const { data } = await api.get<{ duplicates?: DuplicateHit[] }>(
            '/club-members/check-duplicate',
            { params: { phone } },
          );
          if (!cancelled) setDupHits(data.duplicates ?? []);
        } catch {
          if (!cancelled) setDupHits([]);
        }
      })();
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [dialogOpen, editId, form.phone]);

  const [checkInCode, setCheckInCode] = useState('');
  const [checkInLoading, setCheckInLoading] = useState(false);
  const checkInRef = useRef<HTMLInputElement>(null);

  const deleteMutation = useMutationWithToast(
    (id: number) => api.delete(`/club-members/${id}`),
    {
      success: ct('common.success'),
      invalidate: ['club-members'],
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: ['club-members', 'statistics'] });
      },
    },
  );

  const openCreate = () => {
    const branchId = user?.branch && user.branch > 0 ? user.branch : (branches?.[0]?.id ?? 0);
    setEditId(null);
    setForm({
      ...EMPTY_FORM,
      branchId,
      employeeId: user?.emp_code ?? undefined,
    });
    setGeneratedCredentials(null);
    setUndoMemberId(null);
    setEditMemberCode('');
    setDialogOpen(true);
  };

  const openEdit = (row: MemberRow) => {
    setEditId(row.id);
    setForm({
      branchId: row.branchId,
      name: row.name,
      phone: row.phone ?? '',
      gender: row.gender,
      cardNumber: row.cardNumber ?? '',
      email: row.email ?? '',
      dateOfBirth: row.dateOfBirth ?? '',
      address: row.address ?? '',
      maritalStatus: row.maritalStatus ?? '',
      jobTitle: row.jobTitle ?? '',
      profilePicture: row.profilePicture ?? '',
      notes: row.notes ?? '',
      isActive: row.isActive,
      autoCreateUser: false,
      employeeId: row.employeeId ?? user?.emp_code ?? undefined,
      trainerId: row.trainerId != null ? String(row.trainerId) : '',
      salesId: row.salesId ?? undefined,
      sourceId: row.sourceId != null ? String(row.sourceId) : '',
      emergencyName: row.emergencyName ?? '',
      emergencyPhone: row.emergencyPhone ?? '',
      emergencyRelation: row.emergencyRelation ?? '',
      guardianName: row.guardianName ?? '',
      guardianPhone: row.guardianPhone ?? '',
    });
    setGeneratedCredentials(null);
    setUndoMemberId(null);
    setEditMemberCode(row.memberCode);
    setDialogOpen(true);
  };

  const saveMember = async (andAddSubscription = false) => {
    if (!form.name.trim()) {
      toast.error(ct('members.nameRequired'));
      return;
    }
    if (!form.phone.trim()) {
      toast.error(ct('members.phoneRequired'));
      return;
    }
    if (!form.branchId) {
      toast.error(ct('members.branchRequired'));
      return;
    }

    const cardNumber = form.cardNumber.trim();

    setSaving(true);
    try {
      const dupRes = await api.get('/club-members/check-duplicate', {
        params: {
          phone: form.phone,
          ...(cardNumber ? { cardNumber } : {}),
          excludeMemberId: editId ?? undefined,
        },
      });
      if (dupRes.data.hasDuplicates) {
        toast.error(dupRes.data.message ?? ct('members.duplicateData'));
        setSaving(false);
        return;
      }

      const payload = {
        ...form,
        ...(cardNumber ? { cardNumber } : { cardNumber: undefined }),
        email: form.email || undefined,
        dateOfBirth: form.dateOfBirth || undefined,
        address: form.address || undefined,
        maritalStatus: form.maritalStatus || undefined,
        jobTitle: form.jobTitle || undefined,
        profilePicture: form.profilePicture || undefined,
        notes: form.notes || undefined,
        autoCreateUser: form.autoCreateUser,
        trainerId: form.trainerId ? Number(form.trainerId) : undefined,
        salesId: form.salesId || undefined,
        sourceId: form.sourceId ? Number(form.sourceId) : undefined,
        emergencyName: form.emergencyName || undefined,
        emergencyPhone: form.emergencyPhone || undefined,
        emergencyRelation: form.emergencyRelation || undefined,
        guardianName: form.guardianName || undefined,
        guardianPhone: form.guardianPhone || undefined,
      };

      if (editId) {
        await api.put(`/club-members/${editId}`, payload);
        toast.success(ct('members.memberUpdated'));
        setDialogOpen(false);
      } else {
        const { data: created } = await api.post<ClubMemberCreateResponse>('/club-members', payload);
        if (andAddSubscription && created.member?.id) {
          if (created.generatedCredentials) {
            toast.success(
              `${ct('members.memberAdded')} — ${ct('members.appUsername')}: ${created.generatedCredentials.username} / ${created.generatedCredentials.password}`,
              { duration: 12000 },
            );
          } else {
            toast.success(ct('members.memberAdded'));
          }
          void qc.invalidateQueries({ queryKey: ['club-members'] });
          void qc.invalidateQueries({ queryKey: ['club-members', 'dropdown'] });
          setDialogOpen(false);
          navigate('/club/subscriptions/new', { state: { prefillMember: created.member } });
          return;
        }
        toast.success(ct('members.memberAdded'), {
          duration: 10000,
          action: {
            label: ct('common.undo') ?? 'تراجع',
            onClick: () => {
              if (created.member?.id) {
                setUndoMemberId(created.member.id);
                void api.delete(`/club-members/${created.member.id}`).then(() => {
                  toast.success(ct('members.memberUndone'));
                  void qc.invalidateQueries({ queryKey: ['club-members'] });
                });
              }
            },
          },
        });
        if (created.generatedCredentials) {
          setGeneratedCredentials(created.generatedCredentials);
        }
      }
      void qc.invalidateQueries({ queryKey: ['club-members'] });
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const saveMembershipType = async () => {
    if (!typeForm.name.trim() || !typeForm.price || !typeForm.durationDays) {
      toast.error(ct('members.fillRequired'));
      return;
    }
    setSaving(true);
    try {
      const body = {
        name: typeForm.name,
        price: Number(typeForm.price),
        durationDays: Number(typeForm.durationDays),
      };
      if (typeEditId) {
        await api.put(`/club-membership-types/${typeEditId}`, body);
      } else {
        await api.post('/club-membership-types', body);
      }
      toast.success(ct('common.success'));
      setTypeOpen(false);
      setTypeEditId(null);
      setTypeForm({ name: '', price: '', durationDays: '' });
      void refetchTypes();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const deleteMembershipType = async (id: number) => {
    const ok = await confirm({ title: ct('common.confirmDelete'), variant: 'destructive', confirmLabel: ct('common.delete') });
    if (!ok) return;
    try {
      await api.delete(`/club-membership-types/${id}`);
      toast.success(ct('members.typeDeleted'));
      void refetchTypes();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const handleDelete = async (row: ClubMemberListItem) => {
    const ok = await confirm({
      title: ct('members.deleteMember'),
      description: ct('members.deleteMemberDesc', { name: row.name }),
      confirmLabel: ct('common.delete'),
      variant: 'destructive',
    });
    if (ok) deleteMutation.mutate(row.id);
  };

  const handleCheckIn = async () => {
    const code = checkInCode.trim();
    if (!code) {
      toast.error(ct('members.enterCode'));
      return;
    }
    setCheckInLoading(true);
    try {
      const { data: list } = await api.get<{ data: ClubMemberListItem[] }>('/club-members', {
        params: { search: code, pageSize: 5 },
      });
      const exact = list.data.find((m) => m.memberCode === code || m.cardNumber === code);
      if (!exact) {
        toast.error(ct('members.noMemberFound'));
        setCheckInLoading(false);
        return;
      }
      await api.post('/club-attendance/check-in', { memberId: exact.id });
      toast.success(ct('members.checkInNamed', { name: exact.name }));
      setCheckInCode('');
      checkInRef.current?.focus();
      void qc.invalidateQueries({ queryKey: ['club-attendance'] });
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setCheckInLoading(false);
    }
  };

  const handleCheckOut = async (attendanceId: number) => {
    try {
      await api.post('/club-attendance/check-out', { attendanceId });
      toast.success(ct('members.checkedOut'));
      void qc.invalidateQueries({ queryKey: ['club-attendance'] });
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const columns = useMemo<ColumnDef<ClubMemberListItem>[]>(
    () => [
      {
        id: 'index',
        header: ct('common.index'),
        cell: ({ row }) => toArabicDigits((params.page - 1) * params.pageSize + row.index + 1),
      },
      {
        accessorKey: 'memberCode',
        header: ct('members.memberCode'),
        cell: ({ getValue }) => <span className="nums font-mono">{getValue() as string}</span>,
      },
      {
        accessorKey: 'name',
        header: ct('members.name'),
        cell: ({ row }) => (
          <MemberCell
            name={row.original.name}
            code={row.original.memberCode}
            profilePicture={row.original.profilePicture}
            showCode={false}
          />
        ),
      },
      {
        accessorKey: 'phone',
        header: ct('members.phone'),
        cell: ({ getValue }) => {
          const v = getValue() as string | null;
          return v ? <span className="nums">{toArabicDigits(v)}</span> : '—';
        },
      },
      {
        accessorKey: 'gender',
        header: ct('members.gender'),
        cell: ({ getValue }) => (getValue() === 'male' ? ct('common.male') : ct('common.female')),
      },
      {
        accessorKey: 'membershipType',
        header: ct('members.membershipType'),
        cell: ({ row }) => row.original.membershipType?.name ?? '—',
      },
      {
        accessorKey: 'isActive',
        header: ct('common.status'),
        cell: ({ row }) => (
          <StatusBadge status={row.original.isActive ? 'active' : 'suspended'} />
        ),
      },
      {
        id: 'actions',
        header: ct('common.actions'),
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={ct('common.actions')}>
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => afterMenuClose(() => openEdit(row.original))}>
                <Pencil className="size-4" /> {ct('common.edit')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive"
                onSelect={() => void handleDelete(row.original)}
              >
                <Trash2 className="size-4" /> {ct('common.delete')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    [ct, params.page, params.pageSize],
  );

  const attColumns = useMemo<ColumnDef<AttendanceRow>[]>(
    () => [
      { accessorKey: 'memberName', header: ct('members.name') },
      { accessorKey: 'memberCode', header: ct('members.memberCode'), cell: ({ getValue }) => <span className="nums font-mono">{getValue() as string}</span> },
      { accessorKey: 'attendanceDate', header: ct('members.attendanceDate'), cell: ({ getValue }) => <span className="nums">{toArabicDigits(getValue() as string)}</span> },
      { accessorKey: 'checkInTime', header: ct('members.checkInTime'), cell: ({ getValue }) => <span className="nums">{new Date(getValue() as string).toLocaleTimeString()}</span> },
      { accessorKey: 'checkOutTime', header: ct('members.checkOutTime'), cell: ({ getValue }) => getValue() ? <span className="nums">{new Date(getValue() as string).toLocaleTimeString()}</span> : '—' },
      {
        accessorKey: 'duration',
        header: ct('members.duration'),
        cell: ({ getValue }) => {
          const v = getValue() as number | null;
          return v != null ? <span className="nums">{toArabicDigits(v)}</span> : '—';
        },
      },
      {
        id: 'actions',
        header: ct('common.actions'),
        cell: ({ row }) => {
          const today = new Date().toISOString().slice(0, 10);
          return row.original.status === 'checked_in' && row.original.attendanceDate === today ? (
            <Button size="sm" variant="outline" onClick={() => void handleCheckOut(row.original.id)}>
              <LogOut className="size-4" /> {ct('members.checkOut')}
            </Button>
          ) : (
            <StatusBadge
              status={row.original.status === 'checked_in' ? 'active' : 'unset'}
              label={row.original.status === 'checked_in' ? ct('common.active') : ct('members.checkedOut')}
            />
          );
        },
      },
    ],
    [ct],
  );

  if (isError) {
    return (
      <div className="space-y-6">
        <PageHeader title={ct('members.title')} description={ct('members.description')} />
        <ErrorState message={apiError(error)} onRetry={() => void refetch()} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={singleView === 'attendance' ? ct('mosDashboard.quickAttendance') : ct('members.title')}
        description={ct('members.description')}
        actions={
          singleView !== 'attendance' ? (
            <Button variant="brand" onClick={openCreate}>
              <Plus className="size-4" /> {ct('members.newMember')}
            </Button>
          ) : undefined
        }
      />

      {stats && (
        <div className="grid gap-4 sm:grid-cols-3">
          <ClubStatCard label={ct('members.total')} value={stats.total} />
          <ClubStatCard label={ct('members.active')} value={stats.active} />
          <ClubStatCard label={ct('members.inactive')} value={stats.inactive} />
        </div>
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v as ClubMembersView)}>
        {!singleView && (
        <TabsList className="flex h-auto flex-wrap gap-1">
          <TabsTrigger value="members"><User className="size-4" /> {ct('members.tabMembers')}</TabsTrigger>
          <TabsTrigger value="attendance"><LogIn className="size-4" /> {ct('members.tabAttendance')}</TabsTrigger>
          <TabsTrigger value="types"><Settings className="size-4" /> {ct('members.tabTypes')}</TabsTrigger>
          <TabsTrigger value="financial"><Wallet className="size-4" /> {ct('members.tabFinancial')}</TabsTrigger>
        </TabsList>
        )}

        <TabsContent value="members" className="space-y-4 pt-4">
          <div className="rounded-xl border bg-card p-4 shadow-sm">
            <h3 className="mb-3 flex items-center gap-2 font-medium">
              <LogIn className="size-4 text-primary" /> {ct('members.barcodeTitle')}
            </h3>
            <div className="flex flex-wrap gap-2">
              <Input
                ref={checkInRef}
                className="max-w-xs"
                placeholder={ct('members.barcodePlaceholder')}
                value={checkInCode}
                onChange={(e) => setCheckInCode(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void handleCheckIn()}
              />
              <Button variant="brand" onClick={() => void handleCheckIn()} disabled={checkInLoading}>
                {ct('members.checkIn')}
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
            onPageSizeChange={(pageSize) => setParams({ pageSize, page: 1 })}
            search={params.search}
            onSearchChange={(search) => setParams({ search, page: 1 })}
            isLoading={isLoading}
            isError={isError}
            onRetry={() => void refetch()}
            emptyTitle={ct('members.emptyMembers')}
            emptyAction={
              <Button variant="brand" onClick={openCreate}>
                <User className="size-4" /> {ct('members.addFirst')}
              </Button>
            }
          />
        </TabsContent>

        <TabsContent value="attendance" className="space-y-4 pt-4">
          {attStats && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <ClubStatCard label={ct('members.attendanceToday')} value={attStats.todayCheckIns} />
              <ClubStatCard label={ct('members.attendanceCheckout')} value={attStats.todayCheckOuts} />
              <ClubStatCard label={ct('members.attendanceActive')} value={attStats.activeCheckIns} />
              <ClubStatCard label={ct('members.attendanceTotal')} value={attStats.totalRecords} />
            </div>
          )}
          <div className="flex flex-wrap items-end gap-4">
            <div className="grid gap-2">
              <Label>{ct('common.dateFrom')}</Label>
              <Input type="date" value={attStartDate} onChange={(e) => { setAttStartDate(e.target.value); attParams.setParams({ page: 1 }); }} />
            </div>
            <div className="grid gap-2">
              <Label>{ct('common.dateTo')}</Label>
              <Input type="date" value={attEndDate} onChange={(e) => { setAttEndDate(e.target.value); attParams.setParams({ page: 1 }); }} />
            </div>
          </div>
          <DataTable
            columns={attColumns}
            data={attendance?.data ?? []}
            total={attendance?.total ?? 0}
            page={attParams.params.page}
            pageSize={attParams.params.pageSize}
            onPageChange={(page) => attParams.setParams({ page })}
            onPageSizeChange={(pageSize) => attParams.setParams({ pageSize, page: 1 })}
            search={attParams.params.search}
            onSearchChange={(search) => attParams.setParams({ search, page: 1 })}
            isLoading={attLoading}
            isError={attError}
            onRetry={() => void refetchAttendance()}
            emptyTitle={ct('common.noData')}
          />
        </TabsContent>

        <TabsContent value="types" className="space-y-4 pt-4">
          <Button variant="outline" onClick={() => { setTypeEditId(null); setTypeForm({ name: '', price: '', durationDays: '' }); setTypeOpen(true); }}>
            <Plus className="size-4" /> {ct('members.newType')}
          </Button>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(membershipTypes ?? []).map((t) => (
              <div key={t.id} className="flex items-start justify-between rounded-xl border bg-card p-4 shadow-sm">
                <div>
                  <p className="font-medium">{t.name}</p>
                  <p className="mt-1 text-sm text-muted-foreground nums">
                    {toArabicDigits(t.price)} · {toArabicDigits(t.durationDays)} {ct('members.days')}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setTypeEditId(t.id);
                      setTypeForm({ name: t.name, price: String(t.price), durationDays: String(t.durationDays) });
                      setTypeOpen(true);
                    }}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="text-destructive" onClick={() => void deleteMembershipType(t.id)}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
            {(membershipTypes ?? []).length === 0 && (
              <p className="col-span-full text-center text-sm text-muted-foreground">{ct('common.noData')}</p>
            )}
          </div>
        </TabsContent>

        <TabsContent value="financial" className="space-y-4 pt-4">
          <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4">
            <div className="grid gap-2">
              <Label>{ct('members.financialMemberId')}</Label>
              <Input className="nums max-w-xs" value={financialId} onChange={(e) => setFinancialId(e.target.value)} />
            </div>
            <Button variant="brand" onClick={() => void refetchFinancial()} disabled={!financialId}>
              {ct('members.loadFinancial')}
            </Button>
          </div>
          {financial && (
            <>
              <h3 className="font-medium">{ct('members.financialSummary')}</h3>
              <div className="grid gap-4 sm:grid-cols-3">
                <ClubStatCard label={ct('members.totalSubs')} value={financial.summary.totalSubscriptions} />
                <ClubStatCard label={ct('members.totalPaid')} value={financial.summary.totalPaidOnSubscriptions} />
                <ClubStatCard label={ct('members.totalRemaining')} value={financial.summary.totalRemaining} />
              </div>
              <div className="overflow-x-auto rounded-xl border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="p-3 text-start">{ct('common.status')}</th>
                      <th className="p-3 text-start">{ct('common.amount')}</th>
                      <th className="p-3 text-start">{ct('members.attendanceDate')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {financial.timeline.length === 0 && (
                      <tr><td colSpan={3} className="p-6 text-center text-muted-foreground">{ct('common.noData')}</td></tr>
                    )}
                    {financial.timeline.map((item, i) => (
                      <tr key={i} className="border-t">
                        <td className="p-3">{item.kind === 'subscription' ? item.data.subscriptionNumber : item.data.receiptNumber}</td>
                        <td className="p-3 nums">{toArabicDigits(item.data.paidAmount ?? item.data.amount ?? 0)}</td>
                        <td className="p-3 nums">{toArabicDigits(item.sortDate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="flex max-h-[92vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl" aria-describedby={undefined}>
          <DialogHeader className="border-b px-6 py-4">
            <DialogTitle>{editId ? ct('members.editMember') : ct('members.newMember')}</DialogTitle>
          </DialogHeader>

          <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
          {generatedCredentials && (
            <div className="relative rounded-xl border border-primary/30 bg-primary/5 p-4">
              <Button
                size="icon"
                variant="ghost"
                className="absolute start-2 top-2 size-6"
                onClick={() => setGeneratedCredentials(null)}
              >
                <X className="size-4" />
              </Button>
              <p className="mb-2 text-sm font-medium text-primary">{ct('members.credentialsGenerated')}</p>
              <div className="grid gap-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">{ct('members.appUsername')}:</span>
                  <code className="rounded bg-background px-2 py-1 nums" dir="ltr">{generatedCredentials.username}</code>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">{ct('members.appPassword')}:</span>
                  <div className="flex items-center gap-2">
                    <code className="rounded bg-background px-2 py-1 nums" dir="ltr">{generatedCredentials.password}</code>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7"
                      onClick={() => {
                        void navigator.clipboard.writeText(
                          `${ct('members.appUsername')}: ${generatedCredentials.username}\n${ct('members.appPassword')}: ${generatedCredentials.password}`,
                        );
                        toast.success(ct('common.copied'));
                      }}
                    >
                      <Copy className="size-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-4">
            <DialogFormSection title={ct('members.sectionBasic')} icon={User}>
              {editId && (
                <FieldWrapper label={ct('members.memberCode')}>
                  <Input className="nums bg-muted font-mono" dir="ltr" value={editMemberCode} readOnly />
                </FieldWrapper>
              )}
              <DialogFormGrid>
                <FieldWrapper label={ct('common.branch')} required>
                  <Input className="bg-muted" value={formBranchName} readOnly />
                </FieldWrapper>
                <FieldWrapper label={ct('members.name')} required>
                  <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
                </FieldWrapper>
                <FieldWrapper label={ct('members.phone')} required>
                  <Input
                    className="nums"
                    dir="ltr"
                    value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    placeholder="01012345678"
                  />
                  {!editId && phoneHit && (
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      {ct('members.duplicatePhoneWarning', { name: phoneHit.name, code: phoneHit.memberCode })}
                    </p>
                  )}
                </FieldWrapper>
                <FieldWrapper label={ct('members.gender')} required>
                  <select
                    className={selectCls}
                    value={form.gender}
                    onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value as 'male' | 'female' }))}
                  >
                    {genderOptions.map((g) => (
                      <option key={g.value} value={g.value}>{g.label}</option>
                    ))}
                  </select>
                </FieldWrapper>
                <FieldWrapper label={ct('members.dateOfBirth')}>
                  <Input
                    type="date"
                    className="nums"
                    dir="ltr"
                    value={form.dateOfBirth}
                    onChange={(e) => setForm((f) => ({ ...f, dateOfBirth: e.target.value }))}
                  />
                </FieldWrapper>
                <FieldWrapper label={ct('members.registeredBy')}>
                  <Input className="bg-muted" value={user?.name ?? '—'} readOnly />
                </FieldWrapper>
              </DialogFormGrid>

              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_180px]">
                <FieldWrapper label={ct('common.notes')}>
                  <Textarea
                    rows={3}
                    value={form.notes ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                    className="resize-none"
                  />
                </FieldWrapper>
                <FieldWrapper label={ct('members.photo')}>
                  <UploadField
                    category="club-member"
                    value={form.profilePicture}
                    onChange={(path) => setForm((f) => ({ ...f, profilePicture: path ?? '' }))}
                  />
                </FieldWrapper>
              </div>

              <DialogFormToggle
                label={ct('members.isActive')}
                checked={!!form.isActive}
                onCheckedChange={(checked) => setForm((f) => ({ ...f, isActive: checked }))}
              />
            </DialogFormSection>

            <DialogFormSection title={ct('members.sectionContact')} icon={Phone}>
              <DialogFormGrid>
                <FieldWrapper label={ct('members.email')}>
                  <Input
                    type="email"
                    dir="ltr"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="name@example.com"
                  />
                </FieldWrapper>
                <FieldWrapper label={ct('members.maritalStatus')}>
                  <select
                    className={selectCls}
                    value={form.maritalStatus ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, maritalStatus: e.target.value }))}
                  >
                    <option value="">—</option>
                    <option value="single">{ct('members.single')}</option>
                    <option value="married">{ct('members.married')}</option>
                    <option value="divorced">{ct('members.divorced')}</option>
                    <option value="widowed">{ct('members.widowed')}</option>
                  </select>
                </FieldWrapper>
                <FieldWrapper label={ct('members.address')} className="sm:col-span-2">
                  <Input value={form.address ?? ''} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
                </FieldWrapper>
                <FieldWrapper label={ct('members.jobTitle')} className="sm:col-span-2">
                  <Input value={form.jobTitle ?? ''} onChange={(e) => setForm((f) => ({ ...f, jobTitle: e.target.value }))} />
                </FieldWrapper>
              </DialogFormGrid>
            </DialogFormSection>

            <DialogFormSection title={ct('members.sectionStaff')} icon={Briefcase}>
              <DialogFormGrid>
                <FieldWrapper label={ct('members.trainer')}>
                  <select
                    className={selectCls}
                    value={form.trainerId}
                    onChange={(e) => setForm((f) => ({ ...f, trainerId: e.target.value }))}
                  >
                    <option value="">—</option>
                    {(trainers ?? []).map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </FieldWrapper>
                <FieldWrapper label={ct('members.salesRep')}>
                  <select
                    className={selectCls}
                    value={form.salesId ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, salesId: e.target.value ? Number(e.target.value) : undefined }))}
                  >
                    <option value="">—</option>
                    {salesRepOptions.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </FieldWrapper>
                <FieldWrapper label={ct('members.source')}>
                  <select
                    className={selectCls}
                    value={form.sourceId}
                    onChange={(e) => setForm((f) => ({ ...f, sourceId: e.target.value }))}
                  >
                    <option value="">—</option>
                    {(customerSources ?? []).map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </FieldWrapper>
              </DialogFormGrid>
            </DialogFormSection>

            <DialogFormSection title={ct('members.sectionEmergency')} icon={PhoneCall}>
              <DialogFormGrid>
                <FieldWrapper label={ct('members.emergencyName')}>
                  <Input value={form.emergencyName} onChange={(e) => setForm((f) => ({ ...f, emergencyName: e.target.value }))} />
                </FieldWrapper>
                <FieldWrapper label={ct('members.emergencyPhone')}>
                  <Input className="nums" dir="ltr" value={form.emergencyPhone} onChange={(e) => setForm((f) => ({ ...f, emergencyPhone: e.target.value }))} />
                </FieldWrapper>
                <FieldWrapper label={ct('members.emergencyRelation')} className="sm:col-span-2">
                  <Input value={form.emergencyRelation} onChange={(e) => setForm((f) => ({ ...f, emergencyRelation: e.target.value }))} />
                </FieldWrapper>
              </DialogFormGrid>
            </DialogFormSection>

            <DialogFormSection title={ct('members.sectionAppAccount')} icon={Smartphone}>
              {!editId && (
                <DialogFormToggle
                  label={ct('members.autoCreateUser')}
                  hint={ct('members.appAccountHint')}
                  checked={!!form.autoCreateUser}
                  onCheckedChange={(checked) => setForm((f) => ({ ...f, autoCreateUser: checked }))}
                />
              )}
              {(!editId && form.autoCreateUser) || editId ? (
                <FieldWrapper label={ct('members.appUsername')}>
                  <Input className="nums bg-muted" dir="ltr" value={form.phone || ct('members.enterPhone')} readOnly />
                </FieldWrapper>
              ) : null}
              {editId && <p className="text-xs text-muted-foreground">{ct('members.appAccountHint')}</p>}
            </DialogFormSection>
          </div>
          </div>

          <DialogFooter className="border-t bg-muted/20 px-6 py-4 justify-between sm:justify-between">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{ct('common.cancel')}</Button>
            <div className="flex flex-col-reverse gap-3 sm:flex-row">
              {memberPrimarySaveAction(editId) === 'save-changes' ? (
                <Button variant="brand" onClick={() => void saveMember(false)} disabled={saving}>
                  {saving ? ct('common.saving') : ct('members.saveChanges')}
                </Button>
              ) : (
                <Button variant="brand" disabled={saving} onClick={() => void saveMember(true)}>
                  {saving ? ct('common.saving') : ct('members.saveAndAddSub')}
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={typeOpen} onOpenChange={setTypeOpen}>
        <DialogContent className="sm:max-w-sm" aria-describedby={undefined}>
          <DialogHeader><DialogTitle>{typeEditId ? ct('common.edit') : ct('members.newType')}</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-2">
            <Input placeholder={ct('members.typeName')} value={typeForm.name} onChange={(e) => setTypeForm((f) => ({ ...f, name: e.target.value }))} />
            <Input className="nums" placeholder={ct('members.typePrice')} value={typeForm.price} onChange={(e) => setTypeForm((f) => ({ ...f, price: e.target.value }))} />
            <Input className="nums" placeholder={ct('members.typeDays')} value={typeForm.durationDays} onChange={(e) => setTypeForm((f) => ({ ...f, durationDays: e.target.value }))} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTypeOpen(false)}>{ct('common.cancel')}</Button>
            <Button variant="brand" onClick={() => void saveMembershipType()} disabled={saving}>{ct('common.save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
