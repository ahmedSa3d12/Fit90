import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const backendDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const rootDir = join(backendDir, '..');
const frontendDir = join(rootDir, 'frontend', 'src');
const catalogDir = join(backendDir, 'src', 'modules', 'rbac', 'catalog');

const menuSource = readFileSync(join(frontendDir, 'lib', 'mos-menu.ts'), 'utf8');
const snapshot = menuSource
  .replace(
    '/** MOS Club sidebar menu — order and structure from fit90.mosclubeg.com */',
    '/** Generated from frontend/src/lib/mos-menu.ts — run `npm run rbac:sync-menu` after menu changes. */',
  )
  .replaceAll('MosMenuItem', 'MosMenuSnapshotItem')
  .replaceAll('MOS_MENU', 'MOS_MENU_SNAPSHOT');

writeFileSync(join(catalogDir, 'mos-menu.snapshot.ts'), snapshot, 'utf8');

const ar = JSON.parse(readFileSync(join(frontendDir, 'locales', 'ar.json'), 'utf8'));
const en = JSON.parse(readFileSync(join(frontendDir, 'locales', 'en.json'), 'utf8'));
const labels = `/** Generated from frontend locale files (nav.mos). */

export const MOS_LABELS_AR: Record<string, string> = ${JSON.stringify(ar.nav.mos, null, 2)};

export const MOS_LABELS_EN: Record<string, string> = ${JSON.stringify(en.nav.mos, null, 2)};
`;

writeFileSync(join(catalogDir, 'mos-labels.ts'), labels, 'utf8');

console.log(`Synced ${snapshot.match(/path:/g)?.length ?? 0} menu routes and ${Object.keys(ar.nav.mos).length} Arabic labels.`);
