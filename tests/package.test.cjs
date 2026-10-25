'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createCanvas } = require('@napi-rs/canvas');

const { createProject, openProject } = require('../engine/project.cjs');
const { composeThumbnails } = require('../engine/package/thumbnails.cjs');
const { thumbIssues, titleIssues } = require('../engine/package/thumbs-check.cjs');
const { writeDescription, chapterLines, disclosure } = require('../engine/package/description.cjs');

function packagedProject({ illustration = false } = {}) {
  const projectsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-package-'));
  const project = openProject(
    createProject('demo', { channel: 'en-placeholder', date: '2026-10-25', projectsDir }),
  );
  const brief = JSON.parse(fs.readFileSync(project.path('brief.json'), 'utf8'));
  Object.assign(brief, {
    topic: 'The cockroach party',
    hook: 'One word from a courtroom started a movement.',
    promise: 'What happened and why it matters',
    titles: [
      'How one word became a movement',
      'The cockroach party, explained',
      'Why India’s Gen Z laughed back',
    ],
    thumbTexts: ['ONE WORD', 'JOKE?', 'THEY LAUGHED'],
    style: { main: 'editorial', accents: {} },
  });
  fs.writeFileSync(project.path('brief.json'), JSON.stringify(brief));
  const plan = {
    format: 'long',
    fps: 30,
    width: 1920,
    height: 1080,
    frames: 450 * 30,
    chapters: [
      { id: 1, title: 'The remark', startFrame: 0, frames: 95 * 30 },
      { id: 2, title: 'The response', startFrame: 95 * 30, frames: 305 * 30 },
      { id: 3, title: 'What it means', startFrame: 400 * 30, frames: 50 * 30 },
    ],
    paragraphs: [],
    beats: [
      {
        id: 'c01p01b0',
        type: 'art-focus',
        illustration,
        fields: { imagePrompt: 'x', focus: [0, 0, 1, 1] },
        startFrame: 0,
        frames: 90,
        style: 'editorial',
      },
    ],
  };
  fs.writeFileSync(project.path('beats.json'), JSON.stringify(plan));
  fs.writeFileSync(
    project.path('research.json'),
    JSON.stringify({
      sources: [
        {
          id: 'S01',
          url: 'https://example.com/a',
          publisher: 'Example News',
          published: '2026-05-21',
          accessed: '2026-10-24',
          excerpt: 'x',
        },
      ],
      claims: [{ id: 'CL01', text: 'x', status: 'verified', sources: ['S01'] }],
    }),
  );
  fs.writeFileSync(
    project.path('script.json'),
    JSON.stringify({
      chapters: [{ id: 1, title: 'x', paragraphs: [{ id: 'c01p01', text: 'A fact. [[CL01]]' }] }],
    }),
  );
  fs.mkdirSync(project.path('assets', 'images'), { recursive: true });
  for (let i = 1; i <= 3; i += 1) {
    const c = createCanvas(1600, 900);
    const g = c.getContext('2d');
    g.fillStyle = ['#203040', '#e8e2d4', '#5a2a2a'][i - 1];
    g.fillRect(0, 0, 1600, 900);
    g.fillStyle = '#c84a2a';
    g.beginPath();
    g.arc(1150, 450, 300, 0, Math.PI * 2);
    g.fill();
    fs.writeFileSync(
      project.path('assets', 'images', `thumb_base_${i}.png`),
      c.toBuffer('image/png'),
    );
  }
  return project;
}

test('chapter lines use YouTube timestamps starting at 00:00', () => {
  const project = packagedProject();
  const lines = chapterLines(JSON.parse(fs.readFileSync(project.path('beats.json'), 'utf8'))).join(
    '\n',
  );
  assert.match(lines, /^00:00 The remark/m);
  assert.match(lines, /^01:35 The response/m);
  assert.match(lines, /^06:40 What it means/m);
});

test('the description lists chapters and sources and carries the AI note', () => {
  const project = packagedProject();
  writeDescription(project);
  const text = fs.readFileSync(project.path('outputs', 'package', 'description.txt'), 'utf8');
  assert.match(text, /00:00 The remark/);
  assert.match(text, /Example News, 2026-05-21: https:\/\/example\.com\/a/);
  assert.match(text, /AI-generated/);
  assert.ok(fs.existsSync(project.path('outputs', 'package', 'titles.txt')));
});

test('a title over 60 characters is flagged', () => {
  assert.match(titleIssues(['x'.repeat(61), 'Fine', 'Fine too']).join('\n'), /61/);
});

test('composed thumbnails pass their own small-size checks', async () => {
  const project = packagedProject();
  const thumbs = await composeThumbnails(project);
  assert.equal(thumbs.length, 3);
  for (const t of thumbs) {
    assert.deepEqual(await thumbIssues(t, 'How one word became a movement'), [], t.file);
  }
});

test('thumbnail checks catch too many words, low contrast and text equal to the title', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-thumb-'));
  const file = path.join(dir, 'grey.png');
  const c = createCanvas(1280, 720);
  const g = c.getContext('2d');
  g.fillStyle = '#777777';
  g.fillRect(0, 0, 1280, 720);
  fs.writeFileSync(file, c.toBuffer('image/png'));
  const meta = {
    file,
    text: 'ONE TWO THREE FOUR FIVE',
    color: '#7a7a7a',
    box: { x: 60, y: 200, w: 600, h: 300 },
    capHeight: 140,
  };
  const issues = (await thumbIssues(meta, 'One two three four five')).join('\n');
  assert.match(issues, /5 words/);
  assert.match(issues, /contrast/);
  assert.match(issues, /same as the title/);
});

test('the disclosure recommends the synthetic-content label for illustrated real events', () => {
  assert.match(disclosure(packagedProject({ illustration: true })), /^Yes/);
  assert.match(disclosure(packagedProject({ illustration: false })), /^Not required/);
});
