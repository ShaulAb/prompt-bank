const { test } = require('node:test');
const assert = require('node:assert/strict');
const { marketplaceStatus } = require('./marketplace-status.cjs');
const manifest = { publisher: 'prestissimo', name: 'prompt-bank', version: '0.11.1' };
const response = (status, data) => ({ status, ok: status === 200, json: async () => data });
test('query only Open VSX and publish when this version is absent', async () => {
  let calls = 0;
  const result = await marketplaceStatus(manifest, async url => {
    calls++;
    assert.equal(url, 'https://open-vsx.org/api/prestissimo/prompt-bank/0.11.1');
    return response(404);
  });
  assert.equal(calls, 1);
  assert.deepEqual(result, { OPENVSX_PUBLISHED: false, SHOULD_PUBLISH: true });
});
test('skip an existing exact version on retry', async () => {
  assert.deepEqual(await marketplaceStatus(manifest, async () => response(200, {
    namespace: manifest.publisher, name: manifest.name, version: manifest.version,
  })), { OPENVSX_PUBLISHED: true, SHOULD_PUBLISH: false });
});
test('registry outages and malformed responses fail rather than masquerading as absence', async () => {
  await assert.rejects(marketplaceStatus(manifest, async () => response(503)), /HTTP 503/);
  await assert.rejects(marketplaceStatus(manifest, async () => response(200, {})), /Invalid Open VSX/);
  await assert.rejects(marketplaceStatus(manifest, async () => response(200, {
    namespace: manifest.publisher, name: manifest.name, version: '0.8.0',
  })), /Invalid Open VSX/);
});
