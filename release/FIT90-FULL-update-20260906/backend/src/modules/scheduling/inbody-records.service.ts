import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { JwtUser } from '../../common/types/jwt-user';
import { paginated } from '../../common/dto/list-result';
import { ListInbodyRecordDto } from './dto/list-inbody-record.dto';
import { UpsertInbodyRecordDto } from './dto/upsert-inbody-record.dto';

type Row = {
  id: number;
  member_id: number;
  member_name: string | null;
  record_date: string;
  employee_id: number | null;
  staff_name: string | null;
  file_url: string | null;
  file_path: string | null;
  weight: Prisma.Decimal | null;
  body_fat: Prisma.Decimal | null;
  muscle_mass: Prisma.Decimal | null;
  bmi: Prisma.Decimal | null;
  notes: string | null;
  branch_id: number | null;
  created_at: Date;
  updated_at: Date;
};

/**
 * InBody result records — independent of scheduling. Registered after a
 * completed InBody appointment; exposes per-member history.
 */
@Injectable()
export class InbodyRecordsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branchScope: BranchScopeService,
  ) {}

  private dec(v: Prisma.Decimal | null): string | null {
    return v == null ? null : v.toString();
  }

  private map(r: Row) {
    return {
      id: r.id,
      memberId: r.member_id,
      memberName: r.member_name,
      recordDate: r.record_date,
      employeeId: r.employee_id,
      staffName: r.staff_name,
      fileUrl: r.file_url,
      filePath: r.file_path,
      weight: this.dec(r.weight),
      bodyFat: this.dec(r.body_fat),
      muscleMass: this.dec(r.muscle_mass),
      bmi: this.dec(r.bmi),
      notes: r.notes,
      branchId: r.branch_id,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }

  async list(q: ListInbodyRecordDto, user?: JwtUser) {
    const and: Prisma.club_inbody_recordsWhereInput[] = [{ is_deleted: false }];
    if (q.memberId != null) and.push({ member_id: q.memberId });
    if (q.employeeId != null) and.push({ employee_id: q.employeeId });
    if (q.dateFrom) and.push({ record_date: { gte: q.dateFrom } });
    if (q.dateTo) and.push({ record_date: { lte: q.dateTo } });
    if (q.search?.trim()) {
      const s = q.search.trim();
      and.push({ OR: [{ member_name: { contains: s } }, { staff_name: { contains: s } }] });
    }
    const branchIds = this.branchScope.resolveListFilter(user, q.branchId);
    if (branchIds) and.push({ OR: [{ branch_id: { in: branchIds } }, { branch_id: null }] });

    const where: Prisma.club_inbody_recordsWhereInput = { AND: and };
    const [rows, total] = await Promise.all([
      this.prisma.club_inbody_records.findMany({
        where,
        orderBy: [{ record_date: 'desc' }, { id: 'desc' }],
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.club_inbody_records.count({ where }),
    ]);
    return paginated(rows.map((r) => this.map(r)), total, q.page, q.pageSize);
  }

  /** Full chronological history for one member (ascending, no pagination). */
  async history(memberId: number) {
    const rows = await this.prisma.club_inbody_records.findMany({
      where: { member_id: memberId, is_deleted: false },
      orderBy: [{ record_date: 'asc' }, { id: 'asc' }],
    });
    return rows.map((r) => this.map(r));
  }

  async findOne(id: number) {
    const row = await this.prisma.club_inbody_records.findFirst({
      where: { id, is_deleted: false },
    });
    if (!row) throw new NotFoundException('InBody record not found');
    return this.map(row);
  }

  private toDecimal(v?: string): Prisma.Decimal | null {
    return v == null ? null : new Prisma.Decimal(v);
  }

  async create(dto: UpsertInbodyRecordDto) {
    if (dto.memberId == null) throw new BadRequestException('memberId is required');
    if (!dto.recordDate) throw new BadRequestException('recordDate is required');
    const row = await this.prisma.club_inbody_records.create({
      data: {
        member_id: dto.memberId,
        member_name: dto.memberName ?? null,
        record_date: dto.recordDate,
        employee_id: dto.employeeId ?? null,
        staff_name: dto.staffName ?? null,
        file_url: dto.fileUrl ?? null,
        file_path: dto.filePath ?? null,
        weight: this.toDecimal(dto.weight),
        body_fat: this.toDecimal(dto.bodyFat),
        muscle_mass: this.toDecimal(dto.muscleMass),
        bmi: this.toDecimal(dto.bmi),
        notes: dto.notes ?? null,
        branch_id: dto.branchId ?? null,
      },
    });
    return this.map(row);
  }

  async update(id: number, dto: UpsertInbodyRecordDto) {
    const existing = await this.prisma.club_inbody_records.findFirst({
      where: { id, is_deleted: false },
    });
    if (!existing) throw new NotFoundException('InBody record not found');
    const row = await this.prisma.club_inbody_records.update({
      where: { id },
      data: {
        ...(dto.memberId != null ? { member_id: dto.memberId } : {}),
        ...(dto.memberName !== undefined ? { member_name: dto.memberName } : {}),
        ...(dto.recordDate != null ? { record_date: dto.recordDate } : {}),
        ...(dto.employeeId !== undefined ? { employee_id: dto.employeeId } : {}),
        ...(dto.staffName !== undefined ? { staff_name: dto.staffName } : {}),
        ...(dto.fileUrl !== undefined ? { file_url: dto.fileUrl } : {}),
        ...(dto.filePath !== undefined ? { file_path: dto.filePath } : {}),
        ...(dto.weight !== undefined ? { weight: this.toDecimal(dto.weight) } : {}),
        ...(dto.bodyFat !== undefined ? { body_fat: this.toDecimal(dto.bodyFat) } : {}),
        ...(dto.muscleMass !== undefined ? { muscle_mass: this.toDecimal(dto.muscleMass) } : {}),
        ...(dto.bmi !== undefined ? { bmi: this.toDecimal(dto.bmi) } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        ...(dto.branchId !== undefined ? { branch_id: dto.branchId } : {}),
      },
    });
    return this.map(row);
  }

  async remove(id: number) {
    const existing = await this.prisma.club_inbody_records.findFirst({
      where: { id, is_deleted: false },
    });
    if (!existing) throw new NotFoundException('InBody record not found');
    await this.prisma.club_inbody_records.update({ where: { id }, data: { is_deleted: true } });
    return { success: true };
  }
}
