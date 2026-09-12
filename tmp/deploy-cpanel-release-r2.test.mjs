import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const release = new URL('../release/FIT90-FULL-update-20260906-r2/', import.meta.url);
const script = new URL('deploy-cpanel.sh', release);
const rootHandoff = new URL('ROOT-PM2-COMMAND.txt', release);

test('the replacement release includes a non-root deployment script', () => {
  assert.equal(existsSync(script), true, 'deploy-cpanel.sh must be present');
  const body = readFileSync(script, 'utf8');
  assert.match(body, /\/opt\/cpanel\/ea-nodejs20\/bin/);
  assert.match(body, /npx prisma generate/);
  assert.doesNotMatch(body, /pm2\s+(?:restart|start|delete)/);
  assert.doesNotMatch(body, /prisma\s+db\s+(?:push|migrate)/);
});

test('the replacement release hands PM2 restart to root', () => {
  assert.equal(existsSync(rootHandoff), true, 'ROOT-PM2-COMMAND.txt must be present');
  assert.match(readFileSync(rootHandoff, 'utf8'), /pm2 restart fit90 --update-env/);
});
