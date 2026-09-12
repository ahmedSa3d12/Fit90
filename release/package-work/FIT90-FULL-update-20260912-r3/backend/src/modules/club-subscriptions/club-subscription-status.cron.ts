import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AutomationEngineService } from '../gym-ops/automation-engine.service';
import { ClubSubscriptionsService } from './club-subscriptions.service';

@Injectable()
export class ClubSubscriptionStatusCron {
  private readonly log = new Logger(ClubSubscriptionStatusCron.name);

  constructor(
    private readonly subscriptions: ClubSubscriptionsService,
    private readonly automation: AutomationEngineService,
  ) {}

  @Cron('0 2 * * *', { timeZone: 'Africa/Cairo' })
  async handleExpired() {
    const expiredSubs = await this.subscriptions.findNewlyExpired();
    const count = await this.subscriptions.updateExpiredStatuses();
    if (count > 0) this.log.log(`Marked ${count} subscriptions as expired`);

    for (const sub of expiredSubs) {
      if (!sub.member_id) continue;
      void this.automation.emit('subscription_expired', {
        memberId: sub.member_id,
        subscriptionId: sub.id,
        branchId: sub.branch_id,
        memberName: sub.customer_name ?? '—',
        subscriptionNumber: sub.subscription_number,
        daysOffset: 0,
      });
    }
  }

  /** Applies the selected freeze windows at the start of each Cairo day. */
  @Cron('5 0 * * *', { timeZone: 'Africa/Cairo' })
  async handleFreezeWindows() {
    const [ended, started] = await Promise.all([
      this.subscriptions.completeDueFreezes(),
      this.subscriptions.startScheduledFreezes(),
    ]);
    if (ended > 0 || started > 0) {
      this.log.log(`Applied timed freezes: ${started} started, ${ended} ended`);
    }
  }
}
