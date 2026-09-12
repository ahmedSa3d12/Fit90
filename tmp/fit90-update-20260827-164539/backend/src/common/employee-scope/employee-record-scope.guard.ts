import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtUser } from '../types/jwt-user';
import { EmployeeDataScopeService } from './employee-data-scope.service';

/** Protect every /employees/:id sub-resource, including finance and documents. */
@Injectable()
export class EmployeeRecordScopeGuard implements CanActivate {
  constructor(private readonly scope: EmployeeDataScopeService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ user?: JwtUser; params?: { id?: string } }>();
    const rawId = request.params?.id;
    if (rawId != null && /^\d+$/.test(rawId)) {
      this.scope.assertEmployeeAccess(request.user, Number(rawId));
    }
    return true;
  }
}
