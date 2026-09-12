import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface NotificationView {
  id: number;
  title: string;
  body: string;
  url: string | null;
  read: boolean;
  date: string | null;
  time: string | null;
}

interface StoredNotificationContent {
  title?: string;
  body?: string;
  url?: string;
}

export interface AlertItem {
  empId: number;
  empCode: number | null;
  name: string | null;
  date: string;
  daysLeft: number;
}

/** Parses the legacy varchar Gregorian dates (YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY). */
function parseLooseDate(s?: string | null): Date | null {
  if (!s) return null;
  const v = s.trim();
  if (!v || v === '0' || v.startsWith('0000')) return null;
  let m: RegExpMatchArray | null;
  if ((m = v.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/))) {
    return safeDate(+m[1], +m[2], +m[3]);
  }
  if ((m = v.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/))) {
    return safeDate(+m[3], +m[2], +m[1]);
  }
  return null;
}
function safeDate(y: number, mo: number, d: number): Date | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return isNaN(dt.getTime()) ? null : dt;
}
function daysUntil(d: Date, today: Date): number {
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}

/** n_code buckets for proactive alert notifications (map to settings titles when present). */
const ALERT_N_CODE: Record<string, number> = {
  contractExpiring: 9001,
  residencyExpiring: 9002,
  insuranceExpiring: 9003,
  probationEnding: 9004,
  birthdays: 9005,
};

const ALERT_TITLES: Record<string, string> = {
  contractExpiring: 'عقد يوشك على الانتهاء',
  residencyExpiring: 'إقامة توشك على الانتهاء',
  insuranceExpiring: 'تأمين طبي يوشك على الانتهاء',
  probationEnding: 'فترة تجربة توشك على الانتهاء',
  birthdays: 'عيد ميلاد قريب',
};

