const test = require('node:test');
const assert = require('node:assert/strict');

test('installer retries preserve existing credentials byte for byte', async () => {
  const { ensureInstallerCredentials } = await import('../scripts/installer-env.mjs');
  const existing = 'PORT=8080\nLIVEKIT_API_KEY=custom-key\nLIVEKIT_API_SECRET="keep-$-secret"\nVAULT_SECRET=keep-vault\nNEKO_PASSWORD=custom-user\nNEKO_ADMIN_PASSWORD=custom-admin\n';
  assert.equal(ensureInstallerCredentials(existing), existing);
});
test('fresh credentials are generated once and empty values are initialized', async () => {
  const { ensureInstallerCredentials } = await import('../scripts/installer-env.mjs');
  const result = ensureInstallerCredentials('PORT=8080\nVAULT_SECRET=""\n');
  assert.match(result, /LIVEKIT_API_SECRET=[a-f0-9]{48}/);
  assert.match(result, /VAULT_SECRET=[a-f0-9]{64}/);
  assert.equal(ensureInstallerCredentials(result), result);
  assert.equal(result.match(/^VAULT_SECRET=/gm).length, 1);
});
