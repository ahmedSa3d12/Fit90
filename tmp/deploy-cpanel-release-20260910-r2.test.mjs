import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const release = new URL('../release/FIT90-FULL-update-20260910-r2/', import.meta.url);
const cpanelScript = new URL('deploy-cpanel.sh', release);
const rootPrecheck = new URL('ROOT-PRECHECK-COMMAND.txt', release);
const rootHandoff = new URL('ROOT-PM2-COMMAND.txt', release);

test('the cPanel deploy script blocks an unwritable dist directory before building', () => {
  assert.equal(existsSync(cpanelScript), true, 'deploy-cpanel.sh must be present');
  const body = readFileSync(cpanelScript, 'utf8');
  assert.match(body, /-d "\$APP_DIR\/dist"/);
  assert.match(body, /-w "\$APP_DIR\/dist"/);
  assert.match(body, /dist\/src\/main\.js/);
  assert.doesNotMatch(body, /prisma\s+(?:db\s+(?:push|pull)|migrate\s+deploy)/);
});

test('the root precheck returns dist ownership to the cPanel account', () => {
  assert.equal(existsSync(rootPrecheck), true, 'ROOT-PRECHECK-COMMAND.txt must be present');
  assert.match(readFileSync(rootPrecheck, 'utf8'), /chown -R metacodecx:metacodecx "\$APP\/dist"/);
});

test('the root PM2 handoff starts the canonical compiled entry point', () => {
  assert.equal(existsSync(rootHandoff), true, 'ROOT-PM2-COMMAND.txt must be present');
  const body = readFileSync(rootHandoff, 'utf8');
  assert.match(body, /dist\/src\/main\.js/);
  assert.doesNotMatch(body, /dist\/main\.js/);
  assert.match(body, /pm2 delete fit90/);
  assert.match(body, /pm2 save/);
});
