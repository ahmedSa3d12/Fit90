import { Injectable, Logger } from '@nestjs/common';
import { ClubNotificationType } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

/** A booking snapshot rich enough to compose notification text. */
export interface BookingNotifyContext {
  bookingId: number;
  scheduleId: number;
  memberId: number | null;
  memberName: string | null;
  serviceName: string | null;
  slotDate: string;
  startTime: string;
  branchId: number | null;
  userId?: number | null;
}

/**
 * Owns the scheduling engine's outbound notification channel (club_notifications).
 * Booking lifecycle events are recorded here; a cron dispatches reminders. This
 * is intentionally decoupled from the legacy tbl_notifications so the engine has
 * a single, reusable notification path with no duplicated logic.
 */
@Injectable()
export class SchedulingNotificationsService {
  private readonly log = new Logger(SchedulingNotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  private label(ctx: BookingNotifyContext): string {
    const who = ctx.memberName ?? (ctx.memberId != null ? `member #${ctx.memberId}` : 'guest');
    const svc = ctx.serviceName ?? 'appointment';
    return `${who} — ${svc} on ${ctx.slotDate} ${ctx.startTime}`;
  }

  private async record(data: {
    type: ClubNotificationType;
    ctx: BookingNotifyContext;
    title: string;
    message: string;
    sendAt?: string | null;
  }) {
    try {
      await this.prisma.club_notifications.create({
        data: {
          type: data.type,
          booking_id: data.ctx.bookingId,
          schedule_id: data.ctx.scheduleId,
          member_id: data.ctx.memberId,
          to_user: data.ctx.userId ?? null,
          title: data.title,
          message: data.message,
          send_at: data.sendAt ?? null,
          status: data.sendAt ? 'pending' : 'sent',
          branch_id: data.ctx.branchId,
        },
      });
    } catch (err) {
      // A notification failure must never break the booking transaction.
      this.log.warn(
        `failed to record ${data.type} for booking #${data.ctx.bookingId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  async bookingConfirmed(ctx: BookingNotifyContext) {
    await this.record({
      type: 'booking_confirmed',
      ctx,
      title: 'Booking confirmed',
      message: `Booking confirmed: ${this.label(ctx)}.`,
    });
    // Queue a reminder for the day before (best-effort; dispatched by cron).
    await this.queueReminder(ctx);
  }

  async bookingCancelled(ctx: BookingNotifyContext) {
    await this.record({
      type: 'booking_cancelled',
      ctx,
      title: 'Booking cancelled',
      message: `Booking cancelled: ${this.label(ctx)}.`,
    });
    // Drop any still-pending reminder for this booking.
    try {
      await this.cancelReminders(ctx.bookingId);
    } catch (err) {
      this.log.warn(
        `failed to cancel reminders for booking #${ctx.bookingId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  async scheduleChanged(ctx: BookingNotifyContext, detail: string) {
    await this.record({
      type: 'schedule_changed',
      ctx,
      title: 'Schedule changed',
      message: `Schedule changed for ${this.label(ctx)}: ${detail}`,
    });
  }

  /** Queue a reminder ~24h before the appointment (send_at = day before, same time). */
  async queueReminder(ctx: BookingNotifyContext) {
    const dayBefore = this.minusOneDay(ctx.slotDate);
    if (!dayBefore) return;
    await this.record({
      type: 'appointment_reminder',
      ctx,
      title: 'Upcoming appointment',
      message: `Reminder: ${this.label(ctx)}.`,
      sendAt: `${dayBefore} ${ctx.startTime}`,
    });
  }

  async cancelReminders(bookingId: number) {
    await this.prisma.club_notifications.updateMany({
      where: { booking_id: bookingId, type: 'appointment_reminder', status: 'pending' },
      data: { status: 'cancelled' },
    });
  }

  private minusOneDay(dateStr: string): string | null {
    const d = new Date(`${dateStr}T12:00:00`);
    if (Number.isNaN(d.getTime())) return null;
    d.setDate(d.getDate() - 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
}
