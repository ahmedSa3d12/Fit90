import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificationsService } from './notifications.service';

/**
 * Proactive notifications job. Once a day it materialises the derived employee
 * alerts (contracts / residency / insurance / probation / birthdays expiring
 * soon) into persisted tbl_notifications rows so staff see them on login rather
 * than only on the live dashboard.
 *
 * The heavy lifting (and idempotency + per-row safety) lives in
 * {@link NotificationsService.materializeAlerts}; this class is a thin trigger.
 */
@Injectable()
export class NotificationsCron {
  private readonly log = new Logger(NotificationsCron.name);

  constructor(private readonly notifications: NotificationsService) {}

  @Cron(CronExpression.EVERY_DAY_AT_6AM, { timeZone: 'Africa/Cairo' })
  async handleDailyAlerts() {
    try {
      const res = await this.notifications.materializeAlerts();
      if (res.inserted > 0) {
        this.log.log(
          `Daily alerts: inserted ${res.inserted}, skipped ${res.skipped} duplicate(s) across ${res.recipients} recipient(s)`,
        );
      }
    } catch (err) {
      this.log.error(
        `Daily alerts job failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
