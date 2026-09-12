import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Check, Loader2, Save, User } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { type FieldErrors, useForm } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/common/page-header';
import {
  DualDateField,
  FieldWrapper,
  RHFSelect,
  RHFRadio,
  RHFTextarea,
} from '@/components/common/form-fields';
import { FinanceRowsEditor, type FinanceRow } from '@/components/common/finance-rows';
import { DwamScheduleGrid, defaultDwamSchedule, type DwamDay } from '@/components/common/dwam-schedule-grid';
import {
  BankAccountForm,
  EmployeeDocumentsEditor,
  type EmployeeDocumentRow,
  useBankState,
} from '@/components/employees/employee-documents-editor';
import { UploadField } from '@/components/employees/upload-fields';
import { useFileUpload } from '@/components/employees/use-uploads';
import { NotImplementedState } from '@/components/common/states';
import { api, apiError } from '@/lib/api';
import { useLookups, useResource, isNotImplemented } from '@/lib/api-hooks';
import { useBranches } from '@/hooks/use-branches';
import { useEmployeeOptions } from '@/hooks/use-employee-options';
import type { DwamData, FinanceData, EmployeeBankRow, EmployeeDocumentFile } from '@/types/employees';
import type { JobTitle } from '@/types/org';
import { useLocale } from '@/store/locale';
import { uiStatic } from '@/lib/ui-static';
import { cn } from '@/lib/utils';

const STEPS = [
  { id: 'personal', title: uiStatic('البيانات الشخصية') },
  { id: 'work', title: uiStatic('بيانات العمل') },
  { id: 'finance', title: uiStatic('المالية والبنوك') },
  { id: 'insurance', title: uiStatic('التأمينات') },
  { id: 'documents', title: uiStatic('المستندات') },
  { id: 'review', title: uiStatic('المراجعة') },
] as const;

const requiredString = (message: string) =>
  z.string({ required_error: uiStatic(message), invalid_type_error: uiStatic(message) }).trim().min(1, uiStatic(message));

const schema = z.object({
  emp_code: requiredString('كود الموظف مطلوب'),
  emp_name: requiredString('اسم الموظف مطلوب'),
  direct_manager_fk: z.string().optional(),
  branch_id_fk: requiredString('الفرع مطلوب'),
  emp_type: requiredString('النوع مطلوب'),
  job_title_id_fk: requiredString('المسمى الوظيفي مطلوب'),
  employee_target: z.string().optional(),
  employee_commission: z.string().optional(),
  employment_type: z.string().optional(),
  addToSystem: z.boolean().optional(),
  systemUsername: z.string().optional(),
  systemPassword: z.string().optional(),
  birth_date: z.string().optional(),
  age: z.string().optional(),
  gender: z.string().optional(),
  nationality_fk: z.string().optional(),
  deyana_fk: z.string().optional(),
  jwal: requiredString('رقم الجوال مطلوب'),
  card_num: z.string().optional(),
  card_esdar_date: z.string().optional(),
  card_enhaa_date: z.string().optional(),
  address: z.string().optional(),
  emp_sign: z.string().optional(),
  personal_photo: z.string().optional(),
  emp_code_gym: z.string().optional(),
  birth_img: z.string().optional(),
  qualification_img: z.string().optional(),
  phesh_genai: z.string().optional(),
  shahadt_jaish: z.string().optional(),
  military_service: z.string().optional(),
  e3fa_reason: z.string().optional(),
  employee_qualification: z.string().optional(),
  previous_experience: z.string().optional(),
  skills: z.string().optional(),
  languages: z.string().optional(),
  national_status_fk: z.string().optional(),
  birthdate: z.string().optional(),
  other_jwal: z.string().optional(),
  tahwela_rkm: z.string().optional(),
  type_card: z.string().optional(),
  gehat_esdar: z.string().optional(),
  esdar_date: z.string().optional(),
  end_date: z.string().optional(),
  city: z.string().optional(),
  hai_id_fk: z.string().optional(),
  street_name: z.string().optional(),
  national_address: z.string().optional(),
  adress_other: z.string().optional(),
  email: z.string().optional(),
  snap_chat: z.string().optional(),
  twiter: z.string().optional(),
  mosma_wazefy_n: z.string().optional(),
  contract: z.string().optional(),
  start_work_date_m: z.string().optional(),
  test_num_month: z.string().optional(),
  end_contract_date_m: z.string().optional(),
  end_test_date_m: z.string().optional(),
  employee_type: z.string().optional(),
  shift_type: z.string().optional(),
  basic_salary: z.string().optional(),
  type_tamin: z.string().optional(),
  tamin_rkm: z.string().optional(),
  tamin_mosama_wazefy: z.string().optional(),
  start_tamin_date_m: z.string().optional(),
  tamin_date_m: z.string().optional(),
  tamin_rateb: z.string().optional(),
  tamin_hesa_emp: z.string().optional(),
  tamin_hesa_oner: z.string().optional(),
  type_tamin__medicine: z.string().optional(),
  tamin_company: z.string().optional(),
  tamin_medicine_num: z.string().optional(),
  polica_num: z.string().optional(),
  tamin_type: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.addToSystem) {
    if (!data.systemUsername?.trim()) {
      ctx.addIssue({ code: 'custom', message: uiStatic('اسم المستخدم مطلوب'), path: ['systemUsername'] });
    }
  }
});

