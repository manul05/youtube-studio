'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createCanvas } = require('@napi-rs/canvas');

const { createProject, openProject } = require('../engine/project.cjs');
const { writeImagePrompts } = require('../engine/assets/prompts.cjs');
const { checkImages } = require('../engine/assets/images-check.cjs');
const { searchStock, pickStock } = require('../engine/assets/stock.cjs');
const { ledgerIssues, recordImages } = require('../engine/assets/ledger.cjs');
const { run, ffmpegPath } = require('../engine/util/proc.cjs');

function picture(w, h, seed = 1, type = 'image/png') {
  const c = createCanvas(w, h);
  const g = c.getContext('2d');
  g.fillStyle = `hsl(${seed * 47}, 50%, 40%)`;
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 30; i += 1) {
    g.fillStyle = `hsl(${(i * 31 + seed * 90) % 360}, 70%, ${20 + ((i * seed) % 6) * 10}%)`;
    g.fillRect((i * 97 + seed * 13) % w, (i * 61 + seed * 7) % h, w / 8, h / 8);
  }
  return c.toBuffer(type);
}

function projectWithPlan(beats) {
  const projectsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-assets-'));
  const project = openProject(
    createProject('demo', { channel: 'en-placeholder', date: '2026-10-25', projectsDir }),
  );
  const brief = JSON.parse(fs.readFileSync(project.path('brief.json'), 'utf8'));
  brief.style = { main: 'editorial', accents: {} };
  fs.writeFileSync(project.path('brief.json'), JSON.stringify(brief));
  const plan = {
    format: 'long',
    fps: 30,
    width: 1920,
    height: 1080,
    frames: 0,
    chapters: [{ id: 1, startFrame: 0, frames: 0 }],
    paragraphs: [],
    beats: beats.map((b, i) => ({
      chapter: 1,
      paragraph: 'c01p01',
      startFrame: i * 150,
      frames: 150,
      style: 'editorial',
      ...b,
    })),
  };
  fs.writeFileSync(project.path('beats.json'), JSON.stringify(plan));
  return project;
}

const art = (id, fields = {}) => ({
  id,
  type: 'art-focus',
  fields: { imagePrompt: `prompt ${id}`, focus: [0.2, 0.2, 0.6, 0.6], ...fields },
});

test('image prompts carry the style suffix, the safety rule and target file names', () => {
  const project = projectWithPlan([art('c01p01b0')]);
  const prompts = writeImagePrompts(project);
  const first = prompts.find((p) => p.file === 'img_c01p01b0.png');
  assert.match(first.prompt, /prompt c01p01b0/);
  assert.match(first.prompt, /editorial newspaper illustration/);
  assert.match(first.prompt, /No real, identifiable people/);
  assert.equal(first.aspect, '16:9');
  assert.ok(prompts.some((p) => p.file === 'thumb_base_1.png'));
  assert.ok(fs.existsSync(project.path('assets', 'IMAGE_PROMPTS.md')));
  assert.ok(fs.statSync(project.path('assets', 'images')).isDirectory(), 'images folder ready for the agent');
});

test('image checks name each problem exactly', async () => {
  const project = projectWithPlan([
    art('b1'),
    art('b2'),
    art('b3'),
    art('b4'),
    art('b5'),
    art('b6'),
  ]);
  writeImagePrompts(project);
  const dir = project.path('assets', 'images');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'img_b1.png'), picture(1024, 1024));
  fs.writeFileSync(path.join(dir, 'img_b2.png'), picture(1600, 900, 2, 'image/jpeg'));
  fs.writeFileSync(path.join(dir, 'img_b3.png'), Buffer.from('GIF89a......'));
  fs.writeFileSync(path.join(dir, 'img_b5.png'), picture(1600, 900, 5));
  fs.writeFileSync(path.join(dir, 'img_b6.png'), picture(1600, 900, 5));
  const problems = await checkImages(project);
  const about = (file) =>
    problems
      .filter((p) => p.file === file)
      .map((p) => p.problem)
      .join(' | ');
  assert.match(about('img_b1.png'), /long edge 1024 < 1344/);
  assert.match(about('img_b1.png'), /aspect/);
  assert.equal(about('img_b2.png'), '', 'a JPEG saved as .png is accepted');
  assert.equal(
    fs.readFileSync(path.join(dir, 'img_b2.png')).subarray(1, 4).toString(),
    'PNG',
    'normalised to PNG',
  );
  assert.match(about('img_b3.png'), /format/);
  assert.match(about('img_b4.png'), /missing/);
  assert.match(about('img_b6.png') + about('img_b5.png'), /duplicate/);
});

test('a camera move that zooms past the image resolution is flagged', async () => {
  const project = projectWithPlan([art('z1', { focus: [0.4, 0.4, 0.2, 0.2] })]);
  writeImagePrompts(project);
  fs.mkdirSync(project.path('assets', 'images'), { recursive: true });
  fs.writeFileSync(project.path('assets', 'images', 'img_z1.png'), picture(1600, 900, 3));
  const problems = await checkImages(project);
  assert.match(problems.map((p) => p.problem).join('\n'), /zoom/);
});

