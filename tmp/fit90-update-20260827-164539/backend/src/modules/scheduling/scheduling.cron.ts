import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Dispatches queued appointment reminders. Runs hourly; any `pending`
 * appointment_reminder whose `send_at` (yyyy-mm-dd HH:mm) has passed is flipped
 * to `sent` so notification consumers surface it. Kept deliberately simple —
 * enqueuing happens in SchedulingNotificationsService at booking time.
 */
@Injectable()
export class SchedulingCron {
  private readonly log = new Logger(SchedulingCron.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_HOUR, { timeZone: 'Africa/Cairo' })
  async dispatchDueReminders() {
    try {
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(
        now.getHours(),
      )}:${pad(now.getMinutes())}`;

      const res = await this.prisma.club_notifications.updateMany({
        where: { type: 'appointment_reminder', status: 'pending', send_at: { lte: stamp } },
        data: { status: 'sent' },
      });
      if (res.count > 0) this.log.log(`Dispatched ${res.count} appointment reminder(s)`);
    } catch (err) {
      this.log.error(
        `Reminder dispatch failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
