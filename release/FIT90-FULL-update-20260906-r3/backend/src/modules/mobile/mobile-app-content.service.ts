import { BadRequestException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ClubContentType, ClubTicketType } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ChangeCustomerPasswordDto, CreateMobileFeedbackDto, CreateMobileInvitationDto, CreateMobileTicketDto, DeleteCustomerAccountDto, MobileCustomerLoginDto } from './dto/mobile-app-content.dto';
import { UploadsService } from '../uploads/uploads.service';

@Injectable()
export class MobileAppContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly uploads: UploadsService,
  ) {}

  async login(dto: MobileCustomerLoginDto) {
    const phone = dto.phone.trim();
    const account = await this.prisma.api_users.findFirst({ where: { user_phone: phone, status: 1 } });
    const valid = account?.user_pass ? await bcrypt.compare(dto.password, account.user_pass) : false;
    if (!account || !valid) throw new UnauthorizedException('رقم الهاتف أو كلمة المرور غير صحيحة');

    const member = await this.prisma.club_members.findFirst({
      where: { app_user_id: account.user_id, is_deleted: false, is_active: true },
      select: { id: true },
    });
    if (!member) throw new UnauthorizedException('لا توجد عضوية نشطة مرتبطة بهذا الحساب');

    const accessToken = await this.jwt.signAsync(
      { sub: account.user_id, actorType: 'customer', memberId: member.id },
      {
        secret: this.config.get<string>('jwt.refreshSecret'),
        expiresIn: this.config.get<string>('jwt.accessTtl') ?? '2h',
      },
    );
    return { accessToken, tokenType: 'Bearer', expiresIn: this.config.get<string>('jwt.accessTtl') ?? '2h' };
  }

  async profile(appUserId: number, memberId: number) {
    const [account, member] = await Promise.all([
      this.prisma.api_users.findFirst({ where: { user_id: appUserId, status: 1 }, select: { user_id: true } }),
      this.prisma.club_members.findFirst({
      where: { id: memberId, app_user_id: appUserId, is_deleted: false, is_active: true },
      include: {
        membership_type: { select: { id: true, name: true, price: true, duration_days: true } },
        subscriptions: {
          orderBy: { id: 'desc' },
          take: 1,
          include: { type: { select: { id: true, name: true, days: true } } },
        },
      },
      }),
    ]);
    if (!account || !member) throw new NotFoundException('العميل غير موجود أو الحساب غير نشط');
    const subscription = member.subscriptions[0] ?? null;
    return {
      id: member.id,
      memberCode: member.member_code,
      name: member.name,
      phone: member.phone,
      email: member.email,
      gender: member.gender,
      cardNumber: member.card_number,
      dateOfBirth: member.date_of_birth,
      address: member.address,
      profilePicture: member.profile_picture,
      branchId: member.branch_id,
      trainerId: member.trainer_id,
      salesStaffId: member.sales_staff_id,
      sourceId: member.source_id,
      emergencyContact: {
        name: member.emergency_name,
        phone: member.emergency_phone,
        relation: member.emergency_relation,
      },
      maritalStatus: member.marital_status,
      jobTitle: member.job_title,
      guardian: { name: member.guardian_name, phone: member.guardian_phone },
      employeeId: member.employee_id,
      salesId: member.sales_id,
      membershipType: member.membership_type
        ? { ...member.membership_type, price: Number(member.membership_type.price) }
        : null,
      membershipStartDate: member.start_date,
      membershipEndDate: member.end_date,
      active: member.is_active,
      createdAt: member.created_at,
      updatedAt: member.updated_at,
      subscription: subscription
        ? {
            id: subscription.id,
            number: subscription.subscription_number,
            type: subscription.type?.name ?? subscription.subscription_type,
            startDate: subscription.subscription_start_date,
            endDate: subscription.subscription_end_date,
            status: subscription.status,
            value: Number(subscription.subscription_value),
            paidAmount: Number(subscription.paid_amount),
            remainingAmount: Number(subscription.remaining_amount),
            sessionsCount: subscription.sessions_count,
            sessionsUsed: subscription.sessions_used,
          }
        : null,
    };
  }

  async updateProfilePicture(appUserId: number, memberId: number, file: Express.Multer.File) {
    const member = await this.findActiveCustomer(appUserId, memberId);
    const uploaded = this.uploads.store('club-member', file);
    await this.prisma.$transaction([
      this.prisma.club_members.update({
        where: { id: member.id },
        data: { profile_picture: uploaded.path },
      }),
      this.prisma.api_users.update({
        where: { user_id: appUserId },
        data: { m_image: uploaded.path },
      }),
    ]);
    return { success: true, profilePicture: uploaded.path, url: uploaded.url };
  }

  async changePassword(appUserId: number, memberId: number, dto: ChangeCustomerPasswordDto) {
    await this.findActiveCustomer(appUserId, memberId);
    const account = await this.prisma.api_users.findFirst({
      where: { user_id: appUserId, status: 1 },
    });
    const valid = account?.user_pass
      ? await bcrypt.compare(dto.currentPassword, account.user_pass)
      : false;
    if (!account || !valid) throw new BadRequestException('كلمة المرور الحالية غير صحيحة');
    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException('كلمة المرور الجديدة يجب أن تختلف عن الحالية');
    }
    const rounds = this.config.get<number>('bcryptRounds') ?? 12;
    await this.prisma.api_users.update({
      where: { user_id: appUserId },
      data: { user_pass: await bcrypt.hash(dto.newPassword, rounds) },
    });
    return { success: true, message: 'تم تغيير كلمة المرور بنجاح' };
  }

  async deleteAccount(appUserId: number, memberId: number, dto: DeleteCustomerAccountDto) {
    await this.findActiveCustomer(appUserId, memberId);
    const account = await this.prisma.api_users.findFirst({
      where: { user_id: appUserId, status: 1 },
    });
    const valid = account?.user_pass
      ? await bcrypt.compare(dto.password, account.user_pass)
      : false;
    if (!account || !valid) throw new BadRequestException('كلمة المرور غير صحيحة');

    await this.prisma.$transaction([
      this.prisma.club_members.update({
        where: { id: memberId },
        data: { app_user_id: null },
      }),
      this.prisma.api_users.update({
        where: { user_id: appUserId },
        data: {
          status: 0,
          user_name: `deleted-${appUserId}`,
          user_phone: null,
          user_email: null,
          user_city: null,
          user_pass: null,
          rand_key: null,
          m_image: null,
        },
      }),
    ]);
    return { success: true, message: 'تم حذف حساب التطبيق بنجاح' };
  }

  /** InBody history and the latest nutrition plan for the signed-in customer only. */
  async inbodyMeasurements(appUserId: number, memberId: number) {
    const member = await this.findActiveCustomer(appUserId, memberId);
    const rows = await this.prisma.club_inbody_measurements.findMany({
      where: { member_id: member.id },
      orderBy: [{ measurement_date: 'desc' }, { id: 'desc' }],
    });
    const measurements = rows.map((row) => this.inbodyMeasurementView(row));
    const latestPlanRow = rows.find((row) => row.nutrition_plan != null) ?? null;

    return {
      member: { id: member.id, memberCode: member.member_code, name: member.name },
      count: measurements.length,
      latestMeasurement: measurements[0] ?? null,
      nutritionPlan: latestPlanRow
        ? {
            measurementId: latestPlanRow.id,
            measurementDate: latestPlanRow.measurement_date,
            plan: this.nutritionPlanView(latestPlanRow.nutrition_plan),
          }
        : null,
      measurements,
    };
  }

  /** One InBody record; ownership is checked against the member id in the customer token. */
  async inbodyMeasurement(appUserId: number, memberId: number, id: number) {
    const member = await this.findActiveCustomer(appUserId, memberId);
    const row = await this.prisma.club_inbody_measurements.findFirst({
      where: { id, member_id: member.id },
    });
    if (!row) throw new NotFoundException('قياس InBody غير موجود');
    return this.inbodyMeasurementView(row);
  }

  private async findActiveCustomer(appUserId: number, memberId: number) {
    const member = await this.prisma.club_members.findFirst({
      where: { id: memberId, app_user_id: appUserId, is_deleted: false, is_active: true },
      select: { id: true, member_code: true, name: true, branch_id: true },
    });
    if (!member) throw new NotFoundException('العميل غير موجود أو الحساب غير نشط');
    return member;
  }

  private inbodyMeasurementView(row: {
    id: number;
    measurement_date: string;
    weight: { toString(): string } | null;
    body_fat: { toString(): string } | null;
    muscle_mass: { toString(): string } | null;
    bmi: { toString(): string } | null;
    staff_name: string | null;
    file_url: string | null;
    notes: string | null;
    nutrition_plan: unknown;
    created_at: Date;
    updated_at: Date;
  }) {
    const numberOrNull = (value: { toString(): string } | null) => value == null ? null : Number(value.toString());
    return {
      id: row.id,
      measurementDate: row.measurement_date,
      weight: numberOrNull(row.weight),
      bodyFat: numberOrNull(row.body_fat),
      muscleMass: numberOrNull(row.muscle_mass),
      bmi: numberOrNull(row.bmi),
      staffName: row.staff_name,
      fileUrl: row.file_url,
      notes: row.notes,
      nutritionPlan: this.nutritionPlanView(row.nutrition_plan),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /** Stable mobile shape for the form data plus its optional uploaded file. */
  private nutritionPlanView(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    const plan = value as Record<string, unknown>;
    const storedPath = typeof plan.fileUrl === 'string' && plan.fileUrl.trim()
      ? plan.fileUrl.trim()
      : null;
    return {
      ...plan,
      fileUrl: storedPath,
      file: storedPath
        ? {
            path: storedPath,
            url: this.publicUploadUrl(storedPath),
            fileName: this.uploadFileName(storedPath),
            contentType: this.uploadContentType(storedPath),
          }
        : null,
    };
  }

  private publicUploadUrl(path: string) {
    if (/^https?:\/\//i.test(path) || path.startsWith('/uploads/')) return path;
    const base = this.config.get<string>('publicUploadBase') ?? '/uploads';
    return `${base.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
  }

  private uploadFileName(path: string) {
    const cleanPath = path.split(/[?#]/, 1)[0];
    return decodeURIComponent(cleanPath.split('/').pop() || 'nutrition-file');
  }

  private uploadContentType(path: string) {
    const extension = path.split(/[?#]/, 1)[0].split('.').pop()?.toLowerCase();
    const types: Record<string, string> = {
      pdf: 'application/pdf',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
      gif: 'image/gif',
    };
    return extension ? types[extension] ?? 'application/octet-stream' : 'application/octet-stream';
  }

  async listContent(type: MobileContentRoute) {
    const contentType = this.contentType(type);
    const rows = await this.prisma.club_content_items.findMany({
      where: { content_type: contentType, is_active: true, is_deleted: false },
      orderBy: [{ sort_order: 'asc' }, { id: 'desc' }],
    });
    return { data: rows.map((row) => this.contentView(row)) };
  }

  async getContent(type: MobileContentRoute, id: number) {
    const row = await this.prisma.club_content_items.findFirst({
      where: {
        id,
        content_type: this.contentType(type),
        is_active: true,
        is_deleted: false,
      },
    });
    if (!row) throw new NotFoundException('Content item not found');
    return this.contentView(row);
  }

  async termsAndConditions() {
    const rows = await this.activeContentRows(ClubContentType.gym_rule);
    const data = rows
      .filter((row) => (
        this.documentType(row.metadata) !== 'privacy_policy'
        && !/privacy|خصوص/i.test(row.title)
      ))
      .map((row) => this.contentView(row));
    return { data, updatedAt: data[0]?.updatedAt ?? null };
  }

  async privacyPolicy() {
    const rows = await this.activeContentRows(ClubContentType.gym_rule);
    const row = rows.find((item) => {
      const documentType = this.documentType(item.metadata);
      return documentType === 'privacy_policy' || /privacy|خصوص/i.test(item.title);
    });
    return {
      data: row ? this.contentView(row) : null,
      updatedAt: row?.updated_at ?? null,
    };
  }

  async about() {
    const rows = await this.prisma.club_content_items.findMany({
      where: {
        content_type: ClubContentType.app_home_section,
        metadata: { path: '$.documentType', equals: 'about_app' },
        is_active: true,
        is_deleted: false,
      },
      orderBy: [{ sort_order: 'asc' }, { id: 'desc' }],
    });
    const data = rows.map((row) => this.contentView(row));
    return { data, updatedAt: data[0]?.updatedAt ?? null };
  }

  async trainers(rawBranchId?: string) {
    const branchId = rawBranchId == null || rawBranchId === ''
      ? null
      : Number.parseInt(rawBranchId, 10);
    if (branchId != null && (!Number.isInteger(branchId) || branchId < 1)) {
      throw new BadRequestException('branchId غير صحيح');
    }

    const directory = await this.prisma.club_trainers.findMany({
      where: { is_active: true, is_deleted: false },
      orderBy: { name: 'asc' },
    });
    const employeeIds = directory
      .map((trainer) => trainer.employee_id)
      .filter((id): id is number => id != null);
    const employees = employeeIds.length
      ? await this.prisma.employees.findMany({
          where: {
            id: { in: employeeIds },
            employee_type: 1,
            OR: [{ leave_emp: null }, { leave_emp: 0 }],
          },
          select: {
            id: true,
            employee: true,
            mosma_wazefy_n: true,
            branch_id_fk: true,
            personal_photo: true,
          },
        })
      : [];
    const employeeById = new Map(employees.map((employee) => [employee.id, employee]));
    const data = directory
      .map((trainer) => {
        const employee = trainer.employee_id != null
          ? employeeById.get(trainer.employee_id)
          : null;
        const jobTitle = employee?.mosma_wazefy_n ?? trainer.specialization;
        return { trainer, employee, jobTitle };
      })
      .filter(({ jobTitle, employee }) => (
        this.isMobileTrainerTitle(jobTitle)
        && (branchId == null || employee?.branch_id_fk === branchId)
      ))
      .map(({ trainer, employee, jobTitle }) => ({
        id: trainer.id,
        employeeId: trainer.employee_id,
        name: trainer.name || employee?.employee || '',
        jobTitle,
        specialization: trainer.specialization,
        experience: trainer.experience,
        bio: trainer.bio,
        imageUrl: trainer.image_url ?? employee?.personal_photo ?? null,
        rating: Number(trainer.rating_avg),
        branchId: employee?.branch_id_fk ?? null,
      }));
    return { data, count: data.length };
  }

  async subscriptionTypes(rawBranchId?: string) {
    const branchId = this.parseOptionalPositiveInt(rawBranchId, 'branchId');
    const rows = await this.prisma.club_subscription_types.findMany({
      where: this.mobileSubscriptionTypeWhere(branchId),
      include: { branches: { select: { branch_id: true } } },
      orderBy: [
        { is_special_offer: 'desc' },
        { price: 'asc' },
        { id: 'desc' },
      ],
    });
    return {
      data: rows.map((row) => this.subscriptionTypeView(row, false)),
      count: rows.length,
    };
  }

  async subscriptionType(id: number, rawBranchId?: string) {
    const branchId = this.parseOptionalPositiveInt(rawBranchId, 'branchId');
    const row = await this.prisma.club_subscription_types.findFirst({
      where: {
        id,
        ...this.mobileSubscriptionTypeWhere(branchId),
      },
      include: { branches: { select: { branch_id: true } } },
    });
    if (!row) throw new NotFoundException('نوع الاشتراك غير موجود أو غير متاح في التطبيق');
    return this.subscriptionTypeView(row, true);
  }

  async points(appUserId: number, memberId: number) {
    const member = await this.findActiveCustomer(appUserId, memberId);
    const [balance, earned, redeemed] = await Promise.all([
      this.prisma.club_member_points_transactions.aggregate({
        where: { member_id: member.id },
        _sum: { points: true },
      }),
      this.prisma.club_member_points_transactions.aggregate({
        where: { member_id: member.id, points: { gt: 0 } },
        _sum: { points: true },
      }),
      this.prisma.club_member_points_transactions.aggregate({
        where: { member_id: member.id, points: { lt: 0 } },
        _sum: { points: true },
      }),
    ]);
    return {
      memberId: member.id,
      balance: balance._sum.points ?? 0,
      totalEarned: earned._sum.points ?? 0,
      totalRedeemed: Math.abs(redeemed._sum.points ?? 0),
    };
  }

  async pointsHistory(appUserId: number, memberId: number, rawLimit?: string) {
    const member = await this.findActiveCustomer(appUserId, memberId);
    const parsedLimit = Number.parseInt(rawLimit ?? '50', 10);
    const limit = Math.min(Math.max(Number.isFinite(parsedLimit) ? parsedLimit : 50, 1), 100);
    const rows = await this.prisma.club_member_points_transactions.findMany({
      where: { member_id: member.id },
      include: {
        subscription: {
          select: { id: true, subscription_number: true, subscription_type: true },
        },
      },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: limit,
    });
    return {
      data: rows.map((row) => ({
        id: row.id,
        points: row.points,
        direction: row.points >= 0 ? 'credit' : 'debit',
        transactionType: row.transaction_type,
        source: row.source,
        description: row.description,
        subscription: row.subscription
          ? {
              id: row.subscription.id,
              number: row.subscription.subscription_number,
              type: row.subscription.subscription_type,
            }
          : null,
        createdAt: row.created_at,
      })),
      count: rows.length,
    };
  }

  async subscriptions(appUserId: number, memberId: number) {
    const member = await this.findActiveCustomer(appUserId, memberId);
    const rows = await this.prisma.club_subscriptions.findMany({
      where: { member_id: member.id },
      include: {
        type: {
          select: {
            id: true,
            name: true,
            days: true,
            attendance_count: true,
            freeze_days: true,
            is_linked_to_freeze: true,
          },
        },
        freezes: { orderBy: { id: 'desc' } },
      },
      orderBy: { id: 'desc' },
    });
    const data = rows.map((row) => {
      const activeFreeze = row.freezes.find((freeze) => freeze.is_active);
      return {
        id: row.id,
        number: row.subscription_number,
        type: row.type?.name ?? row.subscription_type,
        typeId: row.subscription_type_id,
        registrationDate: row.registration_date,
        startDate: row.subscription_start_date,
        endDate: row.subscription_end_date,
        status: row.status,
        value: Number(row.subscription_value),
        discountValue: Number(row.discount_value),
        paidAmount: Number(row.paid_amount),
        remainingAmount: Number(row.remaining_amount),
        sessions: row.is_linked_to_sessions
          ? {
              total: row.sessions_count,
              used: row.sessions_used,
              remaining: Math.max(0, (row.sessions_count ?? 0) - row.sessions_used),
            }
          : null,
        benefits: row.benefits,
        freeBenefitNotes: row.free_benefit_notes,
        package: row.type
          ? {
              days: row.type.days,
              visitsCount: row.type.attendance_count,
              freezeAllowed: row.type.is_linked_to_freeze,
              maxFreezeTimes: row.type.freeze_days,
            }
          : null,
        activeFreeze: activeFreeze ? this.freezeView(activeFreeze) : null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    });
    return { data, count: data.length };
  }

  async freezeHistory(appUserId: number, memberId: number) {
    const member = await this.findActiveCustomer(appUserId, memberId);
    const rows = await this.prisma.club_subscription_freezes.findMany({
      where: { subscription: { member_id: member.id } },
      include: {
        subscription: {
          select: {
            id: true,
            subscription_number: true,
            subscription_type: true,
            type: { select: { name: true } },
          },
        },
      },
      orderBy: { id: 'desc' },
    });
    return {
      data: rows.map((row) => ({
        ...this.freezeView(row),
        subscription: {
          id: row.subscription.id,
          number: row.subscription.subscription_number,
          type: row.subscription.type?.name ?? row.subscription.subscription_type,
        },
      })),
      count: rows.length,
    };
  }

  async notifications(appUserId: number, memberId: number, rawLimit?: string) {
    const member = await this.findActiveCustomer(appUserId, memberId);
    const parsedLimit = Number.parseInt(rawLimit ?? '50', 10);
    const limit = Math.min(Math.max(Number.isFinite(parsedLimit) ? parsedLimit : 50, 1), 100);
    const [personal, broadcasts] = await Promise.all([
      this.prisma.club_notifications.findMany({
        where: { member_id: member.id, status: { in: ['sent', 'read'] } },
        orderBy: { id: 'desc' },
        take: limit,
      }),
      this.prisma.club_content_items.findMany({
        where: {
          content_type: ClubContentType.notification_template,
          is_active: true,
          is_deleted: false,
          OR: [{ branch_id: null }, { branch_id: member.branch_id }],
        },
        orderBy: { id: 'desc' },
        take: limit,
      }),
    ]);
    const data = [
      ...personal.map((row) => ({
        id: row.id,
        source: 'personal' as const,
        type: row.type as string,
        title: row.title,
        message: row.message as string | null,
        imageUrl: null as string | null,
        read: row.status === 'read',
        bookingId: row.booking_id,
        scheduleId: row.schedule_id,
        sentAt: row.send_at ?? row.created_at,
        createdAt: row.created_at,
      })),
      ...broadcasts.map((row) => ({
        id: row.id,
        source: 'broadcast' as const,
        type: 'announcement',
        title: row.title,
        message: row.body,
        imageUrl: row.image_url,
        read: false,
        bookingId: null,
        scheduleId: null,
        sentAt: row.created_at,
        createdAt: row.created_at,
      })),
    ]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
    return { data, count: data.length, unreadCount: data.filter((item) => !item.read).length };
  }

  async markNotificationRead(appUserId: number, memberId: number, id: number) {
    const member = await this.findActiveCustomer(appUserId, memberId);
    const notification = await this.prisma.club_notifications.findUnique({ where: { id } });
    if (!notification) throw new NotFoundException('الإشعار غير موجود');
    if (notification.member_id !== member.id) throw new ForbiddenException('غير مصرح');
    await this.prisma.club_notifications.update({
      where: { id },
      data: { status: 'read' },
    });
    return { id, read: true };
  }

  async markAllNotificationsRead(appUserId: number, memberId: number) {
    const member = await this.findActiveCustomer(appUserId, memberId);
    const result = await this.prisma.club_notifications.updateMany({
      where: { member_id: member.id, status: 'sent' },
      data: { status: 'read' },
    });
    return { success: true, updatedCount: result.count };
  }

  async createTicket(dto: CreateMobileTicketDto) {
    const row = await this.prisma.club_tickets.create({
      data: {
        ticket_type: dto.type === 'suggestion' ? ClubTicketType.feedback : ClubTicketType.complaint,
        member_id: dto.memberId ?? null,
        member_name: dto.memberName?.trim() || null,
        subject: dto.subject.trim(),
        body: dto.body.trim(),
        branch_id: dto.branchId ?? null,
        status: 'open',
        priority: 'normal',
      },
    });
    return { success: true, id: row.id, type: dto.type, status: row.status, createdAt: row.created_at };
  }

  async createFeedback(dto: CreateMobileFeedbackDto) {
    const row = await this.prisma.club_tickets.create({
      data: {
        ticket_type: ClubTicketType.feedback,
        member_name: dto.memberName.trim(),
        subject: dto.subject.trim(),
        body: dto.notes.trim(),
        status: 'open',
        priority: 'normal',
      },
    });
    return {
      success: true,
      id: row.id,
      memberName: row.member_name,
      subject: row.subject,
      notes: row.body,
      status: row.status,
      createdAt: row.created_at,
    };
  }

  async createInvitation(dto: CreateMobileInvitationDto) {
    const row = await this.prisma.club_invitations.create({
      data: {
        invitee_name: dto.inviteeName.trim(),
        invitee_phone: dto.inviteePhone?.trim() || null,
        invitee_gender: dto.inviteeGender ?? null,
        invited_by_id: dto.invitedById ?? null,
        invited_by_name: dto.invitedByName?.trim() || null,
        visit_date: dto.visitDate ?? null,
        branch_id: dto.branchId ?? null,
        notes: dto.notes?.trim() || null,
        status: 'sent',
      },
    });
    return { success: true, id: row.id, status: row.status, createdAt: row.created_at };
  }

  private contentType(type: MobileContentRoute): ClubContentType {
    const types: Record<MobileContentRoute, ClubContentType> = {
      ads: ClubContentType.announcement,
      offers: ClubContentType.offer,
      faqs: ClubContentType.faq,
      exercises: ClubContentType.exercise,
    };
    return types[type];
  }

  private activeContentRows(contentType: ClubContentType) {
    return this.prisma.club_content_items.findMany({
      where: { content_type: contentType, is_active: true, is_deleted: false },
      orderBy: [{ sort_order: 'asc' }, { id: 'desc' }],
    });
  }

  private documentType(metadata: unknown): string | null {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
    const value = (metadata as Record<string, unknown>).documentType;
    return typeof value === 'string' ? value : null;
  }

  private isMobileTrainerTitle(value?: string | null): boolean {
    if (!value) return false;
    const title = value.trim().replace(/\s+/g, ' ');
    return title === 'مدرب' || title === 'مدرب لياقة';
  }

  private parseOptionalPositiveInt(rawValue: string | undefined, field: string): number | null {
    if (rawValue == null || rawValue === '') return null;
    const value = Number.parseInt(rawValue, 10);
    if (!Number.isInteger(value) || value < 1 || String(value) !== rawValue.trim()) {
      throw new BadRequestException(`${field} غير صحيح`);
    }
    return value;
  }

  private mobileSubscriptionTypeWhere(branchId: number | null) {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
    return {
      is_active: true,
      show_in_app: true,
      AND: [
        { OR: [{ availability_from: null }, { availability_from: { lte: today } }] },
        { OR: [{ availability_to: null }, { availability_to: { gte: today } }] },
        ...(branchId == null
          ? []
          : [{
              OR: [
                { apply_to_all_branches: true },
                { branch_id: branchId },
                { branches: { some: { branch_id: branchId } } },
              ],
            }]),
      ],
    };
  }

  private subscriptionTypeView(row: {
    id: number;
    name: string;
    name_ar: string | null;
    name_en: string | null;
    description: string | null;
    branch_id: number | null;
    apply_to_all_branches: boolean;
    branches: { branch_id: number }[];
    price: { toString(): string };
    min_price: { toString(): string } | null;
    days: number;
    duration_value: number | null;
    duration_type: string;
    package_category: string;
    package_type: string | null;
    is_special_offer: boolean;
    is_for_students: boolean;
    offer_validity: string | null;
    availability_from: string | null;
    availability_to: string | null;
    invitations_count: number | null;
    inbody_count: number | null;
    wallet_points: number | null;
    is_linked_to_sessions: boolean;
    sessions_count: number | null;
    allow_multiple_daily_entries: boolean;
    attendance_count: number | null;
    max_classes_per_day: number | null;
    is_linked_to_freeze: boolean;
    freeze_days: number | null;
    min_freeze: number | null;
    includes_spa: boolean;
    spa_count: number | null;
    valid_upgrade_duration: number | null;
    access_area_ids: unknown;
    benefits: unknown;
    week_planner: unknown;
    created_at: Date;
    updated_at: Date;
  }, details: boolean) {
    const branchIds = row.apply_to_all_branches
      ? []
      : [...new Set([
          ...(row.branch_id != null ? [row.branch_id] : []),
          ...row.branches.map((branch) => branch.branch_id),
        ])];
    const common = {
      id: row.id,
      name: row.name_ar ?? row.name,
      nameAr: row.name_ar,
      nameEn: row.name_en,
      description: row.description,
      price: Number(row.price),
      minimumPrice: row.min_price == null ? null : Number(row.min_price),
      packageCategory: row.package_category,
      packageType: row.package_type,
      duration: {
        value: row.duration_value ?? row.days,
        type: row.duration_value != null ? row.duration_type : 'days',
        days: row.days,
      },
      specialOffer: row.is_special_offer,
      forStudents: row.is_for_students,
      walletPoints: row.wallet_points ?? 0,
      availableForAllBranches: row.apply_to_all_branches,
      branchIds,
      availability: {
        from: row.availability_from,
        to: row.availability_to,
        offerValidUntil: row.offer_validity,
      },
    };
    if (!details) return common;
    return {
      ...common,
      included: {
        invitations: row.invitations_count ?? 0,
        inbodyMeasurements: row.inbody_count ?? 0,
        spaSessions: row.includes_spa ? row.spa_count ?? 0 : 0,
      },
      sessions: {
        enabled: row.is_linked_to_sessions,
        count: row.sessions_count,
      },
      attendance: {
        count: row.attendance_count,
        allowMultipleDailyEntries: row.allow_multiple_daily_entries,
        maxClassesPerDay: row.max_classes_per_day,
      },
      freeze: {
        enabled: row.is_linked_to_freeze,
        maximumTimes: row.freeze_days,
        minimumDays: row.min_freeze,
      },
      validUpgradeDuration: row.valid_upgrade_duration,
      accessAreaIds: Array.isArray(row.access_area_ids) ? row.access_area_ids : [],
      benefits: row.benefits && typeof row.benefits === 'object' ? row.benefits : {},
      weekPlanner: row.week_planner && typeof row.week_planner === 'object' ? row.week_planner : {},
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private freezeView(row: {
    id: number;
    freeze_start_date: string;
    freeze_end_date: string | null;
    planned_days: number;
    actual_days: number | null;
    original_end_date: string;
    reason: string | null;
    is_active: boolean;
    created_at: Date;
    updated_at: Date;
  }) {
    return {
      id: row.id,
      startDate: row.freeze_start_date,
      endDate: row.freeze_end_date,
      plannedDays: row.planned_days,
      actualDays: row.actual_days,
      originalSubscriptionEndDate: row.original_end_date,
      reason: row.reason,
      active: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private contentView(row: {
    id: number;
    title: string;
    body: string | null;
    image_url: string | null;
    sort_order: number;
    branch_id: number | null;
    metadata: unknown;
    created_at: Date;
    updated_at: Date;
  }) {
    return {
      id: row.id,
      title: row.title,
      body: row.body,
      imageUrl: row.image_url,
      sortOrder: row.sort_order,
      branchId: row.branch_id,
      metadata: row.metadata,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

type MobileContentRoute = 'ads' | 'offers' | 'faqs' | 'exercises';
