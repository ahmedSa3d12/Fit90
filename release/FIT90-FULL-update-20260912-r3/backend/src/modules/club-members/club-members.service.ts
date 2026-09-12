import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../common/prisma/prisma.service';
import { paginated } from '../../common/dto/list-result';
import { assertDateOrder } from '../../common/validators';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { JwtUser } from '../../common/types/jwt-user';
import { buildDuplicateMessage, findMemberDuplicates } from './club-member-duplicates';
import { BusinessAuditService } from '../gym-ops/business-audit.service';
import { isMarketingRepJobTitle } from '../employees/marketing-rep.util';
import {
  computeSubscriptionStatus,
  formatMigMemberCode,
  getEmailValidationError,
  getNationalIdFormatError,
  getPhoneValidationError,
  localDateString,
  normalizeName,
  normalizeNationalIdForStorage,
  normalizePhoneForStorage,
  nextSeqFromMax,
} from './club-member.utils';
import { ListClubMembersDto } from './dto/list-club-members.dto';
import { UpsertClubMemberDto } from './dto/upsert-club-member.dto';

/** True when a P2002 unique violation came from a constraint/index whose name contains `needle`. */
function isUniqueTarget(e: Prisma.PrismaClientKnownRequestError, needle: string): boolean {
  const target = (e.meta as { target?: string | string[] } | undefined)?.target;
  const text = Array.isArray(target) ? target.join(',') : String(target ?? '');
  return text.toLowerCase().includes(needle.toLowerCase());
}

