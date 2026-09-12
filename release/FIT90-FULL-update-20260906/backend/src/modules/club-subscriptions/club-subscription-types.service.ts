import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { toNum } from './club-subscription.utils';
import { Prisma } from '@prisma/client';

type TypeRow = {
  id: number;
  name: string;
  branch_id: number | null;
  apply_to_all_branches: boolean;
  price: unknown;
  days: number;
  is_part_of_target: boolean;
  invitations_count: number | null;
  inbody_count: number | null;
  is_special_offer: boolean;
  is_for_students: boolean;
  show_in_app: boolean;
  notify_customers: boolean;
  notify_on_expiry: boolean;
  wallet_points: number | null;
  offer_validity: string | null;
  is_linked_to_sessions: boolean;
  sessions_count: number | null;
  allow_multiple_daily_entries: boolean;
  is_linked_to_freeze: boolean;
  freeze_days: number | null;
  includes_spa: boolean;
  spa_count: number | null;
  name_ar: string | null;
  name_en: string | null;
  package_category: string;
  package_type: string | null;
  duration_value: number | null;
  duration_type: string;
  valid_upgrade_duration: number | null;
  attendance_count: number | null;
  min_price: unknown;
  min_freeze: number | null;
  max_classes_per_day: number | null;
  availability_from: string | null;
  availability_to: string | null;
  access_area_ids: unknown;
  income_type: string | null;
  description: string | null;
  benefits: unknown;
  week_planner: unknown;
  is_active: boolean;
  branches?: { branch_id: number }[];
};

@Injectable()
export class ClubSubscriptionTypesService {
  constructor(private readonly prisma: PrismaService) {}

  private map(r: TypeRow) {
    const branchIds = r.branches?.map((b) => b.branch_id) ?? (r.branch_id != null ? [r.branch_id] : []);
    return {
      id: r.id,
      name: r.name,
      branchId: r.branch_id,
      applyToAllBranches: r.apply_to_all_branches,
      branchIds,
      price: toNum(r.price),
      days: r.days,
      isPartOfTarget: r.is_part_of_target,
      invitationsCount: r.invitations_count,
      inbodyCount: r.inbody_count,
      isSpecialOffer: r.is_special_offer,
      isForStudents: r.is_for_students,
      showInApp: r.show_in_app,
      notifyCustomers: r.notify_customers,
      notifyOnExpiry: r.notify_on_expiry,
      walletPoints: r.wallet_points,
      offerValidity: r.offer_validity,
      isLinkedToSessions: r.is_linked_to_sessions,
      sessionsCount: r.sessions_count,
      allowMultipleDailyEntries: r.allow_multiple_daily_entries,
      isLinkedToFreeze: r.is_linked_to_freeze,
      freezeDays: r.freeze_days,
      includesSpa: r.includes_spa,
      spaCount: r.spa_count,
      nameAr: r.name_ar,
      nameEn: r.name_en,
      packageCategory: r.package_category,
      packageType: r.package_type,
      durationValue: r.duration_value,
      durationType: r.duration_type,
      validUpgradeDuration: r.valid_upgrade_duration,
      attendanceCount: r.attendance_count,
      minPrice: r.min_price == null ? null : toNum(r.min_price),
      minFreeze: r.min_freeze,
      maxClassesPerDay: r.max_classes_per_day,
      availabilityFrom: r.availability_from,
      availabilityTo: r.availability_to,
      accessAreaIds: Array.isArray(r.access_area_ids) ? r.access_area_ids : [],
      incomeType: r.income_type,
      description: r.description,
      benefits: r.benefits && typeof r.benefits === 'object' ? r.benefits : {},
      weekPlanner: r.week_planner && typeof r.week_planner === 'object' ? r.week_planner : {},
      isActive: r.is_active,
    };
  }

