import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthService, LoginResult } from '../auth/auth.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtUser } from '../../common/types/jwt-user';

/**
 * Mobile API foundation — employee-facing slice of the legacy Api.php controller.
 * Self-contained: data via PrismaService, auth/token issuance delegated to AuthService.
 * Each mutating helper resolves the caller's employee row from JwtUser.emp_code
 * (users.emp_code === employees.emp_code, the cross-table business key).
 */
@Injectable()
export class MobileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  /** Delegate to the shared AuthService so the mobile app gets the exact same tokens + claims. */
  login(username: string, password: string): Promise<LoginResult> {
    return this.auth.login(username, password);
  }

  /** Safe employee profile for the logged-in user (name, code, branch, job, photo). */
  async profile(user: JwtUser) {
    const account = await this.prisma.users.findUnique({ where: { user_id: user.sub } });
    if (!account) throw new NotFoundException('المستخدم غير موجود');

    const empCode = account.emp_code ?? user.emp_code;
    const emp =
      empCode != null
        ? await this.prisma.employees.findFirst({ where: { emp_code: empCode } })
        : null;

    return {
      userId: account.user_id,
      empCode: empCode ?? null,
      name: emp?.employee ?? account.name ?? '',
      branch: emp?.branch_id_fk ?? account.branch_id_fk ?? null,
      job: emp?.mosma_wazefy_n ?? null,
      photo: emp?.personal_photo ?? account.image ?? null,
      email: emp?.email ?? account.email ?? null,
      phone: emp?.phone ?? null,
    };
  }

  /** Persist the FCM/device token on the user row (legacy update_token). */
  async setDeviceToken(user: JwtUser, token: string) {
    const account = await this.prisma.users.findUnique({ where: { user_id: user.sub } });
    if (!account) throw new NotFoundException('المستخدم غير موجود');
    await this.prisma.users.update({
      where: { user_id: user.sub },
      data: { device_token: token },
    });
    return { ok: true };
  }

  /** Latest 50 notifications delivered to the current user. */
  async notifications(user: JwtUser) {
    const rows = await this.prisma.tbl_notifications.findMany({
      where: { to_user: user.sub },
      orderBy: { id: 'desc' },
      take: 50,
    });
    const data = rows.map((n) => ({
      id: n.id,
      fromUser: n.from_user,
      date: n.date_ar,
      time: n.time_ar,
      seen: n.seen === 1,
      seenDate: n.seen_date,
      code: n.n_code,
      notifyId: n.notify_id_fk,
      targetId: n.fk_id != null ? Number(n.fk_id) : null,
    }));
    return { data };
  }

  /** Mark one of the current user's notifications as seen (legacy seen flag + seen_date/time). */
  async markNotificationRead(user: JwtUser, id: number) {
    const notif = await this.prisma.tbl_notifications.findUnique({ where: { id } });
    if (!notif) throw new NotFoundException('الإشعار غير موجود');
    if (notif.to_user !== user.sub) throw new ForbiddenException('غير مصرح');

    const now = new Date();
    await this.prisma.tbl_notifications.update({
      where: { id },
      data: {
        seen: 1,
        seen_date: now.toISOString().slice(0, 10),
        seen_time: now.toTimeString().slice(0, 5),
      },
    });
    return { id, seen: true };
  }
}
