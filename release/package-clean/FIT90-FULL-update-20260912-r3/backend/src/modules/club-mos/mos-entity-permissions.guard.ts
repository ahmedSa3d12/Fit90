import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { PermissionEngineService } from '../rbac/engine/permission-engine.service';
import { flattenCatalog } from '../rbac/catalog/rbac.catalog';
import { routeForEntityKey } from './mos-entity.registry';

const RESOURCE_KEY_BY_ROUTE = new Map(
  flattenCatalog()
    .filter((resource) => resource.route)
    .map((resource) => [resource.route!, resource.key]),
);

const ACTION_BY_HTTP_METHOD: Record<string, string> = {
  GET: 'view',
  POST: 'create',
  PUT: 'update',
  DELETE: 'delete',
};

/** Enforces the RBAC resource that owns a parameterized MOS entity endpoint. */
@Injectable()
export class MosEntityPermissionsGuard implements CanActivate {
  constructor(private readonly engine: PermissionEngineService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      user?: { sub: number };
      params?: { key?: string };
      method?: string;
    }>();
    const userId = request.user?.sub;
    if (!userId) throw new ForbiddenException('ليس لديك صلاحية للوصول');

    const action = ACTION_BY_HTTP_METHOD[request.method ?? 'GET'] ?? 'view';
    const route = request.params?.key ? routeForEntityKey(request.params.key) : null;
    const resourceKey = route ? RESOURCE_KEY_BY_ROUTE.get(route) : undefined;
    const candidates = resourceKey
      ? [`${resourceKey}:${action}`]
      : [`mos:${action}`, `club.members:${action}`];

    if (!(await this.engine.canAny(userId, candidates))) {
      throw new ForbiddenException('ليس لديك صلاحية للوصول');
    }
    return true;
  }
}
