import { Info, Package, Pencil, Plus, Save, Sparkles, Trash2, WalletCards } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  DialogFormGrid,
  DialogFormSection,
  DialogFormToggle,
  FormDialogBody,
  FormDialogFooter,
  FormDialogHeader,
  FORM_DIALOG_CONTENT_CLASS,
} from '@/components/common/dialog-form-layout';
import { useBranches } from '@/hooks/use-branches';
import { useClubT } from '@/hooks/use-club-t';
import { api, apiError } from '@/lib/api';
import { useArrayResource } from '@/lib/api-hooks';
import { confirm } from '@/lib/confirm';
import { toArabicDigits } from '@/lib/utils';
import { useAuth } from '@/store/auth';
import type { ClubMembershipType, ClubSubscriptionType } from '@/types/club';
import { hasRequiredSubscriptionTypeFields } from './package-settings-form';

type SettingsTab = 'subscriptions' | 'membership';

type BenefitKey = 'iceBath' | 'medicalFreeze' | 'inBody' | 'massage' | 'freeDays' | 'nutritionSessions' | 'ptSessions' | 'fitnessSessions' | 'freeze' | 'invitations';

const benefitKeys: BenefitKey[] = ['iceBath', 'medicalFreeze', 'inBody', 'massage', 'freeDays', 'nutritionSessions', 'ptSessions', 'fitnessSessions', 'freeze', 'invitations'];

type SubTypeForm = {
  nameAr: string;
  nameEn: string;
  packageCategory: string;
  applyToAllBranches: boolean;
  branchIds: number[];
  durationValue: string;
  durationType: 'months' | 'days';
  validUpgradeDuration: string;
  attendanceCount: string;
  price: string;
  minPrice: string;
  minFreeze: string;
  maxClassesPerDay: string;
  availabilityFrom: string;
  availabilityTo: string;
  incomeType: string;
  description: string;
  showOnline: boolean;
  benefits: Record<BenefitKey, string>;
};

const emptySubTypeForm = (allBranchIds: number[] = []): SubTypeForm => ({
  nameAr: '',
  nameEn: '',
  packageCategory: 'regular',
  applyToAllBranches: true,
  branchIds: allBranchIds,
  durationValue: '',
  durationType: 'months',
  validUpgradeDuration: '',
  attendanceCount: '',
  price: '0',
  minPrice: '',
  minFreeze: '',
  maxClassesPerDay: '',
  availabilityFrom: '',
  availabilityTo: '',
  incomeType: '',
  description: '',
  showOnline: false,
  benefits: Object.fromEntries(benefitKeys.map((key) => [key, '0'])) as Record<BenefitKey, string>,
});

function subTypeToForm(t: ClubSubscriptionType, allBranchIds: number[]): SubTypeForm {
  const applyToAllBranches = !!t.applyToAllBranches;
  let branchIds = t.branchIds ?? [];
  if (!applyToAllBranches && branchIds.length === 0 && t.branchId != null) {
    branchIds = [t.branchId];
  }
  if (applyToAllBranches) {
    branchIds = allBranchIds;
  }
  return {
    nameAr: t.nameAr ?? t.name,
    nameEn: t.nameEn ?? '',
    packageCategory: t.packageCategory ?? 'regular',
    applyToAllBranches,
    branchIds,
    durationValue: String(t.durationValue ?? t.days),
    durationType: (t.durationType === 'months' ? 'months' : 'days'),
    validUpgradeDuration: t.validUpgradeDuration != null ? String(t.validUpgradeDuration) : '',
    attendanceCount: t.attendanceCount != null ? String(t.attendanceCount) : '',
    price: String(t.price),
    minPrice: t.minPrice != null ? String(t.minPrice) : '',
    minFreeze: t.minFreeze != null ? String(t.minFreeze) : '',
    maxClassesPerDay: t.maxClassesPerDay != null ? String(t.maxClassesPerDay) : '',
    availabilityFrom: t.availabilityFrom ?? '',
    availabilityTo: t.availabilityTo ?? '',
    incomeType: t.incomeType ?? '',
    description: t.description ?? '',
    showOnline: !!t.showInApp,
    benefits: Object.fromEntries(benefitKeys.map((key) => [key, String(t.benefits?.[key] ?? (key === 'inBody' ? t.inbodyCount : key === 'invitations' ? t.invitationsCount : key === 'freeze' ? t.freezeDays : 0) ?? 0)])) as Record<BenefitKey, string>,
  };
}

