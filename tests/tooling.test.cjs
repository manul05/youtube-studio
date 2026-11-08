'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('a test run keeps its temporary files in one folder and deletes it at the end', () => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-tooling-'));
  const marker = path.join(work, 'tmpdir.txt');
  const probe = path.join(work, 'probe.test.cjs');
  fs.writeFileSync(
    probe,
    [
      "const fs = require('node:fs');",
      "const os = require('node:os');",
      "const path = require('node:path');",
      "require('node:test')('leaves a temp folder behind', () => {",
      "  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-leak-'));",
      "  fs.writeFileSync(path.join(dir, 'big.bin'), Buffer.alloc(1024));",
      '  fs.writeFileSync(process.env.STUDIO_MARKER, dir);',
      '});',
    ].join('\n'),
  );
  const runner = path.join(__dirname, '..', 'tools', 'run-tests.cjs');
  const result = spawnSync(process.execPath, [runner, probe.split(path.sep).join('/')], {
    env: { ...process.env, STUDIO_MARKER: marker },
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const leaked = fs.readFileSync(marker, 'utf8');
  assert.ok(!leaked.startsWith(path.join(os.tmpdir(), 'studio-leak-')), 'not in the shared Temp');
  assert.equal(fs.existsSync(leaked), false, `${leaked} was deleted`);
  fs.rmSync(work, { recursive: true, force: true });
});

test('a failing test run still deletes its temporary folder and reports the failure', () => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-tooling-'));
  const marker = path.join(work, 'tmpdir.txt');
  const probe = path.join(work, 'fail.test.cjs');
  fs.writeFileSync(
    probe,
    [
      "const fs = require('node:fs');",
      "const os = require('node:os');",
      "require('node:test')('fails', () => {",
      '  fs.writeFileSync(process.env.STUDIO_MARKER, os.tmpdir());',
      "  throw new Error('boom');",
      '});',
    ].join('\n'),
  );
  const runner = path.join(__dirname, '..', 'tools', 'run-tests.cjs');
  const result = spawnSync(process.execPath, [runner, probe.split(path.sep).join('/')], {
    env: { ...process.env, STUDIO_MARKER: marker },
    encoding: 'utf8',
  });
  assert.notEqual(result.status, 0);
  assert.equal(fs.existsSync(fs.readFileSync(marker, 'utf8')), false);
  fs.rmSync(work, { recursive: true, force: true });
});
