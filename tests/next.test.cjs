'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createProject, openProject } = require('../engine/project.cjs');
const { STEPS } = require('../engine/steps.cjs');
const { writeStamp, stepState, gateContentHash, nextAction } = require('../engine/next.cjs');

function tempProject() {
  const projectsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-projects-'));
  const dir = createProject('demo', {
    channel: 'en-placeholder',
    date: '2026-10-25',
    projectsDir,
  });
  return openProject(dir);
}

function writeFixture(project, pattern) {
  const rel = pattern.replace(/\/\*\*$/, '/fixture.bin').replace(/\*/g, 'fixture');
  const abs = project.path(rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  if (!fs.existsSync(abs)) fs.writeFileSync(abs, `fixture for ${pattern}\n`);
}

function approve(project, gateId, contentHash = gateContentHash(project, gateId)) {
  const file = project.path('approvals', `${gateId.replace(':', '_')}.json`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    JSON.stringify({ gate: gateId, decision: 'approve', contentHash, sig: 'test-signature' }),
  );
}

function completeThrough(project, lastId) {
  for (const entry of STEPS) {
    if (entry.kind === 'gate') {
      approve(project, entry.id);
    } else {
      for (const pattern of entry.outputs(project)) writeFixture(project, pattern);
      writeStamp(project, entry.id);
    }
    if (entry.id === lastId) return;
  }
}

test('a fresh project starts at the idea step', () => {
  const project = tempProject();
  assert.equal(nextAction(project).stepId, 'idea');
});

test('after the idea step is stamped the next action is the idea review stop', () => {
  const project = tempProject();
  writeStamp(project, 'idea');
  assert.equal(nextAction(project).stepId, 'gate:idea');
});

test('editing the script after the storyboard stop routes back to the script step', () => {
  const project = tempProject();
  completeThrough(project, 'gate:storyboard');
  assert.equal(nextAction(project).stepId, 'render');

  fs.appendFileSync(project.path('script.json'), '\n');

  const action = nextAction(project);
  assert.equal(action.stepId, 'script');
  assert.ok(action.reasons.some((r) => r.includes('script.json')));
  assert.equal(stepState(project, 'gate:storyboard'), 'stale');
});

test('an approval whose content hash does not match counts as not yet approved', () => {
  const project = tempProject();
  writeStamp(project, 'idea');
  approve(project, 'gate:idea', 'deadbeef');
  assert.equal(stepState(project, 'gate:idea'), 'todo');
  assert.equal(nextAction(project).stepId, 'gate:idea');
});

test('an approval without a signature counts as not yet approved', () => {
  const project = tempProject();
  writeStamp(project, 'idea');
  const file = project.path('approvals', 'gate_idea.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    JSON.stringify({
      gate: 'gate:idea',
      decision: 'approve',
      contentHash: gateContentHash(project, 'gate:idea'),
    }),
  );
  assert.equal(stepState(project, 'gate:idea'), 'todo');
});

test('every step names a command and a playbook', () => {
  for (const entry of STEPS) {
    assert.ok(entry.command, `${entry.id} has a command`);
    assert.match(entry.playbook, /^docs\/steps\/\d\d-[a-z-]+\.md$/, `${entry.id} playbook`);
  }
});

test('the next command prints the next action for a project path', async () => {
  const { main } = require('../tools/studio.cjs');
  const project = tempProject();
  const lines = [];
  const original = console.log;
  console.log = (line) => lines.push(String(line));
  try {
    assert.equal(await main(['next', project.dir]), 0);
  } finally {
    console.log = original;
  }
  const text = lines.join('\n');
  assert.match(text, /idea/);
  assert.match(text, /npm run brief:check -- /);
  assert.match(text, /docs\/steps\/01-idea\.md/);
});
