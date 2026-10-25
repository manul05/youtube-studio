'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const scripts = require('../package.json').scripts;

function files() {
  const out = [
    'AGENTS.md',
    'START_HERE.md',
    'docs/DESIGN.md',
    'docs/QUALITY_RUBRIC.md',
    'docs/STYLE_PACK_GUIDE.md',
  ];
  for (const dir of [
    'docs/steps',
    'prompts',
    '.agents/skills/youtube-studio',
    'library/music',
    'library/sfx',
    'library/maps',
  ]) {
    for (const f of fs.readdirSync(path.join(ROOT, dir)))
      if (/\.(md|txt)$/.test(f)) out.push(`${dir}/${f}`);
  }
  return out;
}

test('every npm command named in the guides exists', () => {
  const missing = [];
  for (const file of files()) {
    const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
    for (const m of text.matchAll(/npm(?:\.cmd)? run ([\w:-]+)/g)) {
      if (!scripts[m[1]]) missing.push(`${file}: npm run ${m[1]}`);
    }
  }
  assert.deepEqual(missing, []);
});

test('every step names a playbook that exists', () => {
  const { STEPS } = require('../engine/steps.cjs');
  for (const step of STEPS) assert.ok(fs.existsSync(path.join(ROOT, step.playbook)), step.playbook);
});

test('AGENTS.md stays short enough to read every time', () => {
  assert.ok(fs.readFileSync(path.join(ROOT, 'AGENTS.md'), 'utf8').split('\n').length <= 60);
});
