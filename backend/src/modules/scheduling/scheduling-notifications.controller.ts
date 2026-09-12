import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';

/** Read-only feed of scheduling notifications (booking events + reminders). */
@UseGuards(JwtAuthGuard)
@Controller('scheduling/notifications')
@RequiresPermission('club.fitness:view')
export class SchedulingNotificationsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(
    @Query('status') status?: string,
    @Query('memberId') memberId?: string,
    @Query('limit') limit?: string,
  ) {
    const where: Prisma.club_notificationsWhereInput = {};
    if (status && status !== 'all') where.status = status;
    if (memberId) where.member_id = parseInt(memberId, 10);
    const take = Math.min(Math.max(parseInt(limit ?? '50', 10) || 50, 1), 200);
    const rows = await this.prisma.club_notifications.findMany({
      where,
      orderBy: { id: 'desc' },
      take,
    });
    return rows.map((r) => ({
      id: r.id,
      type: r.type,
      bookingId: r.booking_id,
      scheduleId: r.schedule_id,
      memberId: r.member_id,
      title: r.title,
      message: r.message,
      sendAt: r.send_at,
      status: r.status,
      channel: r.channel,
      createdAt: r.created_at,
    }));
  }
}
