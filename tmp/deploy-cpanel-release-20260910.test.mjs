import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const release = new URL('../release/FIT90-FULL-update-20260910/', import.meta.url);
const cpanelScript = new URL('deploy-cpanel.sh', release);
const rootHandoff = new URL('ROOT-PM2-COMMAND.txt', release);

test('the cPanel deploy script requires the compiled PM2 entry point', () => {
  assert.equal(existsSync(cpanelScript), true, 'deploy-cpanel.sh must be present');
  const body = readFileSync(cpanelScript, 'utf8');
  assert.match(body, /-f "\$APP_DIR\/dist\/src\/main\.js"/);
  assert.doesNotMatch(body, /prisma\s+(?:db\s+(?:push|pull)|migrate\s+deploy)/);
  assert.doesNotMatch(body, /pm2\s+(?:restart|start|delete)/);
});

test('the root handoff starts FIT90 from dist/src/main.js', () => {
  assert.equal(existsSync(rootHandoff), true, 'ROOT-PM2-COMMAND.txt must be present');
  const body = readFileSync(rootHandoff, 'utf8');
  assert.match(body, /dist\/src\/main\.js/);
  assert.doesNotMatch(body, /dist\/main\.js/);
  assert.match(body, /pm2 delete fit90/);
  assert.match(body, /pm2 save/);
});
