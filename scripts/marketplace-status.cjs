const fs = require('node:fs');

async function marketplaceStatus(manifest, request = fetch) {
  const { publisher, name, version } = manifest;
  if (![publisher, name, version].every(value => typeof value === 'string' && /^[a-zA-Z0-9_.-]+$/.test(value))) {
    throw new Error('Invalid extension identity');
  }
  const gallery = await request('https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json;api-version=3.0-preview.1' },
    body: JSON.stringify({ filters: [{ criteria: [{ filterType: 7, value: `${publisher}.${name}` }], pageNumber: 1, pageSize: 1 }], flags: 1 }),
    signal: AbortSignal.timeout(30000),
  });
  if (!gallery.ok) throw new Error(`Marketplace query failed: HTTP ${gallery.status}`);
  const data = await gallery.json();
  if (!Array.isArray(data.results?.[0]?.extensions)) throw new Error('Invalid Marketplace response');
  const extension = data.results[0].extensions.find(item =>
    `${item.publisher?.publisherName}.${item.extensionName}`.toLowerCase() === `${publisher}.${name}`.toLowerCase());
  if (extension && !Array.isArray(extension.versions)) throw new Error('Missing Marketplace versions');
  const vscodePublished = !!extension?.versions.some(item => item.version === version);

  const openvsx = await request(`https://open-vsx.org/api/${publisher}/${name}/${version}`, { signal: AbortSignal.timeout(30000) });
  let openvsxPublished = false;
  if (openvsx.ok) {
    const result = await openvsx.json();
    if (result.version !== version || result.namespace !== publisher || result.name !== name) throw new Error('Invalid Open VSX response');
    openvsxPublished = true;
  } else if (openvsx.status !== 404) {
    throw new Error(`Open VSX query failed: HTTP ${openvsx.status}`);
  }
  return { VSCODE_PUBLISHED: vscodePublished, OPENVSX_PUBLISHED: openvsxPublished,
    SHOULD_PUBLISH: !vscodePublished || !openvsxPublished };
}

module.exports = { marketplaceStatus };
if (require.main === module) {
  marketplaceStatus(require('../package.json')).then(result => {
    const output = Object.entries(result).map(([key, value]) => `${key}=${value}`).join('\n') + '\n';
    console.log(output.trim());
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, output);
  }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
