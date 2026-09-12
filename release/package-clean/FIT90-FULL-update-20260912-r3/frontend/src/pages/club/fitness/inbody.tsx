import type { ColumnDef } from '@tanstack/react-table';
import { Eye, ExternalLink, MessageCircle, Paperclip, Plus, Printer, Trash2, Utensils } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/common/data-table';
import { PageHeader } from '@/components/common/page-header';
import { MemberSearchCombobox } from '@/components/club/member-search-combobox';
import { UploadField } from '@/components/employees/upload-fields';
import { uploadUrl } from '@/components/employees/use-uploads';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useFitnessT } from '@/hooks/use-fitness-t';
import { useOutputPermissions } from '@/hooks/use-output-permissions';
import { api, apiError } from '@/lib/api';
import { localToday } from '@/lib/formatters';
import { useMutationWithToast, usePaginatedList } from '@/lib/api-hooks';
import { confirm } from '@/lib/confirm';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import type { ClubMemberListItem } from '@/types/club';
import type { InbodyMeasurementRow, InbodyNutritionMeal, InbodyNutritionPlan } from '@/types/fitness';
import { RowActions } from './shared';

const defaultNutritionMeals = (): InbodyNutritionMeal[] => [
  { name: 'الإفطار', time: '08:00', foods: '', notes: '' },
  { name: 'وجبة خفيفة', time: '11:00', foods: '', notes: '' },
  { name: 'الغداء', time: '15:00', foods: '', notes: '' },
  { name: 'العشاء', time: '20:00', foods: '', notes: '' },
];

const emptyNutritionPlan = (): InbodyNutritionPlan => ({
  goal: '',
  dailyCalories: null,
  waterLiters: null,
  notes: '',
  meals: defaultNutritionMeals(),
  fileUrl: null,
});

function normalizeNutritionPlan(value: InbodyNutritionPlan | null | undefined): InbodyNutritionPlan {
  if (!value || typeof value !== 'object') return emptyNutritionPlan();
  return {
    goal: String(value.goal ?? ''),
    dailyCalories: value.dailyCalories != null ? Number(value.dailyCalories) : null,
    waterLiters: value.waterLiters != null ? Number(value.waterLiters) : null,
    notes: String(value.notes ?? ''),
    fileUrl: value.fileUrl ? String(value.fileUrl) : null,
    meals: Array.isArray(value.meals) && value.meals.length
      ? value.meals.map((meal) => ({
          name: String(meal.name ?? ''),
          time: String(meal.time ?? ''),
          foods: String(meal.foods ?? ''),
          notes: String(meal.notes ?? ''),
        }))
      : defaultNutritionMeals(),
    updatedAt: value.updatedAt,
  };
}

const escapeHtml = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const nutritionPrintCss = `
  .nutrition-document{font-family:Arial,Tahoma,sans-serif;color:#18181b;background:#fff;padding:24px;direction:rtl}
  .nutrition-document h1{text-align:center;margin:0 0 8px;color:#c0252b}.nutrition-document .sub{text-align:center;color:#52525b;margin-bottom:24px}
  .nutrition-document .info{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:18px}
  .nutrition-document .box{border:1px solid #d4d4d8;border-radius:8px;padding:10px}.nutrition-document .label{font-size:12px;color:#71717a}.nutrition-document .value{font-weight:700;margin-top:4px}
  .nutrition-document table{width:100%;border-collapse:collapse;margin-top:16px}.nutrition-document th,.nutrition-document td{border:1px solid #a1a1aa;padding:10px;text-align:right;vertical-align:top}.nutrition-document th{background:#f4f4f5}
  .nutrition-document .notes{margin-top:18px;border:1px solid #d4d4d8;border-radius:8px;padding:12px;min-height:70px;white-space:pre-wrap}
  .nutrition-document .signatures{display:flex;justify-content:space-between;margin-top:50px}.nutrition-document .signature{width:220px;border-top:1px solid #71717a;padding-top:8px;text-align:center}
  @media print{body{margin:0}.nutrition-document{padding:0}@page{size:A4;margin:12mm}}
`;