function FormField({
  label,
  required,
  hint,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className ? `space-y-2 ${className}` : 'space-y-2'}>
      <Label>
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {children}
    </div>
  );
}

export function ClubPackageSettingsPage() {
  const ct = useClubT();
  const { user } = useAuth();
  const isAdmin = user?.level === 1;
  const { data: branches, isLoading: branchesLoading, isError: branchesError } = useBranches();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const tab: SettingsTab = tabParam === 'membership' ? 'membership' : 'subscriptions';

  const setTab = (next: SettingsTab) => {
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.set('tab', next);
        return p;
      },
      { replace: true },
    );
  };

  const { data: subTypes, refetch: refetchSubTypes } =
    useArrayResource<ClubSubscriptionType>('club-subscription-types');

  const { data: membershipTypes, refetch: refetchMembershipTypes } =
    useArrayResource<ClubMembershipType>('club-membership-types');

  const [saving, setSaving] = useState(false);

  const [subTypeOpen, setSubTypeOpen] = useState(false);
  const [subTypeEditId, setSubTypeEditId] = useState<number | null>(null);
  const [subTypeForm, setSubTypeForm] = useState<SubTypeForm>(emptySubTypeForm);

  const [memTypeOpen, setMemTypeOpen] = useState(false);
  const [memTypeEditId, setMemTypeEditId] = useState<number | null>(null);
  const [memTypeForm, setMemTypeForm] = useState({ name: '', price: '', durationDays: '' });

  const patchSubTypeForm = (patch: Partial<SubTypeForm>) => {
    setSubTypeForm((f) => ({ ...f, ...patch }));
  };

  const allBranchIds = useMemo(() => (branches ?? []).map((b) => b.id), [branches]);

  useEffect(() => {
    if (!subTypeOpen || allBranchIds.length === 0) return;
    setSubTypeForm((f) => {
      if (f.applyToAllBranches) {
        return { ...f, branchIds: allBranchIds };
      }
      const kept = f.branchIds.filter((id) => allBranchIds.includes(id));
      return kept.length === f.branchIds.length ? f : { ...f, branchIds: kept };
    });
  }, [subTypeOpen, allBranchIds]);

  const branchLabelForType = (t: ClubSubscriptionType) => {
    if (t.applyToAllBranches) return ct('common.allBranches');
    const ids = t.branchIds?.length ? t.branchIds : t.branchId != null ? [t.branchId] : [];
    if (ids.length === 0) return ct('common.allBranches');
    return ids
      .map((id) => branches?.find((b) => b.id === id)?.name ?? String(id))
      .join(' · ');
  };

  const openSubTypeCreate = () => {
    setSubTypeEditId(null);
    setSubTypeForm(emptySubTypeForm(allBranchIds));
    setSubTypeOpen(true);
  };

  const openSubTypeEdit = (t: ClubSubscriptionType) => {
    setSubTypeEditId(t.id);
    setSubTypeForm(subTypeToForm(t, allBranchIds));
    setSubTypeOpen(true);
  };

  const saveSubType = async () => {
    if (!hasRequiredSubscriptionTypeFields(subTypeForm)) {
      toast.error(ct('members.fillRequired'));
      return;
    }
    if (Number(subTypeForm.durationValue) <= 0) {
      toast.error(ct('members.fillRequired'));
      return;
    }
    if (!subTypeForm.applyToAllBranches && subTypeForm.branchIds.length === 0) {
      toast.error(ct('packages.selectAtLeastOneBranch'));
      return;
    }
    setSaving(true);
    try {
      const durationValue = Number(subTypeForm.durationValue);
      const daysValue = subTypeForm.durationType === 'months' ? durationValue * 30 : durationValue;
      const benefits = Object.fromEntries(benefitKeys.map((key) => [key, Number(subTypeForm.benefits[key]) || 0]));
      const body = {
        name: subTypeForm.nameAr.trim() || subTypeForm.nameEn.trim(),
        nameAr: subTypeForm.nameAr.trim(),
        nameEn: subTypeForm.nameEn.trim(),
        packageCategory: subTypeForm.packageCategory,
        applyToAllBranches: subTypeForm.applyToAllBranches,
        branchIds: subTypeForm.applyToAllBranches ? [] : subTypeForm.branchIds,
        durationValue,
        durationType: subTypeForm.durationType,
        validUpgradeDuration: subTypeForm.validUpgradeDuration || null,
        attendanceCount: subTypeForm.attendanceCount || null,
        price: Number(subTypeForm.price),
        minPrice: subTypeForm.minPrice || null,
        minFreeze: subTypeForm.minFreeze || null,
        maxClassesPerDay: subTypeForm.maxClassesPerDay || null,
        availabilityFrom: subTypeForm.availabilityFrom || null,
        availabilityTo: subTypeForm.availabilityTo || null,
        incomeType: subTypeForm.incomeType || null,
        description: subTypeForm.description.trim() || null,
        benefits,
        days: daysValue,
        invitationsCount: benefits.invitations,
        inbodyCount: benefits.inBody,
        showInApp: subTypeForm.showOnline,
        isLinkedToSessions: false,
        sessionsCount: benefits.fitnessSessions || null,
        allowMultipleDailyEntries: true,
        isLinkedToFreeze: benefits.freeze > 0,
        freezeDays: benefits.freeze || null,
      };
      if (subTypeEditId) {
        await api.put(`/club-subscription-types/${subTypeEditId}`, body);
      } else {
        await api.post('/club-subscription-types', body);
      }
      toast.success(ct('common.success'));
      setSubTypeOpen(false);
      setSubTypeEditId(null);
      void refetchSubTypes();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const saveMemType = async () => {
    if (!memTypeForm.name.trim() || !memTypeForm.price || !memTypeForm.durationDays) {
      toast.error(ct('members.fillRequired'));
      return;
    }
    setSaving(true);
    try {
      const body = {
        name: memTypeForm.name,
        price: Number(memTypeForm.price),
        durationDays: Number(memTypeForm.durationDays),
      };
      if (memTypeEditId) {
        await api.put(`/club-membership-types/${memTypeEditId}`, body);
      } else {
        await api.post('/club-membership-types', body);
      }
      toast.success(ct('common.success'));
      setMemTypeOpen(false);
      setMemTypeEditId(null);
      void refetchMembershipTypes();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const deleteSubType = async (id: number) => {
    const ok = await confirm({ title: ct('common.confirmDelete'), variant: 'destructive', confirmLabel: ct('common.delete') });
    if (!ok) return;
    try {
      await api.delete(`/club-subscription-types/${id}`);
      toast.success(ct('common.success'));
      void refetchSubTypes();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const deleteMemType = async (id: number) => {
    const ok = await confirm({ title: ct('common.confirmDelete'), variant: 'destructive', confirmLabel: ct('common.delete') });
    if (!ok) return;
    try {
      await api.delete(`/club-membership-types/${id}`);
      toast.success(ct('common.success'));
      void refetchMembershipTypes();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title={ct('packages.settingsTitle')} description={ct('packages.settingsDesc')} />

      <Tabs value={tab} onValueChange={(v) => setTab(v as SettingsTab)}>
        <TabsList>
          <TabsTrigger value="subscriptions">{ct('packages.tabSubscriptions')}</TabsTrigger>
          <TabsTrigger value="membership">{ct('packages.tabMembership')}</TabsTrigger>
        </TabsList>

        <TabsContent value="subscriptions" className="space-y-4 pt-4">
          <p className="text-sm text-muted-foreground">{ct('packages.subscriptionsHint')}</p>
          <Button variant="outline" onClick={openSubTypeCreate}>
            <Plus className="size-4" /> {ct('subscriptions.newType')}
          </Button>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(subTypes ?? []).map((t) => (
              <div
                key={t.id}
                className="flex items-start justify-between rounded-xl border bg-card p-4 shadow-sm"
              >
                <div>
                  <p className="font-medium">{t.name}</p>
                  <p className="mt-1 text-sm text-muted-foreground nums">
                    {toArabicDigits(t.price)}
                    {' · '}
                    {t.isLinkedToSessions
                      ? `${toArabicDigits(t.sessionsCount ?? 0)} ${ct('packages.sessionsUnit')}`
                      : `${toArabicDigits(t.days)} ${ct('subscriptions.typeDays')}`}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{branchLabelForType(t)}</p>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => openSubTypeEdit(t)}>
                    <Pencil className="size-4" />
                  </Button>
                  {isAdmin && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive"
                      onClick={() => void deleteSubType(t.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
            {(subTypes ?? []).length === 0 && (
              <p className="col-span-full text-center text-sm text-muted-foreground">{ct('common.noData')}</p>
            )}
          </div>
        </TabsContent>

        <TabsContent value="membership" className="space-y-4 pt-4">
          <div className="flex gap-3 rounded-xl border border-blue-200/60 bg-blue-50/50 p-4 text-sm text-muted-foreground dark:border-blue-900/40 dark:bg-blue-950/20">
            <Info className="mt-0.5 size-4 shrink-0 text-blue-600 dark:text-blue-400" />
            <p>{ct('packages.membershipHint')}</p>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              setMemTypeEditId(null);
              setMemTypeForm({ name: '', price: '', durationDays: '' });
              setMemTypeOpen(true);
            }}
          >
            <Plus className="size-4" /> {ct('members.newType')}
          </Button>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(membershipTypes ?? []).map((t) => (
              <div
                key={t.id}
                className="flex items-start justify-between rounded-xl border bg-card p-4 shadow-sm"
              >
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
                      setMemTypeEditId(t.id);
                      setMemTypeForm({
                        name: t.name,
                        price: String(t.price),
                        durationDays: String(t.durationDays),
                      });
                      setMemTypeOpen(true);
                    }}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  {isAdmin && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive"
                      onClick={() => void deleteMemType(t.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
            {(membershipTypes ?? []).length === 0 && (
              <p className="col-span-full text-center text-sm text-muted-foreground">{ct('common.noData')}</p>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={subTypeOpen} onOpenChange={setSubTypeOpen}>
        <DialogContent className={FORM_DIALOG_CONTENT_CLASS} aria-describedby={undefined}>
          <FormDialogHeader>
            <DialogTitle>
              {subTypeEditId ? ct('packages.editSubscriptionType') : ct('packages.addSubscriptionType')}
            </DialogTitle>
          </FormDialogHeader>

          <FormDialogBody>
            <DialogFormSection title={ct('packages.sectionBasic')} icon={Package}>
              <DialogFormGrid columns={2}>
                <FormField label={ct('packages.packageCategory')} required className="sm:col-span-2">
                  <RadioGroup value={subTypeForm.packageCategory} onValueChange={(packageCategory) => patchSubTypeForm({ packageCategory })} className="grid gap-2 sm:grid-cols-4">
                    {(['regular', 'private', 'medical', 'other'] as const).map((category) => (
                      <label key={category} className="flex cursor-pointer items-center gap-3 rounded-md border bg-muted/20 px-3 py-3 has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                        <RadioGroupItem value={category} id={`package-category-${category}`} />
                        <span className="text-sm font-medium">{ct(`packages.category_${category}`)}</span>
                      </label>
                    ))}
                  </RadioGroup>
                </FormField>
                <FormField label={ct('packages.englishName')} required>
                  <Input dir="ltr" placeholder={ct('packages.englishName')} value={subTypeForm.nameEn} onChange={(e) => patchSubTypeForm({ nameEn: e.target.value })} />
                </FormField>
                <FormField label={ct('packages.arabicName')} required>
                  <Input placeholder={ct('packages.arabicName')} value={subTypeForm.nameAr} onChange={(e) => patchSubTypeForm({ nameAr: e.target.value })} />
                </FormField>
                <FormField label={ct('common.branch')} required className="sm:col-span-2">
                  <div className="space-y-3 rounded-md border bg-muted/20 p-3">
                    <label className="flex cursor-pointer items-center gap-2">
                      <Checkbox
                        checked={subTypeForm.applyToAllBranches}
                        onCheckedChange={(checked) => {
                          const all = !!checked;
                          patchSubTypeForm({
                            applyToAllBranches: all,
                            branchIds: all ? allBranchIds : subTypeForm.branchIds,
                          });
                        }}
                      />
                      <span className="text-sm font-medium">{ct('common.allBranches')}</span>
                    </label>
                    {(branches ?? []).length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        {branchesLoading
                          ? ct('common.loading')
                          : branchesError
                            ? ct('packages.branchesLoadError')
                            : ct('common.noData')}
                      </p>
                    ) : (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {(branches ?? []).map((b) => {
                          const checked =
                            subTypeForm.applyToAllBranches || subTypeForm.branchIds.includes(b.id);
                          return (
                            <label key={b.id} className="flex cursor-pointer items-center gap-2">
                              <Checkbox
                                checked={checked}
                                disabled={subTypeForm.applyToAllBranches}
                                onCheckedChange={(value) => {
                                  const next = value
                                    ? [...subTypeForm.branchIds, b.id]
                                    : subTypeForm.branchIds.filter((id) => id !== b.id);
                                  patchSubTypeForm({
                                    applyToAllBranches: false,
                                    branchIds: next,
                                  });
                                }}
                              />
                              <span className="text-sm">{b.name ?? '—'}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </FormField>
                <FormField label={ct('packages.duration')} required>
                  <Input className="nums" type="number" min={1} value={subTypeForm.durationValue} onChange={(e) => patchSubTypeForm({ durationValue: e.target.value })} />
                </FormField>
                <FormField label={ct('packages.durationType')} required>
                  <RadioGroup value={subTypeForm.durationType} onValueChange={(value) => patchSubTypeForm({ durationType: value as 'months' | 'days' })} className="flex min-h-10 items-center gap-6 rounded-md border px-3">
                    <label className="flex items-center gap-2"><RadioGroupItem value="months" />{ct('packages.months')}</label>
                    <label className="flex items-center gap-2"><RadioGroupItem value="days" />{ct('packages.days')}</label>
                  </RadioGroup>
                </FormField>
              </DialogFormGrid>
            </DialogFormSection>

            <DialogFormSection title={ct('packages.sectionBenefits')} icon={Sparkles}>
              <DialogFormGrid columns={3}>
                {benefitKeys.map((key) => (
                  <FormField key={key} label={ct(`packages.benefit_${key}`)}>
                    <div className="flex items-center overflow-hidden rounded-md border bg-background">
                      <Button type="button" variant="ghost" size="icon" onClick={() => patchSubTypeForm({ benefits: { ...subTypeForm.benefits, [key]: String(Math.max(0, Number(subTypeForm.benefits[key]) - 1)) } })}>−</Button>
                      <Input className="nums border-0 text-center shadow-none" type="number" min={0} value={subTypeForm.benefits[key]} onChange={(e) => patchSubTypeForm({ benefits: { ...subTypeForm.benefits, [key]: e.target.value } })} />
                      <Button type="button" variant="ghost" size="icon" onClick={() => patchSubTypeForm({ benefits: { ...subTypeForm.benefits, [key]: String(Number(subTypeForm.benefits[key]) + 1) } })}>+</Button>
                    </div>
                  </FormField>
                ))}
              </DialogFormGrid>
            </DialogFormSection>

            <DialogFormSection title={ct('packages.commercialSettings')} icon={WalletCards}>
              <DialogFormGrid columns={3}>
                <FormField label={ct('packages.validUpgradeDuration')}><Input className="nums" type="number" min={0} value={subTypeForm.validUpgradeDuration} onChange={(e) => patchSubTypeForm({ validUpgradeDuration: e.target.value })} /></FormField>
                <FormField label={ct('packages.attendanceCount')}><Input className="nums" type="number" min={0} value={subTypeForm.attendanceCount} onChange={(e) => patchSubTypeForm({ attendanceCount: e.target.value })} /></FormField>
                <FormField label={ct('packages.price')} required><Input className="nums" type="number" min={0} step="any" value={subTypeForm.price} onChange={(e) => patchSubTypeForm({ price: e.target.value })} /></FormField>
                <FormField label={ct('packages.minPrice')}><Input className="nums" type="number" min={0} step="any" value={subTypeForm.minPrice} onChange={(e) => patchSubTypeForm({ minPrice: e.target.value })} /></FormField>
                <FormField label={ct('packages.minFreeze')}><Input className="nums" type="number" min={0} value={subTypeForm.minFreeze} onChange={(e) => patchSubTypeForm({ minFreeze: e.target.value })} /></FormField>
                <FormField label={ct('packages.maxClassesPerDay')}><Input className="nums" type="number" min={0} value={subTypeForm.maxClassesPerDay} onChange={(e) => patchSubTypeForm({ maxClassesPerDay: e.target.value })} /></FormField>
                <FormField label={ct('packages.availabilityFrom')}><Input className="nums" type="date" value={subTypeForm.availabilityFrom} onChange={(e) => patchSubTypeForm({ availabilityFrom: e.target.value })} /></FormField>
                <FormField label={ct('packages.availabilityTo')}><Input className="nums" type="date" value={subTypeForm.availabilityTo} onChange={(e) => patchSubTypeForm({ availabilityTo: e.target.value })} /></FormField>
                <FormField label={ct('packages.incomeType')}>
                  <Select value={subTypeForm.incomeType} onValueChange={(incomeType) => patchSubTypeForm({ incomeType })}><SelectTrigger><SelectValue placeholder={ct('packages.selectOption')} /></SelectTrigger><SelectContent><SelectItem value="membership">{ct('packages.incomeMembership')}</SelectItem><SelectItem value="sessions">{ct('packages.incomeSessions')}</SelectItem><SelectItem value="personal_training">{ct('packages.incomePersonalTraining')}</SelectItem><SelectItem value="other">{ct('packages.category_other')}</SelectItem></SelectContent></Select>
                </FormField>
                <FormField label={ct('packages.description')} className="sm:col-span-3"><Textarea rows={4} value={subTypeForm.description} onChange={(e) => patchSubTypeForm({ description: e.target.value })} /></FormField>
                <DialogFormToggle label={ct('packages.showOnline')} checked={subTypeForm.showOnline} onCheckedChange={(showOnline) => patchSubTypeForm({ showOnline })} />
              </DialogFormGrid>
            </DialogFormSection>
          </FormDialogBody>

          <FormDialogFooter className="justify-start sm:justify-start">
            <Button variant="brand" onClick={() => void saveSubType()} disabled={saving}>
              <Save className="size-4" /> {ct('common.save')}
            </Button>
            <Button variant="outline" onClick={() => setSubTypeOpen(false)}>
              {ct('common.cancel')}
            </Button>
          </FormDialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={memTypeOpen} onOpenChange={setMemTypeOpen}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>{memTypeEditId ? ct('common.edit') : ct('members.newType')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <Input
              placeholder={ct('members.typeName')}
              value={memTypeForm.name}
              onChange={(e) => setMemTypeForm((f) => ({ ...f, name: e.target.value }))}
            />
            <Input
              className="nums"
              placeholder={ct('members.typePrice')}
              value={memTypeForm.price}
              onChange={(e) => setMemTypeForm((f) => ({ ...f, price: e.target.value }))}
            />
            <Input
              className="nums"
              placeholder={ct('members.typeDays')}
              value={memTypeForm.durationDays}
              onChange={(e) => setMemTypeForm((f) => ({ ...f, durationDays: e.target.value }))}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMemTypeOpen(false)}>
              {ct('common.cancel')}
            </Button>
            <Button variant="brand" onClick={() => void saveMemType()} disabled={saving}>
              {ct('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
