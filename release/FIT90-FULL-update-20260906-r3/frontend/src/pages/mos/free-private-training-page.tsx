import type { ColumnDef } from '@tanstack/react-table';
import { Eye, Pencil } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/common/data-table';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useClubT } from '@/hooks/use-club-t';
import { api, apiError } from '@/lib/api';
import { formatNum } from '@/lib/formatters';
import { usePaginatedList } from '@/lib/api-hooks';
import { useListQuery } from '@/lib/use-list-query';
import { useLocale } from '@/store/locale';

type FreeTrainingRow = {
  id: number;
  memberCode: string;
  memberName: string;
  gender: string | null;
  paymentDate: string;
  startDate: string;
  subscriptionType: string;
  membershipStatus: 'new' | 'renew';
  salesEmployee: string;
  trainer: string;
  benefits: Record<string, number>;
  usedBenefits: Record<string, number>;
  notes: string;
};

const benefitKeys = ['iceBath', 'medicalFreeze', 'inBody', 'massage', 'freeDays', 'nutritionSessions', 'ptSessions', 'fitnessSessions', 'freeze', 'invitations'] as const;

export function MosFreePrivateTrainingPage() {
  const { t, isRtl, locale } = useLocale();
  const ct = useClubT();
  const { params, setParams } = useListQuery();
  const resource = 'club-mos/free-private-training';
  const query = usePaginatedList<FreeTrainingRow>(resource, params);
  const [editing, setEditing] = useState<FreeTrainingRow | null>(null);
  const [benefitDetails, setBenefitDetails] = useState<FreeTrainingRow | null>(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const benefitLabel = (key: string) => {
    if ((benefitKeys as readonly string[]).includes(key)) return ct(`packages.benefit_${key}`);
    return key;
  };
  const formatBenefits = (benefits: Record<string, number>) =>
    Object.entries(benefits)
      .filter(([, count]) => Number(count) > 0)
      .map(([key, count]) => isRtl
        ? `${benefitLabel(key)}: ${formatNum(count, locale)}`
        : `${formatNum(count, locale)} ${benefitLabel(key)}`)
      .join(isRtl ? '، ' : ', ');

  const columns = useMemo<ColumnDef<FreeTrainingRow, unknown>[]>(() => [
    { accessorKey: 'memberCode', header: isRtl ? 'كود العضو' : 'Member code' },
    { accessorKey: 'memberName', header: isRtl ? 'اسم العضو' : 'Member name' },
    {
      accessorKey: 'gender', header: isRtl ? 'النوع' : 'Gender',
      cell: ({ getValue }) => {
        const value = String(getValue() ?? '').toLowerCase();
        if (value === 'male' || value === 'men' || value === '1') return isRtl ? 'ذكر' : 'Male';
        if (value === 'female' || value === 'women' || value === '2') return isRtl ? 'أنثى' : 'Female';
        return '—';
      },
    },
    { accessorKey: 'paymentDate', header: isRtl ? 'تاريخ الدفع' : 'Payment date' },
    { accessorKey: 'startDate', header: isRtl ? 'تاريخ البداية' : 'Start date' },
    { accessorKey: 'subscriptionType', header: isRtl ? 'نوع الاشتراك' : 'Subscription type' },
    {
      accessorKey: 'membershipStatus', header: isRtl ? 'الحالة' : 'Status',
      cell: ({ getValue }) => {
        const value = getValue() as 'new' | 'renew';
        return (
          <span className={value === 'new'
            ? 'rounded-full bg-sky-500/15 px-2 py-1 text-xs font-medium text-sky-600 dark:text-sky-300'
            : 'rounded-full bg-emerald-500/15 px-2 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-300'}>
            {value === 'new' ? (isRtl ? 'جديد' : 'New') : (isRtl ? 'تجديد' : 'Renew')}
          </span>
        );
      },
    },
    { accessorKey: 'salesEmployee', header: isRtl ? 'موظف المبيعات' : 'Sales employee' },
    { accessorKey: 'trainer', header: isRtl ? 'المدرب' : 'Trainer' },
    {
      accessorKey: 'benefits', header: isRtl ? 'عدد الحصص والمزايا' : 'Free sessions & benefits',
      cell: ({ row }) => <span className="block min-w-56 whitespace-normal leading-6">{formatBenefits(row.original.benefits)}</span>,
    },
    { accessorKey: 'notes', header: isRtl ? 'الملاحظات' : 'Notes', cell: ({ getValue }) => String(getValue() || '—') },
    {
      id: 'actions', header: isRtl ? 'إجراء' : 'Actions',
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            title={isRtl ? 'عرض تفاصيل المزايا' : 'View benefit details'}
            aria-label={isRtl ? 'عرض تفاصيل المزايا' : 'View benefit details'}
            onClick={() => setBenefitDetails(row.original)}
          >
            <Eye className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title={isRtl ? 'تعديل الملاحظات' : 'Edit notes'}
            aria-label={isRtl ? 'تعديل الملاحظات' : 'Edit notes'}
            onClick={() => { setEditing(row.original); setNotes(row.original.notes); }}
          >
            <Pencil className="size-4" />
          </Button>
        </div>
      ),
    },
  ], [isRtl, locale, ct]);

  const saveNotes = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await api.patch(`/club-mos/free-private-training/${editing.id}/notes`, { notes });
      toast.success(isRtl ? 'تم حفظ الملاحظات' : 'Notes saved');
      setEditing(null);
      await query.refetch();
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={isRtl ? 'التدريب الشخصي المجاني' : 'Free personal training'}
        eyebrow={t('nav.sections.club')}
        description={isRtl ? 'كل الحصص والمزايا المجانية الممنوحة للعملاء مع اشتراكاتهم.' : 'Complimentary sessions and benefits granted with member subscriptions.'}
      />
      <DataTable
        columns={columns}
        data={query.data?.data ?? []}
        total={query.data?.total ?? 0}
        page={params.page}
        pageSize={params.pageSize}
        onPageChange={(page) => setParams({ page })}
        onPageSizeChange={(pageSize) => setParams({ pageSize, page: 1 })}
        search={params.search}
        onSearchChange={(search) => setParams({ search, page: 1 })}
        searchPlaceholder={isRtl ? 'بحث بكود العضو أو الاسم أو نوع الاشتراك…' : 'Search member code, name, or subscription…'}
        isLoading={query.isLoading}
        isError={query.isError}
        onRetry={() => void query.refetch()}
        enableExport
        emptyTitle={isRtl ? 'لا توجد حصص مجانية' : 'No complimentary benefits'}
      />
      <Dialog open={!!benefitDetails} onOpenChange={(open) => !open && setBenefitDetails(null)}>
        <DialogContent size="md" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>
              {isRtl ? 'تفاصيل المزايا' : 'Benefit details'} — {benefitDetails?.memberName}
            </DialogTitle>
          </DialogHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{isRtl ? 'الميزة' : 'Benefit'}</TableHead>
                <TableHead>{isRtl ? 'الممنوح' : 'Granted'}</TableHead>
                <TableHead>{isRtl ? 'المستخدم' : 'Used'}</TableHead>
                <TableHead>{isRtl ? 'المتبقي' : 'Remaining'}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {benefitDetails && benefitKeys
                .filter((key) => Number(benefitDetails.benefits[key] ?? 0) > 0)
                .map((key) => {
                  const granted = Number(benefitDetails.benefits[key] ?? 0);
                  const used = Math.min(granted, Number(benefitDetails.usedBenefits?.[key] ?? 0));
                  const remaining = Math.max(granted - used, 0);
                  return (
                    <TableRow key={key}>
                      <TableCell className="font-medium">{benefitLabel(key)}</TableCell>
                      <TableCell>{formatNum(granted, locale)}</TableCell>
                      <TableCell>{formatNum(used, locale)}</TableCell>
                      <TableCell>
                        <span className={remaining > 0 ? 'font-semibold text-emerald-600 dark:text-emerald-300' : 'font-semibold text-muted-foreground'}>
                          {formatNum(remaining, locale)}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBenefitDetails(null)}>
              {isRtl ? 'إغلاق' : 'Close'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-lg" aria-describedby={undefined}>
          <DialogHeader><DialogTitle>{isRtl ? 'تعديل الملاحظات' : 'Edit notes'} — {editing?.memberName}</DialogTitle></DialogHeader>
          <div className="grid gap-2 py-2">
            <Label>{isRtl ? 'الملاحظات' : 'Notes'}</Label>
            <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={5} autoFocus />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>{isRtl ? 'إلغاء' : 'Cancel'}</Button>
            <Button variant="brand" disabled={saving} onClick={() => void saveNotes()}>{saving ? (isRtl ? 'جارٍ الحفظ…' : 'Saving…') : (isRtl ? 'حفظ' : 'Save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
