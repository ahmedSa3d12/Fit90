import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtUser } from '../types/jwt-user';

/** Server-side data isolation for ordinary employee accounts (users.level = 2). */
@Injectable()
export class EmployeeDataScopeService {
  constructor(private readonly prisma: PrismaService) {}

  isSelfOnly(user?: JwtUser | null): boolean {
    return user?.level === 2;
  }

  employeeId(user?: JwtUser | null): number | null {
    if (!this.isSelfOnly(user)) return null;
    return user?.emp_code ?? null;
  }

  assertEmployeeAccess(user: JwtUser | undefined | null, employeeId: number): void {
    if (!this.isSelfOnly(user)) return;
    if (user?.emp_code == null || Number(user.emp_code) !== Number(employeeId)) {
      throw new ForbiddenException('لا يمكنك الوصول إلى بيانات موظف آخر');
    }
  }

  async providerId(user?: JwtUser | null): Promise<number | null> {
    if (!this.isSelfOnly(user)) return null;
    if (user?.emp_code == null) return -1;
    const provider = await this.prisma.club_trainers.findFirst({
      where: { employee_id: user.emp_code, is_deleted: false },
      select: { id: true },
    });
    return provider?.id ?? -1;
  }

  async scopedProviderId(
    user: JwtUser | undefined | null,
    requested?: number | null,
  ): Promise<number | null> {
    if (!this.isSelfOnly(user)) return requested ?? null;
    const ownProviderId = await this.providerId(user);
    if (ownProviderId == null || ownProviderId < 0) {
      throw new ForbiddenException('حساب الموظف غير مرتبط بمقدم خدمة');
    }
    if (requested != null && Number(requested) !== ownProviderId) {
      throw new ForbiddenException('لا يمكنك الوصول إلى جدول موظف آخر');
    }
    return ownProviderId;
  }

  async assertProviderAccess(user: JwtUser | undefined | null, providerId: number | null): Promise<void> {
    if (!this.isSelfOnly(user)) return;
    const ownProviderId = await this.providerId(user);
    if (providerId == null || ownProviderId == null || ownProviderId < 0 || providerId !== ownProviderId) {
      throw new ForbiddenException('لا يمكنك الوصول إلى مواعيد أو حجوزات موظف آخر');
    }
  }
}
