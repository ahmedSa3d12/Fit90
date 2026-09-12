import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtUser } from '../../common/types/jwt-user';
import { isBcryptHash, legacyHash } from './legacy-hash.util';

/** Faithful to legacy Auth.php: same failure message whether user is missing,
 *  password is wrong, or the account is not approved. */
const LOGIN_FAILED = 'لا يمكنك الدخول هناك بيان خاطىء';
const GENERAL_MANAGER_JOB_CODE = 1;

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  user: JwtUser;
  message: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async login(username: string, password: string): Promise<LoginResult> {
    // 1) Login accepts either the system username or the employee email.
    let user = await this.prisma.users.findFirst({
      where: { OR: [{ username }, { email: username }] },
    });
    if (!user && username.includes('@')) {
      const employee = await this.prisma.employees.findFirst({
        where: { email: username },
        select: { id: true },
      });
      if (employee) {
        user = await this.prisma.users.findFirst({ where: { emp_code: employee.id } });
      }
    }
    if (!user || user.approved !== 1) {
      throw new UnauthorizedException(LOGIN_FAILED);
    }

    // 2) Verify password — bcrypt going forward, legacy sha1(md5) tolerated.
    const stored = user.password ?? '';
    let valid = false;
    let needsRehash = false;
    if (isBcryptHash(stored)) {
      valid = await bcrypt.compare(password, stored);
    } else {
      valid = stored.length > 0 && legacyHash(password).toLowerCase() === stored.toLowerCase();
      needsRehash = valid; // upgrade legacy hash on successful login
    }
    if (!valid) {
      throw new UnauthorizedException(LOGIN_FAILED);
    }

    // 3) Resolve branch + man/women scope from the linked employee (faithful to Auth.php).
    let branch = 0;
    let manWomenType = 0;
    let isGeneralManager = false;
    if (user.emp_code != null) {
      const emp = await this.prisma.employees.findUnique({
        where: { id: user.emp_code },
        select: { branch_id_fk: true, emp_type: true, mosma_wazefy_code: true },
      });
      if (emp) {
        branch = emp.branch_id_fk ?? 0;
        manWomenType = emp.emp_type ?? 0;
        isGeneralManager = emp.mosma_wazefy_code === GENERAL_MANAGER_JOB_CODE;
      }
    }

    // A general manager is always a system administrator, even when the account
    // was imported as a normal employee. Persisting this also keeps token refreshes
    // and legacy page checks consistent after the first login.
    const promotedToAdmin = isGeneralManager && user.level !== 1;
    if (needsRehash || promotedToAdmin) {
      const data: Record<string, unknown> = {};
      if (needsRehash) {
        const rounds = this.config.get<number>('bcryptRounds') ?? 12;
        data.password = await bcrypt.hash(password, rounds);
        data.x_y_z = null;
        data.app_pass = null;
        data.pass_demo = null;
      }
      if (promotedToAdmin) data.level = 1;
      await this.prisma.users.update({ where: { user_id: user.user_id }, data });
    }

    const claims: JwtUser = {
      sub: user.user_id,
      level: promotedToAdmin ? 1 : user.level ?? null,
      emp_code: user.emp_code ?? null,
      branch,
      man_women_type: manWomenType,
      name: user.name ?? null,
      image: user.image ?? null,
    };

    return {
      ...(await this.signTokens(claims)),
      user: claims,
      message: 'تم تسجيل الدخول بنجاح',
    };
  }

  async changePassword(
    userId: number,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    const user = await this.prisma.users.findUnique({ where: { user_id: userId } });
    if (!user || user.approved !== 1) {
      throw new UnauthorizedException(LOGIN_FAILED);
    }

    const stored = user.password ?? '';
    let valid = false;
    if (isBcryptHash(stored)) {
      valid = await bcrypt.compare(currentPassword, stored);
    } else {
      valid = stored.length > 0 && legacyHash(currentPassword).toLowerCase() === stored.toLowerCase();
    }
    if (!valid) {
      throw new BadRequestException('كلمة المرور الحالية غير صحيحة');
    }

    const rounds = this.config.get<number>('bcryptRounds') ?? 12;
    const bhash = await bcrypt.hash(newPassword, rounds);
    await this.prisma.users.update({
      where: { user_id: user.user_id },
      data: { password: bhash, x_y_z: null, app_pass: null, pass_demo: null },
    });
    return { message: 'تم تغيير كلمة المرور بنجاح' };
  }

  async signTokens(claims: JwtUser): Promise<{ accessToken: string; refreshToken: string }> {
    const accessToken = await this.jwt.signAsync(claims, {
      secret: this.config.get<string>('jwt.accessSecret'),
      expiresIn: this.config.get<string>('jwt.accessTtl'),
    });
    const refreshToken = await this.jwt.signAsync(
      { sub: claims.sub },
      {
        secret: this.config.get<string>('jwt.refreshSecret'),
        expiresIn: this.config.get<string>('jwt.refreshTtl'),
      },
    );
    return { accessToken, refreshToken };
  }

  async refresh(refreshToken: string): Promise<{ accessToken: string; user: JwtUser }> {
    let sub: number;
    try {
      const payload = await this.jwt.verifyAsync<{ sub: number }>(refreshToken, {
        secret: this.config.get<string>('jwt.refreshSecret'),
      });
      sub = payload.sub;
    } catch {
      throw new UnauthorizedException('انتهت الجلسة');
    }
    const user = await this.prisma.users.findUnique({ where: { user_id: sub } });
    if (!user || user.approved !== 1) throw new UnauthorizedException('انتهت الجلسة');

    let branch = 0;
    let manWomenType = 0;
    if (user.emp_code != null) {
      const emp = await this.prisma.employees.findFirst({
        where: { emp_code: user.emp_code },
        select: { branch_id_fk: true, emp_type: true },
      });
      if (emp) {
        branch = emp.branch_id_fk ?? 0;
        manWomenType = emp.emp_type ?? 0;
      }
    }
    const claims: JwtUser = {
      sub: user.user_id,
      level: user.level ?? null,
      emp_code: user.emp_code ?? null,
      branch,
      man_women_type: manWomenType,
      name: user.name ?? null,
      image: user.image ?? null,
    };
    const accessToken = await this.jwt.signAsync(claims, {
      secret: this.config.get<string>('jwt.accessSecret'),
      expiresIn: this.config.get<string>('jwt.accessTtl'),
    });
    return { accessToken, user: claims };
  }
}
