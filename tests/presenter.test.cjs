'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const { createProject, openProject } = require('../engine/project.cjs');

function tempProject({ mode = 'voice', language = 'en' } = {}) {
  const projectsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-presenter-'));
  const channel = language === 'hi' ? 'hi-placeholder' : 'en-placeholder';
  const project = openProject(createProject('demo', { channel, date: '2026-11-08', projectsDir }));
  const brief = JSON.parse(fs.readFileSync(project.path('brief.json'), 'utf8'));
  fs.writeFileSync(
    project.path('brief.json'),
    JSON.stringify({ ...brief, presenter: { mode }, language }),
  );
  return project;
}

function writeScript(project, chapters) {
  fs.writeFileSync(project.path('script.json'), JSON.stringify({ chapters }));
}

function get(url) {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => resolve({ status: res.statusCode, body }));
      })
      .on('error', reject);
  });
}

const SCRIPT = [
  {
    id: 1,
    title: 'The remark',
    paragraphs: [
      {
        id: 'c01p01',
        text: 'On 15 May, Surya Kant spoke. [[CL01]] Nobody expected it. [[analysis]]',
      },
      { id: 'c01p02', text: 'The clip spread fast. [[CL02]]' },
    ],
  },
  { id: 2, title: 'The party', paragraphs: [{ id: 'c02p01', text: 'A party was born. [[CL03]]' }] },
];

test('the teleprompter shows each chapter in order, in real spelling, without tags', () => {
  const { teleprompterData } = require('../engine/presenter/teleprompter.cjs');
  const project = tempProject();
  writeScript(project, SCRIPT);
  fs.writeFileSync(
    project.path('pronunciations.json'),
    JSON.stringify({ 'Surya Kant': 'Soor-ya Kaant' }),
  );
  const data = teleprompterData(project);
  assert.deepEqual(
    data.chapters.map((c) => c.title),
    ['The remark', 'The party'],
  );
  assert.deepEqual(data.chapters[0].paragraphs, [
    'On 15 May, Surya Kant spoke. Nobody expected it.',
    'The clip spread fast.',
  ]);
  assert.equal(data.chapters[0].file, 'recordings/c01.<ext>');
  assert.equal(data.script, 'latin');
});

test('the review server serves the teleprompter page with its script embedded safely', async () => {
  require('../engine/review/register-pages.cjs');
  const { startServer } = require('../engine/review/server.cjs');
  const project = tempProject();
  writeScript(project, [
    {
      id: 1,
      title: 'X',
      paragraphs: [{ id: 'c01p01', text: 'A </script><b>trick</b>. [[CL01]]' }],
    },
  ]);
  const server = await startServer(project, { port: 0 });
  try {
    const page = await get(`${server.url}/teleprompter`);
    assert.equal(page.status, 200);
    assert.ok(!page.body.includes('</script><b>'), 'script text cannot break out of the page');
    assert.match(page.body, /\\u003c\/script>/);
    const index = await get(`${server.url}/`);
    assert.match(index.body, /href="\/teleprompter"/);
  } finally {
    await server.close();
  }
});

test('the teleprompter page script is valid JavaScript', () => {
  const vm = require('node:vm');
  const html = fs.readFileSync(
    path.join(__dirname, '..', 'engine', 'review', 'pages', 'teleprompter.html'),
    'utf8',
  );
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assert.ok(scripts.length >= 1);
  for (const code of scripts) new vm.Script(code.replace(/\/\*TELEPROMPTER_DATA\*\/\s*null/, '{}'));
});
