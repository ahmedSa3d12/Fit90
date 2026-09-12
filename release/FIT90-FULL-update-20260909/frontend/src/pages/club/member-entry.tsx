import type { ColumnDef } from '@tanstack/react-table';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LogIn, LogOut, ScanLine } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { DataTable, type PaginatedResponse } from '@/components/common/data-table';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useClubT } from '@/hooks/use-club-t';
import { api, apiError } from '@/lib/api';
import { listQueryToApiParams, useListQuery } from '@/lib/use-list-query';
import { useLocale } from '@/store/locale';
import { toArabicDigits } from '@/lib/utils';

interface MemberLookupRow {
  id: number;
  name: string;
  memberCode: string;
  cardNumber: string | null;
}

interface MemberEntryRow {
  id: number;
  memberName: string;
  memberCode: string;
  attendanceDate: string;
  checkInTime: string;
  checkOutTime: string | null;
  status: 'checked_in' | 'checked_out';
  duration: number | null;
}

function displayTime(value: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * The API permanently scopes this screen to today. This page deliberately has
 * no date filter, while its table search covers the member name and code.
 */
export function ClubMemberEntryPage() {
  const ct = useClubT();
  const { t } = useLocale();
  const qc = useQueryClient();
  const { params, setParams } = useListQuery({ pageSize: 20 });
  const [code, setCode] = useState('');
  const [checkingIn, setCheckingIn] = useState(false);
  const [checkingOutId, setCheckingOutId] = useState<number | null>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  const entriesQuery = useQuery({
    queryKey: ['club-attendance', 'today', params],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<MemberEntryRow>>('/club-attendance/today', {
        params: listQueryToApiParams(params),
      });
      return data;
    },
  });

  const refreshEntries = () => void qc.invalidateQueries({ queryKey: ['club-attendance', 'today'] });

  const checkIn = async () => {
    const value = code.trim();
    if (!value) {
      toast.error(ct('members.enterCode'));
      return;
    }

    setCheckingIn(true);
    try {
      const { data: result } = await api.get<PaginatedResponse<MemberLookupRow>>('/club-members', {
        params: { search: value, pageSize: 10 },
      });
      const member = result.data.find((row) => row.memberCode === value || row.cardNumber === value);
      if (!member) {
        toast.error(ct('members.noMemberFound'));
        return;
      }

      await api.post('/club-attendance/my/check-in', { memberId: member.id });
      toast.success(ct('members.checkInNamed', { name: member.name }));
      setCode('');
      codeRef.current?.focus();
      refreshEntries();
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setCheckingIn(false);
    }
  };

  const checkOut = async (attendanceId: number) => {
    setCheckingOutId(attendanceId);
    try {
      await api.post('/club-attendance/today/check-out', { attendanceId });
      toast.success(ct('members.checkedOut'));
      refreshEntries();
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setCheckingOutId(null);
    }
  };

  const columns = useMemo<ColumnDef<MemberEntryRow>[]>(
    () => [
      { accessorKey: 'memberName', header: ct('members.name'), cell: ({ getValue }) => <span className="font-medium">{getValue() as string}</span> },
      { accessorKey: 'memberCode', header: ct('members.memberCode'), cell: ({ getValue }) => <span className="font-mono nums">{getValue() as string}</span> },
      { accessorKey: 'attendanceDate', header: ct('members.attendanceDate'), cell: ({ getValue }) => <span className="nums">{toArabicDigits(getValue() as string)}</span> },
      { accessorKey: 'checkInTime', header: ct('members.checkInTime'), cell: ({ getValue }) => <span className="nums">{displayTime(getValue() as string)}</span> },
      { accessorKey: 'checkOutTime', header: ct('members.checkOutTime'), cell: ({ getValue }) => <span className="nums">{displayTime(getValue() as string | null)}</span> },
      {
        accessorKey: 'duration',
        header: ct('members.duration'),
        cell: ({ getValue }) => {
          const value = getValue() as number | null;
          return <span className="nums">{value == null ? '—' : toArabicDigits(value)}</span>;
        },
      },
      {
        id: 'actions',
        header: t('shared.actions'),
        cell: ({ row }) => row.original.status === 'checked_in' ? (
          <Button
            size="sm"
            variant="outline"
            disabled={checkingOutId === row.original.id}
            onClick={() => void checkOut(row.original.id)}
          >
            <LogOut className="size-4" /> {ct('members.checkOut')}
          </Button>
        ) : '—',
      },
    ],
    [checkingOutId, ct, t],
  );

  return (
    <div className="space-y-6">
      <PageHeader title={ct('members.entryTitle')} description={ct('members.entryDescription')} />

      <section className="surface-card rounded-xl border bg-card p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <ScanLine className="size-5 text-primary" /> {ct('members.barcodeTitle')}
            </h2>
            <p className="text-sm text-muted-foreground">{ct('members.entryTodayOnly')}</p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Input
              ref={codeRef}
              className="sm:w-80"
              autoFocus
              value={code}
              placeholder={ct('members.barcodePlaceholder')}
              onChange={(event) => setCode(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && void checkIn()}
            />
            <Button variant="brand" disabled={checkingIn} onClick={() => void checkIn()}>
              <LogIn className="size-4" /> {ct('members.checkIn')}
            </Button>
          </div>
        </div>
      </section>

      <DataTable
        columns={columns}
        data={entriesQuery.data?.data ?? []}
        total={entriesQuery.data?.total ?? 0}
        page={params.page}
        pageSize={params.pageSize}
        onPageChange={(page) => setParams({ page })}
        onPageSizeChange={(pageSize) => setParams({ page: 1, pageSize })}
        search={params.search}
        onSearchChange={(search) => setParams({ page: 1, search })}
        isLoading={entriesQuery.isLoading}
        isError={entriesQuery.isError}
        onRetry={() => void entriesQuery.refetch()}
        emptyTitle={ct('members.entryEmpty')}
        enableExport={false}
      />
    </div>
  );
}
