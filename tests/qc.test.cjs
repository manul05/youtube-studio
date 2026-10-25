'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createCanvas } = require('@napi-rs/canvas');

const { run, ffmpegPath } = require('../engine/util/proc.cjs');
const { staticIntervals } = require('../engine/qc/static-interval.cjs');
const { debugTextIssues } = require('../engine/qc/text-audit.cjs');
const { silenceIssues } = require('../engine/qc/silence.cjs');
const { demoImage } = require('../engine/styles/demo.cjs');
const { cropFor } = require('../engine/render/crop.cjs');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'studio-qc-'));

test(
  'a single cut at 3 s in a 10 s still clip leaves a 7 s static interval',
  { timeout: 120000 },
  () => {
    const file = path.join(tmp(), 'cut.mp4');
    run(ffmpegPath(), [
      '-v',
      'error',
      '-y',
      '-f',
      'lavfi',
      '-i',
      'color=c=0x203040:s=640x360:r=30:d=3',
      '-f',
      'lavfi',
      '-i',
      'color=c=0xe0b060:s=640x360:r=30:d=7',
      '-filter_complex',
      '[0:v][1:v]concat=n=2:v=1[v]',
      '-map',
      '[v]',
      '-pix_fmt',
      'yuv420p',
      file,
    ]);
    const out = staticIntervals(file, { threshold: 13 });
    assert.ok(Math.abs(out.longest - 7) <= 0.1, `longest ${out.longest}`);
    assert.ok(Math.abs(out.longestAt - 3) <= 0.1, `at ${out.longestAt}`);
  },
);

test('a slow 3% zoom over 6 s is not counted as a change', { timeout: 120000 }, async () => {
  const file = path.join(tmp(), 'zoom.mp4');
  const img = demoImage();
  const canvas = createCanvas(640, 360);
  const g = canvas.getContext('2d');
  const ff = spawn(
    ffmpegPath(),
    [
      '-v',
      'error',
      '-y',
      '-f',
      'rawvideo',
      '-pixel_format',
      'rgba',
      '-video_size',
      '640x360',
      '-framerate',
      '30',
      '-i',
      'pipe:0',
      '-pix_fmt',
      'yuv420p',
      file,
    ],
    { stdio: ['pipe', 'ignore', 'inherit'] },
  );
  const done = new Promise((r) => ff.on('close', r));
  const full = cropFor(img, [0, 0, 1, 1], 16 / 9);
  for (let f = 0; f < 180; f += 1) {
    const z = 1 - 0.03 * (f / 179);
    const w = full.w * z;
    const h = full.h * z;
    g.drawImage(img, full.x + (full.w - w) / 2, full.y + (full.h - h) / 2, w, h, 0, 0, 640, 360);
    if (!ff.stdin.write(canvas.data())) await new Promise((r) => ff.stdin.once('drain', r));
  }
  ff.stdin.end();
  await done;
  const out = staticIntervals(file, { threshold: 13 });
  assert.equal(out.events.length, 1, 'only the start counts');
});

test('debug strings in the text audit are hard failures; ordinary words are not', () => {
  const issues = debugTextIssues([
    { beat: 'c01p01b0', text: 'SHOT 42/60' },
    { beat: 'c01p01b1', text: 'Shot of the protest' },
    { beat: 'c01p01b2', text: 'LAYOUT_42_CURTAIN' },
    { beat: 'c01p01b3', text: 'undefined' },
  ]);
  assert.equal(issues.length, 3);
  assert.ok(issues.every((i) => /debug/i.test(i.message)));
});

test('a 2 s silent gap inside the narration is a hard failure', { timeout: 60000 }, () => {
  const file = path.join(tmp(), 'voice.wav');
  run(ffmpegPath(), [
    '-v',
    'error',
    '-y',
    '-f',
    'lavfi',
    '-i',
    'sine=f=200:d=3',
    '-f',
    'lavfi',
    '-i',
    'anullsrc=r=48000:cl=stereo:d=2',
    '-f',
    'lavfi',
    '-i',
    'sine=f=200:d=3',
    '-filter_complex',
    '[0:a]aformat=channel_layouts=stereo:sample_rates=48000[a];[2:a]aformat=channel_layouts=stereo:sample_rates=48000[c];[a][1:a][c]concat=n=3:v=0:a=1[o]',
    '-map',
    '[o]',
    file,
  ]);
  const issues = silenceIssues(file, { exempt: [] });
  assert.equal(issues.length, 1);
  assert.match(issues[0].message, /silence/i);
  assert.ok(Math.abs(issues[0].t - 3) < 0.2);
  assert.deepEqual(silenceIssues(file, { exempt: [[2.5, 5.5]] }), [], 'exempt windows are ignored');
});

test(
  'silence around an intended quiet window only counts what lies outside it',
  { timeout: 60000 },
  () => {
    const file = path.join(tmp(), 'card.wav');
    run(ffmpegPath(), [
      '-v',
      'error',
      '-y',
      '-f',
      'lavfi',
      '-i',
      'sine=f=200:d=3',
      '-f',
      'lavfi',
      '-i',
      'anullsrc=r=48000:cl=stereo:d=3.1',
      '-f',
      'lavfi',
      '-i',
      'sine=f=200:d=3',
      '-filter_complex',
      '[0:a]aformat=channel_layouts=stereo:sample_rates=48000[a];[2:a]aformat=channel_layouts=stereo:sample_rates=48000[c];[a][1:a][c]concat=n=3:v=0:a=1[o]',
      '-map',
      '[o]',
      file,
    ]);
    // A 2.5 s chapter card from 3.5 s to 6.0 s: 0.5 s and 0.1 s of silence fall outside it.
    assert.deepEqual(silenceIssues(file, { exempt: [[3.5, 6.0]] }), []);
    // A card that covers only a small part leaves 2 s of real silence.
    assert.equal(silenceIssues(file, { exempt: [[5.0, 6.0]] }).length, 1);
  },
);
