const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { verifyReleaseSource } = require('./release-source.cjs');

test('publishing allows release maintenance but rejects source drift and missing tags', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-bank-source-'));
  const git = (...args) => execFileSync('git', args, { cwd: directory, stdio: 'pipe' });
  try {
    git('init');
    git('config', 'user.name', 'Release Test');
    git('config', 'user.email', 'release-test@example.invalid');
    fs.writeFileSync(path.join(directory, 'extension.ts'), 'original');
    git('add', '.');
    git('commit', '-m', 'release');
    git('tag', 'v0.11.1');
    verifyReleaseSource('0.11.1', directory);
    assert.throws(() => verifyReleaseSource('0.11.2', directory));
    assert.throws(() => verifyReleaseSource('--force', directory), /Invalid release version/);
    fs.mkdirSync(path.join(directory, '.github'));
    fs.writeFileSync(path.join(directory, '.github', 'workflow.yml'), 'maintenance');
    fs.writeFileSync(path.join(directory, 'README.md'), 'documentation');
    git('add', '.');
    git('commit', '-m', 'release maintenance');
    verifyReleaseSource('0.11.1', directory);
    for (const file of ['extension.ts', 'package.json', '.vscodeignore', 'package-lock.json']) {
      fs.writeFileSync(path.join(directory, file), 'changed');
      git('add', '.');
      git('commit', '-m', `change ${file}`);
      assert.throws(() => verifyReleaseSource('0.11.1', directory), /Source differs/);
      git('reset', '--hard', 'HEAD~1');
    }
  } finally {
    if (!directory.startsWith(path.join(os.tmpdir(), 'prompt-bank-source-'))) throw new Error('Unsafe fixture path');
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