function nutritionPlanContent(row: InbodyMeasurementRow, plan: InbodyNutritionPlan) {
  const meals = plan.meals.map((meal) => `
    <tr>
      <td>${escapeHtml(meal.name)}</td>
      <td dir="ltr">${escapeHtml(meal.time)}</td>
      <td>${escapeHtml(meal.foods).replace(/\n/g, '<br>')}</td>
      <td>${escapeHtml(meal.notes).replace(/\n/g, '<br>')}</td>
    </tr>`).join('');
  return `
    <h1>جدول التغذية</h1><div class="sub">FIT90</div>
    <div class="info">
      <div class="box"><div class="label">اسم العضو</div><div class="value">${escapeHtml(row.memberName)}</div></div>
      <div class="box"><div class="label">كود العضو</div><div class="value">${escapeHtml(row.memberCode ?? row.memberId)}</div></div>
      <div class="box"><div class="label">تاريخ القياس</div><div class="value">${escapeHtml(row.measurementDate)}</div></div>
      <div class="box"><div class="label">الهدف</div><div class="value">${escapeHtml(plan.goal || '—')}</div></div>
      <div class="box"><div class="label">السعرات اليومية</div><div class="value">${escapeHtml(plan.dailyCalories ?? '—')}</div></div>
      <div class="box"><div class="label">المياه يوميًا</div><div class="value">${escapeHtml(plan.waterLiters ?? '—')} ${plan.waterLiters != null ? 'لتر' : ''}</div></div>
    </div>
    <table><thead><tr><th>الوجبة</th><th>الوقت</th><th>الأطعمة والكميات</th><th>ملاحظات</th></tr></thead><tbody>${meals || '<tr><td colspan="4">لا توجد وجبات</td></tr>'}</tbody></table>
    <div class="notes"><strong>ملاحظات عامة:</strong><br>${escapeHtml(plan.notes || '—').replace(/\n/g, '<br>')}</div>
    <div class="signatures"><div class="signature">توقيع أخصائي التغذية</div><div class="signature">توقيع العضو</div></div>`;
}

function printNutritionPlan(row: InbodyMeasurementRow, plan: InbodyNutritionPlan) {
  const printWindow = window.open('', '_blank', 'width=1000,height=800');
  if (!printWindow) {
    toast.error('تعذر فتح نافذة الطباعة. اسمحي بالنوافذ المنبثقة ثم حاولي مرة أخرى.');
    return;
  }
  printWindow.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
    <title>جدول تغذية - ${escapeHtml(row.memberName)}</title>
    <style>${nutritionPrintCss}</style></head><body>
    <div class="nutrition-document">${nutritionPlanContent(row, plan)}</div>
    <script>window.onload=()=>{window.print();}</script></body></html>`);
  printWindow.document.close();
}

type NutritionWhatsappFileSource = 'form-text' | 'attachment';

function nutritionPlanMessage(row: InbodyMeasurementRow, plan: InbodyNutritionPlan) {
  const meals = plan.meals.map((meal, index) => [
    `*${index + 1}. ${meal.name || 'وجبة'}${meal.time ? ` - ${meal.time}` : ''}*`,
    `الأطعمة والكميات: ${meal.foods || '—'}`,
    `ملاحظات: ${meal.notes || '—'}`,
  ].join('\n')).join('\n\n');
  return [
    '*جدول التغذية - FIT90*',
    `العضو: ${row.memberName}`,
    `كود العضو: ${row.memberCode ?? row.memberId}`,
    `تاريخ القياس: ${row.measurementDate}`,
    plan.goal ? `الهدف: ${plan.goal}` : '',
    plan.dailyCalories != null ? `السعرات اليومية: ${plan.dailyCalories}` : '',
    plan.waterLiters != null ? `المياه يوميًا: ${plan.waterLiters} لتر` : '',
    '',
    meals,
    '',
    `*ملاحظات عامة:* ${plan.notes || '—'}`,
  ].filter((line) => line !== '').join('\n');
}

function whatsappPhone(phone: string | null | undefined) {
  let digits = String(phone ?? '').replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('0')) digits = `20${digits.slice(1)}`;
  return digits.length >= 8 ? digits : '';
}

async function sendNutritionPlanToWhatsapp(
  row: InbodyMeasurementRow,
  plan: InbodyNutritionPlan,
  whatsappWindow: Window,
  messageOverride?: string,
) {
  let memberPhone = row.memberPhone;
  if (!memberPhone) {
    try {
      const { data: member } = await api.get<ClubMemberListItem>(`/club-members/${row.memberId}`);
      memberPhone = member.phone;
    } catch {
      // The validation message below also covers an unavailable member record.
    }
  }

  const phone = whatsappPhone(memberPhone);
  if (!phone) {
    whatsappWindow.close();
    toast.error('لا يوجد رقم هاتف صحيح مسجل لهذا العضو.');
    return;
  }
  const message = messageOverride ?? nutritionPlanMessage(row, plan);
  const url = `https://web.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(message)}`;
  whatsappWindow.opener = null;
  whatsappWindow.location.href = url;

  toast.success('تم فتح محادثة العضو وتجهيز الرسالة للإرسال.');
}

