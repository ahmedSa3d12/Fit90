import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { paginated } from '../../common/dto/list-result';
import { ClubFitnessLedgerService } from './club-fitness-ledger.service';
import { addMinutes, localDateString, nextNumber, timeOverlap, toNum, assertMemberExists } from './club-fitness.utils';
import { ListClubFitnessDto } from './dto/list-club-fitness.dto';
import { WhatsappCloudService } from './whatsapp-cloud.service';

@Injectable()
export class ClubWellnessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: ClubFitnessLedgerService,
    private readonly whatsapp: WhatsappCloudService,
  ) {}

  // --- InBody measurements ---

  async listInbodyMeasurements(q: ListClubFitnessDto) {
    const where: Prisma.club_inbody_measurementsWhereInput = {};
    if (q.memberId) where.member_id = Number(q.memberId);
    if (q.search?.trim()) {
      const search = q.search.trim();
      const matchingMembers = await this.prisma.club_members.findMany({
        where: {
          is_deleted: false,
          OR: [
            { name: { contains: search } },
            { member_code: { contains: search } },
            { phone: { contains: search } },
          ],
        },
        select: { id: true },
        take: 200,
      });
      where.OR = [
        { member_id: { in: matchingMembers.map((member) => member.id) } },
        { measurement_date: { contains: search } },
        { staff_name: { contains: search } },
      ];
    }

    const [rows, total] = await Promise.all([
      this.prisma.club_inbody_measurements.findMany({
        where,
        orderBy: { measurement_date: 'desc' },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.club_inbody_measurements.count({ where }),
    ]);
    const members = await this.prisma.club_members.findMany({
      where: { id: { in: [...new Set(rows.map((row) => row.member_id))] } },
      select: { id: true, name: true, member_code: true, phone: true },
    });
    const memberById = new Map(members.map((member) => [member.id, member]));
    return paginated(
      rows.map((row) => this.mapInbodyMeasurement(row, memberById.get(row.member_id))),
      total,
      q.page,
      q.pageSize,
    );
  }

  async findInbodyMeasurement(id: number) {
    const row = await this.prisma.club_inbody_measurements.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('قياس InBody غير موجود');
    const member = await this.prisma.club_members.findUnique({
      where: { id: row.member_id },
      select: { id: true, name: true, member_code: true, phone: true },
    });
    return this.mapInbodyMeasurement(row, member ?? undefined);
  }

  private mapInbodyMeasurement(
    row: {
      id: number;
      member_id: number;
      measurement_date: string;
      weight: Prisma.Decimal | null;
      body_fat: Prisma.Decimal | null;
      muscle_mass: Prisma.Decimal | null;
      bmi: Prisma.Decimal | null;
      staff_name: string | null;
      file_url: string | null;
      notes: string | null;
      nutrition_plan: Prisma.JsonValue | null;
      created_at: Date;
      updated_at: Date;
    },
    member?: { id: number; name: string; member_code: string; phone: string | null },
  ) {
    return {
      id: row.id,
      memberId: row.member_id,
      memberName: member?.name ?? `#${row.member_id}`,
      memberCode: member?.member_code ?? null,
      memberPhone: member?.phone ?? null,
      measurementDate: row.measurement_date,
      weight: row.weight != null ? toNum(row.weight) : null,
      bodyFat: row.body_fat != null ? toNum(row.body_fat) : null,
      muscleMass: row.muscle_mass != null ? toNum(row.muscle_mass) : null,
      bmi: row.bmi != null ? toNum(row.bmi) : null,
      staffName: row.staff_name,
      fileUrl: row.file_url,
      notes: row.notes,
      nutritionPlan: row.nutrition_plan,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async updateInbodyNutritionPlan(id: number, body: Record<string, unknown>) {
    await this.findInbodyMeasurement(id);
    const mealRows = Array.isArray(body.meals) ? body.meals.slice(0, 20) : [];
    const meals = mealRows.map((raw) => {
      const meal = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
      return {
        name: String(meal.name ?? '').trim().slice(0, 100),
        time: String(meal.time ?? '').trim().slice(0, 20),
        foods: String(meal.foods ?? '').trim().slice(0, 2000),
        notes: String(meal.notes ?? '').trim().slice(0, 1000),
      };
    });
    const numberOrNull = (value: unknown) => {
      if (value == null || value === '') return null;
      const number = Number(value);
      return Number.isFinite(number) && number >= 0 ? number : null;
    };
    const nutritionPlan: Prisma.InputJsonObject = {
      goal: String(body.goal ?? '').trim().slice(0, 500),
      dailyCalories: numberOrNull(body.dailyCalories),
      waterLiters: numberOrNull(body.waterLiters),
      notes: String(body.notes ?? '').trim().slice(0, 4000),
      meals,
      fileUrl: body.fileUrl ? String(body.fileUrl).trim().slice(0, 1000) : null,
      updatedAt: new Date().toISOString(),
    };
    await this.prisma.club_inbody_measurements.update({
      where: { id },
      data: { nutrition_plan: nutritionPlan },
    });
    return this.findInbodyMeasurement(id);
  }

  async sendInbodyNutritionAttachment(id: number) {
    const measurement = await this.findInbodyMeasurement(id);
    const plan = measurement.nutritionPlan && typeof measurement.nutritionPlan === 'object'
      ? measurement.nutritionPlan as Record<string, unknown>
      : null;
    const fileUrl = typeof plan?.fileUrl === 'string' ? plan.fileUrl.trim() : '';
    if (!fileUrl) throw new BadRequestException('ارفعي ملف التغذية أولًا ثم اضغطي إرسال المرفق');
    return this.whatsapp.sendUploadedDocument({
      phone: measurement.memberPhone,
      fileUrl,
      caption: `مرفق التغذية - FIT90\nالعضو: ${measurement.memberName}\nكود العضو: ${measurement.memberCode ?? measurement.memberId}`,
    });
  }

  async createInbodyMeasurement(body: Record<string, unknown>) {
    if (!body.memberId || !body.measurementDate) {
      throw new BadRequestException('معرف العضو وتاريخ القياس مطلوبان');
    }
    await assertMemberExists(this.prisma, Number(body.memberId));
    const row = await this.prisma.club_inbody_measurements.create({
      data: {
        member_id: Number(body.memberId),
        measurement_date: String(body.measurementDate),
        weight: body.weight != null ? Number(body.weight) : null,
        body_fat: body.bodyFat != null ? Number(body.bodyFat) : null,
        muscle_mass: body.muscleMass != null ? Number(body.muscleMass) : null,
        bmi: body.bmi != null ? Number(body.bmi) : null,
        staff_name: body.staffName ? String(body.staffName) : null,
        file_url: body.fileUrl ? String(body.fileUrl) : null,
        notes: body.notes ? String(body.notes) : null,
      },
    });
    return this.findInbodyMeasurement(row.id);
  }

  async updateInbodyMeasurement(id: number, body: Record<string, unknown>) {
    await this.findInbodyMeasurement(id);
    await this.prisma.club_inbody_measurements.update({
      where: { id },
      data: {
        ...(body.memberId != null ? { member_id: Number(body.memberId) } : {}),
        ...(body.measurementDate != null ? { measurement_date: String(body.measurementDate) } : {}),
        ...(body.weight !== undefined ? { weight: body.weight != null ? Number(body.weight) : null } : {}),
        ...(body.bodyFat !== undefined ? { body_fat: body.bodyFat != null ? Number(body.bodyFat) : null } : {}),
        ...(body.muscleMass !== undefined ? { muscle_mass: body.muscleMass != null ? Number(body.muscleMass) : null } : {}),
        ...(body.bmi !== undefined ? { bmi: body.bmi != null ? Number(body.bmi) : null } : {}),
        ...(body.staffName !== undefined ? { staff_name: body.staffName ? String(body.staffName) : null } : {}),
        ...(body.fileUrl !== undefined ? { file_url: body.fileUrl ? String(body.fileUrl) : null } : {}),
        ...(body.notes !== undefined ? { notes: body.notes ? String(body.notes) : null } : {}),
      },
    });
    return this.findInbodyMeasurement(id);
  }

  async removeInbodyMeasurement(id: number) {
    await this.findInbodyMeasurement(id);
    await this.prisma.club_inbody_measurements.delete({ where: { id } });
    return { success: true };
  }

  // --- InBody invoices ---

  private mapInbodyInvoice(row: {
    id: number;
    invoice_number: string;
    is_member: boolean;
    member_id: number | null;
    customer_name: string | null;
    service_id: number | null;
    branch_id: number;
    unit_price: Prisma.Decimal;
    total_amount: Prisma.Decimal;
    invoice_date: string;
    invoice_time: string | null;
    status: string;
    is_active: boolean;
    created_at: Date;
    updated_at: Date;
  }) {
    return {
      id: row.id,
      invoiceNumber: row.invoice_number,
      isMember: row.is_member,
      memberId: row.member_id,
      customerName: row.customer_name,
      serviceId: row.service_id,
      branchId: row.branch_id,
      unitPrice: toNum(row.unit_price),
      totalAmount: toNum(row.total_amount),
      invoiceDate: row.invoice_date,
      invoiceTime: row.invoice_time,
      status: row.status,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async listInbodyInvoices(q: ListClubFitnessDto) {
    const where: Prisma.club_inbody_invoicesWhereInput = { is_active: true };
    if (q.memberId) where.member_id = Number(q.memberId);
    if (q.branch && q.branch !== 'all') where.branch_id = Number(q.branch);

    const [rows, total] = await Promise.all([
      this.prisma.club_inbody_invoices.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.club_inbody_invoices.count({ where }),
    ]);
    return paginated(rows.map((r) => this.mapInbodyInvoice(r)), total, q.page, q.pageSize);
  }

  async findInbodyInvoice(id: number) {
    const row = await this.prisma.club_inbody_invoices.findFirst({
      where: { id, is_active: true },
    });
    if (!row) throw new NotFoundException('فاتورة InBody غير موجودة');
    return this.mapInbodyInvoice(row);
  }

  async createInbodyInvoice(body: Record<string, unknown>) {
    if (body.unitPrice == null || !body.branchId) {
      throw new BadRequestException('السعر والفرع مطلوبان');
    }
    if (body.isMember !== false && body.memberId != null) {
      await assertMemberExists(this.prisma, Number(body.memberId));
    }
    const unitPrice = Number(body.unitPrice);
    const totalAmount = unitPrice;
    const status = body.status ? String(body.status) : 'paid';

    const row = await this.prisma.$transaction(async (tx) => {
      const year = new Date().getFullYear();
      const invoiceNumber = await nextNumber(tx, 'club_inbody_invoices', 'invoice_number', `INB-${year}`);
      const invoice = await tx.club_inbody_invoices.create({
        data: {
          invoice_number: invoiceNumber,
          is_member: body.isMember !== false,
          member_id: body.memberId != null ? Number(body.memberId) : null,
          customer_name: body.customerName ? String(body.customerName) : null,
          service_id: body.serviceId != null ? Number(body.serviceId) : null,
          branch_id: Number(body.branchId),
          unit_price: unitPrice,
          total_amount: totalAmount,
          invoice_date: body.invoiceDate ? String(body.invoiceDate) : localDateString(),
          invoice_time: body.invoiceTime ? String(body.invoiceTime) : null,
          status,
        },
      });

      if (status === 'paid') {
        await this.ledger.postPayment(
          {
            invoiceId: invoice.id,
            invoiceNumber: invoice.invoice_number,
            memberId: invoice.member_id ?? undefined,
            amount: totalAmount,
            branchId: invoice.branch_id,
            description: `فاتورة InBody ${invoice.invoice_number}`,
          },
          tx,
        );
      }

      return invoice;
    });

    return this.mapInbodyInvoice(row);
  }

  async updateInbodyInvoice(id: number, body: Record<string, unknown>) {
    const existing = await this.findInbodyInvoice(id);
    const unitPrice = body.unitPrice != null ? Number(body.unitPrice) : undefined;
    const nextStatus = body.status != null ? String(body.status) : existing.status;
    const wasPaid = existing.status === 'paid';
    const willBePaid = nextStatus === 'paid';

    // Money on an already-paid invoice is locked in the GL. Changing the amount would silently
    // desync the ledger, so forbid it (reverse+repost is out of scope here).
    if (wasPaid && unitPrice != null && unitPrice !== existing.unitPrice) {
      throw new BadRequestException('لا يمكن تعديل فاتورة مدفوعة');
    }

    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.club_inbody_invoices.update({
        where: { id },
        data: {
          ...(body.isMember !== undefined ? { is_member: Boolean(body.isMember) } : {}),
          ...(body.memberId !== undefined ? { member_id: body.memberId != null ? Number(body.memberId) : null } : {}),
          ...(body.customerName !== undefined ? { customer_name: body.customerName ? String(body.customerName) : null } : {}),
          ...(body.serviceId !== undefined ? { service_id: body.serviceId != null ? Number(body.serviceId) : null } : {}),
          ...(body.branchId != null ? { branch_id: Number(body.branchId) } : {}),
          ...(unitPrice != null ? { unit_price: unitPrice, total_amount: unitPrice } : {}),
          ...(body.invoiceDate != null ? { invoice_date: String(body.invoiceDate) } : {}),
          ...(body.invoiceTime !== undefined ? { invoice_time: body.invoiceTime ? String(body.invoiceTime) : null } : {}),
          ...(body.status != null ? { status: nextStatus } : {}),
          ...(body.isActive !== undefined ? { is_active: Boolean(body.isActive) } : {}),
        },
      });

      // On the unpaid→paid transition, post the GL payment now. postEntry is idempotent per
      // invoice number, so a repeat transition (or a re-save) won't double-post.
      if (!wasPaid && willBePaid) {
        await this.ledger.postPayment(
          {
            invoiceId: updated.id,
            invoiceNumber: updated.invoice_number,
            memberId: updated.member_id ?? undefined,
            amount: toNum(updated.total_amount),
            branchId: updated.branch_id,
            description: `فاتورة InBody ${updated.invoice_number}`,
          },
          tx,
        );
      }

      return updated;
    });
    return this.mapInbodyInvoice(row);
  }

  async removeInbodyInvoice(id: number) {
    const existing = await this.findInbodyInvoice(id);
    // A paid invoice has a GL entry; soft-deleting it would leave revenue on the books with no
    // visible source doc. Block it (GL reversal on delete is out of scope here).
    if (existing.status === 'paid') {
      throw new BadRequestException('لا يمكن حذف فاتورة مدفوعة');
    }
    await this.prisma.club_inbody_invoices.update({
      where: { id },
      data: { is_active: false },
    });
    return { success: true };
  }

  // --- Spa services ---

  async listSpaServices(q: ListClubFitnessDto) {
    const where: Prisma.club_spa_servicesWhereInput = {};
    if (q.branch && q.branch !== 'all') where.branch_id = Number(q.branch);
    if (q.search?.trim()) where.name = { contains: q.search.trim() };

    const [rows, total] = await Promise.all([
      this.prisma.club_spa_services.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.club_spa_services.count({ where }),
    ]);
    return paginated(
      rows.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        duration: r.duration,
        price: toNum(r.price),
        serviceKind: r.service_kind,
        branchId: r.branch_id,
        isActive: r.is_active,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
      total,
      q.page,
      q.pageSize,
    );
  }

  async listSpaServicesCatalog() {
    const rows = await this.prisma.club_spa_services.findMany({
      where: { is_active: true },
      orderBy: { name: 'asc' },
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      duration: r.duration,
      price: toNum(r.price),
      serviceKind: r.service_kind,
      branchId: r.branch_id,
    }));
  }

  async findSpaService(id: number) {
    const row = await this.prisma.club_spa_services.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('خدمة السبا غير موجودة');
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      duration: row.duration,
      price: toNum(row.price),
      serviceKind: row.service_kind,
      branchId: row.branch_id,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async createSpaService(body: Record<string, unknown>) {
    if (!body.name || body.price == null) {
      throw new BadRequestException('اسم الخدمة والسعر مطلوبان');
    }
    const row = await this.prisma.club_spa_services.create({
      data: {
        name: String(body.name).trim(),
        description: body.description ? String(body.description) : null,
        duration: body.duration != null ? Number(body.duration) : 60,
        price: Number(body.price),
        service_kind: body.serviceKind ? String(body.serviceKind) : 'spa',
        branch_id: body.branchId != null ? Number(body.branchId) : null,
        is_active: body.isActive !== false,
      },
    });
    return this.findSpaService(row.id);
  }

  async updateSpaService(id: number, body: Record<string, unknown>) {
    await this.findSpaService(id);
    await this.prisma.club_spa_services.update({
      where: { id },
      data: {
        ...(body.name != null ? { name: String(body.name).trim() } : {}),
        ...(body.description !== undefined ? { description: body.description ? String(body.description) : null } : {}),
        ...(body.duration != null ? { duration: Number(body.duration) } : {}),
        ...(body.price != null ? { price: Number(body.price) } : {}),
        ...(body.serviceKind != null ? { service_kind: String(body.serviceKind) } : {}),
        ...(body.branchId !== undefined ? { branch_id: body.branchId != null ? Number(body.branchId) : null } : {}),
        ...(body.isActive !== undefined ? { is_active: Boolean(body.isActive) } : {}),
      },
    });
    return this.findSpaService(id);
  }

  async removeSpaService(id: number) {
    await this.findSpaService(id);
    await this.prisma.club_spa_services.update({
      where: { id },
      data: { is_active: false },
    });
    return { success: true };
  }

  // --- Spa bookings ---

  private mapSpaBooking(row: {
    id: number;
    booking_number: string;
    member_id: number | null;
    customer_name: string | null;
    customer_phone: string | null;
    service_id: number;
    branch_id: number;
    booking_date: string;
    booking_time: string;
    duration: number;
    price: Prisma.Decimal;
    status: string;
    payment_status: string;
    notes: string | null;
    is_active: boolean;
    created_at: Date;
    updated_at: Date;
    service?: { id: number; name: string; price: Prisma.Decimal; duration: number };
  }) {
    return {
      id: row.id,
      bookingNumber: row.booking_number,
      memberId: row.member_id,
      customerName: row.customer_name,
      customerPhone: row.customer_phone,
      serviceId: row.service_id,
      branchId: row.branch_id,
      bookingDate: row.booking_date,
      bookingTime: row.booking_time,
      duration: row.duration,
      price: toNum(row.price),
      status: row.status,
      paymentStatus: row.payment_status,
      notes: row.notes,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      service: row.service
        ? {
            id: row.service.id,
            name: row.service.name,
            price: toNum(row.service.price),
            duration: row.service.duration,
          }
        : undefined,
    };
  }

  async listSpaBookings(q: ListClubFitnessDto) {
    const where: Prisma.club_spa_bookingsWhereInput = { is_active: true };
    if (q.memberId) where.member_id = Number(q.memberId);
    if (q.branch && q.branch !== 'all') where.branch_id = Number(q.branch);

    const [rows, total] = await Promise.all([
      this.prisma.club_spa_bookings.findMany({
        where,
        include: { service: { select: { id: true, name: true, price: true, duration: true } } },
        orderBy: { id: 'desc' },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.club_spa_bookings.count({ where }),
    ]);
    return paginated(rows.map((r) => this.mapSpaBooking(r)), total, q.page, q.pageSize);
  }

  async findSpaBooking(id: number) {
    const row = await this.prisma.club_spa_bookings.findFirst({
      where: { id, is_active: true },
      include: { service: { select: { id: true, name: true, price: true, duration: true } } },
    });
    if (!row) throw new NotFoundException('حجز السبا غير موجود');
    return this.mapSpaBooking(row);
  }

  async createSpaBooking(body: Record<string, unknown>) {
    if (!body.serviceId || !body.branchId || !body.bookingDate || !body.bookingTime) {
      throw new BadRequestException('الخدمة والفرع وتاريخ ووقت الحجز مطلوبة');
    }
    let childWarning: string | undefined;
    if (body.memberId != null) {
      await assertMemberExists(this.prisma, Number(body.memberId));
      // Conservative child guard: never block, only flag members whose card carries '-C'.
      const memberCard = await this.prisma.club_members.findUnique({
        where: { id: Number(body.memberId) },
        select: { card_number: true },
      });
      if ((memberCard?.card_number ?? '').includes('-C')) {
        childWarning = 'العضو طفل (بطاقة تحتوي على -C) — يرجى المراجعة';
      }
    }

    const service = await this.prisma.club_spa_services.findUnique({
      where: { id: Number(body.serviceId) },
    });
    if (!service) throw new NotFoundException('خدمة السبا غير موجودة');

    const price = body.price != null ? Number(body.price) : toNum(service.price);
    const duration = body.duration != null ? Number(body.duration) : service.duration;

    // Overlap guard: reject when another active booking for the SAME service on the SAME date has
    // a [start, start+duration) window that overlaps this one.
    const startTime = String(body.bookingTime);
    const endTime = addMinutes(startTime, duration);
    const sameDayBookings = await this.prisma.club_spa_bookings.findMany({
      where: {
        is_active: true,
        service_id: Number(body.serviceId),
        booking_date: String(body.bookingDate),
      },
      select: { id: true, booking_number: true, booking_time: true, duration: true },
    });
    const clash = sameDayBookings.find((b) =>
      timeOverlap(startTime, endTime, b.booking_time, addMinutes(b.booking_time, b.duration)),
    );
    if (clash) {
      throw new BadRequestException(
        `يوجد حجز آخر لنفس الخدمة (${clash.booking_number}) في نفس التوقيت`,
      );
    }

    const row = await this.prisma.$transaction(async (tx) => {
      const year = new Date().getFullYear();
      const bookingNumber = await nextNumber(tx, 'club_spa_bookings', 'booking_number', `SPA-${year}`);
      return tx.club_spa_bookings.create({
        data: {
          booking_number: bookingNumber,
          member_id: body.memberId != null ? Number(body.memberId) : null,
          customer_name: body.customerName ? String(body.customerName) : null,
          customer_phone: body.customerPhone ? String(body.customerPhone) : null,
          service_id: Number(body.serviceId),
          branch_id: Number(body.branchId),
          booking_date: String(body.bookingDate),
          booking_time: String(body.bookingTime),
          duration,
          price,
          status: (body.status as Prisma.EnumClubFitnessBookingStatusFieldUpdateOperationsInput['set']) ?? 'pending',
          payment_status: (body.paymentStatus as Prisma.EnumClubFitnessPaymentStatusFieldUpdateOperationsInput['set']) ?? 'unpaid',
          notes: body.notes ? String(body.notes) : null,
        },
        include: { service: { select: { id: true, name: true, price: true, duration: true } } },
      });
    });

    const result = this.mapSpaBooking(row);
    return childWarning ? { ...result, warning: childWarning } : result;
  }

  async updateSpaBooking(id: number, body: Record<string, unknown>) {
    await this.findSpaBooking(id);
    const row = await this.prisma.club_spa_bookings.update({
      where: { id },
      data: {
        ...(body.memberId !== undefined ? { member_id: body.memberId != null ? Number(body.memberId) : null } : {}),
        ...(body.customerName !== undefined ? { customer_name: body.customerName ? String(body.customerName) : null } : {}),
        ...(body.customerPhone !== undefined ? { customer_phone: body.customerPhone ? String(body.customerPhone) : null } : {}),
        ...(body.serviceId != null ? { service_id: Number(body.serviceId) } : {}),
        ...(body.branchId != null ? { branch_id: Number(body.branchId) } : {}),
        ...(body.bookingDate != null ? { booking_date: String(body.bookingDate) } : {}),
        ...(body.bookingTime != null ? { booking_time: String(body.bookingTime) } : {}),
        ...(body.duration != null ? { duration: Number(body.duration) } : {}),
        ...(body.price != null ? { price: Number(body.price) } : {}),
        ...(body.status != null ? { status: String(body.status) as Prisma.EnumClubFitnessBookingStatusFieldUpdateOperationsInput['set'] } : {}),
        ...(body.paymentStatus != null ? { payment_status: String(body.paymentStatus) as Prisma.EnumClubFitnessPaymentStatusFieldUpdateOperationsInput['set'] } : {}),
        ...(body.notes !== undefined ? { notes: body.notes ? String(body.notes) : null } : {}),
        ...(body.isActive !== undefined ? { is_active: Boolean(body.isActive) } : {}),
      },
      include: { service: { select: { id: true, name: true, price: true, duration: true } } },
    });
    if (!row) throw new NotFoundException('حجز السبا غير موجود');
    return this.mapSpaBooking(row);
  }

  async removeSpaBooking(id: number) {
    await this.findSpaBooking(id);
    await this.prisma.club_spa_bookings.update({
      where: { id },
      data: { is_active: false },
    });
    return { success: true };
  }

  // --- Spa invoices ---

  private mapSpaInvoice(row: {
    id: number;
    invoice_number: string;
    member_id: number;
    service_id: number;
    branch_id: number;
    quantity: number;
    unit_price: Prisma.Decimal;
    total_amount: Prisma.Decimal;
    invoice_date: string;
    status: string;
    is_active: boolean;
    created_at: Date;
    updated_at: Date;
    service?: { id: number; name: string };
  }) {
    return {
      id: row.id,
      invoiceNumber: row.invoice_number,
      memberId: row.member_id,
      serviceId: row.service_id,
      branchId: row.branch_id,
      quantity: row.quantity,
      unitPrice: toNum(row.unit_price),
      totalAmount: toNum(row.total_amount),
      invoiceDate: row.invoice_date,
      status: row.status,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      service: row.service,
    };
  }

  async listSpaInvoices(q: ListClubFitnessDto) {
    const where: Prisma.club_spa_invoicesWhereInput = { is_active: true };
    if (q.memberId) where.member_id = Number(q.memberId);
    if (q.branch && q.branch !== 'all') where.branch_id = Number(q.branch);

    const [rows, total] = await Promise.all([
      this.prisma.club_spa_invoices.findMany({
        where,
        include: { service: { select: { id: true, name: true } } },
        orderBy: { id: 'desc' },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.club_spa_invoices.count({ where }),
    ]);
    return paginated(rows.map((r) => this.mapSpaInvoice(r)), total, q.page, q.pageSize);
  }

  async findSpaInvoice(id: number) {
    const row = await this.prisma.club_spa_invoices.findFirst({
      where: { id, is_active: true },
      include: { service: { select: { id: true, name: true } } },
    });
    if (!row) throw new NotFoundException('فاتورة السبا غير موجودة');
    return this.mapSpaInvoice(row);
  }

  async createSpaInvoice(body: Record<string, unknown>) {
    if (!body.memberId || !body.serviceId || !body.branchId || body.unitPrice == null) {
      throw new BadRequestException('العضو والخدمة والفرع والسعر مطلوبة');
    }
    await assertMemberExists(this.prisma, Number(body.memberId));

    const quantity = body.quantity != null ? Number(body.quantity) : 1;
    const unitPrice = Number(body.unitPrice);
    const totalAmount = unitPrice * quantity;
    const status = body.status ? String(body.status) : 'paid';

    const row = await this.prisma.$transaction(async (tx) => {
      const year = new Date().getFullYear();
      const invoiceNumber = await nextNumber(tx, 'club_spa_invoices', 'invoice_number', `SPINV-${year}`);
      const invoice = await tx.club_spa_invoices.create({
        data: {
          invoice_number: invoiceNumber,
          member_id: Number(body.memberId),
          service_id: Number(body.serviceId),
          branch_id: Number(body.branchId),
          quantity,
          unit_price: unitPrice,
          total_amount: totalAmount,
          invoice_date: body.invoiceDate ? String(body.invoiceDate) : localDateString(),
          status,
        },
        include: { service: { select: { id: true, name: true } } },
      });

      if (status === 'paid') {
        await this.ledger.postPayment(
          {
            invoiceId: invoice.id,
            invoiceNumber: invoice.invoice_number,
            memberId: invoice.member_id,
            amount: totalAmount,
            branchId: invoice.branch_id,
            description: `فاتورة SPA ${invoice.invoice_number}`,
          },
          tx,
        );
      }

      return invoice;
    });

    return this.mapSpaInvoice(row);
  }

  async updateSpaInvoice(id: number, body: Record<string, unknown>) {
    const existing = await this.findSpaInvoice(id);
    const quantity = body.quantity != null ? Number(body.quantity) : existing.quantity;
    const unitPrice = body.unitPrice != null ? Number(body.unitPrice) : existing.unitPrice;
    const totalAmount = unitPrice * quantity;
    const nextStatus = body.status != null ? String(body.status) : existing.status;
    const wasPaid = existing.status === 'paid';
    const willBePaid = nextStatus === 'paid';

    // Amount on a paid invoice is locked in the GL — forbid changing qty/price (reverse+repost
    // is out of scope here).
    if (wasPaid && (quantity !== existing.quantity || unitPrice !== existing.unitPrice)) {
      throw new BadRequestException('لا يمكن تعديل فاتورة مدفوعة');
    }

    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.club_spa_invoices.update({
        where: { id },
        data: {
          ...(body.memberId != null ? { member_id: Number(body.memberId) } : {}),
          ...(body.serviceId != null ? { service_id: Number(body.serviceId) } : {}),
          ...(body.branchId != null ? { branch_id: Number(body.branchId) } : {}),
          quantity,
          unit_price: unitPrice,
          total_amount: totalAmount,
          ...(body.invoiceDate != null ? { invoice_date: String(body.invoiceDate) } : {}),
          ...(body.status != null ? { status: nextStatus } : {}),
          ...(body.isActive !== undefined ? { is_active: Boolean(body.isActive) } : {}),
        },
        include: { service: { select: { id: true, name: true } } },
      });

      // On the unpaid→paid transition, post the GL payment. Idempotent per invoice number.
      if (!wasPaid && willBePaid) {
        await this.ledger.postPayment(
          {
            invoiceId: updated.id,
            invoiceNumber: updated.invoice_number,
            memberId: updated.member_id,
            amount: toNum(updated.total_amount),
            branchId: updated.branch_id,
            description: `فاتورة SPA ${updated.invoice_number}`,
          },
          tx,
        );
      }

      return updated;
    });
    return this.mapSpaInvoice(row);
  }

  async removeSpaInvoice(id: number) {
    const existing = await this.findSpaInvoice(id);
    // A paid invoice has a GL entry; block soft-delete so revenue never orphans (GL reversal on
    // delete is out of scope here).
    if (existing.status === 'paid') {
      throw new BadRequestException('لا يمكن حذف فاتورة مدفوعة');
    }
    await this.prisma.club_spa_invoices.update({
      where: { id },
      data: { is_active: false },
    });
    return { success: true };
  }
}
