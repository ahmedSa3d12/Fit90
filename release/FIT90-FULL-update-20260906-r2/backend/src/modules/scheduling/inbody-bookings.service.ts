import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { paginated } from '../../common/dto/list-result';
import { ListInbodyBookingDto } from './dto/list-inbody-booking.dto';
import { UpsertInbodyBookingDto } from './dto/upsert-inbody-booking.dto';

type InbodyBookingRow = {
  id: number;
  member_id: number | null;
  member_name: string | null;
  slot_id: number | null;
  booking_date: string;
  start_time: string | null;
  end_time: string | null;
  staff_name: string | null;
  status: string;
  notes: string | null;
  branch_id: number | null;
  is_deleted: boolean;
  created_at: Date;
  updated_at: Date;
};

@Injectable()
export class InbodyBookingsService {
  constructor(private readonly prisma: PrismaService) {}

  private map(r: InbodyBookingRow) {
    return {
      id: r.id,
      memberId: r.member_id,
      memberName: r.member_name,
      slotId: r.slot_id,
      bookingDate: r.booking_date,
      startTime: r.start_time,
      endTime: r.end_time,
      staffName: r.staff_name,
      status: r.status,
      notes: r.notes,
      branchId: r.branch_id,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }

  async list(q: ListInbodyBookingDto) {
    const and: Prisma.club_inbody_bookingsWhereInput[] = [{ is_deleted: false }];
    if (q.status && q.status !== 'all') and.push({ status: q.status });
    if (q.branchId != null) and.push({ branch_id: q.branchId });
    if (q.bookingDate) and.push({ booking_date: q.bookingDate });
    if (q.search) {
      and.push({
        OR: [
          { member_name: { contains: q.search } },
          { staff_name: { contains: q.search } },
        ],
      });
    }
    const where: Prisma.club_inbody_bookingsWhereInput = { AND: and };
    const [rows, total] = await Promise.all([
      this.prisma.club_inbody_bookings.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.club_inbody_bookings.count({ where }),
    ]);
    return paginated(rows.map((r) => this.map(r)), total, q.page, q.pageSize);
  }

  async create(dto: UpsertInbodyBookingDto) {
    // Capacity + booking are one transaction. The seat is claimed with a single
    // conditional UPDATE (increment only while booked_count < capacity), so two
    // concurrent bookings for the last slot can never both succeed — no race,
    // no oversell, and a failed insert rolls the increment back.
    const row = await this.prisma.$transaction(async (tx) => {
      if (dto.slotId != null) {
        const slot = await tx.club_availability_slots.findFirst({
          where: { id: dto.slotId, is_deleted: false },
        });
        if (!slot) {
          throw new BadRequestException(`Availability slot ${dto.slotId} not found`);
        }
        const claim = await tx.club_availability_slots.updateMany({
          where: { id: dto.slotId, is_deleted: false, booked_count: { lt: slot.capacity } },
          data: { booked_count: { increment: 1 } },
        });
        if (claim.count === 0) {
          throw new BadRequestException(
            `Availability slot ${dto.slotId} is fully booked (${slot.capacity}/${slot.capacity}).`,
          );
        }
      }

      return tx.club_inbody_bookings.create({
        data: {
          member_id: dto.memberId ?? null,
          member_name: dto.memberName ?? null,
          slot_id: dto.slotId ?? null,
          booking_date: dto.bookingDate,
          start_time: dto.startTime ?? null,
          end_time: dto.endTime ?? null,
          staff_name: dto.staffName ?? null,
          status: dto.status ?? 'booked',
          notes: dto.notes ?? null,
          branch_id: dto.branchId ?? null,
        },
      });
    });
    return this.map(row);
  }

  /** Decrement a slot's booked_count, flooring at 0 (never negative). */
  private async releaseSlot(slotId: number) {
    const slot = await this.prisma.club_availability_slots.findFirst({
      where: { id: slotId, is_deleted: false },
    });
    if (!slot) return;
    const next = slot.booked_count > 0 ? slot.booked_count - 1 : 0;
    await this.prisma.club_availability_slots.updateMany({
      where: { id: slotId, is_deleted: false },
      data: { booked_count: next },
    });
  }

  async update(id: number, dto: UpsertInbodyBookingDto) {
    const existing = await this.prisma.club_inbody_bookings.findFirst({
      where: { id, is_deleted: false },
    });
    if (!existing) throw new NotFoundException('InBody booking not found');
    const row = await this.prisma.club_inbody_bookings.update({
      where: { id },
      data: {
        ...(dto.memberId !== undefined ? { member_id: dto.memberId } : {}),
        ...(dto.memberName !== undefined ? { member_name: dto.memberName } : {}),
        ...(dto.slotId !== undefined ? { slot_id: dto.slotId } : {}),
        ...(dto.bookingDate != null ? { booking_date: dto.bookingDate } : {}),
        ...(dto.startTime !== undefined ? { start_time: dto.startTime } : {}),
        ...(dto.endTime !== undefined ? { end_time: dto.endTime } : {}),
        ...(dto.staffName !== undefined ? { staff_name: dto.staffName } : {}),
        ...(dto.status != null ? { status: dto.status } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        ...(dto.branchId !== undefined ? { branch_id: dto.branchId } : {}),
      },
    });
    // Cancellation frees the slot: only when transitioning from a non-cancelled
    // status into 'cancelled' (guards against decrementing an already-cancelled
    // booking twice). Use the slot the booking was pointing at before update.
    if (
      dto.status === 'cancelled' &&
      existing.status !== 'cancelled' &&
      existing.slot_id != null
    ) {
      await this.releaseSlot(existing.slot_id);
    }
    return this.map(row);
  }

  async remove(id: number) {
    const existing = await this.prisma.club_inbody_bookings.findFirst({
      where: { id, is_deleted: false },
    });
    if (!existing) throw new NotFoundException('InBody booking not found');
    await this.prisma.club_inbody_bookings.update({
      where: { id },
      data: { is_deleted: true },
    });
    // Cancellation frees the slot on (first) delete. Guard against double
    // decrement: an already-cancelled booking already released its slot.
    if (existing.status !== 'cancelled' && existing.slot_id != null) {
      await this.releaseSlot(existing.slot_id);
    }
    return { success: true };
  }
}
