'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createCanvas } = require('@napi-rs/canvas');

const { createFrameCanvas } = require('../engine/render/context.cjs');
const { loadStyle } = require('../engine/styles/loader.cjs');

const W = 1920;
const H = 1080;

/** A busy test picture so different crops look different. */
function testImage() {
  const c = createCanvas(2400, 1350);
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 2400, 1350);
  grad.addColorStop(0, '#203040');
  grad.addColorStop(1, '#e0a040');
  g.fillStyle = grad;
  g.fillRect(0, 0, 2400, 1350);
  for (let i = 0; i < 40; i += 1) {
    g.fillStyle = `hsl(${i * 37}, 70%, ${30 + (i % 5) * 10}%)`;
    g.fillRect((i * 173) % 2300, (i * 97) % 1250, 120 + (i % 7) * 30, 90 + (i % 3) * 40);
  }
  return c;
}

function frameOf(
  type,
  fields,
  t,
  { duration = 6, illustration = false, words = [], video = null } = {},
) {
  const { canvas, ctx } = createFrameCanvas(W, H, 'long');
  const style = loadStyle('base');
  const beat = { id: 'c01p01b0', type, fields, illustration };
  const env = {
    width: W,
    height: H,
    format: 'long',
    fps: 30,
    style,
    beat,
    duration,
    words,
    channel: { name: 'Test Channel', handle: '@test' },
  };
  const assets = { image: testImage(), videoFrame: video, logo: null };
  style.components[type](ctx, beat, t, assets, env);
  return { canvas, ctx };
}

function small(canvas) {
  const c = createCanvas(64, 36);
  c.getContext('2d').drawImage(canvas, 0, 0, 64, 36);
  return c.getContext('2d').getImageData(0, 0, 64, 36).data;
}

function mad(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i += 4) {
    sum += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
  }
  return sum / ((a.length / 4) * 3);
}

test('art-focus moves the camera visibly between the start and the end of the beat', () => {
  const fields = { imagePrompt: 'x', focus: [0.6, 0.1, 0.3, 0.3] };
  const start = small(frameOf('art-focus', fields, 0).canvas);
  const end = small(frameOf('art-focus', fields, 5.99).canvas);
  assert.ok(mad(start, end) > 8, `difference ${mad(start, end)}`);
});

test('art-tour lands on visibly different crops', () => {
  const fields = {
    imagePrompt: 'x',
    crops: [
      [0, 0, 0.4, 0.4],
      [0.6, 0, 0.4, 0.4],
      [0.3, 0.6, 0.4, 0.4],
    ],
  };
  const frames = [1.5, 4.5, 7.5].map((t) =>
    small(frameOf('art-tour', fields, t, { duration: 9 }).canvas),
  );
  assert.ok(mad(frames[0], frames[1]) > 8);
  assert.ok(mad(frames[1], frames[2]) > 8);
  assert.ok(mad(frames[0], frames[2]) > 8);
});

test('a quote without a date is refused', () => {
  assert.throws(
    () => frameOf('quote', { text: 'Words.', speaker: 'Someone', source: 'Paper' }, 1),
    /date required/,
  );
});

test('the endcard leaves YouTube end-screen element areas plain', () => {
  const { canvas } = frameOf('endcard', {}, 10, { duration: 20 });
  const ctx = canvas.getContext('2d');
  const variance = (x, y, w, h) => {
    const d = ctx.getImageData(x, y, w, h).data;
    let mean = 0;
    for (let i = 0; i < d.length; i += 4) mean += d[i];
    mean /= d.length / 4;
    let v = 0;
    for (let i = 0; i < d.length; i += 4) v += (d[i] - mean) ** 2;
    return v / (d.length / 4);
  };
  assert.ok(variance(1056, 132, 720, 405) < 2, 'top video box');
  assert.ok(variance(1056, 579, 720, 405) < 2, 'bottom video box');
  assert.ok(variance(432 - 127, 540 - 127, 254, 254) < 2, 'subscribe circle');
});

test('an illustration beat is labelled, and components never draw debug text', () => {
  const debug = /frame\s*\d|layout[_:]|shot\s*\d/i;
  const cases = [
    ['art-focus', { imagePrompt: 'x', focus: [0.2, 0.2, 0.5, 0.5] }, true],
    [
      'art-tour',
      {
        imagePrompt: 'x',
        crops: [
          [0, 0, 0.5, 0.5],
          [0.5, 0.5, 0.5, 0.5],
        ],
      },
      true,
    ],
    ['kinetic', { text: 'One word changed everything' }, false],
    [
      'quote',
      { text: 'A quoted line.', speaker: 'A speaker', source: 'A paper', date: '2026-05-21' },
      false,
    ],
    ['chapter', { number: 2, title: 'The response' }, false],
    ['endcard', {}, false],
  ];
  for (const [type, fields, illustration] of cases) {
    const { ctx } = frameOf(type, fields, 2, { illustration, duration: 6 });
    const texts = [...ctx.__textLog];
    for (const text of texts) assert.ok(!debug.test(text), `${type} drew "${text}"`);
    if (illustration)
      assert.ok(
        texts.some((t) => /illustration/i.test(t)),
        `${type} labelled`,
      );
    assert.deepEqual(ctx.__layoutIssues, [], type);
  }
});

test('a stock beat draws the video frame and its lower third', () => {
  const video = createCanvas(W, H);
  const v = video.getContext('2d');
  v.fillStyle = '#3366cc';
  v.fillRect(0, 0, W, H);
  const { canvas, ctx } = frameOf('stock', { query: 'city', lowerThird: 'New Delhi, 2026' }, 1, {
    video,
  });
  const px = canvas.getContext('2d').getImageData(960, 300, 1, 1).data;
  assert.ok(px[2] > px[0], 'blue video visible under the grade');
  assert.ok(ctx.__textLog.has('New Delhi, 2026'));
});
