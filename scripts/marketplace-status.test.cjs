const { test } = require('node:test');
const assert = require('node:assert/strict');
const { marketplaceStatus } = require('./marketplace-status.cjs');
const manifest = { publisher: 'prestissimo', name: 'prompt-bank', version: '0.11.1' };
const response = (status, data) => ({ status, ok: status === 200, json: async () => data });
function requests(vscode, openvsx, version = manifest.version) {
  let index = 0;
  return async () => index++ === 0
    ? response(200, { results: [{ extensions: [{ publisher: { publisherName: manifest.publisher }, extensionName: manifest.name, versions: vscode ? [{ version }] : [] }] }] })
    : response(openvsx ? 200 : 404, { namespace: manifest.publisher, name: manifest.name, version: manifest.version });
}
for (const [vscode, openvsx] of [[false, false], [true, false], [false, true], [true, true]]) {
  test(`independent registry status: vscode=${vscode}, openvsx=${openvsx}`, async () => {
    assert.deepEqual(await marketplaceStatus(manifest, requests(vscode, openvsx)), {
      VSCODE_PUBLISHED: vscode, OPENVSX_PUBLISHED: openvsx, SHOULD_PUBLISH: !vscode || !openvsx,
    });
  });
}
test('a different registry version does not skip the requested release', async () => {
  assert.equal((await marketplaceStatus(manifest, requests(true, false, '0.8.0'))).VSCODE_PUBLISHED, false);
});
test('registry outages and malformed responses fail rather than masquerading as absence', async () => {
  await assert.rejects(marketplaceStatus(manifest, async () => response(503)), /HTTP 503/);
  await assert.rejects(marketplaceStatus(manifest, async () => response(200, {})), /Invalid Marketplace/);
  let index = 0;
  await assert.rejects(marketplaceStatus(manifest, async () => index++ === 0
    ? response(200, { results: [{ extensions: [] }] }) : response(503)), /HTTP 503/);
});
