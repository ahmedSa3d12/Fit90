import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { ACTIONS, flattenCatalog } from '../catalog/rbac.catalog';
import { PermissionEngineService } from '../engine/permission-engine.service';

export interface CatalogActionDto {
  key: string;
  labelAr: string;
  labelEn: string;
  sensitive: boolean;
  sortOrder: number;
}

export interface CatalogNodeDto {
  key: string;
  type: 'module' | 'group' | 'page';
  nameAr: string;
  nameEn: string | null;
  route: string | null;
  icon: string | null;
  sortOrder: number;
  /** action keys applicable on this node (the matrix cells that exist for it). */
  actions: string[];
  children: CatalogNodeDto[];
}

/**
 * Serves the resource tree + action set for the permission matrix.
 *
 * The sidebar-backed catalog is authoritative. We synchronize it into the DB
 * before reading so a menu move/rename is reflected immediately without
 * waiting for a manual seed, while stored role grants keep their stable keys.
 */
@Injectable()
export class RbacCatalogService {
  private syncPromise?: Promise<void>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: PermissionEngineService,
  ) {}

  async getCatalog(): Promise<{ actions: CatalogActionDto[]; tree: CatalogNodeDto[] }> {
    await this.ensureCatalogSynced();

    const [actions, resources, resourceActions] = await Promise.all([
      this.prisma.rbac_actions.findMany({ orderBy: { sort_order: 'asc' } }),
      this.prisma.rbac_resources.findMany({
        where: { is_active: true },
        orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.rbac_resource_actions.findMany(),
    ]);

    const actionKeyById = new Map(actions.map((a) => [a.id, a.key]));
    const actionsByResource = new Map<number, string[]>();
    for (const ra of resourceActions) {
      const key = actionKeyById.get(ra.action_id);
      if (!key) continue;
      const arr = actionsByResource.get(ra.resource_id) ?? [];
      arr.push(key);
      actionsByResource.set(ra.resource_id, arr);
    }
    // keep action order stable (matches the actions[] column order)
    const actionOrder = new Map(actions.map((a, i) => [a.key, i]));
    const sortActions = (keys: string[]) =>
      [...keys].sort((a, b) => (actionOrder.get(a) ?? 99) - (actionOrder.get(b) ?? 99));

    const nodeById = new Map<number, CatalogNodeDto>();
    for (const r of resources) {
      nodeById.set(r.id, {
        key: r.key,
        type: r.type as CatalogNodeDto['type'],
        nameAr: r.name_ar,
        nameEn: r.name_en,
        route: r.route,
        icon: r.icon,
        sortOrder: r.sort_order,
        actions: sortActions(actionsByResource.get(r.id) ?? []),
        children: [],
      });
    }
    const roots: CatalogNodeDto[] = [];
    for (const r of resources) {
      const node = nodeById.get(r.id)!;
      if (r.parent_id && nodeById.has(r.parent_id)) nodeById.get(r.parent_id)!.children.push(node);
      else roots.push(node);
    }

    return {
      actions: actions.map((a) => ({
        key: a.key,
        labelAr: a.label_ar,
        labelEn: a.label_en,
        sensitive: a.sensitive,
        sortOrder: a.sort_order,
      })),
      tree: roots,
    };
  }

  private ensureCatalogSynced(): Promise<void> {
    if (!this.syncPromise) {
      this.syncPromise = this.syncCatalog().catch((error) => {
        this.syncPromise = undefined;
        throw error;
      });
    }
    return this.syncPromise;
  }

  private async syncCatalog(): Promise<void> {
    await Promise.all(
      ACTIONS.map((action) =>
        this.prisma.rbac_actions.upsert({
          where: { key: action.key },
          update: {
            label_ar: action.labelAr,
            label_en: action.labelEn,
            sensitive: action.sensitive,
            sort_order: action.sortOrder,
          },
          create: {
            key: action.key,
            label_ar: action.labelAr,
            label_en: action.labelEn,
            sensitive: action.sensitive,
            sort_order: action.sortOrder,
          },
        }),
      ),
    );

    const actionRows = await this.prisma.rbac_actions.findMany({
      select: { id: true, key: true },
    });
    const actionIdByKey = new Map(actionRows.map((row) => [row.key, row.id]));
    const flat = flattenCatalog();
    const resourceIdByKey = new Map<string, number>();

    // Depth-first catalog order guarantees that every parent is available
    // before its children are synchronized.
    for (const resource of flat) {
      const parentId = resource.parentKey
        ? resourceIdByKey.get(resource.parentKey) ?? null
        : null;
      const row = await this.prisma.rbac_resources.upsert({
        where: { key: resource.key },
        update: {
          parent_id: parentId,
          type: resource.type,
          name_ar: resource.nameAr,
          name_en: resource.nameEn ?? null,
          route: resource.route ?? null,
          icon: resource.icon ?? null,
          sort_order: resource.sortOrder,
          is_active: true,
        },
        create: {
          key: resource.key,
          parent_id: parentId,
          type: resource.type,
          name_ar: resource.nameAr,
          name_en: resource.nameEn ?? null,
          route: resource.route ?? null,
          icon: resource.icon ?? null,
          sort_order: resource.sortOrder,
          is_active: true,
        },
        select: { id: true },
      });
      resourceIdByKey.set(resource.key, row.id);

      const actionIds = resource.actions
        .map((key) => actionIdByKey.get(key))
        .filter((id): id is number => id != null);
      await this.prisma.rbac_resource_actions.deleteMany({
        where: { resource_id: row.id, action_id: { notIn: actionIds } },
      });
      await this.prisma.rbac_resource_actions.createMany({
        data: actionIds.map((action_id) => ({ resource_id: row.id, action_id })),
        skipDuplicates: true,
      });
    }

    await this.prisma.rbac_resources.updateMany({
      where: {
        key: { notIn: flat.map((resource) => resource.key) },
        is_active: true,
      },
      data: { is_active: false },
    });

    this.engine.invalidateCatalog();
    this.engine.invalidateAll();
  }
}
