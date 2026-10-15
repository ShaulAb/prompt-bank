const fs = require('node:fs');

async function marketplaceStatus(manifest, request = fetch) {
  const { publisher, name, version } = manifest;
  if (![publisher, name, version].every(value => typeof value === 'string' && /^[a-zA-Z0-9_.-]+$/.test(value))) {
    throw new Error('Invalid extension identity');
  }
  const openvsx = await request(`https://open-vsx.org/api/${publisher}/${name}/${version}`, { signal: AbortSignal.timeout(30000) });
  let openvsxPublished = false;
  if (openvsx.ok) {
    const result = await openvsx.json();
    if (result.version !== version || result.namespace !== publisher || result.name !== name) throw new Error('Invalid Open VSX response');
    openvsxPublished = true;
  } else if (openvsx.status !== 404) {
    throw new Error(`Open VSX query failed: HTTP ${openvsx.status}`);
  }
  return { OPENVSX_PUBLISHED: openvsxPublished, SHOULD_PUBLISH: !openvsxPublished };
}

module.exports = { marketplaceStatus };
if (require.main === module) {
  marketplaceStatus(require('../package.json')).then(result => {
    const output = Object.entries(result).map(([key, value]) => `${key}=${value}`).join('\n') + '\n';
    console.log(output.trim());
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, output);
  }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