  private parseBranchSelection(body: Record<string, unknown>) {
    const applyToAllBranches = Boolean(body.applyToAllBranches);
    const rawIds = Array.isArray(body.branchIds) ? body.branchIds : [];
    const branchIds = [...new Set(rawIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0))];
    if (!applyToAllBranches && branchIds.length === 0) {
      throw new BadRequestException('اختر فرعاً واحداً على الأقل أو حدّد كل الفروع');
    }
    return {
      applyToAllBranches,
      branchIds,
      branchId: applyToAllBranches ? null : branchIds[0] ?? null,
    };
  }

  private async syncBranches(typeId: number, applyToAllBranches: boolean, branchIds: number[]) {
    await this.prisma.club_subscription_type_branches.deleteMany({
      where: { subscription_type_id: typeId },
    });
    if (!applyToAllBranches && branchIds.length > 0) {
      await this.prisma.club_subscription_type_branches.createMany({
        data: branchIds.map((branch_id) => ({ subscription_type_id: typeId, branch_id })),
      });
    }
  }

  private buildData(body: Record<string, unknown>) {
    const branchSelection =
      body.applyToAllBranches !== undefined || body.branchIds !== undefined
        ? this.parseBranchSelection(body)
        : null;

    const data = {
      ...(body.name != null ? { name: String(body.name) } : {}),
      ...(branchSelection
        ? {
            branch_id: branchSelection.branchId,
            apply_to_all_branches: branchSelection.applyToAllBranches,
          }
        : body.branchId !== undefined
          ? { branch_id: body.branchId != null && body.branchId !== '' ? Number(body.branchId) : null }
          : {}),
      ...(body.price != null ? { price: Number(body.price) } : {}),
      ...(body.days != null ? { days: Number(body.days) } : {}),
      ...(body.isPartOfTarget !== undefined ? { is_part_of_target: Boolean(body.isPartOfTarget) } : {}),
      ...(body.invitationsCount !== undefined
        ? { invitations_count: body.invitationsCount != null && body.invitationsCount !== '' ? Number(body.invitationsCount) : null }
        : {}),
      ...(body.inbodyCount !== undefined
        ? { inbody_count: body.inbodyCount != null && body.inbodyCount !== '' ? Number(body.inbodyCount) : null }
        : {}),
      ...(body.isSpecialOffer !== undefined ? { is_special_offer: Boolean(body.isSpecialOffer) } : {}),
      ...(body.isForStudents !== undefined ? { is_for_students: Boolean(body.isForStudents) } : {}),
      ...(body.showInApp !== undefined ? { show_in_app: Boolean(body.showInApp) } : {}),
      ...(body.notifyCustomers !== undefined ? { notify_customers: Boolean(body.notifyCustomers) } : {}),
      ...(body.notifyOnExpiry !== undefined ? { notify_on_expiry: Boolean(body.notifyOnExpiry) } : {}),
      ...(body.walletPoints !== undefined
        ? { wallet_points: body.walletPoints != null && body.walletPoints !== '' ? Number(body.walletPoints) : null }
        : {}),
      ...(body.offerValidity !== undefined ? { offer_validity: body.offerValidity ? String(body.offerValidity) : null } : {}),
      ...(body.isLinkedToSessions !== undefined ? { is_linked_to_sessions: Boolean(body.isLinkedToSessions) } : {}),
      ...(body.sessionsCount !== undefined
        ? { sessions_count: body.sessionsCount != null && body.sessionsCount !== '' ? Number(body.sessionsCount) : null }
        : {}),
      ...(body.allowMultipleDailyEntries !== undefined
        ? { allow_multiple_daily_entries: Boolean(body.allowMultipleDailyEntries) }
        : {}),
      ...(body.isLinkedToFreeze !== undefined ? { is_linked_to_freeze: Boolean(body.isLinkedToFreeze) } : {}),
      ...(body.freezeDays !== undefined
        ? { freeze_days: body.freezeDays != null && body.freezeDays !== '' ? Number(body.freezeDays) : null }
        : {}),
      ...(body.includesSpa !== undefined ? { includes_spa: Boolean(body.includesSpa) } : {}),
      ...(body.spaCount !== undefined
        ? { spa_count: body.spaCount != null && body.spaCount !== '' ? Number(body.spaCount) : null }
        : {}),
      ...(body.nameAr !== undefined ? { name_ar: body.nameAr ? String(body.nameAr) : null } : {}),
      ...(body.nameEn !== undefined ? { name_en: body.nameEn ? String(body.nameEn) : null } : {}),
      ...(body.packageCategory !== undefined ? { package_category: String(body.packageCategory) } : {}),
      ...(body.packageType !== undefined ? { package_type: body.packageType ? String(body.packageType) : null } : {}),
      ...(body.durationValue !== undefined ? { duration_value: body.durationValue !== '' ? Number(body.durationValue) : null } : {}),
      ...(body.durationType !== undefined ? { duration_type: String(body.durationType) } : {}),
      ...(body.validUpgradeDuration !== undefined ? { valid_upgrade_duration: body.validUpgradeDuration !== '' ? Number(body.validUpgradeDuration) : null } : {}),
      ...(body.attendanceCount !== undefined ? { attendance_count: body.attendanceCount !== '' ? Number(body.attendanceCount) : null } : {}),
      ...(body.minPrice !== undefined ? { min_price: body.minPrice !== '' ? Number(body.minPrice) : null } : {}),
      ...(body.minFreeze !== undefined ? { min_freeze: body.minFreeze !== '' ? Number(body.minFreeze) : null } : {}),
      ...(body.maxClassesPerDay !== undefined ? { max_classes_per_day: body.maxClassesPerDay !== '' ? Number(body.maxClassesPerDay) : null } : {}),
      ...(body.availabilityFrom !== undefined ? { availability_from: body.availabilityFrom ? String(body.availabilityFrom) : null } : {}),
      ...(body.availabilityTo !== undefined ? { availability_to: body.availabilityTo ? String(body.availabilityTo) : null } : {}),
      ...(body.accessAreaIds !== undefined ? { access_area_ids: body.accessAreaIds as Prisma.InputJsonValue } : {}),
      ...(body.incomeType !== undefined ? { income_type: body.incomeType ? String(body.incomeType) : null } : {}),
      ...(body.description !== undefined ? { description: body.description ? String(body.description) : null } : {}),
      ...(body.benefits !== undefined ? { benefits: body.benefits as Prisma.InputJsonValue } : {}),
      ...(body.weekPlanner !== undefined ? { week_planner: body.weekPlanner as Prisma.InputJsonValue } : {}),
      ...(body.isActive !== undefined ? { is_active: Boolean(body.isActive) } : {}),
    };

    return { data, branchSelection };
  }

  private listInclude() {
    return { branches: { select: { branch_id: true } } } as const;
  }

  async listActive(isSpecialOffer?: string) {
    const where: { is_active: boolean; is_special_offer?: boolean } = { is_active: true };
    if (isSpecialOffer === 'true' || isSpecialOffer === '1') where.is_special_offer = true;
    if (isSpecialOffer === 'false' || isSpecialOffer === '0') where.is_special_offer = false;
    const rows = await this.prisma.club_subscription_types.findMany({
      where,
      orderBy: { name: 'asc' },
      include: this.listInclude(),
    });
    return rows.map((r) => this.map(r));
  }

  async findOne(id: number) {
    const row = await this.prisma.club_subscription_types.findUnique({
      where: { id },
      include: this.listInclude(),
    });
    if (!row) throw new NotFoundException('نوع الاشتراك غير موجود');
    return this.map(row);
  }

  async create(body: Record<string, unknown>) {
    const { data, branchSelection } = this.buildData(body);
    const row = await this.prisma.club_subscription_types.create({
      data: {
        name: String(body.name),
        branch_id: branchSelection?.branchId ?? (body.branchId != null && body.branchId !== '' ? Number(body.branchId) : null),
        apply_to_all_branches: branchSelection?.applyToAllBranches ?? false,
        price: Number(body.price),
        days: Number(body.days),
        is_part_of_target: Boolean(body.isPartOfTarget),
        invitations_count:
          body.invitationsCount != null && body.invitationsCount !== '' ? Number(body.invitationsCount) : null,
        inbody_count: body.inbodyCount != null && body.inbodyCount !== '' ? Number(body.inbodyCount) : null,
        is_special_offer: Boolean(body.isSpecialOffer),
        is_for_students: Boolean(body.isForStudents),
        show_in_app: Boolean(body.showInApp),
        notify_customers: Boolean(body.notifyCustomers),
        notify_on_expiry: Boolean(body.notifyOnExpiry),
        wallet_points: body.walletPoints != null && body.walletPoints !== '' ? Number(body.walletPoints) : null,
        offer_validity: body.offerValidity ? String(body.offerValidity) : null,
        is_linked_to_sessions: Boolean(body.isLinkedToSessions),
        sessions_count: body.sessionsCount != null && body.sessionsCount !== '' ? Number(body.sessionsCount) : null,
        allow_multiple_daily_entries: Boolean(body.allowMultipleDailyEntries),
        is_linked_to_freeze: Boolean(body.isLinkedToFreeze),
        freeze_days: body.freezeDays != null && body.freezeDays !== '' ? Number(body.freezeDays) : null,
        includes_spa: Boolean(body.includesSpa),
        spa_count: body.spaCount != null && body.spaCount !== '' ? Number(body.spaCount) : null,
        name_ar: body.nameAr ? String(body.nameAr) : null,
        name_en: body.nameEn ? String(body.nameEn) : null,
        package_category: body.packageCategory ? String(body.packageCategory) : 'regular',
        package_type: body.packageType ? String(body.packageType) : null,
        duration_value: body.durationValue != null && body.durationValue !== '' ? Number(body.durationValue) : null,
        duration_type: body.durationType ? String(body.durationType) : 'days',
        valid_upgrade_duration: body.validUpgradeDuration != null && body.validUpgradeDuration !== '' ? Number(body.validUpgradeDuration) : null,
        attendance_count: body.attendanceCount != null && body.attendanceCount !== '' ? Number(body.attendanceCount) : null,
        min_price: body.minPrice != null && body.minPrice !== '' ? Number(body.minPrice) : null,
        min_freeze: body.minFreeze != null && body.minFreeze !== '' ? Number(body.minFreeze) : null,
        max_classes_per_day: body.maxClassesPerDay != null && body.maxClassesPerDay !== '' ? Number(body.maxClassesPerDay) : null,
        availability_from: body.availabilityFrom ? String(body.availabilityFrom) : null,
        availability_to: body.availabilityTo ? String(body.availabilityTo) : null,
        access_area_ids: Array.isArray(body.accessAreaIds) ? body.accessAreaIds as Prisma.InputJsonValue : [],
        income_type: body.incomeType ? String(body.incomeType) : null,
        description: body.description ? String(body.description) : null,
        benefits: body.benefits && typeof body.benefits === 'object' ? body.benefits as Prisma.InputJsonValue : {},
        week_planner: body.weekPlanner && typeof body.weekPlanner === 'object' ? body.weekPlanner as Prisma.InputJsonValue : {},
        is_active: body.isActive !== false,
      },
    });

    if (branchSelection) {
      await this.syncBranches(row.id, branchSelection.applyToAllBranches, branchSelection.branchIds);
    }

    return this.findOne(row.id);
  }

  async update(id: number, body: Record<string, unknown>) {
    await this.findOne(id);
    const { data, branchSelection } = this.buildData(body);
    await this.prisma.club_subscription_types.update({
      where: { id },
      data,
    });

    if (branchSelection) {
      await this.syncBranches(id, branchSelection.applyToAllBranches, branchSelection.branchIds);
    }

    return this.findOne(id);
  }

  async remove(id: number) {
    await this.findOne(id);
    await this.prisma.club_subscription_types.delete({ where: { id } });
    return { success: true };
  }
}
