/* eslint-disable no-console */
/**
 * Master demo seed orchestrator.
 *
 * Order matters (FK dependencies):
 *   foundation → RBAC → HR → club → gym-sales → accounting/app/misc
 *
 * Canonical full reset + seed:   npm run db:reseed
 *   (= `prisma db push --force-reset` to wipe+recreate schema, then this seed)
 * Re-seed on top of current DB:   npm run db:seed
 *   (each module TRUNCATEs its own tables first, so this is idempotent)
 */
import { prisma } from './seed/_shared';
import { seedFoundation } from './seed/00-foundation';
import { seedRbac } from './seed-rbac';
import { seedHrAttendance } from './seed/10-hr-attendance';
import { seedClub } from './seed/20-club';
import { seedMosClub } from './seed/25-mos-club';
import { seedClubExtras } from './seed/30-club-extras';

/**
 * A few sample RBAC data-scopes + user exceptions so the admin RBAC screens
 * (roles/scopes, exceptions) aren't empty. All effects are `allow` / non-blocking
 * so nothing gets locked out.
 */
async function seedRbacExtras() {
  console.log('▶ RBAC extras…');
  await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
  await prisma.$executeRawUnsafe('TRUNCATE TABLE `rbac_role_scopes`');
  await prisma.$executeRawUnsafe('TRUNCATE TABLE `rbac_user_exceptions`');
  await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');

  const roleByKey = new Map(
    (await prisma.rbac_roles.findMany({ select: { id: true, key: true } })).map((r) => [r.key, r.id]),
  );
  const resByKey = new Map(
    (await prisma.rbac_resources.findMany({ select: { id: true, key: true } })).map((r) => [r.key, r.id]),
  );
  const actByKey = new Map(
    (await prisma.rbac_actions.findMany({ select: { id: true, key: true } })).map((a) => [a.key, a.id]),
  );

  // Branch/department data-scopes for the branch_manager role.
  const bm = roleByKey.get('branch_manager');
  const scopeCells: Array<{ res: string; scope: 'own' | 'team' | 'branch' | 'department' | 'global' }> = [
    { res: 'employees', scope: 'branch' },
    { res: 'attendance', scope: 'branch' },
    { res: 'club', scope: 'branch' },
    { res: 'reports', scope: 'branch' },
  ];
  if (bm) {
    for (const c of scopeCells) {
      const resource_id = resByKey.get(c.res);
      if (!resource_id) continue;
      await prisma.rbac_role_scopes.create({
        data: { role_id: bm, resource_id, scope: c.scope as any },
      }).catch(() => undefined);
    }
  }

  // A couple of per-user exceptions (grants) on non-admin staff users.
  const staff = await prisma.users.findMany({
    where: { level: 2 },
    select: { user_id: true },
    orderBy: { user_id: 'asc' },
    take: 3,
  });
  const exGrants: Array<{ res: string; act: string; reason: string }> = [
    { res: 'reports', act: 'export', reason: 'مخوّل بتصدير التقارير مؤقتاً' },
    { res: 'club.members', act: 'view', reason: 'وصول استثنائي لملفات الأعضاء' },
    { res: 'attendance', act: 'view', reason: 'اطلاع على سجل الحضور' },
  ];
  for (let i = 0; i < staff.length && i < exGrants.length; i++) {
    const resource_id = resByKey.get(exGrants[i].res);
    const action_id = actByKey.get(exGrants[i].act);
    if (!resource_id || !action_id) continue;
    await prisma.rbac_user_exceptions.create({
      data: {
        user_id: staff[i].user_id,
        resource_id,
        action_id,
        effect: 'allow',
        reason: exGrants[i].reason,
        created_by: 1,
      },
    }).catch(() => undefined);
  }
  console.log('✔ RBAC extras done');
}

async function main() {
  const t0 = Date.now();
  console.log('=== ONE80 demo seed ===');

  await seedFoundation();

  // Fresh role assignments on re-run (harmless after force-reset; needed for dirty re-run).
  await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
  await prisma.$executeRawUnsafe('TRUNCATE TABLE `rbac_user_roles`');
  await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
  await seedRbac();
  await seedRbacExtras();

  await seedHrAttendance();
  await seedClub();
  await seedMosClub();
  await seedClubExtras();

  console.log(`\n=== done in ${((Date.now() - t0) / 1000).toFixed(1)}s ===`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