export function FitnessInbodyPage() {
  const ft = useFitnessT();
  const { canPrint } = useOutputPermissions();
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, refetch } = usePaginatedList<InbodyMeasurementRow>(
    'club-inbody-measurements',
    params,
  );
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectedMember, setSelectedMember] = useState<ClubMemberListItem | null>(null);
  const [detailsRow, setDetailsRow] = useState<InbodyMeasurementRow | null>(null);
  const [nutritionRow, setNutritionRow] = useState<InbodyMeasurementRow | null>(null);
  const [nutritionPlan, setNutritionPlan] = useState<InbodyNutritionPlan>(emptyNutritionPlan());
  const [nutritionSaving, setNutritionSaving] = useState(false);
  const [nutritionSending, setNutritionSending] = useState<NutritionWhatsappFileSource | null>(null);
  const [form, setForm] = useState({
    memberId: '',
    measurementDate: localToday(),
    weight: '',
    bodyFat: '',
    muscleMass: '',
    bmi: '',
    notes: '',
    staffName: '',
    fileUrl: '',
  });

  const deleteMutation = useMutationWithToast(
    (id: number) => api.delete(`/club-inbody-measurements/${id}`),
    { success: ft('common.success'), invalidate: ['club-inbody-measurements'] },
  );

  const openCreate = () => {
    setEditId(null);
    setSelectedMember(null);
    setForm({
      memberId: '',
      measurementDate: localToday(),
      weight: '',
      bodyFat: '',
      muscleMass: '',
      bmi: '',
      notes: '',
      staffName: '',
      fileUrl: '',
    });
    setOpen(true);
  };

  const openEdit = (row: InbodyMeasurementRow) => {
    setEditId(row.id);
    setSelectedMember(null);
    if (row.memberId) {
      void api.get<ClubMemberListItem>(`/club-members/${row.memberId}`).then(({ data }) => {
        setSelectedMember(data);
      }).catch(() => {
        setSelectedMember({
          id: row.memberId,
          name: `#${row.memberId}`,
          memberCode: String(row.memberId),
          phone: null,
          gender: 'male',
          branchId: 0,
          isActive: true,
          profilePicture: null,
        } as ClubMemberListItem);
      });
    }
    setForm({
      memberId: String(row.memberId),
      measurementDate: row.measurementDate,
      weight: row.weight != null ? String(row.weight) : '',
      bodyFat: row.bodyFat != null ? String(row.bodyFat) : '',
      muscleMass: row.muscleMass != null ? String(row.muscleMass) : '',
      bmi: row.bmi != null ? String(row.bmi) : '',
      notes: row.notes ?? '',
      staffName: row.staffName ?? '',
      fileUrl: row.fileUrl ?? '',
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.memberId || !form.measurementDate) {
      toast.error(ft('sched.pickMember'));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        memberId: Number(form.memberId),
        measurementDate: form.measurementDate,
        weight: form.weight ? Number(form.weight) : undefined,
        bodyFat: form.bodyFat ? Number(form.bodyFat) : undefined,
        muscleMass: form.muscleMass ? Number(form.muscleMass) : undefined,
        bmi: form.bmi ? Number(form.bmi) : undefined,
        notes: form.notes || undefined,
        staffName: form.staffName || undefined,
        fileUrl: form.fileUrl || undefined,
      };
      if (editId) await api.put(`/club-inbody-measurements/${editId}`, payload);
      else await api.post('/club-inbody-measurements', payload);
      toast.success(ft('common.success'));
      setOpen(false);
      setSelectedMember(null);
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const openNutritionPlan = (row: InbodyMeasurementRow) => {
    setNutritionRow(row);
    setNutritionPlan(normalizeNutritionPlan(row.nutritionPlan));
  };

  const saveNutritionPlan = async () => {
    if (!nutritionRow) return;
    setNutritionSaving(true);
    try {
      const { data: updated } = await api.put<InbodyMeasurementRow>(
        `/club-inbody-measurements/${nutritionRow.id}/nutrition-plan`,
        nutritionPlan,
      );
      setNutritionRow(updated);
      setNutritionPlan(normalizeNutritionPlan(updated.nutritionPlan));
      toast.success('تم حفظ جدول التغذية');
      void refetch();
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setNutritionSaving(false);
    }
  };

  const sendNutritionPlan = async (source: NutritionWhatsappFileSource) => {
    if (!nutritionRow || nutritionSending) return;
    if (source === 'attachment' && !nutritionPlan.fileUrl) {
      toast.error('ارفعي ملف التغذية أولًا ثم اضغطي إرسال المرفق.');
      return;
    }
    // Open WhatsApp synchronously for both actions so the browser does not
    // block the popup while the current plan is being saved.
    const whatsappWindow = window.open('about:blank', 'fit90-whatsapp');
    if (!whatsappWindow) {
      toast.error('تعذر فتح واتساب. اسمحي بالنوافذ المنبثقة ثم حاولي مرة أخرى.');
      return;
    }
    setNutritionSending(source);
    try {
      // Persist the current form (including an uploaded file) before sharing so
      // the same document is also available later and through the mobile API.
      let updated: InbodyMeasurementRow;
      try {
        const response = await api.put<InbodyMeasurementRow>(
          `/club-inbody-measurements/${nutritionRow.id}/nutrition-plan`,
          nutritionPlan,
        );
        updated = response.data;
      } catch (error) {
        whatsappWindow?.close();
        throw error;
      }
      const savedPlan = normalizeNutritionPlan(updated.nutritionPlan);
      setNutritionRow(updated);
      setNutritionPlan(savedPlan);
      if (source === 'attachment') {
        const storedFileUrl = uploadUrl(savedPlan.fileUrl);
        if (!storedFileUrl) {
          whatsappWindow.close();
          throw new Error('تعذر الوصول إلى ملف التغذية المرفوع.');
        }
        const absoluteFileUrl = new URL(storedFileUrl, window.location.origin).href;
        const attachmentMessage = [
          '*مرفق جدول التغذية - FIT90*',
          `العضو: ${updated.memberName}`,
          `كود العضو: ${updated.memberCode ?? updated.memberId}`,
          absoluteFileUrl,
        ].join('\n');
        await sendNutritionPlanToWhatsapp(updated, savedPlan, whatsappWindow, attachmentMessage);
      } else {
        await sendNutritionPlanToWhatsapp(updated, savedPlan, whatsappWindow);
      }
      void refetch();
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      toast.error(apiError(error, 'تعذر تجهيز ملف التغذية للإرسال.'));
    } finally {
      setNutritionSending(null);
    }
  };

  const updateMeal = (index: number, patch: Partial<InbodyNutritionMeal>) => {
    setNutritionPlan((current) => ({
      ...current,
      meals: current.meals.map((meal, mealIndex) => mealIndex === index ? { ...meal, ...patch } : meal),
    }));
  };

  const columns = useMemo<ColumnDef<InbodyMeasurementRow>[]>(
    () => [
      {
        accessorKey: 'memberName',
        header: ft('common.member'),
        cell: ({ row }) => (
          <div>
            <p className="font-semibold">{row.original.memberName}</p>
            <p className="text-xs text-muted-foreground nums">
              {row.original.memberCode ?? toArabicDigits(row.original.memberId)}
            </p>
          </div>
        ),
      },
      {
        accessorKey: 'measurementDate',
        header: ft('common.date'),
        cell: ({ getValue }) => <span className="nums">{toArabicDigits(getValue() as string)}</span>,
      },
      {
        accessorKey: 'weight',
        header: ft('progress.weight'),
        cell: ({ getValue }) => {
          const v = getValue() as number | null;
          return v != null ? <span className="nums">{toArabicDigits(v)}</span> : '—';
        },
      },
      {
        accessorKey: 'bmi',
        header: ft('inbody.bmi'),
        cell: ({ getValue }) => {
          const v = getValue() as number | null;
          return v != null ? <span className="nums">{toArabicDigits(v)}</span> : '—';
        },
      },
      {
        accessorKey: 'staffName',
        header: ft('inbody.staff'),
        cell: ({ getValue }) => (getValue() as string | null) || '—',
      },
      {
        accessorKey: 'fileUrl',
        header: ft('inbody.file'),
        cell: ({ getValue }) => {
          const url = uploadUrl(getValue() as string | null);
          return url ? (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              {ft('inbody.file')} <ExternalLink className="size-3.5" />
            </a>
          ) : (
            '—'
          );
        },
      },
      {
        id: 'actions',
        header: ft('common.actions'),
        cell: ({ row }) => (
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setDetailsRow(row.original)}>
              <Eye className="size-4" /> تفاصيل
            </Button>
            <Button size="sm" variant="outline" onClick={() => openNutritionPlan(row.original)}>
              <Utensils className="size-4" /> جدول تغذية
            </Button>
            <RowActions
              editLabel={ft('common.edit')}
              deleteLabel={ft('common.delete')}
              onEdit={() => openEdit(row.original)}
              onDelete={() =>
                void confirm({ title: ft('common.confirmDelete'), variant: 'destructive' }).then((ok) => {
                  if (ok) deleteMutation.mutate(row.original.id);
                })
              }
            />
          </div>
        ),
      },
    ],
    [ft],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={ft('inbody.title')}
        actions={
          <Button variant="brand" onClick={openCreate}>
            <Plus className="size-4" /> {ft('common.add')}
          </Button>
        }
      />
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
        emptyTitle={ft('common.noData')}
      />
      <Dialog open={detailsRow != null} onOpenChange={(value) => { if (!value) setDetailsRow(null); }}>
        <DialogContent size="lg" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>تفاصيل قياس InBody</DialogTitle>
          </DialogHeader>
          {detailsRow && (
            <div className="space-y-4">
              <div className="rounded-xl border bg-muted/20 p-4">
                <p className="text-lg font-bold">{detailsRow.memberName}</p>
                <p className="text-sm text-muted-foreground">كود العضو: <span className="nums">{detailsRow.memberCode ?? detailsRow.memberId}</span></p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {[
                  ['تاريخ القياس', detailsRow.measurementDate],
                  ['الوزن', detailsRow.weight != null ? `${detailsRow.weight} كجم` : '—'],
                  ['مؤشر كتلة الجسم', detailsRow.bmi ?? '—'],
                  ['نسبة الدهون', detailsRow.bodyFat != null ? `${detailsRow.bodyFat}%` : '—'],
                  ['الكتلة العضلية', detailsRow.muscleMass != null ? `${detailsRow.muscleMass} كجم` : '—'],
                  ['الموظف', detailsRow.staffName ?? '—'],
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-lg border bg-background p-3">
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="mt-1 font-semibold nums">{value}</p>
                  </div>
                ))}
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">ملاحظات القياس</p>
                <p className="mt-1 whitespace-pre-wrap">{detailsRow.notes || '—'}</p>
              </div>
              {uploadUrl(detailsRow.fileUrl) && (
                <a href={uploadUrl(detailsRow.fileUrl) ?? undefined} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-primary hover:underline">
                  <ExternalLink className="size-4" /> فتح ملف القياس
                </a>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailsRow(null)}>إغلاق</Button>
            {detailsRow && <Button onClick={() => { openNutritionPlan(detailsRow); setDetailsRow(null); }}><Utensils className="size-4" /> جدول التغذية</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={nutritionRow != null} onOpenChange={(value) => { if (!value) setNutritionRow(null); }}>
        <DialogContent size="form" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>جدول التغذية</DialogTitle>
            {nutritionRow && (
              <p className="text-sm text-muted-foreground">
                {nutritionRow.memberName} · كود {nutritionRow.memberCode ?? nutritionRow.memberId} · قياس {nutritionRow.measurementDate}
              </p>
            )}
          </DialogHeader>
          <div className="space-y-5">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="grid gap-2">
                <Label>الهدف الغذائي</Label>
                <Input value={nutritionPlan.goal} onChange={(event) => setNutritionPlan((current) => ({ ...current, goal: event.target.value }))} placeholder="مثال: خسارة وزن أو زيادة كتلة عضلية" />
              </div>
              <div className="grid gap-2">
                <Label>السعرات اليومية</Label>
                <Input type="number" min="0" className="nums" value={nutritionPlan.dailyCalories ?? ''} onChange={(event) => setNutritionPlan((current) => ({ ...current, dailyCalories: event.target.value ? Number(event.target.value) : null }))} placeholder="2000" />
              </div>
              <div className="grid gap-2">
                <Label>المياه يوميًا (لتر)</Label>
                <Input type="number" min="0" step="0.1" className="nums" value={nutritionPlan.waterLiters ?? ''} onChange={(event) => setNutritionPlan((current) => ({ ...current, waterLiters: event.target.value ? Number(event.target.value) : null }))} placeholder="3" />
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold">الوجبات اليومية</h3>
                  <p className="text-sm text-muted-foreground">أضيفي الطعام والكميات المناسبة لكل وجبة.</p>
                </div>
                <Button type="button" size="sm" variant="outline" onClick={() => setNutritionPlan((current) => ({ ...current, meals: [...current.meals, { name: '', time: '', foods: '', notes: '' }] }))}>
                  <Plus className="size-4" /> إضافة وجبة
                </Button>
              </div>
              <div className="overflow-x-auto rounded-xl border">
                <div className="min-w-[850px]">
                  <div className="grid grid-cols-[1fr_120px_2fr_1.5fr_48px] gap-2 bg-muted/60 p-3 text-sm font-semibold">
                    <span>الوجبة</span><span>الوقت</span><span>الأطعمة والكميات</span><span>ملاحظات</span><span />
                  </div>
                  {nutritionPlan.meals.map((meal, index) => (
                    <div key={index} className="grid grid-cols-[1fr_120px_2fr_1.5fr_48px] items-start gap-2 border-t p-3">
                      <Input value={meal.name} onChange={(event) => updateMeal(index, { name: event.target.value })} placeholder="اسم الوجبة" />
                      <Input type="time" className="nums" value={meal.time} onChange={(event) => updateMeal(index, { time: event.target.value })} />
                      <Textarea rows={2} className="min-h-20" value={meal.foods} onChange={(event) => updateMeal(index, { foods: event.target.value })} placeholder="مثال: 2 بيضة + رغيف خبز..." />
                      <Textarea rows={2} className="min-h-20" value={meal.notes} onChange={(event) => updateMeal(index, { notes: event.target.value })} placeholder="بدائل أو تعليمات" />
                      <Button type="button" size="icon" variant="ghost" className="text-destructive hover:text-destructive" title="حذف الوجبة" onClick={() => setNutritionPlan((current) => ({ ...current, meals: current.meals.filter((_, mealIndex) => mealIndex !== index) }))}>
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>ملاحظات عامة</Label>
              <Textarea rows={3} value={nutritionPlan.notes} onChange={(event) => setNutritionPlan((current) => ({ ...current, notes: event.target.value }))} placeholder="تعليمات عامة، المسموح والممنوع..." />
            </div>
            <div className="grid gap-2 rounded-xl border p-4">
              <div>
                <Label>ملف جدول التغذية</Label>
                <p className="mt-1 text-sm text-muted-foreground">
                  ارفعي ملف PDF أو Word أو صورة. زر «إرسال المرفق» يفتح واتساب ويجهّز رابط الملف، وزر «إرسال واتساب» يجهّز بيانات الفورم كاملة كنص.
                </p>
              </div>
              <UploadField
                category="nutrition"
                value={nutritionPlan.fileUrl}
                onChange={(fileUrl) => setNutritionPlan((current) => ({ ...current, fileUrl }))}
                accept=".pdf,.doc,.docx,image/jpeg,image/png,image/webp"
                preview={false}
                label="اسحبي ملف التغذية هنا أو انقري للاختيار"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNutritionRow(null)}>إلغاء</Button>
            {nutritionRow && canPrint && <Button variant="outline" onClick={() => printNutritionPlan(nutritionRow, nutritionPlan)}><Printer className="size-4" /> طباعة</Button>}
            {nutritionRow && <Button variant="outline" disabled={nutritionSending != null} className="border-emerald-600 text-emerald-600 hover:bg-emerald-600/10 hover:text-emerald-500" onClick={() => void sendNutritionPlan('form-text')}><MessageCircle className="size-4" /> {nutritionSending === 'form-text' ? 'جارٍ تجهيز الرسالة...' : 'إرسال واتساب'}</Button>}
            {nutritionRow && <Button variant="outline" disabled={nutritionSending != null || !nutritionPlan.fileUrl} onClick={() => void sendNutritionPlan('attachment')}><Paperclip className="size-4" /> {nutritionSending === 'attachment' ? 'جارٍ فتح واتساب...' : 'إرسال المرفق'}</Button>}
            <Button variant="brand" disabled={nutritionSaving} onClick={() => void saveNutritionPlan()}>{nutritionSaving ? 'جارٍ الحفظ...' : 'حفظ جدول التغذية'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{editId ? ft('common.edit') : ft('common.add')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-2">
              <Label>{ft('common.member')}</Label>
              <MemberSearchCombobox
                selectedMember={selectedMember}
                onSelect={(member) => {
                  setSelectedMember(member);
                  setForm((f) => ({ ...f, memberId: String(member.id) }));
                }}
                onClear={() => {
                  setSelectedMember(null);
                  setForm((f) => ({ ...f, memberId: '' }));
                }}
                disabled={saving}
              />
            </div>
            <div className="grid gap-2">
              <Label>{ft('common.date')}</Label>
              <Input type="date" className="nums" value={form.measurementDate} onChange={(e) => setForm((f) => ({ ...f, measurementDate: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>{ft('progress.weight')}</Label>
                <Input className="nums" value={form.weight} onChange={(e) => setForm((f) => ({ ...f, weight: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>{ft('inbody.bmi')}</Label>
                <Input className="nums" value={form.bmi} onChange={(e) => setForm((f) => ({ ...f, bmi: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>{ft('progress.bodyFat')}</Label>
                <Input className="nums" value={form.bodyFat} onChange={(e) => setForm((f) => ({ ...f, bodyFat: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>{ft('inbody.muscleMass')}</Label>
                <Input className="nums" value={form.muscleMass} onChange={(e) => setForm((f) => ({ ...f, muscleMass: e.target.value }))} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>{ft('common.notes')}</Label>
              <Input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
            <div className="grid gap-2">
              <Label>{ft('inbody.staff')}</Label>
              <Input value={form.staffName} onChange={(e) => setForm((f) => ({ ...f, staffName: e.target.value }))} />
            </div>
            <div className="grid gap-2">
              <Label>{ft('inbody.file')}</Label>
              <UploadField
                category="document"
                value={form.fileUrl}
                onChange={(p) => setForm((f) => ({ ...f, fileUrl: p ?? '' }))}
                label={ft('inbody.file')}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{ft('common.cancel')}</Button>
            <Button variant="brand" onClick={() => void save()} disabled={saving}>{ft('common.save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
