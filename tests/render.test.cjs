'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const FIXTURE_STYLES = path.join(__dirname, 'fixtures', 'styles');
process.env.STUDIO_STYLES_DIRS = FIXTURE_STYLES;

const { createFrameCanvas } = require('../engine/render/context.cjs');
const { drawText } = require('../engine/render/text.cjs');
const { openVideoSource } = require('../engine/render/video-source.cjs');
const { renderChapter } = require('../engine/render/chapter.cjs');
const { run, ffmpegPath, probe } = require('../engine/util/proc.cjs');
const { createProject, openProject } = require('../engine/project.cjs');

test('drawText shrinks text until it fits and reports no issue', () => {
  const { ctx } = createFrameCanvas(1920, 1080, 'long');
  const text = 'A headline that is far too wide for a narrow column at eighty pixels';
  const out = drawText(ctx, text, {
    x: 100,
    y: 200,
    width: 900,
    maxLines: 2,
    size: 80,
    minSize: 40,
  });
  assert.ok(out.size >= 40 && out.size < 80, `size ${out.size}`);
  assert.deepEqual(ctx.__layoutIssues, []);
  assert.ok(ctx.__textLog.has(text));
});

test('text below the safe area is reported', () => {
  const { ctx } = createFrameCanvas(1920, 1080, 'long');
  drawText(ctx, 'Too low', { x: 100, y: 1000, width: 600, size: 40 });
  assert.match(ctx.__layoutIssues.join('\n'), /outside safe/);
});

test('Devanagari text uses the Devanagari font automatically', () => {
  const { ctx } = createFrameCanvas(1920, 1080, 'long');
  drawText(ctx, 'कॉकरोच जनता पार्टी', { x: 100, y: 200, width: 1200, size: 60, font: 'SansBold' });
  assert.match(ctx.font, /Deva/);
});

test('a video source yields every frame of a 2 second clip', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-video-'));
  const clip = path.join(dir, 'clip.mp4');
  run(ffmpegPath(), [
    '-v',
    'error',
    '-y',
    '-f',
    'lavfi',
    '-i',
    'testsrc=size=640x360:rate=30:duration=2',
    '-pix_fmt',
    'yuv420p',
    clip,
  ]);
  const source = openVideoSource(clip, { w: 320, h: 180, inSec: 0, fps: 30 });
  let count = 0;
  for (let i = 0; i < 60; i += 1) {
    const frame = await source.frame(i);
    assert.equal(frame.width, 320);
    count += 1;
  }
  source.close();
  assert.equal(count, 60);
});

function chapterProject() {
  const projectsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-render-'));
  const project = openProject(
    createProject('demo', { channel: 'en-placeholder', date: '2026-10-25', projectsDir }),
  );
  const beats = {
    format: 'long',
    fps: 30,
    width: 1280,
    height: 720,
    frames: 45,
    chapters: [{ id: 1, title: 'One', startFrame: 0, frames: 45 }],
    paragraphs: [],
    beats: [
      {
        id: 'c01p01b0',
        chapter: 1,
        paragraph: null,
        type: 'art-focus',
        startFrame: 0,
        frames: 20,
        fields: { text: 'First' },
        style: 'fixture',
      },
      {
        id: 'c01p01b1',
        chapter: 1,
        paragraph: null,
        type: 'kinetic',
        startFrame: 20,
        frames: 25,
        fields: { text: 'Second' },
        style: 'fixture',
      },
    ],
  };
  fs.writeFileSync(project.path('beats.json'), JSON.stringify(beats));
  fs.mkdirSync(project.path('assets'), { recursive: true });
  fs.writeFileSync(
    project.path('assets', 'ledger.json'),
    JSON.stringify({ images: {}, stock: {} }),
  );
  return project;
}

test('a chapter renders to an MP4 with exactly the planned frames, then caches', async () => {
  const project = chapterProject();
  const first = await renderChapter(project, 1, { format: 'long', inProcess: true });
  assert.equal(first.cached, false);
  const file = project.path('work', 'render', 'long', 'chapter_01.mp4');
  const video = probe(file).streams.find((s) => s.codec_type === 'video');
  assert.equal(Number(video.nb_frames), 45);
  assert.equal(video.width, 1280);
  assert.equal(video.pix_fmt, 'yuv420p');
  const log = fs.readFileSync(project.path('work', 'render', 'long', 'textlog_01.jsonl'), 'utf8');
  assert.match(log, /"First"/);

  const mtime = fs.statSync(file).mtimeMs;
  const second = await renderChapter(project, 1, { format: 'long', inProcess: true });
  assert.equal(second.cached, true);
  assert.equal(fs.statSync(file).mtimeMs, mtime);
});

test('a render that fails part-way stops the encoder and leaves no partial file', async () => {
  const project = chapterProject();
  const plan = JSON.parse(fs.readFileSync(project.path('beats.json'), 'utf8'));
  plan.beats[1].type = 'stat'; // the fixture pack cannot draw this
  fs.writeFileSync(project.path('beats.json'), JSON.stringify(plan));
  await assert.rejects(
    () => renderChapter(project, 1, { format: 'long', inProcess: true }),
    /cannot draw beat type "stat"/,
  );
  const dir = project.path('work', 'render', 'long');
  assert.deepEqual(
    fs.readdirSync(dir).filter((f) => f.includes('partial')),
    [],
  );
});

test('renderAll renders chapters in child processes and joins them', async () => {
  const { renderAll } = require('../engine/render/render-all.cjs');
  const project = chapterProject();
  const out = await renderAll(project, { format: 'long' });
  const video = probe(out.file).streams.find((s) => s.codec_type === 'video');
  assert.equal(Number(video.nb_frames), 45);
});
