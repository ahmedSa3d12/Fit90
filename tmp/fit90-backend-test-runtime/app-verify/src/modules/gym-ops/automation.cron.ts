import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AutomationEngineService } from './automation-engine.service';

@Injectable()
export class AutomationCron {
  private readonly log = new Logger(AutomationCron.name);

  constructor(private readonly engine: AutomationEngineService) {}

  /** Every 15 minutes — expiry follow-ups, outstanding tasks. */
  @Cron('*/15 * * * *', { timeZone: 'Africa/Cairo' })
  async handleScheduledAutomation() {
    const result = await this.engine.processScheduledTriggers();
    if (result.expired + result.expiring + result.outstanding > 0) {
      this.log.log(
        `Automation: expired=${result.expired} expiring=${result.expiring} outstanding=${result.outstanding}`,
      );
    }
  }
}
