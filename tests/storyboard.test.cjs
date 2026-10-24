'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.STUDIO_STYLES_DIRS = path.join(__dirname, 'fixtures', 'styles');

const { createProject, openProject } = require('../engine/project.cjs');
const { storyboard } = require('../engine/render/storyboard.cjs');

function projectWith(beats) {
  const projectsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-board-'));
  const project = openProject(
    createProject('demo', { channel: 'en-placeholder', date: '2026-10-25', projectsDir }),
  );
  let frame = 0;
  const plan = {
    format: 'long',
    fps: 30,
    width: 1920,
    height: 1080,
    chapters: [{ id: 1, title: 'One', startFrame: 0, frames: 0 }],
    paragraphs: [],
    beats: beats.map((b) => {
      const beat = {
        chapter: 1,
        paragraph: null,
        startFrame: frame,
        frames: 90,
        style: 'fixture',
        fields: { text: 'Hello' },
        ...b,
      };
      frame += beat.frames;
      return beat;
    }),
  };
  plan.frames = frame;
  plan.chapters[0].frames = frame;
  fs.writeFileSync(project.path('beats.json'), JSON.stringify(plan));
  return project;
}

test('three beats give nine stills and one contact sheet', async () => {
  const project = projectWith([
    { id: 'c01p01b0', type: 'kinetic' },
    { id: 'c01p01b1', type: 'kinetic' },
    { id: 'c01p01b2', type: 'chapter' },
  ]);
  const out = await storyboard(project);
  const dir = project.path('outputs', 'storyboard');
  const stills = fs.readdirSync(dir).filter((f) => /^beat_.*_(entry|action|settled)\.jpg$/.test(f));
  assert.equal(stills.length, 9);
  assert.deepEqual(
    out.sheets.map((s) => path.basename(s)),
    ['contact_1.jpg'],
  );
});

test('a beat with text outside the safe area fails with its beat id', async () => {
  const project = projectWith([{ id: 'c01p02b3', type: 'list' }]);
  await assert.rejects(() => storyboard(project), /c01p02b3/);
});