@Injectable()
export class ClubMembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: BusinessAuditService,
    private readonly branchScope: BranchScopeService,
  ) {}

  private mapMember(row: {
    id: number;
    member_code: string;
    name: string;
    phone: string | null;
    email: string | null;
    gender: string;
    card_number: string | null;
    date_of_birth: string | null;
    address: string | null;
    marital_status: string | null;
    job_title: string | null;
    profile_picture: string | null;
    branch_id: number;
    membership_type_id: number | null;
    start_date: string | null;
    end_date: string | null;
    notes: string | null;
    is_active: boolean;
    sales_id: number | null;
    employee_id: number | null;
    guardian_name: string | null;
    guardian_phone: string | null;
    trainer_id: number | null;
    source_id: number | null;
    emergency_name: string | null;
    emergency_phone: string | null;
    emergency_relation: string | null;
    created_by: number | null;
    app_user_id: number | null;
    created_at: Date;
    updated_at: Date;
    membership_type?: { id: number; name: string; price: Prisma.Decimal; duration_days: number } | null;
  }) {
    return {
      id: row.id,
      memberCode: row.member_code,
      name: row.name,
      phone: row.phone,
      email: row.email,
      gender: row.gender,
      cardNumber: row.card_number,
      dateOfBirth: row.date_of_birth,
      address: row.address,
      maritalStatus: row.marital_status,
      jobTitle: row.job_title,
      profilePicture: row.profile_picture,
      branchId: row.branch_id,
      membershipTypeId: row.membership_type_id,
      startDate: row.start_date,
      endDate: row.end_date,
      notes: row.notes,
      isActive: row.is_active,
      salesId: row.sales_id,
      employeeId: row.employee_id,
      createdBy: row.created_by,
      guardianName: row.guardian_name,
      guardianPhone: row.guardian_phone,
      trainerId: row.trainer_id,
      sourceId: row.source_id,
      emergencyName: row.emergency_name,
      emergencyPhone: row.emergency_phone,
      emergencyRelation: row.emergency_relation,
      appUserId: row.app_user_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      membershipType: row.membership_type
        ? {
            id: row.membership_type.id,
            name: row.membership_type.name,
            price: Number(row.membership_type.price),
            durationDays: row.membership_type.duration_days,
          }
        : null,
    };
  }

  async list(q: ListClubMembersDto, user?: JwtUser) {
    const and: Prisma.club_membersWhereInput[] = [{ is_deleted: false }];

    if (q.search?.trim()) {
      const s = q.search.trim();
      and.push({
        OR: [
          { name: { contains: s } },
          { member_code: { contains: s } },
          { phone: { contains: s } },
        ],
      });
    }
    if (q.branch && q.branch !== 'all') and.push({ branch_id: Number(q.branch) });
    // Default a branch-scoped user to their allowed branches when they omit/broaden the branch param.
    // Added as a separate AND clause so it INTERSECTS any explicit branch filter above (never replaces it).
    const scope = this.branchScope.resolveListFilter(user, q.branch ?? null);
    if (scope !== null) and.push({ branch_id: { in: scope } });
    if (q.status === 'active') and.push({ is_active: true });
    if (q.status === 'inactive') and.push({ is_active: false });
    if (q.gender && q.gender !== 'all') and.push({ gender: q.gender as 'male' | 'female' });
    // Sales reps only see their own registrations on the members list — not in pickers.
    if (!q.forSelect && user && (await this.isSalesEmployee(user.emp_code))) {
      and.push({ created_by: user.sub });
    }
    if (q.createdFrom || q.createdTo) {
      const range: { gte?: Date; lte?: Date } = {};
      if (q.createdFrom) range.gte = new Date(`${q.createdFrom}T00:00:00`);
      if (q.createdTo) range.lte = new Date(`${q.createdTo}T23:59:59.999`);
      and.push({ created_at: range });
    }

    const where: Prisma.club_membersWhereInput = { AND: and };

    const [rows, total] = await Promise.all([
      this.prisma.club_members.findMany({
        where,
        include: { membership_type: { select: { id: true, name: true, price: true, duration_days: true } } },
        orderBy: q.forSelect ? { name: 'asc' } : { id: 'desc' },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.club_members.count({ where }),
    ]);

    return paginated(rows.map((r) => this.mapMember(r)), total, q.page, q.pageSize);
  }

  async statistics() {
    const total = await this.prisma.club_members.count({ where: { is_deleted: false } });

    const today = localDateString();
    const activeSubs = await this.prisma.club_subscriptions.findMany({
      where: {
        member_id: { not: null },
        member: { is_deleted: false },
        OR: [{ status: 'active' }, { subscription_end_date: { gte: today } }],
      },
      select: { member_id: true },
      distinct: ['member_id'],
    });
    const active = activeSubs.length;

    return { total, active, inactive: total - active };
  }

  async checkDuplicates(query: {
    phone?: string;
    cardNumber?: string;
    excludeMemberId?: number;
  }) {
    const duplicates = await findMemberDuplicates(this.prisma, {
      phone: query.phone,
      cardNumber: query.cardNumber,
      excludeMemberId: query.excludeMemberId,
    });
    return {
      hasDuplicates: duplicates.length > 0,
      duplicates,
      message: duplicates.length ? buildDuplicateMessage(duplicates) : null,
    };
  }

  async findPotentialLeadByPhone(phone?: string) {
    if (!phone || getPhoneValidationError(phone)) return null;
    const normalizedPhone = normalizePhoneForStorage(phone);
    const lead = await this.prisma.club_leads.findFirst({
      where: { phone: normalizedPhone, status: { not: 'converted' }, is_deleted: false },
      orderBy: { updated_at: 'desc' },
    });
    if (!lead) return null;
    return {
      id: lead.id,
      name: lead.name,
      phone: lead.phone,
      email: lead.email,
      gender: lead.gender,
      branchId: lead.branch_id,
      sourceId: lead.source_id,
      assignedTo: lead.assigned_to,
      notes: lead.notes,
    };
  }

  async createFromPotentialLead(leadId: number, dto: UpsertClubMemberDto, user: JwtUser) {
    const memberPhone = normalizePhoneForStorage(dto.phone);
    return this.create(dto, user, async (tx) => {
      const lead = await tx.club_leads.findFirst({
        where: { id: leadId, status: { not: 'converted' }, is_deleted: false },
      });
      if (!lead) throw new ConflictException('العضو المحتمل لم يعد متاحًا للتحويل');
      if (normalizePhoneForStorage(lead.phone ?? '') !== memberPhone) {
        throw new BadRequestException('رقم الهاتف لا يطابق العضو المحتمل');
      }
      await tx.club_leads.update({ where: { id: leadId }, data: { status: 'converted' } });
    });
  }

  async nextCode(): Promise<{ memberCode: string }> {
    const code = await this.generateMemberCode();
    return { memberCode: code };
  }

  /**
   * Generate the next global MIG member code (e.g. MIG-22263 after MIG-22262).
   * Uses a MySQL advisory lock to serialize concurrent code generation.
   */
  private async generateMemberCode(): Promise<string> {
    return this.prisma.$transaction((tx) =>
      this.withMemberCodeLock(tx, () => this.generateMemberCodeInTx(tx)),
    );
  }

  private async generateMemberCodeInTx(tx: Prisma.TransactionClient): Promise<string> {
    const pattern = '^MIG-[0-9]+$';
    const startPos = 5;
    const rows = await tx.$queryRaw<{ maxNum: unknown }[]>`
      SELECT MAX(CAST(SUBSTRING(member_code, ${startPos}) AS UNSIGNED)) AS maxNum
      FROM club_members
      WHERE member_code REGEXP ${pattern}
    `;
    return formatMigMemberCode(nextSeqFromMax(rows[0]?.maxNum));
  }

  private async withMemberCodeLock<T>(
    tx: Prisma.TransactionClient,
    work: () => Promise<T>,
  ): Promise<T> {
    await tx.$queryRaw`SELECT GET_LOCK('club_member_code', 10)`;
    try {
      return await work();
    } finally {
      await tx.$queryRaw`SELECT RELEASE_LOCK('club_member_code')`;
    }
  }

  /** App login password mirrors the member phone (digits only). */
  private appPasswordFromPhone(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    return digits || phone;
  }

  /** Mobile app login for gym members — stored in api_users, not HR users. */
  private async provisionAppUser(
    tx: Prisma.TransactionClient,
    dto: UpsertClubMemberDto,
  ): Promise<{ username: string; plaintextPassword: string; appUserId: number } | null> {
    const phone = normalizePhoneForStorage(dto.phone ?? '');
    if (!phone) return null;

    const plaintextPassword = this.appPasswordFromPhone(phone);
    const existing = await tx.api_users.findFirst({ where: { user_phone: phone } });
    if (existing) {
      const otherMember = await tx.club_members.findFirst({
        where: { app_user_id: existing.user_id, is_deleted: false },
      });
      if (otherMember) {
        throw new ConflictException('رقم الجوال مُستخدم لحساب تطبيق عضو آخر');
      }
      return { username: phone, plaintextPassword, appUserId: existing.user_id };
    }

    const appUser = await tx.api_users.create({
      data: {
        user_name: normalizeName(dto.name),
        user_phone: phone,
        user_email: dto.email?.trim() || null,
        user_pass: await bcrypt.hash(plaintextPassword, 12),
        status: 1,
      },
      select: { user_id: true },
    });

    return { username: phone, plaintextPassword, appUserId: appUser.user_id };
  }

  async findOne(id: number, user?: JwtUser) {
    const row = await this.prisma.club_members.findFirst({
      where: { id, is_deleted: false },
      include: { membership_type: { select: { id: true, name: true, price: true, duration_days: true } } },
    });
    if (!row) throw new NotFoundException('العضو غير موجود');
    // Branch isolation: a scoped user may only read members in their branch.
    if (row.branch_id != null && !this.branchScope.isBranchAllowed(user, row.branch_id)) {
      throw new NotFoundException('العضو غير موجود');
    }
    return this.mapMember(row);
  }

  async financialHistory(id: number, dateFrom?: string, dateTo?: string, user?: JwtUser) {
    const member = await this.findOne(id, user);

    const subWhere: { member_id: number; registration_date?: { gte?: string; lte?: string } } = {
      member_id: id,
    };
    if (dateFrom && dateTo) subWhere.registration_date = { gte: dateFrom, lte: dateTo };

    const receiptWhere: { member_id: number; receipt_date?: { gte?: string; lte?: string } } = {
      member_id: id,
    };
    if (dateFrom && dateTo) receiptWhere.receipt_date = { gte: dateFrom, lte: dateTo };

    const [subs, receipts] = await Promise.all([
      this.prisma.club_subscriptions.findMany({ where: subWhere, orderBy: { registration_date: 'desc' } }),
      this.prisma.club_receipts.findMany({ where: receiptWhere, orderBy: { receipt_date: 'desc' } }),
    ]);

    const subscriptions = subs.map((s) => {
      const net = Number(s.subscription_value) - (s.discount_enabled ? Number(s.discount_value) : 0);
      return {
        id: s.id,
        subscriptionNumber: s.subscription_number,
        registrationDate: s.registration_date,
        subscriptionType: s.subscription_type,
        subscriptionStartDate: s.subscription_start_date,
        subscriptionEndDate: s.subscription_end_date,
        subscriptionValue: Number(s.subscription_value),
        netValue: net,
        paidAmount: Number(s.paid_amount),
        remainingAmount: Number(s.remaining_amount),
        status: computeSubscriptionStatus(s.subscription_start_date, s.subscription_end_date),
      };
    });

    const receiptRows = receipts.map((r) => ({
      id: r.id,
      receiptNumber: r.receipt_number,
      amount: Number(r.amount),
      receiptDate: r.receipt_date,
      type: r.type,
      status: r.status,
      description: r.description,
    }));

    const timeline = [
      ...subscriptions.map((s) => ({
        kind: 'subscription' as const,
        sortDate: s.registrationDate,
        data: s,
      })),
      ...receiptRows.map((r) => ({
        kind: 'receipt' as const,
        sortDate: r.receiptDate,
        data: r,
      })),
    ].sort((a, b) => b.sortDate.localeCompare(a.sortDate));

    const summary = {
      totalSubscriptions: subscriptions.length,
      totalSubscriptionValue: subscriptions.reduce((s, x) => s + x.netValue, 0),
      totalPaidOnSubscriptions: subscriptions.reduce((s, x) => s + x.paidAmount, 0),
      totalRemaining: subscriptions.reduce((s, x) => s + x.remainingAmount, 0),
      totalReceipts: receiptRows.length,
      totalReceiptAmount: receiptRows.reduce((s, x) => s + x.amount, 0),
    };

    return { member, subscriptions, receipts: receiptRows, timeline, summary, dateFrom: dateFrom ?? null, dateTo: dateTo ?? null };
  }

  private async validateMemberInput(dto: UpsertClubMemberDto, existingCard?: string | null) {
    if (!dto.branchId) throw new BadRequestException('الفرع مطلوب');
    if (!dto.name?.trim()) throw new BadRequestException('اسم العضو مطلوب');

    const card = dto.cardNumber ?? existingCard;
    if (card?.trim()) {
      const cardErr = getNationalIdFormatError(card);
      if (cardErr) throw new BadRequestException(cardErr);
    }

    if (dto.phone) {
      const phoneErr = getPhoneValidationError(dto.phone);
      if (phoneErr) throw new BadRequestException(phoneErr);
    }

    const emailErr = getEmailValidationError(dto.email);
    if (emailErr) throw new BadRequestException(emailErr);

    if (dto.startDate && dto.endDate) {
      assertDateOrder(dto.startDate, dto.endDate);
    }
  }

  async create(
    dto: UpsertClubMemberDto,
    user: JwtUser,
    afterCreate?: (tx: Prisma.TransactionClient, member: { id: number }) => Promise<void>,
  ) {
    const userId = user.sub;
    if (user.branch && user.branch > 0) {
      dto.branchId = user.branch;
    }
    await this.validateMemberInput(dto);

    const duplicates = await findMemberDuplicates(this.prisma, {
      phone: dto.phone,
      cardNumber: dto.cardNumber,
    });
    if (duplicates.length) {
      throw new ConflictException({
        message: buildDuplicateMessage(duplicates),
        duplicates,
      });
    }

    const branch = await this.prisma.tbl_branches.findUnique({ where: { branch_id: dto.branchId } });
    if (!branch) throw new BadRequestException('الفرع المحدد غير موجود');

    if (dto.membershipTypeId) {
      const mt = await this.prisma.club_membership_types.findUnique({ where: { id: dto.membershipTypeId } });
      if (!mt) throw new BadRequestException('نوع العضوية المحدد غير موجود');
    }

    if (dto.salesId) {
      const salesRep = await this.prisma.employees.findUnique({
        where: { id: dto.salesId },
        select: { id: true },
      });
      if (!salesRep) throw new BadRequestException('أخصائي المبيعات المحدد غير موجود');
    }

    const registeringEmployeeId = user.emp_code && user.emp_code > 0 ? user.emp_code : null;

    const isChild = dto.cardNumber?.toUpperCase().includes('-C');
    const shouldCreateUser = dto.autoCreateUser !== false && !isChild && normalizePhoneForStorage(dto.phone ?? '').length > 0;

    const result = await this.prisma.$transaction(async (tx) => {
      const row = await this.withMemberCodeLock(tx, async () => {
        const memberCode = await this.generateMemberCodeInTx(tx);
        const data: Prisma.club_membersUncheckedCreateInput = {
          member_code: memberCode,
          name: normalizeName(dto.name),
          phone: normalizePhoneForStorage(dto.phone),
          email: dto.email?.trim() || null,
          gender: dto.gender,
          card_number: dto.cardNumber?.trim() ? normalizeNationalIdForStorage(dto.cardNumber) : null,
          date_of_birth: dto.dateOfBirth || null,
          address: dto.address || null,
          marital_status: dto.maritalStatus || null,
          job_title: dto.jobTitle || null,
          profile_picture: dto.profilePicture || null,
          branch_id: dto.branchId,
          membership_type_id: dto.membershipTypeId ?? null,
          start_date: dto.startDate || null,
          end_date: dto.endDate || null,
          notes: dto.notes || null,
          is_active: dto.isActive ?? true,
          sales_id: dto.salesId ?? null,
          employee_id: registeringEmployeeId,
          guardian_name: dto.guardianName?.trim() || null,
          guardian_phone: dto.guardianPhone?.trim() || null,
          trainer_id: dto.trainerId ?? null,
          source_id: dto.sourceId ?? null,
          emergency_name: dto.emergencyName?.trim() || null,
          emergency_phone: dto.emergencyPhone?.trim() || null,
          emergency_relation: dto.emergencyRelation?.trim() || null,
          created_by: userId,
        };
        return tx.club_members.create({
          data,
          include: { membership_type: { select: { id: true, name: true, price: true, duration_days: true } } },
        });
      });

      let credentials: { username: string; plaintextPassword: string; appUserId: number } | null = null;
      let member = row;
      if (shouldCreateUser) {
        credentials = await this.provisionAppUser(tx, dto);
        if (credentials) {
          member = await tx.club_members.update({
            where: { id: row.id },
            data: { app_user_id: credentials.appUserId },
            include: { membership_type: { select: { id: true, name: true, price: true, duration_days: true } } },
          });
        }
      }
      await afterCreate?.(tx, member);
      return { row: member, credentials };
    }, { maxWait: 10000, timeout: 15000 });

    await this.audit.log({
      entityType: 'club_member',
      entityId: result.row.id,
      action: 'create',
      actorUserId: userId,
      branchId: result.row.branch_id,
      after: { memberCode: result.row.member_code, name: result.row.name, phone: result.row.phone },
    });

    const member = this.mapMember(result.row);
    return {
      member,
      generatedCredentials: result.credentials
        ? { username: result.credentials.username, password: result.credentials.plaintextPassword }
        : null,
    };
  }

  async update(id: number, dto: Partial<UpsertClubMemberDto>) {
    const existing = await this.prisma.club_members.findFirst({ where: { id, is_deleted: false } });
    if (!existing) throw new NotFoundException('العضو غير موجود');

    const cardNumber = dto.cardNumber ?? existing.card_number ?? undefined;
    await this.validateMemberInput(
      {
        branchId: dto.branchId ?? existing.branch_id,
        name: dto.name ?? existing.name,
        phone: dto.phone ?? existing.phone ?? '',
        gender: (dto.gender ?? existing.gender) as 'male' | 'female',
        cardNumber: cardNumber ?? '',
        startDate: dto.startDate ?? existing.start_date ?? undefined,
        endDate: dto.endDate ?? existing.end_date ?? undefined,
      },
      existing.card_number,
    );

    const duplicates = await findMemberDuplicates(this.prisma, {
      phone: dto.phone ?? existing.phone ?? undefined,
      cardNumber: cardNumber,
      excludeMemberId: id,
    });
    if (duplicates.length) {
      throw new ConflictException({
        message: buildDuplicateMessage(duplicates, true),
        duplicates,
      });
    }

    let row;
    try {
      row = await this.prisma.club_members.update({
      where: { id },
      data: {
        ...(dto.name != null ? { name: normalizeName(dto.name) } : {}),
        ...(dto.phone != null ? { phone: normalizePhoneForStorage(dto.phone) } : {}),
        ...(dto.email !== undefined ? { email: dto.email?.trim() || null } : {}),
        ...(dto.gender != null ? { gender: dto.gender } : {}),
        ...(cardNumber != null ? { card_number: normalizeNationalIdForStorage(cardNumber) } : {}),
        ...(dto.dateOfBirth !== undefined ? { date_of_birth: dto.dateOfBirth || null } : {}),
        ...(dto.address !== undefined ? { address: dto.address || null } : {}),
        ...(dto.maritalStatus !== undefined ? { marital_status: dto.maritalStatus || null } : {}),
        ...(dto.jobTitle !== undefined ? { job_title: dto.jobTitle || null } : {}),
        ...(dto.profilePicture !== undefined ? { profile_picture: dto.profilePicture || null } : {}),
        ...(dto.branchId != null ? { branch_id: dto.branchId } : {}),
        ...(dto.membershipTypeId !== undefined ? { membership_type_id: dto.membershipTypeId ?? null } : {}),
        ...(dto.startDate !== undefined ? { start_date: dto.startDate || null } : {}),
        ...(dto.endDate !== undefined ? { end_date: dto.endDate || null } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes || null } : {}),
        ...(dto.isActive !== undefined ? { is_active: dto.isActive } : {}),
        ...(dto.salesId !== undefined ? { sales_id: dto.salesId ?? null } : {}),
        ...(dto.employeeId !== undefined ? { employee_id: dto.employeeId ?? null } : {}),
        ...(dto.guardianName !== undefined ? { guardian_name: dto.guardianName?.trim() || null } : {}),
        ...(dto.guardianPhone !== undefined ? { guardian_phone: dto.guardianPhone?.trim() || null } : {}),
        ...(dto.trainerId !== undefined ? { trainer_id: dto.trainerId ?? null } : {}),
        ...(dto.sourceId !== undefined ? { source_id: dto.sourceId ?? null } : {}),
        ...(dto.emergencyName !== undefined ? { emergency_name: dto.emergencyName?.trim() || null } : {}),
        ...(dto.emergencyPhone !== undefined ? { emergency_phone: dto.emergencyPhone?.trim() || null } : {}),
        ...(dto.emergencyRelation !== undefined ? { emergency_relation: dto.emergencyRelation?.trim() || null } : {}),
      },
      include: { membership_type: { select: { id: true, name: true, price: true, duration_days: true } } },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002' && isUniqueTarget(e, 'phone')) {
        throw new ConflictException({
          message: 'رقم الهاتف مستخدم بالفعل من قبل عضو آخر',
          duplicates: [{ field: 'phone', fieldLabel: 'رقم الهاتف' }],
        });
      }
      throw e;
    }

    await this.audit.log({
      entityType: 'club_member',
      entityId: id,
      action: 'update',
      branchId: row.branch_id,
      before: {
        name: existing.name,
        phone: existing.phone,
        branchId: existing.branch_id,
        isActive: existing.is_active,
      },
      after: {
        name: row.name,
        phone: row.phone,
        branchId: row.branch_id,
        isActive: row.is_active,
      },
    });

    return this.mapMember(row);
  }

  async remove(id: number) {
    const existing = await this.prisma.club_members.findFirst({ where: { id, is_deleted: false } });
    if (!existing) throw new NotFoundException('العضو غير موجود');
    await this.prisma.club_members.update({ where: { id }, data: { is_deleted: true } });
    return { success: true };
  }

  /** Resolve member by id or code for attendance check-in. */
  async resolveByIdOrCode(memberId?: number, memberCode?: string) {
    if (memberId) {
      const m = await this.prisma.club_members.findFirst({ where: { id: memberId, is_deleted: false } });
      if (!m) throw new NotFoundException('العضو غير موجود');
      return m;
    }
    if (memberCode?.trim()) {
      const m = await this.prisma.club_members.findFirst({
        where: { member_code: memberCode.trim(), is_deleted: false },
      });
      if (!m) throw new NotFoundException('العضو غير موجود');
      return m;
    }
    throw new BadRequestException('كود العضو مطلوب');
  }

  private async isSalesEmployee(userEmpId: number | null): Promise<boolean> {
    if (!userEmpId) return false;
    const emp = await this.prisma.employees.findUnique({
      where: { id: userEmpId },
      select: { mosma_wazefy_code: true, mosma_wazefy_n: true },
    });
    if (!emp) return false;
    if (isMarketingRepJobTitle(emp.mosma_wazefy_n)) return true;
    if (emp.mosma_wazefy_code) {
      const job = await this.prisma.department_jobs.findUnique({
        where: { id: emp.mosma_wazefy_code },
        select: { name: true },
      });
      if (isMarketingRepJobTitle(job?.name)) return true;
    }
    return false;
  }
}
