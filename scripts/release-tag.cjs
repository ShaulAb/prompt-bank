const { execFileSync, spawnSync } = require('node:child_process');

function needsTag(version, head, taggedCommit) {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error('Invalid release version');
  }
  if (taggedCommit && taggedCommit !== head) {
    throw new Error(`Refusing to move v${version}: it points to a different commit`);
  }
  return !taggedCommit;
}

if (require.main === module) {
  const version = require('../package.json').version;
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const tag = spawnSync('git', ['rev-parse', '--verify', `refs/tags/v${version}^{commit}`], { encoding: 'utf8' });
  if (tag.status !== 0 && tag.status !== 128) throw new Error(tag.stderr || 'Cannot inspect release tag');
  if (needsTag(version, head, tag.status === 0 ? tag.stdout.trim() : null)) {
    execFileSync('git', ['tag', '-a', `v${version}`, '-m', `Release v${version}`]);
  }
}

module.exports = { needsTag };
