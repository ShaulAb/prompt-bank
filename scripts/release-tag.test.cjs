const { test } = require('node:test');
const assert = require('node:assert/strict');
const { needsTag } = require('./release-tag.cjs');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

test('partial release resumes the same version when its tag is absent', () => {
  assert.equal(needsTag('0.11.1', 'release-commit', null), true);
});
test('a completed tag push can be retried without moving the tag', () => {
  assert.equal(needsTag('0.11.1', 'release-commit', 'release-commit'), false);
});
test('an existing tag cannot be reused for different source', () => {
  assert.throws(() => needsTag('0.11.1', 'new-commit', 'old-commit'), /Refusing to move/);
});
test('invalid versions cannot become git arguments', () => {
  assert.throws(() => needsTag('--force', 'commit', null), /Invalid release version/);
});

test('resuming in a Git repository preserves the version and refuses to retag changed source', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-bank-release-'));
  const git = (...args) => execFileSync('git', args, { cwd: directory, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  try {
    git('init');
    git('config', 'user.name', 'Release Test');
    git('config', 'user.email', 'release-test@example.invalid');
    fs.mkdirSync(path.join(directory, 'scripts'));
    fs.copyFileSync(path.join(__dirname, 'release-tag.cjs'), path.join(directory, 'scripts/release-tag.cjs'));
    fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ version: '0.11.1' }));
    git('add', '.');
    git('commit', '-m', 'fixture');
    const original = git('rev-parse', 'HEAD');
    for (let attempt = 0; attempt < 2; attempt++) {
      execFileSync(process.execPath, ['scripts/release-tag.cjs'], { cwd: directory });
      assert.equal(git('rev-parse', 'v0.11.1^{commit}'), original);
      assert.equal(JSON.parse(fs.readFileSync(path.join(directory, 'package.json'))).version, '0.11.1');
      assert.equal(git('status', '--porcelain'), '');
    }
    fs.writeFileSync(path.join(directory, 'changed.txt'), 'different source');
    git('add', '.');
    git('commit', '-m', 'changed source');
    const retry = spawnSync(process.execPath, ['scripts/release-tag.cjs'], { cwd: directory, encoding: 'utf8' });
    assert.notEqual(retry.status, 0);
    assert.match(retry.stderr, /Refusing to move/);
    assert.equal(git('rev-parse', 'v0.11.1^{commit}'), original);
  } finally {
    if (!directory.startsWith(path.join(os.tmpdir(), 'prompt-bank-release-'))) throw new Error('Unsafe fixture path');
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