type FormValues = z.infer<typeof schema>;

const STEP_FIELD_KEYS: Record<(typeof STEPS)[number]['id'], (keyof FormValues)[]> = {
  personal: ['emp_code', 'emp_name', 'branch_id_fk', 'emp_type', 'job_title_id_fk', 'jwal'],
  work: ['systemUsername', 'systemPassword'],
  finance: [],
  insurance: [],
  documents: [],
  review: [],
};

function stepIndexForField(field: keyof FormValues): number {
  const idx = STEPS.findIndex((s) => STEP_FIELD_KEYS[s.id].includes(field));
  return idx >= 0 ? idx : 0;
}

function firstValidationError(errors: FieldErrors<FormValues>): string | undefined {
  for (const key of Object.keys(errors) as (keyof FormValues)[]) {
    const message = errors[key]?.message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return undefined;
}

const REQUIRED_FIELD_LABELS: Partial<Record<keyof FormValues, string>> = {
  emp_code: 'كود الموظف',
  emp_name: 'اسم الموظف',
  branch_id_fk: 'الفرع',
  emp_type: 'النوع',
  job_title_id_fk: 'المسمى الوظيفي',
  employee_target: 'التارجت',
  employee_commission: 'العمولة',
  jwal: 'رقم الجوال',
  systemUsername: 'اسم المستخدم',
  systemPassword: 'كلمة المرور',
};

function validationErrorMessage(errors: FieldErrors<FormValues>): string {
  const labels = (Object.keys(errors) as (keyof FormValues)[])
    .map((key) => REQUIRED_FIELD_LABELS[key])
    .filter((label): label is string => !!label);
  return labels.length
    ? uiStatic(`يرجى استكمال: ${labels.join('، ')}`)
    : firstValidationError(errors) ?? uiStatic('يرجى إكمال الحقول المطلوبة');
}


const MILITARY = [{ value: '1', label: uiStatic('أدى') }, { value: '2', label: uiStatic('لم يؤدِ') }, { value: '3', label: uiStatic('إعفاء') }];

function normalizeArabicJobTitle(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[ًٌٍَُِّْـ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ');
}

function jobTitleHasTarget(value?: string | null): boolean {
  if (!value) return false;
  const title = normalizeArabicJobTitle(value);
  return (
    title.includes('مدرب') ||
    title.includes('اخصائي تغذيه') ||
    title.includes('اخصائي مبيعات') ||
    title.includes('اخصائي سبا')
  );
}

/**
 * API form values can include numbers (IDs, amounts and flags), while the
 * controlled inputs and select components require strings.  Normalising the
 * full record here keeps every saved value usable when an edit form opens.
 */
function editFormValues(existing: FormValues): FormValues {
  const normalized = Object.fromEntries(
    Object.entries(existing).map(([key, value]) => [
      key,
      key === 'addToSystem' ? value === true || value === 'true' : value == null ? '' : String(value),
    ]),
  );
  return normalized as FormValues;
}

function FormSection({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('rounded-xl border border-border/60 bg-muted/20 p-5', className)}>
      <div className="mb-4 border-b border-border/50 pb-3">
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{children}</div>
    </section>
  );
}

export function EmployeeFormPage() {
  const { ui } = useLocale();
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [financeRows, setFinanceRows] = useState<FinanceRow[]>([]);
  const [dwamSchedule, setDwamSchedule] = useState<DwamDay[]>(defaultDwamSchedule());
  const [documents, setDocuments] = useState<EmployeeDocumentRow[]>([]);
  const [bank, setBank] = useBankState();
  const { upload } = useFileUpload();

  const { data: existing, isError, error } = useResource<FormValues>('employees', id);
  const { data: financeData } = useResource<FinanceData>('employees', id, 'finance');
  const { data: dwamData } = useResource<DwamData>('employees', id, 'dwam');
  const { data: banksData } = useResource<EmployeeBankRow[]>('employees', id, 'banks');
  const { data: docsData } = useResource<EmployeeDocumentFile[]>('employees', id, 'documents');
  const { data: allowanceTypes } = useLookups('allowance');
  const { data: deductionTypes } = useLookups('deduction');
  const { data: banks } = useLookups('banks');
  const { data: nationalities } = useLookups('nationality');
  const { data: religions } = useLookups('religion');
  const { data: socialStatuses } = useLookups('social_status');
  const { data: employeeOptions = [] } = useEmployeeOptions();
  const managerOptions = useMemo(
    () =>
      employeeOptions.map((o) => ({
        value: o.label.match(/\((\d+)\)/)?.[1] ?? o.value,
        label: o.label,
      })),
    [employeeOptions],
  );

  const { data: jobTitles } = useQuery({
    queryKey: ['departments', 'job-titles'],
    queryFn: async () => {
      const { data } = await api.get<JobTitle[]>('/departments/job-titles');
      return data;
    },
    retry: false,
  });

  const { data: branches } = useBranches();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    shouldUnregister: false,
    defaultValues: {
      emp_type: '1',
      employment_type: '',
      military_service: '1',
      birth_img: 'no',
      qualification_img: 'no',
      phesh_genai: 'no',
      shahadt_jaish: 'no',
      employee_type: '1',
      shift_type: 'fixed',
      addToSystem: false,
      personal_photo: '',
    },
  });

  const { register, control, handleSubmit, watch, setValue, trigger, formState: { errors, isSubmitting } } = form;
  const addToSystem = watch('addToSystem');
  const selectedJobTitleId = watch('job_title_id_fk');
  const branchOptions = useMemo(
    () => branches?.map((branch) => ({ value: String(branch.id), label: branch.name ?? '—' })) ?? [],
    [branches],
  );
  const jobTitleOptions = useMemo(
    () => (jobTitles ?? []).map((job) => ({ value: String(job.id), label: job.name ?? '—' })),
    [jobTitles],
  );

  useEffect(() => {
    if (existing) {
      form.reset(editFormValues(existing));
    }
  }, [existing, form]);

  // The employee record and the two option lists are fetched independently.
  // Set the selected IDs again when their lists arrive, so Radix Select and
  // Combobox can resolve and render the saved branch and job-title labels.
  useEffect(() => {
    if (!isEdit || !existing) return;
    const values = editFormValues(existing);
    if (branchOptions.some((option) => option.value === values.branch_id_fk)) {
      setValue('branch_id_fk', values.branch_id_fk, { shouldValidate: false });
    }
    if (jobTitleOptions.some((option) => option.value === values.job_title_id_fk)) {
      setValue('job_title_id_fk', values.job_title_id_fk, { shouldValidate: false });
    }
  }, [branchOptions, existing, isEdit, jobTitleOptions, setValue]);

  useEffect(() => {
    if (financeData) {
      setFinanceRows(
        financeData.rows.map((r) => ({
          ...r,
          insurance_affect: r.insurance_affect ?? false,
        })),
      );
      if (financeData.basic_salary) setValue('basic_salary', financeData.basic_salary);
    }
  }, [financeData, setValue]);

  useEffect(() => {
    if (dwamData) {
      const defaults = defaultDwamSchedule();
      const merged = defaults.map((d) => {
        const fromApi = dwamData.schedule.find((s) => s.day === d.day);
        return fromApi ? { ...d, ...fromApi, dayName: d.dayName } : d;
      });
      setDwamSchedule(merged);
      if (dwamData.shift_type) setValue('shift_type', dwamData.shift_type);
    }
  }, [dwamData, setValue]);

  useEffect(() => {
    const primary = banksData?.[0];
    if (primary) {
      setBank({
        bankId: String(primary.bank_id_fk || ''),
        accountNum: primary.bank_account_num ?? '',
        bankName: primary.emp_bank_name ?? '',
        ibanFile: null,
        imagePath: primary.bank_id_fk_image && primary.bank_id_fk_image !== '0' ? primary.bank_id_fk_image : '',
        approvedForSarf: primary.approved_for_sarf === 1,
      });
    }
  }, [banksData, setBank]);

  useEffect(() => {
    if (docsData?.length) {
      setDocuments(
        docsData.map((d) => ({
          id: String(d.id),
          title: d.title,
          file: null,
          filePath: d.emp_file ?? '',
          have_date: d.have_date === 1,
          from_date: d.from_date ?? '',
          to_date: d.to_date ?? '',
          tanbih: d.tanbih_fk === 1,
          period: String(d.period ?? 30),
        })),
      );
    }
  }, [docsData]);

  useEffect(() => {
    if (!isEdit) {
      api.get<{ nextCode: number }>('/employees/next-code')
        .then(({ data }) => setValue('emp_code', String(data.nextCode)))
        .catch(() => {
          setValue('emp_code', '');
          toast.error(ui('تعذّر جلب كود الموظف — أعد تحميل الصفحة'));
        });
    }
  }, [isEdit, setValue, ui]);

  useEffect(() => {
    if (!isEdit && branches?.length && !watch('branch_id_fk')) {
      setValue('branch_id_fk', String(branches[0].id), { shouldValidate: true });
    }
  }, [branches, isEdit, setValue, watch]);

  const birthDate = watch('birth_date');
  useEffect(() => {
    if (!birthDate) return;
    const bd = new Date(birthDate);
    const today = new Date();
    let age = today.getFullYear() - bd.getFullYear();
    const m = today.getMonth() - bd.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < bd.getDate())) age--;
    setValue('age', String(age));
  }, [birthDate, setValue]);

  const onFormInvalid = (formErrors: FieldErrors<FormValues>) => {
    const firstKey = Object.keys(formErrors)[0] as keyof FormValues | undefined;
    toast.error(validationErrorMessage(formErrors));
    if (firstKey) setStep(stepIndexForField(firstKey));
  };

  const goNext = async () => {
    const stepId = STEPS[step].id;
    if (stepId === 'work') {
      if (addToSystem && !watch('systemUsername')?.trim()) {
        toast.error(ui('اسم المستخدم مطلوب'));
        return;
      }
      setStep((s) => s + 1);
      return;
    }
    const fields = [...STEP_FIELD_KEYS[stepId]];
    if (fields.length > 0) {
      const ok = await trigger(fields);
      if (!ok) {
        const stepErrors = form.formState.errors;
        toast.error(validationErrorMessage(stepErrors));
        return;
      }
    }
    setStep((s) => s + 1);
  };

  const onSubmit = async (values: FormValues) => {
    if (!isEdit && values.addToSystem && !values.systemPassword?.trim()) {
      toast.error(ui('كلمة المرور مطلوبة عند إضافة الموظف للنظام'));
      return;
    }
    try {
      const submittedJobTitle = jobTitles?.find((job) => String(job.id) === values.job_title_id_fk);
      const employeeValues = {
        ...values,
        employee_target: jobTitleHasTarget(submittedJobTitle?.name) ? values.employee_target : '',
        employee_commission: jobTitleHasTarget(submittedJobTitle?.name) ? values.employee_commission : '',
      };
      // 1) Upload the IBAN / bank certificate scan (if a new file was picked).
      let bankImage = bank.imagePath ?? '';
      if (bank.ibanFile) {
        const p = await upload('emp-bank', bank.ibanFile);
        if (p) bankImage = p;
      }

      const bankRows =
        bank.bankId && bank.accountNum
          ? [
              {
                bank_id_fk: Number(bank.bankId),
                bank_account_num: bank.accountNum,
                emp_bank_name: bank.bankName ?? undefined,
                approved_for_sarf: bank.approvedForSarf ? 1 : 0,
                bank_id_fk_image: bankImage || undefined,
              },
            ]
          : [];

      // 2) Upload each new document binary → its stored path (emp_file).
      const docRows: Array<Record<string, unknown>> = [];
      for (const d of documents) {
        if (!d.title.trim()) continue;
        let filePath = d.filePath ?? '';
        if (d.file) {
          const p = await upload('document', d.file);
          if (p) filePath = p;
        }
        docRows.push({
          id: /^\d+$/.test(d.id) ? Number(d.id) : undefined,
          file_type: d.title,
          file_name: d.title,
          file_path: filePath || undefined,
          expire_date: d.have_date ? d.to_date : undefined,
        });
      }

      if (isEdit) {
        const empId = Number(id);
        await api.put(`/employees/${empId}`, { ...employeeValues, addToSystem: !!values.addToSystem });
        await api.put(`/employees/${empId}/finance`, { rows: financeRows, basic_salary: values.basic_salary });
        await api.put(`/employees/${empId}/dwam`, { schedule: dwamSchedule, shift_type: values.shift_type });
        await api.put(`/employees/${empId}/banks`, { rows: bankRows });
        await api.put(`/employees/${empId}/documents`, { rows: docRows });
        toast.success(ui('تم تحديث بيانات الموظف'));
      } else {
        const { data: created } = await api.post<{ id: number; emp_code: number }>('/employees', {
          ...employeeValues,
          addToSystem: !!values.addToSystem,
        });
        await api.put(`/employees/${created.id}/finance`, { rows: financeRows, basic_salary: values.basic_salary });
        await api.put(`/employees/${created.id}/dwam`, { schedule: dwamSchedule, shift_type: values.shift_type });
        if (bankRows.length) await api.put(`/employees/${created.id}/banks`, { rows: bankRows });
        if (docRows.length) await api.put(`/employees/${created.id}/documents`, { rows: docRows });
        toast.success(ui('تم إضافة الموظف'));
      }
      navigate('/employees');
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const lookupOptions = (items?: { id: number; title: string }[]) =>
    items?.map((i) => ({ value: String(i.id), label: i.title })) ?? [];

  const selectedJobTitle = jobTitles?.find((job) => String(job.id) === selectedJobTitleId);
  const showEmployeeTarget = jobTitleHasTarget(selectedJobTitle?.name);

  if (isEdit && isError && isNotImplemented(error)) {
    return (
      <div>
        <PageHeader title={ui('تعديل موظف')} />
        <NotImplementedState title={ui('نموذج الموظف قيد الإعداد على الخادم')} />
      </div>
    );
  }

  const renderStep = () => {
    switch (STEPS[step].id) {
      case 'personal':
        return (
          <div className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
              <Card className="flex flex-col items-center gap-4 border-border/60 bg-gradient-to-b from-primary/5 to-card p-5 shadow-sm">
                <div className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <User className="size-7" />
                </div>
                <FieldWrapper label={ui('الصورة الشخصية')} className="w-full">
                  <input type="hidden" {...register('personal_photo')} />
                  <UploadField
                    category="emp-photo"
                    accept="image/*"
                    value={watch('personal_photo')}
                    onChange={(p) => setValue('personal_photo', p ?? '', { shouldDirty: true, shouldValidate: true })}
                    label={ui('رفع صورة الموظف')}
                  />
                </FieldWrapper>
              </Card>

              <FormSection title={ui('البيانات الأساسية')} description={ui('الفرع والمسمى الوظيفي وبيانات التعريف')}>
                <FieldWrapper label={ui('كود الموظف')} error={errors.emp_code?.message} required>
                  <Input {...register('emp_code')} readOnly className="bg-muted nums" />
                </FieldWrapper>
                <FieldWrapper label={ui('اسم الموظف')} error={errors.emp_name?.message} required>
                  <Input {...register('emp_name')} />
                </FieldWrapper>
                <RHFSelect control={control} name="branch_id_fk" label={ui('الفرع')} required options={branchOptions} />
                <RHFRadio
                  control={control}
                  name="emp_type"
                  label={ui('حريمى/رجالى')}
                  required
                  options={[
                    { value: '1', label: ui('رجالى') },
                    { value: '2', label: ui('حريمى') },
                  ]}
                />
                <RHFSelect
                  control={control}
                  name="job_title_id_fk"
                  label={ui('المسمى الوظيفي')}
                  required
                  options={jobTitleOptions}
                  comboboxContentClassName="w-[min(24rem,calc(100vw-2rem))]"
                />
                <FieldWrapper label={ui('الوظيفة')} error={errors.employment_type?.message}>
                  <Input
                    placeholder={ui('أدخل الوظيفة')}
                    {...register('employment_type')}
                  />
                </FieldWrapper>
                {showEmployeeTarget && (
                  <>
                    <FieldWrapper label={ui('التارجت')} error={errors.employee_target?.message}>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        inputMode="decimal"
                        className="nums"
                        placeholder={ui('أدخل التارجت')}
                        {...register('employee_target')}
                      />
                    </FieldWrapper>
                    <FieldWrapper label={ui('العمولة')} error={errors.employee_commission?.message}>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        inputMode="decimal"
                        className="nums"
                        placeholder={ui('أدخل العمولة')}
                        {...register('employee_commission')}
                      />
                    </FieldWrapper>
                  </>
                )}
              </FormSection>
            </div>

            <FormSection title={ui('البيانات الشخصية')}>
              <FieldWrapper label={ui('تاريخ الميلاد')}>
                <Input type="date" className="nums" {...register('birth_date')} />
              </FieldWrapper>
              <FieldWrapper label={ui('السن')}>
                <Input {...register('age')} readOnly className="bg-muted nums" />
              </FieldWrapper>
              <RHFSelect
                control={control}
                name="gender"
                label={ui('الجنس')}
                options={[
                  { value: '1', label: ui('ذكر') },
                  { value: '2', label: ui('أنثى') },
                ]}
              />
              <RHFSelect
                control={control}
                name="nationality_fk"
                label={ui('الجنسية')}
                options={lookupOptions(nationalities)}
              />
              <RHFSelect
                control={control}
                name="deyana_fk"
                label={ui('الديانة')}
                options={lookupOptions(religions)}
              />
              <RHFSelect
                control={control}
                name="national_status_fk"
                label={ui('الحالة الاجتماعية')}
                options={lookupOptions(socialStatuses)}
              />
              <FieldWrapper label={ui('رقم الهوية / الإقامة')}>
                <Input {...register('card_num')} className="nums" />
              </FieldWrapper>
              <RHFRadio control={control} name="military_service" label={ui('الخدمة العسكرية')} options={MILITARY} />
            </FormSection>

            <FormSection title={ui('بيانات التواصل')}>
              <FieldWrapper label={ui('رقم الجوال')} error={errors.jwal?.message} required>
                <Input {...register('jwal')} type="tel" className="nums" />
              </FieldWrapper>
              <FieldWrapper label={ui('جوال آخر')}>
                <Input {...register('other_jwal')} className="nums" />
              </FieldWrapper>
              <FieldWrapper label={ui('البريد الإلكتروني')}>
                <Input type="email" {...register('email')} />
              </FieldWrapper>
              <div className="md:col-span-2 lg:col-span-3">
                <FieldWrapper label={ui('العنوان')}>
                  <Input {...register('address')} />
                </FieldWrapper>
              </div>
            </FormSection>

            <section className="rounded-xl border border-border/60 bg-muted/20 p-5">
              <div className="mb-4 border-b border-border/50 pb-3">
                <h3 className="text-base font-semibold text-foreground">{ui('المؤهل والخبرات')}</h3>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <FieldWrapper label={ui('نوع المؤهل الدراسي')}>
                  <Input {...register('employee_qualification')} />
                </FieldWrapper>
                <div className="col-span-full space-y-4">
                  <RHFTextarea control={control} name="previous_experience" label={ui('الخبرات السابقة')} rows={3} />
                  <RHFTextarea control={control} name="skills" label={ui('المهارات')} rows={2} hint={ui('افصل بين المهارات بفاصلة')} />
                  <RHFTextarea control={control} name="languages" label={ui('اللغات')} rows={2} hint={ui('مثال: العربية، الإنجليزية')} />
                </div>
              </div>
            </section>

            <section className="rounded-xl border border-border/60 bg-muted/20 p-5">
              <div className="mb-4 border-b border-border/50 pb-3">
                <h3 className="mb-1 text-base font-semibold text-foreground">{ui('إضافة إلى النظام')}</h3>
                <p className="text-sm text-muted-foreground">
                  {ui('عند التفعيل يتم إنشاء حساب دخول للموظف، وتُربط صلاحياته تلقائياً بالمسمى الوظيفي المحدد.')}
                </p>
              </div>
              <div className="mb-4 flex items-center gap-2">
                <Checkbox
                  id="add-to-system"
                  checked={!!addToSystem}
                  onCheckedChange={(v) => setValue('addToSystem', v === true)}
                />
                <label htmlFor="add-to-system" className="text-sm font-medium">{ui('إضافة إلى النظام')}</label>
              </div>
              {addToSystem && (
                <div className="grid gap-4 md:grid-cols-2">
                  <FieldWrapper label={ui('اسم المستخدم')} error={errors.systemUsername?.message} required>
                    <Input {...register('systemUsername')} />
                  </FieldWrapper>
                  <FieldWrapper label={ui('كلمة المرور')} error={errors.systemPassword?.message} required>
                    <Input type="password" {...register('systemPassword')} />
                  </FieldWrapper>
                </div>
              )}
            </section>
          </div>
        );
      case 'work':
        return (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <RHFSelect control={control} name="direct_manager_fk" label={ui('المدير المباشر')} options={managerOptions} />
              <DualDateField label={ui('تاريخ التعيين')} gregorianValue={watch('start_work_date_m')} onGregorianChange={(v) => setValue('start_work_date_m', v)} />
              <DualDateField label={ui('تاريخ انتهاء العقد')} gregorianValue={watch('end_contract_date_m')} onGregorianChange={(v) => setValue('end_contract_date_m', v)} />
              <FieldWrapper label={ui('فترة التجربة (شهور)')}><Input {...register('test_num_month')} className="nums" /></FieldWrapper>
              <DualDateField label={ui('نهاية التجربة')} gregorianValue={watch('end_test_date_m')} onGregorianChange={(v) => setValue('end_test_date_m', v)} />
              <RHFRadio control={control} name="employee_type" label={ui('حالة الموظف')} options={[{ value: '1', label: ui('نشط') }, { value: '2', label: ui('موقوف') }]} />
            </div>
            <div className="border-t border-border pt-6">
              <h3 className="mb-4 font-semibold">{ui('ربط الموظف بالدوام')}</h3>
              <DwamScheduleGrid
                schedule={dwamSchedule}
                onChange={setDwamSchedule}
                shiftType={watch('shift_type')}
                onShiftTypeChange={(v) => setValue('shift_type', v)}
              />
            </div>
          </div>
        );
      case 'finance':
        return (
          <div className="space-y-8">
            <FinanceRowsEditor
              rows={financeRows}
              onChange={setFinanceRows}
              allowanceTypes={allowanceTypes}
              deductionTypes={deductionTypes}
              basicSalary={watch('basic_salary')}
              onBasicSalaryChange={(v) => setValue('basic_salary', v)}
            />
            <div className="border-t border-border pt-6">
              <h3 className="mb-4 font-semibold">{ui('بيانات الحساب البنكي')}</h3>
              <BankAccountForm {...bank} onChange={setBank} banks={banks} />
            </div>
          </div>
        );
      case 'insurance':
        return (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <FieldWrapper label={ui('نوع التأمين الاجتماعي')}><Input {...register('type_tamin')} /></FieldWrapper>
            <FieldWrapper label={ui('رقم التأمين')}><Input {...register('tamin_rkm')} className="nums" /></FieldWrapper>
            <FieldWrapper label={ui('المسمى التأميني')}><Input {...register('tamin_mosama_wazefy')} /></FieldWrapper>
            <DualDateField label={ui('تاريخ بدء التأمين')} gregorianValue={watch('start_tamin_date_m')} onGregorianChange={(v) => setValue('start_tamin_date_m', v)} />
            <DualDateField label={ui('تاريخ التأمين')} gregorianValue={watch('tamin_date_m')} onGregorianChange={(v) => setValue('tamin_date_m', v)} />
            <FieldWrapper label={ui('الأجر التأميني')}><Input {...register('tamin_rateb')} className="nums" /></FieldWrapper>
            <FieldWrapper label={ui('حصة الموظف')}><Input {...register('tamin_hesa_emp')} className="nums" /></FieldWrapper>
            <FieldWrapper label={ui('حصة صاحب العمل')}><Input {...register('tamin_hesa_oner')} className="nums" /></FieldWrapper>
            <FieldWrapper label={ui('التأمين الطبي')}><Input {...register('type_tamin__medicine')} /></FieldWrapper>
            <FieldWrapper label={ui('شركة التأمين')}><Input {...register('tamin_company')} /></FieldWrapper>
            <FieldWrapper label={ui('رقم التأمين الطبي')}><Input {...register('tamin_medicine_num')} className="nums" /></FieldWrapper>
            <FieldWrapper label={ui('رقم البوليصة')}><Input {...register('polica_num')} /></FieldWrapper>
          </div>
        );
      case 'documents':
        return <EmployeeDocumentsEditor documents={documents} onChange={setDocuments} />;
      case 'review':
        return (
          <div className="space-y-4">
            {Object.keys(errors).length > 0 && (
              <Card className="border-destructive/40 bg-destructive/5 p-4 text-destructive">
                <p className="font-medium">{ui('يوجد حقول مطلوبة غير مكتملة')}</p>
                <p className="mt-1 text-sm">{firstValidationError(errors) ?? ui('يرجى مراجعة الخطوات السابقة وإكمال البيانات المطلوبة')}</p>
              </Card>
            )}
            <Card className="p-4">
              <h3 className="text-lg font-semibold">{watch('emp_name') || '—'}</h3>
              <p className="text-sm text-muted-foreground">{ui('كود:')} {watch('emp_code')} · {watch('jwal')}</p>
              <p className="mt-2 text-sm">{watch('mosma_wazefy_n')} — {watch('employee_qualification')}</p>
              <p className="text-sm text-muted-foreground">{ui('استحقاقات:')} {financeRows.filter((r) => r.badl_type === '1').length} · {ui('استقطاعات:')} {financeRows.filter((r) => r.badl_type === '2').length}</p>
            </Card>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div>
      <PageHeader
        title={isEdit ? 'تعديل موظف' : ui('موظف جديد')}
        actions={<Button variant="outline" asChild><Link to="/employees"><ArrowRight className="size-4" />{ui('العودة')}</Link></Button>}
      />
      <div className="mb-8">
        <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all duration-300"
            style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {STEPS.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setStep(i)}
              className={cn(
                'flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition-colors',
                i === step && 'border-primary bg-primary text-primary-foreground shadow-sm',
                i < step && 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
                i > step && 'border-border bg-card text-muted-foreground hover:border-primary/40',
              )}
            >
              {i < step ? <Check className="size-4" /> : <span className="nums font-medium">{i + 1}</span>}
              {ui(s.title)}
            </button>
          ))}
        </div>
      </div>
      <form onSubmit={handleSubmit(onSubmit, onFormInvalid)}>
        <div className="mx-auto w-full max-w-5xl">
          <Card className="rounded-2xl border border-border/60 bg-card p-6 shadow-md">
            {renderStep()}
          </Card>
        </div>
        <div className="mx-auto mt-6 flex w-full max-w-5xl justify-between">
          <Button type="button" variant="outline" disabled={step === 0} onClick={() => setStep((s) => s - 1)}><ArrowRight className="size-4" />{ui('السابق')}</Button>
          <div className="flex gap-2">
            {step === 0 && (
              <Button type="submit" variant="outline" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="size-4 animate-spin" />}
                <Save className="size-4" /> {ui('حفظ دون استكمال باقي البيانات')}
              </Button>
            )}
            {step < STEPS.length - 1 ? (
              <Button type="button" onClick={() => void goNext()}>{ui('التالي')}<ArrowLeft className="size-4" /></Button>
            ) : (
              <Button type="submit" variant="brand" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="size-4 animate-spin" />}
                <Save className="size-4" /> {isEdit ? ui('حفظ') : ui('إنشاء')}
              </Button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