function parseStoredContent(message?: string | null): StoredNotificationContent {
  if (!message?.trim()) return {};
  try {
    const parsed = JSON.parse(message) as StoredNotificationContent;
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {
    // Legacy rows stored a single "title — body" string.
  }
  const [title, ...bodyParts] = message.split(' — ');
  return { title: title.trim(), body: bodyParts.join(' — ').trim() };
}

@Injectable()
export class NotificationsService {
  private readonly log = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async list(userId: number): Promise<NotificationView[]> {
    const rows = await this.prisma.tbl_notifications.findMany({
      where: { to_user: userId },
      orderBy: { id: 'desc' },
      take: 50,
    });
    const notificationIds = rows.map((row) => row.id);
    const senderIds = [
      ...new Set(rows.flatMap((row) => row.from_user == null ? [] : [row.from_user])),
    ];
    const [settings, contentRows, senders] = await Promise.all([
      this.prisma.tbl_sys_notifications_settings.findMany(),
      notificationIds.length
        ? this.prisma.users_notifications.findMany({
            where: { notify_id_fk: { in: notificationIds } },
            orderBy: { id: 'desc' },
          })
        : [],
      senderIds.length
        ? this.prisma.users.findMany({
            where: { user_id: { in: senderIds } },
            select: { user_id: true, name: true },
          })
        : [],
    ]);
    const byCode = new Map(settings.map((s) => [s.code, s]));
    const contentByNotification = new Map<number, (typeof contentRows)[number]>();
    for (const content of contentRows) {
      if (content.notify_id_fk != null && !contentByNotification.has(content.notify_id_fk)) {
        contentByNotification.set(content.notify_id_fk, content);
      }
    }
    const senderById = new Map<number, string | null>(
      senders.map((sender) => [sender.user_id, sender.name] as const),
    );

    return rows.map((notification) => {
      const contentRow = contentByNotification.get(notification.id);
      const content = parseStoredContent(contentRow?.message);
      const setting = notification.n_code != null ? byCode.get(notification.n_code) : null;
      const senderName = notification.from_user != null
        ? senderById.get(notification.from_user)
        : null;
      return {
        id: notification.id,
        title: content.title?.trim()
          || setting?.title?.trim()
          || (senderName ? `إشعار من ${senderName}` : 'إشعار'),
        body: content.body?.trim() ?? '',
        url: content.url?.trim() || contentRow?.url?.trim() || setting?.url?.trim() || null,
        read: notification.seen === 1,
        date: notification.date_ar ?? null,
        time: notification.time_ar ?? null,
      };
    });
  }

  async count(userId: number): Promise<number> {
    return this.prisma.tbl_notifications.count({ where: { to_user: userId, seen: 0 } });
  }

  async markRead(userId: number, id: number) {
    const now = new Date();
    await this.prisma.tbl_notifications.updateMany({
      where: { id, to_user: userId },
      data: {
        seen: 1,
        seen_date: now.toISOString().slice(0, 10),
        seen_time: now.toTimeString().slice(0, 8),
      },
    });
    return { id, read: true };
  }

  async markAllRead(userId: number) {
    const now = new Date();
    const res = await this.prisma.tbl_notifications.updateMany({
      where: { to_user: userId, seen: 0 },
      data: {
        seen: 1,
        seen_date: now.toISOString().slice(0, 10),
        seen_time: now.toTimeString().slice(0, 8),
      },
    });
    return { updated: res.count };
  }

  /**
   * DELETE /notifications/:id — faithful to Notifications::delete.
   * Scoped to the current user's own notifications (the legacy ownership check
   * was commented out, but we keep it scoped so users cannot delete others').
   */
  async remove(userId: number, id: number) {
    const owned = await this.prisma.tbl_notifications.findFirst({
      where: { id, to_user: userId },
      select: { id: true },
    });
    if (!owned) return { id, deleted: 0 };
    await this.prisma.users_notifications.deleteMany({ where: { notify_id_fk: id } });
    const res = await this.prisma.tbl_notifications.deleteMany({
      where: { id, to_user: userId },
    });
    return { id, deleted: res.count };
  }

  /** DELETE /notifications — faithful to Notifications::delete_all (current user). */
  async removeAll(userId: number) {
    const owned = await this.prisma.tbl_notifications.findMany({
      where: { to_user: userId },
      select: { id: true },
    });
    const ids = owned.map((notification) => notification.id);
    if (ids.length) {
      await this.prisma.users_notifications.deleteMany({
        where: { notify_id_fk: { in: ids } },
      });
    }
    const res = await this.prisma.tbl_notifications.deleteMany({
      where: { to_user: userId },
    });
    return { deleted: res.count };
  }

  /** Derived alerts from employee data (contracts, residency, insurance, birthdays, probation). */
  async alerts() {
    const g = await this.prisma.global_settings.findFirst();
    const contractDays = g?.alert_days_contract ?? 30;
    const residencyDays = g?.alert_days_quest ?? 30;
    const today = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));

    const emps = await this.prisma.employees.findMany({
      where: { OR: [{ leave_emp: null }, { leave_emp: 0 }] },
      select: {
        id: true,
        emp_code: true,
        employee: true,
        birth_date_m: true,
        end_contract_date_m: true,
        end_test_date_m: true,
        card_enhaa_date: true,
        tamin_medicine_end_date: true,
      },
    });

    const contractExpiring: AlertItem[] = [];
    const residencyExpiring: AlertItem[] = [];
    const insuranceExpiring: AlertItem[] = [];
    const probationEnding: AlertItem[] = [];
    const birthdays: AlertItem[] = [];

    const within = (raw: string | null | undefined, win: number, bucket: AlertItem[], e: (typeof emps)[number]) => {
      const d = parseLooseDate(raw);
      if (!d) return;
      const left = daysUntil(d, today);
      if (left >= 0 && left <= win) {
        bucket.push({ empId: e.id, empCode: e.emp_code, name: e.employee, date: raw!, daysLeft: left });
      }
    };

    for (const e of emps) {
      within(e.end_contract_date_m, contractDays, contractExpiring, e);
      within(e.card_enhaa_date, residencyDays, residencyExpiring, e);
      within(e.tamin_medicine_end_date, 30, insuranceExpiring, e);
      within(e.end_test_date_m, 14, probationEnding, e);

      const bd = parseLooseDate(e.birth_date_m);
      if (bd) {
        const next = new Date(Date.UTC(today.getUTCFullYear(), bd.getUTCMonth(), bd.getUTCDate()));
        let left = daysUntil(next, today);
        if (left < 0) left = daysUntil(new Date(Date.UTC(today.getUTCFullYear() + 1, bd.getUTCMonth(), bd.getUTCDate())), today);
        if (left >= 0 && left <= 7) {
          birthdays.push({ empId: e.id, empCode: e.emp_code, name: e.employee, date: e.birth_date_m!, daysLeft: left });
        }
      }
    }

    const sortByDays = (a: AlertItem, b: AlertItem) => a.daysLeft - b.daysLeft;
    return {
      contractExpiring: contractExpiring.sort(sortByDays),
      residencyExpiring: residencyExpiring.sort(sortByDays),
      insuranceExpiring: insuranceExpiring.sort(sortByDays),
      probationEnding: probationEnding.sort(sortByDays),
      birthdays: birthdays.sort(sortByDays),
    };
  }

  /**
   * Proactive materialisation of the derived {@link alerts} into persisted
   * tbl_notifications rows, so staff see them on login (not only on the live
   * dashboard). Purely additive: inserts new rows, never mutates existing ones.
   *
   * Idempotent — before inserting an alert for an employee it checks for an
   * existing equivalent *unread* row (same recipient + n_code + fk_id target,
   * seen=0) and skips duplicates. Safe to run repeatedly (e.g. daily). Each
   * insert is wrapped in try/catch so one bad row cannot abort the batch.
   *
   * @returns counts of rows inserted vs skipped as duplicates.
   */
  async materializeAlerts(): Promise<{ inserted: number; skipped: number; recipients: number }> {
    const groups = await this.alerts();

    // Flatten every alert group into (n_code, empId) targets.
    const targets: { key: string; nCode: number; item: AlertItem }[] = [];
    for (const [key, nCode] of Object.entries(ALERT_N_CODE)) {
      const items = (groups as Record<string, AlertItem[]>)[key] ?? [];
      for (const item of items) targets.push({ key, nCode, item });
    }
    if (targets.length === 0) return { inserted: 0, skipped: 0, recipients: 0 };

    // Recipients: admin users (level 1) so alerts surface on staff login.
    const recipients = await this.prisma.users.findMany({
      where: { level: 1 },
      select: { user_id: true },
    });
    if (recipients.length === 0) return { inserted: 0, skipped: 0, recipients: 0 };

    const now = new Date();
    const dateAr = now.toISOString().slice(0, 10);
    const timeAr = now.toISOString().slice(11, 19);

    let inserted = 0;
    let skipped = 0;

    for (const { user_id: toUser } of recipients) {
      for (const { key, nCode, item } of targets) {
        const fkId = BigInt(item.empId);
        try {
          // Idempotency: skip if an equivalent unread row already exists for
          // this recipient + alert type + employee target.
          const existing = await this.prisma.tbl_notifications.findFirst({
            where: { to_user: toUser, n_code: nCode, fk_id: fkId, seen: 0 },
            select: { id: true },
          });
          if (existing) {
            skipped += 1;
            continue;
          }
          const notification = await this.prisma.tbl_notifications.create({
            data: {
              to_user: toUser,
              n_code: nCode,
              fk_id: fkId,
              seen: 0,
              date_ar: dateAr,
              time_ar: timeAr,
            },
          });
          const title = ALERT_TITLES[key] ?? 'تنبيه موظف';
          const employeeName = item.name?.trim() || `الموظف #${item.empCode ?? item.empId}`;
          const body = `${employeeName} — متبقي ${item.daysLeft} يوم (${item.date})`;
          const url = `/employees/${item.empId}`;
          await this.prisma.users_notifications.create({
            data: {
              notify_id_fk: notification.id,
              message: JSON.stringify({ title, body, url } satisfies StoredNotificationContent),
              url,
              date: dateAr,
              type: 1,
              approved: 0,
            },
          });
          inserted += 1;
        } catch (err) {
          // One bad row must not abort the whole job.
          this.log.warn(
            `materializeAlerts: failed to insert notification (user=${toUser}, code=${nCode}, emp=${item.empId}): ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
      }
    }

    if (inserted > 0) this.log.log(`materializeAlerts: inserted ${inserted}, skipped ${skipped} duplicate(s)`);
    return { inserted, skipped, recipients: recipients.length };
  }
}
