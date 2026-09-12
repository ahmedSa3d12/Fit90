import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { paginated } from '../../common/dto/list-result';
import { isActiveEnrollment, toNum } from './club-fitness.utils';
import { ListClubTrainersDto } from './dto/list-club-trainers.dto';
import { JwtUser } from '../../common/types/jwt-user';
import { EmployeeDataScopeService } from '../../common/employee-scope/employee-data-scope.service';

@Injectable()
export class ClubTrainersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly employeeScope: EmployeeDataScopeService,
  ) {}

  private async employeesByJobTitle(jobTitle: string) {
    const title = jobTitle.trim();
    if (!title) return [];
    const matchingJobs = await this.prisma.department_jobs.findMany({
      where: { name: { contains: title } },
      select: { id: true },
    });
    const jobIds = matchingJobs.map((job) => job.id);
    return this.prisma.employees.findMany({
      where: {
        OR: [
          { mosma_wazefy_n: { contains: title } },
          ...(jobIds.length ? [{ mosma_wazefy_code: { in: jobIds } }] : []),
        ],
      },
      select: { id: true, employee: true, email: true, phone: true },
      orderBy: { employee: 'asc' },
    });
  }

  private mapTrainer(row: {
    id: number;
    employee_id: number | null;
    name: string;
    email: string | null;
    phone: string | null;
    specialization: string | null;
    experience: string | null;
    bio: string | null;
    image_url: string | null;
    rating_avg: Prisma.Decimal;
    is_active: boolean;
    created_at: Date;
    updated_at: Date;
  }) {
    return {
      id: row.id,
      employeeId: row.employee_id,
      name: row.name,
      email: row.email,
      phone: row.phone,
      specialization: row.specialization,
      experience: row.experience,
      bio: row.bio,
      imageUrl: row.image_url,
      ratingAvg: toNum(row.rating_avg),
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async list(q: ListClubTrainersDto, user?: JwtUser) {
    const and: Prisma.club_trainersWhereInput[] = [{ is_deleted: false }];
    if (this.employeeScope.isSelfOnly(user)) {
      and.push({ id: (await this.employeeScope.providerId(user)) ?? -1 });
    }
    if (q.search?.trim()) {
      const s = q.search.trim();
      and.push({
        OR: [
          { name: { contains: s } },
          { email: { contains: s } },
          { phone: { contains: s } },
          { specialization: { contains: s } },
        ],
      });
    }
    if (q.isActive !== undefined) and.push({ is_active: q.isActive });
    if (q.jobTitle?.trim()) {
      const matchingEmployees = await this.employeesByJobTitle(q.jobTitle);
      and.push({ employee_id: { in: matchingEmployees.map((employee) => employee.id) } });
    }

    const where: Prisma.club_trainersWhereInput = { AND: and };
    const [rows, total] = await Promise.all([
      this.prisma.club_trainers.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.club_trainers.count({ where }),
    ]);
    return paginated(rows.map((r) => this.mapTrainer(r)), total, q.page, q.pageSize);
  }

  /**
   * Keep the scheduling-provider roster aligned with authoritative employees.
   * Missing provider rows are created only for employees whose actual job title
   * matches the requested title, so dropdowns never fall back to unrelated staff.
   */
  async syncProvidersByJobTitle(jobTitle: string) {
    if (!jobTitle?.trim()) throw new BadRequestException('jobTitle is required');
    const employees = await this.employeesByJobTitle(jobTitle);
    if (!employees.length) return [];

    const employeeIds = employees.map((employee) => employee.id);
    const existing = await this.prisma.club_trainers.findMany({
      where: { employee_id: { in: employeeIds }, is_deleted: false },
      orderBy: { id: 'asc' },
    });
    const byEmployee = new Map<number, (typeof existing)[number]>();
    for (const trainer of existing) {
      if (trainer.employee_id != null && !byEmployee.has(trainer.employee_id)) {
        byEmployee.set(trainer.employee_id, trainer);
      }
    }

    const providers: Array<ReturnType<typeof this.mapTrainer>> = [];
    for (const employee of employees) {
      let trainer = byEmployee.get(employee.id);
      if (!trainer) {
        trainer = await this.prisma.club_trainers.create({
          data: {
            employee_id: employee.id,
            name: employee.employee?.trim() || `Employee #${employee.id}`,
            email: employee.email?.trim() || null,
            phone: employee.phone?.trim() || null,
            specialization: jobTitle.trim(),
            is_active: true,
          },
        });
      }
      if (trainer.is_active) providers.push(this.mapTrainer(trainer));
    }
    return providers;
  }

  async statistics(user?: JwtUser) {
    if (this.employeeScope.isSelfOnly(user)) {
      const ownId = await this.employeeScope.providerId(user);
      const active = ownId != null && ownId > 0
        ? await this.prisma.club_trainers.count({ where: { id: ownId, is_deleted: false, is_active: true } })
        : 0;
      return { total: active, active, inactive: 0 };
    }
    const [total, active] = await Promise.all([
      this.prisma.club_trainers.count({ where: { is_deleted: false } }),
      this.prisma.club_trainers.count({ where: { is_deleted: false, is_active: true } }),
    ]);
    return { total, active, inactive: total - active };
  }

  async findOne(id: number, user?: JwtUser) {
    const row = await this.prisma.club_trainers.findFirst({
      where: { id, is_deleted: false },
    });
    if (!row) throw new NotFoundException('المدرب غير موجود');
    await this.employeeScope.assertProviderAccess(user, row.id);
    return this.mapTrainer(row);
  }

  async findDetails(id: number, query?: { dateFrom?: string; dateTo?: string }, user?: JwtUser) {
    const trainer = await this.findOne(id, user);
    const classWhere: Prisma.club_classesWhereInput = {
      trainer_id: id,
      is_deleted: false,
    };
    if (query?.dateFrom && query?.dateTo) {
      classWhere.class_date = { gte: query.dateFrom, lte: query.dateTo };
    } else if (query?.dateFrom) {
      classWhere.class_date = { gte: query.dateFrom };
    } else if (query?.dateTo) {
      classWhere.class_date = { lte: query.dateTo };
    }

    const classes = await this.prisma.club_classes.findMany({
      where: classWhere,
      include: {
        enrollments: {
          where: { attendance_status: { not: 'cancelled' } },
        },
      },
      orderBy: [{ class_date: 'desc' }, { start_time: 'asc' }],
    });

    const totalClasses = classes.length;
    const uniqueDates = new Set(classes.map((c) => c.class_date));
    const uniqueMembers = new Set<number>();
    let totalEnrollments = 0;
    let totalClassRevenue = 0;

    for (const cls of classes) {
      const activeEnrollments = cls.enrollments.filter((e) => isActiveEnrollment(e.attendance_status));
      totalEnrollments += activeEnrollments.length;
      activeEnrollments.forEach((e) => uniqueMembers.add(e.member_id));
      const revenue = activeEnrollments.length * toNum(cls.price);
      totalClassRevenue += revenue;
    }

    return {
      trainer,
      statistics: {
        totalClasses,
        totalDays: uniqueDates.size,
        totalEnrollments,
        uniqueMembers: uniqueMembers.size,
        totalClassRevenue,
      },
      classes: classes.map((c) => ({
        id: c.id,
        className: c.class_name,
        classDate: c.class_date,
        startTime: c.start_time,
        endTime: c.end_time,
        status: c.status,
        price: toNum(c.price),
        maxCapacity: c.max_capacity,
        enrollmentCount: c.enrollments.filter((e) => isActiveEnrollment(e.attendance_status)).length,
      })),
    };
  }

  async create(body: Record<string, unknown>, user?: JwtUser) {
    if (!body.name || !String(body.name).trim()) {
      throw new BadRequestException('اسم المدرب مطلوب');
    }
    if (this.employeeScope.isSelfOnly(user)) {
      this.employeeScope.assertEmployeeAccess(user, Number(body.employeeId ?? -1));
    }
    const row = await this.prisma.club_trainers.create({
      data: {
        employee_id: body.employeeId != null ? Number(body.employeeId) : null,
        name: String(body.name).trim(),
        email: body.email ? String(body.email).trim() : null,
        phone: body.phone ? String(body.phone).trim() : null,
        specialization: body.specialization ? String(body.specialization).trim() : null,
        experience: body.experience ? String(body.experience).trim() : null,
        bio: body.bio ? String(body.bio) : null,
        image_url: body.imageUrl ? String(body.imageUrl) : null,
        is_active: body.isActive !== false,
      },
    });
    return this.mapTrainer(row);
  }

  async update(id: number, body: Record<string, unknown>, user?: JwtUser) {
    await this.findOne(id, user);
    const row = await this.prisma.club_trainers.update({
      where: { id },
      data: {
        ...(body.employeeId !== undefined ? { employee_id: body.employeeId != null ? Number(body.employeeId) : null } : {}),
        ...(body.name != null ? { name: String(body.name).trim() } : {}),
        ...(body.email !== undefined ? { email: body.email ? String(body.email).trim() : null } : {}),
        ...(body.phone !== undefined ? { phone: body.phone ? String(body.phone).trim() : null } : {}),
        ...(body.specialization !== undefined ? { specialization: body.specialization ? String(body.specialization).trim() : null } : {}),
        ...(body.experience !== undefined ? { experience: body.experience ? String(body.experience).trim() : null } : {}),
        ...(body.bio !== undefined ? { bio: body.bio ? String(body.bio) : null } : {}),
        ...(body.imageUrl !== undefined ? { image_url: body.imageUrl ? String(body.imageUrl) : null } : {}),
        ...(body.isActive !== undefined ? { is_active: Boolean(body.isActive) } : {}),
      },
    });
    return this.mapTrainer(row);
  }

  async remove(id: number, user?: JwtUser) {
    await this.findOne(id, user);
    await this.prisma.club_trainers.update({
      where: { id },
      data: { is_deleted: true, is_active: false },
    });
    return { success: true };
  }
}
