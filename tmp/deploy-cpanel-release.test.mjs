import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const deployScript = new URL('../release/FIT90-FULL-update-20260906/deploy-cpanel.sh', import.meta.url);
const rootCommand = new URL('../release/FIT90-FULL-update-20260906/ROOT-PM2-COMMAND.txt', import.meta.url);

test('the cPanel deployment script builds without database changes or PM2 access', () => {
  assert.equal(existsSync(deployScript), true, 'the cPanel deployment script must be included');
  const script = readFileSync(deployScript, 'utf8');
  assert.match(script, /\/opt\/cpanel\/ea-nodejs20\/bin/);
  assert.match(script, /npm run build/);
  assert.match(script, /npx prisma generate/);
  assert.doesNotMatch(script, /pm2\s+(?:restart|start|delete)/);
  assert.doesNotMatch(script, /prisma\s+db\s+(?:push|migrate)/);
  assert.doesNotMatch(script, /rm\s+-rf/);
});

test('the root handoff contains only the required PM2 restart and health check', () => {
  assert.equal(existsSync(rootCommand), true, 'the root PM2 handoff must be included');
  const command = readFileSync(rootCommand, 'utf8');
  assert.match(command, /pm2 restart fit90 --update-env/);
  assert.match(command, /127\.0\.0\.1:4444\/api\/auth\/me/);
});