function fakeApis(clip) {
  const calls = [];
  const fetch = async (url) => {
    calls.push(url);
    if (url.includes('api.pexels.com')) {
      return {
        ok: true,
        json: async () => ({
          videos: [1, 2].map((n) => ({
            url: `https://www.pexels.com/video/${n}`,
            user: { name: `Pexels creator ${n}` },
            video_files: [
              {
                link: `https://videos.pexels.com/video-files/${n}/small.mp4`,
                width: 1280,
                height: 720,
                file_type: 'video/mp4',
              },
              {
                link: `https://videos.pexels.com/video-files/${n}/hd.mp4`,
                width: 1920,
                height: 1080,
                file_type: 'video/mp4',
              },
            ],
          })),
        }),
      };
    }
    if (url.includes('pixabay.com/api')) {
      return {
        ok: true,
        json: async () => ({
          hits: [1, 2].map((n) => ({
            pageURL: `https://pixabay.com/videos/${n}`,
            user: `pixabay-user-${n}`,
            videos: {
              large: {
                url: `https://cdn.pixabay.com/video/${n}/large.mp4`,
                width: 1920,
                height: 1080,
              },
            },
          })),
        }),
      };
    }
    return {
      ok: true,
      headers: new Map([['content-type', 'video/mp4']]),
      arrayBuffer: async () => fs.readFileSync(clip),
    };
  };
  return { fetch, calls };
}

function testClip(seconds = 6) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-clip-'));
  const file = path.join(dir, 'clip.mp4');
  run(ffmpegPath(), [
    '-v',
    'error',
    '-y',
    '-f',
    'lavfi',
    '-i',
    `testsrc=size=640x360:rate=30:duration=${seconds}`,
    '-pix_fmt',
    'yuv420p',
    file,
  ]);
  return file;
}

test('stock search downloads four candidates and a contact sheet; picking records the licence', async () => {
  const project = projectWithPlan([{ id: 's1', type: 'stock', fields: { query: 'crowd' } }]);
  const apis = fakeApis(testClip());
  await searchStock(project, {
    fetch: apis.fetch,
    env: { PEXELS_API_KEY: 'p', PIXABAY_API_KEY: 'x' },
  });
  const dir = project.path('assets', 'stock', '_incoming', 's1');
  assert.equal(fs.readdirSync(dir).filter((f) => f.endsWith('.mp4')).length, 4);
  assert.ok(fs.existsSync(path.join(dir, 'candidates.jpg')));
  assert.ok(
    apis.calls.some((u) => u.includes('/hd.mp4')),
    'picks the smallest rendition ≥ 1920 wide',
  );

  pickStock(project, 's1', 1);
  const ledger = JSON.parse(fs.readFileSync(project.path('assets', 'ledger.json'), 'utf8'));
  assert.equal(ledger.stock.s1.licence, 'Pexels License');
  assert.ok(ledger.stock.s1.durationSec > 5);
});

test('downloads from hosts other than Pexels and Pixabay are refused', async () => {
  const project = projectWithPlan([{ id: 's1', type: 'stock', fields: { query: 'crowd' } }]);
  const evil = async (url) =>
    url.includes('api.pexels.com')
      ? {
          ok: true,
          json: async () => ({
            videos: [
              {
                url: 'x',
                user: { name: 'x' },
                video_files: [{ link: 'https://evil.example/a.mp4', width: 1920, height: 1080 }],
              },
            ],
          }),
        }
      : { ok: true, json: async () => ({ hits: [] }) };
  await searchStock(project, { fetch: evil, env: { PEXELS_API_KEY: 'p', PIXABAY_API_KEY: 'x' } });
  const dir = project.path('assets', 'stock', '_incoming', 's1');
  assert.equal(
    fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.mp4')).length : 0,
    0,
  );
});

test('the ledger flags unrecorded images, unpicked stock and clips shorter than their beat', () => {
  const project = projectWithPlan([
    art('a1'),
    { id: 's1', type: 'stock', fields: { query: 'x' }, frames: 300 },
  ]);
  writeImagePrompts(project);
  fs.mkdirSync(project.path('assets', 'images'), { recursive: true });
  fs.writeFileSync(project.path('assets', 'images', 'img_a1.png'), picture(1600, 900));
  let issues = ledgerIssues(project).join('\n');
  assert.match(issues, /a1.*origin/);
  assert.match(issues, /s1.*no stock clip/);
  recordImages(project, { origin: 'agent-generated:antigravity' });
  fs.writeFileSync(
    project.path('assets', 'ledger.json'),
    JSON.stringify({
      ...JSON.parse(fs.readFileSync(project.path('assets', 'ledger.json'), 'utf8')),
      stock: { s1: { file: 'assets/stock/s1.mp4', durationSec: 4, licence: 'Pexels License' } },
    }),
  );
  issues = ledgerIssues(project).join('\n');
  assert.doesNotMatch(issues, /a1/);
  assert.match(issues, /s1.*clip too short/);
});

test('images:check completes the assets step only when every image is present and recorded', async () => {
  const { main } = require('../tools/studio.cjs');
  const project = projectWithPlan([art('k1', { focus: [0.1, 0.1, 0.8, 0.8] })]);
  const quiet = console.log;
  console.log = () => {};
  try {
    assert.equal(await main(['images:prompts', project.dir]), 0);
    assert.equal(await main(['images:check', project.dir]), 1);
    fs.mkdirSync(project.path('assets', 'images'), { recursive: true });
    fs.writeFileSync(project.path('assets', 'images', 'img_k1.png'), picture(1600, 900, 8));
    for (let i = 1; i <= 3; i += 1) {
      fs.writeFileSync(
        project.path('assets', 'images', `thumb_base_${i}.png`),
        picture(1600, 900, 20 + i * 3),
      );
    }
    assert.equal(
      await main(['images:record', project.dir, '--origin=agent-generated:antigravity']),
      0,
    );
    assert.equal(await main(['images:check', project.dir]), 0);
  } finally {
    console.log = quiet;
  }
  assert.ok(fs.existsSync(project.path('work', 'stamps', 'assets.json')));
});
