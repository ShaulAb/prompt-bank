const { execFileSync } = require('node:child_process');

// These files are excluded from the VSIX or are release documentation.
// All other tracked changes require a new version and a new tested package.
function requiresNewPackage(file) {
  return !(file.startsWith('.github/') || file.startsWith('scripts/') || file.endsWith('.md'));
}

function verifyReleaseSource(version, cwd = process.cwd()) {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error('Invalid release version');
  }
  const tag = `refs/tags/v${version}`;
  execFileSync('git', ['rev-parse', '--verify', `${tag}^{commit}`], { cwd, stdio: 'pipe' });
  const changes = execFileSync('git', ['diff', '--name-only', '-z', tag, 'HEAD', '--'], {
    cwd, encoding: 'utf8',
  }).split('\0').filter(Boolean).filter(requiresNewPackage);
  if (changes.length) {
    throw new Error(`Source differs from v${version}; create and test a new release:\n${changes.join('\n')}`);
  }
}

module.exports = { requiresNewPackage, verifyReleaseSource };
if (require.main === module) verifyReleaseSource(require('../package.json').version);
